import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getExpenseSnapshots, createExpenseSnapshot, updateExpenseSnapshot,
  deleteExpenseSnapshot, cloneExpenseSnapshot, getExpenseItems,
  createExpenseItem, updateExpenseItem, deleteExpenseItem, bulkAddExpenseItems,
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

// ── Expense paste parser ───────────────────────────────────────────────────────

interface ParsedExpenseRow {
  name: string;
  category: string;
  amount: number;
  frequency: ExpenseFrequency;
  owner: string | null;
  vertical: string | null;
  critical: boolean;
}

const FREQ_ALIASES: Record<string, ExpenseFrequency> = {
  weekly: 'weekly', week: 'weekly',
  biweekly: 'bi_weekly', 'bi-weekly': 'bi_weekly', 'bi weekly': 'bi_weekly', bi_weekly: 'bi_weekly',
  monthly: 'monthly', month: 'monthly',
  quarterly: 'quarterly', quarter: 'quarterly',
  'semi-annually': 'semi_annually', 'semi annually': 'semi_annually',
  semiannually: 'semi_annually', semi_annually: 'semi_annually', 'semi-annual': 'semi_annually',
  annually: 'annually', annual: 'annually', yearly: 'annually', year: 'annually',
};

function normalizeFreq(raw: string): ExpenseFrequency | null {
  return FREQ_ALIASES[raw.toLowerCase().trim()] ?? null;
}

function parseCritical(raw: string): boolean {
  const v = raw.toLowerCase().trim();
  return v === 'yes' || v === 'true' || v === '1' || v === '★' || v === 'x' || v === 'y';
}

function parseAmount(raw: string): number {
  const s = raw.trim();
  // Accounting notation: $(309) or (309) → negative
  const accounting = s.match(/^\$?\(([0-9.,]+)\)$/);
  if (accounting) return -parseFloat(accounting[1].replace(/,/g, ''));
  return parseFloat(s.replace(/[$,]/g, ''));
}

function parseExpenseItemsPaste(text: string): { rows: ParsedExpenseRow[]; errors: string[] } {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return { rows: [], errors: ['No data found'] };

  const sep = (lines[0].match(/\t/g) ?? []).length >= (lines[0].match(/,/g) ?? []).length ? '\t' : ',';

  const splitLine = (l: string) => sep === '\t'
    ? l.split('\t')
    : l.split(',').map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"'));

  const headers = splitLine(lines[0]).map(h => h.toLowerCase().trim());
  const hasHeader = headers.includes('name') || headers.includes('category');

  const COL_KEYS = ['name', 'category', 'amount', 'frequency', 'owner', 'vertical', 'critical'];
  let colMap: Record<string, number>;
  let dataLines: string[];

  if (hasHeader) {
    colMap = Object.fromEntries(COL_KEYS.map(k => [k, headers.indexOf(k)]));
    dataLines = lines.slice(1);
  } else {
    colMap = { name: 0, category: 1, amount: 2, frequency: 3, owner: 4, vertical: 5, critical: 6 };
    dataLines = lines;
  }

  const rows: ParsedExpenseRow[] = [];
  const errors: string[] = [];

  dataLines.forEach((line, idx) => {
    const rowNum = hasHeader ? idx + 2 : idx + 1;
    const cols = splitLine(line);
    const get = (key: string) => {
      const i = colMap[key];
      return i >= 0 && i < cols.length ? cols[i].trim() : '';
    };

    const name = get('name');
    const category = get('category') || 'General';
    const amountRaw = get('amount');
    const freqRaw = get('frequency');

    if (!name) { errors.push(`Row ${rowNum}: missing name`); return; }
    if (!amountRaw) { errors.push(`Row ${rowNum}: missing amount`); return; }

    const amount = parseAmount(amountRaw);
    if (isNaN(amount)) { errors.push(`Row ${rowNum}: invalid amount "${amountRaw}"`); return; }

    const frequency = freqRaw ? normalizeFreq(freqRaw) : 'monthly';
    if (!frequency) { errors.push(`Row ${rowNum}: unknown frequency "${freqRaw}"`); return; }

    const owner = get('owner') || null;
    const vertical = get('vertical') || null;
    const criticalRaw = get('critical');
    const critical = criticalRaw ? parseCritical(criticalRaw) : false;

    rows.push({ name, category, amount, frequency, owner, vertical, critical });
  });

  return { rows, errors };
}

