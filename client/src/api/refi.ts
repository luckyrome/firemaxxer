import { apiFetch } from './client';
import type { RefiAnalysis, RefiScenario, RefiResults, FireResult } from '../types';

export function getAnalyses(): Promise<RefiAnalysis[]> {
  return apiFetch('/api/refi');
}

export function createAnalysis(data: {
  name: string; loan_original_value: number; loan_current_balance: number;
  current_annual_rate: number; months_in: number; assumed_investment_rate: number;
  home_value_after_loan: number | null;
}): Promise<RefiAnalysis> {
  return apiFetch('/api/refi', { method: 'POST', body: JSON.stringify(data) });
}

export function updateAnalysis(id: string, data: {
  name: string; loan_original_value: number; loan_current_balance: number;
  current_annual_rate: number; months_in: number; assumed_investment_rate: number;
  home_value_after_loan: number | null;
}): Promise<RefiAnalysis> {
  return apiFetch(`/api/refi/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteAnalysis(id: string): Promise<void> {
  return apiFetch(`/api/refi/${id}`, { method: 'DELETE' });
}

export function getScenarios(analysisId: string): Promise<RefiScenario[]> {
  return apiFetch(`/api/refi/${analysisId}/scenarios`);
}

export function createScenario(analysisId: string, data: {
  label: string; term_years: number; annual_rate: number; sort_order?: number;
}): Promise<RefiScenario> {
  return apiFetch(`/api/refi/${analysisId}/scenarios`, { method: 'POST', body: JSON.stringify(data) });
}

export function updateScenario(analysisId: string, scenarioId: string, data: {
  label: string; term_years: number; annual_rate: number;
}): Promise<RefiScenario> {
  return apiFetch(`/api/refi/${analysisId}/scenarios/${scenarioId}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteScenario(analysisId: string, scenarioId: string): Promise<void> {
  return apiFetch(`/api/refi/${analysisId}/scenarios/${scenarioId}`, { method: 'DELETE' });
}

export function getRefiResult(analysisId: string): Promise<RefiResults> {
  return apiFetch(`/api/refi/${analysisId}/result`);
}

export function getFireResult(): Promise<FireResult> {
  return apiFetch('/api/fire/result');
}
