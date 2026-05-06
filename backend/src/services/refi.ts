import type { RefiAnalysis, RefiScenario } from '../models/refi';

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

function monthlyPayment(principal: number, annualRate: number, termMonths: number): number {
  if (annualRate === 0) return principal / termMonths;
  const r = annualRate / 12;
  return principal * r / (1 - Math.pow(1 + r, -termMonths));
}

function totalInterest(payment: number, principal: number, termMonths: number): number {
  return payment * termMonths - principal;
}

export function computeRefi(analysis: RefiAnalysis, scenarios: RefiScenario[]): RefiResults {
  const balance = parseFloat(analysis.loan_current_balance);
  const currentRate = parseFloat(analysis.current_annual_rate);
  const originalValue = parseFloat(analysis.loan_original_value);
  const investRate = parseFloat(analysis.assumed_investment_rate);

  // Derive remaining term from original loan (assume 30yr = 360 months)
  // We don't store original term, so derive remaining months from months_in
  // Assume 30-year original loan
  const originalTermMonths = 360;
  const remainingMonths = originalTermMonths - analysis.months_in;

  const currentPayment = monthlyPayment(balance, currentRate, remainingMonths);
  const currentInterestRemaining = totalInterest(currentPayment, balance, remainingMonths);

  const results: RefiScenarioResult[] = scenarios.map((s) => {
    const termMonths = s.term_years * 12;
    const rate = parseFloat(s.annual_rate);
    const payment = monthlyPayment(balance, rate, termMonths);
    const interest = totalInterest(payment, balance, termMonths);
    const totalPaid = payment * termMonths;

    const delta = payment - currentPayment;
    const interestDiff = interest - currentInterestRemaining;

    // If monthly payment is lower, model investing the difference at the assumed rate
    let investmentGainAtTermEnd = 0;
    if (delta < 0) {
      const monthlySaving = -delta;
      const monthlyRate = investRate / 12;
      // FV of annuity: PMT * ((1+r)^n - 1) / r
      if (monthlyRate > 0) {
        investmentGainAtTermEnd = monthlySaving * (Math.pow(1 + monthlyRate, termMonths) - 1) / monthlyRate;
      } else {
        investmentGainAtTermEnd = monthlySaving * termMonths;
      }
    }

    const totalGainByChoosing = -interestDiff + investmentGainAtTermEnd;

    return {
      scenarioId: s.id,
      label: s.label,
      termYears: s.term_years,
      annualRate: rate,
      monthlyPayment: payment,
      totalInterest: interest,
      totalPaid,
      monthlyDelta: delta,
      totalInterestDiff: interestDiff,
      investmentGainAtTermEnd,
      totalGainByChoosing,
    };
  });

  return {
    current: {
      monthlyPayment: currentPayment,
      remainingMonths,
      totalInterestRemaining: currentInterestRemaining,
      totalPaidRemaining: currentPayment * remainingMonths,
    },
    scenarios: results,
  };
}
