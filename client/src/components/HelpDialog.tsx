import { useState } from 'react';

interface HelpContent {
  purpose: string;
  usage: string;
  feedsFrom: { label: string; detail: string }[];
  usedBy: { label: string; detail: string }[];
}

const PAGE_HELP: Record<string, HelpContent> = {
  dashboard: {
    purpose:
      'Your central FIRE command center. Shows net worth, monthly income/expense/surplus summary, how far you are from Financial Independence, and a full tax breakdown for both your working phase and retirement withdrawals.',
    usage:
      'Configure your target annual withdrawal, safe withdrawal rate (SWR), and expected retirement age in the FIRE Parameters section. Select your active expense plan. The projection updates live as you adjust settings.',
    feedsFrom: [
      { label: 'Assets & Liabilities', detail: 'provides your current net worth and investable asset balance' },
      { label: 'Income', detail: 'provides your monthly earning total and taxable income' },
      { label: 'Expenses', detail: 'the selected retirement plan snapshot drives your FIRE spending target' },
      { label: 'Tax Brackets', detail: 'computes retirement withdrawal tax gross-up and working-phase tax estimate' },
    ],
    usedBy: [],
  },

  assets: {
    purpose:
      'Track all your assets (brokerage accounts, 401(k), Roth IRA, real estate, cash) and liabilities (mortgages, auto loans, student loans). Periodic value snapshots build a net worth history you can chart over time.',
    usage:
      'Add each asset or liability with its type and any growth-rate assumption. Then periodically record a snapshot of its current value or outstanding balance. The net worth chart plots your trajectory across all snapshots.',
    feedsFrom: [],
    usedBy: [
      { label: 'Dashboard', detail: 'uses your latest net worth and investable balance for FIRE projection' },
    ],
  },

  income: {
    purpose:
      'Catalog all your income streams — salary, freelance, rental income, dividends — with frequency and taxability. Monthly and annual totals are computed automatically.',
    usage:
      'Add each source with its gross amount and how often it pays (weekly, bi-weekly, monthly, etc.). Mark each source taxable or non-taxable. Only active sources are included in totals. Toggle a source inactive to temporarily exclude it.',
    feedsFrom: [],
    usedBy: [
      { label: 'Dashboard', detail: 'monthly income figure and taxable income feed the FIRE projection and working-phase tax estimate' },
    ],
  },

  expenses: {
    purpose:
      'Model different spending budgets as named, dated snapshots. Separate plans let you compare current spending against a leaner retired budget — each with its own line items by category.',
    usage:
      'Create snapshots for different life phases (e.g., "Current Spending", "Retired Budget"). Mark one as your retirement plan. Within each snapshot, add items by category and frequency. The Dashboard uses the retirement-plan snapshot as your FIRE target spending.',
    feedsFrom: [],
    usedBy: [
      { label: 'Dashboard', detail: 'the retirement-plan snapshot drives monthly expense target and FIRE number' },
    ],
  },

  refi: {
    purpose:
      'Compare refinancing scenarios for a loan. Computes net cash-flow gain after accounting for payment delta, total interest savings, and origination fees — all projected over a unified time horizon so scenarios with different terms are compared fairly.',
    usage:
      'Create an analysis with your current loan details (original value, current balance, rate, months in). Then add refi scenarios with the proposed rate, new term, and origination fee. The comparison table shows net gain per scenario.',
    feedsFrom: [],
    usedBy: [],
  },

  tax: {
    purpose:
      'Configure the tax jurisdictions that apply to you (federal, state, local) and your filing status for each. Used to gross up retirement withdrawal targets so you know how much to withdraw to net your spending goal.',
    usage:
      'In "My Tax Profile," add each jurisdiction (e.g., Federal, NY) and choose the filing status and tax year. The bracket library below shows the marginal rates that will be applied. The Dashboard\'s Tax Breakdown section shows the full per-bracket computation.',
    feedsFrom: [],
    usedBy: [
      { label: 'Dashboard', detail: 'retirement withdrawal gross-up and working-phase tax estimate in the Tax Breakdown section' },
    ],
  },

  account: {
    purpose:
      'Manage your Firemaxxer account credentials. Change your password or permanently delete your account and all associated data.',
    usage:
      'Enter your current password and a new password to update your credentials. The Delete Account section is irreversible — all your assets, income, expenses, and settings will be permanently removed.',
    feedsFrom: [],
    usedBy: [],
  },
};

function HelpDialog({ pageKey, onClose }: { pageKey: string; onClose: () => void }) {
  const help = PAGE_HELP[pageKey];
  if (!help) return null;

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div
        className="dialog"
        style={{ width: 520, maxHeight: '80vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="dialog-title">How this page works</div>
        <div className="dialog-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section>
            <div style={{ fontWeight: 600, color: 'var(--fg)', marginBottom: 4, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Purpose</div>
            <p style={{ margin: 0, lineHeight: 1.6 }}>{help.purpose}</p>
          </section>

          <section>
            <div style={{ fontWeight: 600, color: 'var(--fg)', marginBottom: 4, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>How to use</div>
            <p style={{ margin: 0, lineHeight: 1.6 }}>{help.usage}</p>
          </section>

          {help.feedsFrom.length > 0 && (
            <section>
              <div style={{ fontWeight: 600, color: 'var(--fg)', marginBottom: 6, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Receives input from</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {help.feedsFrom.map((f) => (
                  <li key={f.label} style={{ lineHeight: 1.5 }}>
                    <strong style={{ color: 'var(--fg)' }}>{f.label}</strong>{' '}
                    <span>— {f.detail}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {help.usedBy.length > 0 && (
            <section>
              <div style={{ fontWeight: 600, color: 'var(--fg)', marginBottom: 6, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Output used by</div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {help.usedBy.map((u) => (
                  <li key={u.label} style={{ lineHeight: 1.5 }}>
                    <strong style={{ color: 'var(--fg)' }}>{u.label}</strong>{' '}
                    <span>— {u.detail}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {help.feedsFrom.length === 0 && help.usedBy.length === 0 && (
            <section>
              <p style={{ margin: 0, lineHeight: 1.6, fontStyle: 'italic' }}>
                This is a standalone tool — it does not receive input from or send output to other pages.
              </p>
            </section>
          )}
        </div>
        <div className="dialog-actions">
          <button className="btn btn-primary" onClick={onClose}>Got it</button>
        </div>
      </div>
    </div>
  );
}

export function PageHelp({ page }: { page: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="How does this page work?"
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 20, height: 20, borderRadius: '50%',
          border: '1.5px solid var(--border-sub)', background: 'transparent',
          color: 'var(--fg-muted)', fontSize: '0.72rem', fontWeight: 700,
          cursor: 'pointer', lineHeight: 1, flexShrink: 0,
          marginLeft: 8, verticalAlign: 'middle',
          transition: 'border-color 0.15s, color 0.15s',
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--blue)';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--blue)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-sub)';
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--fg-muted)';
        }}
      >
        ?
      </button>
      {open && <HelpDialog pageKey={page} onClose={() => setOpen(false)} />}
    </>
  );
}
