import { Chess } from 'chess.js';
import type { PositionEvaluation, GameAnalysis, GameId, AnalysisProgress } from '../types';
import { reconstructGame, gameIdentity } from './gameState';
import { classifyMove, buildSummary } from './classification';
import { createStockfishWorker } from '../workers/stockfishLoader';
export { classifyMove } from './classification';

import { ANALYSIS_SCHEMA_VERSION, ENGINE_VERSION } from './analysisCache';

export interface UciInfo {
  depth: number;
  score: number;
  isMate: boolean;
  mateIn?: number;
  pv: string[];
  multipv: number;
}

/** UCI scores are relative to the side to move. Normalize exactly once at this boundary. */
export function parseUciInfo(line: string, fen: string): UciInfo | null {
  const score = line.match(/\bscore (cp|mate) (-?\d+)\b/);
  const depth = line.match(/\bdepth (\d+)\b/);
  if (!line.startsWith('info ') || !score || !depth || /\b(lowerbound|upperbound)\b/.test(line)) return null;
  const sign = fen.split(' ')[1] === 'w' ? 1 : -1;
  const value = Number(score[2]);
  const isMate = score[1] === 'mate';
  return { depth: Number(depth[1]), isMate,
    score: sign * (isMate ? (value > 0 ? 1 : -1) * (10000 - Math.min(999, Math.abs(value))) : value),
    mateIn: isMate ? sign * value : undefined,
    multipv: Number(line.match(/\bmultipv (\d+)/)?.[1] ?? 1),
    pv: line.match(/\bpv (.+)$/)?.[1].trim().split(/\s+/) ?? [] };
}

export function pvToSan(fen: string, moves: string[]): string[] {
  const chess = new Chess(fen);
  return moves.map(uci => {
    if (!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)) throw new Error(`Invalid engine move: ${uci}`);
    return chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  });
}

export function terminalEvaluation(fen: string, knownDraw = false): PositionEvaluation | null {
  const chess = new Chess(fen);
  const mate = chess.isCheckmate();
  if (!mate && !knownDraw && !chess.isDraw()) return null;
  return { fen, depth: 0, score: mate ? (chess.turn() === 'w' ? -10000 : 10000) : 0,
    isMate: mate, mateIn: mate ? 0 : undefined, terminal: mate ? 'checkmate' : 'draw',
    bestMove: '', bestMoveSan: '', pv: [], lines: [], moveNumber: Number(fen.split(' ')[5]),
    sideToMove: chess.turn() === 'w' ? 'white' : 'black' };
}

export type AnalysisCallback = (progress: AnalysisProgress) => void;
export class StockfishService {
  private worker: Worker | null = null;
  private isReady = false;
  private cancelled = false;
  private busy = false;
  private handlers = new Set<(line: string) => void>();
  private pending = new Set<(error: Error) => void>();

  get ready(): boolean { return this.isReady; }

  private fail(error: Error): void {
    this.isReady = false;
    for (const reject of [...this.pending]) reject(error);
    this.worker?.terminate();
    this.worker = null;
  }

