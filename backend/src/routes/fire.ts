import { Router } from 'express';
import { requireAuth } from '../middleware/requireAuth';
import { getSettings } from '../models/settings';
import { listAssets } from '../models/asset';
import { listLiabilities } from '../models/liability';
import { findExpenseSnapshotById, listExpenseItems, itemMonthly } from '../models/expense';
import { computeFire } from '../services/fire';
import { query } from '../config/db';

export const fireRouter = Router();
fireRouter.use(requireAuth);

fireRouter.get('/result', async (req, res) => {
  const accountId = req.account!.id;
  const config = await getSettings(accountId);

  // Compute current net assets
  const assets = await listAssets(accountId);
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

  // Active expenses
  let monthlyActiveExpenses = 0;
  if (config.activeExpenseSnapshotId) {
    const items = await listExpenseItems(config.activeExpenseSnapshotId);
    monthlyActiveExpenses = items.reduce((sum, i) => sum + itemMonthly(i), 0);
  }

  // Retired expenses
  let monthlyRetiredExpenses = 0;
  if (config.retiredExpenseSnapshotId) {
    const items = await listExpenseItems(config.retiredExpenseSnapshotId);
    monthlyRetiredExpenses = items.reduce((sum, i) => sum + itemMonthly(i), 0);
  }

  const result = computeFire(config, existingAssets, monthlyActiveExpenses, monthlyRetiredExpenses);
  res.json(result);
});
