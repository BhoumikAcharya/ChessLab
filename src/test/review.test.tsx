import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { GameReviewView } from '../components/review/GameReviewView';
import { reconstructGame, replayVariation } from '../services/gameState';
import { parsePgn } from '../services/pgnParser';
import { buildSummary, classifyMove } from '../services/classification';
import type { GameAnalysis, PositionEvaluation } from '../types';

const storage = vi.hoisted(() => ({ getGame: vi.fn(), getAnalysis: vi.fn(), getSettings: vi.fn(),
  saveAnalysis: vi.fn(), updateGameStatus: vi.fn(), getAllGames: vi.fn() }));
vi.mock('../services/storage', () => storage);
const engines = vi.hoisted(() => ({ init: vi.fn(), analyzeGame: vi.fn(), terminate: vi.fn(), cancel: vi.fn() }));
vi.mock('../services/stockfish', () => ({ StockfishService: class {
  init = engines.init; analyzeGame = engines.analyzeGame; terminate = engines.terminate; cancel = engines.cancel;
} }));
vi.mock('../components/review/EvaluationGraph', () => ({ EvaluationGraph: () => <div>Timeline</div> }));
vi.mock('../components/review/ChessboardSection', () => ({ ChessboardSection: (props: {
  fen: string; onFirst: () => void; onPrev: () => void; onNext: () => void; onLast: () => void;
}) => <div><output data-testid="fen">{props.fen}</output><button onClick={props.onFirst}>First</button>
  <button onClick={props.onPrev}>Previous</button><button onClick={props.onNext}>Next</button><button onClick={props.onLast}>Last</button></div> }));

const pgn = '[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1';
const game = parsePgn(pgn).games[0];
const plies = reconstructGame(pgn);
const scores = [25, -50, -50, -9999, -10000];
const pvs = [['e4'], ['e5'], ['e3', 'Nc6'], ['Qh4#'], []];
const evals: PositionEvaluation[] = plies.map((p, i) => ({ fen: p.fen, depth: 10, score: scores[i], isMate: i >= 3,
  mateIn: i === 3 ? -1 : i === 4 ? 0 : undefined, bestMove: '', bestMoveSan: pvs[i][0] ?? '', pv: pvs[i],
  lines: [], moveNumber: p.moveNumber, sideToMove: p.fen.split(' ')[1] === 'w' ? 'white' : 'black',
  terminal: i === 4 ? 'checkmate' : undefined,
  mover: i ? p.side : undefined, playedMove: p.san,
  classification: i ? classifyMove(scores[i - 1], scores[i], p.side, false, 20) : undefined,
  centipawnLoss: i ? Math.max(0, p.side === 'white' ? scores[i - 1] - scores[i] : scores[i] - scores[i - 1]) : undefined }));
const analysis: GameAnalysis = { id: 'review', gameId: game.id, positions: evals.slice(1), initialPosition: evals[0],
  engineVersion: 'Stockfish 16 WASM', analysisDepth: 10, completedAt: 1, summary: buildSummary(evals.slice(1)) };
function open() { return render(<MemoryRouter initialEntries={[`/review/${game.id}`]}><Routes>
  <Route path="/review/:gameId" element={<GameReviewView />} /></Routes></MemoryRouter>); }
beforeEach(() => {
  storage.getGame.mockResolvedValue(game); storage.getAnalysis.mockResolvedValue(analysis);
  storage.getSettings.mockResolvedValue({ analysisDepth: 10, multiPv: 1, boardFlipped: false, chesscomUsername: '' });
  storage.updateGameStatus.mockResolvedValue(undefined); storage.saveAnalysis.mockResolvedValue(undefined);
  engines.init.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('review integration regressions', () => {
  it('opens Moves and preserves the selected FEN when switching tabs', async () => {
    open(); await screen.findByText('Turning points:');
    expect(screen.getByRole('button', { name: 'Moves' }).className).toContain('active');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByTestId('fen').textContent).toBe(plies[1].fen);
    fireEvent.click(screen.getByRole('button', { name: 'Coach' }));
    expect(screen.getByTestId('fen').textContent).toBe(plies[1].fen);
    fireEvent.click(screen.getByRole('button', { name: 'Lines' }));
    expect(screen.getByTestId('fen').textContent).toBe(plies[1].fen);
  });
  it('replays the recommendation from before g4, steps through it, and returns to the original position', async () => {
    open(); await screen.findByText('Turning points:');
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Coach' }));
    expect(screen.getByText(/allows a forced checkmate/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show Me Why (Replay Line)' }));
    const line = replayVariation(plies[2].fen, pvs[2]);
    expect(screen.getByTestId('fen').textContent).toBe(line[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByTestId('fen').textContent).toBe(line[2]);
    fireEvent.click(screen.getByRole('button', { name: 'Return to Actual Game' }));
    expect(screen.getByTestId('fen').textContent).toBe(plies[3].fen);
  });
  it('ignores late results from a cancelled run while allowing an immediate retry', async () => {
    let resolveOld!: (value: GameAnalysis) => void;
    engines.analyzeGame.mockImplementationOnce(() => new Promise<GameAnalysis>(resolve => { resolveOld = resolve; }));
    engines.analyzeGame.mockResolvedValueOnce(analysis);
    open(); await screen.findByText('Turning points:');
    fireEvent.click(screen.getByRole('button', { name: 'Re-analyze' }));
    await waitFor(() => expect(engines.analyzeGame).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Re-analyze' }));
    await waitFor(() => expect(storage.saveAnalysis).toHaveBeenCalledTimes(1));
    resolveOld({ ...analysis, id: 'cancelled-old-run' });
    await waitFor(() => expect(engines.terminate).toHaveBeenCalledTimes(2));
    expect(storage.saveAnalysis).toHaveBeenCalledTimes(1);
    expect(engines.cancel).toHaveBeenCalledTimes(1);
  });
});
