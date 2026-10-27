import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { saveGames, getAllGames, getAnalysis, saveAnalysis, exportBackup, importBackup, clearAllData,
  getLatestAnalyses, saveSettings, getSettings, updateGameStatus, deleteGame } from '../services/storage';
import { parsePgn } from '../services/pgnParser';
import { gameIdentity, reconstructGame } from '../services/gameState';
import { buildSummary } from '../services/classification';
import { terminalEvaluation } from '../services/stockfish';
import type { GameAnalysis } from '../types';

const pgn = '[White "Promotion"]\n[Black "King"]\n[SetUp "1"]\n[FEN "7k/P7/6K1/8/8/8/8/8 w - - 0 42"]\n[Result "1-0"]\n\n42. a8=Q# 1-0';
function fixture() {
  const game = parsePgn(pgn).games[0];
  const plies = reconstructGame(pgn);
  const after = { ...terminalEvaluation(plies[1].fen)!, mover: 'white' as const, centipawnLoss: 0, classification: 'best' as const };
  const analysis: GameAnalysis = { id: 'test_analysis', gameId: game.id, schemaVersion: 2, engineVersion: 'Stockfish 16 WASM',
    pgnIdentity: gameIdentity(pgn), analysisDepth: 10, multiPv: 1, completedAt: 1,
    initialPosition: { fen: plies[0].fen, depth: 10, score: 9999, isMate: true, mateIn: 1,
      bestMove: 'a7a8q', bestMoveSan: 'a8=Q#', pv: ['a8=Q#'], lines: [], sideToMove: 'white', moveNumber: 42 },
    positions: [after], summary: buildSummary([after]) };
  return { game, analysis };
}
beforeEach(async () => { await clearAllData(); });

describe('IndexedDB persistence regressions', () => {
  it('keeps distinct same-day games and deduplicates identical moves across sources', async () => {
    const h = '[White "W"]\n[Black "B"]\n[Date "2026.10.28"]\n[Result "1-0"]\n\n';
    const a = parsePgn(h + '1. e4 e5 1-0').games[0];
    const b = parsePgn(h + '1. d4 d5 1-0').games[0];
    expect(await saveGames([a, b])).toEqual({ saved: 2, duplicates: 0 });
    const other = parsePgn(h + '1. e4 {comment} e5 1-0', 'chesscom').games[0];
    expect(await saveGames([other])).toEqual({ saved: 0, duplicates: 1 });
    expect(await getAllGames()).toHaveLength(2);
  });
  it('serializes concurrent duplicate imports without replacing existing games', async () => {
    const { game } = fixture();
    const results = await Promise.all([saveGames([game]), saveGames([game])]);
    expect(results.reduce((sum, r) => sum + r.saved, 0)).toBe(1);
    expect(await getAllGames()).toHaveLength(1);
  });
  it('stores a complete review atomically and counts the latest review once', async () => {
    const { game, analysis } = fixture(); await saveGames([game]);
    await saveAnalysis(analysis);
    await saveAnalysis({ ...analysis, id: 'second', completedAt: 2 });
    expect((await getAllGames())[0].analysisStatus).toBe('analyzed');
    expect((await getAnalysis(game.id))?.id).toBe('second');
    expect(await getLatestAnalyses()).toHaveLength(1);
  });
  it('rejects legacy, forged summary, and mismatched-position reviews', async () => {
    const { game, analysis } = fixture(); await saveGames([game]);
    await expect(saveAnalysis({ ...analysis, schemaVersion: undefined })).rejects.toThrow('does not match');
    await expect(saveAnalysis({ ...analysis, summary: { ...analysis.summary, whiteAccuracy: 2 } })).rejects.toThrow('does not match');
    expect(await getAnalysis(game.id)).toBeUndefined();
  });
  it('round-trips backup games and compatible reviews without overwriting preferences', async () => {
    const { game, analysis } = fixture(); await saveGames([game]); await saveAnalysis(analysis);
    const backup = await exportBackup();
    await clearAllData();
    const prefs = { analysisDepth: 12, multiPv: 2, boardFlipped: true, chesscomUsername: 'local' };
    await saveSettings(prefs);
    expect(await importBackup(backup)).toEqual({ games: 1, analyses: 1, skipped: 0, settingsRestored: false });
    expect((await getAnalysis(game.id))?.positions[0].terminal).toBe('checkmate');
    expect(await getSettings()).toEqual(prefs);
    expect(await importBackup(backup)).toEqual({ games: 0, analyses: 0, skipped: 1, settingsRestored: false });
    expect(await getAllGames()).toHaveLength(1);
  });
  it('rejects malformed backups before any writes and preserves existing data', async () => {
    const { game } = fixture(); await saveGames([game]);
    const backup = await exportBackup();
    await expect(importBackup({ ...backup, games: [...backup.games, { ...game, id: 'invalid-pgn-game', pgn: 'invalid' }] })).rejects.toThrow('Invalid PGN');
    expect(await getAllGames()).toHaveLength(1);
  });
  it('keeps valid imported games while skipping legacy reviews', async () => {
    const { game, analysis } = fixture();
    const result = await importBackup({ version: 1, exportedAt: 1, games: [game], analyses: [{ ...analysis, schemaVersion: undefined }], settings: await getSettings() });
    expect(result).toEqual({ games: 1, analyses: 0, skipped: 1, settingsRestored: true });
    expect((await getAllGames())[0].analysisStatus).toBe('not_analyzed');
  });
  it('rolls back partial imports on quota failure and shows an actionable message', async () => {
    const first = parsePgn('[White "A"]\n[Result "1-0"]\n\n1. e4 e5 1-0').games[0];
    const second = parsePgn('[White "B"]\n[Result "1-0"]\n\n1. d4 d5 1-0').games[0];
    const original = IDBObjectStore.prototype.add;
    let writes = 0;
    const spy = vi.spyOn(IDBObjectStore.prototype, 'add').mockImplementation(function(this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      if (++writes === 2) throw new DOMException('Full', 'QuotaExceededError');
      return original.call(this, value, key);
    });
    try { await expect(saveGames([first, second])).rejects.toThrow('Browser storage is full'); }
    finally { spy.mockRestore(); }
    expect(await getAllGames()).toHaveLength(0);
  });
  it('retains a cached review when reanalysis is interrupted', async () => {
    const { game, analysis } = fixture(); await saveGames([game]); await saveAnalysis(analysis);
    await updateGameStatus(game.id, 'analyzing');
    expect((await getAllGames())[0].analysisStatus).toBe('analyzing');
    await updateGameStatus(game.id, 'interrupted');
    expect((await getAllGames())[0].analysisStatus).toBe('analyzed');
  });
});


