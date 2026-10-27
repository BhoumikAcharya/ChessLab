import { parsePgn } from './pgnParser';
import type { StoredGame, ImportProgress } from '../types';

function aborted(signal?: AbortSignal): void { signal?.throwIfAborted(); }
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  aborted(signal);
  return new Promise((resolve, reject) => {
    const cancel = () => { clearTimeout(timer); reject(new DOMException('Import cancelled', 'AbortError')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve(); }, ms);
    signal?.addEventListener('abort', cancel, { once: true });
  });
}

async function fetchArchive(url: string, signal?: AbortSignal): Promise<Response> {
  for (let attempt = 0; attempt < 3; attempt++) {
    aborted(signal);
    const response = await fetch(url, { signal });
    if (response.status !== 429) {
      if (response.status === 404) throw new Error('Chess.com player or archive not found. Check the username, or import a PGN file.');
      if (!response.ok) throw new Error(`Chess.com returned ${response.status}. Retry or import a PGN file.`);
      return response;
    }
    if (attempt === 2) throw new Error('Chess.com rate limit reached. Wait and retry, or import a PGN file.');
    const retryAfter = response.headers.get('Retry-After');
    const seconds = Number(retryAfter);
    const wait = retryAfter && Number.isFinite(seconds) ? seconds * 1000 : retryAfter ? Date.parse(retryAfter) - Date.now() : 1000 * 2 ** attempt;
    await delay(Math.max(500, Math.min(60000, Number.isFinite(wait) ? wait : 2000)), signal);
  }
  throw new Error('Unable to fetch archive');
}

export async function importChesscomGames(username: string, onProgress?: (progress: ImportProgress) => void,
  signal?: AbortSignal, maxMonths = 12): Promise<{ games: StoredGame[]; warnings: string[] }> {
  if (!/^[a-zA-Z0-9_-]{1,50}$/.test(username)) throw new Error('Enter a valid Chess.com username.');
  const games: StoredGame[] = [], warnings: string[] = [];
  let totalMonths = 0, completedMonths = 0;
  const report = (status: ImportProgress['status'], error?: string) => onProgress?.({ username, totalMonths,
    completedMonths, gamesFound: games.length, gamesImported: 0, status, error });
  try {
    report('running');
    const response = await fetchArchive(`https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/archives`, signal);
    const data = await response.json();
    if (!Array.isArray(data.archives)) throw new Error('Chess.com returned an invalid archive list. Use PGN import.');
    const archives = (data.archives as string[]).slice().reverse().slice(0, maxMonths);
    totalMonths = archives.length;
    report('running');
    for (const archive of archives) {
      aborted(signal);
      try {
        // Only fetch public archive endpoints supplied by the expected API host.
        const url = new URL(archive);
        if (url.origin !== 'https://api.chess.com' || !/^\/pub\/player\/[^/]+\/games\/\d{4}\/\d{2}$/.test(url.pathname)) throw new Error('Unexpected archive URL.');
        const month = await fetchArchive(`${url.href}/pgn`, signal);
        const parsed = parsePgn(await month.text(), 'chesscom');
        games.push(...parsed.games);
        if (parsed.errors.length) warnings.push(`${archive}: ${parsed.errors.length} invalid or unfinished games skipped.`);
      } catch (error) {
        aborted(signal);
        warnings.push(`${archive}: ${error instanceof Error ? error.message : 'Archive failed.'}`);
      }
      completedMonths++;
      report('running');
      if (completedMonths < totalMonths) await delay(500, signal);
    }
    aborted(signal);
    if (!games.length && warnings.length) throw new Error(`Archive import failed. ${warnings[0]} Use PGN import if browser access is blocked.`);
    report('complete');
    return { games, warnings };
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === 'AbortError')) {
      report('cancelled');
      throw new DOMException('Import cancelled. No games from this request were saved.', 'AbortError');
    }
    const message = error instanceof Error ? error.message : 'Import failed';
    report('error', message);
    if (error instanceof TypeError) throw new Error('Unable to access Chess.com from this browser. Export your completed games from Chess.com and use PGN file import.');
    throw error;
  }
}
