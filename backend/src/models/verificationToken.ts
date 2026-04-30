import bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { query } from '../config/db';

interface TokenRow {
  id: string;
  account_id: string;
  token_hash: string;
  type: 'verify' | 'reset';
  expires_at: Date;
  used_at: Date | null;
}

export async function createToken(
  accountId: string,
  type: 'verify' | 'reset',
  ttlSeconds: number,
): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  const hash = await bcrypt.hash(code, 10);

  await query(
    `INSERT INTO verification_tokens (account_id, token_hash, type, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(secs => $4))`,
    [accountId, hash, type, ttlSeconds],
  );

  return code;
}

export async function validateAndConsumeToken(
  accountId: string,
  plainCode: string,
  type: 'verify' | 'reset',
): Promise<boolean> {
  const { rows } = await query<TokenRow>(
    `SELECT * FROM verification_tokens
     WHERE account_id = $1 AND type = $2 AND used_at IS NULL AND expires_at > now()
     ORDER BY created_at DESC
     LIMIT 5`,
    [accountId, type],
  );

  for (const row of rows) {
    const match = await bcrypt.compare(plainCode, row.token_hash);
    if (match) {
      await query(
        'UPDATE verification_tokens SET used_at = now() WHERE id = $1',
        [row.id],
      );
      return true;
    }
  }

  return false;
}

export async function hasLiveToken(
  accountId: string,
  type: 'verify' | 'reset',
): Promise<boolean> {
  const { rows } = await query<{ count: number }>(
    `SELECT count(*)::int AS count FROM verification_tokens
     WHERE account_id = $1 AND type = $2 AND used_at IS NULL AND expires_at > now()`,
    [accountId, type],
  );
  return rows[0].count > 0;
}
