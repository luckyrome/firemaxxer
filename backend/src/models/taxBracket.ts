import { query } from '../config/db';

export type JurisdictionType = 'federal' | 'state' | 'local';
export type IncomeType      = 'ordinary' | 'long_term_gains';
export type FilingStatus    = 'single' | 'married_joint' | 'married_separate' | 'head_of_household';

export interface TaxJurisdiction {
  id:           string;
  name:         string;
  abbreviation: string;
  jtype:        JurisdictionType;
  is_public:    boolean;
  created_by:   string | null;
  created_at:   Date;
}

export interface TaxBracketSet {
  id:                 string;
  jurisdiction_id:    string;
  tax_year:           number;
  income_type:        IncomeType;
  filing_status:      FilingStatus;
  standard_deduction: string;
  notes:              string | null;
  created_by:         string | null;
  created_at:         Date;
}

export interface TaxBracket {
  id:             string;
  bracket_set_id: string;
  income_floor:   string;
  rate:           string;
}

export interface TaxBracketSetWithBrackets extends TaxBracketSet {
  brackets: TaxBracket[];
}

export interface AccountTaxProfile {
  account_id:       string;
  tax_year:         number;
  filing_status:    FilingStatus;
  jurisdiction_ids: string[];
  updated_at:       Date;
}

// ── Jurisdictions ─────────────────────────────────────────────────────────────

export async function listJurisdictions(accountId: string): Promise<TaxJurisdiction[]> {
  const { rows } = await query<TaxJurisdiction>(
    `SELECT * FROM tax_jurisdictions
     WHERE is_public = true OR created_by = $1
     ORDER BY jtype, name`,
    [accountId],
  );
  return rows;
}

