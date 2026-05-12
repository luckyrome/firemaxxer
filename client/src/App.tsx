import { useState, useEffect } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { AuthPage } from './pages/AuthPage';
import { AssetsPage } from './pages/AssetsPage';
import { IncomePage } from './pages/IncomePage';
import { ExpensesPage } from './pages/ExpensesPage';
import { FirePage } from './pages/FirePage';
import { RefiPage } from './pages/RefiPage';
import { TaxPage } from './pages/TaxPage';
import { AccountPage } from './pages/AccountPage';
import { AboutPage } from './pages/AboutPage';

type Theme = 'dark' | 'light';

function getInitialTheme(): Theme {
  const stored = localStorage.getItem('theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function App() {
  const { account, loading, logout } = useAuth();
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Close sidebar on viewport resize back to desktop
  useEffect(() => {
    function onResize() {
      if (window.innerWidth > 680) setSidebarOpen(false);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function toggleTheme() {
    setTheme(t => t === 'dark' ? 'light' : 'dark');
  }

  function closeNav() {
    setSidebarOpen(false);
  }

  if (loading) return <div className="loading">Loading…</div>;
  if (!account) return <AuthPage />;

  return (
    <ToastProvider>
      <div className="app-shell">

        {/* Mobile scrim — sits behind the open sidebar */}
        {sidebarOpen && (
          <div className="sidebar-scrim" onClick={closeNav} />
        )}

        <nav className={`sidebar${sidebarOpen ? ' open' : ''}`}>
          <div className="sidebar-logo">
            <span>Firemaxxer</span>
            <button className="sidebar-close-btn" onClick={closeNav} aria-label="Close menu">×</button>
          </div>

          <ul className="sidebar-nav">
            <li className="nav-section-label">FIRE</li>
            <li><NavLink to="/" end onClick={closeNav}>Dashboard</NavLink></li>
            <li><NavLink to="/net-worth" onClick={closeNav}>Assets &amp; Liabilities</NavLink></li>
            <li><NavLink to="/income" onClick={closeNav}>Income</NavLink></li>
            <li><NavLink to="/expenses" onClick={closeNav}>Expenses</NavLink></li>

            <li className="nav-section-divider" />
            <li className="nav-section-label">Tools</li>
            <li><NavLink to="/refi" onClick={closeNav}>Refi Calculator</NavLink></li>

            <li className="nav-section-divider" />
            <li className="nav-section-label">Settings</li>
            <li><NavLink to="/tax" onClick={closeNav}>Tax Brackets</NavLink></li>
            <li><NavLink to="/account" onClick={closeNav}>Account</NavLink></li>
            <li><NavLink to="/about" onClick={closeNav}>About</NavLink></li>
          </ul>

          <div className="sidebar-footer">
            <span className="sidebar-email">{account.email}</span>
            <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? (
                <><span style={{ fontSize: '0.85rem' }}>☀</span> Light mode</>
              ) : (
                <><span style={{ fontSize: '0.85rem' }}>◑</span> Dark mode</>
              )}
            </button>
            <button
              className="btn btn-danger"
              style={{ width: '100%', fontSize: '0.78rem', padding: '5px 0' }}
              onClick={logout}
            >
              Log out
            </button>
          </div>
        </nav>

        <main className="main-content">
          {/* Mobile-only sticky header */}
          <div className="mobile-header">
            <span className="mobile-header-logo">Firemaxxer</span>
            <button
              className="hamburger-btn"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              ☰
            </button>
          </div>

          <Routes>
            <Route path="/" element={<FirePage />} />
            <Route path="/net-worth" element={<AssetsPage />} />
            <Route path="/income" element={<IncomePage />} />
            <Route path="/expenses" element={<ExpensesPage />} />
            <Route path="/fire" element={<Navigate to="/" replace />} />
            <Route path="/refi" element={<RefiPage />} />
            <Route path="/tax" element={<TaxPage />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

      </div>
    </ToastProvider>
  );
}
