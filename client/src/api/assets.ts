import { apiFetch } from './client';
import type {
  Asset, AssetWithLatest, AssetSnapshot,
  Liability, LiabilityWithLatest, LiabilitySnapshot,
  NetWorthPoint,
} from '../types';

// ── Assets ────────────────────────────────────────────────────────────────────

export function getAssets(): Promise<AssetWithLatest[]> {
  return apiFetch('/api/assets');
}

export function createAsset(body: { name: string; type: Asset['type']; notes?: string | null }): Promise<Asset> {
  return apiFetch('/api/assets', { method: 'POST', body: JSON.stringify(body) });
}

export function updateAsset(id: string, body: { name: string; type: Asset['type']; notes?: string | null }): Promise<Asset> {
  return apiFetch(`/api/assets/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function deleteAsset(id: string): Promise<void> {
  return apiFetch(`/api/assets/${id}`, { method: 'DELETE' });
}

export function getAssetSnapshots(assetId: string): Promise<AssetSnapshot[]> {
  return apiFetch(`/api/assets/${assetId}/snapshots`);
}

export function addAssetSnapshot(assetId: string, body: { snapshot_date: string; value: number }): Promise<AssetSnapshot> {
  return apiFetch(`/api/assets/${assetId}/snapshots`, { method: 'POST', body: JSON.stringify(body) });
}

export function deleteAssetSnapshot(assetId: string, snapshotId: string): Promise<void> {
  return apiFetch(`/api/assets/${assetId}/snapshots/${snapshotId}`, { method: 'DELETE' });
}

// ── Liabilities ───────────────────────────────────────────────────────────────

export function getLiabilities(): Promise<LiabilityWithLatest[]> {
  return apiFetch('/api/assets/liabilities');
}

export function createLiability(body: {
  name: string; type: Liability['type']; interest_rate: number;
  linked_asset_id?: string | null; notes?: string | null;
  origination_date?: string | null; original_balance?: number | null; term_months?: number | null;
}): Promise<Liability> {
  return apiFetch('/api/assets/liabilities', { method: 'POST', body: JSON.stringify(body) });
}

export function updateLiability(id: string, body: {
  name: string; type: Liability['type']; interest_rate: number;
  linked_asset_id?: string | null; notes?: string | null;
  origination_date?: string | null; original_balance?: number | null; term_months?: number | null;
}): Promise<Liability> {
  return apiFetch(`/api/assets/liabilities/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}

export function deleteLiability(id: string): Promise<void> {
  return apiFetch(`/api/assets/liabilities/${id}`, { method: 'DELETE' });
}

export function getLiabilitySnapshots(liabilityId: string): Promise<LiabilitySnapshot[]> {
  return apiFetch(`/api/assets/liabilities/${liabilityId}/snapshots`);
}

export function addLiabilitySnapshot(liabilityId: string, body: { snapshot_date: string; balance: number }): Promise<LiabilitySnapshot> {
  return apiFetch(`/api/assets/liabilities/${liabilityId}/snapshots`, { method: 'POST', body: JSON.stringify(body) });
}

export function deleteLiabilitySnapshot(liabilityId: string, snapshotId: string): Promise<void> {
  return apiFetch(`/api/assets/liabilities/${liabilityId}/snapshots/${snapshotId}`, { method: 'DELETE' });
}

export function bulkAddAssetSnapshots(
  assetId: string,
  rows: { snapshot_date: string; value: number }[],
): Promise<{ imported: number }> {
  return apiFetch(`/api/assets/${assetId}/snapshots/bulk`, { method: 'POST', body: JSON.stringify({ rows }) });
}

export function bulkAddLiabilitySnapshots(
  liabilityId: string,
  rows: { snapshot_date: string; balance: number }[],
): Promise<{ imported: number }> {
  return apiFetch(`/api/assets/liabilities/${liabilityId}/snapshots/bulk`, { method: 'POST', body: JSON.stringify({ rows }) });
}

// ── Net worth ─────────────────────────────────────────────────────────────────

export function getNetWorth(): Promise<NetWorthPoint[]> {
  return apiFetch('/api/assets/net-worth');
}
