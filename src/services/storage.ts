// ============================================================
// IndexedDB Storage Layer — Games, Analysis, and Settings
// ============================================================

import { openDB, type IDBPDatabase } from 'idb';
import { gameIdentity } from './gameState';
import { compatibleAnalysis, validateSettings } from './analysisCache';
import { parsePgn } from './pgnParser';
import { DEFAULT_SETTINGS } from '../types';
import type {
  StoredGame,
  GameAnalysis,
  GameId,
  AppSettings,
} from '../types';

const DB_NAME = 'chesslab';
const DB_VERSION = 1;

interface ChessLabDB {
  games: {
    key: GameId;
    value: StoredGame;
    indexes: {
      'by-date': string;
      'by-status': string;
      'by-imported': number;
    };
  };
  analysis: {
    key: string;
    value: GameAnalysis;
    indexes: {
      'by-game': GameId;
    };
  };
  settings: {
    key: string;
    value: unknown;
  };
}

let dbInstance: IDBPDatabase<ChessLabDB> | null = null;
let opening: Promise<IDBPDatabase<ChessLabDB>> | null = null;

async function getDb(): Promise<IDBPDatabase<ChessLabDB>> {
  if (dbInstance) return dbInstance;

  if (opening) return opening.catch(storageError);
  opening = openDB<ChessLabDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Games store
      if (!db.objectStoreNames.contains('games')) {
        const gamesStore = db.createObjectStore('games', { keyPath: 'id' });
        gamesStore.createIndex('by-date', 'metadata.date');
        gamesStore.createIndex('by-status', 'analysisStatus');
        gamesStore.createIndex('by-imported', 'metadata.importedAt');
      }

      // Analysis store
      if (!db.objectStoreNames.contains('analysis')) {
        const analysisStore = db.createObjectStore('analysis', { keyPath: 'id' });
        analysisStore.createIndex('by-game', 'gameId');
      }

      // Settings store
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings');
      }
    },
  });

  try { dbInstance = await opening; return dbInstance; }
  catch (error) { storageError(error); }
  finally { opening = null; }
}

const activeGames = new Set<GameId>();
const notify = () => window.dispatchEvent(new Event('chesslab-data-changed'));
function storageError(error: unknown): never {
  throw new Error(error instanceof DOMException && error.name === 'QuotaExceededError'
    ? 'Browser storage is full. Export a backup and remove old games before retrying.'
    : `Browser storage could not be updated. ${error instanceof Error ? error.message : 'Check browser permissions.'}`);
}

/** Abort partial writes and consume tx.done on request errors (including quota failures). */
async function transactionWork<T>(tx: { done: Promise<unknown>; abort(): void }, work: () => Promise<T>): Promise<T> {
  try { const result = await work(); await tx.done; return result; }
  catch (error) {
    try { tx.abort(); } catch { /* The browser may already have aborted it. */ }
    await tx.done.catch(() => {});
    storageError(error);
  }
}

// ============================================================
// Games CRUD
// ============================================================

export async function saveGame(game: StoredGame): Promise<void> {
  const db = await getDb();
  await db.put('games', game);
}

export async function saveGames(games: StoredGame[]): Promise<{ saved: number; duplicates: number }> {
  const db = await getDb();
  let saved = 0;
  let duplicates = 0;

  const tx = db.transaction('games', 'readwrite');
  await transactionWork(tx, async () => {
    const identities = new Set((await tx.store.getAll()).map(game => gameIdentity(game.pgn)));
    for (const game of games) {
      const identity = gameIdentity(game.pgn);
      if (identities.has(identity)) duplicates++;
      else { await tx.store.add(game); identities.add(identity); saved++; }
    }
  });
  notify();
  return { saved, duplicates };
}

export async function getGame(id: GameId): Promise<StoredGame | undefined> {
  const db = await getDb();
  const game = await db.get('games', id);
  if (!game) return undefined;
  const analysis = await getAnalysis(id);
  return { ...game, analysisStatus: activeGames.has(id) ? 'analyzing' : analysis ? 'analyzed' : game.analysisStatus === 'analyzing' ? 'interrupted' : game.analysisStatus === 'analyzed' ? 'not_analyzed' : game.analysisStatus };
}

