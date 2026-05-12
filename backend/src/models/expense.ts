import { query } from '../config/db';

export type ExpenseFrequency =
  | 'weekly' | 'bi_weekly' | 'monthly' | 'quarterly' | 'semi_annually' | 'annually';

export interface ExpenseSnapshot {
  id: string;
  account_id: string;
  label: string;
  effective_date: string;
  is_retirement_plan: boolean;
  created_at: Date;
}

export interface ExpenseItem {
  id: string;
  snapshot_id: string;
  name: string;
  owner: string | null;
  vertical: string | null;
  category: string;
  critical: boolean;
  amount: string;
  frequency: ExpenseFrequency;
  created_at: Date;
}

const MONTHLY_MULTIPLIERS: Record<ExpenseFrequency, number> = {
  weekly:        52 / 12,
  bi_weekly:     26 / 12,
  monthly:       1,
  quarterly:     1 / 3,
  semi_annually: 1 / 6,
  annually:      1 / 12,
};

export function itemMonthly(item: ExpenseItem): number {
  return parseFloat(item.amount) * MONTHLY_MULTIPLIERS[item.frequency];
}

export async function listExpenseSnapshots(accountId: string): Promise<ExpenseSnapshot[]> {
  const { rows } = await query<ExpenseSnapshot>(
    'SELECT * FROM expense_snapshots WHERE account_id = $1 ORDER BY effective_date DESC',
    [accountId],
  );
  return rows;
}

export async function findExpenseSnapshotById(id: string, accountId: string): Promise<ExpenseSnapshot | null> {
  const { rows } = await query<ExpenseSnapshot>(
    'SELECT * FROM expense_snapshots WHERE id = $1 AND account_id = $2',
    [id, accountId],
  );
  return rows[0] ?? null;
}

export async function createExpenseSnapshot(
  accountId: string,
  label: string,
  effectiveDate: string,
  isRetirementPlan: boolean,
): Promise<ExpenseSnapshot> {
  const { rows } = await query<ExpenseSnapshot>(
    `INSERT INTO expense_snapshots (account_id, label, effective_date, is_retirement_plan)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [accountId, label, effectiveDate, isRetirementPlan],
  );
  return rows[0];
}

export async function updateExpenseSnapshot(
  id: string,
  label: string,
  effectiveDate: string,
  isRetirementPlan: boolean,
): Promise<ExpenseSnapshot | null> {
  const { rows } = await query<ExpenseSnapshot>(
    `UPDATE expense_snapshots SET label=$2, effective_date=$3, is_retirement_plan=$4
     WHERE id=$1 RETURNING *`,
    [id, label, effectiveDate, isRetirementPlan],
  );
  return rows[0] ?? null;
}

export async function deleteExpenseSnapshot(id: string): Promise<void> {
  await query('DELETE FROM expense_snapshots WHERE id = $1', [id]);
}

export async function cloneExpenseSnapshot(
  sourceId: string,
  accountId: string,
  label: string,
  effectiveDate: string,
): Promise<ExpenseSnapshot> {
  const { rows: [snap] } = await query<ExpenseSnapshot>(
    `INSERT INTO expense_snapshots (account_id, label, effective_date, is_retirement_plan)
     SELECT $2, $3, $4, is_retirement_plan FROM expense_snapshots WHERE id = $1 AND account_id = $2
     RETURNING *`,
    [sourceId, accountId, label, effectiveDate],
  );
  await query(
    `INSERT INTO expense_items (snapshot_id, name, owner, vertical, category, critical, amount, frequency)
     SELECT $2, name, owner, vertical, category, critical, amount, frequency
     FROM expense_items WHERE snapshot_id = $1`,
    [sourceId, snap.id],
  );
  return snap;
}

// ── Items ─────────────────────────────────────────────────────────────────────

export async function findExpenseItemByIdForAccount(itemId: string, accountId: string): Promise<ExpenseItem | null> {
  const { rows } = await query<ExpenseItem>(
    `SELECT ei.* FROM expense_items ei
     JOIN expense_snapshots es ON es.id = ei.snapshot_id
     WHERE ei.id = $1 AND es.account_id = $2`,
    [itemId, accountId],
  );
  return rows[0] ?? null;
}

export async function listExpenseItems(snapshotId: string): Promise<ExpenseItem[]> {
  const { rows } = await query<ExpenseItem>(
    'SELECT * FROM expense_items WHERE snapshot_id = $1 ORDER BY created_at ASC',
    [snapshotId],
  );
  return rows;
}

export async function createExpenseItem(
  snapshotId: string,
  name: string,
  owner: string | null,
  vertical: string | null,
  category: string,
  critical: boolean,
  amount: number,
  frequency: ExpenseFrequency,
): Promise<ExpenseItem> {
  const { rows } = await query<ExpenseItem>(
    `INSERT INTO expense_items (snapshot_id, name, owner, vertical, category, critical, amount, frequency)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [snapshotId, name, owner, vertical, category, critical, amount, frequency],
  );
  return rows[0];
}

export async function updateExpenseItem(
  id: string,
  name: string,
  owner: string | null,
  vertical: string | null,
  category: string,
  critical: boolean,
  amount: number,
  frequency: ExpenseFrequency,
): Promise<ExpenseItem | null> {
  const { rows } = await query<ExpenseItem>(
    `UPDATE expense_items
     SET name=$2, owner=$3, vertical=$4, category=$5, critical=$6, amount=$7, frequency=$8
     WHERE id=$1 RETURNING *`,
    [id, name, owner, vertical, category, critical, amount, frequency],
  );
  return rows[0] ?? null;
}

export async function deleteExpenseItem(id: string): Promise<void> {
  await query('DELETE FROM expense_items WHERE id = $1', [id]);
}
