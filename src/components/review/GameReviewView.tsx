import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Chess } from 'chess.js';
import { downloadFile } from '../../services/download';
import { reconstructGame, replayVariation } from '../../services/gameState';
import type { GamePly } from '../../services/gameState';
import { ArrowLeft, Download, AlertCircle } from 'lucide-react';

import { ChessboardSection } from './ChessboardSection';
import { MovesTab } from './MovesTab';
import { CoachTab } from './CoachTab';
import { LinesTab } from './LinesTab';
import { EvaluationGraph } from './EvaluationGraph';

import { getGame, getAnalysis, saveAnalysis, updateGameStatus, getAllGames, getSettings } from '../../services/storage';
import { StockfishService } from '../../services/stockfish';
import type {
  StoredGame,
  GameAnalysis,
  PositionEvaluation,
  AnalysisProgress,
  PlayerInfo,
} from '../../types';

export const GameReviewView: React.FC = () => {
  const { gameId } = useParams<{ gameId: string }>();
  const navigate = useNavigate();

  const [game, setGame] = useState<StoredGame | null>(null);
  const [analysis, setAnalysis] = useState<GameAnalysis | null>(null);
  const [plies, setPlies] = useState<GamePly[]>([]);
  const [currentPly, setCurrentPly] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'moves' | 'coach' | 'lines'>('moves');
  const [orientation, setOrientation] = useState<'white' | 'black'>('white');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Analysis service state
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const stockfishServiceRef = useRef<StockfishService | null>(null);

  const runRef = useRef(0);

  // Variation exploration state
  const [variationPlies, setVariationPlies] = useState<string[] | null>(null);
  const [variationIndex, setVariationIndex] = useState<number>(0);

  // Load game & analysis
  useEffect(() => {
    let isMounted = true;
    const serviceHolder = stockfishServiceRef;
    const tokenHolder = runRef;

    async function loadData() {
      setIsLoading(true);
      setIsAnalyzing(false);
      setErrorMessage(null);
      setAnalysis(null);
      setActiveTab('moves');
      setVariationPlies(null);
      setAnalysisError(null);

      try {
        let targetId = gameId;

        // If no gameId in URL, pick the most recent game from the library
        if (!targetId) {
          const allGames = await getAllGames();
          if (allGames.length > 0) {
            targetId = allGames[0].id;
            navigate(`/review/${targetId}`, { replace: true });
            return;
          } else {
            setErrorMessage('No games found in your library. Please import a game first.');
            setIsLoading(false);
            return;
          }
        }

        const loadedGame = await getGame(targetId);
        if (!loadedGame) {
          setErrorMessage('Game not found in local storage.');
          setIsLoading(false);
          return;
        }

        if (!isMounted) return;
        setGame(loadedGame);

        setPlies(reconstructGame(loadedGame.pgn));
        setCurrentPly(0);
        const settings = await getSettings();
        if (!isMounted) return;
        setOrientation(settings.boardFlipped ? 'black' : 'white');

        // Load cached analysis
        const cachedAnalysis = await getAnalysis(targetId);
        if (cachedAnalysis && isMounted) {
          setAnalysis(cachedAnalysis);
        }
      } catch (err) {
        console.error('Error loading game review:', err);
        setErrorMessage(err instanceof Error ? err.message : 'Failed to load game review data.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
      tokenHolder.current++;
      if (serviceHolder.current) {
        serviceHolder.current.terminate();
        serviceHolder.current = null;
        if (gameId) void updateGameStatus(gameId, 'interrupted').catch(() => {});
      }
    };
  }, [gameId, navigate]);

  const navigatePosition = useCallback((target: 'first' | 'prev' | 'next' | 'last') => {
    const last = (variationPlies?.length ?? plies.length) - 1;
    const update = (previous: number) => target === 'first' ? 0 : target === 'last' ? Math.max(0, last)
      : Math.max(0, Math.min(last, previous + (target === 'next' ? 1 : -1)));
    if (variationPlies) setVariationIndex(update); else setCurrentPly(update);
  }, [variationPlies, plies.length]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        navigatePosition('prev');
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        navigatePosition('next');
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigatePosition('first');
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigatePosition('last');
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        setOrientation((prev) => (prev === 'white' ? 'black' : 'white'));
      }
    },
    [navigatePosition]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // A run token prevents cancelled or unmounted work from updating a later review.
  const handleStartAnalysis = async () => {
    if (!game || stockfishServiceRef.current) return;
    const token = ++runRef.current;
    const service = new StockfishService();
    stockfishServiceRef.current = service;
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisProgress(null);
    try {
      const settings = await getSettings();
      if (token !== runRef.current) return;
      await updateGameStatus(game.id, 'analyzing');
      await service.init();
      const result = await service.analyzeGame(game.id, game.pgn, settings.analysisDepth, settings.multiPv,
        progress => { if (token === runRef.current) setAnalysisProgress(progress); });
      if (token !== runRef.current) return;
      await saveAnalysis(result);
      if (token !== runRef.current) return;
      setAnalysis(result);
      setGame(prev => prev ? { ...prev, analysisStatus: 'analyzed', analysisId: result.id } : null);
    } catch (error) {
      if (token !== runRef.current) return;
      setAnalysisError(error instanceof Error ? error.message : 'Analysis failed. Please retry.');
      try { await updateGameStatus(game.id, analysis ? 'analyzed' : 'failed'); } catch { /* Keep original error visible. */ }
    } finally {
      service.terminate();
      if (token === runRef.current) {
        stockfishServiceRef.current = null;
        setIsAnalyzing(false);
        setAnalysisProgress(null);
      }
    }
  };

  const handleCancelAnalysis = () => {
    runRef.current++;
    stockfishServiceRef.current?.cancel();
    stockfishServiceRef.current = null;
    setIsAnalyzing(false);
    setAnalysisProgress(null);
    setAnalysisError('Analysis cancelled. You can retry when ready.');
    if (game) void updateGameStatus(game.id, analysis ? 'analyzed' : 'interrupted').catch(() =>
      setAnalysisError('Analysis cancelled, but its status could not be saved.'));
  };

  const handlePreviewLine = (moves: string[], fen = plies[currentPly]?.fen) => {
    if (!fen || !moves.length) return;
    try {
      setVariationPlies(replayVariation(fen, moves));
      setVariationIndex(1);
      setAnalysisError(null);
    } catch {
      setAnalysisError('This variation does not match its reference position. Re-analyze the game.');
    }
  };

  const handleReturnToGame = () => {
    setVariationPlies(null);
    setVariationIndex(0);
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '100px 20px', color: 'var(--cl-text-muted)' }}>
        Loading game review...
      </div>
    );
  }

  if (errorMessage || !game) {
    return (
      <div className="card" style={{ maxWidth: 500, margin: '60px auto', textAlign: 'center', padding: '40px 20px' }}>
        <AlertCircle size={36} style={{ color: 'var(--cl-error)', margin: '0 auto 16px' }} />
        <h3 style={{ color: 'var(--cl-text-primary)', marginBottom: 8 }}>Unable to Load Review</h3>
        <p style={{ color: 'var(--cl-text-secondary)', fontSize: 'var(--cl-text-sm)', marginBottom: 24 }}>
          {errorMessage || 'Game could not be found.'}
        </p>
        <button className="btn btn-primary" onClick={() => navigate('/library')} style={{ margin: '0 auto' }}>
          <ArrowLeft size={14} />
          Back to Game Library
        </button>
      </div>
    );
  }

  // Active FEN: either from replaying variation or from game ply
  const currentFen =
    variationPlies && variationPlies[variationIndex]
      ? variationPlies[variationIndex]
      : plies[currentPly]?.fen || new Chess().fen();

  // Active evaluation for current ply
  // Note: plies[0] is start position. Analysis evaluations are indexed by move ply (1..n)
  const gameEval: PositionEvaluation | undefined = currentPly > 0 ? analysis?.positions[currentPly - 1] : analysis?.initialPosition;
  // Branch positions have no cached evaluation unless they match an analyzed FEN.
  const currentEval = variationPlies ? [analysis?.initialPosition, ...(analysis?.positions ?? [])].find(ev => ev?.fen === currentFen) : gameEval;
  const evalBefore = currentPly > 1 ? analysis?.positions[currentPly - 2] : analysis?.initialPosition;
  const graphEvaluations = analysis ? [analysis.initialPosition, ...analysis.positions] : [];

  const whitePlayer: PlayerInfo = game.metadata.white;
  const blackPlayer: PlayerInfo = game.metadata.black;

  // Moves list mapped for MovesTab
  const moveItems = plies.slice(1).map((p, idx) => ({
    ply: p.ply,
    moveNumber: p.moveNumber,
    san: p.san || '',
    side: p.side,
    evaluation: analysis?.positions[idx],
  }));

  return (
    <div style={{ padding: 'var(--cl-space-4) var(--cl-space-6)', maxWidth: 1440, margin: '0 auto' }}>
      {/* Review Header */}
      <div className="review-header" style={{ marginBottom: 'var(--cl-space-3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => navigate('/library')} title="Back to library">
            <ArrowLeft size={16} />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 'var(--cl-text-md)', color: 'var(--cl-text-primary)' }}>
                {whitePlayer.name} vs {blackPlayer.name}
              </span>
              <span
                className={`badge ${
                  game.metadata.result === '1-0'
                    ? 'badge-win'
                    : game.metadata.result === '0-1'
                    ? 'badge-loss'
                    : 'badge-draw'
                }`}
              >
                {game.metadata.result}
              </span>
            </div>
            <div className="review-header-info">
              <span>{game.metadata.date || 'Unspecified date'}</span>
              <span>•</span>
              <span>{game.metadata.opening || 'Chess Game'}</span>
              {game.metadata.eco && <span>({game.metadata.eco})</span>}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => {
              downloadFile(new Blob([game.pgn], { type: 'application/x-chess-pgn' }), `${whitePlayer.name}_vs_${blackPlayer.name}.pgn`);
            }}
            title="Download PGN"
          >
            <Download size={14} />
            Export PGN
          </button>
        </div>
      </div>

      {analysisError && <div role="alert" className="notice-error">{analysisError}</div>}
      {/* Main Review Grid */}
      <div className="review-layout">
        {/* Left: Interactive Chessboard */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {variationPlies && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 12px',
                background: 'var(--cl-accent-muted)',
                borderRadius: 'var(--cl-radius-md)',
                marginBottom: 8,
                fontSize: 'var(--cl-text-xs)',
                color: 'var(--cl-accent)',
                border: '1px solid rgba(102, 182, 160, 0.3)',
              }}
            >
              <span>Exploring candidate variation (move {variationIndex} of {variationPlies.length - 1})</span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleReturnToGame}
                style={{ padding: '2px 8px', fontSize: '11px' }}
              >
                Return to Game
              </button>
            </div>
          )}

          <ChessboardSection
            fen={currentFen}
            whitePlayer={whitePlayer}
            blackPlayer={blackPlayer}
            currentPly={variationPlies ? variationIndex : currentPly}
            totalPlies={Math.max(0, (variationPlies?.length ?? plies.length) - 1)}
            orientation={orientation}
            onFlipBoard={() => setOrientation((prev) => (prev === 'white' ? 'black' : 'white'))}
            onFirst={() => navigatePosition('first')}
            onPrev={() => navigatePosition('prev')}
            onNext={() => navigatePosition('next')}
            onLast={() => navigatePosition('last')}
            onMovePiece={(from, to, promotion) => {
              try {
                const chess = new Chess(currentFen);
                chess.move({ from, to, promotion });
                const prefix = variationPlies ? variationPlies.slice(0, variationIndex + 1) : [currentFen];
                setVariationPlies([...prefix, chess.fen()]);
                setVariationIndex(prefix.length);
                return true;
              } catch { return false; }
            }}
            lastMove={variationPlies ? undefined : plies[currentPly]?.uci}
            currentEval={currentEval}
          />
        </div>

        {/* Right: Analysis Panel with Tabs */}
        <div className="analysis-panel">
          {/* Tab Navigation: Moves (Default) | Coach | Lines */}
          <div className="tabs" style={{ padding: '8px 16px 0', borderBottom: '1px solid var(--cl-border)' }}>
            <button
              className={`tab ${activeTab === 'moves' ? 'active' : ''}`}
              onClick={() => setActiveTab('moves')}
            >
              Moves
            </button>
            <button
              className={`tab ${activeTab === 'coach' ? 'active' : ''}`}
              onClick={() => setActiveTab('coach')}
            >
              Coach
            </button>
            <button
              className={`tab ${activeTab === 'lines' ? 'active' : ''}`}
              onClick={() => setActiveTab('lines')}
            >
              Lines
            </button>
          </div>

          {/* Tab Content */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {activeTab === 'moves' && (
              <MovesTab
                moves={moveItems}
                currentPly={currentPly}
                onSelectPly={(ply) => {
                  setVariationPlies(null);
                  setCurrentPly(ply);
                }}
                analysis={analysis || undefined}
                isAnalyzing={isAnalyzing}
                analysisProgress={analysisProgress}
                onStartAnalysis={handleStartAnalysis}
                onCancelAnalysis={handleCancelAnalysis}
              />
            )}

            {activeTab === 'coach' && (
              <CoachTab
                currentPly={currentPly}
                playedMoveSan={plies[currentPly]?.san}
                fenBefore={plies[currentPly - 1]?.fen}
                fenAfter={plies[currentPly]?.fen}
                evalBefore={evalBefore}
                evalAfter={gameEval}
                isAnalyzing={isAnalyzing}
                onPreviewActualLine={handlePreviewLine}
                onPreviewLine={(moves) => handlePreviewLine(moves, plies[currentPly - 1]?.fen)}
                isReplayingVariation={variationPlies !== null}
                onReturnToGame={handleReturnToGame}
                onStartAnalysis={handleStartAnalysis}
              />
            )}

            {activeTab === 'lines' && (
              <LinesTab
                isExploring={variationPlies !== null}
                isAnalyzing={isAnalyzing}
                currentEval={currentEval}
                onPreviewLine={moves => handlePreviewLine(moves, currentEval?.fen)}
                onStartAnalysis={handleStartAnalysis}
              />
            )}
          </div>
        </div>

        {/* Bottom: Interactive Evaluation Graph */}
        <EvaluationGraph
          evaluations={graphEvaluations}
          currentPly={currentPly}
          onSelectPly={(ply) => {
            setVariationPlies(null);
            setCurrentPly(ply);
          }}
          totalPlies={Math.max(1, plies.length - 1)}
        />
      </div>
    </div>
  );
};
