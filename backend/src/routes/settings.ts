import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { getSettings, upsertSettings } from '../models/settings';

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

const fireConfigSchema = z.object({
  annualSalary:             z.number().min(0).optional(),
  annualBonus:              z.number().min(0).optional(),
  rsuQuarterlyGross:        z.number().min(0).optional(),
  esppQuarterlyGain:        z.number().min(0).optional(),
  k401Annual:               z.number().min(0).optional(),
  medicalDeductionAnnual:   z.number().min(0).optional(),
  caStateTaxRate:           z.number().min(0).max(1).optional(),
  caMaxPrevBracket:         z.number().min(0).optional(),
  caMaxTaxPrevBracket:      z.number().min(0).optional(),
  fedTaxRate:               z.number().min(0).max(1).optional(),
  fedMaxPrevBracket:        z.number().min(0).optional(),
  fedMaxTaxPrevBracket:     z.number().min(0).optional(),
  ltCapGainsRate:           z.number().min(0).max(1).optional(),
  safeWithdrawalRate:       z.number().min(0).max(1).optional(),
  assumedGrowthRate:        z.number().min(0).max(1).optional(),
  retirementAnnualIncome:   z.number().min(0).optional(),
  activeExpenseSnapshotId:  z.string().uuid().nullable().optional(),
  retiredExpenseSnapshotId: z.string().uuid().nullable().optional(),
});

settingsRouter.get('/', async (req, res) => {
  const config = await getSettings(req.account!.id);
  res.json(config);
});

settingsRouter.put('/', async (req, res) => {
  const body = fireConfigSchema.parse(req.body);
  const updated = await upsertSettings(req.account!.id, body);
  res.json(updated);
});
