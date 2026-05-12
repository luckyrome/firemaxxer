import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getJurisdictions, createJurisdiction,
  getBracketSets, upsertBracketSet, deleteBracketSet,
  getTaxProfile, saveTaxProfile,
} from '../api/tax';
import { PageHelp } from '../components/HelpDialog';
import type {
  TaxJurisdiction, TaxBracketSet, TaxProfile,
  JurisdictionType, IncomeType, FilingStatus,
} from '../types';

const FILING_STATUS_LABELS: Record<FilingStatus, string> = {
  single:            'Single',
  married_joint:     'Married Filing Jointly',
  married_separate:  'Married Filing Separately',
  head_of_household: 'Head of Household',
};
const FILING_STATUSES = Object.keys(FILING_STATUS_LABELS) as FilingStatus[];

const INCOME_TYPE_LABELS: Record<IncomeType, string> = {
  ordinary:         'Ordinary Income',
  long_term_gains:  'Long-Term Capital Gains',
};

const JTYPE_LABELS: Record<JurisdictionType, string> = {
  federal: 'Federal',
  state:   'State',
  local:   'Local',
};

function fmtPct(r: number) {
  return (r * 100).toFixed(2).replace(/\.?0+$/, '') + '%';
}

function fmtMoney(v: number) {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ── Bracket-set editor ────────────────────────────────────────────────────────
// Brackets are entered as "floor  rate%" per line, e.g. "0  10%\n11925  12%"

function parseBracketText(text: string): { income_floor: number; rate: number }[] {
  return text.split(/\n/).flatMap(line => {
    const parts = line.trim().split(/[\s,\t]+/);
    if (parts.length < 2) return [];
    const floor = parseFloat(parts[0].replace(/[$,]/g, ''));
    const rate  = parseFloat(parts[1].replace(/%/, '')) / 100;
    if (isNaN(floor) || isNaN(rate)) return [];
    return [{ income_floor: floor, rate }];
  });
}

function bracketSetToText(set: TaxBracketSet): string {
  return set.brackets
    .slice()
    .sort((a, b) => parseFloat(a.income_floor) - parseFloat(b.income_floor))
    .map(b => `${parseFloat(b.income_floor).toLocaleString()}\t${fmtPct(parseFloat(b.rate))}`)
    .join('\n');
}

interface BracketSetFormProps {
  jurisdictionId: string;
  existing?: TaxBracketSet;
  onDone: () => void;
}

function BracketSetForm({ jurisdictionId, existing, onDone }: BracketSetFormProps) {
  const qc = useQueryClient();
  const [year,   setYear]   = useState(existing?.tax_year ?? 2025);
  const [type,   setType]   = useState<IncomeType>(existing?.income_type ?? 'ordinary');
  const [status, setStatus] = useState<FilingStatus>(existing?.filing_status ?? 'single');
  const [stdDed, setStdDed] = useState(existing ? parseFloat(existing.standard_deduction) : 0);
  const [notes,  setNotes]  = useState(existing?.notes ?? '');
  const [text,   setText]   = useState(existing ? bracketSetToText(existing) : '');
  const [error,  setError]  = useState('');

  const mut = useMutation({
    mutationFn: () => {
      const brackets = parseBracketText(text);
      if (!brackets.length) throw new Error('Enter at least one bracket (floor  rate%)');
      return upsertBracketSet(jurisdictionId, {
        tax_year: year, income_type: type, filing_status: status,
        standard_deduction: stdDed, notes: notes || null, brackets,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bracket-sets', jurisdictionId] });
      onDone();
    },
    onError: (e: any) => setError(e.message),
  });

  return (
    <div style={{ padding: '12px 0' }}>
      {error && <div className="field-error" style={{ marginBottom: 8 }}>{error}</div>}
      <div className="form-grid" style={{ marginBottom: 10 }}>
        <label className="field">
          Year
          <input type="number" min="2000" max="2100" value={year}
            onChange={e => setYear(parseInt(e.target.value))} />
        </label>
        <label className="field">
          Income Type
          <select value={type} onChange={e => setType(e.target.value as IncomeType)}>
            {(Object.keys(INCOME_TYPE_LABELS) as IncomeType[]).map(k =>
              <option key={k} value={k}>{INCOME_TYPE_LABELS[k]}</option>)}
          </select>
        </label>
        <label className="field">
          Filing Status
          <select value={status} onChange={e => setStatus(e.target.value as FilingStatus)}>
            {FILING_STATUSES.map(s => <option key={s} value={s}>{FILING_STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="field">
          Standard Deduction
          <input type="number" min="0" value={stdDed} onChange={e => setStdDed(parseFloat(e.target.value) || 0)} />
        </label>
        <label className="field field-full">
          Notes
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="optional" />
        </label>
      </div>
      <label className="field" style={{ marginBottom: 8 }}>
        Brackets <span className="muted" style={{ fontSize: '0.72rem', fontWeight: 400 }}>— one per line: floor  rate (e.g. 11925  12%)</span>
        <textarea
          style={{ fontFamily: 'monospace', fontSize: '0.78rem', height: 140, resize: 'vertical', width: '100%', boxSizing: 'border-box', padding: 8 }}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={'0\t10%\n11925\t12%\n48475\t22%'}
        />
      </label>
      {text && (
        <div style={{ fontSize: '0.72rem', color: 'var(--fg-muted)', marginBottom: 8 }}>
          {parseBracketText(text).length} brackets parsed
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn" onClick={onDone}>Cancel</button>
        <button className="btn btn-primary" onClick={() => mut.mutate()} disabled={mut.isPending}>
          {mut.isPending ? 'Saving…' : existing ? 'Update' : 'Add Bracket Set'}
        </button>
      </div>
    </div>
  );
}

// ── Jurisdiction section ──────────────────────────────────────────────────────

function JurisdictionSection({
  jurisdiction, profileJurisdictionIds, onToggle,
}: {
  jurisdiction: TaxJurisdiction;
  profileJurisdictionIds: string[];
  onToggle: (id: string, checked: boolean) => void;
}) {
  const qc = useQueryClient();
  const [expanded,   setExpanded]   = useState(false);
  const [addingSet,  setAddingSet]  = useState(false);
  const [editingSet, setEditingSet] = useState<TaxBracketSet | null>(null);
  const selected = profileJurisdictionIds.includes(jurisdiction.id);

  const { data: sets = [] } = useQuery({
    queryKey: ['bracket-sets', jurisdiction.id],
    queryFn: () => getBracketSets(jurisdiction.id),
    enabled: expanded,
  });

  const delSetMut = useMutation({
    mutationFn: deleteBracketSet,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bracket-sets', jurisdiction.id] }),
  });

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 6, marginBottom: 8, overflow: 'hidden' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 12px', cursor: 'pointer',
          background: expanded ? 'var(--bg-overlay)' : 'transparent',
        }}
        onClick={() => setExpanded(v => !v)}
      >
        <span style={{ fontSize: '0.8rem', color: 'var(--fg-muted)', userSelect: 'none' }}>{expanded ? '▾' : '▸'}</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0 }}
          onClick={e => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selected}
            onChange={e => onToggle(jurisdiction.id, e.target.checked)}
          />
        </label>
        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>{jurisdiction.name}</span>
        <span className="tag" style={{ fontSize: '0.7rem' }}>{jurisdiction.abbreviation}</span>
        <span className="muted" style={{ fontSize: '0.72rem' }}>{JTYPE_LABELS[jurisdiction.jtype]}</span>
        {!jurisdiction.is_public && <span className="tag blue" style={{ fontSize: '0.68rem' }}>custom</span>}
        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--fg-subtle)' }}>
          {sets.length > 0 ? `${sets.length} bracket set${sets.length > 1 ? 's' : ''}` : ''}
        </span>
      </div>

      {expanded && (
        <div style={{ padding: '0 12px 12px' }}>
          {sets.map(s => (
            editingSet?.id === s.id ? (
              <BracketSetForm
                key={s.id}
                jurisdictionId={jurisdiction.id}
                existing={s}
                onDone={() => setEditingSet(null)}
              />
            ) : (
              <div key={s.id} style={{ marginTop: 10, border: '1px solid var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
                  background: 'var(--bg-overlay)', justifyContent: 'space-between',
                }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.78rem' }}>{s.tax_year}</span>
                    <span className="tag">{INCOME_TYPE_LABELS[s.income_type]}</span>
                    <span className="tag blue">{FILING_STATUS_LABELS[s.filing_status]}</span>
                    {parseFloat(s.standard_deduction) > 0 && (
                      <span className="muted" style={{ fontSize: '0.72rem' }}>
                        std. deduction {fmtMoney(parseFloat(s.standard_deduction))}
                      </span>
                    )}
                    {s.notes && <span className="muted" style={{ fontSize: '0.72rem' }}>{s.notes}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn" style={{ fontSize: '0.7rem', padding: '2px 8px' }} onClick={() => setEditingSet(s)}>Edit</button>
                    {s.created_by !== null && (
                      <button className="btn btn-danger" style={{ fontSize: '0.7rem', padding: '2px 8px' }}
                        onClick={() => { if (confirm('Delete this bracket set?')) delSetMut.mutate(s.id); }}>Del</button>
                    )}
                  </div>
                </div>
                <table className="data-table" style={{ marginBottom: 0, fontSize: '0.75rem' }}>
                  <thead>
                    <tr><th className="num">Income Floor</th><th className="num">Rate</th></tr>
                  </thead>
                  <tbody>
                    {s.brackets
                      .slice().sort((a, b) => parseFloat(a.income_floor) - parseFloat(b.income_floor))
                      .map((b, i, arr) => {
                        const next = arr[i + 1];
                        return (
                          <tr key={b.id}>
                            <td>
                              {fmtMoney(parseFloat(b.income_floor))}
                              {next ? ` – ${fmtMoney(parseFloat(next.income_floor) - 1)}` : '+'}
                            </td>
                            <td className="num">{fmtPct(parseFloat(b.rate))}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )
          ))}

          {addingSet ? (
            <BracketSetForm
              jurisdictionId={jurisdiction.id}
              onDone={() => setAddingSet(false)}
            />
          ) : (
            <button
              className="btn"
              style={{ marginTop: 10, fontSize: '0.75rem', padding: '4px 10px' }}
              onClick={() => setAddingSet(true)}
            >
              + Add Bracket Set
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Jurisdiction modal ────────────────────────────────────────────────────────

function JurisdictionModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [name,  setName]  = useState('');
  const [abbr,  setAbbr]  = useState('');
  const [jtype, setJtype] = useState<JurisdictionType>('state');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createJurisdiction({ name, abbreviation: abbr, jtype });
      onSave();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-title">Add Custom Jurisdiction</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div className="field-error">{error}</div>}
          <label className="field">Name <input value={name} onChange={e => setName(e.target.value)} required placeholder="e.g. New York" /></label>
          <label className="field">Abbreviation <input value={abbr} onChange={e => setAbbr(e.target.value.toUpperCase())} required placeholder="NY" maxLength={20} /></label>
          <label className="field">
            Type
            <select value={jtype} onChange={e => setJtype(e.target.value as JurisdictionType)}>
              {(Object.keys(JTYPE_LABELS) as JurisdictionType[]).map(k => <option key={k} value={k}>{JTYPE_LABELS[k]}</option>)}
            </select>
          </label>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function TaxPage() {
  const qc = useQueryClient();
  const [showJModal, setShowJModal] = useState(false);

  const { data: jurisdictions = [], isLoading: jLoading } = useQuery({
    queryKey: ['tax-jurisdictions'],
    queryFn: getJurisdictions,
  });

  const { data: profile, isLoading: pLoading } = useQuery({
    queryKey: ['tax-profile'],
    queryFn: getTaxProfile,
  });

  const [profileDraft, setProfileDraft] = useState<TaxProfile | null>(null);
  const currentProfile: TaxProfile = profileDraft ?? profile ?? { tax_year: 2025, filing_status: 'single', jurisdiction_ids: [] };

  const saveProfileMut = useMutation({
    mutationFn: saveTaxProfile,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tax-profile'] });
      qc.invalidateQueries({ queryKey: ['fire-result'] });
      setProfileDraft(null);
      setSavedMsg(true);
      setTimeout(() => setSavedMsg(false), 2000);
    },
  });
  const [savedMsg, setSavedMsg] = useState(false);

  function toggleJurisdiction(id: string, checked: boolean) {
    const ids = checked
      ? [...currentProfile.jurisdiction_ids, id]
      : currentProfile.jurisdiction_ids.filter(x => x !== id);
    setProfileDraft({ ...currentProfile, jurisdiction_ids: ids });
  }

  function handleProfileChange(key: keyof TaxProfile, value: unknown) {
    setProfileDraft({ ...currentProfile, [key]: value });
  }

  if (jLoading || pLoading) return <div className="loading">Loading…</div>;

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h1>Tax Brackets</h1>
          <PageHelp page="tax" />
        </div>
        <button className="btn btn-primary" onClick={() => setShowJModal(true)}>+ Add Jurisdiction</button>
      </div>

      {/* ── Profile ──────────────────────────────────────────────────────── */}
      <div className="section-card">
        <div className="section-header" style={{ marginBottom: 12 }}>
          <h2>My Tax Profile</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {savedMsg && <span style={{ fontSize: '0.78rem', color: 'var(--green)' }}>Saved</span>}
            <button
              className="btn btn-primary"
              disabled={saveProfileMut.isPending || !profileDraft}
              onClick={() => saveProfileMut.mutate(currentProfile)}
            >
              {saveProfileMut.isPending ? 'Saving…' : 'Save Profile'}
            </button>
          </div>
        </div>
        <p className="muted" style={{ fontSize: '0.78rem', marginBottom: 12 }}>
          Select the jurisdictions that apply to your income. These drive the tax calculation in your FIRE dashboard.
        </p>
        <div className="form-grid" style={{ marginBottom: 14 }}>
          <label className="field">
            Tax Year
            <select
              value={currentProfile.tax_year}
              onChange={e => handleProfileChange('tax_year', parseInt(e.target.value))}
            >
              {[2025, 2024, 2023, 2022].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className="field">
            Filing Status
            <select
              value={currentProfile.filing_status}
              onChange={e => handleProfileChange('filing_status', e.target.value)}
            >
              {FILING_STATUSES.map(s => <option key={s} value={s}>{FILING_STATUS_LABELS[s]}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* ── Bracket library ────────────────────────────────────────────── */}
      <div className="section-card">
        <div className="section-header" style={{ marginBottom: 10 }}>
          <h2>Bracket Library</h2>
        </div>
        {jurisdictions.length === 0 ? (
          <div className="empty-state"><p>No jurisdictions yet.</p></div>
        ) : (
          jurisdictions.map(j => (
            <JurisdictionSection
              key={j.id}
              jurisdiction={j}
              profileJurisdictionIds={currentProfile.jurisdiction_ids}
              onToggle={toggleJurisdiction}
            />
          ))
        )}
      </div>

      {showJModal && (
        <JurisdictionModal
          onClose={() => setShowJModal(false)}
          onSave={() => {
            qc.invalidateQueries({ queryKey: ['tax-jurisdictions'] });
            setShowJModal(false);
          }}
        />
      )}
    </div>
  );
}
