import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SettingsView } from '../components/settings/SettingsView';
import { DEFAULT_SETTINGS } from '../types';

const storage = vi.hoisted(() => ({ getSettings: vi.fn(), getGameCounts: vi.fn(), saveSettings: vi.fn(),
  exportBackup: vi.fn(), importBackup: vi.fn(), clearAllData: vi.fn() }));
vi.mock('../services/storage', () => storage);
const download = vi.hoisted(() => vi.fn());
vi.mock('../services/download', () => ({ downloadFile: download }));

beforeEach(() => {
  storage.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS });
  storage.getGameCounts.mockResolvedValue({ total: 5, analyzed: 4 });
  storage.saveSettings.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.resetAllMocks(); });
async function open() {
  const view = render(<SettingsView />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save Preferences' }).matches(':disabled')).toBe(false));
  return view;
}
function upload(view: ReturnType<typeof render>, text: string) {
  const input = view.container.querySelector('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [{ text: async () => text }] } });
}

describe('Settings recovery and operation safety', () => {
  it('blocks repeated exports and conflicting controls while a backup is being prepared', async () => {
    let finish!: (value: unknown) => void;
    storage.exportBackup.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    await open();
    const button = screen.getByRole('button', { name: 'Export JSON Backup' });
    fireEvent.click(button); fireEvent.click(button);
    expect(storage.exportBackup).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Restore Backup' }).matches(':disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Clear All Data' }).matches(':disabled')).toBe(true);
    finish({ games: [], analyses: [] });
    await screen.findByText(/Backup download started/);
    expect(button.matches(':disabled')).toBe(false);
    expect(download).toHaveBeenCalledTimes(1);
  });
  it('shows invalid JSON errors and permits a subsequent successful restore', async () => {
    const view = await open();
    upload(view, '{broken');
    expect((await screen.findByRole('alert')).textContent).toContain('not valid JSON');
    expect(storage.importBackup).not.toHaveBeenCalled();
    storage.importBackup.mockResolvedValue({ games: 1, analyses: 1, skipped: 0, settingsRestored: false });
    upload(view, '{"version":1}');
    await screen.findByText(/Restored 1 games and 1 reviews/);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Restore Backup' }).matches(':disabled')).toBe(false);
  });
  it('displays restored preferences after a fresh-browser restore', async () => {
    const view = await open();
    storage.importBackup.mockResolvedValue({ games: 1, analyses: 1, skipped: 0, settingsRestored: true });
    storage.getSettings.mockResolvedValue({ ...DEFAULT_SETTINGS, analysisDepth: 14, multiPv: 2, chesscomUsername: 'restored-player' });
    upload(view, '{"version":1}');
    await screen.findByText(/Backup preferences were restored/);
    expect((screen.getByRole('slider', { name: 'Analysis depth' }) as HTMLInputElement).value).toBe('14');
    expect((screen.getByRole('textbox', { name: 'Default Chess.com username' }) as HTMLInputElement).value).toBe('restored-player');
  });
  it('closes the clear dialog with Escape and restores focus without deleting data', async () => {
    await open();
    const button = screen.getByRole('button', { name: 'Clear All Data' });
    button.focus(); fireEvent.click(button);
    const dialog = screen.getByRole('alertdialog');
    expect(document.activeElement).toBe(dialog);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(button);
    expect(storage.clearAllData).not.toHaveBeenCalled();
  });
  it('keeps clear failures visible inside the confirmation dialog and enables retry', async () => {
    storage.clearAllData.mockRejectedValue(new Error('Browser storage is unavailable.'));
    await open(); fireEvent.click(screen.getByRole('button', { name: 'Clear All Data' }));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, Delete Everything' }));
    const alert = await screen.findByRole('alert');
    expect(alert.closest('[role="alertdialog"]')).not.toBeNull();
    expect(alert.textContent).toContain('unavailable');
    expect(screen.getByRole('button', { name: 'Yes, Delete Everything' }).matches(':disabled')).toBe(false);
  });
});
