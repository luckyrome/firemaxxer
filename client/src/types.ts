export interface Account {
  id: string;
  email: string;
  verified: boolean;
  isAdmin: boolean;
}

// ── Assets & Liabilities ──────────────────────────────────────────────────────

export type AssetType = 'brokerage' | '401k' | 'roth_ira' | 'real_estate' | 'cash' | 'other';
export type LiabilityType = 'mortgage' | 'credit_card' | 'auto_loan' | 'student_loan' | 'other';

export interface Asset {
  id: string;
  account_id: string;
  name: string;
  type: AssetType;
  notes: string | null;
  created_at: string;
}

export interface AssetWithLatest extends Asset {
  latest_date: string | null;
  latest_value: string | null;
}

export interface AssetSnapshot {
  id: string;
  asset_id: string;
  snapshot_date: string;
  value: string;
  created_at: string;
}

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
  created_at: string;
}

export interface LiabilityWithLatest extends Liability {
  latest_date: string | null;
  latest_balance: string | null;
  linked_asset_name: string | null;
}

export interface LiabilitySnapshot {
  id: string;
  liability_id: string;
  snapshot_date: string;
  balance: string;
  created_at: string;
}

export interface NetWorthPoint {
  date: string;
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
}

// ── Income ────────────────────────────────────────────────────────────────────

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
  created_at: string;
  updated_at: string;
}

export interface IncomeSummary {
  monthlyTotal: number;
  annualTotal: number;
  taxableAnnual: number;
  sources: Array<IncomeSource & { monthly_equiv: number; annual_equiv: number }>;
}

// ── Expenses ──────────────────────────────────────────────────────────────────

export type ExpenseFrequency =
  | 'weekly' | 'bi_weekly' | 'monthly' | 'quarterly' | 'semi_annually' | 'annually';

export interface ExpenseSnapshot {
  id: string;
  account_id: string;
  label: string;
  effective_date: string;
  is_retirement_plan: boolean;
  created_at: string;
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
  created_at: string;
  monthly_cost?: number;
  annual_cost?: number;
}

export interface ExpenseSummary {
  totalMonthly: number;
  totalAnnual: number;
  criticalMonthly: number;
  byCategory: Record<string, number>;
}

// ── FIRE ──────────────────────────────────────────────────────────────────────

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
  activeExpenseSnapshotId: string | null;
  retiredExpenseSnapshotId: string | null;
}

export interface FireResult {
  monthlyIncome: number;
  monthlyExpenses: number;
  monthlyRetiredExpenses: number;
  annualDrain: number;
  existingAssets: number;
  fiBalance: number;
  yearsToFI: number | null;
  yearsToFIWithGrowth: number | null;
  estimatedFIDate: string | null;
  taxDetails: {
    grossIncome: number;
    caTotal: number;
    federalTotal: number;
    netMonthly: number;
  };
}

// ── Refi ──────────────────────────────────────────────────────────────────────

export interface RefiAnalysis {
  id: string;
  account_id: string;
  name: string;
  loan_original_value: string;
  loan_current_balance: string;
  current_annual_rate: string;
  months_in: number;
  assumed_investment_rate: string;
  home_value_after_loan: string | null;
  created_at: string;
  updated_at: string;
}

export interface RefiScenario {
  id: string;
  analysis_id: string;
  label: string;
  term_years: number;
  annual_rate: string;
  sort_order: number;
  created_at: string;
}

export interface RefiScenarioResult {
  scenarioId: string;
  label: string;
  termYears: number;
  annualRate: number;
  monthlyPayment: number;
  totalInterest: number;
  totalPaid: number;
  monthlyDelta: number;
  totalInterestDiff: number;
  investmentGainAtTermEnd: number;
  totalGainByChoosing: number;
}

export interface RefiResults {
  current: {
    monthlyPayment: number;
    remainingMonths: number;
    totalInterestRemaining: number;
    totalPaidRemaining: number;
  };
  scenarios: RefiScenarioResult[];
}
