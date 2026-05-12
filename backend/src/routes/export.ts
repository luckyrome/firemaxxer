import { Router } from 'express';
import ExcelJS from 'exceljs';
import { requireAuth } from '../middleware/requireAuth';
import { listAssets } from '../models/asset';
import { listLiabilities } from '../models/liability';
import { listIncomeSources, toMonthly } from '../models/income';
import { listExpenseSnapshots, listExpenseItems, itemMonthly } from '../models/expense';
import { getSettings } from '../models/settings';
import { listAnalyses, listScenarios } from '../models/refi';
import {
  getAccountTaxProfile,
  listJurisdictions,
  listBracketSetsForJurisdiction,
} from '../models/taxBracket';

export const exportRouter = Router();
exportRouter.use(requireAuth);

// ── Styling helpers ────────────────────────────────────────────────────────────

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F2937' },
};
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
const SECTION_FILL: ExcelJS.Fill = {
  type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF374151' },
};
const SECTION_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
const LABEL_FONT: Partial<ExcelJS.Font> = { bold: true, size: 10 };
const MONEY_FMT = '#,##0.00';
const PCT_FMT = '0.00%';

function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell(cell => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { vertical: 'middle' };
  });
  row.height = 18;
}

function styleSectionRow(row: ExcelJS.Row): void {
  row.eachCell(cell => {
    cell.fill = SECTION_FILL;
    cell.font = SECTION_FONT;
  });
  row.height = 16;
}

function addHeaders(ws: ExcelJS.Worksheet, cols: string[]): void {
  const row = ws.addRow(cols);
  styleHeaderRow(row);
}

// ── Route ──────────────────────────────────────────────────────────────────────