function ExpenseImporter({ snapshotId, onImported }: { snapshotId: string; onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<{ rows: ParsedExpenseRow[]; errors: string[] } | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState('');

  function handleParse() {
    setParsed(parseExpenseItemsPaste(text));
    setResult('');
  }

  async function handleImport() {
    if (!parsed || parsed.rows.length === 0) return;
    setImporting(true);
    try {
      const res = await bulkAddExpenseItems(snapshotId, parsed.rows);
      setResult(`Imported ${res.inserted} items.`);
      setParsed(null);
      setText('');
      onImported();
    } catch (e: any) {
      setResult(`Error: ${e.message}`);
    } finally {
      setImporting(false);
    }
  }

  if (!open) {
    return (
      <button className="btn" style={{ fontSize: '0.75rem', padding: '4px 10px' }} onClick={() => setOpen(true)}>
        Import from CSV
      </button>
    );
  }

  return (
    <div className="section-card" style={{ marginTop: 12 }}>
      <div className="section-header">
        <h3 style={{ margin: 0, fontSize: '0.9rem' }}>Import Expense Items</h3>
        <button className="btn" style={{ fontSize: '0.72rem', padding: '3px 8px' }} onClick={() => { setOpen(false); setParsed(null); setText(''); setResult(''); }}>Close</button>
      </div>
      <p className="muted" style={{ fontSize: '0.75rem', margin: '6px 0 8px' }}>
        Paste tab-separated or CSV data. Columns: <strong>name, category, amount, frequency</strong>, owner, vertical, critical (optional). A header row is detected automatically.
      </p>
      <textarea
        style={{ width: '100%', height: 140, fontFamily: 'monospace', fontSize: '0.75rem', boxSizing: 'border-box', padding: 8, resize: 'vertical' }}
        value={text}
        onChange={e => { setText(e.target.value); setParsed(null); setResult(''); }}
        placeholder={"name\tcategory\tamount\tfrequency\nRent\tHousing\t2500\tmonthly\nGroceries\tFood\t600\tmonthly"}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button className="btn btn-primary" onClick={handleParse} disabled={!text.trim()}>Parse</button>
        {parsed && parsed.rows.length > 0 && (
          <button className="btn btn-primary" onClick={handleImport} disabled={importing}>
            {importing ? 'Importing…' : `Import ${parsed.rows.length} items`}
          </button>
        )}
      </div>
      {result && <p style={{ marginTop: 8, fontSize: '0.8rem', color: result.startsWith('Error') ? 'var(--red)' : 'var(--green)' }}>{result}</p>}
      {parsed && (
        <div style={{ marginTop: 10 }}>
          {parsed.errors.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {parsed.errors.map((e, i) => <div key={i} style={{ fontSize: '0.75rem', color: 'var(--red)' }}>{e}</div>)}
            </div>
          )}
          {parsed.rows.length > 0 && (
            <table className="data-table" style={{ fontSize: '0.75rem' }}>
              <thead>
                <tr><th>Name</th><th>Category</th><th>Amount</th><th>Freq</th><th>Owner</th><th>Critical</th></tr>
              </thead>
              <tbody>
                {parsed.rows.slice(0, 10).map((r, i) => (
                  <tr key={i}>
                    <td>{r.name}</td>
                    <td>{r.category}</td>
                    <td className="num">{fmtMoney(r.amount)}</td>
                    <td>{FREQ_LABELS[r.frequency]}</td>
                    <td className="muted">{r.owner ?? '—'}</td>
                    <td>{r.critical ? '★' : '—'}</td>
                  </tr>
                ))}
                {parsed.rows.length > 10 && (
                  <tr><td colSpan={6} className="muted" style={{ textAlign: 'center' }}>…and {parsed.rows.length - 10} more</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

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
    if (isNaN(amount)) { setError('Amount must be a valid number'); return; }
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
              <input type="number" step="0.01" value={form.amount}
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
  const [criticalOnly, setCriticalOnly] = useState(false);

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

  const allItems = data?.items ?? [];
  const visibleItems = criticalOnly ? allItems.filter(i => i.critical) : allItems;

  // Group by category, sorted by category total desc
  const grouped = visibleItems.reduce<Record<string, typeof visibleItems>>((acc, i) => {
    (acc[i.category] ??= []).push(i);
    return acc;
  }, {});
  const categories = Object.entries(grouped).sort(
    ([, a], [, b]) =>
      b.reduce((s, i) => s + i.monthly_cost, 0) - a.reduce((s, i) => s + i.monthly_cost, 0),
  );

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
          <div className="summary-card">
            <div className="summary-card-label">Discretionary / Month</div>
            <div className="summary-card-value">{fmtMoney(data.totalMonthly - data.criticalMonthly)}</div>
          </div>
        </div>
      )}

      <div className="section-header">
        <h2>Items</h2>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            className={`btn${criticalOnly ? ' btn-primary' : ''}`}
            style={{ fontSize: '0.75rem', padding: '4px 10px' }}
            onClick={() => setCriticalOnly(v => !v)}
          >
            {criticalOnly ? '★ Critical only' : '☆ All items'}
          </button>
          <ExpenseImporter snapshotId={snapshot.id} onImported={() => qc.invalidateQueries({ queryKey: ['expense-items', snapshot.id] })} />
          <button className="btn btn-primary" onClick={() => setItemModal('new')}>+ Add Item</button>
        </div>
      </div>

      {isLoading ? <p className="muted">Loading…</p> : allItems.length === 0 ? (
        <div className="empty-state"><p>No items yet.</p></div>
      ) : visibleItems.length === 0 ? (
        <div className="empty-state"><p>No critical items in this snapshot.</p></div>
      ) : (
        categories.map(([category, items]) => {
          const catTotal = items.reduce((s, i) => s + i.monthly_cost, 0);
          return (
            <div key={category} style={{ marginBottom: 16 }}>
              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '5px 10px', background: 'var(--bg-overlay)',
                borderRadius: '6px 6px 0 0', borderBottom: '1px solid var(--border)',
              }}>
                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--fg-sec)' }}>{category}</span>
                <span style={{ fontSize: '0.78rem', color: 'var(--fg-muted)' }}>{fmtMoney(catTotal)}/mo</span>
              </div>
              <table className="data-table" style={{ marginBottom: 0, tableLayout: 'fixed', width: '100%' }}>
                <colgroup>
                  <col />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 90 }} />
                  <col style={{ width: 110 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th>Name</th><th>Owner</th><th>Freq</th>
                    <th style={{ textAlign: 'right' }}>Amount</th>
                    <th style={{ textAlign: 'right' }}>Monthly</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {items
                    .slice()
                    .sort((a, b) => b.monthly_cost - a.monthly_cost)
                    .map(i => (
                      <tr key={i.id}>
                        <td>
                          {i.critical && <span className="tag red" style={{ marginRight: 6 }}>★</span>}
                          {i.name}
                        </td>
                        <td className="muted">{i.owner ?? '—'}</td>
                        <td><span className="type-badge">{FREQ_LABELS[i.frequency]}</span></td>
                        <td className="num">{fmtMoney(parseFloat(i.amount))}</td>
                        <td className="num">{fmtMoney(i.monthly_cost)}</td>
                        <td className="actions-cell">
                          <button className="btn" style={{ fontSize: '0.75rem', padding: '3px 10px' }} onClick={() => setItemModal(i)}>Edit</button>
                          <button className="btn btn-danger" style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                            onClick={() => { if (confirm(`Delete "${i.name}"?`)) deleteMut.mutate(i.id); }}>Del</button>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          );
        })
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
