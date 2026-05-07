import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSettings } from '../api/settings';
import { getFireResult } from '../api/refi';
import { getExpenseSnapshots } from '../api/expenses';
import type { FireConfig } from '../types';

function fmtMoney(v: number) {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(r: number) {
  return (r * 100).toFixed(1) + '%';
}

function NumField({ label, name, value, onChange, pct }: {
  label: string; name: keyof FireConfig; value: number; onChange: (k: keyof FireConfig, v: number) => void; pct?: boolean;
}) {
  return (
    <label className="field">
      {label}
      <input
        type="number" min="0" step={pct ? '0.001' : '1'}
        value={pct ? (value * 100).toFixed(3) : value}
        onChange={e => {
          const n = parseFloat(e.target.value);
          onChange(name, pct ? n / 100 : n);
        }}
      />
    </label>
  );
}

export function FirePage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState<Partial<FireConfig>>({});

  const { data: config,    isLoading: configLoading }  = useQuery({ queryKey: ['settings'],    queryFn: getSettings });
  const { data: result,    isLoading: resultLoading }  = useQuery({ queryKey: ['fire-result'], queryFn: getFireResult });
  const { data: snapshots = [] }                        = useQuery({ queryKey: ['expense-snapshots'], queryFn: getExpenseSnapshots });

  const saveMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      qc.invalidateQueries({ queryKey: ['fire-result'] });
      setEditing(false);
      setDraft({});
    },
  });

  function startEdit() {
    if (!config) return;
    setDraft({ ...config });
    setEditing(true);
  }

  function setField(k: keyof FireConfig, v: number | string | null) {
    setDraft(d => ({ ...d, [k]: v }));
  }

  const cfg = (editing ? draft : config) as FireConfig | undefined;

  if (configLoading) return <div className="loading">Loading…</div>;

  const tax = result?.taxDetails;
  const noTaxConfigured = tax && tax.jurisdictions.length === 0;

  return (
    <div className="page">
      <div className="page-header">
        <h1>FIRE Dashboard</h1>
        {!editing && (
          <button className="btn btn-primary" onClick={startEdit}>Edit Settings</button>
        )}
      </div>

      {/* ── Result cards ────────────────────────────────────────────────── */}
      {result && !resultLoading && (
        <>
          <div className="summary-cards">
            <div className="summary-card">
              <div className="summary-card-label">Monthly Net Income</div>
              <div className="summary-card-value green">{fmtMoney(result.monthlyIncome)}</div>
            </div>
            <div className="summary-card">
              <div className="summary-card-label">Monthly Expenses</div>
              <div className="summary-card-value red">{fmtMoney(result.monthlyExpenses)}</div>
            </div>
            <div className="summary-card">
              <div className="summary-card-label">Net Worth</div>
              <div className={`summary-card-value ${result.existingAssets >= 0 ? 'green' : 'red'}`}>
                {fmtMoney(result.existingAssets)}
              </div>
            </div>
            <div className="summary-card">
              <div className="summary-card-label">FI Target</div>
              <div className="summary-card-value blue">{fmtMoney(result.fiBalance)}</div>
            </div>
          </div>

          <div className="summary-cards">
            <div className="summary-card">
              <div className="summary-card-label">Years to FI (linear)</div>
              <div className="summary-card-value">{result.yearsToFI !== null ? result.yearsToFI.toFixed(1) : '—'}</div>
            </div>
            <div className="summary-card">
              <div className="summary-card-label">Years to FI (with growth)</div>
              <div className="summary-card-value blue">{result.yearsToFIWithGrowth !== null ? result.yearsToFIWithGrowth : '—'}</div>
            </div>
            <div className="summary-card">
              <div className="summary-card-label">Estimated FI Date</div>
              <div className="summary-card-value blue">{result.estimatedFIDate ?? '—'}</div>
            </div>
            <div className="summary-card">
              <div className="summary-card-label">Retired Expenses / Mo</div>
              <div className="summary-card-value">{fmtMoney(result.monthlyRetiredExpenses)}</div>
            </div>
          </div>

          {/* ── Tax breakdown ──────────────────────────────────────────── */}
          <div className="section-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
              <h2 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Tax Breakdown</h2>
              <Link to="/tax" style={{ fontSize: '0.78rem', color: 'var(--blue)' }}>Configure brackets →</Link>
            </div>

            {noTaxConfigured ? (
              <p className="muted" style={{ fontSize: '0.82rem' }}>
                No tax jurisdictions configured. <Link to="/tax" style={{ color: 'var(--blue)' }}>Set up your tax profile</Link> to see an accurate net income calculation.
              </p>
            ) : (
              <>
                <div className="stat-row">
                  <span className="stat-label">Ordinary Income</span>
                  <span className="stat-value">{fmtMoney(tax!.ordinaryIncome)}</span>
                </div>
                {tax!.ltGainsIncome > 0 && (
                  <div className="stat-row">
                    <span className="stat-label">LT Capital Gains</span>
                    <span className="stat-value">{fmtMoney(tax!.ltGainsIncome)}</span>
                  </div>
                )}
                {tax!.nonTaxableIncome > 0 && (
                  <div className="stat-row">
                    <span className="stat-label">Non-Taxable Income</span>
                    <span className="stat-value">{fmtMoney(tax!.nonTaxableIncome)}</span>
                  </div>
                )}
                <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />
                {tax!.jurisdictions.map(j => (
                  <div key={j.jurisdictionId} style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 600, marginBottom: 4 }}>
                      <span>{j.name} ({j.abbreviation})</span>
                      <span className="red">−{fmtMoney(j.totalTax)}</span>
                    </div>
                    <div style={{ paddingLeft: 12 }}>
                      {j.ordinaryTax > 0 && (
                        <div className="stat-row" style={{ fontSize: '0.76rem' }}>
                          <span className="stat-label muted">
                            Ordinary tax <span style={{ color: 'var(--fg-subtle)' }}>(marginal {fmtPct(j.marginalOrdinaryRate)})</span>
                          </span>
                          <span className="stat-value red">−{fmtMoney(j.ordinaryTax)}</span>
                        </div>
                      )}
                      {j.ltGainsTax > 0 && (
                        <div className="stat-row" style={{ fontSize: '0.76rem' }}>
                          <span className="stat-label muted">
                            LT gains tax <span style={{ color: 'var(--fg-subtle)' }}>(marginal {fmtPct(j.ltMarginalRate)})</span>
                          </span>
                          <span className="stat-value red">−{fmtMoney(j.ltGainsTax)}</span>
                        </div>
                      )}
                      <div className="stat-row" style={{ fontSize: '0.72rem' }}>
                        <span className="stat-label muted">Effective rate</span>
                        <span className="stat-value muted">{fmtPct(j.effectiveRate)}</span>
                      </div>
                    </div>
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />
                <div className="stat-row">
                  <span className="stat-label" style={{ fontWeight: 600 }}>Total Tax</span>
                  <span className="stat-value red">−{fmtMoney(tax!.totalTax)}</span>
                </div>
                <div className="stat-row">
                  <span className="stat-label" style={{ fontWeight: 600 }}>Net Monthly Take-home</span>
                  <span className="stat-value green">{fmtMoney(tax!.netMonthly)}</span>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* ── Settings form ────────────────────────────────────────────────── */}
      {editing && cfg && (
        <form onSubmit={e => { e.preventDefault(); saveMutation.mutate(draft); }}>
          <div className="section-card">
            <div className="section-header"><h2>Pre-Tax Deductions &amp; Special Income</h2></div>
            <p className="muted" style={{ fontSize: '0.78rem', marginBottom: 10 }}>
              Salary, bonus, and RSU income is sourced from the <Link to="/income" style={{ color: 'var(--blue)' }}>Income</Link> page.
              Configure tax brackets on the <Link to="/tax" style={{ color: 'var(--blue)' }}>Tax Brackets</Link> page.
            </p>
            <div className="form-grid">
              <NumField label="401(k) Annual Contribution" name="k401Annual"             value={cfg.k401Annual ?? 0}             onChange={setField} />
              <NumField label="Medical Deduction Annual"   name="medicalDeductionAnnual" value={cfg.medicalDeductionAnnual ?? 0} onChange={setField} />
              <NumField label="ESPP Quarterly Gain (LT)"  name="esppQuarterlyGain"       value={cfg.esppQuarterlyGain ?? 0}     onChange={setField} />
            </div>
          </div>

          <div className="section-card">
            <div className="section-header"><h2>FIRE Parameters</h2></div>
            <div className="form-grid">
              <NumField label="Safe Withdrawal Rate (%)"           name="safeWithdrawalRate"        value={cfg.safeWithdrawalRate ?? 0.04}   onChange={setField} pct />
              <NumField label="Assumed Annual Growth Rate (%)"     name="assumedGrowthRate"          value={cfg.assumedGrowthRate ?? 0.04}    onChange={setField} pct />
              <NumField label="Target Retirement Annual Income"    name="retirementAnnualIncome"     value={cfg.retirementAnnualIncome ?? 0}  onChange={setField} />
              <label className="field">
                Active Expense Snapshot
                <select
                  value={cfg.activeExpenseSnapshotId ?? ''}
                  onChange={e => setField('activeExpenseSnapshotId', e.target.value || null)}
                >
                  <option value="">— none —</option>
                  {snapshots.filter(s => !s.is_retirement_plan).map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Retirement Expense Snapshot
                <select
                  value={cfg.retiredExpenseSnapshotId ?? ''}
                  onChange={e => setField('retiredExpenseSnapshotId', e.target.value || null)}
                >
                  <option value="">— none —</option>
                  {snapshots.map(s => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 20 }}>
            <button type="button" className="btn" onClick={() => { setEditing(false); setDraft({}); }}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </form>
      )}

      {!editing && !result && !resultLoading && (
        <div className="empty-state">
          <p>Configure your FIRE settings to see your feasibility analysis.</p>
          <button className="btn btn-primary" onClick={startEdit}>Set Up FIRE Settings</button>
        </div>
      )}
    </div>
  );
}
