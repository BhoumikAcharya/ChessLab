import { describe, it, expect } from 'vitest';
import { parsePgn } from '../services/pgnParser';
import { Chess } from 'chess.js';

describe('PGN Parser Service', () => {
  it('correctly parses single game with standard headers', () => {
    const pgn = `[Event "FIDE Candidates 2024"]
[Site "Toronto CAN"]
[Date "2024.04.14"]
[Round "10"]
[White "Nakamura, Hikaru"]
[Black "Gukesh, D"]
[Result "1/2-1/2"]
[ECO "C53"]
[Opening "Giuoco Piano"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. c3 Nf6 5. d3 d6 1/2-1/2`;

    const result = parsePgn(pgn, 'pgn_text');
    expect(result.errors.length).toBe(0);
    expect(result.games.length).toBe(1);

    const game = result.games[0];
    expect(game.metadata.white.name).toBe('Nakamura, Hikaru');
    expect(game.metadata.black.name).toBe('Gukesh, D');
    expect(game.metadata.result).toBe('1/2-1/2');
    expect(game.metadata.eco).toBe('C53');
    expect(game.metadata.opening).toBe('Giuoco Piano');
  });

  it('correctly parses multi-game PGN archives', () => {
    const multiPgn = `[Event "Game 1"]
[White "Player 1"]
[Black "Player 2"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1-0

[Event "Game 2"]
[White "Player 3"]
[Black "Player 4"]
[Result "0-1"]

1. d4 d5 2. c4 e6 0-1`;

    const result = parsePgn(multiPgn, 'pgn_file');
    expect(result.games.length).toBe(2);
    expect(result.games[0].metadata.white.name).toBe('Player 1');
    expect(result.games[1].metadata.white.name).toBe('Player 3');
    expect(result.games[0].id).not.toBe(result.games[1].id);
  });

  it('imports a completed game containing queenside castling', () => {
    const pgn = `[Event "Special Rules Test"]
[White "White"]
[Black "Black"]
[Result "1/2-1/2"]

1. e4 c5 2. Nf3 d6 3. d4 cxd4 4. Nxd4 Nf6 5. Nc3 a6 6. Be3 e5 7. Nb3 Be6 8. Qd2 Nbd7 9. O-O-O Be7 1/2-1/2`;

    const result = parsePgn(pgn, 'pgn_text');
    expect(result.games.length).toBe(1);

    // Verify legal reconstruction
    const chess = new Chess();
    expect(() => chess.loadPgn(result.games[0].pgn)).not.toThrow();

    // Verify queenside castling was recorded
    const history = chess.history();
    expect(history).toContain('O-O-O');
  });

  it('handles invalid PGN gracefully with descriptive error', () => {
    const invalidPgn = `This is just random text with no valid chess moves.`;
    const result = parsePgn(invalidPgn, 'pgn_text');
    expect(result.games.length).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});


describe('PGN integrity regressions', () => {
  it('rejects header-only and unfinished games', () => {
    expect(parsePgn('[Event "Empty"]').games).toHaveLength(0);
    expect(parsePgn('[Result "*"]\n\n1. e4 *').errors[0].message).toContain('completed');
  });
  it('reads the result from movetext when headers are absent', () => {
    expect(parsePgn('1. f3 e5 2. g4 Qh4# 0-1').games[0].metadata.result).toBe('0-1');
  });
  it('uses stable identities that include moves and ignore comments', () => {
    const base = '[White "Same"]\n[Black "Opponent"]\n[Date "2026.10.28"]\n[Result "1-0"]\n\n';
    const a = parsePgn(base + '1. e4 e5 1-0').games[0];
    const b = parsePgn(base + '1. d4 d5 1-0').games[0];
    const commented = parsePgn(base + '1. e4 {hello} e5 1-0').games[0];
    expect(a.id).not.toBe(b.id);
    expect(a.id).toBe(commented.id);
    expect(a.id).toBe(parsePgn(a.pgn).games[0].id);
  });
  it('preserves good games alongside invalid records', () => {
    const result = parsePgn('[Event "Invalid"]\n\n1. e5 1-0\n\n[Event "Valid"]\n\n1. e4 e5 1-0');
    expect(result.games).toHaveLength(1); expect(result.errors).toHaveLength(1);
  });
});


describe('multi-game token boundaries', () => {
  it('splits headerless completed games without merging their moves', () => {
    const result = parsePgn('1. e4 e5 1-0\n\n1. d4 d5 0-1');
    expect(result.errors).toEqual([]);
    expect(result.games).toHaveLength(2);
    expect(result.games.map(g => g.metadata.result)).toEqual(['1-0', '0-1']);
  });
  it('ignores result-looking comments and variations', () => {
    const result = parsePgn('[Event "Result 0-1"]\n[Result "1-0"]\n\n1. e4 {example 0-1} e5 (1... c5 {0-1}) 2. Nf3 Nc6 1-0 {trailing note}');
    expect(result.errors).toEqual([]); expect(result.games).toHaveLength(1);
  });
});
