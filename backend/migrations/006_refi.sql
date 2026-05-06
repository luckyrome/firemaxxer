-- Loan refinance analyses and scenarios

CREATE TABLE IF NOT EXISTS refi_analyses (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             UUID NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  name                   TEXT NOT NULL,
  loan_original_value    NUMERIC(14,2) NOT NULL,
  loan_current_balance   NUMERIC(14,2) NOT NULL,
  current_annual_rate    NUMERIC(6,4) NOT NULL,
  months_in              INTEGER NOT NULL DEFAULT 0,
  assumed_investment_rate NUMERIC(6,4) NOT NULL DEFAULT 0.05,
  home_value_after_loan  NUMERIC(14,2),
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refi_analyses_account_idx ON refi_analyses (account_id);

CREATE TABLE IF NOT EXISTS refi_scenarios (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id  UUID NOT NULL REFERENCES refi_analyses (id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  term_years   INTEGER NOT NULL,
  annual_rate  NUMERIC(6,4) NOT NULL,
  sort_order   INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refi_scenarios_analysis_idx ON refi_scenarios (analysis_id);
