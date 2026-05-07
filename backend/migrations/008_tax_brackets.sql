-- Tax jurisdiction tables

CREATE TABLE IF NOT EXISTS tax_jurisdictions (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         VARCHAR(120) NOT NULL,
  abbreviation VARCHAR(20)  NOT NULL,
  jtype        VARCHAR(20)  NOT NULL CHECK (jtype IN ('federal', 'state', 'local')),
  is_public    BOOLEAN      NOT NULL DEFAULT false,
  created_by   UUID         REFERENCES accounts(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tax_jurisdictions_public_idx ON tax_jurisdictions(is_public);
CREATE INDEX IF NOT EXISTS tax_jurisdictions_owner_idx  ON tax_jurisdictions(created_by);

CREATE TABLE IF NOT EXISTS tax_bracket_sets (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction_id    UUID         NOT NULL REFERENCES tax_jurisdictions(id) ON DELETE CASCADE,
  tax_year           INTEGER      NOT NULL,
  income_type        VARCHAR(20)  NOT NULL CHECK (income_type IN ('ordinary', 'long_term_gains')),
  filing_status      VARCHAR(30)  NOT NULL CHECK (filing_status IN ('single','married_joint','married_separate','head_of_household')),
  standard_deduction NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes              TEXT,
  created_by         UUID         REFERENCES accounts(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (jurisdiction_id, tax_year, income_type, filing_status)
);

CREATE TABLE IF NOT EXISTS tax_brackets (
  id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  bracket_set_id UUID         NOT NULL REFERENCES tax_bracket_sets(id) ON DELETE CASCADE,
  income_floor   NUMERIC(14,2) NOT NULL,
  rate           NUMERIC(6,4)  NOT NULL CHECK (rate >= 0 AND rate <= 1),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (bracket_set_id, income_floor)
);
CREATE INDEX IF NOT EXISTS tax_brackets_set_idx ON tax_brackets(bracket_set_id);

CREATE TABLE IF NOT EXISTS account_tax_profiles (
  account_id    UUID        PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  tax_year      INTEGER     NOT NULL DEFAULT 2025,
  filing_status VARCHAR(30) NOT NULL DEFAULT 'single',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS account_tax_jurisdiction_selections (
  account_id      UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  jurisdiction_id UUID NOT NULL REFERENCES tax_jurisdictions(id) ON DELETE CASCADE,
  PRIMARY KEY (account_id, jurisdiction_id)
);

-- ── Seed public bracket data ────────────────────────────────────────────────────

DO $$
DECLARE
  fed_id     UUID;
  ca_id      UUID;
  set_id     UUID;
BEGIN
  -- ── Federal ────────────────────────────────────────────────────────────────

  INSERT INTO tax_jurisdictions (name, abbreviation, jtype, is_public, created_by)
  VALUES ('Federal', 'FED', 'federal', true, NULL)
  ON CONFLICT DO NOTHING;
  SELECT id INTO fed_id FROM tax_jurisdictions WHERE abbreviation = 'FED' AND created_by IS NULL;

  -- Federal 2025 ordinary / single  (standard deduction $15,000)
  INSERT INTO tax_bracket_sets (jurisdiction_id, tax_year, income_type, filing_status, standard_deduction, notes, created_by)
  VALUES (fed_id, 2025, 'ordinary', 'single', 15000, 'IRS 2025 — Single', NULL)
  ON CONFLICT DO NOTHING;
  SELECT id INTO set_id FROM tax_bracket_sets
    WHERE jurisdiction_id = fed_id AND tax_year = 2025 AND income_type = 'ordinary' AND filing_status = 'single';
  INSERT INTO tax_brackets (bracket_set_id, income_floor, rate) VALUES
    (set_id,      0, 0.1000),
    (set_id,  11925, 0.1200),
    (set_id,  48475, 0.2200),
    (set_id, 103350, 0.2400),
    (set_id, 197300, 0.3200),
    (set_id, 250525, 0.3500),
    (set_id, 626350, 0.3700)
  ON CONFLICT DO NOTHING;

  -- Federal 2025 LT cap gains / single
  INSERT INTO tax_bracket_sets (jurisdiction_id, tax_year, income_type, filing_status, standard_deduction, notes, created_by)
  VALUES (fed_id, 2025, 'long_term_gains', 'single', 0, 'IRS 2025 LT cap gains — Single', NULL)
  ON CONFLICT DO NOTHING;
  SELECT id INTO set_id FROM tax_bracket_sets
    WHERE jurisdiction_id = fed_id AND tax_year = 2025 AND income_type = 'long_term_gains' AND filing_status = 'single';
  INSERT INTO tax_brackets (bracket_set_id, income_floor, rate) VALUES
    (set_id,      0, 0.0000),
    (set_id,  48350, 0.1500),
    (set_id, 533400, 0.2000)
  ON CONFLICT DO NOTHING;

  -- Federal 2025 ordinary / married_joint  (standard deduction $30,000)
  INSERT INTO tax_bracket_sets (jurisdiction_id, tax_year, income_type, filing_status, standard_deduction, notes, created_by)
  VALUES (fed_id, 2025, 'ordinary', 'married_joint', 30000, 'IRS 2025 — Married Filing Jointly', NULL)
  ON CONFLICT DO NOTHING;
  SELECT id INTO set_id FROM tax_bracket_sets
    WHERE jurisdiction_id = fed_id AND tax_year = 2025 AND income_type = 'ordinary' AND filing_status = 'married_joint';
  INSERT INTO tax_brackets (bracket_set_id, income_floor, rate) VALUES
    (set_id,      0, 0.1000),
    (set_id,  23850, 0.1200),
    (set_id,  96950, 0.2200),
    (set_id, 206700, 0.2400),
    (set_id, 394600, 0.3200),
    (set_id, 501050, 0.3500),
    (set_id, 751600, 0.3700)
  ON CONFLICT DO NOTHING;

  -- Federal 2025 LT cap gains / married_joint
  INSERT INTO tax_bracket_sets (jurisdiction_id, tax_year, income_type, filing_status, standard_deduction, notes, created_by)
  VALUES (fed_id, 2025, 'long_term_gains', 'married_joint', 0, 'IRS 2025 LT cap gains — Married Filing Jointly', NULL)
  ON CONFLICT DO NOTHING;
  SELECT id INTO set_id FROM tax_bracket_sets
    WHERE jurisdiction_id = fed_id AND tax_year = 2025 AND income_type = 'long_term_gains' AND filing_status = 'married_joint';
  INSERT INTO tax_brackets (bracket_set_id, income_floor, rate) VALUES
    (set_id,      0, 0.0000),
    (set_id,  96700, 0.1500),
    (set_id, 600050, 0.2000)
  ON CONFLICT DO NOTHING;

  -- ── California ─────────────────────────────────────────────────────────────

  INSERT INTO tax_jurisdictions (name, abbreviation, jtype, is_public, created_by)
  VALUES ('California', 'CA', 'state', true, NULL)
  ON CONFLICT DO NOTHING;
  SELECT id INTO ca_id FROM tax_jurisdictions WHERE abbreviation = 'CA' AND created_by IS NULL;

  -- CA 2025 ordinary / single  (standard deduction $5,202)
  -- CA taxes LT gains as ordinary income; we store a separate set pointing to same rates
  INSERT INTO tax_bracket_sets (jurisdiction_id, tax_year, income_type, filing_status, standard_deduction, notes, created_by)
  VALUES (ca_id, 2025, 'ordinary', 'single', 5202, 'CA FTB 2025 — Single', NULL)
  ON CONFLICT DO NOTHING;
  SELECT id INTO set_id FROM tax_bracket_sets
    WHERE jurisdiction_id = ca_id AND tax_year = 2025 AND income_type = 'ordinary' AND filing_status = 'single';
  INSERT INTO tax_brackets (bracket_set_id, income_floor, rate) VALUES
    (set_id,       0, 0.0100),
    (set_id,   10756, 0.0200),
    (set_id,   25499, 0.0400),
    (set_id,   40245, 0.0600),
    (set_id,   55866, 0.0800),
    (set_id,   70606, 0.0930),
    (set_id,  360659, 0.1030),
    (set_id,  432787, 0.1130),
    (set_id,  721314, 0.1230),
    (set_id, 1000000, 0.1330)
  ON CONFLICT DO NOTHING;

  -- CA 2025 LT cap gains / single  (same rates as ordinary; no preferential rate)
  INSERT INTO tax_bracket_sets (jurisdiction_id, tax_year, income_type, filing_status, standard_deduction, notes, created_by)
  VALUES (ca_id, 2025, 'long_term_gains', 'single', 0, 'CA FTB 2025 LT cap gains — Single (same as ordinary)', NULL)
  ON CONFLICT DO NOTHING;
  SELECT id INTO set_id FROM tax_bracket_sets
    WHERE jurisdiction_id = ca_id AND tax_year = 2025 AND income_type = 'long_term_gains' AND filing_status = 'single';
  INSERT INTO tax_brackets (bracket_set_id, income_floor, rate) VALUES
    (set_id,       0, 0.0100),
    (set_id,   10756, 0.0200),
    (set_id,   25499, 0.0400),
    (set_id,   40245, 0.0600),
    (set_id,   55866, 0.0800),
    (set_id,   70606, 0.0930),
    (set_id,  360659, 0.1030),
    (set_id,  432787, 0.1130),
    (set_id,  721314, 0.1230),
    (set_id, 1000000, 0.1330)
  ON CONFLICT DO NOTHING;

  -- CA 2025 ordinary / married_joint  (standard deduction $10,404)
  INSERT INTO tax_bracket_sets (jurisdiction_id, tax_year, income_type, filing_status, standard_deduction, notes, created_by)
  VALUES (ca_id, 2025, 'ordinary', 'married_joint', 10404, 'CA FTB 2025 — Married Filing Jointly', NULL)
  ON CONFLICT DO NOTHING;
  SELECT id INTO set_id FROM tax_bracket_sets
    WHERE jurisdiction_id = ca_id AND tax_year = 2025 AND income_type = 'ordinary' AND filing_status = 'married_joint';
  INSERT INTO tax_brackets (bracket_set_id, income_floor, rate) VALUES
    (set_id,       0, 0.0100),
    (set_id,   21512, 0.0200),
    (set_id,   50998, 0.0400),
    (set_id,   80490, 0.0600),
    (set_id,  111732, 0.0800),
    (set_id,  141212, 0.0930),
    (set_id,  721318, 0.1030),
    (set_id,  865574, 0.1130),
    (set_id, 1000000, 0.1230),
    (set_id, 1442628, 0.1330)
  ON CONFLICT DO NOTHING;

  -- CA 2025 LT / married_joint
  INSERT INTO tax_bracket_sets (jurisdiction_id, tax_year, income_type, filing_status, standard_deduction, notes, created_by)
  VALUES (ca_id, 2025, 'long_term_gains', 'married_joint', 0, 'CA FTB 2025 LT cap gains — MFJ (same as ordinary)', NULL)
  ON CONFLICT DO NOTHING;
  SELECT id INTO set_id FROM tax_bracket_sets
    WHERE jurisdiction_id = ca_id AND tax_year = 2025 AND income_type = 'long_term_gains' AND filing_status = 'married_joint';
  INSERT INTO tax_brackets (bracket_set_id, income_floor, rate) VALUES
    (set_id,       0, 0.0100),
    (set_id,   21512, 0.0200),
    (set_id,   50998, 0.0400),
    (set_id,   80490, 0.0600),
    (set_id,  111732, 0.0800),
    (set_id,  141212, 0.0930),
    (set_id,  721318, 0.1030),
    (set_id,  865574, 0.1130),
    (set_id, 1000000, 0.1230),
    (set_id, 1442628, 0.1330)
  ON CONFLICT DO NOTHING;

END $$;
