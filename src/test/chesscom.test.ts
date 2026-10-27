import { afterEach, describe, expect, it, vi } from 'vitest';
import { importChesscomGames } from '../services/chesscom';
const archive = 'https://api.chess.com/pub/player/audit/games/2026/10';
const pgn = '[Result "1-0"]\n\n1. e4 e5 1-0';
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('public archive import', () => {
  it('fetches completed public games and passes the abort signal to every request', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ archives: [archive] })).mockResolvedValueOnce(new Response(pgn));
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    const result = await importChesscomGames('audit', undefined, controller.signal);
    expect(result.games).toHaveLength(1); expect(result.warnings).toEqual([]);
    expect(fetcher.mock.calls.every(([, options]) => options.signal === controller.signal)).toBe(true);
  });
  it('cancels an in-flight request without reporting completion', async () => {
    vi.stubGlobal('fetch', (_url: string, { signal }: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
    }));
    const controller = new AbortController(), progress = vi.fn();
    const run = importChesscomGames('audit', progress, controller.signal);
    const assertion = expect(run).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await assertion;
    expect(progress.mock.calls.at(-1)?.[0].status).toBe('cancelled');
    expect(progress.mock.calls.some(([p]) => p.status === 'complete')).toBe(false);
  });
  it('backs off on 429 and retries sequentially', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '1' } }))
      .mockResolvedValueOnce(json({ archives: [archive] })).mockResolvedValueOnce(new Response(pgn));
    vi.stubGlobal('fetch', fetcher);
    const run = importChesscomGames('audit');
    await vi.advanceTimersByTimeAsync(1000);
    expect((await run).games).toHaveLength(1); expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('reports failed monthly archives rather than silently returning success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(json({ archives: [archive] })).mockResolvedValueOnce(new Response('', { status: 500 })));
    await expect(importChesscomGames('audit')).rejects.toThrow('Archive import failed');
  });
  it('offers a PGN fallback when browser requests fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(importChesscomGames('audit')).rejects.toThrow('PGN file import');
  });
});
