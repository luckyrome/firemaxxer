import { Router, CookieOptions } from 'express';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import {
  createAccount,
  findByEmail,
  findById,
  markEmailVerified,
  markResendUsed,
  updatePasswordHash,
  setPasswordChangedAt,
  deleteAccount,
} from '../models/account';
import {
  createToken,
  validateAndConsumeToken,
  hasLiveToken,
} from '../models/verificationToken';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  blacklistJti,
  isJtiBlacklisted,
  verifyAccessToken,
  ACCESS_TTL_SECONDS,
  REFRESH_TTL_SECONDS,
} from '../services/jwt';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/email';
import { requireAuth } from '../middleware/requireAuth';
import { ApiError, AuthError, ForbiddenError } from '../middleware/errorHandler';
import { config } from '../config/env';

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: () => process.env.NODE_ENV === 'test',
});

const verifyLimiter = rateLimit({
  windowMs: 5 * 1000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts, please wait a moment.' },
  skip: () => process.env.NODE_ENV === 'test',
  keyGenerator: (req) => {
    const accountId = req.body?.accountId;
    return typeof accountId === 'string' ? accountId : (req.ip ?? 'unknown');
  },
});

const VERIFY_TTL = 3 * 60 * 60;
const RESET_TTL  = 60 * 60;
const BCRYPT_ROUNDS = 12;

const _dummyHashPromise = bcrypt.hash('__dummy__', BCRYPT_ROUNDS);

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const TIMING_DELAY_MS = 250;

