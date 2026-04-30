import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, isJtiBlacklisted } from '../services/jwt';
import { findById } from '../models/account';
import { AuthError, ForbiddenError } from './errorHandler';
import type { Account } from '../models/account';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      account?: Account;
    }
  }
}

async function resolveAccount(req: Request): Promise<Account | null> {
  const token = req.cookies?.access_token as string | undefined;
  if (!token) return null;

  let payload: ReturnType<typeof verifyAccessToken>;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return null;
  }

  if (await isJtiBlacklisted(payload.jti)) return null;

  return findById(payload.sub);
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const account = await resolveAccount(req);
    if (!account) throw new AuthError();
    req.account = account;
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  try {
    const account = await resolveAccount(req);
    if (!account) throw new AuthError();
    if (!account.is_admin) throw new ForbiddenError();
    req.account = account;
    next();
  } catch (err) {
    next(err);
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    req.account = (await resolveAccount(req)) ?? undefined;
    next();
  } catch (err) {
    console.error('[optionalAuth] Unexpected error resolving account:', err);
    next();
  }
}