describe('backup fidelity and concurrent deletion', () => {
  it('restores saved preferences into an empty browser and preserves import metadata', async () => {
    const { game, analysis } = fixture();
    game.metadata.importedAt = 123456789;
    game.metadata.source = 'chesscom';
    game.metadata.chesscomUrl = 'https://www.chess.com/game/live/123';
    await saveGames([game]); await saveAnalysis(analysis);
    const settings = { analysisDepth: 14, multiPv: 2, boardFlipped: true, chesscomUsername: 'backup-player' };
    await saveSettings(settings);
    const backup = await exportBackup();
    await clearAllData();
    expect(await importBackup(backup)).toEqual({ games: 1, analyses: 1, skipped: 0, settingsRestored: true });
    expect(await getSettings()).toEqual(settings);
    expect((await getAllGames())[0].metadata).toMatchObject({ importedAt: 123456789, source: 'chesscom', chesscomUrl: game.metadata.chesscomUrl });
  });
  it('serializes concurrent restores without duplicate games or reviews', async () => {
    const { game, analysis } = fixture();
    const backup = { version: 1, exportedAt: 1, games: [game], analyses: [analysis], settings: await getSettings() };
    const result = await Promise.all([importBackup(backup), importBackup(backup)]);
    expect(result.reduce((sum, r) => sum + r.games, 0)).toBe(1);
    expect(result.reduce((sum, r) => sum + r.analyses, 0)).toBe(1);
    expect(await getAllGames()).toHaveLength(1);
  });
  it('rejects invalid metadata before writing games or preferences', async () => {
    const { game } = fixture();
    const broken = { ...game, metadata: { ...game.metadata, importedAt: NaN } };
    await expect(importBackup({ version: 1, exportedAt: 1, games: [game, { ...broken, id: 'broken' }], analyses: [], settings: await getSettings() })).rejects.toThrow('Invalid game metadata');
    expect(await getAllGames()).toHaveLength(0);
  });
  it('does not recreate a game deleted while a status update is in flight', async () => {
    const { game } = fixture(); await saveGames([game]);
    await Promise.all([updateGameStatus(game.id, 'analyzing'), deleteGame(game.id)]);
    expect(await getAllGames()).toHaveLength(0);
  });
  it('rejects an analysis save if its game was deleted during the initial read', async () => {
    const { game, analysis } = fixture(); await saveGames([game]);
    const saving = saveAnalysis(analysis);
    const assertion = expect(saving).rejects.toThrow('deleted or changed');
    await deleteGame(game.id); await assertion;
    expect(await getAllGames()).toHaveLength(0);
  });
  it('restores only the latest compatible review for each game', async () => {
    const { game, analysis } = fixture();
    const result = await importBackup({ version: 1, exportedAt: 1, games: [game],
      analyses: [analysis, { ...analysis, id: 'newer', completedAt: 2 }], settings: await getSettings() });
    expect(result.analyses).toBe(1); expect(result.skipped).toBe(1);
    expect((await getAnalysis(game.id))?.completedAt).toBe(2);
  });
});
