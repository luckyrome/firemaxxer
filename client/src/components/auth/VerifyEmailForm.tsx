import { useState, type FormEvent } from 'react';
import { verifyEmail, resendVerification, getMe } from '../../api/auth';
import { ApiError } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

interface Props {
  accountId: string;
}

export function VerifyEmailForm({ accountId }: Props) {
  const { setAccount } = useAuth();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await verifyEmail(accountId, code.trim());
      const account = await getMe();
      setAccount(account);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    try {
      await resendVerification(accountId);
      setResent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resend');
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h2>Check your email</h2>
      <p className="auth-hint" style={{ marginBottom: '1rem' }}>
        We sent a 6-digit code to your email address. Enter it below to verify your account.
      </p>
      {error && <div className="auth-error">{error}</div>}
      <label>
        Verification code
        <input
          type="text"
          inputMode="numeric"
          pattern="\d{6}"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="000000"
          required
        />
      </label>
      <button type="submit" className="auth-btn" disabled={loading}>
        {loading ? 'Verifying…' : 'Verify'}
      </button>
      {!resent ? (
        <p className="auth-switch">
          Didn't receive it?{' '}
          <button type="button" className="auth-link" onClick={handleResend}>
            Resend code
          </button>
        </p>
      ) : (
        <p className="auth-switch">Code resent — check your inbox.</p>
      )}
    </form>
  );
}
