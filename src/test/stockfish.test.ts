import { describe, it, expect } from 'vitest';
import { classifyMove } from '../services/stockfish';

describe('Move Classification Algorithm', () => {
  it('classifies book moves accurately', () => {
    const classification = classifyMove(20, 20, 'white', true, 20);
    expect(classification).toBe('book');
  });

  it('classifies forced moves accurately when only 1 legal move exists', () => {
    const classification = classifyMove(20, -100, 'white', false, 1);
    expect(classification).toBe('forced');
  });

  it('classifies best moves when centipawn loss is <= 10', () => {
    // White preserves eval
    expect(classifyMove(100, 100, 'white', false, 25)).toBe('best');
    // White improves eval
    expect(classifyMove(100, 150, 'white', false, 25)).toBe('best');
    // Black improves eval
    expect(classifyMove(100, 50, 'black', false, 25)).toBe('best');
  });

  it('classifies inaccuracies, mistakes, and blunders from White perspective', () => {
    // Inaccuracy (cpLoss ~80)
    expect(classifyMove(100, 20, 'white', false, 20)).toBe('inaccuracy');
    // Mistake (cpLoss ~180)
    expect(classifyMove(100, -80, 'white', false, 20)).toBe('mistake');
    // Blunder (cpLoss ~350)
    expect(classifyMove(100, -250, 'white', false, 20)).toBe('blunder');
  });

  it('classifies inaccuracies, mistakes, and blunders from Black perspective', () => {
    // Black blunders: score from White perspective jumps from -50 to +300 (cpLoss = 350)
    expect(classifyMove(-50, 300, 'black', false, 20)).toBe('blunder');
    // Black makes mistake: score from White perspective jumps from 0 to +180
    expect(classifyMove(0, 180, 'black', false, 20)).toBe('mistake');
  });
});
