import { query } from '../config/db';

export type AssetType = 'brokerage' | '401k' | 'roth_ira' | 'real_estate' | 'cash' | 'other';

export interface Asset {
  id: string;
  account_id: string;
  name: string;
  type: AssetType;
  notes: string | null;
  created_at: Date;
}

export interface AssetSnapshot {
  id: string;
  asset_id: string;
  snapshot_date: string; // YYYY-MM-DD
  value: string;         // NUMERIC comes back as string from pg
  created_at: Date;
}

export interface AssetWithLatest extends Asset {
  latest_date: string | null;
  latest_value: string | null;
}

export async function listAssets(accountId: string): Promise<AssetWithLatest[]> {
  const { rows } = await query<AssetWithLatest>(
    `SELECT a.*,
            s.snapshot_date AS latest_date,
            s.value         AS latest_value
     FROM assets a
     LEFT JOIN LATERAL (
       SELECT snapshot_date, value
       FROM asset_snapshots
       WHERE asset_id = a.id
       ORDER BY snapshot_date DESC
       LIMIT 1
     ) s ON true
     WHERE a.account_id = $1
     ORDER BY a.created_at ASC`,
    [accountId],
  );
  return rows;
}

export async function findAssetById(id: string, accountId: string): Promise<Asset | null> {
  const { rows } = await query<Asset>(
    'SELECT * FROM assets WHERE id = $1 AND account_id = $2',
    [id, accountId],
  );
  return rows[0] ?? null;
}

export async function createAsset(
  accountId: string,
  name: string,
  type: AssetType,
  notes: string | null,
): Promise<Asset> {
  const { rows } = await query<Asset>(
    'INSERT INTO assets (account_id, name, type, notes) VALUES ($1,$2,$3,$4) RETURNING *',
    [accountId, name, type, notes],
  );
  return rows[0];
}

export async function updateAsset(
  id: string,
  name: string,
  type: AssetType,
  notes: string | null,
): Promise<Asset | null> {
  const { rows } = await query<Asset>(
    'UPDATE assets SET name=$2, type=$3, notes=$4 WHERE id=$1 RETURNING *',
    [id, name, type, notes],
  );
  return rows[0] ?? null;
}

export async function deleteAsset(id: string): Promise<void> {
  await query('DELETE FROM assets WHERE id = $1', [id]);
}

export async function listSnapshots(assetId: string): Promise<AssetSnapshot[]> {
  const { rows } = await query<AssetSnapshot>(
    'SELECT * FROM asset_snapshots WHERE asset_id = $1 ORDER BY snapshot_date DESC',
    [assetId],
  );
  return rows;
}

export async function upsertSnapshot(
  assetId: string,
  date: string,
  value: number,
): Promise<AssetSnapshot> {
  const { rows } = await query<AssetSnapshot>(
    `INSERT INTO asset_snapshots (asset_id, snapshot_date, value)
     VALUES ($1, $2, $3)
     ON CONFLICT (asset_id, snapshot_date) DO UPDATE SET value = EXCLUDED.value
     RETURNING *`,
    [assetId, date, value],
  );
  return rows[0];
}

export async function deleteSnapshot(id: string): Promise<void> {
  await query('DELETE FROM asset_snapshots WHERE id = $1', [id]);
}
