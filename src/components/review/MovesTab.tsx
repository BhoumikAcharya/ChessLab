import React from 'react';
import { Cpu, Loader2, StopCircle, RotateCcw, Star, Check, Minus, CircleHelp, TriangleAlert, CircleX, CornerDownRight } from 'lucide-react';
import type {
  GameAnalysis,
  MoveClassification,
  PositionEvaluation,
  AnalysisProgress,
} from '../../types';

interface MoveItem {
  ply: number;
  moveNumber: number;
  san: string;
  side: 'white' | 'black';
  evaluation?: PositionEvaluation;
}

interface MovesTabProps {
  moves: MoveItem[];
  currentPly: number;
  onSelectPly: (ply: number) => void;
  analysis?: GameAnalysis;
  isAnalyzing: boolean;
  analysisProgress: AnalysisProgress | null;
  onStartAnalysis: () => void;
  onCancelAnalysis: () => void;
}

const summaryCategories = [
  { key: 'best', label: 'Best', Icon: Star },
  { key: 'strong', label: 'Strong', Icon: Check },
  { key: 'acceptable', label: 'Acceptable', Icon: Minus },
  { key: 'inaccuracy', label: 'Inaccuracies', Icon: CircleHelp },
  { key: 'mistake', label: 'Mistakes', Icon: TriangleAlert },
  { key: 'blunder', label: 'Blunders', Icon: CircleX },
] as const;

