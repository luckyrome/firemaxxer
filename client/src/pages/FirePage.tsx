import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSettings } from '../api/settings';
import { getFireResult } from '../api/refi';
import { getExpenseSnapshots } from '../api/expenses';
import type { FireConfig, FireTargetResult, RetirementWithdrawal, BracketDetail, RetirementJurisdictionTax } from '../types';

function fmtMoney(v: number) {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(r: number) {
  return (r * 100).toFixed(1) + '%';
}

function RetirementWithdrawalBanner({ rw }: { rw: RetirementWithdrawal }) {
  if (rw.taxAnnual <= 0) {
    return (
      <p className="muted" style={{ fontSize: '0.76rem', marginBottom: 8 }}>
        No tax jurisdictions configured — targets do not include a withdrawal tax gross-up.{' '}
        <Link to="/tax" style={{ color: 'var(--blue)' }}>Configure →</Link>
      </p>
    );
  }
  return (
    <p className="muted" style={{ fontSize: '0.76rem', marginBottom: 8 }}>
      Targets gross up for <strong>{fmtPct(rw.effectiveRate)}</strong> retirement tax —
      must withdraw <strong style={{ color: 'var(--fg)' }}>{fmtMoney(rw.grossAnnual / 12)}/mo</strong> to
      net <strong style={{ color: 'var(--fg)' }}>{fmtMoney(rw.netAnnual / 12)}/mo</strong>.{' '}
      See Tax Breakdown ↓ for details.
    </p>
  );
}

function RetirementWaterfall({ rw }: { rw: RetirementWithdrawal }) {
  const grossMonthly = rw.grossAnnual / 12;
  const netMonthly   = rw.netAnnual   / 12;

  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>Retirement Withdrawal</span>
        <span className="muted" style={{ fontSize: '0.72rem' }}>
          {rw.withdrawalType === 'long_term_gains' ? 'LT cap gains treatment' : 'Ordinary income treatment'}
        </span>
      </div>

      {/* Gross withdrawal row */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '6px 10px', background: 'var(--bg-overlay)', borderRadius: '6px 6px 0 0',
        borderBottom: '1px solid var(--border)', fontSize: '0.8rem',
      }}>
        <span style={{ color: 'var(--fg-sec)' }}>Gross withdrawal needed</span>
        <span style={{ fontWeight: 600 }}>{fmtMoney(grossMonthly)}/mo</span>
      </div>

      {/* Per-jurisdiction tax rows */}
      {rw.jurisdictionTaxes.map((jt, idx) => (
        <JurisdictionWithdrawalRow
          key={jt.jurisdictionId}
          jt={jt}
          isLast={idx === rw.jurisdictionTaxes.length - 1}
        />
      ))}

      {/* Net usable */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '7px 10px', background: 'var(--bg-overlay)', borderRadius: '0 0 6px 6px',
        borderTop: '2px solid var(--border)', fontSize: '0.84rem', fontWeight: 600,
      }}>
        <span style={{ color: 'var(--green)' }}>Net monthly usable</span>
        <span style={{ color: 'var(--green)' }}>{fmtMoney(netMonthly)}/mo</span>
      </div>
    </div>
  );
}

