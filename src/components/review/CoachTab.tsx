import React, { useMemo } from 'react';
import { HelpCircle, Sparkles, Play, RotateCcw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { analyzeMove, generateExplanation } from '../../services/intelligence';
import type { PositionEvaluation, MoveClassification } from '../../types';

interface CoachTabProps {
  currentPly: number;
  playedMoveSan?: string;
  fenBefore?: string;
  fenAfter?: string;
  evalBefore?: PositionEvaluation | null;
  evalAfter?: PositionEvaluation | null;
  onPreviewLine: (moves: string[]) => void;
  isReplayingVariation: boolean;
  onReturnToGame: () => void;
  onStartAnalysis: () => void;
  isAnalyzing?: boolean;
  onPreviewActualLine?: (moves: string[], fen: string) => void;
}

export const CoachTab: React.FC<CoachTabProps> = ({
  currentPly,
  playedMoveSan,
  fenBefore,
  fenAfter,
  evalBefore,
  evalAfter,
  onPreviewLine,
  isReplayingVariation,
  onReturnToGame,
  onStartAnalysis,
  isAnalyzing,
  onPreviewActualLine,
}) => {
  const bestMoveSan = evalBefore?.bestMoveSan || evalBefore?.pv?.[0];
  const sideToMove = fenBefore?.split(' ')[1] === 'b' ? 'black' : 'white';

  // Generate tactical findings and honest explanation unconditionally
  const findings = useMemo(() => {
    if (!fenBefore || !fenAfter || !playedMoveSan || !evalAfter) return [];
    return analyzeMove(
      fenBefore,
      fenAfter,
      playedMoveSan,
      evalBefore ?? null,
      evalAfter,
      currentPly - 1
    );
  }, [fenBefore, fenAfter, playedMoveSan, evalBefore, evalAfter, currentPly]);

  const explanation = useMemo(() => {
    if (!evalAfter || !playedMoveSan) return '';
    return generateExplanation(
      findings,
      playedMoveSan,
      bestMoveSan,
      evalBefore?.score ?? 0,
      evalAfter.score,
      sideToMove
    );
  }, [findings, playedMoveSan, bestMoveSan, evalBefore, evalAfter, sideToMove]);

  // If at start position (ply 0), no move played yet
  if (currentPly === 0 || !playedMoveSan) {
    return (
      <div className="coach-panel" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <HelpCircle size={32} style={{ color: 'var(--cl-text-muted)', margin: '0 auto 12px' }} />
        <h4 style={{ color: 'var(--cl-text-primary)', marginBottom: 8 }}>Select a Move</h4>
        <p style={{ color: 'var(--cl-text-muted)', fontSize: 'var(--cl-text-sm)', lineHeight: 1.5 }}>
          Navigate to any move in the game to see deterministic tactical explanations and compare candidate lines.
        </p>
      </div>
    );
  }

  // If position hasn't been analyzed yet
  if (!evalAfter) {
    return (
      <div className="coach-panel" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <Sparkles size={32} style={{ color: 'var(--cl-accent)', margin: '0 auto 12px' }} />
        <h4 style={{ color: 'var(--cl-text-primary)', marginBottom: 8 }}>Analysis Required</h4>
        <p style={{ color: 'var(--cl-text-muted)', fontSize: 'var(--cl-text-sm)', marginBottom: 20, lineHeight: 1.5 }}>
          Run the Stockfish 16 engine on this game to unlock tactical facts, blunders, and evidence-backed explanations.
        </p>
        <button className="btn btn-primary btn-sm" onClick={onStartAnalysis} disabled={isAnalyzing} style={{ margin: '0 auto' }}>
          Analyze with Stockfish
        </button>
      </div>
    );
  }

  const classification: MoveClassification = evalAfter.classification || 'acceptable';

  const getClassificationBadgeClass = (cls: MoveClassification) => {
    switch (cls) {
      case 'best':
      case 'strong':
        return 'badge-win';
      case 'inaccuracy':
        return 'badge-draw';
      case 'mistake':
      case 'blunder':
        return 'badge-loss';
      default:
        return '';
    }
  };

  // Best variation sequence for "Show me why"
  const refutationVariation = evalBefore?.pv || [];

  return (
    <div className="coach-panel">
      {isReplayingVariation && <p style={{ fontSize: 12, color: 'var(--cl-text-secondary)', marginBottom: 12 }}>Coach describes the selected game move. The board is previewing a continuation.</p>}
      {/* Classification Banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'var(--cl-bg-main)',
          borderRadius: 'var(--cl-radius-md)',
          marginBottom: 16,
          border: '1px solid var(--cl-border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {classification === 'best' || classification === 'strong' ? (
            <CheckCircle2 size={18} style={{ color: 'var(--cl-success)' }} />
          ) : (
            <AlertTriangle size={18} style={{ color: classification === 'blunder' ? 'var(--cl-error)' : 'var(--cl-warning)' }} />
          )}
          <div>
            <div style={{ fontSize: 'var(--cl-text-xs)', color: 'var(--cl-text-muted)' }}>Move Assessment</div>
            <div style={{ fontWeight: 700, color: 'var(--cl-text-primary)', textTransform: 'capitalize' }}>
              {classification}
            </div>
          </div>
        </div>
        <span className={`badge ${getClassificationBadgeClass(classification)}`} style={{ textTransform: 'uppercase' }}>
          {classification}
        </span>
      </div>

      {/* Explanation Box */}
      <div className="coach-explanation">
        <div className="coach-explanation-title">Engine Assessment</div>
        <p className="coach-explanation-text">{explanation}</p>
      </div>

      {/* Played vs Recommended Comparison */}
      <div className="coach-moves">
        {/* Played move */}
        <div className="coach-move-card">
          <div className="coach-move-label">Played in game</div>
          <div className="coach-move-san">{playedMoveSan}</div>
        </div>

        {/* Recommended move */}
        <div
          className="coach-move-card"
          style={{ borderColor: 'rgba(102, 182, 160, 0.4)' }}
          onClick={() => {
            if (refutationVariation.length > 0) {
              onPreviewLine(refutationVariation);
            }
          }}
          title={refutationVariation.length > 0 ? 'Click to preview recommended line' : undefined}
        >
          <div className="coach-move-label" style={{ color: 'var(--cl-accent)' }}>
            Recommended Best
          </div>
          <div className="coach-move-san" style={{ color: 'var(--cl-accent)' }}>
            {bestMoveSan || '—'}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="engine-section-title">After the played move</div>
        <button className="btn btn-secondary btn-sm" disabled={!evalAfter.pv.length}
          onClick={() => { if (fenAfter) onPreviewActualLine?.(evalAfter.pv, fenAfter); }}>
          Preview actual continuation
        </button>
        <p className="engine-line-pv">{evalAfter.pv.join(' ') || (evalAfter.terminal ? 'Game over' : 'No continuation available')}</p>
      </div>
      {/* Show Me Why / Return to Game Controls */}
      <div style={{ marginTop: 20 }}>
        {isReplayingVariation ? (
          <button
            className="btn btn-secondary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={onReturnToGame}
          >
            <RotateCcw size={14} />
            Return to Actual Game
          </button>
        ) : refutationVariation.length > 0 && bestMoveSan && bestMoveSan !== playedMoveSan ? (
          <button
            className="btn btn-primary"
            style={{ width: '100%', justifyContent: 'center' }}
            onClick={() => onPreviewLine(refutationVariation)}
          >
            <Play size={14} />
            Show Me Why (Replay Line)
          </button>
        ) : null}
      </div>

      {/* Evidence Variation Preview */}
      {refutationVariation.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 'var(--cl-text-xs)', color: 'var(--cl-text-muted)', marginBottom: 6 }}>
            Recommended Continuation:
          </div>
          <div
            style={{
              padding: '8px 12px',
              background: 'var(--cl-bg-input)',
              borderRadius: 'var(--cl-radius-sm)',
              fontFamily: 'var(--cl-font-mono)',
              fontSize: 'var(--cl-text-xs)',
              color: 'var(--cl-text-secondary)',
              lineHeight: 1.6,
            }}
          >
            {refutationVariation.slice(0, 8).join(' ')}
          </div>
        </div>
      )}
    </div>
  );
};
