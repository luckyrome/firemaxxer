import { useState } from 'react';
import { LoginForm } from '../components/auth/LoginForm';
import { RegisterForm } from '../components/auth/RegisterForm';
import { VerifyEmailForm } from '../components/auth/VerifyEmailForm';
import { ForgotPasswordForm } from '../components/auth/ForgotPasswordForm';

type View = 'login' | 'register' | 'verify' | 'forgot';

export function AuthPage() {
  const [view, setView] = useState<View>('login');
  const [pendingAccountId, setPendingAccountId] = useState('');

  if (view === 'verify') {
    return (
      <div className="auth-page">
        <div className="auth-logo">Firemaxxer</div>
        <VerifyEmailForm accountId={pendingAccountId} />
      </div>
    );
  }

  if (view === 'register') {
    return (
      <div className="auth-page">
        <div className="auth-logo">Firemaxxer</div>
        <RegisterForm
          onRegistered={(id) => {
            setPendingAccountId(id);
            setView('verify');
          }}
          onSwitch={() => setView('login')}
        />
      </div>
    );
  }

  if (view === 'forgot') {
    return (
      <div className="auth-page">
        <div className="auth-logo">Firemaxxer</div>
        <ForgotPasswordForm onBack={() => setView('login')} />
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-logo">Firemaxxer</div>
      <LoginForm
        onSwitch={() => setView('register')}
        onForgotPassword={() => setView('forgot')}
      />
    </div>
  );
}
