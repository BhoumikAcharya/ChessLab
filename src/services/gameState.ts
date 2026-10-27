import { Chess } from 'chess.js';
import type { PlayerColor } from '../types';

export interface GamePly {
  ply: number;
  fen: string;
  san?: string;
  uci?: string;
  moveNumber: number;
  side: PlayerColor;
  terminal?: 'checkmate' | 'draw';
}

/** Reconstruct once from the PGN's actual initial position, including SetUp/FEN. */
export function reconstructGame(pgn: string): GamePly[] {
  const game = new Chess();
  game.loadPgn(pgn);
  const history = game.history({ verbose: true });
  const initialFen = history[0]?.before ?? game.fen();
  const replay = new Chess(initialFen);
  const plies: GamePly[] = [{ ply: 0, fen: initialFen,
    moveNumber: Number(initialFen.split(' ')[5]), side: replay.turn() === 'w' ? 'white' : 'black' }];
  for (const move of history) {
    const moveNumber = Number(replay.fen().split(' ')[5]);
    const played = replay.move(move.san);
    plies.push({ ply: plies.length, fen: replay.fen(), san: played.san,
      uci: played.from + played.to + (played.promotion ?? ''), moveNumber,
      side: played.color === 'w' ? 'white' : 'black',
      terminal: replay.isCheckmate() ? 'checkmate' : replay.isDraw() ? 'draw' : undefined });
  }
  return plies;
}

/** Reject the whole variation if any move is illegal; never display a silent prefix. */
export function replayVariation(fen: string, moves: string[]): string[] {
  const chess = new Chess(fen);
  return [fen, ...moves.map(move => { chess.move(move); return chess.fen(); })];
}

/** Comments, formatting and transport-specific headers do not change game identity. */
export function gameIdentity(pgn: string): string {
  const chess = new Chess();
  chess.loadPgn(pgn);
  const h = chess.getHeaders();
  const moves = chess.history({ verbose: true });
  return JSON.stringify([h.White?.trim().toLowerCase() ?? '', h.Black?.trim().toLowerCase() ?? '',
    (h.Date && !h.Date.includes('?') ? h.Date : h.UTCDate) ?? '', h.Result ?? '*',
    moves[0]?.before ?? chess.fen(), moves.map(m => m.from + m.to + (m.promotion ?? ''))]);
}

export function stableGameId(pgn: string): string {
  // Two independent 32-bit hashes; full canonical identity is also compared in storage.
  let a = 2166136261, b = 5381;
  for (const c of gameIdentity(pgn)) {
    a = Math.imul(a ^ c.charCodeAt(0), 16777619);
    b = Math.imul(b, 33) ^ c.charCodeAt(0);
  }
  return `game_${(a >>> 0).toString(36)}_${(b >>> 0).toString(36)}`;
}
