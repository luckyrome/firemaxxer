import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { NotFoundError } from '../middleware/errorHandler';
import { query } from '../config/db';
import {
  listExpenseSnapshots, findExpenseSnapshotById, createExpenseSnapshot,
  updateExpenseSnapshot, deleteExpenseSnapshot, cloneExpenseSnapshot,
  listExpenseItems, findExpenseItemByIdForAccount, createExpenseItem,
  updateExpenseItem, deleteExpenseItem, itemMonthly,
} from '../models/expense';

export const expensesRouter = Router();
expensesRouter.use(requireAuth);

const snapshotSchema = z.object({
  label:             z.string().min(1).max(120),
  effective_date:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  is_retirement_plan: z.boolean(),
});

const itemSchema = z.object({
  name:      z.string().min(1).max(120),
  owner:     z.string().max(80).nullable().optional(),
  vertical:  z.string().max(80).nullable().optional(),
  category:  z.string().min(1).max(80),
  critical:  z.boolean(),
  amount:    z.number(),
  frequency: z.enum(['weekly', 'bi_weekly', 'monthly', 'quarterly', 'semi_annually', 'annually']),
});

// ── Snapshots ──────────────────────────────────────────────────────────────────

expensesRouter.get('/snapshots', async (req, res) => {
  const snapshots = await listExpenseSnapshots(req.account!.id);
  res.json(snapshots);
});

expensesRouter.post('/snapshots', async (req, res) => {
  const body = snapshotSchema.parse(req.body);
  const snap = await createExpenseSnapshot(
    req.account!.id, body.label, body.effective_date, body.is_retirement_plan,
  );
  res.status(201).json(snap);
});

expensesRouter.put('/snapshots/:id', async (req, res) => {
  const snap = await findExpenseSnapshotById(req.params.id, req.account!.id);
  if (!snap) throw new NotFoundError('Snapshot not found');
  const body = snapshotSchema.parse(req.body);
  const updated = await updateExpenseSnapshot(req.params.id, body.label, body.effective_date, body.is_retirement_plan);
  res.json(updated);
});

expensesRouter.delete('/snapshots/:id', async (req, res) => {
  const snap = await findExpenseSnapshotById(req.params.id, req.account!.id);
  if (!snap) throw new NotFoundError('Snapshot not found');
  await deleteExpenseSnapshot(req.params.id);
  res.status(204).end();
});

expensesRouter.post('/snapshots/:id/clone', async (req, res) => {
  const snap = await findExpenseSnapshotById(req.params.id, req.account!.id);
  if (!snap) throw new NotFoundError('Snapshot not found');
  const body = z.object({
    label: z.string().min(1).max(120),
    effective_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse(req.body);
  const cloned = await cloneExpenseSnapshot(req.params.id, req.account!.id, body.label, body.effective_date);
  res.status(201).json(cloned);
});

// ── Items ──────────────────────────────────────────────────────────────────────

expensesRouter.get('/snapshots/:id/items', async (req, res) => {
  const snap = await findExpenseSnapshotById(req.params.id, req.account!.id);
  if (!snap) throw new NotFoundError('Snapshot not found');
  const items = await listExpenseItems(req.params.id);
  const enriched = items.map((i) => {
    const monthly = itemMonthly(i);
    return { ...i, monthly_cost: monthly, annual_cost: monthly * 12 };
  });
  const totalMonthly = enriched.reduce((sum, i) => sum + i.monthly_cost, 0);
  const criticalMonthly = enriched.filter(i => i.critical).reduce((sum, i) => sum + i.monthly_cost, 0);
  const byCategory: Record<string, number> = {};
  for (const i of enriched) {
    byCategory[i.category] = (byCategory[i.category] ?? 0) + i.monthly_cost;
  }
  res.json({ items: enriched, totalMonthly, totalAnnual: totalMonthly * 12, criticalMonthly, byCategory });
});

expensesRouter.post('/snapshots/:id/items', async (req, res) => {
  const snap = await findExpenseSnapshotById(req.params.id, req.account!.id);
  if (!snap) throw new NotFoundError('Snapshot not found');
  const body = itemSchema.parse(req.body);
  const item = await createExpenseItem(
    req.params.id, body.name, body.owner ?? null, body.vertical ?? null,
    body.category, body.critical, body.amount, body.frequency,
  );
  res.status(201).json(item);
});

expensesRouter.post('/snapshots/:id/items/bulk', async (req, res) => {
  const snap = await findExpenseSnapshotById(req.params.id, req.account!.id);
  if (!snap) throw new NotFoundError('Snapshot not found');
  const body = z.object({ rows: z.array(itemSchema).min(1).max(500) }).parse(req.body);

  const values: unknown[] = [];
  const placeholders = body.rows.map((r, i) => {
    const b = i * 8;
    values.push(snap.id, r.name, r.owner ?? null, r.vertical ?? null, r.category, r.critical, r.amount, r.frequency);
    return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8})`;
  });
  await query(
    `INSERT INTO expense_items (snapshot_id,name,owner,vertical,category,critical,amount,frequency) VALUES ${placeholders.join(',')}`,
    values,
  );
  res.json({ inserted: body.rows.length });
});

expensesRouter.put('/items/:itemId', async (req, res) => {
  const existing = await findExpenseItemByIdForAccount(req.params.itemId, req.account!.id);
  if (!existing) throw new NotFoundError('Item not found');
  const body = itemSchema.parse(req.body);
  const updated = await updateExpenseItem(
    req.params.itemId, body.name, body.owner ?? null, body.vertical ?? null,
    body.category, body.critical, body.amount, body.frequency,
  );
  if (!updated) throw new NotFoundError('Item not found');
  res.json(updated);
});

expensesRouter.delete('/items/:itemId', async (req, res) => {
  const existing = await findExpenseItemByIdForAccount(req.params.itemId, req.account!.id);
  if (!existing) throw new NotFoundError('Item not found');
  await deleteExpenseItem(req.params.itemId);
  res.status(204).end();
});
