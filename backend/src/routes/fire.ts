import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { getSettings } from '../models/settings';
import { listAssets } from '../models/asset';
import { listLiabilities } from '../models/liability';
import { listExpenseItems, itemMonthly } from '../models/expense';
import { listIncomeSources, toMonthly } from '../models/income';
import { getAccountTaxProfile, findJurisdictionById, findBracketSet } from '../models/taxBracket';
import { computeFire, type JurisdictionBrackets } from '../services/fire';
import { query } from '../config/db';

export const fireRouter = Router();
fireRouter.use(requireAuth);

fireRouter.get('/result', async (req, res) => {
  const accountId = req.account!.id;
  const config    = await getSettings(accountId);

  // Net assets
  const assets      = await listAssets(accountId);
  const liabilities = await listLiabilities(accountId);

  let totalAssets = 0;
  for (const a of assets) {
    const { rows } = await query<{ value: string }>(
      'SELECT value FROM asset_snapshots WHERE asset_id = $1 ORDER BY snapshot_date DESC LIMIT 1',
      [a.id],
    );
    if (rows[0]) totalAssets += parseFloat(rows[0].value);
  }

  let totalLiabilities = 0;
  for (const l of liabilities) {
    const { rows } = await query<{ balance: string }>(
      'SELECT balance FROM liability_snapshots WHERE liability_id = $1 ORDER BY snapshot_date DESC LIMIT 1',
      [l.id],
    );
    if (rows[0]) totalLiabilities += parseFloat(rows[0].balance);
  }

  const existingAssets = totalAssets - totalLiabilities;

  // Expense snapshots
  let monthlyActiveExpenses = 0;
  if (config.activeExpenseSnapshotId) {
    const items = await listExpenseItems(config.activeExpenseSnapshotId);
    monthlyActiveExpenses = items.reduce((sum, i) => sum + itemMonthly(i), 0);
  }

  let monthlyRetiredExpenses = 0;
  if (config.retiredExpenseSnapshotId) {
    const items = await listExpenseItems(config.retiredExpenseSnapshotId);
    monthlyRetiredExpenses = items.reduce((sum, i) => sum + itemMonthly(i), 0);
  }

  // Income sources override
  const sources = await listIncomeSources(accountId);
  const active  = sources.filter(s => s.active);
  let incomeOverride: { annualTaxable: number; annualNonTaxable: number } | undefined;
  if (active.length > 0) {
    let annualTaxable = 0, annualNonTaxable = 0;
    for (const s of active) {
      const mo = toMonthly(parseFloat(s.amount), s.frequency);
      if (s.taxable) annualTaxable    += mo * 12;
      else           annualNonTaxable += mo * 12;
    }
    incomeOverride = { annualTaxable, annualNonTaxable };
  }

  // Tax bracket data
  const taxProfile = await getAccountTaxProfile(accountId);
  const taxJurisdictions: JurisdictionBrackets[] = [];

  if (taxProfile && taxProfile.jurisdiction_ids.length > 0) {
    for (const jid of taxProfile.jurisdiction_ids) {
      const jurisdiction = await findJurisdictionById(jid);
      if (!jurisdiction) continue;

      const ordSet = await findBracketSet(jid, taxProfile.tax_year, 'ordinary',         taxProfile.filing_status);
      const ltSet  = await findBracketSet(jid, taxProfile.tax_year, 'long_term_gains',  taxProfile.filing_status);

      taxJurisdictions.push({
        jurisdictionId:            jid,
        name:                      jurisdiction.name,
        abbreviation:              jurisdiction.abbreviation,
        ordinaryBrackets:          (ordSet?.brackets ?? []).map(b => ({ income_floor: parseFloat(b.income_floor), rate: parseFloat(b.rate) })),
        ordinaryStandardDeduction: ordSet ? parseFloat(ordSet.standard_deduction) : 0,
        ltBrackets:                (ltSet?.brackets ?? []).map(b => ({ income_floor: parseFloat(b.income_floor), rate: parseFloat(b.rate) })),
      });
    }
  }

  const result = computeFire(
    config, existingAssets, monthlyActiveExpenses, monthlyRetiredExpenses,
    incomeOverride, taxJurisdictions.length > 0 ? taxJurisdictions : undefined,
  );
  res.json(result);
});