export async function getAllGames(): Promise<StoredGame[]> {
  const db = await getDb();
  const stored = await db.getAll('games');
  const games = (await Promise.all(stored.map(game => getGame(game.id)))).filter((game): game is StoredGame => !!game);
  // Sort by importedAt descending (newest first)
  return games.sort((a, b) => b.metadata.importedAt - a.metadata.importedAt);
}

export async function deleteGame(id: GameId): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['games', 'analysis'], 'readwrite');
  await transactionWork(tx, async () => {
    await tx.objectStore('games').delete(id);
    const analyses = await tx.objectStore('analysis').index('by-game').getAllKeys(id);
    for (const key of analyses) await tx.objectStore('analysis').delete(key);
  });
  activeGames.delete(id);
  notify();
}

export async function updateGameStatus(
  id: GameId,
  status: StoredGame['analysisStatus'],
  analysisId?: string
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction('games', 'readwrite');
  const exists = await transactionWork(tx, async () => {
    const game = await tx.store.get(id);
    if (!game) return false;
    game.analysisStatus = status;
    if (analysisId) game.analysisId = analysisId;
    await tx.store.put(game);
    return true;
  });
  if (exists && status === 'analyzing') activeGames.add(id); else activeGames.delete(id);
  notify();
}

// ============================================================
// Analysis CRUD
// ============================================================

export async function saveAnalysis(analysis: GameAnalysis): Promise<void> {
  const db = await getDb();
  const game = await db.get('games', analysis.gameId);
  if (!game || !compatibleAnalysis(analysis, game)) throw new Error('Analysis does not match this game. Re-analyze it.');
  const tx = db.transaction(['games', 'analysis'], 'readwrite');
  await transactionWork(tx, async () => {
    const currentGame = await tx.objectStore('games').get(analysis.gameId);
    if (!currentGame || currentGame.pgn !== game.pgn) throw new Error('The game was deleted or changed before analysis could be saved.');
    await tx.objectStore('analysis').put(analysis);
    await tx.objectStore('games').put({ ...game, analysisStatus: 'analyzed', analysisId: analysis.id });
  });
  activeGames.delete(game.id);
  notify();
}

export async function getAnalysis(gameId: GameId): Promise<GameAnalysis | undefined> {
  const db = await getDb();
  const game = await db.get('games', gameId);
  if (!game) return undefined;
  const results = await db.getAllFromIndex('analysis', 'by-game', gameId);
  return results.filter(value => compatibleAnalysis(value, game)).sort((a, b) => b.completedAt - a.completedAt)[0];
}

export async function getLatestAnalyses(): Promise<GameAnalysis[]> {
  const db = await getDb();
  const games = await db.getAll('games');
  return (await Promise.all(games.map(game => getAnalysis(game.id)))).filter((a): a is GameAnalysis => !!a);
}

export async function getAnalysisById(id: string): Promise<GameAnalysis | undefined> {
  const db = await getDb();
  const value = await db.get('analysis', id);
  const game = value ? await db.get('games', value.gameId) : undefined;
  return value && game && compatibleAnalysis(value, game) ? value : undefined;
}

// ============================================================
// Settings
// ============================================================

export async function getSettings(): Promise<AppSettings> {
  const db = await getDb();
  const stored = await db.get('settings', 'app_settings');
  if (stored) return validateSettings(stored);
  return { ...DEFAULT_SETTINGS };
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await getDb();
  await db.put('settings', validateSettings(settings), 'app_settings').catch(storageError);
}

// ============================================================
// Export / Backup
// ============================================================

export interface BackupData {
  version: number;
  exportedAt: number;
  games: StoredGame[];
  analyses: GameAnalysis[];
  settings: AppSettings;
}

export async function exportBackup(): Promise<BackupData> {
  const db = await getDb();
  const tx = db.transaction(['games', 'analysis', 'settings'], 'readonly');
  const [games, analyses, settings] = await Promise.all([
    tx.objectStore('games').getAll(), tx.objectStore('analysis').getAll(),
    tx.objectStore('settings').get('app_settings'),
  ]);
  await tx.done;
  return { version: DB_VERSION, exportedAt: Date.now(), games, analyses,
    settings: settings ? validateSettings(settings) : { ...DEFAULT_SETTINGS } };
}

