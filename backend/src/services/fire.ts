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

export interface BracketDetail {
  floor:           number;
  ceiling:         number | null;  // null = no upper bound
  rate:            number;
  amountInBracket: number;
  taxAmount:       number;
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
  // Per-bracket breakdown
  standardDeduction:      number;
  netOrdinaryTaxable:     number;
  ordinaryBracketDetails: BracketDetail[];
  ltBracketDetails:       BracketDetail[];
}

export interface FireTaxDetails {
  ordinaryIncome:   number;
  ltGainsIncome:    number;
  nonTaxableIncome: number;
  jurisdictions:    TaxJurisdictionResult[];
  totalTax:         number;
  netMonthly:       number;
}

export interface FireTargetResult {
  balance:       number;
  yearsLinear:   number | null;
  yearsGrowth:   number | null;
  estimatedDate: string | null;
}

export interface RetirementWithdrawal {
  netAnnual:      number;  // after-tax expenses needed
  grossAnnual:    number;  // must withdraw this to net the expenses
  taxAnnual:      number;  // annual tax burden in retirement
  effectiveRate:  number;  // effective tax rate on the gross withdrawal
  withdrawalType: 'long_term_gains' | 'ordinary';
}

export interface FireResult {
  monthlyIncome:          number;
  monthlyExpenses:        number;
  monthlyRetiredExpenses: number;
  annualDrain:            number;
  existingAssets:         number;
  // Primary (SWR-based) target — kept for backward compat
  fiBalance:           number;
  yearsToFI:           number | null;
  yearsToFIWithGrowth: number | null;
  estimatedFIDate:     string | null;
  // All targets (built on grossed-up withdrawal)
  targetSwr:         FireTargetResult;
  targetSustainable: FireTargetResult | null;  // null when growthRate = 0
  targetExplicit:    FireTargetResult | null;  // null when not configured
  retirementWithdrawal: RetirementWithdrawal;
  taxDetails:        FireTaxDetails;
}

// ── Progressive tax helpers ───────────────────────────────────────────────────

// Compute marginal tax for `income` starting at position `base` on the bracket table.
// Stacking: LT gains are evaluated where ordinary income leaves off.
function progressiveTax(
  income: number,
  brackets: BracketPoint[],
  base = 0,
): { tax: number; marginalRate: number; details: BracketDetail[] } {
  if (income <= 0 || brackets.length === 0) return { tax: 0, marginalRate: 0, details: [] };
  const sorted = brackets.slice().sort((a, b) => a.income_floor - b.income_floor);
  const start = base;
  const end   = base + income;
  let tax = 0;
  let marginalRate = sorted[0].rate;
  const details: BracketDetail[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const floor   = sorted[i].income_floor;
    const ceiling = i + 1 < sorted.length ? sorted[i + 1].income_floor : Infinity;
    const lo = Math.max(start, floor);
    const hi = Math.min(end,   ceiling);
    if (hi <= lo) continue;
    const amountInBracket = hi - lo;
    const taxAmount       = amountInBracket * sorted[i].rate;
    tax += taxAmount;
    marginalRate = sorted[i].rate;
    details.push({
      floor,
      ceiling: i + 1 < sorted.length ? sorted[i + 1].income_floor : null,
      rate:            sorted[i].rate,
      amountInBracket,
      taxAmount,
    });
  }
  return { tax, marginalRate, details };
}

// ── FI target helper ─────────────────────────────────────────────────────────

function computeTarget(
  balance: number,
  existingAssets: number,
  annualSurplus: number,
  growthRate: number,
): FireTargetResult {
  if (balance <= 0) return { balance, yearsLinear: null, yearsGrowth: null, estimatedDate: null };

  const yearsLinear = annualSurplus > 0
    ? Math.max(0, (balance - existingAssets) / annualSurplus)
    : null;

  let yearsGrowth: number | null = null;
  let estimatedDate: string | null = null;

  if (growthRate > 0) {
    let b = existingAssets;
    let y = 0;
    while (b < balance && y < 100) {
      b = b * (1 + growthRate) + annualSurplus;
      y++;
    }
    if (b >= balance) {
      yearsGrowth = y;
      const d = new Date();
      d.setFullYear(d.getFullYear() + y);
      estimatedDate = d.toISOString().slice(0, 7);
    }
  }

  return { balance, yearsLinear, yearsGrowth, estimatedDate };
}