exportRouter.get('/excel', async (req, res) => {
  const accountId = req.account!.id;

  const [assets, liabilities, incomeSources, expenseSnapshots, settings, analyses, taxProfile, jurisdictions] =
    await Promise.all([
      listAssets(accountId),
      listLiabilities(accountId),
      listIncomeSources(accountId),
      listExpenseSnapshots(accountId),
      getSettings(accountId),
      listAnalyses(accountId),
      getAccountTaxProfile(accountId),
      listJurisdictions(accountId),
    ]);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Firemaxxer';
  wb.created = new Date();

  // ── 1. Net Worth ─────────────────────────────────────────────────────────────

  const wsNW = wb.addWorksheet('Net Worth');
  wsNW.columns = [
    { header: '', key: 'col1', width: 28 },
    { header: '', key: 'col2', width: 18 },
    { header: '', key: 'col3', width: 16 },
    { header: '', key: 'col4', width: 14 },
    { header: '', key: 'col5', width: 40 },
  ];

  // Assets section
  {
    const secRow = wsNW.addRow(['ASSETS']);
    wsNW.mergeCells(secRow.number, 1, secRow.number, 5);
    styleSectionRow(secRow);

    addHeaders(wsNW, ['Name', 'Type', 'Current Value', 'As Of', 'Notes', '']);
    let totalAssets = 0;
    for (const a of assets) {
      const val = parseFloat(a.latest_value ?? '0');
      totalAssets += val;
      const dataRow = wsNW.addRow([
        a.name, a.type,
        val, a.latest_date ?? '',
        a.notes ?? '',
      ]);
      dataRow.getCell(3).numFmt = MONEY_FMT;
    }
    const totRow = wsNW.addRow(['', 'Total Assets', totalAssets, '', '']);
    totRow.font = LABEL_FONT;
    totRow.getCell(3).numFmt = MONEY_FMT;
    wsNW.addRow([]);
  }

  // Liabilities section
  {
    const secRow = wsNW.addRow(['LIABILITIES']);
    wsNW.mergeCells(secRow.number, 1, secRow.number, 5);
    styleSectionRow(secRow);

    addHeaders(wsNW, ['Name', 'Type', 'Current Balance', 'Interest Rate', 'Notes', '']);
    let totalLiabilities = 0;
    for (const l of liabilities) {
      const bal = parseFloat(l.latest_balance ?? '0');
      totalLiabilities += bal;
      const dataRow = wsNW.addRow([
        l.name, l.type,
        bal, parseFloat(l.interest_rate) / 100,
        l.notes ?? '',
      ]);
      dataRow.getCell(3).numFmt = MONEY_FMT;
      dataRow.getCell(4).numFmt = PCT_FMT;
    }
    const totRow = wsNW.addRow(['', 'Total Liabilities', totalLiabilities, '', '']);
    totRow.font = LABEL_FONT;
    totRow.getCell(3).numFmt = MONEY_FMT;
    wsNW.addRow([]);
  }

  // Net Worth summary
  {
    const totalAssets = assets.reduce((s, a) => s + parseFloat(a.latest_value ?? '0'), 0);
    const totalLiabilities = liabilities.reduce((s, l) => s + parseFloat(l.latest_balance ?? '0'), 0);
    const netWorth = totalAssets - totalLiabilities;
    const nwRow = wsNW.addRow(['NET WORTH', '', netWorth, '', '']);
    nwRow.font = { bold: true, size: 12 };
    nwRow.getCell(3).numFmt = MONEY_FMT;
    wsNW.mergeCells(nwRow.number, 1, nwRow.number, 2);
  }

  // ── 2. Income ────────────────────────────────────────────────────────────────

  const wsInc = wb.addWorksheet('Income');
  wsInc.columns = [
    { key: 'name',      width: 28 },
    { key: 'taxable',   width: 10 },
    { key: 'active',    width: 10 },
    { key: 'amount',    width: 14 },
    { key: 'frequency', width: 16 },
    { key: 'monthly',   width: 14 },
    { key: 'annual',    width: 14 },
    { key: 'notes',     width: 40 },
  ];

  addHeaders(wsInc, ['Name', 'Taxable', 'Active', 'Amount', 'Frequency', 'Monthly', 'Annual', 'Notes']);

  let totalMonthlyIncome = 0;
  for (const src of incomeSources) {
    const amt = parseFloat(src.amount);
    const monthly = toMonthly(amt, src.frequency);
    totalMonthlyIncome += monthly;
    const dataRow = wsInc.addRow([
      src.name,
      src.taxable ? 'Yes' : 'No',
      src.active ? 'Yes' : 'No',
      amt, src.frequency,
      monthly, monthly * 12,
      src.notes ?? '',
    ]);
    dataRow.getCell(4).numFmt = MONEY_FMT;
    dataRow.getCell(6).numFmt = MONEY_FMT;
    dataRow.getCell(7).numFmt = MONEY_FMT;
  }
  const incTotRow = wsInc.addRow(['TOTAL', '', '', '', '', totalMonthlyIncome, totalMonthlyIncome * 12, '']);
  incTotRow.font = LABEL_FONT;
  incTotRow.getCell(6).numFmt = MONEY_FMT;
  incTotRow.getCell(7).numFmt = MONEY_FMT;

  // ── 3. Expenses ───────────────────────────────────────────────────────────────

  const wsExp = wb.addWorksheet('Expenses');
  wsExp.columns = [
    { key: 'name',      width: 28 },
    { key: 'owner',     width: 14 },
    { key: 'category',  width: 18 },
    { key: 'critical',  width: 10 },
    { key: 'amount',    width: 14 },
    { key: 'frequency', width: 16 },
    { key: 'monthly',   width: 14 },
    { key: 'annual',    width: 14 },
  ];

  for (const snap of expenseSnapshots) {
    const items = await listExpenseItems(snap.id);

    // Snapshot header
    const snapRow = wsExp.addRow([
      `${snap.label}  (${snap.effective_date})${snap.is_retirement_plan ? '  [Retirement Plan]' : ''}`,
    ]);
    wsExp.mergeCells(snapRow.number, 1, snapRow.number, 8);
    styleSectionRow(snapRow);

    addHeaders(wsExp, ['Name', 'Owner', 'Category', 'Critical', 'Amount', 'Frequency', 'Monthly', 'Annual']);

    let snapMonthly = 0;
    for (const item of items) {
      const monthly = itemMonthly(item);
      snapMonthly += monthly;
      const dataRow = wsExp.addRow([
        item.name, item.owner ?? '', item.category,
        item.critical ? 'Yes' : 'No',
        parseFloat(item.amount), item.frequency,
        monthly, monthly * 12,
      ]);
      dataRow.getCell(5).numFmt = MONEY_FMT;
      dataRow.getCell(7).numFmt = MONEY_FMT;
      dataRow.getCell(8).numFmt = MONEY_FMT;
    }

    const expTotRow = wsExp.addRow(['TOTAL', '', '', '', '', '', snapMonthly, snapMonthly * 12]);
    expTotRow.font = LABEL_FONT;
    expTotRow.getCell(7).numFmt = MONEY_FMT;
    expTotRow.getCell(8).numFmt = MONEY_FMT;
    wsExp.addRow([]);
  }

  // ── 4. Tax ────────────────────────────────────────────────────────────────────

  const wsTax = wb.addWorksheet('Tax');
  wsTax.columns = [
    { key: 'col1', width: 24 },
    { key: 'col2', width: 22 },
    { key: 'col3', width: 18 },
    { key: 'col4', width: 14 },
    { key: 'col5', width: 12 },
  ];

  // Profile
  {
    const secRow = wsTax.addRow(['TAX PROFILE']);
    wsTax.mergeCells(secRow.number, 1, secRow.number, 5);
    styleSectionRow(secRow);

    if (taxProfile) {
      const profileJurisdictions = jurisdictions.filter(j =>
        taxProfile.jurisdiction_ids.includes(j.id),
      );
      wsTax.addRow(['Tax Year', taxProfile.tax_year]);
      wsTax.addRow(['Filing Status', taxProfile.filing_status.replace(/_/g, ' ')]);
      wsTax.addRow(['Jurisdictions', profileJurisdictions.map(j => j.name).join(', ')]);
    } else {
      wsTax.addRow(['No tax profile configured.']);
    }
    wsTax.addRow([]);
  }

  // Bracket sets for selected jurisdictions
  if (taxProfile && taxProfile.jurisdiction_ids.length > 0) {
    for (const jid of taxProfile.jurisdiction_ids) {
      const jur = jurisdictions.find(j => j.id === jid);
      if (!jur) continue;

      const bracketSets = await listBracketSetsForJurisdiction(jid);
      if (!bracketSets.length) continue;

      const jurRow = wsTax.addRow([`${jur.name} (${jur.jtype.toUpperCase()})`]);
      wsTax.mergeCells(jurRow.number, 1, jurRow.number, 5);
      styleSectionRow(jurRow);

      for (const bs of bracketSets) {
        const bsRow = wsTax.addRow([
          `${bs.tax_year} — ${bs.income_type.replace(/_/g, ' ')} — ${bs.filing_status.replace(/_/g, ' ')}`,
          `Std Deduction: $${parseFloat(bs.standard_deduction).toLocaleString()}`,
        ]);
        bsRow.font = LABEL_FONT;

        addHeaders(wsTax, ['Income Floor', 'Rate', '', '', '']);

        for (const bracket of bs.brackets) {
          const bRow = wsTax.addRow([parseFloat(bracket.income_floor), parseFloat(bracket.rate)]);
          bRow.getCell(1).numFmt = MONEY_FMT;
          bRow.getCell(2).numFmt = PCT_FMT;
        }
        wsTax.addRow([]);
      }
    }
  }

  // ── 5. FIRE Settings ─────────────────────────────────────────────────────────

  const wsFire = wb.addWorksheet('FIRE Settings');
  wsFire.columns = [
    { key: 'label', width: 32 },
    { key: 'value', width: 20 },
  ];

  const secRow = wsFire.addRow(['FIRE SETTINGS']);
  wsFire.mergeCells(secRow.number, 1, secRow.number, 2);
  styleSectionRow(secRow);

  const fireRows: [string, number | string][] = [
    ['Safe Withdrawal Rate', settings.safeWithdrawalRate],
    ['Assumed Growth Rate', settings.assumedGrowthRate],
    ['LT Capital Gains Rate', settings.ltCapGainsRate],
    ['Annual Salary', settings.annualSalary],
    ['Annual Bonus', settings.annualBonus],
    ['RSU Quarterly Gross', settings.rsuQuarterlyGross],
    ['ESPP Quarterly Gain', settings.esppQuarterlyGain],
    ['401k Annual Contribution', settings.k401Annual],
    ['Medical Deduction (Annual)', settings.medicalDeductionAnnual],
    ['Retirement Annual Income Target', settings.retirementAnnualIncome],
    ['FI Explicit Target', settings.fiExplicitTarget],
    ['Retirement Withdrawal Type', settings.retirementWithdrawalType.replace(/_/g, ' ')],
  ];

  for (const [label, value] of fireRows) {
    const r = wsFire.addRow([label, value]);
    r.getCell(1).font = LABEL_FONT;
    if (typeof value === 'number') {
      if (label.toLowerCase().includes('rate')) {
        r.getCell(2).numFmt = PCT_FMT;
      } else {
        r.getCell(2).numFmt = MONEY_FMT;
      }
    }
  }

  // ── 6. Refi Calculator ───────────────────────────────────────────────────────

  if (analyses.length > 0) {
    const wsRefi = wb.addWorksheet('Refi Calculator');
    wsRefi.columns = [
      { key: 'col1', width: 26 },
      { key: 'col2', width: 16 },
      { key: 'col3', width: 16 },
      { key: 'col4', width: 16 },
      { key: 'col5', width: 14 },
      { key: 'col6', width: 14 },
    ];

    for (const analysis of analyses) {
      const scenarios = await listScenarios(analysis.id);

      // Analysis header
      const aRow = wsRefi.addRow([analysis.name]);
      wsRefi.mergeCells(aRow.number, 1, aRow.number, 6);
      styleSectionRow(aRow);

      // Analysis info
      const infoRows: [string, number | string][] = [
        ['Original Loan Value', parseFloat(analysis.loan_original_value)],
        ['Current Balance', parseFloat(analysis.loan_current_balance)],
        ['Current Annual Rate', parseFloat(analysis.current_annual_rate) / 100],
        ['Months Into Loan', analysis.months_in],
        ['Assumed Investment Rate', parseFloat(analysis.assumed_investment_rate) / 100],
      ];
      if (analysis.home_value_after_loan) {
        infoRows.push(['Home Value After Loan Paid', parseFloat(analysis.home_value_after_loan)]);
      }
      for (const [label, value] of infoRows) {
        const r = wsRefi.addRow([label, value]);
        r.getCell(1).font = LABEL_FONT;
        if (typeof value === 'number') {
          if (label.toLowerCase().includes('rate')) {
            r.getCell(2).numFmt = PCT_FMT;
          } else {
            r.getCell(2).numFmt = MONEY_FMT;
          }
        }
      }
      wsRefi.addRow([]);

      // Scenarios table
      if (scenarios.length > 0) {
        addHeaders(wsRefi, ['Scenario', 'Term (yrs)', 'Annual Rate', 'Origination Fee', '', '']);
        for (const s of scenarios) {
          const sRow = wsRefi.addRow([
            s.label, s.term_years,
            parseFloat(s.annual_rate) / 100,
            parseFloat(s.origination_fee),
          ]);
          sRow.getCell(3).numFmt = PCT_FMT;
          sRow.getCell(4).numFmt = MONEY_FMT;
        }
      }
      wsRefi.addRow([]);
      wsRefi.addRow([]);
    }
  }

  // ── Stream response ───────────────────────────────────────────────────────────

  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Disposition', `attachment; filename="firemaxxer-${date}.xlsx"`);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  await wb.xlsx.write(res);
  res.end();
});
