import { apiFetch } from './client';
import type { FireConfig } from '../types';

export function getSettings(): Promise<FireConfig> {
  return apiFetch('/api/settings');
}

export function updateSettings(data: Partial<FireConfig>): Promise<FireConfig> {
  return apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify(data) });
}
