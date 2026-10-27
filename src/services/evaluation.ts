import type { PositionEvaluation, EngineLine } from '../types';

export function formatEvaluation(ev?: Pick<PositionEvaluation, 'score' | 'isMate' | 'mateIn' | 'terminal'> | EngineLine): string {
  if (!ev) return '—';
  if ('terminal' in ev && ev.terminal === 'draw') return 'Draw';
  if ('terminal' in ev && ev.terminal === 'checkmate') return ev.score > 0 ? '1–0' : '0–1';
  if (ev.isMate && ev.mateIn !== undefined) return `${ev.score >= 0 ? '+' : '−'}M${Math.abs(ev.mateIn)}`;
  return `${ev.score > 0 ? '+' : ''}${(ev.score / 100).toFixed(1)}`;
}
