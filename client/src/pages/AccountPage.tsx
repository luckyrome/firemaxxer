import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { apiFetch } from '../api/client';
import { deleteAccount } from '../api/auth';
import { PageHelp } from '../components/HelpDialog';

async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await apiFetch('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

async function downloadExcel(): Promise<void> {
  const res = await fetch('/api/export/excel', { credentials: 'include' });
  if (!res.ok) throw new Error('Export failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `firemaxxer-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AccountPage() {
  const { account, logout } = useAuth();
  const { addToast } = useToast();

  // Change password
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  // Export
  const [exporting, setExporting] = useState(false);

  // Delete account
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      await downloadExcel();
      addToast('Export downloaded', 'success');
    } catch {
      addToast('Export failed', 'error');
    } finally {
      setExporting(false);
    }
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (next !== confirm) { addToast('New passwords do not match', 'error'); return; }
    if (next.length < 8) { addToast('New password must be at least 8 characters', 'error'); return; }
    setPwSaving(true);
    try {
      await changePassword(current, next);
      addToast('Password updated', 'success');
      setCurrent(''); setNext(''); setConfirm('');
    } catch (err: any) {
      addToast(err.message ?? 'Failed to change password', 'error');
    } finally {
      setPwSaving(false);
    }
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    setDeleting(true);
    try {
      await deleteAccount(deletePassword);
      await logout();
    } catch (err: any) {
      addToast(err.message ?? 'Failed to delete account', 'error');
      setDeleting(false);
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h1>Account</h1>
          <PageHelp page="account" />
        </div>
      </div>

      {/* Account info */}
      <div className="section-card">
        <div className="section-header"><h2>Account Info</h2></div>
        <div className="stat-row">
          <span className="stat-label">Email</span>
          <span className="stat-value">{account?.email}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Verified</span>
          <span className="stat-value">{account?.verified ? 'Yes' : 'No'}</span>
        </div>
      </div>

      {/* Change password */}
      <div className="section-card">
        <div className="section-header"><h2>Change Password</h2></div>
        <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360 }}>
          <label className="field">
            Current Password
            <input
              type="password" value={current}
              onChange={e => setCurrent(e.target.value)}
              autoComplete="current-password" required
            />
          </label>
          <label className="field">
            New Password
            <input
              type="password" value={next}
              onChange={e => setNext(e.target.value)}
              autoComplete="new-password" required minLength={8}
            />
          </label>
          <label className="field">
            Confirm New Password
            <input
              type="password" value={confirm}
              onChange={e => setConfirm(e.target.value)}
              autoComplete="new-password" required
            />
          </label>
          <div>
            <button type="submit" className="btn btn-primary" disabled={pwSaving}>
              {pwSaving ? 'Saving…' : 'Update Password'}
            </button>
          </div>
        </form>
      </div>

      {/* Export */}
      <div className="section-card">
        <div className="section-header"><h2>Export Data</h2></div>
        <p className="muted" style={{ marginBottom: 12 }}>
          Download all your data as a formatted Excel workbook — net worth, income, expenses, tax brackets, FIRE settings, and refi scenarios.
        </p>
        <button
          className="btn btn-primary"
          onClick={handleExport}
          disabled={exporting}
        >
          {exporting ? 'Generating…' : 'Download Excel (.xlsx)'}
        </button>
      </div>

      {/* Danger zone */}
      <div className="section-card" style={{ borderColor: 'var(--red-border)' }}>
        <div className="section-header"><h2 style={{ color: 'var(--red)' }}>Danger Zone</h2></div>
        {!deleteConfirm ? (
          <div>
            <p className="muted" style={{ marginBottom: 12 }}>
              Permanently delete your account and all data. This cannot be undone.
            </p>
            <button
              className="btn btn-danger"
              onClick={() => setDeleteConfirm(true)}
            >
              Delete Account
            </button>
          </div>
        ) : (
          <form onSubmit={handleDeleteAccount} style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 360 }}>
            <p style={{ fontSize: '0.83rem', color: 'var(--red-text)', background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 6, padding: '8px 12px' }}>
              This will permanently delete your account and all associated data.
            </p>
            <label className="field">
              Enter your password to confirm
              <input
                type="password" value={deletePassword}
                onChange={e => setDeletePassword(e.target.value)}
                autoComplete="current-password" required
              />
            </label>
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" className="btn" onClick={() => { setDeleteConfirm(false); setDeletePassword(''); }}>
                Cancel
              </button>
              <button type="submit" className="btn btn-danger" disabled={deleting || !deletePassword}>
                {deleting ? 'Deleting…' : 'Permanently Delete'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
