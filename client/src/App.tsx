import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';
import { AssetsPage } from './pages/AssetsPage';
import { IncomePage } from './pages/IncomePage';
import { ExpensesPage } from './pages/ExpensesPage';
import { FirePage } from './pages/FirePage';
import { RefiPage } from './pages/RefiPage';
import { TaxPage } from './pages/TaxPage';
import { AccountPage } from './pages/AccountPage';

export function App() {
  const { account, loading, logout } = useAuth();

  if (loading) return <div className="loading">Loading…</div>;
  if (!account) return <AuthPage />;

  return (
    <ToastProvider>
      <div className="app-shell">
        <nav className="sidebar">
          <div className="sidebar-logo">Firemaxxer</div>
          <ul className="sidebar-nav">
            <li><NavLink to="/" end>Dashboard</NavLink></li>
            <li><NavLink to="/assets">Assets &amp; Liabilities</NavLink></li>
            <li><NavLink to="/income">Income</NavLink></li>
            <li><NavLink to="/expenses">Expenses</NavLink></li>
            <li><NavLink to="/fire">FIRE Dashboard</NavLink></li>
            <li><NavLink to="/refi">Refi Calculator</NavLink></li>
            <li><NavLink to="/tax">Tax Brackets</NavLink></li>
            <li><NavLink to="/account">Account</NavLink></li>
          </ul>
          <div className="sidebar-footer">
            <span className="sidebar-email">{account.email}</span>
            <button
              className="btn btn-danger"
              style={{ marginTop: 8, width: '100%', fontSize: '0.78rem', padding: '5px 0' }}
              onClick={logout}
            >
              Log out
            </button>
          </div>
        </nav>
        <main className="main-content">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/assets" element={<AssetsPage />} />
            <Route path="/income" element={<IncomePage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/fire" element={<FirePage />} />
            <Route path="/refi" element={<RefiPage />} />
            <Route path="/tax" element={<TaxPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  );
}
