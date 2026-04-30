import { useAuth } from './context/AuthContext';
import { AuthPage } from './pages/AuthPage';
import { DashboardPage } from './pages/DashboardPage';

export function App() {
  const { account, loading } = useAuth();

  if (loading) return <div className="loading">Loading…</div>;
  if (!account) return <AuthPage />;

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-logo">Firemaxxer</div>
        <ul className="sidebar-nav">
          <li><a href="#">Dashboard</a></li>
          <li><a href="#">Assets &amp; Liabilities</a></li>
          <li><a href="#">Income</a></li>
          <li><a href="#">Expenses</a></li>
          <li><a href="#">Refi Calculator</a></li>
        </ul>
        <div className="sidebar-footer">
          <span className="sidebar-email">{account.email}</span>
        </div>
      </nav>
      <main className="main-content">
        <DashboardPage />
      </main>
    </div>
  );
}
