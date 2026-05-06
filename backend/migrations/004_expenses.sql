-- Expense snapshots (versioned recurring cost sheets)

CREATE TABLE IF NOT EXISTS expense_snapshots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id          UUID NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  label               TEXT NOT NULL,
  effective_date      DATE NOT NULL,
  is_retirement_plan  BOOLEAN NOT NULL DEFAULT false,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expense_snapshots_account_idx ON expense_snapshots (account_id);

CREATE TABLE IF NOT EXISTS expense_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id  UUID NOT NULL REFERENCES expense_snapshots (id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  owner        TEXT,
  vertical     TEXT,
  category     TEXT NOT NULL,
  critical     BOOLEAN NOT NULL DEFAULT false,
  amount       NUMERIC(12,2) NOT NULL,
  frequency    TEXT NOT NULL CHECK (frequency IN (
    'weekly','bi_weekly','monthly','quarterly','semi_annually','annually'
  )),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS expense_items_snapshot_idx ON expense_items (snapshot_id);
