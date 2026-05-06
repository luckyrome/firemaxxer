import { useState, type FormEvent } from 'react';
import type { Asset, AssetType, AssetWithLatest } from '../../types';
import { ApiError } from '../../api/client';
import { createAsset, updateAsset } from '../../api/assets';

const ASSET_TYPES: { value: AssetType; label: string }[] = [
  { value: 'brokerage',   label: 'Brokerage' },
  { value: '401k',        label: '401(k)' },
  { value: 'roth_ira',    label: 'Roth IRA' },
  { value: 'real_estate', label: 'Real Estate' },
  { value: 'cash',        label: 'Cash / Savings' },
  { value: 'other',       label: 'Other' },
];

interface Props {
  existing?: AssetWithLatest;
  onSave: (asset: Asset) => void;
  onClose: () => void;
}

export function AssetModal({ existing, onSave, onClose }: Props) {
  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<AssetType>(existing?.type ?? 'brokerage');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const body = { name, type, notes: notes || null };
      const asset = existing
        ? await updateAsset(existing.id, body)
        : await createAsset(body);
      onSave(asset);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h3 className="dialog-title">{existing ? 'Edit Asset' : 'Add Asset'}</h3>
        {error && <div className="field-error">{error}</div>}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
          </div>
          <div className="field">
            <label>Type</label>
            <select value={type} onChange={(e) => setType(e.target.value as AssetType)}>
              {ASSET_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Notes <span style={{ color: 'var(--fg-subtle)', fontWeight: 400 }}>(optional)</span></label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
          </div>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
