import { useState, type FormEvent } from 'react';
import { register } from '../../api/auth';
import { ApiError } from '../../api/client';

interface Props {
  onRegistered: (accountId: string) => void;
  onSwitch: () => void;
}

export function RegisterForm({ onRegistered, onSwitch }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const { accountId } = await register(email, password);
      onRegistered(accountId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h2>Create account</h2>
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
        Password <span className="auth-hint">(8+ characters)</span>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      <label>
        Confirm password
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />
      </label>
      <button type="submit" className="auth-btn" disabled={loading}>
        {loading ? 'Creating account…' : 'Create account'}
      </button>
      <p className="auth-switch">
        Already have an account?{' '}
        <button type="button" className="auth-link" onClick={onSwitch}>
          Sign in
        </button>
      </p>
    </form>
  );
}
