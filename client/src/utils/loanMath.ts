export interface LoanDetails {
  monthlyPayment: number;
  payoffDate: string;        // YYYY-MM-DD
  totalMonths: number;
  monthsElapsed: number;
  monthsRemaining: number;
  progressPct: number;       // 0–100
  totalInterest: number;
  totalPaid: number;
  expectedBalance: number;   // amortization-derived balance at today
  interestPaidToDate: number;
  principalPaidToDate: number;
  interestRemaining: number;
}

function calcMonthlyPayment(principal: number, annualRate: number, termMonths: number): number {
  if (annualRate === 0) return principal / termMonths;
  const r = annualRate / 12;
  return (principal * r) / (1 - Math.pow(1 + r, -termMonths));
}

// Balance after k monthly payments using closed-form amortization
function balanceAfterK(principal: number, annualRate: number, termMonths: number, k: number): number {
  if (annualRate === 0) return Math.max(0, principal - (principal / termMonths) * k);
  const r = annualRate / 12;
  const pmt = calcMonthlyPayment(principal, annualRate, termMonths);
  return principal * Math.pow(1 + r, k) - pmt * ((Math.pow(1 + r, k) - 1) / r);
}

export function computeLoanDetails(
  originalBalance: number,
  annualRate: number,
  termMonths: number,
  originationDate: string,
): LoanDetails {
  const pmt = calcMonthlyPayment(originalBalance, annualRate, termMonths);
  const totalPaid = pmt * termMonths;
  const totalInterest = totalPaid - originalBalance;

  // Payoff date
  const origDate = new Date(originationDate + 'T00:00:00');
  const payoffDate = new Date(origDate);
  payoffDate.setMonth(payoffDate.getMonth() + termMonths);

  // Months elapsed from origination to today
  const today = new Date();
  const monthsElapsed = Math.max(
    0,
    (today.getFullYear() - origDate.getFullYear()) * 12
    + (today.getMonth() - origDate.getMonth()),
  );
  const monthsElapsedCapped = Math.min(monthsElapsed, termMonths);
  const monthsRemaining = Math.max(0, termMonths - monthsElapsedCapped);
  const progressPct = (monthsElapsedCapped / termMonths) * 100;

  const expectedBalance = Math.max(0, balanceAfterK(originalBalance, annualRate, termMonths, monthsElapsedCapped));
  const principalPaidToDate = originalBalance - expectedBalance;
  const interestPaidToDate = pmt * monthsElapsedCapped - principalPaidToDate;
  const interestRemaining = pmt * monthsRemaining - expectedBalance;

  return {
    monthlyPayment: pmt,
    payoffDate: payoffDate.toISOString().slice(0, 10),
    totalMonths: termMonths,
    monthsElapsed: monthsElapsedCapped,
    monthsRemaining,
    progressPct,
    totalInterest,
    totalPaid,
    expectedBalance,
    interestPaidToDate: Math.max(0, interestPaidToDate),
    principalPaidToDate: Math.max(0, principalPaidToDate),
    interestRemaining: Math.max(0, interestRemaining),
  };
}
