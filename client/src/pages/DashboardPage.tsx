import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { getFireResult } from '../api/refi';
import { getSettings } from '../api/settings';
import { getNetWorth } from '../api/assets';

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

  const isConfigured = config && (
    config.annualSalary > 0 || config.activeExpenseSnapshotId !== null
  );

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
  const progressPct = result.fiBalance > 0
    ? Math.min(100, (result.existingAssets / result.fiBalance) * 100)
    : 0;

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--fg)' }}>FI Progress</h2>
          <Link to="/fire" style={{ fontSize: '0.78rem', color: 'var(--blue)' }}>Configure →</Link>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: 'var(--fg-muted)', marginBottom: 6 }}>
          <span>{fmtMoney(result.existingAssets)} saved</span>
          <span style={{ color: 'var(--fg-subtle)' }}>{progressPct.toFixed(1)}%</span>
          <span>{fmtMoney(result.fiBalance)} target</span>
        </div>
        <ProgressBar
          value={result.existingAssets}
          max={result.fiBalance}
          color={progressPct >= 100 ? 'var(--green)' : progressPct >= 75 ? 'var(--blue)' : 'var(--blue)'}
        />

        <div className="summary-cards" style={{ marginTop: 16, marginBottom: 0 }}>
          <div className="summary-card">
            <div className="summary-card-label">Years to FI</div>
            <div className="summary-card-value blue">
              {result.yearsToFIWithGrowth !== null ? result.yearsToFIWithGrowth : '—'}
            </div>
            <div style={{ fontSize: '0.7rem', color: 'var(--fg-subtle)', marginTop: 2 }}>with {((config?.assumedGrowthRate ?? 0.04) * 100).toFixed(1)}% growth</div>
          </div>
          <div className="summary-card">
            <div className="summary-card-label">Estimated FI Date</div>
            <div className="summary-card-value blue">{result.estimatedFIDate ?? '—'}</div>
          </div>
          <div className="summary-card">
            <div className="summary-card-label">FI Target</div>
            <div className="summary-card-value">{fmtMoney(result.fiBalance)}</div>
            <div style={{ fontSize: '0.7rem', color: 'var(--fg-subtle)', marginTop: 2 }}>{((config?.safeWithdrawalRate ?? 0.04) * 100).toFixed(1)}% SWR</div>
          </div>
          <div className="summary-card">
            <div className="summary-card-label">Retired Expenses / Mo</div>
            <div className="summary-card-value">{fmtMoney(result.monthlyRetiredExpenses)}</div>
          </div>
        </div>
      </div>

      {/* Tax summary */}
      <div className="section-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <h2 style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--fg)' }}>Tax Summary</h2>
          <Link to="/fire" style={{ fontSize: '0.78rem', color: 'var(--blue)' }}>Edit →</Link>
        </div>
        <div className="stat-row">
          <span className="stat-label">Gross Income</span>
          <span className="stat-value">{fmtMoney(result.taxDetails.grossIncome)}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">CA State Tax</span>
          <span className="stat-value red">−{fmtMoney(result.taxDetails.caTotal)}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Federal Tax</span>
          <span className="stat-value red">−{fmtMoney(result.taxDetails.federalTotal)}</span>
        </div>
        <div className="stat-row">
          <span className="stat-label">Net Monthly Take-home</span>
          <span className="stat-value green">{fmtMoney(result.taxDetails.netMonthly)}</span>
        </div>
      </div>
    </div>
  );
}
