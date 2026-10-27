import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, Play, ArrowRight } from 'lucide-react';
import { getAllGames, getLatestAnalyses } from '../../services/storage';
import type { StoredGame, GameAnalysis } from '../../types';

interface DashboardViewProps {
  onOpenImport: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onOpenImport }) => {
  const navigate = useNavigate();
  const [games, setGames] = useState<StoredGame[]>([]);
  const [analyses, setAnalyses] = useState<GameAnalysis[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const loadDashboardData = React.useCallback(async () => {
    try {
      const allGames = await getAllGames();
      setGames(allGames);

      setAnalyses(await getLatestAnalyses());
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load browser storage.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Synchronize state with asynchronous IndexedDB reads.
    void loadDashboardData();
    window.addEventListener('chesslab-data-changed', loadDashboardData);
    return () => window.removeEventListener('chesslab-data-changed', loadDashboardData);
  }, [loadDashboardData]);

  const totalGames = games.length;
  const analyzedGames = games.filter((g) => g.analysisStatus === 'analyzed');
  const analyzedCount = analyzedGames.length;

  // Compute Results Distribution across all games
  let whiteWins = 0;
  let blackWins = 0;
  let draws = 0;
  games.forEach((g) => {
    if (g.metadata.result === '1-0') whiteWins++;
    else if (g.metadata.result === '0-1') blackWins++;
    else if (g.metadata.result === '1/2-1/2') draws++;
  });

  // Calculate average accuracy strictly across analyzed games only!
  const whiteAnalyses = analyses.filter(a => a.summary.whiteAccuracy !== undefined);
  const blackAnalyses = analyses.filter(a => a.summary.blackAccuracy !== undefined);
  let avgWhiteAccuracy = 0;
  let avgBlackAccuracy = 0;
  if (analyses.length > 0) {
    const totalW = whiteAnalyses.reduce((sum, a) => sum + (a.summary.whiteAccuracy || 0), 0);
    const totalB = blackAnalyses.reduce((sum, a) => sum + (a.summary.blackAccuracy || 0), 0);
    avgWhiteAccuracy = Math.round(totalW / Math.max(1, whiteAnalyses.length));
    avgBlackAccuracy = Math.round(totalB / Math.max(1, blackAnalyses.length));
  }

  // Common openings
  const openingCounts: Record<string, number> = {};
  games.forEach((g) => {
    const opening = g.metadata.opening || 'Unknown Opening';
    openingCounts[opening] = (openingCounts[opening] || 0) + 1;
  });
  const topOpenings = Object.entries(openingCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  // Recent analyzed games
  const recentAnalyzed = [...analyzedGames].sort((a, b) => (analyses.find(v => v.gameId === b.id)?.completedAt ?? 0) - (analyses.find(v => v.gameId === a.id)?.completedAt ?? 0)).slice(0, 5);

  return (
    <div className="dashboard-container" style={{ padding: 'var(--cl-space-6)', maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 'var(--cl-space-6)' }}>
        <div>
          <h1 className="page-title">Personal Chess Lab</h1>
          <p className="page-subtitle">
            Local-first game reviews and deterministic Stockfish engine intelligence
          </p>
        </div>
        <button className="btn btn-primary" onClick={onOpenImport}>
          <Upload size={16} />
          Import Games
        </button>
      </div>

      {errorMessage && <div role="alert" className="notice-error">{errorMessage} <button className="btn btn-secondary btn-sm" onClick={loadDashboardData}>Retry</button></div>}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--cl-text-muted)' }}>
          Loading dashboard metrics...
        </div>
      ) : totalGames === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px', maxWidth: 500, margin: '40px auto' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: 'var(--cl-accent-muted)',
              color: 'var(--cl-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}
          >
            <Upload size={28} />
          </div>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, color: 'var(--cl-text-primary)', marginBottom: 8 }}>
            No games imported yet
          </h3>
          <p style={{ color: 'var(--cl-text-secondary)', fontSize: 'var(--cl-text-sm)', marginBottom: 24, lineHeight: 1.5 }}>
            Import a PGN file, paste game text, or fetch from Chess.com to begin analyzing your games with Stockfish 16.
          </p>
          <button className="btn btn-primary" onClick={onOpenImport} style={{ margin: '0 auto' }}>
            <Upload size={16} />
            Import Your First Game
          </button>
        </div>
      ) : (
        <>
          {/* KPI Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: 'var(--cl-space-4)',
              marginBottom: 'var(--cl-space-6)',
            }}
          >
            <div className="card">
              <div className="card-title">Imported Games</div>
              <div className="card-value">{totalGames}</div>
              <div className="card-detail">Stored locally in IndexedDB</div>
            </div>

            <div className="card">
              <div className="card-title">Analyzed with Stockfish</div>
              <div className="card-value" style={{ color: 'var(--cl-accent)' }}>
                {analyzedCount}
              </div>
              <div className="card-detail">
                {totalGames > 0 ? `${Math.round((analyzedCount / totalGames) * 100)}% of library analyzed` : '0%'}
              </div>
            </div>

            <div className="card">
              <div className="card-title">Avg Estimate (White)</div>
              <div className="card-value">
                {whiteAnalyses.length > 0 ? `${avgWhiteAccuracy}%` : '—'}
              </div>
              <div className="card-detail">
                {whiteAnalyses.length > 0 ? `Across ${whiteAnalyses.length} analyzed games` : 'Requires analyzed games'}
              </div>
            </div>

            <div className="card">
              <div className="card-title">Avg Estimate (Black)</div>
              <div className="card-value">
                {blackAnalyses.length > 0 ? `${avgBlackAccuracy}%` : '—'}
              </div>
              <div className="card-detail">
                {blackAnalyses.length > 0 ? `Across ${blackAnalyses.length} analyzed games` : 'Requires analyzed games'}
              </div>
            </div>
          </div>

          {/* Secondary Grid: Results & Top Openings */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gap: 'var(--cl-space-4)',
              marginBottom: 'var(--cl-space-6)',
            }}
          >
            {/* Results Distribution */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 16 }}>
                Outcome Distribution
              </div>
              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, background: 'var(--cl-bg-input)', padding: '12px', borderRadius: 'var(--cl-radius-md)', textAlign: 'center' }}>
                  <div style={{ fontSize: 'var(--cl-text-xs)', color: 'var(--cl-text-muted)', marginBottom: 4 }}>White Wins</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--cl-text-primary)' }}>{whiteWins}</div>
                  <div style={{ fontSize: 'var(--cl-text-xs)', color: 'var(--cl-text-secondary)' }}>
                    {totalGames > 0 ? `${Math.round((whiteWins / totalGames) * 100)}%` : '0%'}
                  </div>
                </div>
                <div style={{ flex: 1, background: 'var(--cl-bg-input)', padding: '12px', borderRadius: 'var(--cl-radius-md)', textAlign: 'center' }}>
                  <div style={{ fontSize: 'var(--cl-text-xs)', color: 'var(--cl-text-muted)', marginBottom: 4 }}>Black Wins</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--cl-text-primary)' }}>{blackWins}</div>
                  <div style={{ fontSize: 'var(--cl-text-xs)', color: 'var(--cl-text-secondary)' }}>
                    {totalGames > 0 ? `${Math.round((blackWins / totalGames) * 100)}%` : '0%'}
                  </div>
                </div>
                <div style={{ flex: 1, background: 'var(--cl-bg-input)', padding: '12px', borderRadius: 'var(--cl-radius-md)', textAlign: 'center' }}>
                  <div style={{ fontSize: 'var(--cl-text-xs)', color: 'var(--cl-text-muted)', marginBottom: 4 }}>Draws</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--cl-text-primary)' }}>{draws}</div>
                  <div style={{ fontSize: 'var(--cl-text-xs)', color: 'var(--cl-text-secondary)' }}>
                    {totalGames > 0 ? `${Math.round((draws / totalGames) * 100)}%` : '0%'}
                  </div>
                </div>
              </div>

              {/* Progress bar split */}
              <div style={{ height: 8, display: 'flex', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{ width: `${totalGames > 0 ? (whiteWins / totalGames) * 100 : 0}%`, background: 'var(--cl-text-primary)' }} title="White Wins" />
                <div style={{ width: `${totalGames > 0 ? (draws / totalGames) * 100 : 0}%`, background: 'var(--cl-text-muted)' }} title="Draws" />
                <div style={{ width: `${totalGames > 0 ? (blackWins / totalGames) * 100 : 0}%`, background: 'var(--cl-accent)' }} title="Black Wins" />
              </div>
            </div>

            {/* Common Openings */}
            <div className="card">
              <div className="card-title" style={{ marginBottom: 16 }}>
                Frequent Openings
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {topOpenings.map(([name, count]) => (
                  <div
                    key={name}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: 'var(--cl-bg-input)',
                      borderRadius: 'var(--cl-radius-sm)',
                    }}
                  >
                    <span style={{ fontSize: 'var(--cl-text-sm)', color: 'var(--cl-text-primary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '80%' }}>
                      {name}
                    </span>
                    <span className="badge" style={{ background: 'var(--cl-bg-elevated)', color: 'var(--cl-text-secondary)' }}>
                      {count} {count === 1 ? 'game' : 'games'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Recent Analyzed Games */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div className="card-title">Recent Engine Reviews</div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => navigate('/library')}
              >
                View all in library
                <ArrowRight size={14} />
              </button>
            </div>

            {recentAnalyzed.length === 0 ? (
              <p style={{ color: 'var(--cl-text-muted)', fontSize: 'var(--cl-text-sm)', padding: '16px 0' }}>
                No games have been analyzed yet. Go to the Game Library to select and analyze games with Stockfish.
              </p>
            ) : (
              <div className="table-scroll" role="region" aria-label="Recent game reviews" tabIndex={0}>
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th>Match</th>
                    <th>Result</th>
                    <th>Date</th>
                    <th>Opening</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentAnalyzed.map((game) => (
                    <tr key={game.id}>
                      <td>
                        <span className="player-name">{game.metadata.white.name}</span> vs{' '}
                        <span className="player-name">{game.metadata.black.name}</span>
                      </td>
                      <td>
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
                      </td>
                      <td style={{ color: 'var(--cl-text-muted)', fontSize: 'var(--cl-text-sm)' }}>
                        {game.metadata.date || '—'}
                      </td>
                      <td style={{ color: 'var(--cl-text-secondary)', fontSize: 'var(--cl-text-sm)', maxWidth: 200, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                        {game.metadata.opening || '—'}
                      </td>
                      <td>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => navigate(`/review/${game.id}`)}
                        >
                          <Play size={12} />
                          Open Review
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};
