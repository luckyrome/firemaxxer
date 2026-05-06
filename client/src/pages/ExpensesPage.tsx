import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getExpenseSnapshots, createExpenseSnapshot, updateExpenseSnapshot,
  deleteExpenseSnapshot, cloneExpenseSnapshot, getExpenseItems,
  createExpenseItem, updateExpenseItem, deleteExpenseItem,
} from '../api/expenses';
import type { ExpenseSnapshot, ExpenseItem, ExpenseFrequency } from '../types';

const FREQ_LABELS: Record<ExpenseFrequency, string> = {
  weekly: 'Weekly', bi_weekly: 'Bi-Weekly', monthly: 'Monthly',
  quarterly: 'Quarterly', semi_annually: 'Semi-Annually', annually: 'Annually',
};
const FREQS = Object.keys(FREQ_LABELS) as ExpenseFrequency[];

function fmtMoney(v: number) {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Snapshot modal ────────────────────────────────────────────────────────────

function SnapshotModal({
  existing, onClose, onSave,
}: { existing?: ExpenseSnapshot; onClose: () => void; onSave: () => void }) {
  const [label, setLabel] = useState(existing?.label ?? '');
  const [date, setDate] = useState(existing?.effective_date ?? new Date().toISOString().slice(0, 10));
  const [isRetired, setIsRetired] = useState(existing?.is_retirement_plan ?? false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (existing) await updateExpenseSnapshot(existing.id, { label, effective_date: date, is_retirement_plan: isRetired });
      else await createExpenseSnapshot({ label, effective_date: date, is_retirement_plan: isRetired });
      onSave();
    } catch (err: any) {
      setError(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">{existing ? 'Edit Snapshot' : 'New Expense Snapshot'}</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div className="field-error">{error}</div>}
          <label className="field">Label <input value={label} onChange={e => setLabel(e.target.value)} required /></label>
          <label className="field">Effective Date <input type="date" value={date} onChange={e => setDate(e.target.value)} required /></label>
          <label className="field">
            Type
            <select value={isRetired ? '1' : '0'} onChange={e => setIsRetired(e.target.value === '1')}>
              <option value="0">Active (working)</option>
              <option value="1">Retirement plan</option>
            </select>
          </label>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Item modal ────────────────────────────────────────────────────────────────

interface ItemForm {
  name: string; owner: string; vertical: string; category: string;
  critical: boolean; amount: string; frequency: ExpenseFrequency;
}

const EMPTY_ITEM: ItemForm = {
  name: '', owner: '', vertical: '', category: 'General',
  critical: false, amount: '', frequency: 'monthly',
};

function ItemModal({
  snapshotId, existing, onClose, onSave,
}: { snapshotId: string; existing?: ExpenseItem; onClose: () => void; onSave: () => void }) {
  const [form, setForm] = useState<ItemForm>(
    existing
      ? { name: existing.name, owner: existing.owner ?? '', vertical: existing.vertical ?? '',
          category: existing.category, critical: existing.critical,
          amount: existing.amount, frequency: existing.frequency }
      : EMPTY_ITEM,
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseFloat(form.amount);
    if (isNaN(amount) || amount < 0) { setError('Amount must be valid'); return; }
    setSaving(true);
    try {
      const payload = {
        name: form.name, owner: form.owner || null, vertical: form.vertical || null,
        category: form.category, critical: form.critical, amount, frequency: form.frequency,
      };
      if (existing) await updateExpenseItem(existing.id, payload);
      else await createExpenseItem(snapshotId, payload);
      onSave();
    } catch (err: any) {
      setError(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="dialog-title">{existing ? 'Edit Expense' : 'Add Expense'}</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div className="field-error">{error}</div>}
          <div className="form-grid">
            <label className="field field-full">Name
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
            </label>
            <label className="field">Category
              <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} required />
            </label>
            <label className="field">Owner
              <input value={form.owner} onChange={e => setForm(f => ({ ...f, owner: e.target.value }))} placeholder="optional" />
            </label>
            <label className="field">Vertical
              <input value={form.vertical} onChange={e => setForm(f => ({ ...f, vertical: e.target.value }))} placeholder="optional" />
            </label>
            <label className="field">Amount
              <input type="number" min="0" step="0.01" value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} required />
            </label>
            <label className="field">Frequency
              <select value={form.frequency} onChange={e => setForm(f => ({ ...f, frequency: e.target.value as ExpenseFrequency }))}>
                {FREQS.map(f => <option key={f} value={f}>{FREQ_LABELS[f]}</option>)}
              </select>
            </label>
            <label className="field">Critical
              <select value={form.critical ? '1' : '0'} onChange={e => setForm(f => ({ ...f, critical: e.target.value === '1' }))}>
                <option value="0">No</option>
                <option value="1">Yes</option>
              </select>
            </label>
          </div>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Snapshot detail ────────────────────────────────────────────────────────────

function SnapshotDetail({ snapshot }: { snapshot: ExpenseSnapshot }) {
  const qc = useQueryClient();
  const [itemModal, setItemModal] = useState<'new' | ExpenseItem | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['expense-items', snapshot.id],
    queryFn: () => getExpenseItems(snapshot.id),
  });

  const deleteMut = useMutation({
    mutationFn: deleteExpenseItem,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expense-items', snapshot.id] }),
  });

  function handleItemSaved() {
    qc.invalidateQueries({ queryKey: ['expense-items', snapshot.id] });
    setItemModal(null);
  }

  const items = data?.items ?? [];

  return (
    <div>
      {data && (
        <div className="summary-cards" style={{ marginBottom: 16 }}>
          <div className="summary-card">
            <div className="summary-card-label">Monthly Total</div>
            <div className="summary-card-value">{fmtMoney(data.totalMonthly)}</div>
          </div>
          <div className="summary-card">
            <div className="summary-card-label">Annual Total</div>
            <div className="summary-card-value">{fmtMoney(data.totalAnnual)}</div>
          </div>
          <div className="summary-card">
            <div className="summary-card-label">Critical / Month</div>
            <div className="summary-card-value red">{fmtMoney(data.criticalMonthly)}</div>
          </div>
        </div>
      )}

      <div className="section-header">
        <h2>Items</h2>
        <button className="btn btn-primary" onClick={() => setItemModal('new')}>+ Add Item</button>
      </div>

      {isLoading ? <p className="muted">Loading…</p> : items.length === 0 ? (
        <div className="empty-state"><p>No items yet.</p></div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th><th>Category</th><th>Owner</th><th>Freq</th>
              <th>Amount</th><th>Monthly</th><th>Critical</th><th></th>
            </tr>
          </thead>
          <tbody>
            {items.map(i => (
              <tr key={i.id}>
                <td>{i.name}</td>
                <td><span className="type-badge">{i.category}</span></td>
                <td className="muted">{i.owner ?? '—'}</td>
                <td><span className="type-badge">{FREQ_LABELS[i.frequency]}</span></td>
                <td className="num">{fmtMoney(parseFloat(i.amount))}</td>
                <td className="num">{fmtMoney(i.monthly_cost)}</td>
                <td>{i.critical ? <span className="tag red">Critical</span> : null}</td>
                <td className="actions-cell">
                  <button className="btn" style={{ fontSize: '0.75rem', padding: '3px 10px' }} onClick={() => setItemModal(i)}>Edit</button>
                  <button className="btn btn-danger" style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                    onClick={() => { if (confirm(`Delete "${i.name}"?`)) deleteMut.mutate(i.id); }}>Del</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {itemModal && (
        <ItemModal
          snapshotId={snapshot.id}
          existing={itemModal === 'new' ? undefined : itemModal}
          onClose={() => setItemModal(null)}
          onSave={handleItemSaved}
        />
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function ExpensesPage() {
  const qc = useQueryClient();
  const [snapModal, setSnapModal] = useState<'new' | ExpenseSnapshot | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const { data: snapshots = [], isLoading } = useQuery({
    queryKey: ['expense-snapshots'],
    queryFn: getExpenseSnapshots,
  });

  const deleteMut = useMutation({
    mutationFn: deleteExpenseSnapshot,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['expense-snapshots'] });
      if (selected === id) setSelected(null);
    },
  });

  const cloneMut = useMutation({
    mutationFn: ({ id, label, date }: { id: string; label: string; date: string }) =>
      cloneExpenseSnapshot(id, { label, effective_date: date }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['expense-snapshots'] }),
  });

  function handleSnapSaved() {
    qc.invalidateQueries({ queryKey: ['expense-snapshots'] });
    setSnapModal(null);
  }

  const activeSnap = snapshots.find(s => s.id === selected);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Expenses</h1>
        <button className="btn btn-primary" onClick={() => setSnapModal('new')}>+ New Snapshot</button>
      </div>

      {isLoading ? <p className="muted">Loading…</p> : snapshots.length === 0 ? (
        <div className="empty-state"><p>No expense snapshots yet. Create one to start tracking.</p></div>
      ) : (
        <>
          <div className="section-card">
            <div className="section-header"><h2>Snapshots</h2></div>
            <table className="data-table">
              <thead>
                <tr><th>Label</th><th>Effective Date</th><th>Type</th><th></th></tr>
              </thead>
              <tbody>
                {snapshots.map(s => (
                  <tr key={s.id}
                    className={`data-row ${selected === s.id ? 'expanded' : ''}`}
                    onClick={() => setSelected(selected === s.id ? null : s.id)}
                  >
                    <td className="name-cell">
                      <span className="expand-arrow">{selected === s.id ? '▾' : '▸'}</span>
                      {s.label}
                    </td>
                    <td className="muted">{s.effective_date}</td>
                    <td>{s.is_retirement_plan ? <span className="tag blue">Retirement</span> : <span className="tag">Active</span>}</td>
                    <td className="actions-cell" onClick={e => e.stopPropagation()}>
                      <button className="btn" style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                        onClick={() => setSnapModal(s)}>Edit</button>
                      <button className="btn" style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                        onClick={() => {
                          const label = prompt('Clone label?', `${s.label} (copy)`);
                          if (!label) return;
                          const date = prompt('Effective date?', new Date().toISOString().slice(0, 10));
                          if (!date) return;
                          cloneMut.mutate({ id: s.id, label, date });
                        }}>Clone</button>
                      <button className="btn btn-danger" style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                        onClick={() => { if (confirm(`Delete "${s.label}"?`)) deleteMut.mutate(s.id); }}>Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {activeSnap && (
            <div className="section-card">
              <div className="section-header">
                <h2>{activeSnap.label}</h2>
                <span className="muted">{activeSnap.effective_date}</span>
              </div>
              <SnapshotDetail snapshot={activeSnap} />
            </div>
          )}
        </>
      )}

      {snapModal && (
        <SnapshotModal
          existing={snapModal === 'new' ? undefined : snapModal}
          onClose={() => setSnapModal(null)}
          onSave={handleSnapSaved}
        />
      )}
    </div>
  );
}
