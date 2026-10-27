import React, { useEffect, useState } from 'react';
import { Chess } from 'chess.js';
import { Chessboard } from 'react-chessboard';
import {
  ChevronsLeft,
  ChevronLeft,
  Play,
  Pause,
  ChevronRight,
  ChevronsRight,
  ArrowUpDown,
} from 'lucide-react';
import { EvaluationBar } from './EvaluationBar';
import type { PlayerInfo, PositionEvaluation } from '../../types';

interface ChessboardSectionProps {
  fen: string;
  whitePlayer: PlayerInfo;
  blackPlayer: PlayerInfo;
  currentPly: number;
  totalPlies: number;
  orientation: 'white' | 'black';
  onFlipBoard: () => void;
  onFirst: () => void;
  onPrev: () => void;
  onNext: () => void;
  onLast: () => void;
  currentEval?: PositionEvaluation;
  lastMove?: string;
  onMovePiece?: (from: string, to: string, promotion?: string) => boolean;
}

export const ChessboardSection: React.FC<ChessboardSectionProps> = ({
  fen,
  whitePlayer,
  blackPlayer,
  currentPly,
  totalPlies,
  orientation,
  onFlipBoard,
  onFirst,
  onPrev,
  onNext,
  onLast,
  currentEval,
  lastMove,
  onMovePiece,
}) => {
  const [promotionMove, setPromotionMove] = useState<{ from: string; to: string; fen: string } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Auto-play timer
  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    if (isPlaying) {
      timer = setInterval(() => {
        if (currentPly < totalPlies) {
          onNext();
        } else {
          setIsPlaying(false);
        }
      }, 1200);
    }
    return () => clearInterval(timer);
  }, [isPlaying, currentPly, totalPlies, onNext]);

  // Compute best move arrow from currentEval if available
  const arrows: { startSquare: string; endSquare: string; color: string }[] = [];
  if (currentEval?.bestMove && currentEval.bestMove.length >= 4) {
    const from = currentEval.bestMove.substring(0, 2);
    const to = currentEval.bestMove.substring(2, 4);
    arrows.push({
      startSquare: from,
      endSquare: to,
      color: 'rgba(102, 182, 160, 0.85)',
    });
  }

  const topPlayer = orientation === 'white' ? blackPlayer : whitePlayer;
  const bottomPlayer = orientation === 'white' ? whitePlayer : blackPlayer;
  const topColorLabel = orientation === 'white' ? 'Black' : 'White';
  const bottomColorLabel = orientation === 'white' ? 'White' : 'Black';

  return (
    <div className="review-board-area" style={{ width: '100%', maxWidth: 580 }}>
      {/* Top Player Card */}
      <div className="review-player-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: topColorLabel === 'White' ? '#fff' : '#444',
              display: 'inline-block',
              border: '1px solid var(--cl-border)',
            }}
          />
          <span className="review-player-name">{topPlayer.name}</span>
          {topPlayer.rating && <span className="review-player-rating">({topPlayer.rating})</span>}
        </div>
        <span className="review-player-color">{topColorLabel}</span>
      </div>

      {/* Board + Eval Bar Container */}
      <div className="review-board-container" style={{ position: 'relative' }}>
        <EvaluationBar
          score={currentEval?.score}
          isMate={currentEval?.isMate}
          mateIn={currentEval?.mateIn}
          terminal={currentEval?.terminal}
          orientation={orientation}
        />

        <div style={{ flex: 1, borderRadius: 'var(--cl-radius-md)', overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
          <Chessboard
            options={{
              position: fen,
              boardOrientation: orientation,
              allowDragging: !!onMovePiece,
              onPieceDrop: ({ sourceSquare, targetSquare }) => {
                if (!targetSquare || !onMovePiece) return false;
                const chess = new Chess(fen);
                const pawn = chess.get(sourceSquare as Parameters<typeof chess.get>[0]);
                if (pawn?.type === 'p' && /[18]$/.test(targetSquare)) {
                  const legal = chess.moves({ verbose: true }).some(m => m.from === sourceSquare && m.to === targetSquare);
                  if (legal) setPromotionMove({ from: sourceSquare, to: targetSquare, fen });
                  return false;
                }
                return onMovePiece(sourceSquare, targetSquare);
              },
              squareStyles: lastMove ? Object.fromEntries([lastMove.slice(0, 2), lastMove.slice(2, 4)].map(square =>
                [square, { backgroundColor: 'rgba(102, 182, 160, 0.32)' }])) : {},
              arrows,
              darkSquareStyle: { backgroundColor: '#2C353F' },
              lightSquareStyle: { backgroundColor: '#404B57' },
              boardStyle: { borderRadius: '6px' },
            }}
          />
        </div>
      </div>

      {promotionMove && promotionMove.fen === fen && <div role="group" aria-label="Choose promotion piece" className="promotion-picker">
        <span>Promote to:</span>
        {(['q', 'r', 'b', 'n'] as const).map((piece, i) => <button className="btn btn-secondary btn-sm" key={piece}
          onClick={() => { onMovePiece?.(promotionMove.from, promotionMove.to, piece); setPromotionMove(null); }}>
          {['Queen', 'Rook', 'Bishop', 'Knight'][i]}</button>)}
        <button className="btn btn-ghost btn-sm" onClick={() => setPromotionMove(null)}>Cancel</button>
      </div>}
      {/* Bottom Player Card */}
      <div className="review-player-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: bottomColorLabel === 'White' ? '#fff' : '#444',
              display: 'inline-block',
              border: '1px solid var(--cl-border)',
            }}
          />
          <span className="review-player-name">{bottomPlayer.name}</span>
          {bottomPlayer.rating && <span className="review-player-rating">({bottomPlayer.rating})</span>}
        </div>
        <span className="review-player-color">{bottomColorLabel}</span>
      </div>

      {/* Navigation Controls */}
      <div className="review-controls">
        <button onClick={onFirst} disabled={currentPly === 0} title="First Move (Up Arrow)">
          <ChevronsLeft size={18} />
        </button>
        <button onClick={onPrev} disabled={currentPly === 0} title="Previous Move (Left Arrow)">
          <ChevronLeft size={18} />
        </button>
        <button
          className="play-btn"
          onClick={() => setIsPlaying(!isPlaying)}
          title={isPlaying ? 'Pause' : 'Auto Play'}
        >
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button onClick={onNext} disabled={currentPly >= totalPlies} title="Next Move (Right Arrow)">
          <ChevronRight size={18} />
        </button>
        <button onClick={onLast} disabled={currentPly >= totalPlies} title="Last Move (Down Arrow)">
          <ChevronsRight size={18} />
        </button>
        <button onClick={onFlipBoard} title="Flip Board (F)">
          <ArrowUpDown size={18} />
        </button>

        <span className="review-move-counter">
          Ply {currentPly} / {totalPlies}
        </span>
      </div>
    </div>
  );
};
