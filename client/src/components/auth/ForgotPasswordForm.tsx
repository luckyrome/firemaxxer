import { useState, type FormEvent } from 'react';
import { forgotPassword } from '../../api/auth';
import { ApiError } from '../../api/client';

interface Props {
  onBack: () => void;
}

export function ForgotPasswordForm({ onBack }: Props) {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <div className="auth-form">
        <h2>Check your email</h2>
        <p className="auth-hint">
          If an account exists for that address, we've sent a password reset code.
        </p>
        <button type="button" className="auth-btn" onClick={onBack}>
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h2>Reset password</h2>
      <p className="auth-hint" style={{ marginBottom: '1rem' }}>
        Enter your email and we'll send a reset code.
      </p>
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
      <button type="submit" className="auth-btn" disabled={loading}>
        {loading ? 'Sending…' : 'Send reset code'}
      </button>
      <p className="auth-switch">
        <button type="button" className="auth-link" onClick={onBack}>
          Back to sign in
        </button>
      </p>
    </form>
  );
}
