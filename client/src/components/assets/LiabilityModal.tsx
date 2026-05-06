import { useState, type FormEvent } from 'react';
import type { Liability, LiabilityType, LiabilityWithLatest, AssetWithLatest } from '../../types';
import { ApiError } from '../../api/client';
import { createLiability, updateLiability } from '../../api/assets';

const LIABILITY_TYPES: { value: LiabilityType; label: string }[] = [
  { value: 'mortgage',     label: 'Mortgage' },
  { value: 'credit_card',  label: 'Credit Card' },
  { value: 'auto_loan',    label: 'Auto Loan' },
  { value: 'student_loan', label: 'Student Loan' },
  { value: 'other',        label: 'Other' },
];

interface Props {
  existing?: LiabilityWithLatest;
  assets: AssetWithLatest[];
  onSave: (liability: Liability) => void;
  onClose: () => void;
}

export function LiabilityModal({ existing, assets, onSave, onClose }: Props) {
  const [name, setName] = useState(existing?.name ?? '');
  const [type, setType] = useState<LiabilityType>(existing?.type ?? 'mortgage');
  const [rate, setRate] = useState(
    existing ? (parseFloat(existing.interest_rate) * 100).toFixed(3) : '',
  );
  const [linkedAssetId, setLinkedAssetId] = useState(existing?.linked_asset_id ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');

  // Loan origination fields
  const [originationDate, setOriginationDate] = useState(existing?.origination_date ?? '');
  const [originalBalance, setOriginalBalance] = useState(
    existing?.original_balance ? parseFloat(existing.original_balance).toFixed(2) : '',
  );
  const [termYears, setTermYears] = useState(
    existing?.term_months ? String(existing.term_months / 12) : '',
  );

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Derive term_months: accept either whole years or exact months
  function parseTermMonths(): number | null {
    if (!termYears) return null;
    const y = parseFloat(termYears);
    if (isNaN(y) || y <= 0) return null;
    return Math.round(y * 12);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const term_months = parseTermMonths();
      const body = {
        name,
        type,
        interest_rate: parseFloat(rate) / 100,
        linked_asset_id: linkedAssetId || null,
        notes: notes || null,
        origination_date: originationDate || null,
        original_balance: originalBalance ? parseFloat(originalBalance) : null,
        term_months,
      };
      const liability = existing
        ? await updateLiability(existing.id, body)
        : await createLiability(body);
      onSave(liability);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Save failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
        <h3 className="dialog-title">{existing ? 'Edit Liability' : 'Add Liability'}</h3>
        {error && <div className="field-error">{error}</div>}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <label>Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={100} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="field">
              <label>Type</label>
              <select value={type} onChange={(e) => setType(e.target.value as LiabilityType)}>
                {LIABILITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Interest Rate (%)</label>
              <input
                type="number" step="0.001" min="0" max="100"
                value={rate} onChange={(e) => setRate(e.target.value)}
                placeholder="e.g. 2.875"
                required
              />
            </div>
          </div>

          {/* Loan origination section */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div style={{ fontSize: '0.78rem', color: 'var(--fg-muted)', marginBottom: 8, fontWeight: 600 }}>
              Loan Details <span style={{ fontWeight: 400, color: 'var(--fg-subtle)' }}>(optional — enables amortization math)</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div className="field">
                <label>Origination Date</label>
                <input type="date" value={originationDate} onChange={(e) => setOriginationDate(e.target.value)} />
              </div>
              <div className="field">
                <label>Original Balance</label>
                <input
                  type="number" min="0" step="0.01"
                  placeholder="e.g. 400000"
                  value={originalBalance}
                  onChange={(e) => setOriginalBalance(e.target.value)}
                />
              </div>
              <div className="field">
                <label>Term (years)</label>
                <input
                  type="number" min="0.5" step="0.5"
                  placeholder="e.g. 30"
                  value={termYears}
                  onChange={(e) => setTermYears(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="field">
            <label>Linked Asset <span style={{ color: 'var(--fg-subtle)', fontWeight: 400 }}>(optional)</span></label>
            <select value={linkedAssetId} onChange={(e) => setLinkedAssetId(e.target.value)}>
              <option value="">— none —</option>
              {assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
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