const cookieOpts: CookieOptions = {
  httpOnly: true,
  sameSite: 'strict',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

function setTokenCookies(res: Parameters<Router>[1], accessToken: string, refreshToken: string) {
  res.cookie('access_token', accessToken, { ...cookieOpts, maxAge: ACCESS_TTL_SECONDS * 1000 });
  res.cookie('refresh_token', refreshToken, { ...cookieOpts, maxAge: REFRESH_TTL_SECONDS * 1000 });
}

function clearTokenCookies(res: Parameters<Router>[1]) {
  res.clearCookie('access_token', cookieOpts);
  res.clearCookie('refresh_token', cookieOpts);
}

// POST /api/auth/register
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

router.post('/register', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = registerSchema.parse(req.body);

    const existing = await findByEmail(email);
    if (existing) throw new ApiError(409, 'Email already registered');

    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const account = await createAccount(email, hash);
    const code = await createToken(account.id, 'verify', VERIFY_TTL);
    try {
      await sendVerificationEmail(email, code, account.id);
    } catch (emailErr) {
      console.error('Failed to send verification email:', emailErr);
      await deleteAccount(account.id);
      throw new ApiError(503, 'Could not send verification email — please try again shortly');
    }

    res.status(201).json({ accountId: account.id });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/verify-email
const verifySchema = z.object({
  accountId: z.string().uuid(),
  code: z.string().length(6),
});

router.post('/verify-email', verifyLimiter, async (req, res, next) => {
  try {
    const { accountId, code } = verifySchema.parse(req.body);
    const valid = await validateAndConsumeToken(accountId, code, 'verify');
    if (!valid) {
      const live = await hasLiveToken(accountId, 'verify');
      if (!live) {
        const account = await findById(accountId);
        if (account && !account.email_verified) {
          await deleteAccount(account.id);
        }
      }
      throw new ApiError(400, 'Invalid or expired verification code');
    }
    await markEmailVerified(accountId);

    const accessToken = signAccessToken(accountId);
    const refreshToken = signRefreshToken(accountId);
    setTokenCookies(res, accessToken, refreshToken);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/resend-verification
const resendSchema = z.object({ accountId: z.string().uuid() });

router.post('/resend-verification', authLimiter, async (req, res, next) => {
  try {
    const { accountId } = resendSchema.parse(req.body);
    const account = await findById(accountId);
    if (!account) throw new ApiError(404, 'Account not found');
    if (account.resend_used) throw new ApiError(429, 'Verification code already resent once');
    if (account.email_verified) throw new ApiError(400, 'Email already verified');

    const code = await createToken(accountId, 'verify', VERIFY_TTL);
    await sendVerificationEmail(account.email, code, accountId);
    await markResendUsed(accountId);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const account = await findByEmail(email);
    const invalidErr = new AuthError('Invalid email or password');

    const hashToCompare = account?.password_hash ?? await _dummyHashPromise;
    const valid = await bcrypt.compare(password, hashToCompare);
    if (!account || !valid) throw invalidErr;
    if (!account.email_verified) throw new ForbiddenError('Please verify your email before signing in.');

    const accessToken = signAccessToken(account.id);
    const refreshToken = signRefreshToken(account.id);
    setTokenCookies(res, accessToken, refreshToken);

    res.json({
      account: {
        id: account.id,
        email: account.email,
        verified: account.email_verified,
        isAdmin: account.is_admin,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/refresh
router.post('/refresh', authLimiter, async (req, res, next) => {
  try {
    const token = req.cookies?.refresh_token as string | undefined;
    if (!token) throw new AuthError();

    let payload: ReturnType<typeof verifyRefreshToken>;
    try {
      payload = verifyRefreshToken(token);
    } catch {
      throw new AuthError('Refresh token invalid or expired');
    }

    if (await isJtiBlacklisted(payload.jti)) throw new AuthError('Refresh token revoked');

    const account = await findById(payload.sub);
    if (!account) throw new AuthError();

    if (account.password_changed_at && payload.iat < account.password_changed_at.getTime() / 1000) {
      throw new AuthError('Session invalidated — please log in again');
    }

    const remaining = payload.exp - Math.floor(Date.now() / 1000);
    await blacklistJti(payload.jti, Math.max(remaining, 1));

    const newAccess = signAccessToken(account.id);
    const newRefresh = signRefreshToken(account.id);
    setTokenCookies(res, newAccess, newRefresh);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/logout
router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    const accessToken = req.cookies?.access_token as string;
    const accessPayload = verifyAccessToken(accessToken);
    const accessRemaining = accessPayload.exp - Math.floor(Date.now() / 1000);
    await blacklistJti(accessPayload.jti, Math.max(accessRemaining, 1));

    const refreshToken = req.cookies?.refresh_token as string | undefined;
    if (refreshToken) {
      try {
        const refreshPayload = verifyRefreshToken(refreshToken);
        if (!(await isJtiBlacklisted(refreshPayload.jti))) {
          const refreshRemaining = refreshPayload.exp - Math.floor(Date.now() / 1000);
          await blacklistJti(refreshPayload.jti, Math.max(refreshRemaining, 1));
        }
      } catch { /* already expired or invalid */ }
    }

    clearTokenCookies(res);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/forgot-password
const forgotSchema = z.object({ email: z.string().email() });

router.post('/forgot-password', authLimiter, async (req, res, next) => {
  try {
    const { email } = forgotSchema.parse(req.body);
    const [account] = await Promise.all([findByEmail(email), delay(TIMING_DELAY_MS)]);
    if (account) {
      const code = await createToken(account.id, 'reset', RESET_TTL);
      const resetUrl = `${config.FRONTEND_ORIGIN}/#reset?accountId=${encodeURIComponent(account.id)}&token=${encodeURIComponent(code)}`;
      await sendPasswordResetEmail(email, resetUrl);
    }
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/reset-password
const resetSchema = z.object({
  accountId: z.string().uuid(),
  token: z.string().length(6),
  newPassword: z.string().min(8),
});

router.post('/reset-password', authLimiter, async (req, res, next) => {
  try {
    const { accountId, token, newPassword } = resetSchema.parse(req.body);
    const valid = await validateAndConsumeToken(accountId, token, 'reset');
    if (!valid) throw new ApiError(400, 'Invalid or expired reset token');

    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await updatePasswordHash(accountId, hash);
    await setPasswordChangedAt(accountId);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/change-password
const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(8),
});

router.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    const account = req.account!;

    const valid = await bcrypt.compare(currentPassword, account.password_hash);
    if (!valid) throw new ForbiddenError('Current password is incorrect');

    const hash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await updatePasswordHash(account.id, hash);
    await setPasswordChangedAt(account.id);

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  const { id, email, email_verified, is_admin } = req.account!;
  res.json({ id, email, verified: email_verified, isAdmin: is_admin });
});

// DELETE /api/auth/account
const deleteAccountSchema = z.object({ password: z.string() });

router.delete('/account', requireAuth, async (req, res, next) => {
  try {
    const { password } = deleteAccountSchema.parse(req.body);
    const account = req.account!;

    const valid = await bcrypt.compare(password, account.password_hash);
    if (!valid) throw new ForbiddenError('Incorrect password');

    const token = req.cookies?.access_token as string;
    try {
      const payload = verifyAccessToken(token);
      const remaining = payload.exp - Math.floor(Date.now() / 1000);
      await blacklistJti(payload.jti, Math.max(remaining, 1));
    } catch { /* ignore */ }

    await deleteAccount(account.id);
    clearTokenCookies(res);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export { router as authRouter };
