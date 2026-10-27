import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Save, Download, Upload, Trash2, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';
import {
  getSettings,
  saveSettings,
  exportBackup,
  importBackup,
  clearAllData,
  getGameCounts,
} from '../../services/storage';
import { Dialog } from '../common/Dialog';
import { downloadFile } from '../../services/download';
import type { AppSettings } from '../../types';

export const SettingsView: React.FC = () => {
  const [settings, setSettings] = useState<AppSettings>({
    analysisDepth: 18,
    multiPv: 3,
    chesscomUsername: '',
    boardFlipped: false,
  });

  const [stats, setStats] = useState<{ total: number; analyzed: number }>({ total: 0, analyzed: 0 });
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const operationRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const [preferences, counts] = await Promise.all([getSettings(), getGameCounts()]);
      setSettings(preferences);
      setStats({ total: counts.total, analyzed: counts.analyzed });
      setErrorMessage(null);
    } catch (error) { setErrorMessage(error instanceof Error ? error.message : 'Could not load storage.'); }
    finally { setIsLoading(false); }
  }, []);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Synchronize with asynchronous browser storage.
    void load();
  }, [load]);

  const perform = async (label: string, work: () => Promise<void>) => {
    if (operationRef.current) return;
    operationRef.current = true;
    setBusy(label);
    setMessage(null);
    setErrorMessage(null);
    setSaveSuccess(false);
    try { await work(); }
    catch (error) { setErrorMessage(error instanceof Error ? error.message : 'The operation failed. Please retry.'); }
    finally { operationRef.current = false; setBusy(null); }
  };

  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    void perform('Saving preferences…', async () => {
      await saveSettings(settings);
      setSaveSuccess(true);
    });
  };

  const handleExport = () => perform('Preparing backup…', async () => {
    const backup = await exportBackup();
    downloadFile(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }),
      `chesslab-backup-${new Date().toISOString().slice(0, 10)}.json`);
    setMessage('Backup download started. Keep the JSON file somewhere safe.');
  });

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void perform('Restoring backup…', async () => {
      let json: unknown;
      try { json = JSON.parse(await file.text()); }
      catch { throw new Error('This file is not valid JSON. Choose a ChessLab JSON backup.'); }
      const result = await importBackup(json as Parameters<typeof importBackup>[0]);
      const counts = await getGameCounts();
      setStats({ total: counts.total, analyzed: counts.analyzed });
      if (result.settingsRestored) setSettings(await getSettings());
      setMessage(`Restored ${result.games} games and ${result.analyses} reviews. Skipped ${result.skipped} incompatible or existing reviews. Existing games were preserved. ${result.settingsRestored ? 'Backup preferences were restored.' : 'Existing preferences were preserved.'}`);
    }).finally(() => { if (fileInputRef.current) fileInputRef.current.value = ''; });
  };

  const handleClearAll = () => perform('Clearing local data…', async () => {
    await clearAllData();
    setShowClearConfirm(false);
    setStats({ total: 0, analyzed: 0 });
    setSettings(await getSettings());
    setMessage('All local games, analyses, and preferences were cleared.');
  });

  return (
    <div style={{ padding: 'var(--cl-space-6)', maxWidth: 800, margin: '0 auto' }}>
      <div className="page-header" style={{ marginBottom: 'var(--cl-space-6)' }}>
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Configure Stockfish engine parameters and manage browser storage</p>
        </div>
      </div>

      {errorMessage && !showClearConfirm && <div role="alert" className="notice-error">{errorMessage}</div>}
      {busy && <p role="status">{busy}</p>}
      {isLoading && <p role="status">Loading preferences and storage…</p>}
      {message && <p role="status">{message}</p>}
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--cl-space-5)' }}>
        <fieldset disabled={busy !== null || isLoading} className="settings-fields">
        {/* Engine Settings Card */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>
            Stockfish Engine Configuration
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 'var(--cl-text-sm)', color: 'var(--cl-text-primary)', fontWeight: 500 }}>
                  Analysis Depth
                </label>
                <span style={{ fontSize: 'var(--cl-text-sm)', color: 'var(--cl-accent)', fontWeight: 600 }}>
                  {settings.analysisDepth} plies
                </span>
              </div>
              <input
                type="range"
                aria-label="Analysis depth"
                min={10}
                max={24}
                value={settings.analysisDepth}
                onChange={(e) => setSettings({ ...settings, analysisDepth: parseInt(e.target.value, 10) })}
                style={{ width: '100%', accentColor: 'var(--cl-accent)' }}
              />
              <div style={{ fontSize: 'var(--cl-text-xs)', color: 'var(--cl-text-muted)', marginTop: 4 }}>
                Higher depths yield deeper tactical evaluations but take longer per move. Recommended: 16–18.
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 'var(--cl-text-sm)', color: 'var(--cl-text-primary)', fontWeight: 500 }}>
                  MultiPV (Candidate Lines)
                </label>
                <span style={{ fontSize: 'var(--cl-text-sm)', color: 'var(--cl-accent)', fontWeight: 600 }}>
                  {settings.multiPv} lines
                </span>
              </div>
              <input
                type="range"
                aria-label="Candidate lines"
                min={1}
                max={5}
                value={settings.multiPv}
                onChange={(e) => setSettings({ ...settings, multiPv: parseInt(e.target.value, 10) })}
                style={{ width: '100%', accentColor: 'var(--cl-accent)' }}
              />
              <div style={{ fontSize: 'var(--cl-text-xs)', color: 'var(--cl-text-muted)', marginTop: 4 }}>
                Number of top alternative moves calculated per analyzed position.
              </div>
            </div>
          </div>
        </div>

        {/* Preferences Card */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 16 }}>
            Preferences & Accounts
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 'var(--cl-text-sm)', color: 'var(--cl-text-primary)', marginBottom: 6 }}>
                Default Chess.com Username
              </label>
              <input
                type="text"
                className="input-text"
                aria-label="Default Chess.com username"
                placeholder="e.g. magnuscarlsen"
                value={settings.chesscomUsername}
                onChange={(e) => setSettings({ ...settings, chesscomUsername: e.target.value })}
                style={{ maxWidth: 360 }}
              />
            </div>

            <div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.boardFlipped}
                  onChange={(e) => setSettings({ ...settings, boardFlipped: e.target.checked })}
                  style={{ accentColor: 'var(--cl-accent)', width: 16, height: 16 }}
                />
                <span style={{ fontSize: 'var(--cl-text-sm)', color: 'var(--cl-text-primary)' }}>
                  Default board orientation to Black on bottom
                </span>
              </label>
            </div>
          </div>

          <div style={{ marginTop: 20 }}>
            <button type="submit" className="btn btn-primary">
              <Save size={14} />
              Save Preferences
            </button>
            {saveSuccess && (
              <span style={{ marginLeft: 12, fontSize: 'var(--cl-text-sm)', color: 'var(--cl-success)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle2 size={14} /> Settings saved!
              </span>
            )}
          </div>
        </div>

        {/* Local Storage & Backup Card */}
        <div className="card">
          <div className="card-title" style={{ marginBottom: 12 }}>
            Local Storage & Data Portability
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 'var(--cl-text-sm)', color: 'var(--cl-text-secondary)' }}>
            <ShieldCheck size={18} style={{ color: 'var(--cl-accent)' }} />
            <span>
              Data stays in this browser and is not synced across devices. Clearing browser data removes it; export a backup regularly.
            </span>
          </div>

          <div style={{ background: 'var(--cl-bg-input)', padding: '12px 16px', borderRadius: 'var(--cl-radius-md)', marginBottom: 16 }}>
            <div style={{ fontSize: 'var(--cl-text-xs)', color: 'var(--cl-text-muted)' }}>Storage Breakdown</div>
            <div style={{ fontSize: 'var(--cl-text-sm)', color: 'var(--cl-text-primary)', marginTop: 4 }}>
              <strong>{stats.total}</strong> games stored ({stats.analyzed} analyzed with Stockfish)
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleExport}>
              <Download size={14} />
              Export JSON Backup
            </button>

            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileInputRef.current?.click()}>
              <Upload size={14} />
              Restore Backup
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              style={{ display: 'none' }}
              onChange={handleImportFile}
            />

            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => setShowClearConfirm(true)}
              style={{ marginLeft: 'auto' }}
            >
              <Trash2 size={14} />
              Clear All Data
            </button>
          </div>
          <p style={{ marginTop: 16, fontSize: 12 }}><a href="./THIRD_PARTY_NOTICES.txt" target="_blank" rel="noreferrer">Third-party notices</a> · <a href="./stockfish/COPYING.txt" target="_blank" rel="noreferrer">Stockfish GPLv3 license</a> · <a href="./stockfish/source/stockfish-16.0.0-source.tgz" download>Stockfish source archive</a> · <a href="./stockfish/source/README.txt" target="_blank" rel="noreferrer">Engine build instructions</a></p>
        </div>
        </fieldset>
      </form>

      {/* Confirmation Modal */}
      {showClearConfirm && (
        <Dialog titleId="clear-title" descriptionId="clear-description" onClose={() => { if (!operationRef.current) setShowClearConfirm(false); }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--cl-error)' }}>
                <AlertTriangle size={20} />
                <h3 id="clear-title" className="modal-title" style={{ color: 'var(--cl-error)' }}>Clear All Local Data</h3>
              </div>
            </div>
            <p id="clear-description" style={{ fontSize: 'var(--cl-text-sm)', color: 'var(--cl-text-secondary)', marginBottom: 20, lineHeight: 1.5 }}>
              This will permanently delete all {stats.total} games, analyses, and saved settings from your browser&apos;s IndexedDB.
              This action cannot be undone. Are you sure?
            </p>
            {errorMessage && <div role="alert" className="notice-error">{errorMessage}</div>}
            {busy && <p role="status">{busy}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-ghost" disabled={busy !== null} onClick={() => setShowClearConfirm(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" disabled={busy !== null} onClick={handleClearAll}>
                Yes, Delete Everything
              </button>
            </div>
        </Dialog>
      )}
    </div>
  );
};
