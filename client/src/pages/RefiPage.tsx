import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getAnalyses, createAnalysis, updateAnalysis, deleteAnalysis,
  getScenarios, createScenario, updateScenario, deleteScenario, getRefiResult,
} from '../api/refi';
import type { RefiAnalysis, RefiScenario } from '../types';

function fmtMoney(v: number) {
  return '$' + v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(v: number) {
  return (v * 100).toFixed(3) + '%';
}

// ── Analysis modal ────────────────────────────────────────────────────────────

interface AForm {
  name: string; loan_original_value: string; loan_current_balance: string;
  current_annual_rate: string; months_in: string; assumed_investment_rate: string;
  home_value_after_loan: string;
}

const EMPTY_A: AForm = {
  name: '', loan_original_value: '', loan_current_balance: '',
  current_annual_rate: '', months_in: '0', assumed_investment_rate: '5',
  home_value_after_loan: '',
};

function AnalysisModal({ existing, onClose, onSave }: {
  existing?: RefiAnalysis; onClose: () => void; onSave: (a: RefiAnalysis) => void;
}) {
  const [form, setForm] = useState<AForm>(
    existing
      ? {
          name: existing.name,
          loan_original_value: existing.loan_original_value,
          loan_current_balance: existing.loan_current_balance,
          current_annual_rate: (parseFloat(existing.current_annual_rate) * 100).toFixed(3),
          months_in: String(existing.months_in),
          assumed_investment_rate: (parseFloat(existing.assumed_investment_rate) * 100).toFixed(3),
          home_value_after_loan: existing.home_value_after_loan ?? '',
        }
      : EMPTY_A,
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        loan_original_value: parseFloat(form.loan_original_value),
        loan_current_balance: parseFloat(form.loan_current_balance),
        current_annual_rate: parseFloat(form.current_annual_rate) / 100,
        months_in: parseInt(form.months_in),
        assumed_investment_rate: parseFloat(form.assumed_investment_rate) / 100,
        home_value_after_loan: form.home_value_after_loan ? parseFloat(form.home_value_after_loan) : null,
      };
      let result: RefiAnalysis;
      if (existing) result = await updateAnalysis(existing.id, payload);
      else result = await createAnalysis(payload);
      onSave(result);
    } catch (err: any) {
      setError(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function set(k: keyof AForm) {
    return (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" style={{ width: 500 }} onClick={e => e.stopPropagation()}>
        <div className="dialog-title">{existing ? 'Edit Analysis' : 'New Refi Analysis'}</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div className="field-error">{error}</div>}
          <div className="form-grid">
            <label className="field field-full">Name <input value={form.name} onChange={set('name')} required /></label>
            <label className="field">Original Loan Value <input type="number" min="0" step="0.01" value={form.loan_original_value} onChange={set('loan_original_value')} required /></label>
            <label className="field">Current Balance <input type="number" min="0" step="0.01" value={form.loan_current_balance} onChange={set('loan_current_balance')} required /></label>
            <label className="field">Current Rate (%) <input type="number" min="0" step="0.001" value={form.current_annual_rate} onChange={set('current_annual_rate')} required /></label>
            <label className="field">Months In <input type="number" min="0" value={form.months_in} onChange={set('months_in')} required /></label>
            <label className="field">Assumed Investment Rate (%) <input type="number" min="0" step="0.001" value={form.assumed_investment_rate} onChange={set('assumed_investment_rate')} required /></label>
            <label className="field">Home Value After Payoff <input type="number" min="0" step="0.01" value={form.home_value_after_loan} onChange={set('home_value_after_loan')} placeholder="optional" /></label>
          </div>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Scenario modal ─────────────────────────────────────────────────────────────

interface SForm { label: string; term_years: string; annual_rate: string; }
const EMPTY_S: SForm = { label: '', term_years: '30', annual_rate: '' };

function ScenarioModal({ analysisId, existing, onClose, onSave }: {
  analysisId: string; existing?: RefiScenario; onClose: () => void; onSave: () => void;
}) {
  const [form, setForm] = useState<SForm>(
    existing
      ? { label: existing.label, term_years: String(existing.term_years), annual_rate: (parseFloat(existing.annual_rate) * 100).toFixed(3) }
      : EMPTY_S,
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { label: form.label, term_years: parseInt(form.term_years), annual_rate: parseFloat(form.annual_rate) / 100 };
      if (existing) await updateScenario(analysisId, existing.id, payload);
      else await createScenario(analysisId, payload);
      onSave();
    } catch (err: any) {
      setError(err.message ?? 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-title">{existing ? 'Edit Scenario' : 'Add Scenario'}</div>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div className="field-error">{error}</div>}
          <label className="field">Label <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} required /></label>
          <label className="field">Term (years) <input type="number" min="1" max="50" value={form.term_years} onChange={e => setForm(f => ({ ...f, term_years: e.target.value }))} required /></label>
          <label className="field">Annual Rate (%) <input type="number" min="0" step="0.001" value={form.annual_rate} onChange={e => setForm(f => ({ ...f, annual_rate: e.target.value }))} required /></label>
          <div className="dialog-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Analysis detail ────────────────────────────────────────────────────────────

function AnalysisDetail({ analysis }: { analysis: RefiAnalysis }) {
  const qc = useQueryClient();
  const [scenarioModal, setScenarioModal] = useState<'new' | RefiScenario | null>(null);

  const { data: scenarios = [] } = useQuery({
    queryKey: ['refi-scenarios', analysis.id],
    queryFn: () => getScenarios(analysis.id),
  });

  const { data: result } = useQuery({
    queryKey: ['refi-result', analysis.id],
    queryFn: () => getRefiResult(analysis.id),
    enabled: scenarios.length > 0,
  });

  const deleteMut = useMutation({
    mutationFn: ({ scenarioId }: { scenarioId: string }) => deleteScenario(analysis.id, scenarioId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['refi-scenarios', analysis.id] });
      qc.invalidateQueries({ queryKey: ['refi-result', analysis.id] });
    },
  });

  function handleScenarioSaved() {
    qc.invalidateQueries({ queryKey: ['refi-scenarios', analysis.id] });
    qc.invalidateQueries({ queryKey: ['refi-result', analysis.id] });
    setScenarioModal(null);
  }

  return (
    <div>
      <div className="summary-cards" style={{ marginBottom: 16 }}>
        <div className="summary-card">
          <div className="summary-card-label">Current Balance</div>
          <div className="summary-card-value">{fmtMoney(parseFloat(analysis.loan_current_balance))}</div>
        </div>
        <div className="summary-card">
          <div className="summary-card-label">Current Rate</div>
          <div className="summary-card-value">{fmtPct(parseFloat(analysis.current_annual_rate))}</div>
        </div>
        {result && (
          <>
            <div className="summary-card">
              <div className="summary-card-label">Current Payment / Mo</div>
              <div className="summary-card-value">{fmtMoney(result.current.monthlyPayment)}</div>
            </div>
            <div className="summary-card">
              <div className="summary-card-label">Remaining Months</div>
              <div className="summary-card-value">{result.current.remainingMonths}</div>
            </div>
          </>
        )}
      </div>

      <div className="section-header">
        <h2>Scenarios</h2>
        <button className="btn btn-primary" onClick={() => setScenarioModal('new')}>+ Add Scenario</button>
      </div>

      {scenarios.length === 0 ? (
        <div className="empty-state"><p>Add scenarios to compare refinance options.</p></div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Label</th><th>Term</th><th>Rate</th>
              <th>Payment/Mo</th><th>Delta/Mo</th><th>Total Interest</th>
              <th>Interest Diff</th><th>Investment Gain</th><th>Net Gain</th><th></th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map(s => {
              const r = result?.scenarios.find(x => x.scenarioId === s.id);
              return (
                <tr key={s.id}>
                  <td>{s.label}</td>
                  <td>{s.term_years}yr</td>
                  <td>{fmtPct(parseFloat(s.annual_rate))}</td>
                  <td className="num">{r ? fmtMoney(r.monthlyPayment) : '—'}</td>
                  <td className={`num ${r && r.monthlyDelta < 0 ? 'green' : r && r.monthlyDelta > 0 ? 'red' : ''}`}>
                    {r ? (r.monthlyDelta > 0 ? '+' : '') + fmtMoney(r.monthlyDelta) : '—'}
                  </td>
                  <td className="num">{r ? fmtMoney(r.totalInterest) : '—'}</td>
                  <td className={`num ${r && r.totalInterestDiff < 0 ? 'green' : r && r.totalInterestDiff > 0 ? 'red' : ''}`}>
                    {r ? (r.totalInterestDiff > 0 ? '+' : '') + fmtMoney(r.totalInterestDiff) : '—'}
                  </td>
                  <td className="num green">{r ? fmtMoney(r.investmentGainAtTermEnd) : '—'}</td>
                  <td className={`num ${r && r.totalGainByChoosing > 0 ? 'green' : r && r.totalGainByChoosing < 0 ? 'red' : ''}`}>
                    {r ? (r.totalGainByChoosing > 0 ? '+' : '') + fmtMoney(r.totalGainByChoosing) : '—'}
                  </td>
                  <td className="actions-cell">
                    <button className="btn" style={{ fontSize: '0.75rem', padding: '3px 10px' }} onClick={() => setScenarioModal(s)}>Edit</button>
                    <button className="btn btn-danger" style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                      onClick={() => { if (confirm(`Delete "${s.label}"?`)) deleteMut.mutate({ scenarioId: s.id }); }}>Del</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {scenarioModal && (
        <ScenarioModal
          analysisId={analysis.id}
          existing={scenarioModal === 'new' ? undefined : scenarioModal}
          onClose={() => setScenarioModal(null)}
          onSave={handleScenarioSaved}
        />
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export function RefiPage() {
  const qc = useQueryClient();
  const [analysisModal, setAnalysisModal] = useState<'new' | RefiAnalysis | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const { data: analyses = [], isLoading } = useQuery({
    queryKey: ['refi-analyses'],
    queryFn: getAnalyses,
  });

  const deleteMut = useMutation({
    mutationFn: deleteAnalysis,
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['refi-analyses'] });
      if (selected === id) setSelected(null);
    },
  });

  function handleAnalysisSaved(a: RefiAnalysis) {
    qc.invalidateQueries({ queryKey: ['refi-analyses'] });
    setAnalysisModal(null);
    setSelected(a.id);
  }

  const activeAnalysis = analyses.find(a => a.id === selected);

  return (
    <div className="page">
      <div className="page-header">
        <h1>Refi Calculator</h1>
        <button className="btn btn-primary" onClick={() => setAnalysisModal('new')}>+ New Analysis</button>
      </div>

      {isLoading ? <p className="muted">Loading…</p> : analyses.length === 0 ? (
        <div className="empty-state"><p>No analyses yet. Create one to compare refinance scenarios.</p></div>
      ) : (
        <>
          <div className="section-card">
            <div className="section-header"><h2>Analyses</h2></div>
            <table className="data-table">
              <thead>
                <tr><th>Name</th><th>Balance</th><th>Current Rate</th><th>Months In</th><th></th></tr>
              </thead>
              <tbody>
                {analyses.map(a => (
                  <tr key={a.id}
                    className={`data-row ${selected === a.id ? 'expanded' : ''}`}
                    onClick={() => setSelected(selected === a.id ? null : a.id)}
                  >
                    <td className="name-cell">
                      <span className="expand-arrow">{selected === a.id ? '▾' : '▸'}</span>
                      {a.name}
                    </td>
                    <td className="num">{fmtMoney(parseFloat(a.loan_current_balance))}</td>
                    <td>{fmtPct(parseFloat(a.current_annual_rate))}</td>
                    <td>{a.months_in}</td>
                    <td className="actions-cell" onClick={e => e.stopPropagation()}>
                      <button className="btn" style={{ fontSize: '0.75rem', padding: '3px 10px' }} onClick={() => setAnalysisModal(a)}>Edit</button>
                      <button className="btn btn-danger" style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                        onClick={() => { if (confirm(`Delete "${a.name}"?`)) deleteMut.mutate(a.id); }}>Del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {activeAnalysis && (
            <div className="section-card">
              <div className="section-header">
                <h2>{activeAnalysis.name}</h2>
              </div>
              <AnalysisDetail analysis={activeAnalysis} />
            </div>
          )}
        </>
      )}

      {analysisModal && (
        <AnalysisModal
          existing={analysisModal === 'new' ? undefined : analysisModal}
          onClose={() => setAnalysisModal(null)}
          onSave={handleAnalysisSaved}
        />
      )}
    </div>
  );
}
