import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import { db } from './db';

const EPHEMERAL_SESSION_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  return envSecret && envSecret.length >= 16 ? envSecret : EPHEMERAL_SESSION_SECRET;
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, expectedHex] = storedHash.split(':');
  if (!salt || !expectedHex) return false;
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export interface SessionPayload {
  userId: number;
  role: 'student' | 'instructor' | 'admin';
  email: string;
  exp: number;
}

export function signSessionToken(payload: Omit<SessionPayload, 'exp'>): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  };
  const data = Buffer.from(JSON.stringify(fullPayload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(data)
    .digest('base64url');
  return `${data}.${sig}`;
}

export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(data)
    .digest('base64url');
  try {
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expectedSig, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as SessionPayload;
    if (!parsed.exp || parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
    role: 'student' | 'instructor' | 'admin';
    email_verified: number;
    is_active: number;
    is_demo: number;
  };
  authMethod?: 'bearer' | 'cookie';
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  let token: string | null = null;
  let method: 'bearer' | 'cookie' | undefined;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
    method = 'bearer';
  } else if (req.cookies?.tth_session) {
    token = String(req.cookies.tth_session);
    method = 'cookie';
  }

  if (!token) {
    next();
    return;
  }

  // CSRF check for cookie-authenticated mutating requests
  if (
    method === 'cookie' &&
    ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method.toUpperCase())
  ) {
    const hasCustomHeader = req.headers['x-requested-with'] === 'TechTalkHub';
    const origin = req.headers.origin;
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    let originMatches = false;
    if (origin && host) {
      try {
        originMatches = new URL(origin).host === String(host);
      } catch {
        originMatches = false;
      }
    }
    if (!hasCustomHeader && !originMatches) {
      res.status(403).json({ error: 'Invalid request origin for authenticated action.' });
      return;
    }
  }

  const payload = verifySessionToken(token);
  if (!payload) {
    next();
    return;
  }

  const user = db
    .prepare(
      `SELECT id, email, role, email_verified, is_active, is_demo FROM users WHERE id = ?`
    )
    .get(payload.userId) as AuthenticatedRequest['user'] | undefined;

  if (user && user.is_active === 1) {
    req.user = user;
    req.authMethod = method;
  }

  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required. Please sign in to continue.' });
    return;
  }
  next();
}

export function requireRole(...roles: Array<'student' | 'instructor' | 'admin'>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'You do not have permission to perform this action.' });
      return;
    }
    next();
  };
}

export function setSessionCookie(res: Response, req: Request, token: string): void {
  const isHttps =
    req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
  res.cookie('tth_session', token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    partitioned: isHttps,
    maxAge: 1000 * 60 * 60 * 24 * 7,
    path: '/',
  });
}

export function clearSessionCookie(res: Response, req: Request): void {
  const isHttps =
    req.secure || req.headers['x-forwarded-proto'] === 'https' || process.env.NODE_ENV === 'production';
  res.clearCookie('tth_session', {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    partitioned: isHttps,
    path: '/',
  });
}

export function isAdminClaimed(): boolean {
  const row = db
    .prepare(`SELECT COUNT(*) as c FROM users WHERE role = 'admin' AND is_demo = 0`)
    .get() as { c: number };
  return row.c > 0;
}

export function getEnvAdminPasscode(): string {
  return process.env.ADMIN_BOOT_PASSCODE?.trim() || '';
}

export function logAudit(
  actorUserId: number | null,
  action: string,
  targetType: string,
  targetId: string | number,
  details: Record<string, unknown> = {}
): void {
  try {
    db.prepare(
      `INSERT INTO audit_logs (actor_user_id, action, target_type, target_id, details_json)
       VALUES (?, ?, ?, ?, ?)`
    ).run(actorUserId, action, targetType, String(targetId), JSON.stringify(details));
  } catch (err) {
    console.error('Audit log error:', err);
  }
}
