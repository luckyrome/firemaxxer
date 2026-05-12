import type { RefiAnalysis, RefiScenario } from '../models/refi';

export interface RefiScenarioResult {
  scenarioId: string;
  label: string;
  termYears: number;
  annualRate: number;
  originationFee: number;
  monthlyPayment: number;
  totalInterest: number;
  totalPaid: number;
  monthlyDelta: number;
  totalInterestDiff: number;
  cashFlowGain: number;
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

function monthlyPayment(principal: number, annualRate: number, termMonths: number): number {
  if (annualRate === 0) return principal / termMonths;
  const r = annualRate / 12;
  return principal * r / (1 - Math.pow(1 + r, -termMonths));
}

function totalInterest(payment: number, principal: number, termMonths: number): number {
  return payment * termMonths - principal;
}

// FV of a level annuity: PMT × ((1+r)^n − 1) / r
function annuityFV(pmt: number, n: number, r: number): number {
  if (n <= 0) return 0;
  if (r === 0) return pmt * n;
  return pmt * (Math.pow(1 + r, n) - 1) / r;
}

export function computeRefi(analysis: RefiAnalysis, scenarios: RefiScenario[]): RefiResults {
  const balance      = parseFloat(analysis.loan_current_balance);
  const currentRate  = parseFloat(analysis.current_annual_rate);
  const investRate   = parseFloat(analysis.assumed_investment_rate);
  const monthlyRate  = investRate / 12;

  // Assume original loan was 30 years; derive remaining term from months_in
  const remainingMonths = 360 - analysis.months_in;

  const currentPayment          = monthlyPayment(balance, currentRate, remainingMonths);
  const currentInterestRemaining = totalInterest(currentPayment, balance, remainingMonths);

  const results: RefiScenarioResult[] = scenarios.map((s) => {
    const termMonths    = s.term_years * 12;
    const rate          = parseFloat(s.annual_rate);
    const originationFee = parseFloat(s.origination_fee);
    const payment       = monthlyPayment(balance, rate, termMonths);
    const interest      = totalInterest(payment, balance, termMonths);
    const totalPaid     = payment * termMonths;
    const delta         = payment - currentPayment;
    const interestDiff  = interest - currentInterestRemaining;

    // ── Unified-horizon cash flow comparison ──────────────────────────────────
    // Evaluate both paths over max(termMonths, remainingMonths) months.
    // Positive cash flow = refi saves money relative to staying.
    //
    // Phase 1 (both loans active): months 1..min(term, remaining)
    //   CF per month = currentPayment − refiPayment
    //
    // Phase 2 (only one loan active):
    //   If refi term > remaining: refi still running, current done → CF = −refiPayment
    //   If remaining > refi term: current still running, refi done → CF = +currentPayment
    const horizon      = Math.max(termMonths, remainingMonths);
    const phase1End    = Math.min(termMonths, remainingMonths);
    const phase1Delta  = currentPayment - payment;

    // FV of phase 1 at end of phase 1, then compounded to end of horizon
    const fvPhase1AtEnd    = annuityFV(phase1Delta, phase1End, monthlyRate);
    const growthFactor     = monthlyRate > 0 ? Math.pow(1 + monthlyRate, horizon - phase1End) : 1;
    const fvPhase1         = fvPhase1AtEnd * growthFactor;

    const phase2Months = horizon - phase1End;
    const phase2Delta  = termMonths > remainingMonths ? -payment : currentPayment;
    const fvPhase2     = annuityFV(phase2Delta, phase2Months, monthlyRate);

    const cashFlowGain = fvPhase1 + fvPhase2;

    // Origination fee is paid upfront; grow it to the horizon for a fair comparison
    const fvOriginationFee = monthlyRate > 0
      ? originationFee * Math.pow(1 + monthlyRate, horizon)
      : originationFee;

    return {
      scenarioId:          s.id,
      label:               s.label,
      termYears:           s.term_years,
      annualRate:          rate,
      originationFee,
      monthlyPayment:      payment,
      totalInterest:       interest,
      totalPaid,
      monthlyDelta:        delta,
      totalInterestDiff:   interestDiff,
      cashFlowGain,
      totalGainByChoosing: cashFlowGain - fvOriginationFee,
    };
  });

  return {
    current: {
      monthlyPayment:         currentPayment,
      remainingMonths,
      totalInterestRemaining: currentInterestRemaining,
      totalPaidRemaining:     currentPayment * remainingMonths,
    },
    scenarios: results,
  };
}