export const MovesTab: React.FC<MovesTabProps> = ({
  moves,
  currentPly,
  onSelectPly,
  analysis,
  isAnalyzing,
  analysisProgress,
  onStartAnalysis,
  onCancelAnalysis,
}) => {
  // Group moves into pairs (White move + Black move for each moveNumber)
  const pairedMoves: { moveNumber: number; white?: MoveItem; black?: MoveItem }[] = [];
  moves.forEach((m) => {
    let pair = pairedMoves.find((p) => p.moveNumber === m.moveNumber);
    if (!pair) {
      pair = { moveNumber: m.moveNumber };
      pairedMoves.push(pair);
    }
    if (m.side === 'white') pair.white = m;
    else pair.black = m;
  });

  const getClassificationDot = (cls?: MoveClassification) => {
    if (!cls) return null;
    const colors: Record<MoveClassification, string> = {
      best: 'var(--cl-move-best)',
      strong: 'var(--cl-move-strong)',
      acceptable: 'var(--cl-move-acceptable)',
      inaccuracy: 'var(--cl-move-inaccuracy)',
      mistake: 'var(--cl-move-mistake)',
      blunder: 'var(--cl-move-blunder)',
      book: 'var(--cl-move-book)',
      forced: 'var(--cl-move-forced)',
    };
    return (
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          backgroundColor: colors[cls] || 'transparent',
          display: 'inline-block',
          marginLeft: 6,
        }}
        title={`Move classified as: ${cls}`}
      />
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Analysis action header */}
      <div
        style={{
          padding: 'var(--cl-space-3) var(--cl-space-4)',
          borderBottom: '1px solid var(--cl-border)',
          background: 'var(--cl-bg-input)',
        }}
      >
        {isAnalyzing ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--cl-text-xs)', color: 'var(--cl-accent)' }}>
                <Loader2 size={14} className="spin" />
                <span>
                  Analyzing move {analysisProgress?.currentMove || 0} of {analysisProgress?.totalMoves || moves.length}...
                </span>
              </div>
              <button
                className="btn btn-danger btn-sm"
                onClick={onCancelAnalysis}
                style={{ padding: '2px 8px', fontSize: '11px' }}
              >
                <StopCircle size={12} />
                Cancel
              </button>
            </div>
            <div style={{ height: 4, background: 'var(--cl-bg-elevated)', borderRadius: 2, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  background: 'var(--cl-accent)',
                  width: `${analysisProgress?.percentage || 0}%`,
                  transition: 'width 0.2s',
                }}
              />
            </div>
          </div>
        ) : analysis ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--cl-text-xs)', color: 'var(--cl-success)' }}>
              <span className="dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--cl-success)' }} />
              <span>
                Analysis budget: depth {analysis.analysisDepth || analysis.depth || 18}
                {analysis.summary.whiteAccuracy !== undefined && analysis.summary.blackAccuracy !== undefined
                  ? ` (estimated quality — White: ${analysis.summary.whiteAccuracy}%, Black: ${analysis.summary.blackAccuracy}%)`
                  : ''}
              </span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onStartAnalysis} title="Re-run analysis">
              <RotateCcw size={12} />
              Re-analyze
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 'var(--cl-text-xs)', color: 'var(--cl-text-muted)' }}>
              Game not yet analyzed with Stockfish.
            </span>
            <button className="btn btn-primary btn-sm" onClick={onStartAnalysis}>
              <Cpu size={14} />
              Analyze Game
            </button>
          </div>
        )}
      </div>

      {analysis && (
        <div className="move-quality-summary" role="group" aria-label="Move quality summary for both players">
          {summaryCategories.map(({ key, label, Icon }) => {
            const white = analysis.summary.whiteClassifications[key];
            const black = analysis.summary.blackClassifications[key];
            const total = white + black;
            return <span key={key} className={`move-quality-badge ${total === 0 ? 'is-empty' : ''}`}
              style={{ '--quality-color': `var(--cl-move-${key})` } as React.CSSProperties}
              tabIndex={0} role="img" aria-label={`${label}: ${total}. White ${white}, Black ${black}.`}>
              <Icon size={15} strokeWidth={1.9} aria-hidden="true" />
              <span className="move-quality-count" aria-hidden="true">{total}</span>
              <span className="move-quality-tooltip" aria-hidden="true">
                <strong>{label}</strong><span>White {white} · Black {black}</span>
              </span>
            </span>;
          })}
          {analysis.summary.whiteClassifications.forced + analysis.summary.blackClassifications.forced > 0 &&
            <span className="move-quality-forced" tabIndex={0} role="img"
              aria-label={`Forced moves: ${analysis.summary.whiteClassifications.forced + analysis.summary.blackClassifications.forced}. Only one legal move was available.`}
              title="Forced moves — only one legal move was available">
              <CornerDownRight size={13} aria-hidden="true" />
              {analysis.summary.whiteClassifications.forced + analysis.summary.blackClassifications.forced} forced
            </span>}
        </div>
      )}

      {analysis && <div className="critical-moments">
        <span>Turning points:</span>
        {analysis.summary.criticalMoments.length ? analysis.summary.criticalMoments.map(ply => <button
          key={ply} className="btn btn-secondary btn-sm" onClick={() => onSelectPly(ply)}>
          {moves.find(move => move.ply === ply)?.san ?? `Ply ${ply}`}
        </button>) : <span>No mistakes or blunders at this depth.</span>}
      </div>}
      {/* Moves Header */}
      <div className="move-list-header">
        <div>#</div>
        <div>White</div>
        <div>Black</div>
      </div>

      {/* Scrollable Move List */}
      <div className="analysis-panel-content">
        <div className="move-list">
          {pairedMoves.map((pair) => (
            <div className="move-row" key={pair.moveNumber}>
              <div className="move-number">{pair.moveNumber}.</div>

              {/* White Move */}
              <div
                className={`move-cell ${pair.white?.ply === currentPly ? 'active' : ''} ${
                  pair.white?.evaluation?.classification || ''
                }`}
                role="button" tabIndex={pair.white ? 0 : -1}
                onKeyDown={e => { if (pair.white && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelectPly(pair.white.ply); } }}
                onClick={() => pair.white && onSelectPly(pair.white.ply)}
              >
                {pair.white ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    {pair.white.san}
                    {getClassificationDot(pair.white.evaluation?.classification)}
                  </span>
                ) : (
                  '—'
                )}
              </div>

              {/* Black Move */}
              <div
                className={`move-cell ${pair.black?.ply === currentPly ? 'active' : ''} ${
                  pair.black?.evaluation?.classification || ''
                }`}
                role="button" tabIndex={pair.black ? 0 : -1}
                onKeyDown={e => { if (pair.black && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelectPly(pair.black.ply); } }}
                onClick={() => pair.black && onSelectPly(pair.black.ply)}
              >
                {pair.black ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center' }}>
                    {pair.black.san}
                    {getClassificationDot(pair.black.evaluation?.classification)}
                  </span>
                ) : (
                  ''
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
