import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSettings, updateSettings } from '../api/settings';
import { getFireResult } from '../api/refi';
import { getExpenseSnapshots } from '../api/expenses';
import type { FireConfig } from '../types';

function fmtMoney(v: number) {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
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
  const [draft, setDraft] = useState<Partial<FireConfig>>({});

  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  });

  const { data: result, isLoading: resultLoading } = useQuery({
    queryKey: ['fire-result'],
    queryFn: getFireResult,
  });

  const { data: snapshots = [] } = useQuery({
    queryKey: ['expense-snapshots'],
    queryFn: getExpenseSnapshots,
  });

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

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    saveMutation.mutate(draft);
  }

  const cfg = (editing ? draft : config) as FireConfig | undefined;

  if (configLoading) return <div className="loading">Loading…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <h1>FIRE Dashboard</h1>
        {!editing && (
          <button className="btn btn-primary" onClick={startEdit}>Edit Settings</button>
        )}
      </div>

      {/* Result cards */}
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
              <div className="summary-card-value">
                {result.yearsToFI !== null ? result.yearsToFI.toFixed(1) : '—'}
              </div>
            </div>
            <div className="summary-card">
              <div className="summary-card-label">Years to FI (with growth)</div>
              <div className="summary-card-value blue">
                {result.yearsToFIWithGrowth !== null ? result.yearsToFIWithGrowth : '—'}
              </div>
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

          <div className="section-card">
            <div className="section-header"><h2>Tax Details</h2></div>
            <div className="stat-row"><span className="stat-label">Gross Income</span><span className="stat-value">{fmtMoney(result.taxDetails.grossIncome)}</span></div>
            <div className="stat-row"><span className="stat-label">CA State Tax</span><span className="stat-value red">{fmtMoney(result.taxDetails.caTotal)}</span></div>
            <div className="stat-row"><span className="stat-label">Federal Tax</span><span className="stat-value red">{fmtMoney(result.taxDetails.federalTotal)}</span></div>
            <div className="stat-row"><span className="stat-label">Net Monthly</span><span className="stat-value green">{fmtMoney(result.taxDetails.netMonthly)}</span></div>
          </div>
        </>
      )}

      {/* Settings form */}
      {editing && cfg && (
        <form onSubmit={handleSave}>
          <div className="section-card">
            <div className="section-header"><h2>Income</h2></div>
            <div className="form-grid">
              <NumField label="Annual Salary" name="annualSalary" value={cfg.annualSalary ?? 0} onChange={setField} />
              <NumField label="Annual Bonus" name="annualBonus" value={cfg.annualBonus ?? 0} onChange={setField} />
              <NumField label="RSU Quarterly Gross" name="rsuQuarterlyGross" value={cfg.rsuQuarterlyGross ?? 0} onChange={setField} />
              <NumField label="ESPP Quarterly Gain" name="esppQuarterlyGain" value={cfg.esppQuarterlyGain ?? 0} onChange={setField} />
              <NumField label="401(k) Annual Contribution" name="k401Annual" value={cfg.k401Annual ?? 0} onChange={setField} />
              <NumField label="Medical Deduction Annual" name="medicalDeductionAnnual" value={cfg.medicalDeductionAnnual ?? 0} onChange={setField} />
            </div>
          </div>

          <div className="section-card">
            <div className="section-header"><h2>Taxes</h2></div>
            <div className="form-grid">
              <NumField label="CA Marginal Rate (%)" name="caStateTaxRate" value={cfg.caStateTaxRate ?? 0} onChange={setField} pct />
              <NumField label="CA Prev Bracket Max" name="caMaxPrevBracket" value={cfg.caMaxPrevBracket ?? 0} onChange={setField} />
              <NumField label="CA Tax on Prev Bracket" name="caMaxTaxPrevBracket" value={cfg.caMaxTaxPrevBracket ?? 0} onChange={setField} />
              <NumField label="Federal Marginal Rate (%)" name="fedTaxRate" value={cfg.fedTaxRate ?? 0} onChange={setField} pct />
              <NumField label="Fed Prev Bracket Max" name="fedMaxPrevBracket" value={cfg.fedMaxPrevBracket ?? 0} onChange={setField} />
              <NumField label="Fed Tax on Prev Bracket" name="fedMaxTaxPrevBracket" value={cfg.fedMaxTaxPrevBracket ?? 0} onChange={setField} />
              <NumField label="LT Cap Gains Rate (%)" name="ltCapGainsRate" value={cfg.ltCapGainsRate ?? 0.15} onChange={setField} pct />
            </div>
          </div>

          <div className="section-card">
            <div className="section-header"><h2>FIRE Parameters</h2></div>
            <div className="form-grid">
              <NumField label="Safe Withdrawal Rate (%)" name="safeWithdrawalRate" value={cfg.safeWithdrawalRate ?? 0.04} onChange={setField} pct />
              <NumField label="Assumed Growth Rate (%)" name="assumedGrowthRate" value={cfg.assumedGrowthRate ?? 0.04} onChange={setField} pct />
              <NumField label="Target Retirement Annual Income" name="retirementAnnualIncome" value={cfg.retirementAnnualIncome ?? 0} onChange={setField} />
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
