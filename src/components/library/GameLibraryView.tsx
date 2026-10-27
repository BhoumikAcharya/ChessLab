import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, Upload, Trash2, Play, Eye, RotateCw } from 'lucide-react';
import { getAllGames, deleteGame } from '../../services/storage';
import type { StoredGame, GameResult, AnalysisStatus } from '../../types';

interface GameLibraryViewProps {
  onOpenImport: () => void;
}

export const GameLibraryView: React.FC<GameLibraryViewProps> = ({ onOpenImport }) => {
  const navigate = useNavigate();
  const [games, setGames] = useState<StoredGame[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [resultFilter, setResultFilter] = useState<'all' | GameResult>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | AnalysisStatus>('all');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [sort, setSort] = useState('imported');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const loadGames = useCallback(async () => {
    try {
      const all = await getAllGames();
      setGames(all);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not load browser storage.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Synchronize state with asynchronous IndexedDB reads.
    void loadGames();
    window.addEventListener('chesslab-data-changed', loadGames);
    return () => window.removeEventListener('chesslab-data-changed', loadGames);
  }, [loadGames]);

  const handleDelete = async (id: string) => {
    try {
      await deleteGame(id);
      setDeleteConfirmId(null);
      await loadGames();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Could not delete game.');
    }
  };

  const filteredGames = useMemo(() => {
    return games.filter((g) => {
      // Search filter
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const whiteMatch = g.metadata.white.name.toLowerCase().includes(q);
        const blackMatch = g.metadata.black.name.toLowerCase().includes(q);
        const openingMatch = (g.metadata.opening || '').toLowerCase().includes(q);
        const ecoMatch = (g.metadata.eco || '').toLowerCase().includes(q);
        const eventMatch = (g.metadata.event || '').toLowerCase().includes(q);
        if (!whiteMatch && !blackMatch && !openingMatch && !ecoMatch && !eventMatch) {
          return false;
        }
      }

      // Result filter
      if (resultFilter !== 'all' && g.metadata.result !== resultFilter) {
        return false;
      }

      // Status filter
      if (statusFilter !== 'all' && g.analysisStatus !== statusFilter) {
        return false;
      }

      return true;
    });
  }, [games, searchQuery, resultFilter, statusFilter]);

  const sortedGames = [...filteredGames].sort((a, b) => sort === 'player' ? a.metadata.white.name.localeCompare(b.metadata.white.name)
    : sort === 'date' ? (b.metadata.date ?? '').localeCompare(a.metadata.date ?? '') : b.metadata.importedAt - a.metadata.importedAt);
  const totalPages = Math.max(1, Math.ceil(filteredGames.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const paginatedGames = sortedGames.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div style={{ padding: 'var(--cl-space-6)', maxWidth: 1440, margin: '0 auto' }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 'var(--cl-space-6)' }}>
        <div>
          <h1 className="page-title">Game Library</h1>
          <p className="page-subtitle">
            {games.length} total imported game{games.length === 1 ? '' : 's'} in local IndexedDB storage
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary btn-sm" onClick={loadGames} title="Reload games">
            <RotateCw size={14} />
            Refresh
          </button>
          <button className="btn btn-primary" onClick={onOpenImport}>
            <Upload size={16} />
            Import Games
          </button>
        </div>
      </div>

      {errorMessage && <div role="alert" className="notice-error">{errorMessage} <button className="btn btn-secondary btn-sm" onClick={loadGames}>Retry</button></div>}
      {/* Filter and Search Bar */}
      <div
        className="card"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--cl-space-3)',
          alignItems: 'center',
          padding: 'var(--cl-space-3) var(--cl-space-4)',
          marginBottom: 'var(--cl-space-4)',
        }}
      >
        <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
          <Search
            size={16}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--cl-text-muted)' }}
          />
          <input
            type="text"
            className="input-text"
            placeholder="Search players, openings, events..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setCurrentPage(1);
            }}
            style={{ paddingLeft: 36, width: '100%' }}
          />
        </div>

        <select aria-label="Sort games" className="input-text" style={{ width: 'auto' }} value={sort}
          onChange={e => { setSort(e.target.value); setCurrentPage(1); }}>
          <option value="imported">Recently imported</option><option value="date">Game date (newest)</option><option value="player">White player (A–Z)</option>
        </select>
        {/* Result filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Filter size={14} style={{ color: 'var(--cl-text-muted)' }} />
          <select
            className="input-text"
            aria-label="Filter by result"
            value={resultFilter}
            onChange={(e) => {
              setResultFilter(e.target.value as 'all' | GameResult);
              setCurrentPage(1);
            }}
            style={{ padding: '6px 12px', fontSize: 'var(--cl-text-xs)' }}
          >
            <option value="all">All Outcomes</option>
            <option value="1-0">1-0 (White Win)</option>
            <option value="0-1">0-1 (Black Win)</option>
            <option value="1/2-1/2">1/2-1/2 (Draw)</option>
          </select>
        </div>

        {/* Status filter */}
        <div>
          <select
            className="input-text"
            aria-label="Filter by analysis status"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'all' | AnalysisStatus);
              setCurrentPage(1);
            }}
            style={{ padding: '6px 12px', fontSize: 'var(--cl-text-xs)' }}
          >
            <option value="all">All Statuses</option>
            <option value="analyzed">Analyzed Only</option>
            <option value="not_analyzed">Not Analyzed</option>
            <option value="analyzing">Analyzing</option>
            <option value="interrupted">Interrupted</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>

      {/* Main Table */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--cl-text-muted)' }}>
          Loading your games library...
        </div>
      ) : filteredGames.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <p style={{ color: 'var(--cl-text-muted)', fontSize: 'var(--cl-text-sm)', marginBottom: 16 }}>
            {games.length === 0 ? 'No games found. Import your first game to get started.' : 'No games match your active filters.'}
          </p>
          {games.length === 0 && (
            <button className="btn btn-primary" onClick={onOpenImport} style={{ margin: '0 auto' }}>
              <Upload size={14} />
              Import Games Now
            </button>
          )}
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>White</th>
                  <th>Black</th>
                  <th>Result</th>
                  <th>Date</th>
                  <th>Time</th>
                  <th>Opening</th>
                  <th>Review Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedGames.map((game) => (
                  <tr key={game.id}>
                    <td>
                      <span className="player-name">{game.metadata.white.name}</span>
                      {game.metadata.white.rating && (
                        <span style={{ color: 'var(--cl-text-muted)', fontSize: 'var(--cl-text-xs)', marginLeft: 6 }}>
                          ({game.metadata.white.rating})
                        </span>
                      )}
                    </td>
                    <td>
                      <span className="player-name">{game.metadata.black.name}</span>
                      {game.metadata.black.rating && (
                        <span style={{ color: 'var(--cl-text-muted)', fontSize: 'var(--cl-text-xs)', marginLeft: 6 }}>
                          ({game.metadata.black.rating})
                        </span>
                      )}
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
                    <td style={{ color: 'var(--cl-text-muted)', fontSize: 'var(--cl-text-xs)', whiteSpace: 'nowrap' }}>
                      {game.metadata.date || '—'}
                    </td>
                    <td style={{ color: 'var(--cl-text-muted)', fontSize: 'var(--cl-text-xs)' }}>
                      {game.metadata.timeControl || '—'}
                    </td>
                    <td
                      style={{
                        color: 'var(--cl-text-secondary)',
                        fontSize: 'var(--cl-text-xs)',
                        maxWidth: 220,
                        textOverflow: 'ellipsis',
                        overflow: 'hidden',
                        whiteSpace: 'nowrap',
                      }}
                      title={game.metadata.opening}
                    >
                      {game.metadata.opening || '—'}
                    </td>
                    <td>
                      <span className="badge-status">
                        <span className={`badge-dot ${game.analysisStatus}`} />
                        <span style={{ textTransform: 'capitalize' }}>
                          {game.analysisStatus.replace('_', ' ')}
                        </span>
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => navigate(`/review/${game.id}`)}
                          title="Open Game Review"
                        >
                          {game.analysisStatus === 'analyzed' ? (
                            <>
                              <Eye size={12} />
                              Review
                            </>
                          ) : (
                            <>
                              <Play size={12} />
                              Analyze
                            </>
                          )}
                        </button>

                        {deleteConfirmId === game.id ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleDelete(game.id)}
                              style={{ padding: '4px 8px', fontSize: '11px' }}
                            >
                              Confirm
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => setDeleteConfirmId(null)}
                              style={{ padding: '4px 8px', fontSize: '11px' }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            className="btn btn-ghost btn-sm"
                            onClick={() => setDeleteConfirmId(game.id)}
                            title="Delete game"
                            style={{ color: 'var(--cl-text-muted)' }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 'var(--cl-space-3) var(--cl-space-4)',
                borderTop: '1px solid var(--cl-border)',
                fontSize: 'var(--cl-text-xs)',
                color: 'var(--cl-text-muted)',
              }}
            >
              <div>
                Showing {(page - 1) * pageSize + 1} to{' '}
                {Math.min(page * pageSize, filteredGames.length)} of {filteredGames.length} games
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={page <= 1}
                  onClick={() => setCurrentPage(Math.max(1, page - 1))}
                >
                  Previous
                </button>
                <span style={{ display: 'flex', alignItems: 'center', padding: '0 8px' }}>
                  Page {page} of {totalPages}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={page >= totalPages}
                  onClick={() => setCurrentPage(Math.min(totalPages, page + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
