-- Assets, liabilities, and point-in-time snapshot history

CREATE TABLE IF NOT EXISTS assets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('brokerage','401k','roth_ira','real_estate','cash','other')),
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assets_account_idx ON assets (account_id);

CREATE TABLE IF NOT EXISTS asset_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id      UUID NOT NULL REFERENCES assets (id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  value         NUMERIC(14,2) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS asset_snapshots_asset_idx  ON asset_snapshots (asset_id);
CREATE INDEX IF NOT EXISTS asset_snapshots_date_idx   ON asset_snapshots (snapshot_date);

CREATE TABLE IF NOT EXISTS liabilities (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       UUID NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('mortgage','credit_card','auto_loan','student_loan','other')),
  interest_rate    NUMERIC(6,4) NOT NULL,
  linked_asset_id  UUID REFERENCES assets (id) ON DELETE SET NULL,
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS liabilities_account_idx ON liabilities (account_id);

CREATE TABLE IF NOT EXISTS liability_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  liability_id  UUID NOT NULL REFERENCES liabilities (id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  balance       NUMERIC(14,2) NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (liability_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS liability_snapshots_liability_idx ON liability_snapshots (liability_id);
CREATE INDEX IF NOT EXISTS liability_snapshots_date_idx      ON liability_snapshots (snapshot_date);
