import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { ForbiddenError, NotFoundError } from '../middleware/errorHandler';
import {
  listJurisdictions, findJurisdictionById, createJurisdiction, updateJurisdiction, deleteJurisdiction,
  listBracketSetsForJurisdiction, upsertBracketSet, deleteBracketSet,
  getAccountTaxProfile, upsertAccountTaxProfile,
  type FilingStatus, type IncomeType, type JurisdictionType,
} from '../models/taxBracket';

export const taxRouter = Router();
taxRouter.use(requireAuth);

const FILING_STATUSES = ['single', 'married_joint', 'married_separate', 'head_of_household'] as const;
const INCOME_TYPES    = ['ordinary', 'long_term_gains'] as const;
const JTYPES          = ['federal', 'state', 'local'] as const;

const jurisdictionSchema = z.object({
  name:         z.string().min(1).max(120),
  abbreviation: z.string().min(1).max(20),
  jtype:        z.enum(JTYPES),
});

const bracketSchema = z.object({
  income_floor: z.number().min(0),
  rate:         z.number().min(0).max(1),
});

const bracketSetSchema = z.object({
  tax_year:           z.number().int().min(2000).max(2100),
  income_type:        z.enum(INCOME_TYPES),
  filing_status:      z.enum(FILING_STATUSES),
  standard_deduction: z.number().min(0).default(0),
  notes:              z.string().max(500).nullable().optional(),
  brackets:           z.array(bracketSchema).min(1).max(50),
});

const profileSchema = z.object({
  tax_year:         z.number().int().min(2000).max(2100),
  filing_status:    z.enum(FILING_STATUSES),
  jurisdiction_ids: z.array(z.string().uuid()),
});

// ── Jurisdictions ─────────────────────────────────────────────────────────────

taxRouter.get('/jurisdictions', async (req, res) => {
  const jurisdictions = await listJurisdictions(req.account!.id);
  res.json(jurisdictions);
});

taxRouter.post('/jurisdictions', async (req, res) => {
  const body = jurisdictionSchema.parse(req.body);
  const j = await createJurisdiction(req.account!.id, body.name, body.abbreviation, body.jtype as JurisdictionType);
  res.status(201).json(j);
});

taxRouter.put('/jurisdictions/:id', async (req, res) => {
  const j = await findJurisdictionById(req.params.id);
  if (!j) throw new NotFoundError('Jurisdiction not found');
  if (j.created_by !== req.account!.id) throw new ForbiddenError('Cannot edit public or others\' jurisdictions');
  const body = jurisdictionSchema.parse(req.body);
  const updated = await updateJurisdiction(req.params.id, body.name, body.abbreviation, body.jtype as JurisdictionType);
  res.json(updated);
});

taxRouter.delete('/jurisdictions/:id', async (req, res) => {
  const j = await findJurisdictionById(req.params.id);
  if (!j) throw new NotFoundError('Jurisdiction not found');
  if (j.created_by !== req.account!.id) throw new ForbiddenError('Cannot delete public or others\' jurisdictions');
  await deleteJurisdiction(req.params.id);
  res.status(204).end();
});

// ── Bracket sets ──────────────────────────────────────────────────────────────

taxRouter.get('/jurisdictions/:id/bracket-sets', async (req, res) => {
  const sets = await listBracketSetsForJurisdiction(req.params.id);
  res.json(sets);
});

taxRouter.post('/jurisdictions/:id/bracket-sets', async (req, res) => {
  const j = await findJurisdictionById(req.params.id);
  if (!j) throw new NotFoundError('Jurisdiction not found');
  // Allow users to add bracket sets to public jurisdictions (their own set) or own custom jurisdictions
  const body = bracketSetSchema.parse(req.body);
  const set = await upsertBracketSet(
    req.params.id,
    body.tax_year,
    body.income_type as IncomeType,
    body.filing_status as FilingStatus,
    body.standard_deduction,
    body.notes ?? null,
    req.account!.id,
    body.brackets,
  );
  res.status(201).json(set);
});

taxRouter.delete('/bracket-sets/:id', async (req, res) => {
  await deleteBracketSet(req.params.id);
  res.status(204).end();
});

// ── Profile ───────────────────────────────────────────────────────────────────

taxRouter.get('/profile', async (req, res) => {
  const profile = await getAccountTaxProfile(req.account!.id);
  res.json(profile ?? { tax_year: 2025, filing_status: 'single', jurisdiction_ids: [] });
});

taxRouter.put('/profile', async (req, res) => {
  const body = profileSchema.parse(req.body);
  const profile = await upsertAccountTaxProfile(
    req.account!.id,
    body.tax_year,
    body.filing_status as FilingStatus,
    body.jurisdiction_ids,
  );
  res.json(profile);
});
