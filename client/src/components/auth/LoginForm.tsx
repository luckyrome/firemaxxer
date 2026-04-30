import { useState, type FormEvent } from 'react';
import { login } from '../../api/auth';
import { ApiError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Props {
  onSwitch: () => void;
  onForgotPassword: () => void;
}

export function LoginForm({ onSwitch, onForgotPassword }: Props) {
  const { setAccount } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const account = await login(email, password);
      setAccount(account);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h2>Sign in</h2>
      {error && <div className="auth-error">{error}</div>}
      <label>
        Email
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      <button type="submit" className="auth-btn" disabled={loading}>
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="auth-switch">
        <button type="button" className="auth-link" onClick={onForgotPassword}>
          Forgot password?
        </button>
      </p>
      <p className="auth-switch">
        No account?{' '}
        <button type="button" className="auth-link" onClick={onSwitch}>
          Create one
        </button>
      </p>
    </form>
  );
}