function JurisdictionWithdrawalRow({ jt, isLast }: { jt: RetirementJurisdictionTax; isLast: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      borderBottom: isLast ? 'none' : '1px solid var(--border)',
      background: 'var(--bg-card)',
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '5px 10px', fontSize: '0.78rem',
      }}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--fg-sec)', padding: 0, display: 'flex', alignItems: 'center', gap: 6,
            fontSize: '0.78rem',
          }}
        >
          <span style={{ fontSize: '0.65rem', color: 'var(--fg-subtle)' }}>{open ? '▼' : '▶'}</span>
          {jt.name}
          <span className="muted" style={{ fontSize: '0.7rem' }}>({fmtPct(jt.effectiveRate)} effective)</span>
        </button>
        <span className="red">−{fmtMoney(jt.taxAmount / 12)}/mo</span>
      </div>
      {open && jt.bracketDetails.length > 0 && (
        <table style={{ width: '100%', fontSize: '0.7rem', borderCollapse: 'collapse', padding: '0 10px 6px', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ color: 'var(--fg-subtle)' }}>
              <th style={{ textAlign: 'left', fontWeight: 400, paddingLeft: 28, paddingBottom: 2 }}>Bracket</th>
              <th style={{ fontWeight: 400, textAlign: 'right', paddingBottom: 2 }}>Rate</th>
              <th style={{ fontWeight: 400, textAlign: 'right', paddingBottom: 2 }}>Amount in bracket</th>
              <th style={{ fontWeight: 400, textAlign: 'right', paddingRight: 10, paddingBottom: 2 }}>Tax</th>
            </tr>
          </thead>
          <tbody>
            {jt.bracketDetails.map((d, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '2px 0 2px 28px', color: 'var(--fg-sec)' }}>
                  {fmtMoney(d.floor)} – {d.ceiling !== null ? fmtMoney(d.ceiling) : '∞'}
                </td>
                <td style={{ textAlign: 'right', color: 'var(--fg-sec)' }}>{fmtPct(d.rate)}</td>
                <td style={{ textAlign: 'right' }}>{fmtMoney(d.amountInBracket)}</td>
                <td style={{ textAlign: 'right', color: 'var(--red)', paddingRight: 10 }}>−{fmtMoney(d.taxAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TargetRow({
  label, description, target, netWorth, color = 'var(--blue)',
}: {
  label: string;
  description: string;
  target: FireTargetResult;
  netWorth: number;
  color?: string;
}) {
  const pct   = target.balance > 0 ? Math.min(100, Math.max(0, (netWorth / target.balance) * 100)) : 0;
  const done  = netWorth >= target.balance;
  return (
    <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <div>
          <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{label}</span>
          <span className="muted" style={{ fontSize: '0.74rem', marginLeft: 8 }}>{description}</span>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
          <span style={{ fontSize: '0.78rem', color: 'var(--fg-muted)' }}>
            {fmtMoney(netWorth)} / <strong>{fmtMoney(target.balance)}</strong>
          </span>
          <span style={{ fontSize: '0.78rem', color: done ? 'var(--green)' : color, fontWeight: 600 }}>
            {done ? 'Achieved' : target.yearsGrowth !== null ? `${target.yearsGrowth}yr` : '—'}
          </span>
          {!done && target.estimatedDate && (
            <span className="muted" style={{ fontSize: '0.74rem' }}>{target.estimatedDate}</span>
          )}
        </div>
      </div>
      <div style={{ background: 'var(--bg-overlay)', borderRadius: 4, height: 7, overflow: 'hidden' }}>
        <div style={{
          height: '100%', width: `${pct}%`,
          background: done ? 'var(--green)' : color,
          borderRadius: 4, transition: 'width 0.4s ease',
        }} />
      </div>
      <div style={{ fontSize: '0.7rem', color: 'var(--fg-subtle)', marginTop: 3 }}>
        {pct.toFixed(1)}% funded
        {!done && target.yearsLinear !== null && (
          <span> · {target.yearsLinear.toFixed(1)}yr linear</span>
        )}
      </div>
    </div>
  );
}

function BracketTable({ details, label }: { details: BracketDetail[]; label: string }) {
  const [open, setOpen] = useState(false);
  if (details.length === 0) return null;
  return (
    <div style={{ marginTop: 4 }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--fg-muted)', fontSize: '0.7rem', padding: 0, display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        <span style={{ fontSize: '0.65rem' }}>{open ? '▼' : '▶'}</span>
        {label} bracket details
      </button>
      {open && (
        <table style={{ width: '100%', fontSize: '0.7rem', borderCollapse: 'collapse', marginTop: 4 }}>
          <thead>
            <tr style={{ color: 'var(--fg-subtle)', textAlign: 'right' }}>
              <th style={{ textAlign: 'left', fontWeight: 400, paddingBottom: 2 }}>Bracket</th>
              <th style={{ fontWeight: 400, paddingBottom: 2 }}>Rate</th>
              <th style={{ fontWeight: 400, paddingBottom: 2 }}>Income in bracket</th>
              <th style={{ fontWeight: 400, paddingBottom: 2 }}>Tax</th>
            </tr>
          </thead>
          <tbody>
            {details.map((d, i) => (
              <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={{ padding: '2px 0', color: 'var(--fg-sec)' }}>
                  {fmtMoney(d.floor)} – {d.ceiling !== null ? fmtMoney(d.ceiling) : '∞'}
                </td>
                <td style={{ textAlign: 'right', color: 'var(--fg-sec)' }}>{fmtPct(d.rate)}</td>
                <td style={{ textAlign: 'right' }}>{fmtMoney(d.amountInBracket)}</td>
                <td style={{ textAlign: 'right', color: 'var(--red)' }}>−{fmtMoney(d.taxAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
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

          {/* FI Targets */}
          <div className="section-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <h2 style={{ fontSize: '0.95rem', fontWeight: 600 }}>FI Targets</h2>
              <span className="muted" style={{ fontSize: '0.76rem' }}>
                Net Worth: <strong style={{ color: 'var(--fg)' }}>{fmtMoney(result.existingAssets)}</strong>
                {result.monthlyRetiredExpenses > 0 && (
                  <> · Retired expenses: {fmtMoney(result.monthlyRetiredExpenses)}/mo</>
                )}
              </span>
            </div>
            <RetirementWithdrawalBanner rw={result.retirementWithdrawal} />

            <TargetRow
              label="Conservative (SWR)"
              description={`expenses ÷ ${fmtPct(config?.safeWithdrawalRate ?? 0.04)} withdrawal rate`}
              target={result.targetSwr}
              netWorth={result.existingAssets}
              color="var(--blue)"
            />

            {result.targetSustainable && (
              <TargetRow
                label="Self-Sustaining"
                description={`expenses ÷ ${fmtPct(config?.assumedGrowthRate ?? 0)} growth rate — portfolio never declines`}
                target={result.targetSustainable}
                netWorth={result.existingAssets}
                color="var(--purple, var(--blue))"
              />
            )}

            {result.targetExplicit && (
              <TargetRow
                label="My Goal"
                description="user-defined target"
                target={result.targetExplicit}
                netWorth={result.existingAssets}
                color="var(--green)"
              />
            )}

            <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.76rem', color: 'var(--fg-muted)' }}>
                Monthly surplus: <strong style={{ color: result.monthlyIncome - result.monthlyExpenses >= 0 ? 'var(--green)' : 'var(--red)' }}>
                  {fmtMoney(result.monthlyIncome - result.monthlyExpenses)}/mo
                </strong>
              </span>
              <span style={{ fontSize: '0.76rem', color: 'var(--fg-muted)' }}>
                SWR: {fmtPct(config?.safeWithdrawalRate ?? 0.04)} ·
                Growth: {fmtPct(config?.assumedGrowthRate ?? 0)}
              </span>
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
                <div style={{ fontSize: '0.82rem', fontWeight: 600, marginBottom: 8 }}>Working Phase</div>
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
                  <div key={j.jurisdictionId} style={{ marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 600, marginBottom: 4 }}>
                      <span>{j.name} ({j.abbreviation})</span>
                      <span className="red">−{fmtMoney(j.totalTax)}</span>
                    </div>
                    <div style={{ paddingLeft: 12 }}>
                      {j.standardDeduction > 0 && (
                        <div className="stat-row" style={{ fontSize: '0.72rem' }}>
                          <span className="stat-label muted">Standard deduction</span>
                          <span className="stat-value muted">−{fmtMoney(j.standardDeduction)}</span>
                        </div>
                      )}
                      {j.netOrdinaryTaxable > 0 && (
                        <div className="stat-row" style={{ fontSize: '0.72rem' }}>
                          <span className="stat-label muted">Ordinary taxable (after deduction)</span>
                          <span className="stat-value muted">{fmtMoney(j.netOrdinaryTaxable)}</span>
                        </div>
                      )}
                      {j.ordinaryTax > 0 && (
                        <>
                          <div className="stat-row" style={{ fontSize: '0.76rem' }}>
                            <span className="stat-label muted">
                              Ordinary tax <span style={{ color: 'var(--fg-subtle)' }}>(marginal {fmtPct(j.marginalOrdinaryRate)})</span>
                            </span>
                            <span className="stat-value red">−{fmtMoney(j.ordinaryTax)}</span>
                          </div>
                          <BracketTable details={j.ordinaryBracketDetails} label="Ordinary" />
                        </>
                      )}
                      {j.ltGainsTax > 0 && (
                        <>
                          <div className="stat-row" style={{ fontSize: '0.76rem', marginTop: 2 }}>
                            <span className="stat-label muted">
                              LT gains tax <span style={{ color: 'var(--fg-subtle)' }}>(marginal {fmtPct(j.ltMarginalRate)})</span>
                            </span>
                            <span className="stat-value red">−{fmtMoney(j.ltGainsTax)}</span>
                          </div>
                          <BracketTable details={j.ltBracketDetails} label="LT gains" />
                        </>
                      )}
                      <div className="stat-row" style={{ fontSize: '0.72rem', marginTop: 2 }}>
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

                {result!.retirementWithdrawal.jurisdictionTaxes.length > 0 && (
                  <>
                    <div style={{ borderTop: '1px solid var(--border)', margin: '14px 0 10px' }} />
                    <RetirementWaterfall rw={result!.retirementWithdrawal} />
                  </>
                )}
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
              <NumField label="Explicit FI Target ($, optional)"  name="fiExplicitTarget"           value={cfg.fiExplicitTarget ?? 0}        onChange={setField} />
              <label className="field">
                Retirement Withdrawal Type
                <select
                  value={cfg.retirementWithdrawalType ?? 'long_term_gains'}
                  onChange={e => setDraft(d => ({ ...d, retirementWithdrawalType: e.target.value as 'long_term_gains' | 'ordinary' }))}
                >
                  <option value="long_term_gains">Long-Term Capital Gains</option>
                  <option value="ordinary">Ordinary Income (e.g. 401k withdrawals)</option>
                </select>
              </label>
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
