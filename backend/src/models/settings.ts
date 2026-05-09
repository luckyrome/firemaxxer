import { query } from '../config/db';

export interface FireConfig {
  annualSalary: number;
  annualBonus: number;
  rsuQuarterlyGross: number;
  esppQuarterlyGain: number;
  k401Annual: number;
  medicalDeductionAnnual: number;
  caStateTaxRate: number;
  caMaxPrevBracket: number;
  caMaxTaxPrevBracket: number;
  fedTaxRate: number;
  fedMaxPrevBracket: number;
  fedMaxTaxPrevBracket: number;
  ltCapGainsRate: number;
  safeWithdrawalRate: number;
  assumedGrowthRate: number;
  retirementAnnualIncome: number;
  fiExplicitTarget: number;
  retirementWithdrawalType: 'long_term_gains' | 'ordinary';
  activeExpenseSnapshotId: string | null;
  retiredExpenseSnapshotId: string | null;
}

export const DEFAULT_FIRE_CONFIG: FireConfig = {
  annualSalary: 0,
  annualBonus: 0,
  rsuQuarterlyGross: 0,
  esppQuarterlyGain: 0,
  k401Annual: 0,
  medicalDeductionAnnual: 0,
  caStateTaxRate: 0,
  caMaxPrevBracket: 0,
  caMaxTaxPrevBracket: 0,
  fedTaxRate: 0,
  fedMaxPrevBracket: 0,
  fedMaxTaxPrevBracket: 0,
  ltCapGainsRate: 0.15,
  safeWithdrawalRate: 0.04,
  assumedGrowthRate: 0.04,
  retirementAnnualIncome: 0,
  fiExplicitTarget: 0,
  retirementWithdrawalType: 'long_term_gains',
  activeExpenseSnapshotId: null,
  retiredExpenseSnapshotId: null,
};

interface SettingsRow {
  account_id: string;
  fire_config: FireConfig;
  updated_at: Date;
}

export async function getSettings(accountId: string): Promise<FireConfig> {
  const { rows } = await query<SettingsRow>(
    'SELECT * FROM account_settings WHERE account_id = $1',
    [accountId],
  );
  if (!rows.length) return { ...DEFAULT_FIRE_CONFIG };
  return { ...DEFAULT_FIRE_CONFIG, ...rows[0].fire_config };
}

export async function upsertSettings(accountId: string, config: Partial<FireConfig>): Promise<FireConfig> {
  const current = await getSettings(accountId);
  const merged = { ...current, ...config };
  await query(
    `INSERT INTO account_settings (account_id, fire_config, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (account_id) DO UPDATE SET fire_config = $2, updated_at = now()`,
    [accountId, JSON.stringify(merged)],
  );
  return merged;
}
