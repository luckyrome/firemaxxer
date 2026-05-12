import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  getAnalyses, createAnalysis, updateAnalysis, deleteAnalysis,
  getScenarios, createScenario, updateScenario, deleteScenario, getRefiResult,
} from '../api/refi';
import { PageHelp } from '../components/HelpDialog';
import type { RefiAnalysis, RefiScenario, RefiResults } from '../types';

function fmtMoney(v: number) {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(v: number) {
  return (v * 100).toFixed(3) + '%';
}

function yTick(v: number) {
  if (Math.abs(v) >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(v) >= 1_000)     return '$' + (v / 1_000).toFixed(0) + 'k';
  return '$' + v.toFixed(0);
}

const GAIN_COLORS    = ['#3fb950', '#2d9c3f', '#6ecf7e', '#1e6b2d', '#9de5a8'];
const LOSS_COLORS    = ['#f85149', '#e03e38', '#ff7c78', '#b91c1c', '#ffa09e'];
const CURRENT_COLOR  = '#8b949e';

// Shared simulation: runs month-by-month to `months`, investing the monthly surplus
// (maxMonthlyPayment − monthlyPayment) during the loan and the full maxMonthlyPayment after payoff.
function simulateScenario(
  balance: number,
  monthlyRate: number,
  monthlyPayment: number,
  months: number,
  maxMonthlyPayment: number,
  monthlyInvestRate: number,
): { cumulativeInterest: number; portfolio: number } {
  const surplus = maxMonthlyPayment - monthlyPayment;
  let rem = balance, cumInterest = 0, portfolio = 0, paidOff = false;
  for (let m = 1; m <= months; m++) {
    if (!paidOff) {
      const interest  = rem * monthlyRate;
      const principal = Math.max(0, Math.min(monthlyPayment - interest, rem));
      cumInterest    += interest;
      rem             = Math.max(0, rem - principal);
      portfolio       = portfolio * (1 + monthlyInvestRate) + surplus;
      if (rem < 0.01) { rem = 0; paidOff = true; }
    } else {
      portfolio = portfolio * (1 + monthlyInvestRate) + maxMonthlyPayment;
    }
  }
  return { cumulativeInterest: cumInterest, portfolio };
}

// ── Comparison chart ──────────────────────────────────────────────────────────

function RefiComparisonChart({
  analysis, scenarios, result, hiddenIds, gainMap,
}: {
  analysis: RefiAnalysis;
  scenarios: RefiScenario[];
  result: RefiResults;
  hiddenIds: Set<string>;
  gainMap: Map<string, number>;
}) {
  const currentBalance     = parseFloat(analysis.loan_current_balance);
  const investmentRate     = parseFloat(analysis.assumed_investment_rate) / 12;
  const homeValue          = analysis.home_value_after_loan ? parseFloat(analysis.home_value_after_loan) : null;
  const startingEquity     = homeValue !== null ? homeValue - currentBalance : 0;
  const currentMonthlyRate = parseFloat(analysis.current_annual_rate) / 12;

  const maxScenarioYears = scenarios.reduce((m, s) => Math.max(m, s.term_years), 0);
  const currentRemYears  = Math.ceil(result.current.remainingMonths / 12);
  const maxYears         = Math.max(currentRemYears, maxScenarioYears);

  // Normalize: everyone "spends" the highest monthly payment across all options.
  // The surplus (maxPayment − thisPayment) is invested each month during the loan term.
  // After payoff, the full maxPayment goes into the portfolio.
  // This makes all scenarios truly apples-to-apples.
  const maxMonthlyPayment = Math.max(
    result.current.monthlyPayment,
    ...result.scenarios.map(sr => sr.monthlyPayment),
  );

  function simulate(
    balance: number,
    monthlyRate: number,
    monthlyPayment: number,
    originationFee: number,
  ): number[] {
    const monthlySurplus = maxMonthlyPayment - monthlyPayment;
    const vals: number[] = [startingEquity - originationFee];
    let rem         = balance;
    let cumInterest = 0;
    let portfolio   = 0;
    let paidOff     = false;

    for (let m = 1; m <= maxYears * 12; m++) {
      if (!paidOff) {
        const interest  = rem * monthlyRate;
        const principal = Math.max(0, Math.min(monthlyPayment - interest, rem));
        cumInterest    += interest;
        rem             = Math.max(0, rem - principal);
        // Invest whatever is left over from the max monthly budget
        portfolio = portfolio * (1 + investmentRate) + monthlySurplus;
        if (rem < 0.01) { rem = 0; paidOff = true; }
      } else {
        // Loan paid off — invest the full normalized budget
        portfolio = portfolio * (1 + investmentRate) + maxMonthlyPayment;
      }
      if (m % 12 === 0) {
        vals.push(startingEquity - originationFee - cumInterest + portfolio);
      }
    }
    return vals;
  }

  type SeriesDef = { key: string; label: string; color: string; vals: number[] };
  let gainIdx = 0, lossIdx = 0;

  const allSeries: SeriesDef[] = [
    { key: 'current', label: 'Current Loan', color: CURRENT_COLOR, vals: simulate(currentBalance, currentMonthlyRate, result.current.monthlyPayment, 0) },
  ];
  for (const s of scenarios) {
    const sr = result.scenarios.find(x => x.scenarioId === s.id);
    if (!sr) continue;
    const isGain = (gainMap.get(s.id) ?? 0) > 0;
    const color  = isGain ? GAIN_COLORS[gainIdx++ % GAIN_COLORS.length] : LOSS_COLORS[lossIdx++ % LOSS_COLORS.length];
    allSeries.push({
      key: s.id, label: s.label, color,
      vals: simulate(currentBalance, parseFloat(s.annual_rate) / 12, sr.monthlyPayment, parseFloat(s.origination_fee)),
    });
  }

  const visibleSeries = allSeries.filter(s => s.key === 'current' || !hiddenIds.has(s.key));

  const chartData = Array.from({ length: maxYears + 1 }, (_, yr) => {
    const pt: Record<string, number | undefined> = { year: yr };
    for (const s of visibleSeries) {
      if (yr < s.vals.length) pt[s.key] = s.vals[yr];
    }
    return pt;
  });

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ marginBottom: 10 }}>
        <h2 style={{ fontSize: '0.88rem', fontWeight: 600 }}>Scenario Comparison</h2>
        <p className="muted" style={{ fontSize: '0.72rem', marginTop: 2 }}>
          {homeValue
            ? `Starting from home equity (${fmtMoney(homeValue)} − ${fmtMoney(currentBalance)}) · `
            : 'Net position from $0 · '}
          Normalized to {fmtMoney(maxMonthlyPayment)}/mo — surplus over each scenario's payment is invested immediately.
          Post-payoff the full {fmtMoney(maxMonthlyPayment)}/mo is invested at {fmtPct(parseFloat(analysis.assumed_investment_rate))}.
          Green = net gain · Red = net loss.
        </p>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="year"
            tickFormatter={(y: number) => y === 0 ? 'Today' : `+${y}yr`}
            tick={{ fontSize: 11, fill: 'var(--fg-muted)' }}
          />
          <YAxis
            tickFormatter={yTick}
            tick={{ fontSize: 11, fill: 'var(--fg-muted)' }}
            width={72}
          />
          <Tooltip
            labelFormatter={(y) => (y as number) === 0 ? 'Today' : `Year ${y as number}`}
            formatter={(v, name) => [fmtMoney(v as number), name as string]}
            contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: 'var(--fg-muted)' }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {visibleSeries.map(s => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Analysis modal ────────────────────────────────────────────────────────────

interface AForm {
  name: string; loan_original_value: string; loan_current_balance: string;
  current_annual_rate: string; months_in: string; assumed_investment_rate: string;
  home_value_after_loan: string;
}

const EMPTY_A: AForm = {
  name: '', loan_original_value: '', loan_current_balance: '',
  current_annual_rate: '', months_in: '0', assumed_investment_rate: '5',
  home_value_after_loan: '',
};

function AnalysisModal({ existing, onClose, onSave }: {
  existing?: RefiAnalysis; onClose: () => void; onSave: (a: RefiAnalysis) => void;
}) {
  const [form, setForm] = useState<AForm>(
    existing
      ? {
          name: existing.name,
          loan_original_value: existing.loan_original_value,
          loan_current_balance: existing.loan_current_balance,
          current_annual_rate: (parseFloat(existing.current_annual_rate) * 100).toFixed(3),
          months_in: String(existing.months_in),
          assumed_investment_rate: (parseFloat(existing.assumed_investment_rate) * 100).toFixed(3),
          home_value_after_loan: existing.home_value_after_loan ?? '',
        }
      : EMPTY_A,
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        loan_original_value: parseFloat(form.loan_original_value),
        loan_current_balance: parseFloat(form.loan_current_balance),
        current_annual_rate: parseFloat(form.current_annual_rate) / 100,
        months_in: parseInt(form.months_in),
        assumed_investment_rate: parseFloat(form.assumed_investment_rate) / 100,
        home_value_after_loan: form.home_value_after_loan ? parseFloat(form.home_value_after_loan) : null,
      };
      let result: RefiAnalysis;
      if (existing) result = await updateAnalysis(existing.id, payload);
      else result = await createAnalysis(payload);
      onSave(result);
    } catch (err: any) {
      setError(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function set(k: keyof AForm) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" style={{ width: 500 }} onClick={e => e.stopPropagation()}>
        <div className="dialog-title">{existing ? 'Edit Analysis' : 'New Refi Analysis'}</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div className="field-error">{error}</div>}
          <div className="form-grid">
            <label className="field field-full">Name <input value={form.name} onChange={set('name')} required /></label>
            <label className="field">Original Loan Value <input type="number" min="0" step="0.01" value={form.loan_original_value} onChange={set('loan_original_value')} required /></label>
            <label className="field">Current Balance <input type="number" min="0" step="0.01" value={form.loan_current_balance} onChange={set('loan_current_balance')} required /></label>
            <label className="field">Current Rate (%) <input type="number" min="0" step="0.001" value={form.current_annual_rate} onChange={set('current_annual_rate')} required /></label>
            <label className="field">Months In <input type="number" min="0" value={form.months_in} onChange={set('months_in')} required /></label>
            <label className="field">Assumed Investment Rate (%) <input type="number" min="0" step="0.001" value={form.assumed_investment_rate} onChange={set('assumed_investment_rate')} required /></label>
            <label className="field">Home Value After Payoff <input type="number" min="0" step="0.01" value={form.home_value_after_loan} onChange={set('home_value_after_loan')} placeholder="optional" /></label>
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

// ── Scenario modal ─────────────────────────────────────────────────────────────

interface SForm { label: string; term_years: string; annual_rate: string; origination_fee: string; }
const EMPTY_S: SForm = { label: '', term_years: '30', annual_rate: '', origination_fee: '0' };

function ScenarioModal({ analysisId, existing, onClose, onSave }: {
  analysisId: string; existing?: RefiScenario; onClose: () => void; onSave: () => void;
}) {
  const [form, setForm] = useState<SForm>(
    existing
      ? {
          label: existing.label,
          term_years: String(existing.term_years),
          annual_rate: (parseFloat(existing.annual_rate) * 100).toFixed(3),
          origination_fee: parseFloat(existing.origination_fee).toFixed(0),
        }
      : EMPTY_S,
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        label: form.label,
        term_years: parseInt(form.term_years),
        annual_rate: parseFloat(form.annual_rate) / 100,
        origination_fee: parseFloat(form.origination_fee) || 0,
      };
      if (existing) await updateScenario(analysisId, existing.id, payload);
      else await createScenario(analysisId, payload);
      onSave();
    } catch (err: any) {
      setError(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-title">{existing ? 'Edit Scenario' : 'Add Scenario'}</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div className="field-error">{error}</div>}
          <label className="field">Label <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} required /></label>
          <div className="form-grid">
            <label className="field">Term (years) <input type="number" min="1" max="50" value={form.term_years} onChange={e => setForm(f => ({ ...f, term_years: e.target.value }))} required /></label>
            <label className="field">Annual Rate (%) <input type="number" min="0" step="0.001" value={form.annual_rate} onChange={e => setForm(f => ({ ...f, annual_rate: e.target.value }))} required /></label>
            <label className="field">Origination Fee ($)
              <input type="number" min="0" step="1" value={form.origination_fee} onChange={e => setForm(f => ({ ...f, origination_fee: e.target.value }))} />
            </label>
          </div>
          <p className="muted" style={{ fontSize: '0.74rem', margin: '-4px 0 0' }}>
            Origination fee is a one-time closing cost deducted from the net gain calculation.
          </p>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Analysis detail ────────────────────────────────────────────────────────────

function AnalysisDetail({ analysis }: { analysis: RefiAnalysis }) {
  const qc = useQueryClient();
  const [scenarioModal,    setScenarioModal]    = useState<'new' | RefiScenario | null>(null);
  const [sortByGain,       setSortByGain]       = useState<'desc' | 'asc' | null>(null);
  const [hiddenScenarios,  setHiddenScenarios]  = useState<Set<string>>(new Set());

  const { data: scenarios = [] } = useQuery({
    queryKey: ['refi-scenarios', analysis.id],
    queryFn: () => getScenarios(analysis.id),
  });

  const { data: result } = useQuery({
    queryKey: ['refi-result', analysis.id],
    queryFn: () => getRefiResult(analysis.id),
    enabled: scenarios.length > 0,
  });

  const deleteMut = useMutation({
    mutationFn: ({ scenarioId }: { scenarioId: string }) => deleteScenario(analysis.id, scenarioId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['refi-scenarios', analysis.id] });
      qc.invalidateQueries({ queryKey: ['refi-result', analysis.id] });
    },
  });

  function handleScenarioSaved() {
    qc.invalidateQueries({ queryKey: ['refi-scenarios', analysis.id] });
    qc.invalidateQueries({ queryKey: ['refi-result', analysis.id] });
    setScenarioModal(null);
  }

  function toggleHidden(id: string) {
    setHiddenScenarios(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function cycleSort() {
    setSortByGain(s => s === null ? 'desc' : s === 'desc' ? 'asc' : null);
  }

  const maxMonthlyPayment = result
    ? Math.max(result.current.monthlyPayment, ...result.scenarios.map(sr => sr.monthlyPayment))
    : 0;

  // Per-scenario derived metrics, computed against the current-loan baseline at the
  // end of max(currentRemainingMonths, scenarioTermMonths).
  type DerivedMetrics = { netGain: number; investedDelta: number };
  const derived = new Map<string, DerivedMetrics>();
  if (result) {
    const cBal  = parseFloat(analysis.loan_current_balance);
    const cRate = parseFloat(analysis.current_annual_rate) / 12;
    const iRate = parseFloat(analysis.assumed_investment_rate) / 12;
    for (const s of scenarios) {
      const sr = result.scenarios.find(x => x.scenarioId === s.id);
      if (!sr) continue;
      const T           = Math.max(result.current.remainingMonths, s.term_years * 12);
      const origFee     = parseFloat(s.origination_fee);
      const currentSim  = simulateScenario(cBal, cRate, result.current.monthlyPayment, T, maxMonthlyPayment, iRate);
      const scenarioSim = simulateScenario(cBal, parseFloat(s.annual_rate) / 12, sr.monthlyPayment, T, maxMonthlyPayment, iRate);
      const investedDelta  = scenarioSim.portfolio - currentSim.portfolio;
      const interestSavings = currentSim.cumulativeInterest - scenarioSim.cumulativeInterest;
      derived.set(s.id, { investedDelta, netGain: interestSavings + investedDelta - origFee });
    }
  }

  const gainMap = new Map([...derived].map(([id, d]) => [id, d.netGain]));

  const sortedScenarios = (() => {
    if (!sortByGain) return scenarios;
    return [...scenarios].sort((a, b) => {
      const ga = derived.get(a.id)?.netGain ?? 0;
      const gb = derived.get(b.id)?.netGain ?? 0;
      return sortByGain === 'desc' ? gb - ga : ga - gb;
    });
  })();

  return (
    <div>
      <div className="summary-cards" style={{ marginBottom: 16 }}>
        <div className="summary-card">
          <div className="summary-card-label">Current Balance</div>
          <div className="summary-card-value">{fmtMoney(parseFloat(analysis.loan_current_balance))}</div>
        </div>
        <div className="summary-card">
          <div className="summary-card-label">Current Rate</div>
          <div className="summary-card-value">{fmtPct(parseFloat(analysis.current_annual_rate))}</div>
        </div>
        {result && (
          <>
            <div className="summary-card">
              <div className="summary-card-label">Current Payment / Mo</div>
              <div className="summary-card-value">{fmtMoney(result.current.monthlyPayment)}</div>
            </div>
            <div className="summary-card">
              <div className="summary-card-label">Remaining Months</div>
              <div className="summary-card-value">{result.current.remainingMonths}</div>
            </div>
          </>
        )}
      </div>

      <div className="section-header">
        <h2>Scenarios</h2>
        <button className="btn btn-primary" onClick={() => setScenarioModal('new')}>+ Add Scenario</button>
      </div>

      {scenarios.length === 0 && !result ? (
        <div className="empty-state"><p>Add scenarios to compare refinance options.</p></div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Label</th><th>Term</th><th className="num">Rate</th>
              <th className="num">Payment/Mo</th><th className="num">Delta/Mo</th><th className="num">Total Interest</th>
              <th className="num">Interest Diff</th><th className="num">Orig. Fee</th>
              <th className="num" title={`Investment portfolio difference vs current loan at end of the longer term. Normalized to ${result ? fmtMoney(maxMonthlyPayment) : '—'}/mo — surplus invested at ${fmtPct(parseFloat(analysis.assumed_investment_rate))}.`}>Invested Δ</th>
              <th
                className="num"
                style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                onClick={cycleSort}
                title="Sort by net gain"
              >
                Net Gain {sortByGain === 'desc' ? '▼' : sortByGain === 'asc' ? '▲' : '⇅'}
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {/* Baseline: current loan — read-only reference row */}
            {result && (
              <tr style={{ background: 'var(--bg-overlay)', opacity: 0.85 }}>
                <td>
                  <span style={{ fontWeight: 600 }}>Current Loan</span>
                  <span className="tag" style={{ fontSize: '0.65rem', marginLeft: 6 }}>baseline</span>
                </td>
                <td>~{Math.ceil(result.current.remainingMonths / 12)}yr left</td>
                <td className="num">{fmtPct(parseFloat(analysis.current_annual_rate))}</td>
                <td className="num">{fmtMoney(result.current.monthlyPayment)}</td>
                <td className="num muted">—</td>
                <td className="num">{fmtMoney(result.current.totalInterestRemaining)}</td>
                <td className="num muted">—</td>
                <td className="num muted">—</td>
                <td className="num muted" title="Baseline — all scenarios are measured relative to this">±$0</td>
                <td className="num muted">—</td>
                <td className="actions-cell" />
              </tr>
            )}
            {sortedScenarios.map(s => {
              const r = result?.scenarios.find(x => x.scenarioId === s.id);
              const d = derived.get(s.id);
              const rowBg = d && d.netGain > 0
                ? 'var(--tag-green-bg)'
                : d && d.netGain < 0
                  ? 'var(--tag-red-bg)'
                  : undefined;
              return (
                <tr key={s.id} style={{ background: rowBg }}>
                  <td>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={!hiddenScenarios.has(s.id)}
                        onChange={() => toggleHidden(s.id)}
                      />
                      {s.label}
                    </label>
                  </td>
                  <td>{s.term_years}yr</td>
                  <td className="num">{fmtPct(parseFloat(s.annual_rate))}</td>
                  <td className="num">{r ? fmtMoney(r.monthlyPayment) : '—'}</td>
                  <td className={`num ${r && r.monthlyDelta < 0 ? 'green' : r && r.monthlyDelta > 0 ? 'red' : ''}`}>
                    {r ? (r.monthlyDelta > 0 ? '+' : '') + fmtMoney(r.monthlyDelta) : '—'}
                  </td>
                  <td className="num">{r ? fmtMoney(r.totalInterest) : '—'}</td>
                  <td className={`num ${r && r.totalInterestDiff < 0 ? 'green' : r && r.totalInterestDiff > 0 ? 'red' : ''}`}>
                    {r ? (r.totalInterestDiff > 0 ? '+' : '') + fmtMoney(r.totalInterestDiff) : '—'}
                  </td>
                  <td className="num">{r && r.originationFee > 0 ? <span className="red">−{fmtMoney(r.originationFee)}</span> : <span className="muted">—</span>}</td>
                  <td className={`num ${d && d.investedDelta > 0 ? 'green' : d && d.investedDelta < 0 ? 'red' : ''}`}>
                    {d ? (d.investedDelta > 0 ? '+' : d.investedDelta < 0 ? '−' : '') + fmtMoney(Math.abs(d.investedDelta)) : '—'}
                  </td>
                  <td className={`num ${d && d.netGain > 0 ? 'green' : d && d.netGain < 0 ? 'red' : ''}`}>
                    {d ? (d.netGain > 0 ? '+' : d.netGain < 0 ? '−' : '') + fmtMoney(Math.abs(d.netGain)) : '—'}
                  </td>
                  <td className="actions-cell">
                    <button className="btn" style={{ fontSize: '0.75rem', padding: '3px 10px' }} onClick={() => setScenarioModal(s)}>Edit</button>
                    <button className="btn btn-danger" style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                      onClick={() => { if (confirm(`Delete "${s.label}"?`)) deleteMut.mutate({ scenarioId: s.id }); }}>Del</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {result && scenarios.length > 0 && (
        <RefiComparisonChart analysis={analysis} scenarios={scenarios} result={result} hiddenIds={hiddenScenarios} gainMap={gainMap} />
      )}

      {scenarioModal && (
        <ScenarioModal
          analysisId={analysis.id}
          existing={scenarioModal === 'new' ? undefined : scenarioModal}
          onClose={() => setScenarioModal(null)}
          onSave={handleScenarioSaved}
        />
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function RefiPage() {
  const qc = useQueryClient();
  const [analysisModal, setAnalysisModal] = useState<'new' | RefiAnalysis | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const { data: analyses = [], isLoading } = useQuery({
    queryKey: ['refi-analyses'],
    queryFn: getAnalyses,
  });

  const deleteMut = useMutation({
    mutationFn: deleteAnalysis,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['refi-analyses'] });
      if (selected === id) setSelected(null);
    },
  });

  function handleAnalysisSaved(a: RefiAnalysis) {
    qc.invalidateQueries({ queryKey: ['refi-analyses'] });
    setAnalysisModal(null);
    setSelected(a.id);
  }

  const activeAnalysis = analyses.find(a => a.id === selected);

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h1>Refi Calculator</h1>
          <PageHelp page="refi" />
        </div>
        <button className="btn btn-primary" onClick={() => setAnalysisModal('new')}>+ New Analysis</button>
      </div>

      {isLoading ? <p className="muted">Loading…</p> : analyses.length === 0 ? (
        <div className="empty-state"><p>No analyses yet. Create one to compare refinance scenarios.</p></div>
      ) : (
        <>
          <div className="section-card">
            <div className="section-header"><h2>Analyses</h2></div>
            <table className="data-table">
              <thead>
                <tr><th>Name</th><th className="num">Balance</th><th className="num">Current Rate</th><th className="num">Months In</th><th></th></tr>
              </thead>
              <tbody>
                {analyses.map(a => (
                  <tr key={a.id}
                    className={`data-row ${selected === a.id ? 'expanded' : ''}`}
                    onClick={() => setSelected(selected === a.id ? null : a.id)}
                  >
                    <td className="name-cell">
                      <span className="expand-arrow">{selected === a.id ? '▾' : '▸'}</span>
                      {a.name}
                    </td>
                    <td className="num">{fmtMoney(parseFloat(a.loan_current_balance))}</td>
                    <td className="num">{fmtPct(parseFloat(a.current_annual_rate))}</td>
                    <td className="num">{a.months_in}</td>
                    <td className="actions-cell" onClick={e => e.stopPropagation()}>
                      <button className="btn" style={{ fontSize: '0.75rem', padding: '3px 10px' }} onClick={() => setAnalysisModal(a)}>Edit</button>
                      <button className="btn btn-danger" style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                        onClick={() => { if (confirm(`Delete "${a.name}"?`)) deleteMut.mutate(a.id); }}>Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {activeAnalysis && (
            <div className="section-card">
              <div className="section-header">
                <h2>{activeAnalysis.name}</h2>
              </div>
              <AnalysisDetail analysis={activeAnalysis} />
            </div>
          )}
        </>
      )}

      {analysisModal && (
        <AnalysisModal
          existing={analysisModal === 'new' ? undefined : analysisModal}
          onClose={() => setAnalysisModal(null)}
          onSave={handleAnalysisSaved}
        />
      )}
    </div>
  );
}
