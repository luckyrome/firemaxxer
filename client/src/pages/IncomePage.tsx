import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getIncome, createIncomeSource, updateIncomeSource, deleteIncomeSource } from '../api/income';
import type { IncomeSource, IncomeFrequency } from '../types';

const FREQ_LABELS: Record<IncomeFrequency, string> = {
  weekly: 'Weekly', bi_weekly: 'Bi-Weekly', semi_monthly: 'Semi-Monthly',
  monthly: 'Monthly', quarterly: 'Quarterly', semi_annually: 'Semi-Annually', annually: 'Annually',
};

const FREQS = Object.keys(FREQ_LABELS) as IncomeFrequency[];

function fmtMoney(v: number) {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface SourceForm {
  name: string; amount: string; frequency: IncomeFrequency;
  taxable: boolean; active: boolean; notes: string;
}

const EMPTY: SourceForm = {
  name: '', amount: '', frequency: 'monthly', taxable: true, active: true, notes: '',
};

function IncomeModal({
  existing, onClose, onSave,
}: { existing?: IncomeSource; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState<SourceForm>(
    existing
      ? { name: existing.name, amount: existing.amount, frequency: existing.frequency,
          taxable: existing.taxable, active: existing.active, notes: existing.notes ?? '' }
      : EMPTY,
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount < 0) { setError('Amount must be a valid number'); return; }
    setSaving(true);
    try {
      const payload = { name: form.name, amount, frequency: form.frequency,
        taxable: form.taxable, active: form.active, notes: form.notes || null };
      if (existing) await updateIncomeSource(existing.id, payload);
      else await createIncomeSource(payload);
      onSave();
    } catch (err: any) {
      setError(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" style={{ width: 460 }} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">{existing ? 'Edit Income Source' : 'Add Income Source'}</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div className="field-error">{error}</div>}
          <div className="form-grid">
            <label className="field field-full">
              Name
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </label>
            <label className="field">
              Amount
              <input type="number" min="0" step="0.01" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
            </label>
            <label className="field">
              Frequency
              <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value as IncomeFrequency }))}>
                {FREQS.map(f => <option key={f} value={f}>{FREQ_LABELS[f]}</option>)}
              </select>
            </label>
            <label className="field">
              Taxable
              <select value={form.taxable ? '1' : '0'} onChange={e => setForm(f => ({ ...f, taxable: e.target.value === '1' }))}>
                <option value="1">Yes</option>
                <option value="0">No</option>
              </select>
            </label>
            <label className="field">
              Status
              <select value={form.active ? '1' : '0'} onChange={e => setForm(f => ({ ...f, active: e.target.value === '1' }))}>
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </label>
            <label className="field field-full">
              Notes
              <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </label>
          </div>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function IncomePage() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<'new' | IncomeSource | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ['income'], queryFn: getIncome });

  const deleteMutation = useMutation({
    mutationFn: deleteIncomeSource,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['income'] }),
  });

  function handleSaved() {
    qc.invalidateQueries({ queryKey: ['income'] });
    setModal(null);
  }

  const sources = data?.sources ?? [];

  return (
    <div className="page">
      <div className="page-header">
        <h1>Income</h1>
        <button className="btn btn-primary" onClick={() => setModal('new')}>+ Add Source</button>
      </div>

      <div className="summary-cards">
        <div className="summary-card">
          <div className="summary-card-label">Monthly (Active)</div>
          <div className="summary-card-value green">{fmtMoney(data?.monthlyTotal ?? 0)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-card-label">Annual (Active)</div>
          <div className="summary-card-value green">{fmtMoney(data?.annualTotal ?? 0)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-card-label">Taxable Annual</div>
          <div className="summary-card-value">{fmtMoney(data?.taxableAnnual ?? 0)}</div>
        </div>
      </div>

      <div className="section-card">
        <div className="section-header"><h2>Sources</h2></div>
        {isLoading ? <p className="muted">Loading…</p> : sources.length === 0 ? (
          <div className="empty-state"><p>No income sources yet.</p></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th><th>Frequency</th><th>Amount</th><th>Monthly</th><th>Annual</th><th>Taxable</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {sources.map(s => (
                <tr key={s.id} style={{ opacity: s.active ? 1 : 0.5 }}>
                  <td>{s.name}</td>
                  <td><span className="type-badge">{FREQ_LABELS[s.frequency]}</span></td>
                  <td className="num">{fmtMoney(parseFloat(s.amount))}</td>
                  <td className="num">{fmtMoney(s.monthly_equiv)}</td>
                  <td className="num">{fmtMoney(s.annual_equiv)}</td>
                  <td>{s.taxable ? <span className="tag blue">Taxable</span> : <span className="tag">Non-taxable</span>}</td>
                  <td>{s.active ? <span className="tag green">Active</span> : <span className="tag">Inactive</span>}</td>
                  <td className="actions-cell">
                    <button className="btn" style={{ fontSize: '0.75rem', padding: '3px 10px' }} onClick={() => setModal(s)}>Edit</button>
                    <button className="btn btn-danger" style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                      onClick={() => { if (confirm(`Delete "${s.name}"?`)) deleteMutation.mutate(s.id); }}>Del</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <IncomeModal
          existing={modal === 'new' ? undefined : modal}
          onClose={() => setModal(null)}
          onSave={handleSaved}
        />
      )}
    </div>
  );
}
