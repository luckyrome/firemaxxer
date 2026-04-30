import { query } from '../config/db';

export interface Account {
  id: string;
  email: string;
  password_hash: string;
  email_verified: boolean;
  resend_used: boolean;
  is_admin: boolean;
  password_changed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export async function createAccount(email: string, passwordHash: string): Promise<Account> {
  const { rows } = await query<Account>(
    `INSERT INTO accounts (email, password_hash)
     VALUES ($1, $2)
     RETURNING *`,
    [email.toLowerCase(), passwordHash],
  );
  return rows[0];
}

export async function findByEmail(email: string): Promise<Account | null> {
  const { rows } = await query<Account>(
    'SELECT * FROM accounts WHERE lower(email) = $1',
    [email.toLowerCase()],
  );
  return rows[0] ?? null;
}

export async function findById(id: string): Promise<Account | null> {
  const { rows } = await query<Account>('SELECT * FROM accounts WHERE id = $1', [id]);
  return rows[0] ?? null;
}

export async function markEmailVerified(id: string): Promise<void> {
  await query('UPDATE accounts SET email_verified = true WHERE id = $1', [id]);
}

export async function markResendUsed(id: string): Promise<void> {
  await query('UPDATE accounts SET resend_used = true WHERE id = $1', [id]);
}

export async function updatePasswordHash(id: string, hash: string): Promise<void> {
  await query('UPDATE accounts SET password_hash = $2 WHERE id = $1', [id, hash]);
}

export async function setPasswordChangedAt(id: string): Promise<void> {
  await query('UPDATE accounts SET password_changed_at = now() WHERE id = $1', [id]);
}

export async function deleteAccount(id: string): Promise<void> {
  await query('DELETE FROM accounts WHERE id = $1', [id]);
}
