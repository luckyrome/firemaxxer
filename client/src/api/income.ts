import { apiFetch } from './client';
import type { IncomeSummary, IncomeSource } from '../types';

export function getIncome(): Promise<IncomeSummary> {
  return apiFetch('/api/income');
}

export function createIncomeSource(data: {
  name: string; amount: number; frequency: string;
  taxable: boolean; active: boolean; notes: string | null;
}): Promise<IncomeSource> {
  return apiFetch('/api/income', { method: 'POST', body: JSON.stringify(data) });
}

export function updateIncomeSource(id: string, data: {
  name: string; amount: number; frequency: string;
  taxable: boolean; active: boolean; notes: string | null;
}): Promise<IncomeSource> {
  return apiFetch(`/api/income/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteIncomeSource(id: string): Promise<void> {
  return apiFetch(`/api/income/${id}`, { method: 'DELETE' });
}
