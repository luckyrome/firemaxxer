-- Per-account FIRE configuration

CREATE TABLE IF NOT EXISTS account_settings (
  account_id  UUID PRIMARY KEY REFERENCES accounts (id) ON DELETE CASCADE,
  fire_config JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
