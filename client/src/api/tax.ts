import { apiFetch } from './client';
import type {
  TaxJurisdiction, TaxBracketSet, TaxProfile,
  JurisdictionType, IncomeType, FilingStatus,
} from '../types';

export function getJurisdictions(): Promise<TaxJurisdiction[]> {
  return apiFetch('/api/tax/jurisdictions');
}

export function createJurisdiction(data: {
  name: string; abbreviation: string; jtype: JurisdictionType;
}): Promise<TaxJurisdiction> {
  return apiFetch('/api/tax/jurisdictions', { method: 'POST', body: JSON.stringify(data) });
}

export function updateJurisdiction(id: string, data: {
  name: string; abbreviation: string; jtype: JurisdictionType;
}): Promise<TaxJurisdiction> {
  return apiFetch(`/api/tax/jurisdictions/${id}`, { method: 'PUT', body: JSON.stringify(data) });
}

export function deleteJurisdiction(id: string): Promise<void> {
  return apiFetch(`/api/tax/jurisdictions/${id}`, { method: 'DELETE' });
}

export function getBracketSets(jurisdictionId: string): Promise<TaxBracketSet[]> {
  return apiFetch(`/api/tax/jurisdictions/${jurisdictionId}/bracket-sets`);
}

export function upsertBracketSet(jurisdictionId: string, data: {
  tax_year: number;
  income_type: IncomeType;
  filing_status: FilingStatus;
  standard_deduction: number;
  notes?: string | null;
  brackets: { income_floor: number; rate: number }[];
}): Promise<TaxBracketSet> {
  return apiFetch(`/api/tax/jurisdictions/${jurisdictionId}/bracket-sets`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function deleteBracketSet(id: string): Promise<void> {
  return apiFetch(`/api/tax/bracket-sets/${id}`, { method: 'DELETE' });
}

export function getTaxProfile(): Promise<TaxProfile> {
  return apiFetch('/api/tax/profile');
}

export function saveTaxProfile(data: TaxProfile): Promise<TaxProfile> {
  return apiFetch('/api/tax/profile', { method: 'PUT', body: JSON.stringify(data) });
}
