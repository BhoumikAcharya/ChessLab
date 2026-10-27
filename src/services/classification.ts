import type { MoveClassification, PlayerColor, PositionEvaluation, AnalysisSummary, ClassificationCounts } from '../types';

// ChessLab estimates; thresholds are centipawns, not Chess.com classifications.
export function classifyMove(before: number, after: number, mover: PlayerColor, isBook: boolean, legalMoves: number): MoveClassification {
  if (legalMoves === 1) return 'forced';
  if (isBook) return 'book'; // Only callers with a verified opening source may use this.
  const loss = mover === 'white' ? before - after : after - before;
  return loss <= 10 ? 'best' : loss <= 30 ? 'strong' : loss <= 60 ? 'acceptable'
    : loss <= 120 ? 'inaccuracy' : loss <= 250 ? 'mistake' : 'blunder';
}

const emptyCounts = (): ClassificationCounts => ({ best: 0, strong: 0, acceptable: 0,
  inaccuracy: 0, mistake: 0, blunder: 0, book: 0, forced: 0 });

export function buildSummary(positions: PositionEvaluation[]): AnalysisSummary {
  const whiteClassifications = emptyCounts(), blackClassifications = emptyCounts();
  const losses = { white: [] as number[], black: [] as number[] };
  const criticalMoments: number[] = [];
  positions.forEach((p, i) => {
    if (!p.mover || !p.classification || p.centipawnLoss === undefined) throw new Error('Incomplete move assessment');
    (p.mover === 'white' ? whiteClassifications : blackClassifications)[p.classification]++;
    losses[p.mover].push(p.centipawnLoss);
    if (p.classification === 'mistake' || p.classification === 'blunder') criticalMoments.push(i + 1);
  });
  const average = (xs: number[]) => xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0;
  const white = average(losses.white), black = average(losses.black);
  return { totalMoves: positions.length, whiteClassifications, blackClassifications, criticalMoments,
    averageCentipawnLoss: { white, black },
    whiteAccuracy: losses.white.length ? Math.round(100 * Math.exp(-0.004 * white)) : undefined,
    blackAccuracy: losses.black.length ? Math.round(100 * Math.exp(-0.004 * black)) : undefined };
}
