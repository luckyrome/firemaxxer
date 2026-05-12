import { query } from '../config/db';

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
  created_at: Date;
  updated_at: Date;
}

export interface RefiScenario {
  id: string;
  analysis_id: string;
  label: string;
  term_years: number;
  annual_rate: string;
  origination_fee: string;
  sort_order: number;
  created_at: Date;
}

export async function listAnalyses(accountId: string): Promise<RefiAnalysis[]> {
  const { rows } = await query<RefiAnalysis>(
    'SELECT * FROM refi_analyses WHERE account_id = $1 ORDER BY created_at DESC',
    [accountId],
  );
  return rows;
}

export async function findAnalysisById(id: string, accountId: string): Promise<RefiAnalysis | null> {
  const { rows } = await query<RefiAnalysis>(
    'SELECT * FROM refi_analyses WHERE id = $1 AND account_id = $2',
    [id, accountId],
  );
  return rows[0] ?? null;
}

export async function createAnalysis(
  accountId: string,
  name: string,
  loanOriginalValue: number,
  loanCurrentBalance: number,
  currentAnnualRate: number,
  monthsIn: number,
  assumedInvestmentRate: number,
  homeValueAfterLoan: number | null,
): Promise<RefiAnalysis> {
  const { rows } = await query<RefiAnalysis>(
    `INSERT INTO refi_analyses
       (account_id, name, loan_original_value, loan_current_balance, current_annual_rate,
        months_in, assumed_investment_rate, home_value_after_loan)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [accountId, name, loanOriginalValue, loanCurrentBalance, currentAnnualRate,
     monthsIn, assumedInvestmentRate, homeValueAfterLoan],
  );
  return rows[0];
}

export async function updateAnalysis(
  id: string,
  name: string,
  loanOriginalValue: number,
  loanCurrentBalance: number,
  currentAnnualRate: number,
  monthsIn: number,
  assumedInvestmentRate: number,
  homeValueAfterLoan: number | null,
): Promise<RefiAnalysis | null> {
  const { rows } = await query<RefiAnalysis>(
    `UPDATE refi_analyses
     SET name=$2, loan_original_value=$3, loan_current_balance=$4, current_annual_rate=$5,
         months_in=$6, assumed_investment_rate=$7, home_value_after_loan=$8, updated_at=now()
     WHERE id=$1 RETURNING *`,
    [id, name, loanOriginalValue, loanCurrentBalance, currentAnnualRate,
     monthsIn, assumedInvestmentRate, homeValueAfterLoan],
  );
  return rows[0] ?? null;
}

export async function deleteAnalysis(id: string): Promise<void> {
  await query('DELETE FROM refi_analyses WHERE id = $1', [id]);
}

export async function listScenarios(analysisId: string): Promise<RefiScenario[]> {
  const { rows } = await query<RefiScenario>(
    'SELECT * FROM refi_scenarios WHERE analysis_id = $1 ORDER BY sort_order ASC, created_at ASC',
    [analysisId],
  );
  return rows;
}

export async function createScenario(
  analysisId: string,
  label: string,
  termYears: number,
  annualRate: number,
  originationFee: number,
  sortOrder: number,
): Promise<RefiScenario> {
  const { rows } = await query<RefiScenario>(
    `INSERT INTO refi_scenarios (analysis_id, label, term_years, annual_rate, origination_fee, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [analysisId, label, termYears, annualRate, originationFee, sortOrder],
  );
  return rows[0];
}

export async function updateScenario(
  id: string,
  label: string,
  termYears: number,
  annualRate: number,
  originationFee: number,
): Promise<RefiScenario | null> {
  const { rows } = await query<RefiScenario>(
    `UPDATE refi_scenarios SET label=$2, term_years=$3, annual_rate=$4, origination_fee=$5 WHERE id=$1 RETURNING *`,
    [id, label, termYears, annualRate, originationFee],
  );
  return rows[0] ?? null;
}

export async function deleteScenario(id: string): Promise<void> {
  await query('DELETE FROM refi_scenarios WHERE id = $1', [id]);
}
