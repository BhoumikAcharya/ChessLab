import React, { useState, useRef, useEffect } from 'react';
import { Upload, FileText, Globe, X, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { parsePgn } from '../../services/pgnParser';
import { saveGames, getSettings } from '../../services/storage';
import { importChesscomGames } from '../../services/chesscom';
import type { ImportProgress } from '../../types';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({ isOpen, onClose, onImportComplete }) => {
  const [activeTab, setActiveTab] = useState<'file' | 'text' | 'chesscom'>('file');
  const [pgnText, setPgnText] = useState('');
  const [chesscomUsername, setChesscomUsername] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [resultMessage, setResultMessage] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isOpen) {
      dialogRef.current?.focus();
      void getSettings().then(settings => setChesscomUsername(settings.chesscomUsername)).catch(error =>
        setResultMessage({ type: 'error', message: error instanceof Error ? error.message : 'Could not load settings.' }));
    }
    return () => abortControllerRef.current?.abort();
  }, [isOpen]);

  if (!isOpen) return null;
  const close = () => { abortControllerRef.current?.abort(); onClose(); };
  const parseWarnings = (errors: { gameIndex: number; message: string }[]) => errors.length
    ? ` ${errors.length} invalid records skipped: ${errors.slice(0, 3).map(e => `Game ${e.gameIndex + 1}: ${e.message}`).join(' ')}` : '';

  const handleFileUpload = async (file: File) => {

    setIsLoading(true);
    setResultMessage(null);

    try {
      const text = await file.text();
      const { games, errors } = parsePgn(text, 'pgn_file');

      if (games.length === 0) {
        setResultMessage({
          type: 'error',
          message: errors[0]?.message || 'No valid chess games could be found in this file.',
        });
        setIsLoading(false);
        return;
      }

      const { saved, duplicates } = await saveGames(games);
      setResultMessage({
        type: 'success',
        message: `Successfully imported ${saved} game${saved === 1 ? '' : 's'}.${duplicates > 0 ? ` (${duplicates} duplicates skipped)` : ''}${parseWarnings(errors)}`,
      });
      onImportComplete();
    } catch (err: unknown) {
      setResultMessage({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to read PGN file',
      });
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleTextImport = async () => {
    if (!pgnText.trim()) return;

    setIsLoading(true);
    setResultMessage(null);

    try {
      const { games, errors } = parsePgn(pgnText, 'pgn_text');

      if (games.length === 0) {
        setResultMessage({
          type: 'error',
          message: errors[0]?.message || 'No valid games recognized in pasted text.',
        });
        setIsLoading(false);
        return;
      }

      const { saved, duplicates } = await saveGames(games);
      setResultMessage({
        type: 'success',
        message: `Successfully imported ${saved} game${saved === 1 ? '' : 's'}.${duplicates > 0 ? ` (${duplicates} duplicates skipped)` : ''}${parseWarnings(errors)}`,
      });
      setPgnText('');
      onImportComplete();
    } catch (err: unknown) {
      setResultMessage({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to parse PGN text',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChesscomImport = async () => {
    const cleanUsername = chesscomUsername.trim();
    if (!cleanUsername) return;

    setIsLoading(true);
    setResultMessage(null);
    setProgress({
      username: cleanUsername,
      totalMonths: 0,
      completedMonths: 0,
      gamesFound: 0,
      gamesImported: 0,
      status: 'running',
    });

    abortControllerRef.current = new AbortController();

    try {
      const { games, warnings } = await importChesscomGames(
        cleanUsername,
        (p) => setProgress(p),
        abortControllerRef.current.signal,
        6 // Fetch up to 6 months of archives
      );

      if (games.length === 0) {
        setResultMessage({
          type: 'error',
          message: 'No completed games found for this user in recent archives.',
        });
        setIsLoading(false);
        return;
      }

      const { saved, duplicates } = await saveGames(games);
      setResultMessage({
        type: 'success',
        message: `Successfully fetched and imported ${saved} game${saved === 1 ? '' : 's'} from Chess.com.${duplicates > 0 ? ` (${duplicates} duplicates skipped)` : ''}${warnings.length ? ` Warnings: ${warnings.join(' ')}` : ''}`,
      });
      onImportComplete();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        setResultMessage({
          type: 'error',
          message: 'Import cancelled by user.',
        });
      } else {
        setResultMessage({
          type: 'error',
          message:
            err instanceof Error
              ? err.message
              : 'Failed to fetch games from Chess.com. Direct browser access may be blocked by CORS; if so, please import PGN files directly.',
        });
      }
    } finally {
      setIsLoading(false);
      setProgress(null);
      abortControllerRef.current = null;
    }
  };

  const cancelChesscomImport = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal-content" role="dialog" aria-modal="true" aria-labelledby="import-title" tabIndex={-1} ref={dialogRef}
        onKeyDown={e => {
          if (e.key === 'Escape') { close(); return; }
          if (e.key !== 'Tab') return;
          const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])].filter(el => el.offsetParent !== null);
          const first = controls[0], last = controls.at(-1);
          if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); last?.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
        }} onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <div className="modal-header">
          <h2 id="import-title" className="modal-title">Import Chess Games</h2>
          <button className="btn-ghost" onClick={close} aria-label="Close modal">
            <X size={18} />
          </button>
        </div>

        {/* Tab Buttons */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', borderBottom: '1px solid var(--cl-border)', paddingBottom: '12px' }}>
          <button
            className={`btn ${activeTab === 'file' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
            disabled={isLoading} onClick={() => { setActiveTab('file'); setResultMessage(null); }}
          >
            <Upload size={14} />
            PGN File
          </button>
          <button
            className={`btn ${activeTab === 'text' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
            disabled={isLoading} onClick={() => { setActiveTab('text'); setResultMessage(null); }}
          >
            <FileText size={14} />
            Paste PGN
          </button>
          <button
            className={`btn ${activeTab === 'chesscom' ? 'btn-primary' : 'btn-ghost'} btn-sm`}
            disabled={isLoading} onClick={() => { setActiveTab('chesscom'); setResultMessage(null); }}
          >
            <Globe size={14} />
            Chess.com
          </button>
        </div>

        {/* Status message */}
        {resultMessage && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 'var(--cl-radius-md)',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: 'var(--cl-text-sm)',
              background: resultMessage.type === 'success' ? 'var(--cl-success-bg)' : 'var(--cl-error-bg)',
              color: resultMessage.type === 'success' ? 'var(--cl-success)' : 'var(--cl-error)',
              border: `1px solid ${resultMessage.type === 'success' ? 'rgba(112, 184, 152, 0.3)' : 'rgba(215, 122, 122, 0.3)'}`,
            }}
          >
            {resultMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{resultMessage.message}</span>
          </div>
        )}

        {resultMessage?.type === 'success' && <button className="btn btn-primary btn-sm" onClick={close} style={{ marginBottom: 16 }}>Done</button>}
        {/* Tab 1: PGN File */}
        {activeTab === 'file' && (
          <div>
            <div
              style={{
                border: '2px dashed var(--cl-border)',
                borderRadius: 'var(--cl-radius-lg)',
                padding: '36px 20px',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'var(--cl-bg-input)',
                transition: 'border-color 0.2s',
              }}
              onClick={() => fileInputRef.current?.click()}
              role="button" tabIndex={0} aria-label="Choose PGN file"
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file && !isLoading) void handleFileUpload(file); }}
            >
              <Upload size={32} style={{ color: 'var(--cl-text-muted)', margin: '0 auto 12px' }} />
              <p style={{ fontWeight: 600, color: 'var(--cl-text-primary)', marginBottom: '4px' }}>
                Click or drag & drop to choose PGN file
              </p>
              <p style={{ fontSize: 'var(--cl-text-xs)', color: 'var(--cl-text-muted)' }}>
                Supports single-game or multi-game .pgn archives
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pgn,.txt"
                style={{ display: 'none' }}
                onChange={e => { const file = e.target.files?.[0]; if (file) void handleFileUpload(file); }}
                disabled={isLoading}
              />
            </div>
          </div>
        )}

        {/* Tab 2: Paste PGN */}
        {activeTab === 'text' && (
          <div>
            <textarea
              className="input-textarea"
              aria-label="Completed game PGN"
              placeholder="Paste raw PGN text here (single or multiple games)..."
              value={pgnText}
              onChange={(e) => setPgnText(e.target.value)}
              rows={8}
              disabled={isLoading}
              style={{ width: '100%', fontFamily: 'var(--cl-font-mono)', fontSize: 'var(--cl-text-xs)' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
              <button
                className="btn btn-primary"
                onClick={handleTextImport}
                disabled={isLoading || !pgnText.trim()}
              >
                {isLoading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
                Import Pasted Games
              </button>
            </div>
          </div>
        )}

        {/* Tab 3: Chess.com API */}
        {activeTab === 'chesscom' && (
          <div>
            <p style={{ fontSize: 'var(--cl-text-xs)', color: 'var(--cl-text-secondary)', marginBottom: '12px', lineHeight: 1.5 }}>
              Fetches completed game archives using Chess.com&apos;s public API. No login or password required.
            </p>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              <input
                type="text"
                className="input-text"
                placeholder="Chess.com Username"
                value={chesscomUsername}
                onChange={(e) => setChesscomUsername(e.target.value)}
                disabled={isLoading}
                onKeyDown={(e) => { if (e.key === 'Enter') handleChesscomImport(); }}
                style={{ flex: 1 }}
              />
              {isLoading ? (
                <button className="btn btn-danger btn-sm" onClick={cancelChesscomImport}>
                  Cancel
                </button>
              ) : (
                <button
                  className="btn btn-primary btn-sm"
                  onClick={handleChesscomImport}
                  disabled={!chesscomUsername.trim()}
                >
                  <Globe size={14} />
                  Fetch
                </button>
              )}
            </div>

            {progress && (
              <div style={{ marginTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--cl-text-xs)', color: 'var(--cl-text-muted)', marginBottom: '6px' }}>
                  <span>
                    {progress.totalMonths === 0
                      ? 'Fetching archives list...'
                      : `Fetching archive month ${progress.completedMonths} of ${progress.totalMonths} (${progress.gamesFound} games found)...`}
                  </span>
                  <span>{progress.totalMonths > 0 ? `${Math.round((progress.completedMonths / progress.totalMonths) * 100)}%` : ''}</span>
                </div>
                <div style={{ width: '100%', height: '4px', background: 'var(--cl-bg-elevated)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      background: 'var(--cl-accent)',
                      width: progress.totalMonths > 0 ? `${(progress.completedMonths / progress.totalMonths) * 100}%` : '0%',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
