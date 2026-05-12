import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { getAssets, deleteAsset, getLiabilities, deleteLiability, getNetWorth } from '../api/assets';
import { AssetModal } from '../components/assets/AssetModal';
import { LiabilityModal } from '../components/assets/LiabilityModal';
import { AssetSnapshotPanel, LiabilitySnapshotPanel } from '../components/assets/SnapshotPanel';
import { PageHelp } from '../components/HelpDialog';
import type { AssetWithLatest, LiabilityWithLatest, Asset, Liability } from '../types';

const ASSET_TYPE_LABELS: Record<string, string> = {
  brokerage: 'Brokerage', '401k': '401(k)', roth_ira: 'Roth IRA',
  real_estate: 'Real Estate', cash: 'Cash', other: 'Other',
};

const LIABILITY_TYPE_LABELS: Record<string, string> = {
  mortgage: 'Mortgage', credit_card: 'Credit Card', auto_loan: 'Auto Loan',
  student_loan: 'Student Loan', other: 'Other',
};

function fmtMoney(v: string | number | null) {
  if (v === null || v === undefined) return '—';
  return '$' + parseFloat(String(v)).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function fmtPct(v: string) {
  return (parseFloat(v) * 100).toFixed(3) + '%';
}

export function AssetsPage() {
  const qc = useQueryClient();
  const [assetModal, setAssetModal] = useState<'new' | AssetWithLatest | null>(null);
  const [liabilityModal, setLiabilityModal] = useState<'new' | LiabilityWithLatest | null>(null);
  const [expandedAsset, setExpandedAsset] = useState<string | null>(null);
  const [expandedLiability, setExpandedLiability] = useState<string | null>(null);

  const { data: assets = [], isLoading: assetsLoading } = useQuery({
    queryKey: ['assets'],
    queryFn: getAssets,
  });

  const { data: liabilities = [], isLoading: liabilitiesLoading } = useQuery({
    queryKey: ['liabilities'],
    queryFn: getLiabilities,
  });

  const { data: netWorthHistory = [] } = useQuery({
    queryKey: ['net-worth'],
    queryFn: getNetWorth,
  });

  const deleteAssetMutation = useMutation({
    mutationFn: deleteAsset,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['assets'] }); qc.invalidateQueries({ queryKey: ['net-worth'] }); },
  });

  const deleteLiabilityMutation = useMutation({
    mutationFn: deleteLiability,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['liabilities'] }); qc.invalidateQueries({ queryKey: ['net-worth'] }); },
  });

  function handleAssetSaved(asset: Asset) {
    qc.invalidateQueries({ queryKey: ['assets'] });
    qc.invalidateQueries({ queryKey: ['net-worth'] });
    setAssetModal(null);
    // Auto-expand to add first snapshot
    setExpandedAsset(asset.id);
  }

  function handleLiabilitySaved(liability: Liability) {
    qc.invalidateQueries({ queryKey: ['liabilities'] });
    qc.invalidateQueries({ queryKey: ['net-worth'] });
    setLiabilityModal(null);
    setExpandedLiability(liability.id);
  }

  // Summary cards
  const latestAssets = assets.reduce((sum, a) => sum + (a.latest_value ? parseFloat(a.latest_value) : 0), 0);
  const latestLiabilities = liabilities.reduce((sum, l) => sum + (l.latest_balance ? parseFloat(l.latest_balance) : 0), 0);
  const netWorth = latestAssets - latestLiabilities;

  const chartData = netWorthHistory.map((p) => ({
    date: p.date,
    'Total Assets': p.totalAssets,
    'Total Liabilities': p.totalLiabilities,
    'Net Worth': p.netWorth,
  }));

  return (
    <div className="page">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h1>Assets &amp; Liabilities</h1>
          <PageHelp page="assets" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <div className="summary-card-label">Total Assets</div>
          <div className="summary-card-value green">{fmtMoney(latestAssets)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-card-label">Total Liabilities</div>
          <div className="summary-card-value red">{fmtMoney(latestLiabilities)}</div>
        </div>
        <div className="summary-card">
          <div className="summary-card-label">Net Worth</div>
          <div className={`summary-card-value ${netWorth >= 0 ? 'green' : 'red'}`}>{fmtMoney(netWorth)}</div>
        </div>
      </div>

      {/* Net worth chart */}
      {chartData.length > 0 && (
        <div className="chart-card">
          <div className="chart-title">Net Worth History</div>
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 4, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--fg-muted)' }} />
              <YAxis tickFormatter={(v) => '$' + (v / 1000).toFixed(0) + 'k'} tick={{ fontSize: 11, fill: 'var(--fg-muted)' }} width={64} />
              <Tooltip
                formatter={(v) => fmtMoney(v as number)}
                contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 8 }}
                labelStyle={{ color: 'var(--fg-muted)', fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Total Assets" stroke="#3fb950" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Total Liabilities" stroke="#f85149" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Net Worth" stroke="#58a6ff" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Assets table */}
      <div className="section-card">
        <div className="section-header">
          <h2>Assets</h2>
          <button className="btn btn-primary" onClick={() => setAssetModal('new')}>+ Add Asset</button>
        </div>
        {assetsLoading ? <p className="muted">Loading…</p> : assets.length === 0 ? (
          <div className="empty-state"><p>No assets yet.</p></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th><th>Type</th><th className="num">Latest Value</th><th>Date</th><th></th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <>
                  <tr
                    key={a.id}
                    className={`data-row ${expandedAsset === a.id ? 'expanded' : ''}`}
                    onClick={() => setExpandedAsset(expandedAsset === a.id ? null : a.id)}
                  >
                    <td className="name-cell">
                      <span className="expand-arrow">{expandedAsset === a.id ? '▾' : '▸'}</span>
                      {a.name}
                    </td>
                    <td><span className="type-badge">{ASSET_TYPE_LABELS[a.type]}</span></td>
                    <td className="num">{a.latest_value ? fmtMoney(a.latest_value) : <span className="muted">—</span>}</td>
                    <td className="muted">{a.latest_date ?? '—'}</td>
                    <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                      <button className="btn" style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                        onClick={() => setAssetModal(a)}>Edit</button>
                      <button className="btn btn-danger" style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                        onClick={() => { if (confirm(`Delete "${a.name}"?`)) deleteAssetMutation.mutate(a.id); }}>Del</button>
                    </td>
                  </tr>
                  {expandedAsset === a.id && (
                    <tr key={`${a.id}-expand`} className="expand-row">
                      <td colSpan={5}>
                        <AssetSnapshotPanel assetId={a.id} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Liabilities table */}
      <div className="section-card">
        <div className="section-header">
          <h2>Liabilities</h2>
          <button className="btn btn-primary" onClick={() => setLiabilityModal('new')}>+ Add Liability</button>
        </div>
        {liabilitiesLoading ? <p className="muted">Loading…</p> : liabilities.length === 0 ? (
          <div className="empty-state"><p>No liabilities yet.</p></div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th><th>Type</th><th className="num">Rate</th><th className="num">Latest Balance</th><th>Linked Asset</th><th></th>
              </tr>
            </thead>
            <tbody>
              {liabilities.map((l) => (
                <>
                  <tr
                    key={l.id}
                    className={`data-row ${expandedLiability === l.id ? 'expanded' : ''}`}
                    onClick={() => setExpandedLiability(expandedLiability === l.id ? null : l.id)}
                  >
                    <td className="name-cell">
                      <span className="expand-arrow">{expandedLiability === l.id ? '▾' : '▸'}</span>
                      {l.name}
                    </td>
                    <td><span className="type-badge">{LIABILITY_TYPE_LABELS[l.type]}</span></td>
                    <td className="num">{fmtPct(l.interest_rate)}</td>
                    <td className="num red">{l.latest_balance ? fmtMoney(l.latest_balance) : <span className="muted">—</span>}</td>
                    <td className="muted">{l.linked_asset_name ?? '—'}</td>
                    <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                      <button className="btn" style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                        onClick={() => setLiabilityModal(l)}>Edit</button>
                      <button className="btn btn-danger" style={{ fontSize: '0.75rem', padding: '3px 10px' }}
                        onClick={() => { if (confirm(`Delete "${l.name}"?`)) deleteLiabilityMutation.mutate(l.id); }}>Del</button>
                    </td>
                  </tr>
                  {expandedLiability === l.id && (
                    <tr key={`${l.id}-expand`} className="expand-row">
                      <td colSpan={6}>
                        <LiabilitySnapshotPanel liability={l} />
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {assetModal && (
        <AssetModal
          existing={assetModal === 'new' ? undefined : assetModal}
          onSave={handleAssetSaved}
          onClose={() => setAssetModal(null)}
        />
      )}
      {liabilityModal && (
        <LiabilityModal
          existing={liabilityModal === 'new' ? undefined : liabilityModal}
          assets={assets}
          onSave={handleLiabilitySaved}
          onClose={() => setLiabilityModal(null)}
        />
      )}
    </div>
  );
}
