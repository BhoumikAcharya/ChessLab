import React, { useRef, useEffect, useState } from 'react';
import type { PositionEvaluation } from '../../types';

interface EvaluationGraphProps {
  evaluations: (PositionEvaluation | undefined)[];
  currentPly: number;
  onSelectPly: (ply: number) => void;
  totalPlies: number;
}

export const EvaluationGraph: React.FC<EvaluationGraphProps> = ({
  evaluations,
  currentPly,
  onSelectPly,
  totalPlies,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [size, setSize] = useState(0);
  useEffect(() => {
    if (!canvasRef.current) return;
    const observer = new ResizeObserver(() => setSize(value => value + 1));
    observer.observe(canvasRef.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Handle high DPI
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;
    const midY = height / 2;

    // Clear background
    ctx.fillStyle = '#151A1F';
    ctx.fillRect(0, 0, width, height);

    // Draw center zero line
    ctx.strokeStyle = '#2A333B';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(width, midY);
    ctx.stroke();

    const n = Math.max(totalPlies, evaluations.length - 1, 1);
    const stepX = width / n;

    // Map centipawns (-1000 to +1000) to Y (height - margin to margin)
    const mapScoreToY = (score: number) => {
      const clamped = Math.max(-1000, Math.min(1000, score));
      // White advantage (positive score) goes UP (smaller Y)
      return midY - (clamped / 1000) * (midY - 12);
    };

    if (!evaluations.some(Boolean)) {
      ctx.fillStyle = '#99A6AF';
      ctx.font = '12px system-ui';
      ctx.fillText('Analyze the game to see the evaluation timeline.', 12, midY - 8);
      return;
    }

    // Draw the eval area curve
    ctx.beginPath();
    ctx.moveTo(0, midY);

    for (let i = 0; i <= n; i++) {
      const ev = evaluations[i];
      const score = ev?.score ?? 0;
      const x = i * stepX;
      const y = mapScoreToY(score);
      ctx.lineTo(x, y);
    }

    ctx.lineTo(width, midY);
    ctx.closePath();

    // Fill with soft accent gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, 'rgba(102, 182, 160, 0.35)');
    gradient.addColorStop(0.5, 'rgba(102, 182, 160, 0.05)');
    gradient.addColorStop(1, 'rgba(215, 122, 122, 0.25)');
    ctx.fillStyle = gradient;
    ctx.fill();

    // Draw stroke line
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const ev = evaluations[i];
      const score = ev?.score ?? 0;
      const x = i * stepX;
      const y = mapScoreToY(score);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = '#66B6A0';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw Blunder / Mistake / Inaccuracy dots
    for (let i = 1; i <= n; i++) {
      const ev = evaluations[i];
      if (!ev?.classification) continue;

      const cls = ev.classification;
      if (cls === 'blunder' || cls === 'mistake' || cls === 'inaccuracy') {
        const x = i * stepX;
        const y = mapScoreToY(ev.score);

        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle =
          cls === 'blunder'
            ? '#E05555'
            : cls === 'mistake'
            ? '#D77A7A'
            : '#D4A65B';
        ctx.fill();
        ctx.strokeStyle = '#151A1F';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Draw current ply cursor
    const cursorX = Math.min(width, Math.max(0, currentPly * stepX));
    ctx.strokeStyle = '#EAF0F0';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(cursorX, 0);
    ctx.lineTo(cursorX, height);
    ctx.stroke();
    ctx.setLineDash([]); // Reset line dash
  }, [evaluations, currentPly, totalPlies, size]);

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const n = Math.max(totalPlies, evaluations.length - 1, 1);
    const targetPly = Math.round((clickX / rect.width) * n);
    onSelectPly(Math.max(0, Math.min(totalPlies, targetPly)));
  };

  return (
    <div className="eval-graph-container" style={{ marginTop: 'var(--cl-space-3)' }}>
      <div className="eval-graph-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="eval-graph-title">Evaluation Timeline</span>
          <span className="eval-graph-subtitle">Click anywhere to jump to that move</span>
        </div>
        <div className="eval-graph-legend">
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#66B6A0' }} />
            <span>Advantage</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#D4A65B' }} />
            <span>Inaccuracy</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#D77A7A' }} />
            <span>Mistake</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#E05555' }} />
            <span>Blunder</span>
          </div>
        </div>
      </div>

      <div className="eval-graph" style={{ height: 80, position: 'relative' }}>
        <canvas
          ref={canvasRef}
          role="img" aria-label="Evaluation timeline from White’s perspective. Use the move list or arrow keys to navigate."
          onClick={handleCanvasClick}
          style={{ width: '100%', height: '100%', borderRadius: 4, display: 'block' }}
        />
      </div>
    </div>
  );
};
