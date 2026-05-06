import type { FireConfig } from '../models/settings';

export interface FireTaxDetails {
  grossIncome: number;
  caTotal: number;
  federalTotal: number;
  netMonthly: number;
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
  taxDetails: FireTaxDetails;
}

function marginalTax(income: number, rate: number, prevBracketMax: number, prevBracketTax: number): number {
  if (income <= prevBracketMax) return 0;
  return prevBracketTax + (income - prevBracketMax) * rate;
}

export function computeFire(
  config: FireConfig,
  existingAssets: number,
  monthlyActiveExpenses: number,
  monthlyRetiredExpenses: number,
): FireResult {
  const {
    annualSalary, annualBonus, rsuQuarterlyGross, esppQuarterlyGain,
    k401Annual, medicalDeductionAnnual,
    caStateTaxRate, caMaxPrevBracket, caMaxTaxPrevBracket,
    fedTaxRate, fedMaxPrevBracket, fedMaxTaxPrevBracket,
    ltCapGainsRate, safeWithdrawalRate, assumedGrowthRate, retirementAnnualIncome,
  } = config;

  const annualRsuGross = rsuQuarterlyGross * 4;
  const annualEsppGain = esppQuarterlyGain * 4;

  // Gross income for tax purposes (ordinary income items)
  const grossOrdinary = annualSalary + annualBonus + annualRsuGross - k401Annual - medicalDeductionAnnual;
  const grossCapGains = annualEsppGain;
  const grossIncome = grossOrdinary + grossCapGains;

  // CA state tax on gross ordinary
  const caTotal = marginalTax(grossOrdinary, caStateTaxRate, caMaxPrevBracket, caMaxTaxPrevBracket);

  // Federal on ordinary
  const fedOrdinary = marginalTax(grossOrdinary, fedTaxRate, fedMaxPrevBracket, fedMaxTaxPrevBracket);
  // Federal LT cap gains on ESPP gain
  const fedCapGains = grossCapGains * ltCapGainsRate;
  const federalTotal = fedOrdinary + fedCapGains;

  const annualNet = grossIncome - caTotal - federalTotal;
  const monthlyIncome = annualNet / 12;

  // FI balance needed (annual expenses / SWR)
  const targetAnnualExpenses = retirementAnnualIncome > 0 ? retirementAnnualIncome : monthlyRetiredExpenses * 12;
  const fiBalance = targetAnnualExpenses / (safeWithdrawalRate || 0.04);

  const annualDrain = monthlyActiveExpenses * 12;
  const annualSurplus = annualNet - annualDrain;

  let yearsToFI: number | null = null;
  let yearsToFIWithGrowth: number | null = null;
  let estimatedFIDate: string | null = null;

  if (fiBalance > 0 && annualSurplus > 0) {
    yearsToFI = (fiBalance - existingAssets) / annualSurplus;
    if (yearsToFI < 0) yearsToFI = 0;
  }

  if (fiBalance > 0 && (assumedGrowthRate ?? 0) > 0) {
    const r = assumedGrowthRate;
    let balance = existingAssets;
    let years = 0;
    const maxYears = 100;
    while (balance < fiBalance && years < maxYears) {
      balance = balance * (1 + r) + annualSurplus;
      years++;
    }
    yearsToFIWithGrowth = balance >= fiBalance ? years : null;

    if (yearsToFIWithGrowth !== null) {
      const fiDate = new Date();
      fiDate.setFullYear(fiDate.getFullYear() + yearsToFIWithGrowth);
      estimatedFIDate = fiDate.toISOString().slice(0, 7);
    }
  }

  return {
    monthlyIncome,
    monthlyExpenses: monthlyActiveExpenses,
    monthlyRetiredExpenses,
    annualDrain,
    existingAssets,
    fiBalance,
    yearsToFI,
    yearsToFIWithGrowth,
    estimatedFIDate,
    taxDetails: { grossIncome, caTotal, federalTotal, netMonthly: monthlyIncome },
  };
}
