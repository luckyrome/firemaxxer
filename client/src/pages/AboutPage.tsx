export function AboutPage() {
  return (
    <div className="page">
      <div className="page-header">
        <h1>About</h1>
      </div>

      <div className="section-card">
        <div className="section-header"><h2>Firemaxxer</h2></div>
        <p style={{ fontSize: '0.85rem', lineHeight: 1.7, color: 'var(--fg-sec)' }}>
          Firemaxxer is a personal finance tool designed to help you plan and track your
          path to Financial Independence and Early Retirement (FIRE). It consolidates your
          assets, liabilities, income, and expenses into a single dashboard so you can see
          exactly where you stand and how long until you can retire on your own terms.
        </p>
      </div>

      <div className="section-card">
        <div className="section-header"><h2>Privacy Policy</h2></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <PolicySection title="Your data belongs to you">
            All financial information you enter into Firemaxxer — assets, income, expenses,
            tax configuration, and settings — is stored privately under your account and is
            accessible only to you. We may analyze usage and financial data in aggregate,
            anonymized form to improve the product and understand how people plan for
            financial independence. Your individual data is never attributed to you in any
            such analysis.
          </PolicySection>

          <PolicySection title="We do not sell your data">
            Your personal and financial data is never sold, rented, shared, or disclosed to
            any third party, advertiser, data broker, or external service — under any
            circumstances.
          </PolicySection>

          <PolicySection title="No third-party tracking">
            Firemaxxer does not use third-party analytics platforms, advertising networks,
            or behavioral tracking technologies. No cookies or tracking scripts are loaded
            from external domains.
          </PolicySection>

          <PolicySection title="Data deletion">
            You may permanently delete your account and all associated data at any time from
            the <strong style={{ color: 'var(--fg)' }}>Account</strong> page. Deletion is
            immediate and irreversible — no copies are retained.
          </PolicySection>

        </div>
      </div>

      <div className="section-card">
        <div className="section-header"><h2>Disclaimer</h2></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <PolicySection title="No warranties">
            Firemaxxer is provided <em>"as is"</em> without warranty of any kind, express or
            implied, including but not limited to warranties of merchantability, fitness for a
            particular purpose, or non-infringement. Your use of this application is entirely
            at your own risk.
          </PolicySection>

          <PolicySection title="Not financial advice">
            All projections, calculations, and figures displayed in Firemaxxer are for
            informational and planning purposes only. Nothing in this application constitutes
            financial, investment, tax, or legal advice. Consult a qualified professional
            before making any financial decisions.
          </PolicySection>

          <PolicySection title="No liability">
            To the maximum extent permitted by applicable law, the developers of Firemaxxer
            shall not be liable for any direct, indirect, incidental, special, or consequential
            damages arising from your use of, or inability to use, this application.
          </PolicySection>

        </div>
      </div>
    </div>
  );
}

function PolicySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: '0.78rem', fontWeight: 600, color: 'var(--fg)',
        marginBottom: 6,
      }}>
        {title}
      </div>
      <p style={{ fontSize: '0.84rem', lineHeight: 1.7, color: 'var(--fg-sec)', margin: 0 }}>
        {children}
      </p>
    </div>
  );
}
