import type { GameAnalysis, StoredGame, AppSettings } from '../types';
import { Chess } from 'chess.js';
import { buildSummary, classifyMove } from './classification';
import { reconstructGame, gameIdentity, replayVariation } from './gameState';

export const ANALYSIS_SCHEMA_VERSION = 2;
export const ENGINE_VERSION = 'Stockfish 16 WASM';

export function compatibleAnalysis(value: GameAnalysis, game: StoredGame): boolean {
  try {
    if (value.schemaVersion !== ANALYSIS_SCHEMA_VERSION || value.engineVersion !== ENGINE_VERSION ||
      value.gameId !== game.id || value.pgnIdentity !== gameIdentity(game.pgn) || !value.initialPosition ||
      !Number.isFinite(value.completedAt) || !Number.isInteger(value.analysisDepth) || value.analysisDepth < 1 ||
      !Number.isInteger(value.multiPv) || value.multiPv! < 1 || value.multiPv! > 5 || !value.summary) return false;
    const plies = reconstructGame(game.pgn);
    if (value.positions.length !== plies.length - 1) return false;
    const all = [value.initialPosition, ...value.positions];
    const valid = all.every((ev, i) => {
      if (ev.fen !== plies[i].fen || !Number.isFinite(ev.score) || !Number.isFinite(ev.depth) ||
        (!ev.terminal && (!ev.bestMove || ev.depth <= 0 || !ev.pv.length)) ||
        (ev.isMate && !Number.isFinite(ev.mateIn))) return false;
      const chess = new Chess(ev.fen);
      if (ev.sideToMove !== (chess.turn() === 'w' ? 'white' : 'black')) return false;
      if (ev.terminal === 'checkmate' && (!chess.isCheckmate() || ev.score !== (chess.turn() === 'w' ? -10000 : 10000))) return false;
      if (ev.terminal === 'draw' && (ev.score !== 0 || (!chess.isDraw() && plies[i].terminal !== 'draw'))) return false;
      if (ev.terminal && ev.pv.length) return false;
      replayVariation(ev.fen, ev.pv);
      if (!ev.terminal) {
        const m = chess.move({ from: ev.bestMove.slice(0, 2), to: ev.bestMove.slice(2, 4), promotion: ev.bestMove[4] });
        if (m.san !== ev.pv[0] || m.san !== ev.bestMoveSan) return false;
      }
      if (i > 0) {
        const before = all[i - 1];
        const mover = plies[i].side;
        const loss = Math.max(0, mover === 'white' ? before.score - ev.score : ev.score - before.score);
        if (ev.mover !== mover || ev.centipawnLoss !== loss || ev.classification !== classifyMove(before.score, ev.score, mover, false, new Chess(before.fen).moves().length)) return false;
      }
      ev.lines.forEach(line => { if (!Number.isFinite(line.score)) throw new Error('Invalid score'); replayVariation(ev.fen, line.moves); });
      return i === 0 || (!!ev.mover && !!ev.classification && Number.isFinite(ev.centipawnLoss));
    });
    return valid && JSON.stringify(value.summary) === JSON.stringify(buildSummary(value.positions));
  } catch { return false; }
}

export function validateSettings(value: unknown): AppSettings {
  const s = value as AppSettings;
  if (!s || !Number.isInteger(s.analysisDepth) || s.analysisDepth < 10 || s.analysisDepth > 24 ||
    !Number.isInteger(s.multiPv) || s.multiPv < 1 || s.multiPv > 5 ||
    typeof s.chesscomUsername !== 'string' || typeof s.boardFlipped !== 'boolean') throw new Error('Invalid analysis settings.');
  return s;
}
