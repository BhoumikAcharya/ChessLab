import React from 'react';
import { formatEvaluation } from '../../services/evaluation';

interface EvaluationBarProps {
  score?: number; // Centipawns from White's perspective
  isMate?: boolean;
  mateIn?: number;
  terminal?: 'checkmate' | 'draw';
  orientation?: 'white' | 'black';
}

export const EvaluationBar: React.FC<EvaluationBarProps> = ({
  score,
  terminal,
  isMate = false,
  mateIn,
  orientation = 'white',
}) => {
  // Convert centipawns or mate into a percentage (0% to 100% white advantage)
  let whitePercent = 50;

  if (isMate && mateIn !== undefined) {
    if ((score ?? 0) > 0) {
      whitePercent = 98;
    } else {
      whitePercent = 2;
    }
  } else {
    // Sigmoid compression: 0 cp -> 50%, +300 cp -> ~75%, +1000 cp -> ~95%
    // formula: 1 / (1 + 10^(-score / 400)) * 100
    const clampedScore = Math.max(-1500, Math.min(1500, score ?? 0));
    whitePercent = 100 / (1 + Math.pow(10, -clampedScore / 600));
    whitePercent = Math.max(4, Math.min(96, whitePercent));
  }

  // If orientation is black, flip the bar
  const heightPercent = whitePercent;

  const label = formatEvaluation(score === undefined ? undefined : { score, isMate, mateIn, terminal });

  return (
    <div className="eval-bar" title={`Evaluation from White’s perspective: ${label}`}>
      <div
        className="eval-bar-white"
        style={{
          height: `${heightPercent}%`,
          top: orientation === 'black' ? 0 : undefined,
          bottom: orientation === 'white' ? 0 : undefined,
        }}
      />
      <div className="eval-bar-score">{label}</div>
    </div>
  );
};
