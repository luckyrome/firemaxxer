import { query } from '../config/db';

export type IncomeFrequency =
  | 'weekly' | 'bi_weekly' | 'semi_monthly' | 'monthly'
  | 'quarterly' | 'semi_annually' | 'annually';

export interface IncomeSource {
  id: string;
  account_id: string;
  name: string;
  amount: string;
  frequency: IncomeFrequency;
  taxable: boolean;
  active: boolean;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
}

// Multipliers to convert one unit of a frequency to monthly
const MONTHLY_MULTIPLIERS: Record<IncomeFrequency, number> = {
  weekly:        52 / 12,
  bi_weekly:     26 / 12,
  semi_monthly:  2,
  monthly:       1,
  quarterly:     1 / 3,
  semi_annually: 1 / 6,
  annually:      1 / 12,
};

export function toMonthly(amount: number, freq: IncomeFrequency): number {
  return amount * MONTHLY_MULTIPLIERS[freq];
}

export async function listIncomeSources(accountId: string): Promise<IncomeSource[]> {
  const { rows } = await query<IncomeSource>(
    'SELECT * FROM income_sources WHERE account_id = $1 ORDER BY created_at ASC',
    [accountId],
  );
  return rows;
}

export async function findIncomeSourceById(id: string, accountId: string): Promise<IncomeSource | null> {
  const { rows } = await query<IncomeSource>(
    'SELECT * FROM income_sources WHERE id = $1 AND account_id = $2',
    [id, accountId],
  );
  return rows[0] ?? null;
}

export async function createIncomeSource(
  accountId: string,
  name: string,
  amount: number,
  frequency: IncomeFrequency,
  taxable: boolean,
  active: boolean,
  notes: string | null,
): Promise<IncomeSource> {
  const { rows } = await query<IncomeSource>(
    `INSERT INTO income_sources (account_id, name, amount, frequency, taxable, active, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [accountId, name, amount, frequency, taxable, active, notes],
  );
  return rows[0];
}

export async function updateIncomeSource(
  id: string,
  name: string,
  amount: number,
  frequency: IncomeFrequency,
  taxable: boolean,
  active: boolean,
  notes: string | null,
): Promise<IncomeSource | null> {
  const { rows } = await query<IncomeSource>(
    `UPDATE income_sources
     SET name=$2, amount=$3, frequency=$4, taxable=$5, active=$6, notes=$7, updated_at=now()
     WHERE id=$1 RETURNING *`,
    [id, name, amount, frequency, taxable, active, notes],
  );
  return rows[0] ?? null;
}

export async function deleteIncomeSource(id: string): Promise<void> {
  await query('DELETE FROM income_sources WHERE id = $1', [id]);
}