  private request<T>(consume: (line: string, done: (value: T) => void) => void,
    commands: string[], timeout = 60000): Promise<T> {
    if (this.cancelled) return Promise.reject(new DOMException('Analysis cancelled', 'AbortError'));
    if (!this.worker) return Promise.reject(new Error('Stockfish not initialized'));
    return new Promise<T>((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); this.handlers.delete(handler); this.pending.delete(abort); };
      const abort = (error: Error) => { cleanup(); reject(error); };
      const done = (value: T) => { cleanup(); resolve(value); };
      const handler = (line: string) => { try { consume(line, done); } catch (e) { abort(e instanceof Error ? e : new Error(String(e))); } };
      const timer = setTimeout(() => this.fail(new Error('Stockfish timed out. Retry with a lower depth.')), timeout);
      this.handlers.add(handler);
      this.pending.add(abort);
      try { commands.forEach(command => this.worker!.postMessage(command)); } catch (e) { abort(e as Error); }
    });
  }

  async init(): Promise<void> {
    if (this.isReady) return;
    if (this.cancelled) throw new DOMException('Analysis cancelled', 'AbortError');
    this.worker = createStockfishWorker();
    this.worker.onmessage = event => {
      const lines = String(event.data).split('\n');
      for (const line of lines) for (const handler of [...this.handlers]) handler(line.trim());
    };
    this.worker.onerror = event => this.fail(new Error(`Stockfish could not load: ${event.message || 'worker/WASM error'}`));
    this.worker.onmessageerror = () => this.fail(new Error('Stockfish communication failed.'));
    await this.request<void>((line, done) => { if (line === 'uciok') done(); }, ['uci'], 30000);
    await this.request<void>((line, done) => { if (line === 'readyok') done(); }, ['isready'], 30000);
    if (this.cancelled) throw new DOMException('Analysis cancelled', 'AbortError');
    this.isReady = true;
  }

  async analyzePosition(fen: string, depth = 18, multiPv = 3): Promise<{ lines: UciInfo[]; bestMove: string }> {
    if (!this.ready) throw new Error('Stockfish is not ready');
    if (this.busy) throw new Error('A position search is already running');
    this.busy = true;
    const lines = new Map<number, UciInfo>();
    try {
      return await this.request((line, done) => {
        const info = parseUciInfo(line, fen);
        if (info) lines.set(info.multipv, info);
        if (!line.startsWith('bestmove ')) return;
        const bestMove = line.split(/\s+/)[1];
        const best = lines.get(1);
        if (!best || !best.pv.length || !bestMove || bestMove === '(none)' || bestMove === '0000') {
          throw new Error('Stockfish returned no usable evaluation. Retry analysis.');
        }
        const completed = [...lines.values()].filter(candidate => candidate.depth === best.depth).sort((a, b) => a.multipv - b.multipv);
        // Validate the entire PV and ensure the bestmove belongs to this result.
        for (const candidate of completed) pvToSan(fen, candidate.pv);
        if (best.pv[0] !== bestMove) throw new Error('Stockfish best move and variation disagree.');
        done({ lines: completed, bestMove });
      }, [`setoption name MultiPV value ${multiPv}`, `position fen ${fen}`, `go depth ${depth}`]);
    } finally { this.busy = false; }
  }

  private async evaluate(fen: string, depth: number, multiPv: number, knownDraw = false): Promise<PositionEvaluation> {
    const terminal = terminalEvaluation(fen, knownDraw);
    if (terminal) return terminal;
    const result = await this.analyzePosition(fen, depth, multiPv);
    const lines = result.lines.map(info => {
      const moves = pvToSan(fen, info.pv);
      return { rank: info.multipv, score: info.score, isMate: info.isMate, mateIn: info.mateIn,
        moves, depth: info.depth, sanMove: moves[0], uciMove: info.pv[0] };
    });
    const best = lines[0];
    if (!best) throw new Error('Stockfish returned no evaluation');
    return { fen, depth: best.depth, score: best.score, isMate: best.isMate, mateIn: best.mateIn,
      bestMove: result.bestMove, bestMoveSan: best.moves[0], pv: best.moves, lines,
      moveNumber: Number(fen.split(' ')[5]), sideToMove: fen.split(' ')[1] === 'w' ? 'white' : 'black' };
  }

  async analyzeGame(gameId: GameId, pgn: string, depth = 18, multiPv = 3, onProgress?: AnalysisCallback): Promise<GameAnalysis> {
    if (!this.ready) throw new Error('Stockfish is not ready');
    const completed = new Chess();
    completed.loadPgn(pgn);
    if (!['1-0', '0-1', '1/2-1/2'].includes(completed.getHeaders().Result)) throw new Error('Only completed games can be analyzed. Import a PGN with a final result.');
    const plies = reconstructGame(pgn);
    if (plies.length < 2) throw new Error('The game has no moves to analyze.');
    const totalMoves = plies.length - 1;
    const checkCancelled = () => { if (this.cancelled) throw new DOMException('Analysis cancelled', 'AbortError'); };
    const progress = (completed: number) => onProgress?.({ gameId, currentMove: completed, totalMoves,
      percentage: Math.floor(100 * completed / (totalMoves + 1)), status: 'running' });
    checkCancelled();
    progress(0);
    const initialPosition = await this.evaluate(plies[0].fen, depth, multiPv);
    const positions: PositionEvaluation[] = [];
    for (const ply of plies.slice(1)) {
      checkCancelled();
      progress(positions.length + 1);
      const evaluated = await this.evaluate(ply.fen, depth, multiPv, ply.terminal === 'draw');
      checkCancelled();
      const before = positions.at(-1) ?? initialPosition;
      const loss = Math.max(0, ply.side === 'white' ? before.score - evaluated.score : evaluated.score - before.score);
      positions.push({ ...evaluated, playedMove: ply.san, mover: ply.side, centipawnLoss: loss,
        classification: classifyMove(before.score, evaluated.score, ply.side, false, new Chess(before.fen).moves().length) });
    }
    checkCancelled();
    const analysis: GameAnalysis = { id: `analysis_${gameId}_${Date.now()}`, gameId,
      schemaVersion: ANALYSIS_SCHEMA_VERSION, pgnIdentity: gameIdentity(pgn), multiPv, initialPosition,
      positions, engineVersion: ENGINE_VERSION, analysisDepth: depth, completedAt: Date.now(), summary: buildSummary(positions) };
    onProgress?.({ gameId, currentMove: totalMoves, totalMoves, percentage: 100, status: 'complete' });
    return analysis;
  }

  cancel(): void { this.cancelled = true; this.fail(new DOMException('Analysis cancelled', 'AbortError')); }
  terminate(): void { this.cancel(); }
  destroy(): void { this.cancel(); }
}
