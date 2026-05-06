export interface ParsedRow {
  date: string;
  amount: number;
}

export interface ParseResult {
  rows: ParsedRow[];
  errors: string[];
}

function normalizeDate(raw: string): string | null {
  const s = raw.trim().replace(/^["']|["']$/g, '');
  if (!s) return null;

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // M/D/YYYY or MM/DD/YYYY or MM/DD/YY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const [, m, d, y] = mdy;
    const year = y.length === 2 ? (parseInt(y) > 50 ? '19' : '20') + y : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // Month name formats: "Jan 2024", "January 2024", "Jan-2024"
  const monthName = s.match(/^([A-Za-z]+)[- ](\d{4})$/);
  if (monthName) {
    const monthIdx = new Date(`${monthName[1]} 1, 2000`).getMonth();
    if (!isNaN(monthIdx)) {
      return `${monthName[2]}-${String(monthIdx + 1).padStart(2, '0')}-01`;
    }
  }

  // Fallback: try Date constructor
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) {
    return dt.toISOString().slice(0, 10);
  }

  return null;
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.trim().replace(/^["']|["']$/g, '').replace(/[$,\s]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned.toLowerCase() === 'n/a') return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : Math.abs(n);
}

function splitRow(line: string, sep: string): string[] {
  if (sep !== ',') return line.split(sep).map(s => s.trim());
  // Simple CSV split respecting quoted fields
  const parts: string[] = [];
  let current = '';
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { parts.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  parts.push(current.trim());
  return parts;
}

export function parseSnapshotPaste(text: string): ParseResult {
  const rows: ParsedRow[] = [];
  const errors: string[] = [];

  const trimmed = text.trim();
  if (!trimmed) return { rows, errors: ['No data provided'] };

  // Try JSON
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) throw new Error('Expected array');
      for (const [i, item] of parsed.entries()) {
        const label = `Item ${i + 1}`;
        if (Array.isArray(item)) {
          const date = normalizeDate(String(item[0] ?? ''));
          const amount = parseAmount(String(item[1] ?? ''));
          if (!date) { errors.push(`${label}: invalid date "${item[0]}"`); continue; }
          if (amount === null) { errors.push(`${label}: invalid amount "${item[1]}"`); continue; }
          rows.push({ date, amount });
        } else if (typeof item === 'object' && item !== null) {
          const rawDate = item.date ?? item.Date ?? item.snapshot_date ?? item.month;
          const rawAmt = item.value ?? item.Value ?? item.balance ?? item.Balance ?? item.amount ?? item.Amount;
          const date = normalizeDate(String(rawDate ?? ''));
          const amount = parseAmount(String(rawAmt ?? ''));
          if (!date) { errors.push(`${label}: invalid date "${rawDate}"`); continue; }
          if (amount === null) { errors.push(`${label}: invalid amount "${rawAmt}"`); continue; }
          rows.push({ date, amount });
        } else {
          errors.push(`${label}: unrecognized format`);
        }
      }
      return { rows, errors };
    } catch {
      errors.push('JSON parse failed — treating as text');
    }
  }

  // TSV / CSV
  const lines = trimmed.split(/\r?\n/).filter(l => l.trim() !== '');
  const firstLine = lines[0];
  const sep = firstLine.includes('\t') ? '\t' : ',';

  for (const [i, line] of lines.entries()) {
    const parts = splitRow(line, sep);
    if (parts.length < 2) continue;

    const date = normalizeDate(parts[0]);
    if (!date) {
      // Likely a header row — skip silently if it's the first line
      if (i === 0) continue;
      errors.push(`Row ${i + 1}: invalid date "${parts[0]}"`);
      continue;
    }

    const amount = parseAmount(parts[1]);
    if (amount === null) {
      errors.push(`Row ${i + 1}: invalid amount "${parts[1]}"`);
      continue;
    }

    rows.push({ date, amount });
  }

  return { rows, errors };
}