export async function findJurisdictionById(id: string): Promise<TaxJurisdiction | null> {
  const { rows } = await query<TaxJurisdiction>(
    'SELECT * FROM tax_jurisdictions WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

export async function createJurisdiction(
  accountId: string, name: string, abbreviation: string, jtype: JurisdictionType,
): Promise<TaxJurisdiction> {
  const { rows } = await query<TaxJurisdiction>(
    `INSERT INTO tax_jurisdictions (name, abbreviation, jtype, is_public, created_by)
     VALUES ($1,$2,$3,false,$4) RETURNING *`,
    [name, abbreviation, jtype, accountId],
  );
  return rows[0];
}

export async function updateJurisdiction(
  id: string, name: string, abbreviation: string, jtype: JurisdictionType,
): Promise<TaxJurisdiction | null> {
  const { rows } = await query<TaxJurisdiction>(
    'UPDATE tax_jurisdictions SET name=$2, abbreviation=$3, jtype=$4 WHERE id=$1 RETURNING *',
    [id, name, abbreviation, jtype],
  );
  return rows[0] ?? null;
}

export async function deleteJurisdiction(id: string): Promise<void> {
  await query('DELETE FROM tax_jurisdictions WHERE id = $1', [id]);
}

// ── Bracket sets ──────────────────────────────────────────────────────────────

export async function listBracketSetsForJurisdiction(
  jurisdictionId: string,
): Promise<TaxBracketSetWithBrackets[]> {
  const { rows: sets } = await query<TaxBracketSet>(
    `SELECT * FROM tax_bracket_sets WHERE jurisdiction_id = $1
     ORDER BY tax_year DESC, income_type, filing_status`,
    [jurisdictionId],
  );
  if (!sets.length) return [];
  const setIds = sets.map(s => s.id);
  const { rows: brackets } = await query<TaxBracket>(
    'SELECT * FROM tax_brackets WHERE bracket_set_id = ANY($1) ORDER BY bracket_set_id, income_floor',
    [setIds],
  );
  const bySet = new Map<string, TaxBracket[]>();
  for (const b of brackets) {
    if (!bySet.has(b.bracket_set_id)) bySet.set(b.bracket_set_id, []);
    bySet.get(b.bracket_set_id)!.push(b);
  }
  return sets.map(s => ({ ...s, brackets: bySet.get(s.id) ?? [] }));
}

export async function findBracketSet(
  jurisdictionId: string, taxYear: number, incomeType: IncomeType, filingStatus: FilingStatus,
): Promise<TaxBracketSetWithBrackets | null> {
  const { rows: [set] } = await query<TaxBracketSet>(
    `SELECT * FROM tax_bracket_sets
     WHERE jurisdiction_id=$1 AND tax_year=$2 AND income_type=$3 AND filing_status=$4`,
    [jurisdictionId, taxYear, incomeType, filingStatus],
  );
  if (!set) return null;
  const { rows: brackets } = await query<TaxBracket>(
    'SELECT * FROM tax_brackets WHERE bracket_set_id = $1 ORDER BY income_floor',
    [set.id],
  );
  return { ...set, brackets };
}

export async function upsertBracketSet(
  jurisdictionId: string,
  taxYear: number,
  incomeType: IncomeType,
  filingStatus: FilingStatus,
  standardDeduction: number,
  notes: string | null,
  createdBy: string,
  brackets: { income_floor: number; rate: number }[],
): Promise<TaxBracketSetWithBrackets> {
  const { rows: [set] } = await query<TaxBracketSet>(
    `INSERT INTO tax_bracket_sets
       (jurisdiction_id, tax_year, income_type, filing_status, standard_deduction, notes, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (jurisdiction_id, tax_year, income_type, filing_status)
     DO UPDATE SET standard_deduction=$5, notes=$6, created_by=$7
     RETURNING *`,
    [jurisdictionId, taxYear, incomeType, filingStatus, standardDeduction, notes, createdBy],
  );
  await query('DELETE FROM tax_brackets WHERE bracket_set_id = $1', [set.id]);
  let saved: TaxBracket[] = [];
  if (brackets.length > 0) {
    const vals: unknown[] = [];
    const ph = brackets.map((b, i) => {
      vals.push(set.id, b.income_floor, b.rate);
      return `($${i * 3 + 1},$${i * 3 + 2},$${i * 3 + 3})`;
    });
    const { rows } = await query<TaxBracket>(
      `INSERT INTO tax_brackets (bracket_set_id, income_floor, rate) VALUES ${ph.join(',')} RETURNING *`,
      vals,
    );
    saved = rows;
  }
  return { ...set, brackets: saved };
}

export async function findBracketSetById(id: string): Promise<TaxBracketSet | null> {
  const { rows } = await query<TaxBracketSet>(
    'SELECT * FROM tax_bracket_sets WHERE id = $1',
    [id],
  );
  return rows[0] ?? null;
}

export async function deleteBracketSet(id: string): Promise<void> {
  await query('DELETE FROM tax_bracket_sets WHERE id = $1', [id]);
}

// ── Account tax profile ───────────────────────────────────────────────────────

export async function getAccountTaxProfile(accountId: string): Promise<AccountTaxProfile | null> {
  const { rows: [profile] } = await query<Omit<AccountTaxProfile, 'jurisdiction_ids'>>(
    'SELECT * FROM account_tax_profiles WHERE account_id = $1',
    [accountId],
  );
  if (!profile) return null;
  const { rows: sels } = await query<{ jurisdiction_id: string }>(
    'SELECT jurisdiction_id FROM account_tax_jurisdiction_selections WHERE account_id = $1',
    [accountId],
  );
  return { ...profile, jurisdiction_ids: sels.map(s => s.jurisdiction_id) };
}

export async function upsertAccountTaxProfile(
  accountId: string,
  taxYear: number,
  filingStatus: FilingStatus,
  jurisdictionIds: string[],
): Promise<AccountTaxProfile> {
  await query(
    `INSERT INTO account_tax_profiles (account_id, tax_year, filing_status)
     VALUES ($1,$2,$3)
     ON CONFLICT (account_id) DO UPDATE SET tax_year=$2, filing_status=$3, updated_at=now()`,
    [accountId, taxYear, filingStatus],
  );
  await query('DELETE FROM account_tax_jurisdiction_selections WHERE account_id = $1', [accountId]);
  if (jurisdictionIds.length > 0) {
    const vals: unknown[] = [];
    const ph = jurisdictionIds.map((jid, i) => {
      vals.push(accountId, jid);
      return `($${i * 2 + 1},$${i * 2 + 2})`;
    });
    await query(
      `INSERT INTO account_tax_jurisdiction_selections (account_id, jurisdiction_id) VALUES ${ph.join(',')}`,
      vals,
    );
  }
  return { account_id: accountId, tax_year: taxYear, filing_status: filingStatus, jurisdiction_ids: jurisdictionIds, updated_at: new Date() };
}
