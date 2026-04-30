-- Accounts and email verification tokens

CREATE TABLE IF NOT EXISTS accounts (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email               TEXT NOT NULL,
  password_hash       TEXT NOT NULL,
  email_verified      BOOLEAN NOT NULL DEFAULT false,
  resend_used         BOOLEAN NOT NULL DEFAULT false,
  is_admin            BOOLEAN NOT NULL DEFAULT false,
  password_changed_at TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_email_idx ON accounts (lower(email));

CREATE TABLE IF NOT EXISTS verification_tokens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  UUID NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('verify', 'reset')),
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS verification_tokens_account_idx ON verification_tokens (account_id);
