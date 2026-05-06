-- Add optional loan origination fields to liabilities for amortization math
ALTER TABLE liabilities
  ADD COLUMN IF NOT EXISTS origination_date DATE,
  ADD COLUMN IF NOT EXISTS original_balance  NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS term_months       INTEGER;
