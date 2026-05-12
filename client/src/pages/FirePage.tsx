import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { getSettings, updateSettings } from '../api/settings';
import { getFireResult } from '../api/refi';
import { getExpenseSnapshots } from '../api/expenses';
import { getNetWorth } from '../api/assets';
import { PageHelp } from '../components/HelpDialog';
import type { FireConfig, FireTargetResult, RetirementWithdrawal, BracketDetail, RetirementJurisdictionTax, NetWorthPoint, LiabilityWithLatest } from '../types';
import { getLiabilities } from '../api/assets';

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

// ── Projection chart ──────────────────────────────────────────────────────────

interface MortgageData {
  balance: number;
  monthlyRate: number;
  monthlyPayment: number;
}

interface ChartPoint {
  ts: number;
  assets?: number;
  liabilities?: number;
  netWorth?: number;
  projAssets?: number;
  projLiabilities?: number;
  projNetWorth?: number;
}

function computeMonthlyPayment(origBalance: number, monthlyRate: number, termMonths: number): number {
  if (monthlyRate === 0 || termMonths === 0) return origBalance / Math.max(termMonths, 1);
  const r = monthlyRate;
  const n = termMonths;
  return (origBalance * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
}

function parseMortgages(liabilities: LiabilityWithLatest[]): MortgageData[] {
  return liabilities
    .filter(l => l.type === 'mortgage' && l.latest_balance !== null && parseFloat(l.latest_balance!) > 0)
    .map(l => {
      const balance      = parseFloat(l.latest_balance!);
      const monthlyRate  = parseFloat(l.interest_rate) / 12;
      const origBalance  = l.original_balance ? parseFloat(l.original_balance) : balance;
      const termMonths   = l.term_months ?? 360;
      const monthlyPayment = computeMonthlyPayment(origBalance, monthlyRate, termMonths);
      return { balance, monthlyRate, monthlyPayment };
    });
}

function buildChartData(
  history: NetWorthPoint[],
  startAssets: number,
  startLiabilities: number,
  annualGrowthRate: number,
  baseSurplus: number,
  mortgages: MortgageData[],
  projectionYears: number,
): ChartPoint[] {
  const points: ChartPoint[] = history.map(h => ({
    ts: new Date(h.date + 'T00:00:00').getTime(),
    assets: h.totalAssets,
    liabilities: h.totalLiabilities,
    netWorth: h.netWorth,
  }));

  const startDate = history.length > 0
    ? new Date(history[history.length - 1].date + 'T00:00:00')
    : new Date();

  // Seed the projection anchor at the last historical point
  const anchorPoint: ChartPoint = { ts: startDate.getTime(), projAssets: startAssets, projLiabilities: startLiabilities, projNetWorth: startAssets - startLiabilities };
  if (points.length > 0) {
    Object.assign(points[points.length - 1], anchorPoint);
  } else {
    points.push(anchorPoint);
  }

  // Monthly simulation: mortgage payments come out of the surplus stream
  const monthlyGrowthRate = annualGrowthRate / 12;
  const mortBalances      = mortgages.map(m => m.balance);
  // effective surplus = baseSurplus minus all active mortgage payments (which reduce liabilities)
  let effectiveSurplus    = baseSurplus - mortgages.reduce((s, m) => s + m.monthlyPayment, 0);
  let investmentAssets    = startAssets;

  for (let year = 1; year <= projectionYears; year++) {
    for (let mo = 0; mo < 12; mo++) {
      // Invest the net surplus into assets
      investmentAssets = investmentAssets * (1 + monthlyGrowthRate) + effectiveSurplus;

      // Amortize each mortgage; free the payment once paid off
      for (let i = 0; i < mortgages.length; i++) {
        if (mortBalances[i] <= 0) continue;
        const { monthlyRate, monthlyPayment } = mortgages[i];
        const interest  = mortBalances[i] * monthlyRate;
        const principal = Math.min(monthlyPayment - interest, mortBalances[i]);
        mortBalances[i] = Math.max(0, mortBalances[i] - principal);
        if (mortBalances[i] === 0) {
          // Mortgage paid off — freed payment now goes to investment/reduces drawdown
          effectiveSurplus += monthlyPayment;
        }
      }
    }

    const totalLiabilities = mortBalances.reduce((s, b) => s + b, 0);
    const d = new Date(startDate);
    d.setFullYear(d.getFullYear() + year);
    points.push({
      ts:               d.getTime(),
      projAssets:       investmentAssets,
      projLiabilities:  totalLiabilities,
      projNetWorth:     investmentAssets - totalLiabilities,
    });
  }

  return points;
}

function yTick(v: number) {
  if (Math.abs(v) >= 1_000_000) return '$' + (v / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(v) >= 1_000)     return '$' + (v / 1_000).toFixed(0) + 'k';
  return '$' + v.toFixed(0);
}

const PROJ_SERIES = [
  { key: 'assets',      label: 'Assets',      color: 'var(--green)' },
  { key: 'liabilities', label: 'Liabilities', color: 'var(--red)'   },
  { key: 'netWorth',    label: 'Net Worth',    color: 'var(--blue)'  },
] as const;
type SeriesKey = typeof PROJ_SERIES[number]['key'];

function FireProjectionChart({
  history,
  existingAssets,
  monthlyIncome,
  monthlyExpenses,
  monthlyRetiredExpenses,
  assumedGrowthRate,
  fiTarget,
  liabilities,
}: {
  history: NetWorthPoint[];
  existingAssets: number;
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyRetiredExpenses: number;
  assumedGrowthRate: number;
  fiTarget: number;
  liabilities: LiabilityWithLatest[];
}) {
  const [includeIncome,    setIncludeIncome]    = useState(true);
  const [projectionYears,  setProjectionYears]  = useState<10 | 20 | 30>(10);
  const [hiddenSeries,     setHiddenSeries]     = useState<Set<SeriesKey>>(new Set());

  function toggleSeries(key: SeriesKey) {
    setHiddenSeries(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  const mortgages = parseMortgages(liabilities);

  const lastHistory    = history.length > 0 ? history[history.length - 1] : null;
  const totalMortgagePmt = mortgages.reduce((s, m) => s + m.monthlyPayment, 0);

  // Start assets/liabilities from last history point; if none, derive from net worth + mortgage balances
  const totalMortgageBal = mortgages.reduce((s, m) => s + m.balance, 0);
  const startLiabilities = lastHistory?.totalLiabilities ?? totalMortgageBal;
  const startAssets      = lastHistory?.totalAssets      ?? (existingAssets + startLiabilities);

  // baseSurplus excludes mortgage payments (modeled separately via amortization)
  const baseSurplus = includeIncome
    ? monthlyIncome - monthlyExpenses
    : -(monthlyRetiredExpenses > 0 ? monthlyRetiredExpenses : monthlyExpenses);

  const data = buildChartData(history, startAssets, startLiabilities, assumedGrowthRate, baseSurplus, mortgages, projectionYears);
  const hasHistory = history.length > 0;

  const subtitle = includeIncome
    ? `+${fmtMoney(monthlyIncome - monthlyExpenses)}/mo surplus invested`
    : `−${fmtMoney(monthlyRetiredExpenses > 0 ? monthlyRetiredExpenses : monthlyExpenses)}/mo drawdown`;
  const mortgageNote = totalMortgagePmt > 0
    ? ` · ${fmtMoney(totalMortgagePmt)}/mo mortgage P&I amortized separately`
    : '';

  return (
    <div className="section-card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
        <div>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 600 }}>Net Worth &amp; {projectionYears}-Year Projection</h2>
          <div className="muted" style={{ fontSize: '0.72rem', marginTop: 2 }}>
            {fmtPct(assumedGrowthRate)} annual growth · {subtitle}{mortgageNote}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 4 }}>
            {([10, 20, 30] as const).map(y => (
              <button
                key={y}
                className={`btn${projectionYears === y ? ' btn-primary' : ''}`}
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                onClick={() => setProjectionYears(y)}
              >{y}yr</button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className={`btn${includeIncome ? ' btn-primary' : ''}`}
              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              onClick={() => setIncludeIncome(true)}
            >
              With income
            </button>
            <button
              className={`btn${!includeIncome ? ' btn-primary' : ''}`}
              style={{ fontSize: '0.75rem', padding: '4px 10px' }}
              onClick={() => setIncludeIncome(false)}
            >
              Retired now
            </button>
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data} margin={{ top: 8, right: 24, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="ts"
            type="number"
            domain={['auto', 'auto']}
            scale="time"
            tickFormatter={(ts: number) => new Date(ts).getFullYear().toString()}
            tick={{ fontSize: 11, fill: 'var(--fg-muted)' }}
          />
          <YAxis
            tickFormatter={yTick}
            tick={{ fontSize: 11, fill: 'var(--fg-muted)' }}
            width={72}
          />
          <Tooltip
            labelFormatter={(ts) =>
              new Date(ts as number).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
            }
            formatter={(v, name) => [fmtMoney(v as number), name as string]}
            contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: 'var(--fg-muted)' }}
          />
          <Legend
            content={() => (
              <div style={{ display: 'flex', gap: 20, justifyContent: 'center', paddingTop: 10, fontSize: 12, flexWrap: 'wrap' }}>
                {PROJ_SERIES.map(s => (
                  <div
                    key={s.key}
                    onClick={() => toggleSeries(s.key)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      cursor: 'pointer', userSelect: 'none',
                      opacity: hiddenSeries.has(s.key) ? 0.3 : 1,
                    }}
                  >
                    <svg width="26" height="10" style={{ flexShrink: 0 }}>
                      <line x1="0" y1="5" x2="12" y2="5" stroke={s.color} strokeWidth="2.5" />
                      <line x1="14" y1="5" x2="20" y2="5" stroke={s.color} strokeWidth="2.5" strokeDasharray="4 2" />
                    </svg>
                    <span style={{ color: 'var(--fg-muted)' }}>{s.label}</span>
                  </div>
                ))}
              </div>
            )}
          />

          {hasHistory && <>
            <Line type="monotone" dataKey="assets"      stroke="var(--green)" strokeWidth={2} dot={false} connectNulls={false} legendType="none" hide={hiddenSeries.has('assets')} />
            <Line type="monotone" dataKey="liabilities" stroke="var(--red)"   strokeWidth={2} dot={false} connectNulls={false} legendType="none" hide={hiddenSeries.has('liabilities')} />
            <Line type="monotone" dataKey="netWorth"    stroke="var(--blue)"  strokeWidth={2} dot={false} connectNulls={false} legendType="none" hide={hiddenSeries.has('netWorth')} />
          </>}

          <Line type="monotone" dataKey="projAssets"      stroke="var(--green)" strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls={false} legendType="none" hide={hiddenSeries.has('assets')} />
          <Line type="monotone" dataKey="projLiabilities" stroke="var(--red)"   strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls={false} legendType="none" hide={hiddenSeries.has('liabilities')} />
          <Line type="monotone" dataKey="projNetWorth"    stroke="var(--blue)"  strokeWidth={2} strokeDasharray="6 3" dot={false} connectNulls={false} legendType="none" hide={hiddenSeries.has('netWorth')} />

          {fiTarget > 0 && (
            <ReferenceLine
              y={fiTarget}
              stroke="var(--green)"
              strokeDasharray="4 4"
              label={{ value: `FI ${yTick(fiTarget)}`, position: 'insideTopRight', fill: 'var(--green)', fontSize: 11 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Settings field ─────────────────────────────────────────────────────────────

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

  const { data: config,         isLoading: configLoading } = useQuery({ queryKey: ['settings'],     queryFn: getSettings });
  const { data: result,         isLoading: resultLoading } = useQuery({ queryKey: ['fire-result'],  queryFn: getFireResult });
  const { data: snapshots = [] }                           = useQuery({ queryKey: ['expense-snapshots'], queryFn: getExpenseSnapshots });
  const { data: netWorthHistory = [] }                     = useQuery({ queryKey: ['net-worth'],    queryFn: getNetWorth });
  const { data: liabilities = [] }                         = useQuery({ queryKey: ['liabilities'],  queryFn: getLiabilities });

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
  const latestNetWorth = netWorthHistory.length > 0 ? netWorthHistory[netWorthHistory.length - 1] : null;
  const surplus = result ? result.monthlyIncome - result.monthlyExpenses : 0;

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h1>Dashboard</h1>
          <PageHelp page="dashboard" />
        </div>
        {!editing && (
          <button className="btn btn-primary" onClick={startEdit}>Edit Settings</button>
        )}
      </div>

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

      {/* ── Result cards ────────────────────────────────────────────────── */}
      {result && !resultLoading && (
        <>
          <div className="summary-cards">
            <div className="summary-card">
              <div className="summary-card-label">Net Worth</div>
              <div className={`summary-card-value ${result.existingAssets >= 0 ? 'green' : 'red'}`}>
                {fmtMoney(result.existingAssets)}
              </div>
              {latestNetWorth && (
                <div style={{ fontSize: '0.72rem', color: 'var(--fg-subtle)', marginTop: 4 }}>as of {latestNetWorth.date}</div>
              )}
            </div>
            <div className="summary-card">
              <div className="summary-card-label">Monthly Income (net)</div>
              <div className="summary-card-value green">{fmtMoney(result.monthlyIncome)}</div>
            </div>
            <div className="summary-card">
              <div className="summary-card-label">Monthly Expenses</div>
              <div className="summary-card-value red">{fmtMoney(result.monthlyExpenses)}</div>
            </div>
            <div className="summary-card">
              <div className="summary-card-label">Monthly Surplus</div>
              <div className={`summary-card-value ${surplus >= 0 ? 'green' : 'red'}`}>
                {(surplus >= 0 ? '+' : '−') + fmtMoney(surplus)}
              </div>
            </div>
          </div>

          {/* Projection chart */}
          <FireProjectionChart
            history={netWorthHistory}
            existingAssets={result.existingAssets}
            monthlyIncome={result.monthlyIncome}
            monthlyExpenses={result.monthlyExpenses}
            monthlyRetiredExpenses={result.monthlyRetiredExpenses}
            assumedGrowthRate={config?.assumedGrowthRate ?? 0.04}
            fiTarget={result.targetSwr?.balance ?? 0}
            liabilities={liabilities}
          />

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

      {!editing && !result && !resultLoading && (
        <div className="empty-state" style={{ paddingTop: 80 }}>
          <p style={{ fontSize: '1rem', color: 'var(--fg-sec)', marginBottom: 6 }}>Welcome to Firemaxxer</p>
          <p style={{ marginBottom: 20 }}>Configure your settings to see your FIRE feasibility summary.</p>
          <button className="btn btn-primary" onClick={startEdit}>Set Up Settings</button>
        </div>
      )}
    </div>
  );
}
