// ============================================================
// PGN Parser — Robust multi-game PGN import
// ============================================================

import { Chess } from 'chess.js';
import { stableGameId } from './gameState';
import type { GameMetadata, GameResult, StoredGame } from '../types';

/** Result of parsing a PGN string */
export interface ParseResult {
  games: StoredGame[];
  errors: ParseError[];
}

export interface ParseError {
  gameIndex: number;
  message: string;
  pgn: string;
}

/**
 * Parse player name and optional rating from PGN header value.
 * Handles formats like "PlayerName (1800)" or just "PlayerName"
 */
function parsePlayer(value: string): { name: string; rating?: number } {
  const name = value || 'Unknown';
  return { name };
}

/**
 * Extract rating from Elo headers (WhiteElo, BlackElo).
 */
function parseRating(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const num = parseInt(value, 10);
  return isNaN(num) || num <= 0 ? undefined : num;
}

/**
 * Split a multi-game PGN string into individual game strings.
 */
function splitPgn(pgnText: string): string[] {
  const games: string[] = [];
  // Results in comments, headers, and side variations must not split a game.
  const tokens = /\{[^}]*\}|;[^\n]*|\[(?:[^\]"\\]|"(?:[^"\\]|\\.)*"|\\.)*\]|\(|\)|[^\s{};()[\]]+/g;
  let start = 0, variationDepth = 0, hasMovetext = false;
  for (const match of pgnText.matchAll(tokens)) {
    const token = match[0];
    if (token.startsWith('{') || token.startsWith(';')) continue;
    if (token.startsWith('[') && variationDepth === 0) {
      if (hasMovetext) {
        games.push(pgnText.slice(start, match.index).trim());
        start = match.index;
        hasMovetext = false;
      }
      continue;
    }
    if (token === '(') { variationDepth++; continue; }
    if (token === ')') { variationDepth = Math.max(0, variationDepth - 1); continue; }
    if (variationDepth) continue;
    hasMovetext = true;
    if (['1-0', '0-1', '1/2-1/2', '*'].includes(token)) {
      games.push(pgnText.slice(start, match.index + token.length).trim());
      start = match.index + token.length;
      hasMovetext = false;
    }
  }
  const tail = pgnText.slice(start).trim();
  if (tail) {
    if (games.length && !tail.replace(/\{[^}]*\}|;[^\n]*/g, '').trim()) games[games.length - 1] += '\n' + tail;
    else games.push(tail);
  }
  return games.filter(Boolean);
}

/**
 * Extract PGN headers from a PGN string.
 */
function extractHeaders(pgn: string): Record<string, string> {
  const headers: Record<string, string> = {};
  const headerRegex = /\[(\w+)\s+"([^"]*)"\]/g;
  let match;
  while ((match = headerRegex.exec(pgn)) !== null) {
    headers[match[1]] = match[2];
  }
  return headers;
}

/**
 * Determine game result from PGN result header.
 */
function parseResult(result: string | undefined): GameResult {
  switch (result) {
    case '1-0': return '1-0';
    case '0-1': return '0-1';
    case '1/2-1/2': return '1/2-1/2';
    default: return '*';
  }
}

/**
 * Detect opening name from ECO code or opening header.
 */
function detectOpening(headers: Record<string, string>): string | undefined {
  return headers['Opening'] || headers['ECOUrl']?.split('/').pop()?.replace(/-/g, ' ') || undefined;
}

/**
 * Parse a multi-game PGN string into StoredGame objects.
 * Valid games are returned even when other games in the file fail.
 */
export function parsePgn(pgnText: string, source: 'pgn_file' | 'pgn_text' | 'chesscom' = 'pgn_file'): ParseResult {
  const result: ParseResult = { games: [], errors: [] };
  const rawGames = splitPgn(pgnText);

  for (let i = 0; i < rawGames.length; i++) {
    const rawPgn = rawGames[i];
    try {
      const chess = new Chess();
      chess.loadPgn(rawPgn);

      const headers = { ...extractHeaders(rawPgn), ...chess.getHeaders() };
      if (!chess.history().length) throw new Error('The PGN contains no moves.');
      if (!['1-0', '0-1', '1/2-1/2'].includes(headers.Result)) {
        throw new Error('Only completed games can be imported. Set a final result in the PGN.');
      }
      if (chess.isCheckmate() && headers.Result !== (chess.turn() === 'w' ? '0-1' : '1-0')) {
        throw new Error('PGN result disagrees with the checkmated position.');
      }
      const whitePlayer = parsePlayer(headers['White'] || 'Unknown');
      const blackPlayer = parsePlayer(headers['Black'] || 'Unknown');
      whitePlayer.rating = parseRating(headers['WhiteElo']);
      blackPlayer.rating = parseRating(headers['BlackElo']);

      const metadata: GameMetadata = {
        id: stableGameId(rawPgn),
        white: whitePlayer,
        black: blackPlayer,
        result: parseResult(headers['Result']),
        date: headers['Date']?.includes('?') ? headers['UTCDate'] : headers['Date'] || headers['UTCDate'],
        event: headers['Event'],
        site: headers['Site'],
        opening: detectOpening(headers),
        eco: headers['ECO'],
        timeControl: headers['TimeControl'],
        termination: headers['Termination'],
        round: headers['Round'],
        importedAt: Date.now(),
        source,
        chesscomUrl: headers['Link'],
      };

      const game: StoredGame = {
        id: metadata.id,
        pgn: rawPgn,
        metadata,
        analysisStatus: 'not_analyzed',
      };

      result.games.push(game);
    } catch (err) {
      result.errors.push({
        gameIndex: i,
        message: err instanceof Error ? err.message : 'Failed to parse game',
        pgn: rawPgn.substring(0, 200),
      });
    }
  }

  return result;
}

/**
 * Validate a PGN string has valid moves.
 */
export function validatePgn(pgn: string): boolean {
  try {
    const chess = new Chess();
    chess.loadPgn(pgn);
    return chess.history().length > 0;
  } catch {
    return false;
  }
}
