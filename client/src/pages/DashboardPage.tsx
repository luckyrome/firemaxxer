import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getFireResult } from '../api/refi';
import { getSettings } from '../api/settings';
import { getNetWorth } from '../api/assets';

function fmtPct(r: number) {
  return (r * 100).toFixed(1) + '%';
}

function fmtMoney(v: number) {
  return '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtSigned(v: number) {
  return (v >= 0 ? '+' : '−') + fmtMoney(v);
}

function ProgressBar({ value, max, color = 'var(--blue)' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ background: 'var(--bg-overlay)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 4, transition: 'width 0.4s ease' }} />
    </div>
  );
}

export function DashboardPage() {
  const { data: result, isLoading: resultLoading } = useQuery({
    queryKey: ['fire-result'],
    queryFn: getFireResult,
    retry: false,
  });

  const { data: config } = useQuery({
    queryKey: ['settings'],
    queryFn: getSettings,
  });

  const { data: netWorthHistory = [] } = useQuery({
    queryKey: ['net-worth'],
    queryFn: getNetWorth,
  });

  const isConfigured = config && config.activeExpenseSnapshotId !== null;

  if (resultLoading) return <div className="loading">Loading…</div>;

  // Empty / not configured state
  if (!result || (!isConfigured)) {
    return (
      <div className="page">
        <div className="page-header"><h1>Dashboard</h1></div>
        <div className="empty-state" style={{ paddingTop: 80 }}>
          <p style={{ fontSize: '1rem', color: 'var(--fg-sec)', marginBottom: 6 }}>Welcome to Firemaxxer</p>
          <p style={{ marginBottom: 20 }}>Configure your FIRE settings to see your feasibility summary here.</p>
          <Link to="/fire" className="btn btn-primary">Set Up FIRE Settings</Link>
        </div>
      </div>
    );
  }

  const surplus = result.monthlyIncome - result.monthlyExpenses;

  const latestNetWorth = netWorthHistory.length > 0
    ? netWorthHistory[netWorthHistory.length - 1]
    : null;

  return (
    <div className="page">
      <div className="page-header"><h1>Dashboard</h1></div>

      {/* Top summary cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="summary-card-label">Net Worth</div>
          <div className={`summary-card-value ${result.existingAssets >= 0 ? 'green' : 'red'}`}>
            {fmtMoney(result.existingAssets)}
          </div>
          {latestNetWorth && (
            <div style={{ fontSize: '0.72rem', color: 'var(--fg-subtle)', marginTop: 4 }}>
              as of {latestNetWorth.date}
            </div>
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
            {fmtSigned(surplus)}
          </div>
        </div>
      </div>

      {/* FI Progress */}
      <div className="section-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--fg)' }}>FI Progress</h2>
          <Link to="/fire" style={{ fontSize: '0.78rem', color: 'var(--blue)' }}>Configure →</Link>
        </div>

        {/* SWR target */}
        {(() => {
          const t = result.targetSwr;
          const pct = t.balance > 0 ? Math.min(100, Math.max(0, (result.existingAssets / t.balance) * 100)) : 0;
          return (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--fg-muted)', marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>Conservative — {((config?.safeWithdrawalRate ?? 0.04) * 100).toFixed(1)}% SWR</span>
                <span>{fmtMoney(result.existingAssets)} / {fmtMoney(t.balance)} · <strong>{pct.toFixed(1)}%</strong>
                  {t.yearsGrowth !== null && <> · {t.yearsGrowth}yr ({t.estimatedDate})</>}
                </span>
              </div>
              <ProgressBar value={result.existingAssets} max={t.balance} color="var(--blue)" />
            </div>
          );
        })()}

        {/* Self-sustaining target */}
        {result.targetSustainable && (() => {
          const t = result.targetSustainable!;
          const pct = t.balance > 0 ? Math.min(100, Math.max(0, (result.existingAssets / t.balance) * 100)) : 0;
          return (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--fg-muted)', marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>Self-Sustaining — {((config?.assumedGrowthRate ?? 0) * 100).toFixed(1)}% growth</span>
                <span>{fmtMoney(result.existingAssets)} / {fmtMoney(t.balance)} · <strong>{pct.toFixed(1)}%</strong>
                  {t.yearsGrowth !== null && <> · {t.yearsGrowth}yr ({t.estimatedDate})</>}
                </span>
              </div>
              <ProgressBar value={result.existingAssets} max={t.balance} color="var(--purple, #a78bfa)" />
            </div>
          );
        })()}

        {/* Explicit target */}
        {result.targetExplicit && (() => {
          const t = result.targetExplicit!;
          const pct = t.balance > 0 ? Math.min(100, Math.max(0, (result.existingAssets / t.balance) * 100)) : 0;
          return (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.76rem', color: 'var(--fg-muted)', marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>My Goal</span>
                <span>{fmtMoney(result.existingAssets)} / {fmtMoney(t.balance)} · <strong>{pct.toFixed(1)}%</strong>
                  {t.yearsGrowth !== null && <> · {t.yearsGrowth}yr ({t.estimatedDate})</>}
                </span>
              </div>
              <ProgressBar value={result.existingAssets} max={t.balance} color="var(--green)" />
            </div>
          );
        })()}

        <div className="summary-cards" style={{ marginTop: 16, marginBottom: 0 }}>
          <div className="summary-card">
            <div className="summary-card-label">Retired Expenses / Mo</div>
            <div className="summary-card-value">{fmtMoney(result.monthlyRetiredExpenses)}</div>
          </div>
          <div className="summary-card">
            <div className="summary-card-label">FI Date (SWR)</div>
            <div className="summary-card-value blue">{result.targetSwr.estimatedDate ?? '—'}</div>
          </div>
          {result.targetSustainable && (
            <div className="summary-card">
              <div className="summary-card-label">FI Date (Sustaining)</div>
              <div className="summary-card-value" style={{ color: 'var(--purple, var(--blue))' }}>
                {result.targetSustainable.estimatedDate ?? '—'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tax summary */}
      <div className="section-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--fg)' }}>Tax Summary</h2>
          <Link to="/tax" style={{ fontSize: '0.78rem', color: 'var(--blue)' }}>Configure →</Link>
        </div>
        {result.taxDetails.jurisdictions.length === 0 ? (
          <p className="muted" style={{ fontSize: '0.8rem' }}>
            <Link to="/tax" style={{ color: 'var(--blue)' }}>Configure tax brackets</Link> to see your tax breakdown.
          </p>
        ) : (
          <>
            <div className="stat-row">
              <span className="stat-label">Ordinary Income</span>
              <span className="stat-value">{fmtMoney(result.taxDetails.ordinaryIncome)}</span>
            </div>
            {result.taxDetails.ltGainsIncome > 0 && (
              <div className="stat-row">
                <span className="stat-label">LT Capital Gains</span>
                <span className="stat-value">{fmtMoney(result.taxDetails.ltGainsIncome)}</span>
              </div>
            )}
            {result.taxDetails.jurisdictions.map(j => (
              <div key={j.jurisdictionId} className="stat-row">
                <span className="stat-label">
                  {j.name} <span style={{ color: 'var(--fg-subtle)', fontSize: '0.72rem' }}>
                    (max {fmtPct(j.marginalOrdinaryRate)})
                  </span>
                </span>
                <span className="stat-value red">−{fmtMoney(j.totalTax)}</span>
              </div>
            ))}
            <div className="stat-row" style={{ borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4 }}>
              <span className="stat-label" style={{ fontWeight: 600 }}>Net Monthly Take-home</span>
              <span className="stat-value green">{fmtMoney(result.taxDetails.netMonthly)}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
