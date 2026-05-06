import { apiFetch } from './client';
import type { ExpenseSnapshot, ExpenseItem, ExpenseSummary } from '../types';

type ItemWithCost = ExpenseItem & { monthly_cost: number; annual_cost: number };
type SnapshotDetail = ExpenseSummary & { items: ItemWithCost[] };

export function getExpenseSnapshots(): Promise<ExpenseSnapshot[]> {
  return apiFetch('/api/expenses/snapshots');
}

export function createExpenseSnapshot(data: {
  label: string; effective_date: string; is_retirement_plan: boolean;
}): Promise<ExpenseSnapshot> {
  return apiFetch('/api/expenses/snapshots', { method: 'POST', body: JSON.stringify(data) });
}

export function updateExpenseSnapshot(id: string, data: {
  label: string; effective_date: string; is_retirement_plan: boolean;
}): Promise<ExpenseSnapshot> {
  return apiFetch(`/api/expenses/snapshots/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteExpenseSnapshot(id: string): Promise<void> {
  return apiFetch(`/api/expenses/snapshots/${id}`, { method: 'DELETE' });
}

export function cloneExpenseSnapshot(id: string, data: {
  label: string; effective_date: string;
}): Promise<ExpenseSnapshot> {
  return apiFetch(`/api/expenses/snapshots/${id}/clone`, { method: 'POST', body: JSON.stringify(data) });
}

export function getExpenseItems(snapshotId: string): Promise<SnapshotDetail> {
  return apiFetch(`/api/expenses/snapshots/${snapshotId}/items`);
}

export function createExpenseItem(snapshotId: string, data: {
  name: string; owner: string | null; vertical: string | null;
  category: string; critical: boolean; amount: number; frequency: string;
}): Promise<ExpenseItem> {
  return apiFetch(`/api/expenses/snapshots/${snapshotId}/items`, { method: 'POST', body: JSON.stringify(data) });
}

export function updateExpenseItem(itemId: string, data: {
  name: string; owner: string | null; vertical: string | null;
  category: string; critical: boolean; amount: number; frequency: string;
}): Promise<ExpenseItem> {
  return apiFetch(`/api/expenses/items/${itemId}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteExpenseItem(itemId: string): Promise<void> {
  return apiFetch(`/api/expenses/items/${itemId}`, { method: 'DELETE' });
}
