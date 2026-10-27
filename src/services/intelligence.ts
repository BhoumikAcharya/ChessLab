import { Chess } from 'chess.js';
import type { ChessFinding, PositionEvaluation } from '../types';
import { replayVariation } from './gameState';
export { generateExplanation } from './explanationTemplates';

const pieceNames = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

function matingLine(fen: string, evaluation: PositionEvaluation | null): boolean {
  if (!evaluation?.isMate || !evaluation.pv.length || evaluation.fen !== fen) return false;
  try {
    const line = replayVariation(fen, evaluation.pv);
    return new Chess(line.at(-1)!).isCheckmate();
  } catch { return false; }
}

/** Concrete claims require matching reference positions and legally replayable evidence. */
export function analyzeMove(fenBefore: string, fenAfter: string, playedMove: string,
  evalBefore: PositionEvaluation | null, evalAfter: PositionEvaluation, moveIndex: number): ChessFinding[] {
  const before = new Chess(fenBefore);
  const move = before.move(playedMove);
  if (before.fen() !== new Chess(fenAfter).fen() || evalAfter.fen !== fenAfter ||
    (evalBefore && evalBefore.fen !== fenBefore)) return [];
  const mover = move.color === 'w' ? 'white' : 'black';
  const after = new Chess(fenAfter);
  const base = { confidence: 'verified' as const, moveIndex, affectedSquares: [] as string[], affectedPieces: [] as string[],
    evalBefore: evalBefore?.score ?? evalAfter.score, evalAfter: evalAfter.score,
    bestAlternative: evalBefore?.bestMoveSan, bestAlternativeVariation: evalBefore?.pv };
  const findings: ChessFinding[] = [];
  if (after.isCheckmate()) {
    findings.push({ ...base, type: 'neutral', explanation: `${playedMove} delivers checkmate.`, relevantVariation: [playedMove] });
    return findings;
  }
  if (evalBefore && matingLine(fenBefore, evalBefore) && !evalAfter.isMate &&
    (evalBefore.score > 0 ? 'white' : 'black') === mover) {
    findings.push({ ...base, type: 'missed_mate', explanation: `The engine found a forced mate with ${evalBefore.bestMoveSan}. Replay the verified mating line.`, relevantVariation: evalBefore.pv });
  }
  const losingAfter = evalAfter.score > 0 ? 'black' : 'white';
  const wasAlreadyLosing = evalBefore?.isMate && (evalBefore.score > 0 ? 'black' : 'white') === mover;
  if (losingAfter === mover && !wasAlreadyLosing && matingLine(fenAfter, evalAfter)) {
    findings.push({ ...base, type: 'allowed_mate', explanation: `This move allows a forced checkmate in ${Math.abs(evalAfter.mateIn ?? 0)} ${Math.abs(evalAfter.mateIn ?? 0) === 1 ? 'move' : 'moves'}. The engine continuation ends in checkmate.`, relevantVariation: evalAfter.pv });
  }
  // A capture is a board fact, not proof of winning net material or of move quality.
  if (move.captured) findings.push({ ...base, type: 'material_gain', affectedSquares: [move.from, move.to],
    affectedPieces: [pieceNames[move.piece], pieceNames[move.captured]], relevantVariation: [playedMove],
    explanation: `${pieceNames[move.piece][0].toUpperCase() + pieceNames[move.piece].slice(1)} captures a ${pieceNames[move.captured]} on ${move.to}. This alone does not establish a net material gain; compare the engine continuations.` });
  return findings;
}
