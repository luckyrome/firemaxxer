-- New York State 2025 income tax brackets (source: NY DTF / NerdWallet)
-- NY taxes long-term capital gains as ordinary income (no preferential rate).
-- Standard deductions: Single $8,000 / MFJ $16,050.

DO $$
DECLARE
  ny_id  UUID;
  set_id UUID;
BEGIN
  INSERT INTO tax_jurisdictions (name, abbreviation, jtype, is_public, created_by)
  VALUES ('New York', 'NY', 'state', true, NULL)
  ON CONFLICT DO NOTHING;
  SELECT id INTO ny_id FROM tax_jurisdictions WHERE abbreviation = 'NY' AND created_by IS NULL;

  -- ── Single ─────────────────────────────────────────────────────────────────

  -- NY 2025 ordinary / single  (standard deduction $8,000)
  INSERT INTO tax_bracket_sets (jurisdiction_id, tax_year, income_type, filing_status, standard_deduction, notes, created_by)
  VALUES (ny_id, 2025, 'ordinary', 'single', 8000, 'NY DTF 2025 — Single', NULL)
  ON CONFLICT DO NOTHING;
  SELECT id INTO set_id FROM tax_bracket_sets
    WHERE jurisdiction_id = ny_id AND tax_year = 2025 AND income_type = 'ordinary' AND filing_status = 'single';
  INSERT INTO tax_brackets (bracket_set_id, income_floor, rate) VALUES
    (set_id,        0, 0.0400),
    (set_id,     8500, 0.0450),
    (set_id,    11700, 0.0525),
    (set_id,    13900, 0.0550),
    (set_id,    80650, 0.0600),
    (set_id,   215400, 0.0685),
    (set_id,  1077550, 0.0965),
    (set_id,  5000000, 0.1030),
    (set_id, 25000000, 0.1090)
  ON CONFLICT DO NOTHING;

  -- NY 2025 LT cap gains / single  (same rates as ordinary; no preferential rate)
  INSERT INTO tax_bracket_sets (jurisdiction_id, tax_year, income_type, filing_status, standard_deduction, notes, created_by)
  VALUES (ny_id, 2025, 'long_term_gains', 'single', 0, 'NY DTF 2025 LT cap gains — Single (same as ordinary)', NULL)
  ON CONFLICT DO NOTHING;
  SELECT id INTO set_id FROM tax_bracket_sets
    WHERE jurisdiction_id = ny_id AND tax_year = 2025 AND income_type = 'long_term_gains' AND filing_status = 'single';
  INSERT INTO tax_brackets (bracket_set_id, income_floor, rate) VALUES
    (set_id,        0, 0.0400),
    (set_id,     8500, 0.0450),
    (set_id,    11700, 0.0525),
    (set_id,    13900, 0.0550),
    (set_id,    80650, 0.0600),
    (set_id,   215400, 0.0685),
    (set_id,  1077550, 0.0965),
    (set_id,  5000000, 0.1030),
    (set_id, 25000000, 0.1090)
  ON CONFLICT DO NOTHING;

  -- ── Married Filing Jointly ─────────────────────────────────────────────────

  -- NY 2025 ordinary / married_joint  (standard deduction $16,050)
  INSERT INTO tax_bracket_sets (jurisdiction_id, tax_year, income_type, filing_status, standard_deduction, notes, created_by)
  VALUES (ny_id, 2025, 'ordinary', 'married_joint', 16050, 'NY DTF 2025 — Married Filing Jointly', NULL)
  ON CONFLICT DO NOTHING;
  SELECT id INTO set_id FROM tax_bracket_sets
    WHERE jurisdiction_id = ny_id AND tax_year = 2025 AND income_type = 'ordinary' AND filing_status = 'married_joint';
  INSERT INTO tax_brackets (bracket_set_id, income_floor, rate) VALUES
    (set_id,        0, 0.0400),
    (set_id,    17150, 0.0450),
    (set_id,    23600, 0.0525),
    (set_id,    27900, 0.0550),
    (set_id,   161550, 0.0600),
    (set_id,   323200, 0.0685),
    (set_id,  2155350, 0.0965),
    (set_id,  5000000, 0.1030),
    (set_id, 25000000, 0.1090)
  ON CONFLICT DO NOTHING;

  -- NY 2025 LT cap gains / married_joint  (same rates as ordinary)
  INSERT INTO tax_bracket_sets (jurisdiction_id, tax_year, income_type, filing_status, standard_deduction, notes, created_by)
  VALUES (ny_id, 2025, 'long_term_gains', 'married_joint', 0, 'NY DTF 2025 LT cap gains — MFJ (same as ordinary)', NULL)
  ON CONFLICT DO NOTHING;
  SELECT id INTO set_id FROM tax_bracket_sets
    WHERE jurisdiction_id = ny_id AND tax_year = 2025 AND income_type = 'long_term_gains' AND filing_status = 'married_joint';
  INSERT INTO tax_brackets (bracket_set_id, income_floor, rate) VALUES
    (set_id,        0, 0.0400),
    (set_id,    17150, 0.0450),
    (set_id,    23600, 0.0525),
    (set_id,    27900, 0.0550),
    (set_id,   161550, 0.0600),
    (set_id,   323200, 0.0685),
    (set_id,  2155350, 0.0965),
    (set_id,  5000000, 0.1030),
    (set_id, 25000000, 0.1090)
  ON CONFLICT DO NOTHING;

END $$;