/** Validate before writing; restore missing data atomically and preserve existing preferences. */
export async function importBackup(data: BackupData): Promise<{ games: number; analyses: number; skipped: number; settingsRestored: boolean }> {
  if (!data || data.version !== DB_VERSION || !Array.isArray(data.games) || !Array.isArray(data.analyses)) {
    throw new Error('Invalid or unsupported ChessLab backup. Nothing was restored.');
  }
  const settings = data.settings ? validateSettings(data.settings) : undefined;
  const oldIds = new Set<string>();
  const parsedGames = data.games.map(game => {
    if (!game || typeof game.id !== 'string' || typeof game.pgn !== 'string' || oldIds.has(game.id)) throw new Error('Invalid or repeated game ID in backup. Nothing was restored.');
    oldIds.add(game.id);
    const parsed = parsePgn(game.pgn, 'pgn_file');
    if (parsed.games.length !== 1 || parsed.errors.length) throw new Error('Invalid PGN in backup. Nothing was restored.');
    const restored = parsed.games[0];
    const metadata = game.metadata;
    if (!metadata || !Number.isFinite(metadata.importedAt) || metadata.importedAt < 0 ||
      !['pgn_file', 'pgn_text', 'chesscom'].includes(metadata.source) ||
      (metadata.chesscomUrl !== undefined && typeof metadata.chesscomUrl !== 'string')) throw new Error('Invalid game metadata in backup. Nothing was restored.');
    restored.metadata.importedAt = metadata.importedAt;
    restored.metadata.source = metadata.source;
    restored.metadata.chesscomUrl = metadata.chesscomUrl;
    return { oldId: game.id, game: restored, identity: gameIdentity(restored.pgn) };
  });
  const db = await getDb();
  const tx = db.transaction(['games', 'analysis', 'settings'], 'readwrite');
  const result = await transactionWork(tx, async () => {
    const gameStore = tx.objectStore('games'), analysisStore = tx.objectStore('analysis');
    const existing = await gameStore.getAll();
    const byIdentity = new Map(existing.map(game => [gameIdentity(game.pgn), game]));
    const mappings = new Map<string, StoredGame>();
    let games = 0, analyses = 0, skipped = 0, settingsRestored = false;
    for (const item of parsedGames) {
      const game = byIdentity.get(item.identity) ?? item.game;
      if (!byIdentity.has(item.identity)) {
        await gameStore.add(game);
        byIdentity.set(item.identity, game);
        games++;
      }
      mappings.set(item.oldId, game);
    }
    // Keep only the latest compatible review per game from a backup.
    const candidates = new Map<string, GameAnalysis>();
    for (const value of data.analyses) {
      const game = value && mappings.get(value.gameId);
      const candidate = game ? { ...value, gameId: game.id } : undefined;
      if (!game || !candidate || !compatibleAnalysis(candidate, game)) { skipped++; continue; }
      const previous = candidates.get(game.id);
      if (previous) skipped++;
      if (!previous || candidate.completedAt > previous.completedAt) candidates.set(game.id, candidate);
    }
    for (const candidate of candidates.values()) {
      const game = await gameStore.get(candidate.gameId);
      if (!game) throw new Error('Missing restored game.');
      const reviews = await analysisStore.index('by-game').getAll(game.id);
      if (reviews.some(review => compatibleAnalysis(review, game))) { skipped++; continue; }
      const id = `restore_${game.id}_${crypto.randomUUID()}`;
      await analysisStore.add({ ...candidate, id });
      await gameStore.put({ ...game, analysisStatus: 'analyzed', analysisId: id });
      analyses++;
    }
    if (settings && !(await tx.objectStore('settings').get('app_settings'))) {
      await tx.objectStore('settings').put(settings, 'app_settings');
      settingsRestored = true;
    }
    return { games, analyses, skipped, settingsRestored };
  });
  notify();
  return result;
}

export async function clearAllData(): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(['games', 'analysis', 'settings'], 'readwrite');
  await transactionWork(tx, async () => {
    await tx.objectStore('games').clear();
    await tx.objectStore('analysis').clear();
    await tx.objectStore('settings').clear();
  });
  activeGames.clear();
  notify();
}

/**
 * Get count of games by analysis status.
 */
export async function getGameCounts(): Promise<{
  total: number;
  analyzed: number;
  notAnalyzed: number;
  analyzing: number;
}> {
  const games = await getAllGames();
  return {
    total: games.length,
    analyzed: games.filter(g => g.analysisStatus === 'analyzed').length,
    notAnalyzed: games.filter(g => g.analysisStatus === 'not_analyzed').length,
    analyzing: games.filter(g => g.analysisStatus === 'analyzing').length,
  };
}