// ── Retirement withdrawal gross-up ────────────────────────────────────────────
// Iteratively solves: gross - tax(gross) = netNeeded
// In retirement there is no other income, so the full standard deduction applies
// to the withdrawal and there is no "stacking" base.
function solveGrossWithdrawal(
  netNeeded: number,
  jurisdictions: JurisdictionBrackets[],
  withdrawalType: 'long_term_gains' | 'ordinary',
): RetirementWithdrawal {
  if (jurisdictions.length === 0 || netNeeded <= 0) {
    return { netAnnual: netNeeded, grossAnnual: netNeeded, taxAnnual: 0, effectiveRate: 0, withdrawalType };
  }

  let gross = netNeeded;
  for (let iter = 0; iter < 40; iter++) {
    let tax = 0;
    for (const j of jurisdictions) {
      // Standard deduction applies to the entire withdrawal (only income source in retirement)
      const taxable  = Math.max(0, gross - j.ordinaryStandardDeduction);
      const brackets = withdrawalType === 'long_term_gains' && j.ltBrackets.length > 0
        ? j.ltBrackets
        : j.ordinaryBrackets;
      tax += progressiveTax(taxable, brackets, 0).tax;
    }
    const next = netNeeded + tax;
    if (Math.abs(next - gross) < 0.01) { gross = next; break; }
    gross = next;
  }

  const taxAnnual = gross - netNeeded;
  return {
    netAnnual:     netNeeded,
    grossAnnual:   gross,
    taxAnnual,
    effectiveRate: gross > 0 ? taxAnnual / gross : 0,
    withdrawalType,
  };
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

      const { tax: ordinaryTax, marginalRate: marginalOrdinaryRate, details: ordinaryBracketDetails } =
        progressiveTax(netOrdinary, j.ordinaryBrackets);

      // LT gains stacked on top of ordinary taxable income (IRS stacking method)
      const ltBrackets = j.ltBrackets.length > 0 ? j.ltBrackets : j.ordinaryBrackets;
      const { tax: ltGainsTax, marginalRate: ltMarginalRate, details: ltBracketDetails } =
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
        standardDeduction:      j.ordinaryStandardDeduction,
        netOrdinaryTaxable:     netOrdinary,
        ordinaryBracketDetails,
        ltBracketDetails,
      });
    }
  }
  // If no tax jurisdictions configured, totalTax stays 0 and user sees a prompt to configure

  const annualNet      = grossTotal - totalTax;
  const monthlyIncome  = annualNet / 12;

  // ── FI computation ──────────────────────────────────────────────────────────

  const { fiExplicitTarget, retirementWithdrawalType = 'long_term_gains' } = config;
  const netRetiredExpenses =
    retirementAnnualIncome > 0 ? retirementAnnualIncome : monthlyRetiredExpenses * 12;
  const annualDrain   = monthlyActiveExpenses * 12;
  const annualSurplus = annualNet - annualDrain;
  const gr            = assumedGrowthRate ?? 0;
  const swr           = safeWithdrawalRate || 0.04;

  // Gross up retirement withdrawals to cover taxes on the withdrawal itself.
  // Uses the configured tax jurisdictions but with retirement-specific rules:
  // no ordinary income stacking, full standard deduction applies to withdrawals.
  const retirementWithdrawal = solveGrossWithdrawal(
    netRetiredExpenses,
    taxJurisdictions ?? [],
    retirementWithdrawalType,
  );
  const grossRetiredExpenses = retirementWithdrawal.grossAnnual;

  // SWR-based target uses the grossed-up withdrawal so the portfolio supports
  // both expenses AND the taxes on withdrawals.
  const swrBalance  = grossRetiredExpenses / swr;
  const targetSwr   = computeTarget(swrBalance, existingAssets, annualSurplus, gr);

  // Self-sustaining: balance × growthRate ≥ gross withdrawal (including retirement tax)
  const targetSustainable = gr > 0
    ? computeTarget(grossRetiredExpenses / gr, existingAssets, annualSurplus, gr)
    : null;

  // Explicit target is a portfolio balance, not an expense amount — no gross-up applied.
  const targetExplicit = fiExplicitTarget > 0
    ? computeTarget(fiExplicitTarget, existingAssets, annualSurplus, gr)
    : null;

  return {
    monthlyIncome,
    monthlyExpenses:        monthlyActiveExpenses,
    monthlyRetiredExpenses,
    annualDrain,
    existingAssets,
    // Backward-compat aliases pointing at SWR target
    fiBalance:           swrBalance,
    yearsToFI:           targetSwr.yearsLinear,
    yearsToFIWithGrowth: targetSwr.yearsGrowth,
    estimatedFIDate:     targetSwr.estimatedDate,
    // Extended targets
    targetSwr,
    targetSustainable,
    targetExplicit,
    retirementWithdrawal,
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
