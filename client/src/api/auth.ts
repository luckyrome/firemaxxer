import { apiFetch } from './client';
import type { Account } from '../types';

export async function getMe(): Promise<Account> {
  return apiFetch<Account>('/api/auth/me');
}

export async function login(email: string, password: string): Promise<Account> {
  const res = await apiFetch<{ account: Account }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  return res.account;
}

export async function register(email: string, password: string): Promise<{ accountId: string }> {
  return apiFetch<{ accountId: string }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function verifyEmail(accountId: string, code: string): Promise<void> {
  await apiFetch('/api/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ accountId, code }),
  });
}

export async function resendVerification(accountId: string): Promise<void> {
  await apiFetch('/api/auth/resend-verification', {
    method: 'POST',
    body: JSON.stringify({ accountId }),
  });
}

export async function logout(): Promise<void> {
  await apiFetch('/api/auth/logout', { method: 'POST' });
}

export async function forgotPassword(email: string): Promise<void> {
  await apiFetch('/api/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(
  accountId: string,
  token: string,
  newPassword: string,
): Promise<void> {
  await apiFetch('/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ accountId, token, newPassword }),
  });
}

export async function deleteAccount(password: string): Promise<void> {
  await apiFetch('/api/auth/account', {
    method: 'DELETE',
    body: JSON.stringify({ password }),
  });
}
