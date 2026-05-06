import { query } from '../config/db';

export type LiabilityType = 'mortgage' | 'credit_card' | 'auto_loan' | 'student_loan' | 'other';

export interface Liability {
  id: string;
  account_id: string;
  name: string;
  type: LiabilityType;
  interest_rate: string;
  linked_asset_id: string | null;
  notes: string | null;
  origination_date: string | null;
  original_balance: string | null;
  term_months: number | null;
  created_at: Date;
}

export interface LiabilitySnapshot {
  id: string;
  liability_id: string;
  snapshot_date: string;
  balance: string;
  created_at: Date;
}

export interface LiabilityWithLatest extends Liability {
  latest_date: string | null;
  latest_balance: string | null;
  linked_asset_name: string | null;
}

export async function listLiabilities(accountId: string): Promise<LiabilityWithLatest[]> {
  const { rows } = await query<LiabilityWithLatest>(
    `SELECT l.*,
            s.snapshot_date AS latest_date,
            s.balance       AS latest_balance,
            a.name          AS linked_asset_name
     FROM liabilities l
     LEFT JOIN LATERAL (
       SELECT snapshot_date, balance
       FROM liability_snapshots
       WHERE liability_id = l.id
       ORDER BY snapshot_date DESC
       LIMIT 1
     ) s ON true
     LEFT JOIN assets a ON a.id = l.linked_asset_id
     WHERE l.account_id = $1
     ORDER BY l.created_at ASC`,
    [accountId],
  );
  return rows;
}

export async function findLiabilityById(id: string, accountId: string): Promise<Liability | null> {
  const { rows } = await query<Liability>(
    'SELECT * FROM liabilities WHERE id = $1 AND account_id = $2',
    [id, accountId],
  );
  return rows[0] ?? null;
}

export async function createLiability(
  accountId: string,
  name: string,
  type: LiabilityType,
  interestRate: number,
  linkedAssetId: string | null,
  notes: string | null,
  originationDate: string | null,
  originalBalance: number | null,
  termMonths: number | null,
): Promise<Liability> {
  const { rows } = await query<Liability>(
    `INSERT INTO liabilities
       (account_id, name, type, interest_rate, linked_asset_id, notes,
        origination_date, original_balance, term_months)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [accountId, name, type, interestRate, linkedAssetId, notes,
     originationDate, originalBalance, termMonths],
  );
  return rows[0];
}

export async function updateLiability(
  id: string,
  name: string,
  type: LiabilityType,
  interestRate: number,
  linkedAssetId: string | null,
  notes: string | null,
  originationDate: string | null,
  originalBalance: number | null,
  termMonths: number | null,
): Promise<Liability | null> {
  const { rows } = await query<Liability>(
    `UPDATE liabilities
     SET name=$2, type=$3, interest_rate=$4, linked_asset_id=$5, notes=$6,
         origination_date=$7, original_balance=$8, term_months=$9
     WHERE id=$1 RETURNING *`,
    [id, name, type, interestRate, linkedAssetId, notes,
     originationDate, originalBalance, termMonths],
  );
  return rows[0] ?? null;
}

export async function deleteLiability(id: string): Promise<void> {
  await query('DELETE FROM liabilities WHERE id = $1', [id]);
}

export async function listLiabilitySnapshots(liabilityId: string): Promise<LiabilitySnapshot[]> {
  const { rows } = await query<LiabilitySnapshot>(
    'SELECT * FROM liability_snapshots WHERE liability_id = $1 ORDER BY snapshot_date DESC',
    [liabilityId],
  );
  return rows;
}

export async function upsertLiabilitySnapshot(
  liabilityId: string,
  date: string,
  balance: number,
): Promise<LiabilitySnapshot> {
  const { rows } = await query<LiabilitySnapshot>(
    `INSERT INTO liability_snapshots (liability_id, snapshot_date, balance)
     VALUES ($1, $2, $3)
     ON CONFLICT (liability_id, snapshot_date) DO UPDATE SET balance = EXCLUDED.balance
     RETURNING *`,
    [liabilityId, date, balance],
  );
  return rows[0];
}

export async function deleteLiabilitySnapshot(id: string): Promise<void> {
  await query('DELETE FROM liability_snapshots WHERE id = $1', [id]);
}
