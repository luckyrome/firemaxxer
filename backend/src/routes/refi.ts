import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/requireAuth';
import { NotFoundError } from '../middleware/errorHandler';
import {
  listAnalyses, findAnalysisById, createAnalysis, updateAnalysis, deleteAnalysis,
  listScenarios, createScenario, updateScenario, deleteScenario,
} from '../models/refi';
import { computeRefi } from '../services/refi';

export const refiRouter = Router();
refiRouter.use(requireAuth);

const analysisSchema = z.object({
  name:                   z.string().min(1).max(120),
  loan_original_value:    z.number().min(0),
  loan_current_balance:   z.number().min(0),
  current_annual_rate:    z.number().min(0).max(1),
  months_in:              z.number().int().min(0),
  assumed_investment_rate: z.number().min(0).max(1),
  home_value_after_loan:  z.number().min(0).nullable().optional(),
});

const scenarioSchema = z.object({
  label:      z.string().min(1).max(80),
  term_years: z.number().int().min(1).max(50),
  annual_rate: z.number().min(0).max(1),
  sort_order: z.number().int().min(0).optional(),
});

// ── Analyses ───────────────────────────────────────────────────────────────────

refiRouter.get('/', async (req, res) => {
  const analyses = await listAnalyses(req.account!.id);
  res.json(analyses);
});

refiRouter.post('/', async (req, res) => {
  const b = analysisSchema.parse(req.body);
  const analysis = await createAnalysis(
    req.account!.id, b.name, b.loan_original_value, b.loan_current_balance,
    b.current_annual_rate, b.months_in, b.assumed_investment_rate, b.home_value_after_loan ?? null,
  );
  res.status(201).json(analysis);
});

refiRouter.put('/:id', async (req, res) => {
  const existing = await findAnalysisById(req.params.id, req.account!.id);
  if (!existing) throw new NotFoundError('Analysis not found');
  const b = analysisSchema.parse(req.body);
  const updated = await updateAnalysis(
    req.params.id, b.name, b.loan_original_value, b.loan_current_balance,
    b.current_annual_rate, b.months_in, b.assumed_investment_rate, b.home_value_after_loan ?? null,
  );
  res.json(updated);
});

refiRouter.delete('/:id', async (req, res) => {
  const existing = await findAnalysisById(req.params.id, req.account!.id);
  if (!existing) throw new NotFoundError('Analysis not found');
  await deleteAnalysis(req.params.id);
  res.status(204).end();
});

// ── Scenarios ──────────────────────────────────────────────────────────────────

refiRouter.get('/:id/scenarios', async (req, res) => {
  const analysis = await findAnalysisById(req.params.id, req.account!.id);
  if (!analysis) throw new NotFoundError('Analysis not found');
  const scenarios = await listScenarios(req.params.id);
  res.json(scenarios);
});

refiRouter.post('/:id/scenarios', async (req, res) => {
  const analysis = await findAnalysisById(req.params.id, req.account!.id);
  if (!analysis) throw new NotFoundError('Analysis not found');
  const b = scenarioSchema.parse(req.body);
  const scenarios = await listScenarios(req.params.id);
  const sortOrder = b.sort_order ?? scenarios.length;
  const scenario = await createScenario(req.params.id, b.label, b.term_years, b.annual_rate, sortOrder);
  res.status(201).json(scenario);
});

refiRouter.put('/:id/scenarios/:scenarioId', async (req, res) => {
  const analysis = await findAnalysisById(req.params.id, req.account!.id);
  if (!analysis) throw new NotFoundError('Analysis not found');
  const b = scenarioSchema.parse(req.body);
  const updated = await updateScenario(req.params.scenarioId, b.label, b.term_years, b.annual_rate);
  if (!updated) throw new NotFoundError('Scenario not found');
  res.json(updated);
});

refiRouter.delete('/:id/scenarios/:scenarioId', async (req, res) => {
  const analysis = await findAnalysisById(req.params.id, req.account!.id);
  if (!analysis) throw new NotFoundError('Analysis not found');
  await deleteScenario(req.params.scenarioId);
  res.status(204).end();
});

// ── Computation ────────────────────────────────────────────────────────────────

refiRouter.get('/:id/result', async (req, res) => {
  const analysis = await findAnalysisById(req.params.id, req.account!.id);
  if (!analysis) throw new NotFoundError('Analysis not found');
  const scenarios = await listScenarios(req.params.id);
  const result = computeRefi(analysis, scenarios);
  res.json(result);
});
