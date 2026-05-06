import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { NotFoundError, ForbiddenError } from '../middleware/errorHandler';
import {
  listAssets, findAssetById, createAsset, updateAsset, deleteAsset,
  listSnapshots, upsertSnapshot, deleteSnapshot,
} from '../models/asset';
import {
  listLiabilities, findLiabilityById, createLiability, updateLiability, deleteLiability,
  listLiabilitySnapshots, upsertLiabilitySnapshot, deleteLiabilitySnapshot,
} from '../models/liability';
import { query } from '../config/db';

const router = Router();
router.use(requireAuth);

// ── Asset CRUD ───────────────────────────────────────────────────────────────

const assetSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['brokerage', '401k', 'roth_ira', 'real_estate', 'cash', 'other']),
  notes: z.string().max(500).nullable().optional(),
});

router.get('/', async (req, res, next) => {
  try {
    const assets = await listAssets(req.account!.id);
    res.json(assets);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, type, notes } = assetSchema.parse(req.body);
    const asset = await createAsset(req.account!.id, name, type, notes ?? null);
    res.status(201).json(asset);
  } catch (err) { next(err); }
});

router.put('/:id', async (req, res, next) => {
  try {
    const asset = await findAssetById(req.params.id, req.account!.id);
    if (!asset) throw new NotFoundError('Asset not found');
    const { name, type, notes } = assetSchema.parse(req.body);
    const updated = await updateAsset(asset.id, name, type, notes ?? null);
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const asset = await findAssetById(req.params.id, req.account!.id);
    if (!asset) throw new NotFoundError('Asset not found');
    await deleteAsset(asset.id);
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Asset snapshots ──────────────────────────────────────────────────────────

const snapshotSchema = z.object({
  snapshot_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  value: z.number().nonnegative(),
});

router.get('/:id/snapshots', async (req, res, next) => {
  try {
    const asset = await findAssetById(req.params.id, req.account!.id);
    if (!asset) throw new NotFoundError('Asset not found');
    const snapshots = await listSnapshots(asset.id);
    res.json(snapshots);
  } catch (err) { next(err); }
});

router.post('/:id/snapshots', async (req, res, next) => {
  try {
    const asset = await findAssetById(req.params.id, req.account!.id);
    if (!asset) throw new NotFoundError('Asset not found');
    const { snapshot_date, value } = snapshotSchema.parse(req.body);
    const snapshot = await upsertSnapshot(asset.id, snapshot_date, value);
    res.status(201).json(snapshot);
  } catch (err) { next(err); }
});

router.delete('/:id/snapshots/:snapshotId', async (req, res, next) => {
  try {
    const asset = await findAssetById(req.params.id, req.account!.id);
    if (!asset) throw new NotFoundError('Asset not found');
    // Verify the snapshot belongs to this asset
    const { rows } = await query(
      'SELECT id FROM asset_snapshots WHERE id = $1 AND asset_id = $2',
      [req.params.snapshotId, asset.id],
    );
    if (!rows.length) throw new NotFoundError('Snapshot not found');
    await deleteSnapshot(req.params.snapshotId);
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Liability CRUD ───────────────────────────────────────────────────────────

const liabilitySchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['mortgage', 'credit_card', 'auto_loan', 'student_loan', 'other']),
  interest_rate: z.number().min(0).max(1),
  linked_asset_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
  origination_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  original_balance: z.number().min(0).nullable().optional(),
  term_months: z.number().int().min(1).nullable().optional(),
});

router.get('/liabilities', async (req, res, next) => {
  try {
    const liabilities = await listLiabilities(req.account!.id);
    res.json(liabilities);
  } catch (err) { next(err); }
});

router.post('/liabilities', async (req, res, next) => {
  try {
    const b = liabilitySchema.parse(req.body);
    if (b.linked_asset_id) {
      const asset = await findAssetById(b.linked_asset_id, req.account!.id);
      if (!asset) throw new ForbiddenError('Linked asset not found');
    }
    const liability = await createLiability(
      req.account!.id, b.name, b.type, b.interest_rate,
      b.linked_asset_id ?? null, b.notes ?? null,
      b.origination_date ?? null, b.original_balance ?? null, b.term_months ?? null,
    );
    res.status(201).json(liability);
  } catch (err) { next(err); }
});

router.put('/liabilities/:id', async (req, res, next) => {
  try {
    const liability = await findLiabilityById(req.params.id, req.account!.id);
    if (!liability) throw new NotFoundError('Liability not found');
    const b = liabilitySchema.parse(req.body);
    if (b.linked_asset_id) {
      const asset = await findAssetById(b.linked_asset_id, req.account!.id);
      if (!asset) throw new ForbiddenError('Linked asset not found');
    }
    const updated = await updateLiability(
      liability.id, b.name, b.type, b.interest_rate,
      b.linked_asset_id ?? null, b.notes ?? null,
      b.origination_date ?? null, b.original_balance ?? null, b.term_months ?? null,
    );
    res.json(updated);
  } catch (err) { next(err); }
});

router.delete('/liabilities/:id', async (req, res, next) => {
  try {
    const liability = await findLiabilityById(req.params.id, req.account!.id);
    if (!liability) throw new NotFoundError('Liability not found');
    await deleteLiability(liability.id);
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Liability snapshots ──────────────────────────────────────────────────────

const liabilitySnapshotSchema = z.object({
  snapshot_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  balance: z.number().nonnegative(),
});

router.get('/liabilities/:id/snapshots', async (req, res, next) => {
  try {
    const liability = await findLiabilityById(req.params.id, req.account!.id);
    if (!liability) throw new NotFoundError('Liability not found');
    const snapshots = await listLiabilitySnapshots(liability.id);
    res.json(snapshots);
  } catch (err) { next(err); }
});

router.post('/liabilities/:id/snapshots', async (req, res, next) => {
  try {
    const liability = await findLiabilityById(req.params.id, req.account!.id);
    if (!liability) throw new NotFoundError('Liability not found');
    const { snapshot_date, balance } = liabilitySnapshotSchema.parse(req.body);
    const snapshot = await upsertLiabilitySnapshot(liability.id, snapshot_date, balance);
    res.status(201).json(snapshot);
  } catch (err) { next(err); }
});

router.delete('/liabilities/:id/snapshots/:snapshotId', async (req, res, next) => {
  try {
    const liability = await findLiabilityById(req.params.id, req.account!.id);
    if (!liability) throw new NotFoundError('Liability not found');
    const { rows } = await query(
      'SELECT id FROM liability_snapshots WHERE id = $1 AND liability_id = $2',
      [req.params.snapshotId, liability.id],
    );
    if (!rows.length) throw new NotFoundError('Snapshot not found');
    await deleteLiabilitySnapshot(req.params.snapshotId);
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Bulk snapshot import ─────────────────────────────────────────────────────

const bulkAssetSchema = z.object({
  rows: z.array(z.object({
    snapshot_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    value: z.number().nonnegative(),
  })).min(1).max(500),
});

router.post('/:id/snapshots/bulk', async (req, res, next) => {
  try {
    const asset = await findAssetById(req.params.id, req.account!.id);
    if (!asset) throw new NotFoundError('Asset not found');
    const { rows } = bulkAssetSchema.parse(req.body);
    const results = await Promise.all(
      rows.map((r) => upsertSnapshot(asset.id, r.snapshot_date, r.value)),
    );
    res.json({ imported: results.length });
  } catch (err) { next(err); }
});

const bulkLiabilitySchema = z.object({
  rows: z.array(z.object({
    snapshot_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    balance: z.number().nonnegative(),
  })).min(1).max(500),
});

router.post('/liabilities/:id/snapshots/bulk', async (req, res, next) => {
  try {
    const liability = await findLiabilityById(req.params.id, req.account!.id);
    if (!liability) throw new NotFoundError('Liability not found');
    const { rows } = bulkLiabilitySchema.parse(req.body);
    const results = await Promise.all(
      rows.map((r) => upsertLiabilitySnapshot(liability.id, r.snapshot_date, r.balance)),
    );
    res.json({ imported: results.length });
  } catch (err) { next(err); }
});

// ── Net worth ────────────────────────────────────────────────────────────────

router.get('/net-worth', async (req, res, next) => {
  try {
    const accountId = req.account!.id;

    // All asset snapshot dates for this account
    const { rows } = await query<{
      snapshot_date: string;
      total_assets: string;
      total_liabilities: string;
    }>(
      `WITH dates AS (
         SELECT DISTINCT snapshot_date FROM asset_snapshots
         WHERE asset_id IN (SELECT id FROM assets WHERE account_id = $1)
         UNION
         SELECT DISTINCT snapshot_date FROM liability_snapshots
         WHERE liability_id IN (SELECT id FROM liabilities WHERE account_id = $1)
       ),
       asset_totals AS (
         SELECT d.snapshot_date,
                COALESCE(SUM(
                  -- use the most recent snapshot on or before this date for each asset
                  (SELECT value FROM asset_snapshots s2
                   WHERE s2.asset_id = a.id AND s2.snapshot_date <= d.snapshot_date
                   ORDER BY s2.snapshot_date DESC LIMIT 1)
                ), 0) AS total_assets
         FROM dates d
         CROSS JOIN assets a
         WHERE a.account_id = $1
         GROUP BY d.snapshot_date
       ),
       liability_totals AS (
         SELECT d.snapshot_date,
                COALESCE(SUM(
                  (SELECT balance FROM liability_snapshots s2
                   WHERE s2.liability_id = l.id AND s2.snapshot_date <= d.snapshot_date
                   ORDER BY s2.snapshot_date DESC LIMIT 1)
                ), 0) AS total_liabilities
         FROM dates d
         CROSS JOIN liabilities l
         WHERE l.account_id = $1
         GROUP BY d.snapshot_date
       )
       SELECT d.snapshot_date,
              COALESCE(at.total_assets, 0)      AS total_assets,
              COALESCE(lt.total_liabilities, 0) AS total_liabilities
       FROM dates d
       LEFT JOIN asset_totals at      USING (snapshot_date)
       LEFT JOIN liability_totals lt  USING (snapshot_date)
       ORDER BY d.snapshot_date ASC`,
      [accountId],
    );

    res.json(rows.map((r) => ({
      date: r.snapshot_date,
      totalAssets: parseFloat(r.total_assets),
      totalLiabilities: parseFloat(r.total_liabilities),
      netWorth: parseFloat(r.total_assets) - parseFloat(r.total_liabilities),
    })));
  } catch (err) { next(err); }
});

export { router as assetsRouter };
