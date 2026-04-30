import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import { config } from '../config/env';
import { redisGet, redisSet } from '../config/redis';

const ACCESS_TTL_SECONDS = 15 * 60;             // 15 minutes
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;  // 30 days

export interface TokenPayload {
  sub: string;   // accountId
  jti: string;   // unique token ID
  iat: number;
  exp: number;
}

export function signAccessToken(accountId: string): string {
  return jwt.sign({ sub: accountId, jti: randomUUID() }, config.JWT_ACCESS_SECRET, {
    expiresIn: ACCESS_TTL_SECONDS,
    algorithm: 'HS256',
  });
}

export function signRefreshToken(accountId: string): string {
  return jwt.sign({ sub: accountId, jti: randomUUID() }, config.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TTL_SECONDS,
    algorithm: 'HS256',
  });
}

export function verifyAccessToken(token: string): TokenPayload {
  return jwt.verify(token, config.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }) as TokenPayload;
}

export function verifyRefreshToken(token: string): TokenPayload {
  return jwt.verify(token, config.JWT_REFRESH_SECRET, { algorithms: ['HS256'] }) as TokenPayload;
}

export async function blacklistJti(jti: string, ttlSeconds: number): Promise<void> {
  await redisSet(`jti:${jti}`, '1', ttlSeconds);
}

export async function isJtiBlacklisted(jti: string): Promise<boolean> {
  const val = await redisGet(`jti:${jti}`);
  return val !== null;
}

export { ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS };
