import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Chess } from 'chess.js';
import { StockfishService, parseUciInfo, pvToSan, terminalEvaluation } from '../services/stockfish';
import { reconstructGame, replayVariation } from '../services/gameState';
import { compatibleAnalysis } from '../services/analysisCache';
import { parsePgn } from '../services/pgnParser';
import { formatEvaluation } from '../services/evaluation';

const workerFactory = vi.hoisted(() => vi.fn());
vi.mock('../workers/stockfishLoader', () => ({ createStockfishWorker: workerFactory }));

class TestWorker {
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  fen = new Chess().fen();
  commands: string[] = [];
  terminate = vi.fn();
  respond = true;
  invalidPv = false;
  empty = false;
  postMessage = (command: string) => {
    this.commands.push(command);
    if (command.startsWith('position fen ')) this.fen = command.slice(13);
    queueMicrotask(() => {
      if (!this.respond) return;
      if (command === 'uci') this.emit('uciok');
      if (command === 'isready') this.emit('readyok');
      if (command.startsWith('go ')) {
        const chess = new Chess(this.fen);
        const m = chess.moves({ verbose: true })[0];
        const uci = m.from + m.to + (m.promotion ?? '');
        if (!this.empty) this.emit(`info depth 4 multipv 1 score cp 120 pv ${this.invalidPv ? 'a1a8' : uci}`);
        this.emit(`bestmove ${uci}`);
      }
    });
  };
  emit(data: string) { this.onmessage?.({ data }); }
}
let worker: TestWorker;
beforeEach(() => { worker = new TestWorker(); workerFactory.mockReturnValue(worker); });
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });

const matePgn = '[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1';
const setupPgn = '[SetUp "1"]\n[FEN "7k/P7/6K1/8/8/8/8/8 w - - 0 42"]\n[Result "1-0"]\n\n42. a8=Q# 1-0';

describe('position reconstruction and legal variations', () => {
  it('preserves FEN promotion and fullmove numbering', () => {
    const plies = reconstructGame(setupPgn);
    expect(plies[0].fen).toContain('7k/P7/6K1');
    expect(plies[1]).toMatchObject({ san: 'a8=Q#', moveNumber: 42, side: 'white', terminal: 'checkmate' });
    expect(new Chess(plies[1].fen).get('a8')).toEqual({ type: 'q', color: 'w' });
  });
  it('preserves a Black-to-move setup and underpromotion', () => {
    const plies = reconstructGame('[SetUp "1"]\n[FEN "8/8/8/8/8/6k1/p7/7K b - - 0 42"]\n\n42... a1=N 1/2-1/2');
    expect(plies[1]).toMatchObject({ moveNumber: 42, side: 'black', san: 'a1=N', terminal: 'draw' });
  });
  it('reconstructs en passant and castling legally', () => {
    const ep = reconstructGame('1. e4 a6 2. e5 d5 3. exd6 1-0');
    const board = new Chess(ep.at(-1)!.fen);
    expect(board.get('d5')).toBeUndefined();
    expect(board.get('d6')).toEqual({ type: 'p', color: 'w' });
    const castle = reconstructGame('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O 1-0');
    expect(new Chess(castle.at(-1)!.fen).get('f1')?.type).toBe('r');
  });
  it('replays from the reference position and rejects an illegal full PV', () => {
    const plies = reconstructGame(matePgn);
    expect(replayVariation(plies[2].fen, ['Nc3', 'Nc6'])).toHaveLength(3);
    expect(() => replayVariation(plies[3].fen, ['Nc3'])).toThrow();
    expect(() => pvToSan(new Chess().fen(), ['e2e4', 'a1a8'])).toThrow();
  });
});

describe('UCI score normalization and terminal states', () => {
  const white = new Chess().fen();
  const chess = new Chess(); chess.move('e4'); const black = chess.fen();
  it('normalizes Black cp and mate scores while preserving White scores', () => {
    expect(parseUciInfo('info depth 18 score cp 125 pv e7e5', black)?.score).toBe(-125);
    expect(parseUciInfo('info depth 18 score cp 125 pv e2e4', white)?.score).toBe(125);
    expect(parseUciInfo('info depth 1 score mate 1 pv d8h4', black)).toMatchObject({ score: -9999, mateIn: -1, isMate: true });
    expect(parseUciInfo('info depth 1 score mate -2 pv e2e4', black)).toMatchObject({ score: 9998, mateIn: 2 });
    expect(parseUciInfo('info depth 0 score mate 0', white)).toMatchObject({ depth: 0, isMate: true });
  });
  it('does not use score bounds as exact evaluations', () => {
    expect(parseUciInfo('info depth 18 score cp 125 lowerbound pv e2e4', white)).toBeNull();
  });
  it('derives actual checkmate and stalemate from the board', () => {
    const terminal = terminalEvaluation(reconstructGame(matePgn).at(-1)!.fen)!;
    expect(terminal).toMatchObject({ score: -10000, terminal: 'checkmate', mateIn: 0, bestMove: '' });
    expect(formatEvaluation(terminal)).toBe('0–1');
    expect(terminalEvaluation('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).toMatchObject({ score: 0, terminal: 'draw' });
    expect(formatEvaluation(undefined)).toBe('—');
    expect(formatEvaluation({ score: -9999, isMate: true, mateIn: -1 })).toBe('−M1');
  });
});

describe('engine lifecycle and complete analysis integrity', () => {
  it('analyzes the initial position, retains genuine shallow scores, and does not invent book labels', async () => {
    const service = new StockfishService(); await service.init();
    const result = await service.analyzeGame('test', matePgn, 18, 3);
    expect(result.initialPosition?.fen).toBe(new Chess().fen());
    expect(result.positions[0]).toMatchObject({ score: -120, depth: 4, sideToMove: 'black', mover: 'white' });
    expect(result.positions.at(-1)).toMatchObject({ terminal: 'checkmate', score: -10000 });
    expect(result.positions.every(p => p.classification !== 'book')).toBe(true);
    expect(worker.commands.filter(c => c.startsWith('go '))).toHaveLength(4); // initial + 3 nonterminal positions
    service.terminate(); expect(worker.terminate).toHaveBeenCalled();
  });
  it('analyzes setup promotion from its true initial FEN', async () => {
    const service = new StockfishService(); await service.init();
    const result = await service.analyzeGame('setup', setupPgn, 10, 1);
    expect(result.initialPosition?.moveNumber).toBe(42);
    expect(result.positions[0]).toMatchObject({ terminal: 'checkmate', score: 10000, mover: 'white' });
    service.terminate();
  });
  it('rejects missing scores rather than completing with zeroes', async () => {
    const service = new StockfishService(); await service.init(); worker.empty = true;
    await expect(service.analyzeGame('test', matePgn)).rejects.toThrow('no usable evaluation');
    service.terminate();
  });
  it('rejects illegal PVs', async () => {
    const service = new StockfishService(); await service.init(); worker.invalidPv = true;
    await expect(service.analyzeGame('test', matePgn)).rejects.toThrow();
    service.terminate();
  });
  it('cancels a pending search immediately and never reports complete', async () => {
    const service = new StockfishService(); await service.init(); worker.respond = false;
    const progress = vi.fn();
    const run = service.analyzeGame('test', matePgn, 18, 3, progress);
    const rejection = expect(run).rejects.toMatchObject({ name: 'AbortError' });
    service.cancel(); await rejection;
    expect(progress.mock.calls.some(([p]) => p.status === 'complete')).toBe(false);
    expect(worker.terminate).toHaveBeenCalled();
  });
  it('cancels during initialization and permits a fresh service', async () => {
    const service = new StockfishService(); worker.respond = false;
    const init = service.init(); const rejection = expect(init).rejects.toMatchObject({ name: 'AbortError' });
    service.cancel(); await rejection;
    worker = new TestWorker(); workerFactory.mockReturnValue(worker);
    const next = new StockfishService(); await next.init(); expect(next.ready).toBe(true); next.terminate();
  });
  it('fails on worker errors and initialization timeout', async () => {
    vi.useFakeTimers(); worker.respond = false;
    const service = new StockfishService(); const promise = service.init();
    const failure = expect(promise).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(30000); await failure;
    expect(worker.terminate).toHaveBeenCalled();
    worker = new TestWorker(); workerFactory.mockReturnValue(worker); worker.respond = false;
    const other = new StockfishService(); const init = other.init(); const error = expect(init).rejects.toThrow('could not load');
    worker.onerror?.({ message: 'missing WASM' }); await error;
  });
  it('does not complete when cancellation arrives on the final terminal position', async () => {
    const service = new StockfishService(); await service.init();
    const statuses: string[] = [];
    await expect(service.analyzeGame('final-cancel', setupPgn, 10, 1, progress => {
      statuses.push(progress.status);
      if (progress.currentMove === 1 && progress.status === 'running') service.cancel();
    })).rejects.toMatchObject({ name: 'AbortError' });
    expect(statuses).not.toContain('complete');
  });
  it('rejects unfinished legacy games before starting any position search', async () => {
    const service = new StockfishService(); await service.init();
    await expect(service.analyzeGame('unfinished', '1. e4 *')).rejects.toThrow('Only completed');
    expect(worker.commands.some(c => c.startsWith('go '))).toBe(false);
    service.terminate();
  });
  it('invalidates legacy caches and caches with the wrong reference position', async () => {
    const game = parsePgn(matePgn).games[0];
    const service = new StockfishService(); await service.init();
    const result = await service.analyzeGame(game.id, matePgn);
    expect(compatibleAnalysis(result, game)).toBe(true);
    expect(compatibleAnalysis({ ...result, schemaVersion: undefined }, game)).toBe(false);
    expect(compatibleAnalysis({ ...result, pgnIdentity: 'wrong' }, game)).toBe(false);
    expect(compatibleAnalysis({ ...result, initialPosition: { ...result.initialPosition!, fen: result.positions[0].fen } }, game)).toBe(false);
    service.terminate();
  });
});
