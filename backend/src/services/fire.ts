import type { FireConfig } from '../models/settings';

// ── Tax computation types ─────────────────────────────────────────────────────

export interface BracketPoint {
  income_floor: number;
  rate:         number;
}

export interface JurisdictionBrackets {
  jurisdictionId:             string;
  name:                       string;
  abbreviation:               string;
  ordinaryBrackets:           BracketPoint[];
  ordinaryStandardDeduction:  number;
  ltBrackets:                 BracketPoint[];  // if empty, falls back to ordinaryBrackets
}

export interface TaxJurisdictionResult {
  jurisdictionId:       string;
  name:                 string;
  abbreviation:         string;
  ordinaryTax:          number;
  ltGainsTax:           number;
  totalTax:             number;
  marginalOrdinaryRate: number;
  ltMarginalRate:       number;
  effectiveRate:        number;
}

export interface FireTaxDetails {
  ordinaryIncome:   number;
  ltGainsIncome:    number;
  nonTaxableIncome: number;
  jurisdictions:    TaxJurisdictionResult[];
  totalTax:         number;
  netMonthly:       number;
}

export interface FireResult {
  monthlyIncome:          number;
  monthlyExpenses:        number;
  monthlyRetiredExpenses: number;
  annualDrain:            number;
  existingAssets:         number;
  fiBalance:              number;
  yearsToFI:              number | null;
  yearsToFIWithGrowth:    number | null;
  estimatedFIDate:        string | null;
  taxDetails:             FireTaxDetails;
}

// ── Progressive tax helpers ───────────────────────────────────────────────────

// Compute marginal tax for `income` starting at position `base` on the bracket table.
// Stacking: LT gains are evaluated where ordinary income leaves off.
function progressiveTax(
  income: number,
  brackets: BracketPoint[],
  base = 0,
): { tax: number; marginalRate: number } {
  if (income <= 0 || brackets.length === 0) return { tax: 0, marginalRate: 0 };
  const sorted = brackets.slice().sort((a, b) => a.income_floor - b.income_floor);
  const start = base;
  const end   = base + income;
  let tax = 0;
  let marginalRate = sorted[0].rate;

  for (let i = 0; i < sorted.length; i++) {
    const floor   = sorted[i].income_floor;
    const ceiling = i + 1 < sorted.length ? sorted[i + 1].income_floor : Infinity;
    const lo = Math.max(start, floor);
    const hi = Math.min(end,   ceiling);
    if (hi <= lo) continue;
    tax += (hi - lo) * sorted[i].rate;
    marginalRate = sorted[i].rate;
  }
  return { tax, marginalRate };
}

// ── Main computation ──────────────────────────────────────────────────────────

export function computeFire(
  config: FireConfig,
  existingAssets: number,
  monthlyActiveExpenses: number,
  monthlyRetiredExpenses: number,
  incomeOverride?: { annualTaxable: number; annualNonTaxable: number },
  taxJurisdictions?: JurisdictionBrackets[],
): FireResult {
  const {
    esppQuarterlyGain, k401Annual, medicalDeductionAnnual,
    safeWithdrawalRate, assumedGrowthRate, retirementAnnualIncome,
  } = config;

  // Ordinary taxable income (pre-deduction)
  let grossOrdinary: number;
  let nonTaxableAnnual = 0;

  if (incomeOverride) {
    grossOrdinary  = incomeOverride.annualTaxable - k401Annual - medicalDeductionAnnual;
    nonTaxableAnnual = incomeOverride.annualNonTaxable;
  } else {
    const { annualSalary, annualBonus, rsuQuarterlyGross } = config;
    grossOrdinary = annualSalary + annualBonus + rsuQuarterlyGross * 4 - k401Annual - medicalDeductionAnnual;
  }

  const grossLtGains  = esppQuarterlyGain * 4;
  const grossTaxable  = grossOrdinary + grossLtGains;
  const grossTotal    = grossTaxable + nonTaxableAnnual;  // for net calc

  // ── Tax computation ─────────────────────────────────────────────────────────

  let totalTax = 0;
  let jurisdictionResults: TaxJurisdictionResult[] = [];

  if (taxJurisdictions && taxJurisdictions.length > 0) {
    for (const j of taxJurisdictions) {
      // Apply standard deduction only to ordinary income
      const netOrdinary = Math.max(0, grossOrdinary - j.ordinaryStandardDeduction);

      const { tax: ordinaryTax, marginalRate: marginalOrdinaryRate } =
        progressiveTax(netOrdinary, j.ordinaryBrackets);

      // LT gains stacked on top of ordinary taxable income (IRS stacking method)
      const ltBrackets = j.ltBrackets.length > 0 ? j.ltBrackets : j.ordinaryBrackets;
      const { tax: ltGainsTax, marginalRate: ltMarginalRate } =
        progressiveTax(Math.max(0, grossLtGains), ltBrackets, netOrdinary);

      const jTotal = ordinaryTax + ltGainsTax;
      totalTax += jTotal;

      jurisdictionResults.push({
        jurisdictionId:       j.jurisdictionId,
        name:                 j.name,
        abbreviation:         j.abbreviation,
        ordinaryTax,
        ltGainsTax,
        totalTax:             jTotal,
        marginalOrdinaryRate,
        ltMarginalRate,
        effectiveRate:        grossTaxable > 0 ? jTotal / grossTaxable : 0,
      });
    }
  }
  // If no tax jurisdictions configured, totalTax stays 0 and user sees a prompt to configure

  const annualNet      = grossTotal - totalTax;
  const monthlyIncome  = annualNet / 12;

  // ── FI computation ──────────────────────────────────────────────────────────

  const targetAnnualExpenses =
    retirementAnnualIncome > 0 ? retirementAnnualIncome : monthlyRetiredExpenses * 12;
  const fiBalance    = targetAnnualExpenses / (safeWithdrawalRate || 0.04);
  const annualDrain  = monthlyActiveExpenses * 12;
  const annualSurplus = annualNet - annualDrain;

  let yearsToFI: number | null = null;
  let yearsToFIWithGrowth: number | null = null;
  let estimatedFIDate: string | null = null;

  if (fiBalance > 0 && annualSurplus > 0) {
    yearsToFI = Math.max(0, (fiBalance - existingAssets) / annualSurplus);
  }

  if (fiBalance > 0 && (assumedGrowthRate ?? 0) > 0) {
    let balance = existingAssets;
    let years = 0;
    while (balance < fiBalance && years < 100) {
      balance = balance * (1 + assumedGrowthRate) + annualSurplus;
      years++;
    }
    yearsToFIWithGrowth = balance >= fiBalance ? years : null;
    if (yearsToFIWithGrowth !== null) {
      const d = new Date();
      d.setFullYear(d.getFullYear() + yearsToFIWithGrowth);
      estimatedFIDate = d.toISOString().slice(0, 7);
    }
  }

  return {
    monthlyIncome,
    monthlyExpenses:        monthlyActiveExpenses,
    monthlyRetiredExpenses,
    annualDrain,
    existingAssets,
    fiBalance,
    yearsToFI,
    yearsToFIWithGrowth,
    estimatedFIDate,
    taxDetails: {
      ordinaryIncome:   grossOrdinary,
      ltGainsIncome:    grossLtGains,
      nonTaxableIncome: nonTaxableAnnual,
      jurisdictions:    jurisdictionResults,
      totalTax,
      netMonthly:       monthlyIncome,
    },
  };
}
