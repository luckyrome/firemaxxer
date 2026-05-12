import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '../../api/client';
import {
  getAssetSnapshots, addAssetSnapshot, deleteAssetSnapshot, bulkAddAssetSnapshots,
  getLiabilitySnapshots, addLiabilitySnapshot, deleteLiabilitySnapshot, bulkAddLiabilitySnapshots,
} from '../../api/assets';
import { parseSnapshotPaste } from '../../utils/parseSnapshots';
import { computeLoanDetails, generateAmortizationSnapshots, type SnapshotInterval } from '../../utils/loanMath';
import type { AssetSnapshot, LiabilitySnapshot, LiabilityWithLatest } from '../../types';

function fmtMoney(v: string | number) {
  return '$' + parseFloat(String(v)).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtMoneyInt(v: number) {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Paste importer ────────────────────────────────────────────────────────────

function PasteImporter({
  valueLabel,
  onImport,
}: {
  valueLabel: string;
  onImport: (rows: { date: string; amount: number }[]) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<ReturnType<typeof parseSnapshotPaste> | null>(null);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  function handleParse() {
    setPreview(parseSnapshotPaste(text));
    setDone(null);
  }

  async function handleImport() {
    if (!preview || !preview.rows.length) return;
    setImporting(true);
    try {
      await onImport(preview.rows);
      setDone(preview.rows.length);
      setText('');
      setPreview(null);
    } finally {
      setImporting(false);
    }
  }

  if (!open) {
    return (
      <button
        className="btn"
        style={{ fontSize: '0.75rem', padding: '4px 10px', marginTop: 10 }}
        onClick={() => setOpen(true)}
      >
        ⬆ Paste / Import
      </button>
    );
  }

  return (
    <div style={{ marginTop: 12, padding: '12px 14px', background: 'var(--bg-inset)', borderRadius: 8, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--fg-muted)', fontWeight: 600 }}>Paste data</span>
        <button className="icon-btn" onClick={() => { setOpen(false); setText(''); setPreview(null); setDone(null); }}>×</button>
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--fg-subtle)', marginBottom: 8 }}>
        Paste from a spreadsheet (two columns: date, {valueLabel.toLowerCase()}) or JSON array. Tab/comma separated. Headers OK.
      </p>
      <textarea
        value={text}
        onChange={(e) => { setText(e.target.value); setPreview(null); setDone(null); }}
        placeholder={`2024-01-01\t150000\n2024-02-01\t152500\n…`}
        style={{
          width: '100%', minHeight: 100, background: 'var(--bg)', border: '1px solid var(--border-sub)',
          borderRadius: 6, color: 'var(--fg-body)', fontSize: '0.8rem', padding: '8px', fontFamily: 'monospace',
          outline: 'none', resize: 'vertical',
        }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <button className="btn" style={{ fontSize: '0.75rem', padding: '4px 12px' }} onClick={handleParse} disabled={!text.trim()}>
          Preview
        </button>
        {preview && preview.rows.length > 0 && (
          <button className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '4px 12px' }} onClick={handleImport} disabled={importing}>
            {importing ? 'Importing…' : `Import ${preview.rows.length} row${preview.rows.length !== 1 ? 's' : ''}`}
          </button>
        )}
        {done !== null && <span style={{ fontSize: '0.78rem', color: 'var(--green)' }}>✓ Imported {done} rows</span>}
      </div>

      {preview && (
        <div style={{ marginTop: 10 }}>
          {preview.errors.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {preview.errors.map((e, i) => (
                <div key={i} style={{ fontSize: '0.75rem', color: 'var(--red-text)', background: 'var(--red-bg)', border: '1px solid var(--red-border)', borderRadius: 4, padding: '3px 8px', marginBottom: 3 }}>{e}</div>
              ))}
            </div>
          )}
          {preview.rows.length > 0 && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', color: 'var(--fg-subtle)', padding: '3px 6px', borderBottom: '1px solid var(--border)' }}>Date</th>
                  <th style={{ textAlign: 'right', color: 'var(--fg-subtle)', padding: '3px 6px', borderBottom: '1px solid var(--border)' }}>{valueLabel}</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 10).map((r, i) => (
                  <tr key={i}>
                    <td style={{ padding: '3px 6px', color: 'var(--fg-sec)' }}>{r.date}</td>
                    <td style={{ padding: '3px 6px', color: 'var(--fg-sec)', textAlign: 'right' }}>{fmtMoney(r.amount)}</td>
                  </tr>
                ))}
                {preview.rows.length > 10 && (
                  <tr>
                    <td colSpan={2} style={{ padding: '3px 6px', color: 'var(--fg-subtle)', fontStyle: 'italic' }}>
                      …and {preview.rows.length - 10} more rows
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
          {preview.rows.length === 0 && preview.errors.length === 0 && (
            <p style={{ fontSize: '0.78rem', color: 'var(--fg-subtle)' }}>No valid rows found.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Add single row ────────────────────────────────────────────────────────────

function todayLocal() {
  return new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in device timezone
}

function AddRow({ valueLabel, onAdd }: { valueLabel: string; onAdd: (date: string, amount: number) => Promise<void> }) {
  const [date, setDate] = useState(todayLocal);
  const [amount, setAmount] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleAdd() {
    if (!date || !amount) return;
    setError('');
    setLoading(true);
    try {
      await onAdd(date, parseFloat(amount));
      setDate(todayLocal());
      setAmount('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to add');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          style={{ background: 'var(--bg)', border: '1px solid var(--border-sub)', borderRadius: 6, color: 'var(--fg-body)', fontSize: '0.82rem', padding: '5px 9px', outline: 'none', width: 150 }}
        />
        <input
          type="number" min="0" step="0.01"
          placeholder={`${valueLabel} ($)`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          style={{ background: 'var(--bg)', border: '1px solid var(--border-sub)', borderRadius: 6, color: 'var(--fg-body)', fontSize: '0.82rem', padding: '5px 9px', outline: 'none', width: 130 }}
        />
        <button
          className="btn btn-primary"
          onClick={handleAdd}
          disabled={loading || !date || !amount}
          style={{ fontSize: '0.8rem', padding: '5px 12px' }}
        >
          Add
        </button>
      </div>
      {error && <div className="field-error" style={{ marginTop: 6 }}>{error}</div>}
    </div>
  );
}

// ── Loan details card ─────────────────────────────────────────────────────────

function LoanDetailsCard({ liability }: { liability: LiabilityWithLatest }) {
  const { origination_date, original_balance, term_months, interest_rate, latest_balance } = liability;
  if (!origination_date || !original_balance || !term_months) return null;

  const details = computeLoanDetails(
    parseFloat(original_balance),
    parseFloat(interest_rate),
    term_months,
    origination_date,
  );

  const actualBalance = latest_balance ? parseFloat(latest_balance) : null;
  const balanceDiff = actualBalance !== null ? actualBalance - details.expectedBalance : null;

  return (
    <div style={{
      background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '14px 16px', marginBottom: 14,
    }}>
      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--fg)', marginBottom: 10 }}>Loan Details</div>

      {/* Progress bar */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem', color: 'var(--fg-muted)', marginBottom: 4 }}>
          <span>{details.monthsElapsed} mo elapsed</span>
          <span>{details.monthsRemaining} mo remaining</span>
        </div>
        <div style={{ height: 6, background: 'var(--bg-overlay)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${details.progressPct}%`, background: 'var(--blue)', borderRadius: 3, transition: 'width 0.3s' }} />
        </div>
        <div style={{ fontSize: '0.72rem', color: 'var(--fg-subtle)', marginTop: 3 }}>
          {details.progressPct.toFixed(1)}% through term · Payoff: {details.payoffDate}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {[
          ['Monthly Payment', fmtMoneyInt(details.monthlyPayment), 'fg'],
          ['Expected Balance', fmtMoneyInt(details.expectedBalance), 'fg'],
          actualBalance !== null ? ['Actual Balance', fmtMoneyInt(actualBalance), balanceDiff! < 0 ? 'green' : balanceDiff! > 0 ? 'red' : 'fg'] : null,
          ['Total Interest', fmtMoneyInt(details.totalInterest), 'red'],
          ['Interest Paid', fmtMoneyInt(details.interestPaidToDate), 'fg-muted'],
          ['Interest Left', fmtMoneyInt(details.interestRemaining), 'red'],
          ['Principal Paid', fmtMoneyInt(details.principalPaidToDate), 'green'],
          ['Original Balance', fmtMoneyInt(parseFloat(original_balance)), 'fg-muted'],
          ['Total Cost', fmtMoneyInt(details.totalPaid), 'fg-muted'],
        ].filter((x): x is string[] => x !== null).map(([label, value, color]) => (
          <div key={label as string} style={{ background: 'var(--bg-inset)', borderRadius: 6, padding: '8px 10px' }}>
            <div style={{ fontSize: '0.7rem', color: 'var(--fg-subtle)', marginBottom: 3 }}>{label}</div>
            <div style={{ fontSize: '0.9rem', fontWeight: 600, color: `var(--${color})` }}>{value}</div>
          </div>
        ))}
      </div>

      {balanceDiff !== null && Math.abs(balanceDiff) > 1 && (
        <div style={{ marginTop: 8, fontSize: '0.75rem', color: balanceDiff < 0 ? 'var(--green)' : 'var(--yellow)' }}>
          {balanceDiff < 0
            ? `✓ ${fmtMoneyInt(Math.abs(balanceDiff))} ahead of schedule`
            : `⚠ ${fmtMoneyInt(balanceDiff)} behind schedule`}
        </div>
      )}
    </div>
  );
}

// ── Asset panel ───────────────────────────────────────────────────────────────

export function AssetSnapshotPanel({ assetId }: { assetId: string }) {
  const qc = useQueryClient();

  const { data: snapshots = [], isLoading } = useQuery({
    queryKey: ['asset-snapshots', assetId],
    queryFn: () => getAssetSnapshots(assetId),
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['asset-snapshots', assetId] });
    qc.invalidateQueries({ queryKey: ['assets'] });
    qc.invalidateQueries({ queryKey: ['net-worth'] });
  }

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAssetSnapshot(assetId, id),
    onSuccess: invalidate,
  });

  async function handleAdd(date: string, value: number) {
    await addAssetSnapshot(assetId, { snapshot_date: date, value });
    invalidate();
  }

  async function handleBulk(rows: { date: string; amount: number }[]) {
    await bulkAddAssetSnapshots(assetId, rows.map(r => ({ snapshot_date: r.date, value: r.amount })));
    invalidate();
  }

  return (
    <div className="snapshot-panel">
      <AddRow valueLabel="Value" onAdd={handleAdd} />
      {isLoading ? <p className="muted">Loading…</p> : snapshots.length === 0 ? (
        <p className="muted" style={{ paddingTop: 8 }}>No snapshots yet.</p>
      ) : (
        <table style={{ marginTop: 10 }}>
          <thead><tr><th>Date</th><th>Value</th><th></th></tr></thead>
          <tbody>
            {(snapshots as AssetSnapshot[]).map((s) => (
              <tr key={s.id}>
                <td>{s.snapshot_date}</td>
                <td className="num">{fmtMoney(s.value)}</td>
                <td><button className="icon-btn" onClick={() => deleteMut.mutate(s.id)} title="Delete">×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <PasteImporter valueLabel="Value" onImport={handleBulk} />
    </div>
  );
}

// ── Generate from loan math ───────────────────────────────────────────────────

function GenerateFromLoan({
  liability,
  hasSnapshots,
  onGenerated,
}: {
  liability: LiabilityWithLatest;
  hasSnapshots: boolean;
  onGenerated: () => void;
}) {
  const { origination_date, original_balance, term_months, interest_rate } = liability;
  if (!origination_date || !original_balance || !term_months) return null;

  const [interval, setInterval] = useState<SnapshotInterval>('monthly');
  const [generating, setGenerating] = useState(false);
  const [open, setOpen] = useState(!hasSnapshots); // auto-open when no snapshots

  const preview = generateAmortizationSnapshots(
    parseFloat(original_balance),
    parseFloat(interest_rate),
    term_months,
    origination_date,
    interval,
  );

  async function handleGenerate() {
    setGenerating(true);
    try {
      await bulkAddLiabilitySnapshots(liability.id, preview);
      onGenerated();
      setOpen(false);
    } finally {
      setGenerating(false);
    }
  }

  if (!open) {
    return (
      <button
        className="btn"
        style={{ fontSize: '0.75rem', padding: '4px 10px', marginTop: 10 }}
        onClick={() => setOpen(true)}
      >
        ∫ Generate from loan math
      </button>
    );
  }

  const first = preview[0]?.snapshot_date;
  const last  = preview[preview.length - 1]?.snapshot_date;

  return (
    <div style={{
      marginTop: 12, padding: '12px 14px',
      background: 'var(--bg-inset)', borderRadius: 8,
      border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: '0.82rem', color: 'var(--fg-muted)', fontWeight: 600 }}>
          Generate balance history from amortization
        </span>
        {hasSnapshots && (
          <button className="icon-btn" onClick={() => setOpen(false)}>×</button>
        )}
      </div>
      <p style={{ fontSize: '0.75rem', color: 'var(--fg-subtle)', marginBottom: 10 }}>
        Calculates the exact amortized balance at each interval and imports it as snapshots.
        Existing snapshots for the same dates will be overwritten.
      </p>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.78rem', color: 'var(--fg-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          Interval
          <select
            value={interval}
            onChange={e => setInterval(e.target.value as SnapshotInterval)}
            style={{
              background: 'var(--bg)', border: '1px solid var(--border-sub)',
              borderRadius: 6, color: 'var(--fg-body)', fontSize: '0.8rem',
              padding: '4px 8px', outline: 'none',
            }}
          >
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="annually">Annually</option>
          </select>
        </label>

        {preview.length > 0 && (
          <span style={{ fontSize: '0.75rem', color: 'var(--fg-subtle)' }}>
            {preview.length} snapshots · {first} → {last}
          </span>
        )}

        <button
          className="btn btn-primary"
          style={{ fontSize: '0.75rem', padding: '4px 12px' }}
          onClick={handleGenerate}
          disabled={generating || preview.length === 0}
        >
          {generating ? 'Generating…' : `Import ${preview.length} snapshots`}
        </button>
      </div>
    </div>
  );
}

// ── Liability panel ───────────────────────────────────────────────────────────

export function LiabilitySnapshotPanel({ liability }: { liability: LiabilityWithLatest }) {
  const qc = useQueryClient();

  const { data: snapshots = [], isLoading } = useQuery({
    queryKey: ['liability-snapshots', liability.id],
    queryFn: () => getLiabilitySnapshots(liability.id),
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['liability-snapshots', liability.id] });
    qc.invalidateQueries({ queryKey: ['liabilities'] });
    qc.invalidateQueries({ queryKey: ['net-worth'] });
  }

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteLiabilitySnapshot(liability.id, id),
    onSuccess: invalidate,
  });

  async function handleAdd(date: string, balance: number) {
    await addLiabilitySnapshot(liability.id, { snapshot_date: date, balance });
    invalidate();
  }

  async function handleBulk(rows: { date: string; amount: number }[]) {
    await bulkAddLiabilitySnapshots(liability.id, rows.map(r => ({ snapshot_date: r.date, balance: r.amount })));
    invalidate();
  }

  const hasSnapshots = !isLoading && (snapshots as LiabilitySnapshot[]).length > 0;

  return (
    <div className="snapshot-panel">
      <LoanDetailsCard liability={liability} />
      <AddRow valueLabel="Balance" onAdd={handleAdd} />
      {isLoading ? <p className="muted">Loading…</p> : snapshots.length === 0 ? (
        <p className="muted" style={{ paddingTop: 8 }}>No balance history yet.</p>
      ) : (
        <table style={{ marginTop: 10 }}>
          <thead><tr><th>Date</th><th>Balance</th><th></th></tr></thead>
          <tbody>
            {(snapshots as LiabilitySnapshot[]).map((s) => (
              <tr key={s.id}>
                <td>{s.snapshot_date}</td>
                <td className="num">{fmtMoney(s.balance)}</td>
                <td><button className="icon-btn" onClick={() => deleteMut.mutate(s.id)} title="Delete">×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <PasteImporter valueLabel="Balance" onImport={handleBulk} />
      <GenerateFromLoan liability={liability} hasSnapshots={hasSnapshots} onGenerated={invalidate} />
    </div>
  );
}
