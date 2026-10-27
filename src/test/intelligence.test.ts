import { describe, it, expect } from 'vitest';
import { analyzeMove, generateExplanation } from '../services/intelligence';
import type { PositionEvaluation } from '../types';

describe('Chess Intelligence Engine', () => {
  it('detects material capture accurately', () => {
    // 1. e4 d5 2. exd5 (capture on d5)
    const fenBefore = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
    const fenAfter = 'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2';

    const findings = analyzeMove(
      fenBefore,
      fenAfter,
      'exd5',
      { score: 50, isMate: false, depth: 15, fen: fenBefore, bestMove: 'e4d5', bestMoveSan: 'exd5', pv: ['exd5'], lines: [], moveNumber: 2, sideToMove: 'white' },
      { score: 60, isMate: false, depth: 15, fen: fenAfter, bestMove: 'd8d5', bestMoveSan: 'Qxd5', pv: ['Qxd5'], lines: [], moveNumber: 2, sideToMove: 'white' },
      2
    );

    expect(
      findings.some(
        (f) => f.type === 'material_gain' || f.explanation.toLowerCase().includes('captures pawn')
      )
    ).toBe(true);
  });

  it('detects missed forced checkmates', () => {
    const fenBefore = '7k/5Q2/6K1/8/8/8/8/8 w - - 0 1';
    const fenAfter = '7k/8/5QK1/8/8/8/8/8 b - - 1 1';

    const evalBefore: PositionEvaluation = {
      fen: fenBefore,
      score: 9999,
      isMate: true,
      mateIn: 1, // Mate in 1 available (Qg7#)
      depth: 18,
      bestMove: 'f7g7',
      bestMoveSan: 'Qg7#',
      pv: ['Qg7#'],
      lines: [],
      moveNumber: 1,
      sideToMove: 'white',
    };

    const evalAfter: PositionEvaluation = {
      fen: fenAfter,
      score: 500, // Move played didn't mate immediately
      isMate: false,
      depth: 18,
      bestMove: 'h8g8',
      bestMoveSan: 'Kg8',
      pv: ['Kg8'],
      lines: [],
      moveNumber: 1,
      sideToMove: 'white',
    };

    const findings = analyzeMove(fenBefore, fenAfter, 'Qf6+', evalBefore, evalAfter, 0);
    expect(findings.some((f) => f.type === 'missed_mate')).toBe(true);
  });

  it('provides honest fallbacks without hallucinating when tactical facts are uncertain', () => {
    const explanation = generateExplanation(
      [], // No specific verified tactical pattern detected
      'h3',
      'Nf3'
    );

    expect(explanation).toContain('The engine prefers Nf3');
    expect(explanation).toContain('Compare the two continuations');
  });
});
