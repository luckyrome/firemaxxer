import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { NotFoundError } from '../middleware/errorHandler';
import {
  listIncomeSources, findIncomeSourceById, createIncomeSource,
  updateIncomeSource, deleteIncomeSource, toMonthly,
} from '../models/income';
import type { IncomeFrequency } from '../models/income';

export const incomeRouter = Router();
incomeRouter.use(requireAuth);

const FREQUENCIES: IncomeFrequency[] = [
  'weekly', 'bi_weekly', 'semi_monthly', 'monthly', 'quarterly', 'semi_annually', 'annually',
];

const sourceSchema = z.object({
  name:      z.string().min(1).max(120),
  amount:    z.number().min(0),
  frequency: z.enum(['weekly', 'bi_weekly', 'semi_monthly', 'monthly', 'quarterly', 'semi_annually', 'annually']),
  taxable:   z.boolean(),
  active:    z.boolean(),
  notes:     z.string().max(500).nullable().optional(),
});

incomeRouter.get('/', async (req, res) => {
  const sources = await listIncomeSources(req.account!.id);
  const enriched = sources.map((s) => {
    const amt = parseFloat(s.amount);
    const monthly = toMonthly(amt, s.frequency);
    return { ...s, monthly_equiv: monthly, annual_equiv: monthly * 12 };
  });
  const monthlyTotal = enriched.filter(s => s.active).reduce((sum, s) => sum + s.monthly_equiv, 0);
  const taxableAnnual = enriched.filter(s => s.active && s.taxable).reduce((sum, s) => sum + s.annual_equiv, 0);
  res.json({
    sources: enriched,
    monthlyTotal,
    annualTotal: monthlyTotal * 12,
    taxableAnnual,
  });
});

incomeRouter.post('/', async (req, res) => {
  const body = sourceSchema.parse(req.body);
  const source = await createIncomeSource(
    req.account!.id, body.name, body.amount, body.frequency,
    body.taxable, body.active, body.notes ?? null,
  );
  res.status(201).json(source);
});

incomeRouter.put('/:id', async (req, res) => {
  const existing = await findIncomeSourceById(req.params.id, req.account!.id);
  if (!existing) throw new NotFoundError('Income source not found');
  const body = sourceSchema.parse(req.body);
  const updated = await updateIncomeSource(
    req.params.id, body.name, body.amount, body.frequency,
    body.taxable, body.active, body.notes ?? null,
  );
  res.json(updated);
});

incomeRouter.delete('/:id', async (req, res) => {
  const existing = await findIncomeSourceById(req.params.id, req.account!.id);
  if (!existing) throw new NotFoundError('Income source not found');
  await deleteIncomeSource(req.params.id);
  res.status(204).end();
});
