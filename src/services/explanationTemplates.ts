import type { ChessFinding } from '../types';

export function generateExplanation(findings: ChessFinding[], playedMove: string, bestMove?: string,
  _evalBefore?: number, _evalAfter?: number, _sideToMove?: string): string {
  const priority = ['allowed_mate', 'missed_mate', 'neutral', 'material_gain'];
  const verified = findings.filter(f => f.confidence === 'verified').sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type));
  if (verified.length) return verified[0].explanation;
  if (bestMove && bestMove !== playedMove) return `The engine prefers ${bestMove}. Compare the two continuations to understand how the resulting positions differ.`;
  return bestMove ? 'This move matches the engine’s preferred move at the analyzed depth.'
    : 'There is not enough verified evidence to explain this move. Inspect the position and engine continuations.';
}
