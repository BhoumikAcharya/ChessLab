import React from 'react';
import type { PositionEvaluation, EngineLine } from '../../types';
import { formatEvaluation } from '../../services/evaluation';
import { Cpu } from 'lucide-react';

interface LinesTabProps {
  currentEval?: PositionEvaluation | null;
  onPreviewLine: (moves: string[]) => void;
  onStartAnalysis: () => void;
  isExploring?: boolean;
  isAnalyzing?: boolean;
}

export const LinesTab: React.FC<LinesTabProps> = ({
  currentEval,
  onPreviewLine,
  onStartAnalysis,
  isExploring,
  isAnalyzing,
}) => {
  if (!currentEval) {
    return (
      <div className="engine-section" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <Cpu size={32} style={{ color: 'var(--cl-text-muted)', margin: '0 auto 12px' }} />
        <h4 style={{ color: 'var(--cl-text-primary)', marginBottom: 8 }}>No Engine Lines</h4>
        <p style={{ color: 'var(--cl-text-muted)', fontSize: 'var(--cl-text-sm)', marginBottom: 16 }}>
          {isExploring ? 'This branch has no cached evaluation. Return to Game to inspect the original review.' : 'Analyze the game to view candidate evaluations for this position.'}
        </p>
        {!isExploring && <button className="btn btn-primary btn-sm" disabled={isAnalyzing} onClick={onStartAnalysis} style={{ margin: '0 auto' }}>
          Analyze Game with Stockfish
        </button>}
      </div>
    );
  }

  // Construct lines array: line 1 is the primary PV if not in lines
  const lines: EngineLine[] =
    currentEval.lines && currentEval.lines.length > 0
      ? currentEval.lines
      : [
          {
            rank: 1,
            score: currentEval.score,
            isMate: currentEval.isMate,
            mateIn: currentEval.mateIn,
            moves: currentEval.pv || [],
            pv: currentEval.pv || [],
            sanMove: currentEval.bestMoveSan || currentEval.pv[0] || '',
            uciMove: currentEval.bestMove,
            depth: currentEval.depth,
          },
        ];

  if (currentEval.terminal) return <div className="engine-section">
    <p>{currentEval.terminal === 'checkmate' ? 'Checkmate' : 'Draw'} · {formatEvaluation(currentEval)}</p>
    <p>No legal continuation is available. Scores are from White’s perspective.</p>
  </div>;

  return (
    <div className="engine-section">
      <div className="engine-section-title">
        <span>Engine Candidates · White’s perspective</span>
        <span style={{ fontSize: 'var(--cl-text-xs)', color: 'var(--cl-text-muted)', textTransform: 'none' }}>
          Depth {currentEval.depth}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {lines.map((line) => {
          const isBest = line.rank === 1;
          const scoreStr = formatEvaluation(line);
          const isPositive = line.score >= 0;
          const variation = line.moves || line.pv || [];
          const moveLabel = line.sanMove || variation[0] || '';

          return (
            <button type="button"
              key={line.rank}
              className={`engine-line ${isBest ? 'best' : ''}`}
              onClick={() => onPreviewLine(variation)}
              title="Click to preview this variation on the board"
            >
              <div className="engine-line-rank">{line.rank}</div>

              <div className="engine-line-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                  <span className="engine-line-move">{moveLabel}</span>
                  {isBest && <span className="engine-line-label">(Best Move)</span>}
                </div>
                <div className="engine-line-pv">
                  {variation.length > 0 ? variation.join(' ') : '—'}
                </div>
              </div>

              <div
                className={`engine-line-score ${isPositive ? 'positive' : 'negative'}`}
                style={{
                  background: isPositive ? 'rgba(88, 166, 138, 0.15)' : 'rgba(215, 122, 122, 0.15)',
                  color: isPositive ? 'var(--cl-accent)' : 'var(--cl-error)',
                }}
              >
                {scoreStr}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
