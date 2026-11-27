import crypto from 'crypto';
import { Router } from 'express';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth as getFirebaseAdminAuth } from 'firebase-admin/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  AuthenticatedRequest,
  clearSessionCookie,
  hashPassword,
  logAudit,
  requireAuth,
  setSessionCookie,
  signSessionToken,
  verifyPassword,
} from '../auth';
import { db } from '../db';
import { createRateLimiter } from '../rateLimit';

const OWNER_ADMIN_EMAIL = 'rudovickruben@gmail.com';

function getFirebaseAdminApp() {
  if (!firebaseConfig?.projectId || firebaseConfig.projectId === 'remixed-project-id') {
    throw new Error('Firebase project is not configured.');
  }
  return getApps().length ? getApp() : initializeApp({ projectId: firebaseConfig.projectId });
}

export const authRouter = Router();

const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: 'Too many authentication attempts. Please wait a few minutes and try again.',
});

function sanitizeUsername(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

function buildUserResponse(userId: number) {
  const user = db
    .prepare(
      `SELECT id, email, role, email_verified, is_active, is_demo, has_local_password, created_at FROM users WHERE id = ?`
    )
    .get(userId) as
    | {
        id: number;
        email: string;
        role: 'student' | 'instructor' | 'admin';
        email_verified: number;
        is_active: number;
        is_demo: number;
        has_local_password: number;
        created_at: string;
      }
    | undefined;
  if (!user) return null;

  const profile = db
    .prepare(`SELECT * FROM student_profiles WHERE user_id = ?`)
    .get(userId);
  const instructor = db
    .prepare(`SELECT * FROM instructors WHERE user_id = ?`)
    .get(userId);

  return {
    ...user,
    email_verified: Boolean(user.email_verified),
    is_demo: Boolean(user.is_demo),
    has_local_password: Boolean(user.has_local_password),
    profile: profile || null,
    instructor: instructor || null,
  };
}

authRouter.get('/bootstrap-status', (_req, res) => {
  res.json({
    hasDemoData: false,
    firebaseEnabled: Boolean(firebaseConfig?.projectId && firebaseConfig.projectId !== 'remixed-project-id'),
  });
});

authRouter.post('/register', authLimiter, (req, res) => {
  const { fullName, username, email, password, confirmPassword, termsAccepted, country, city, phone } = req.body as {
    fullName?: string;
    username?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
    termsAccepted?: boolean;
    country?: string;
    city?: string;
    phone?: string;
  };

  if (!fullName || fullName.trim().length < 2) {
    res.status(400).json({ error: 'Full name is required.' });
    return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    res.status(400).json({ error: 'Please enter a valid email address.' });
    return;
  }
  if (!password || password.length < 8) {
    res.status(400).json({ error: 'Password must be at least 8 characters long.' });
    return;
  }
  if (confirmPassword !== undefined && confirmPassword !== password) {
    res.status(400).json({ error: 'Password confirmation does not match.' });
    return;
  }
  if (termsAccepted === false) {
    res.status(400).json({ error: 'Please accept the Terms and Conditions to create an account.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existingEmail = db
    .prepare(`SELECT id FROM users WHERE email = ?`)
    .get(normalizedEmail);
  if (existingEmail) {
    res.status(409).json({ error: 'An account with this email is already registered.' });
    return;
  }

  let cleanUsername = sanitizeUsername(username || fullName);
  if (!cleanUsername || cleanUsername.length < 3) {
    cleanUsername = `learner-${crypto.randomBytes(3).toString('hex')}`;
  }
  const existingUsername = db
    .prepare(`SELECT user_id FROM student_profiles WHERE username = ?`)
    .get(cleanUsername);
  if (existingUsername) {
    cleanUsername = `${cleanUsername}-${crypto.randomBytes(2).toString('hex')}`;
  }

  const verificationToken = crypto.randomBytes(16).toString('hex');
  const passwordHash = hashPassword(password);

  const tx = db.transaction(() => {
    const userRes = db
      .prepare(
        `INSERT INTO users (email, password_hash, role, email_verified, verification_token, is_active, is_demo)
         VALUES (?, ?, 'student', 0, ?, 1, 0)`
      )
      .run(normalizedEmail, passwordHash, verificationToken);

    const userId = Number(userRes.lastInsertRowid);
    db.prepare(
      `INSERT INTO student_profiles (user_id, username, full_name, phone, country, city, headline, bio)
       VALUES (?, ?, ?, ?, ?, ?, 'TechTalkHub Student', '')`
    ).run(
      userId,
      cleanUsername,
      fullName.trim(),
      (phone || '').trim(),
      (country || '').trim(),
      (city || '').trim()
    );
    return userId;
  });

  const userId = tx();
  logAudit(userId, 'STUDENT_REGISTERED', 'user', userId, { email: normalizedEmail });

  const token = signSessionToken({ userId, role: 'student', email: normalizedEmail });
  setSessionCookie(res, req, token);

  res.status(201).json({
    token,
    user: buildUserResponse(userId),
    verificationToken,
  });
});

authRouter.post('/login', authLimiter, (req, res) => {
  const { email, password } = req.body as {
    email?: string;
    password?: string;
  };

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = db
    .prepare(
      `SELECT id, email, password_hash, role, is_active FROM users WHERE email = ?`
    )
    .get(normalizedEmail) as
    | {
        id: number;
        email: string;
        password_hash: string;
        role: 'student' | 'instructor' | 'admin';
        is_active: number;
      }
    | undefined;

  if (!user || !verifyPassword(password, user.password_hash)) {
    res.status(401).json({ error: 'Incorrect email or password.' });
    return;
  }

  if (user.is_active !== 1) {
    res.status(403).json({ error: 'This account has been suspended. Please contact support.' });
    return;
  }

  db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(user.id);
  logAudit(user.id, 'USER_LOGIN', 'user', user.id, { role: user.role });

  const token = signSessionToken({
    userId: user.id,
    role: user.role,
    email: user.email,
  });
  setSessionCookie(res, req, token);

  res.json({
    token,
    user: buildUserResponse(user.id),
  });
});

authRouter.post('/firebase-login', authLimiter, async (req, res) => {
  const { idToken } = req.body as { idToken?: string };
  if (!idToken || typeof idToken !== 'string') {
    res.status(400).json({ error: 'Firebase ID token is required.' });
    return;
  }

  try {
    const firebaseApp = getFirebaseAdminApp();
    const decoded = await getFirebaseAdminAuth(firebaseApp).verifyIdToken(idToken);
    if (!decoded.email || decoded.email_verified !== true) {
      res.status(403).json({ error: 'A verified Google email address is required to sign in.' });
      return;
    }

    const normalizedEmail = decoded.email.trim().toLowerCase();
    const displayName =
      typeof decoded.name === 'string' && decoded.name.trim().length >= 2
        ? decoded.name.trim()
        : normalizedEmail.split('@')[0];

    let existing = db
      .prepare(`SELECT id, email, role, is_active FROM users WHERE email = ?`)
      .get(normalizedEmail) as
      | { id: number; email: string; role: 'student' | 'instructor' | 'admin'; is_active: number }
      | undefined;

    if (existing && existing.is_active !== 1) {
      res.status(403).json({ error: 'This account has been suspended. Please contact support.' });
      return;
    }

    let userId: number;
    let role: 'student' | 'instructor' | 'admin';

    if (!existing) {
      role = normalizedEmail === OWNER_ADMIN_EMAIL ? 'admin' : 'student';
      const placeholderHash = hashPassword(crypto.randomBytes(32).toString('hex'));

      userId = db.transaction(() => {
        const uRes = db
          .prepare(
            `INSERT INTO users (email, password_hash, role, email_verified, is_active, is_demo, has_local_password)
             VALUES (?, ?, ?, 1, 1, 0, 0)`
          )
          .run(normalizedEmail, placeholderHash, role);
        const createdId = Number(uRes.lastInsertRowid);

        if (role === 'student') {
          let cleanUsername = sanitizeUsername(displayName);
          if (!cleanUsername || cleanUsername.length < 3) {
            cleanUsername = `learner-${crypto.randomBytes(3).toString('hex')}`;
          }
          if (db.prepare(`SELECT user_id FROM student_profiles WHERE username = ?`).get(cleanUsername)) {
            cleanUsername = `${cleanUsername}-${crypto.randomBytes(2).toString('hex')}`;
          }
          db.prepare(
            `INSERT INTO student_profiles (user_id, username, full_name, headline, bio)
             VALUES (?, ?, ?, 'TechTalkHub Student', '')`
          ).run(createdId, cleanUsername, displayName);
        } else if (role === 'admin' && displayName) {
          db.prepare(`UPDATE platform_settings SET value = ?, updated_at = datetime('now') WHERE key = 'director_name'`)
            .run(displayName);
        }
        return createdId;
      })();

      logAudit(userId, 'FIREBASE_USER_CREATED', 'user', userId, { email: normalizedEmail, role });
    } else {
      userId = existing.id;
      role = existing.role;
      if (normalizedEmail === OWNER_ADMIN_EMAIL && existing.role !== 'admin') {
        db.prepare(`UPDATE users SET role = 'admin', email_verified = 1, updated_at = datetime('now') WHERE id = ?`)
          .run(userId);
        role = 'admin';
      } else {
        db.prepare(`UPDATE users SET email_verified = 1, updated_at = datetime('now') WHERE id = ?`).run(userId);
      }
    }

    db.prepare(`UPDATE users SET last_login_at = datetime('now') WHERE id = ?`).run(userId);
    logAudit(userId, 'USER_LOGIN', 'user', userId, { method: 'firebase_google', role });

    const token = signSessionToken({ userId, role, email: normalizedEmail });
    setSessionCookie(res, req, token);
    res.json({
      token,
      user: buildUserResponse(userId),
      firebaseUid: decoded.uid,
    });
  } catch (err) {
    console.error('Firebase ID token verification failed:', err);
    res.status(401).json({ error: 'Unable to verify Google sign-in token. Please try again.' });
  }
});

authRouter.post('/logout', (req: AuthenticatedRequest, res) => {
  if (req.user) {
    logAudit(req.user.id, 'USER_LOGOUT', 'user', req.user.id);
  }
  clearSessionCookie(res, req);
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res) => {
  const user = buildUserResponse(req.user!.id);
  if (!user) {
    res.status(404).json({ error: 'User not found.' });
    return;
  }
  res.json({ user });
});

authRouter.post('/resend-verification', requireAuth, (req: AuthenticatedRequest, res) => {
  const token = crypto.randomBytes(16).toString('hex');
  db.prepare(`UPDATE users SET verification_token = ?, updated_at = datetime('now') WHERE id = ?`)
    .run(token, req.user!.id);
  res.json({
    message: 'Verification token generated.',
    verificationToken: token,
  });
});

authRouter.post('/verify-email', (req, res) => {
  const { token } = req.body as { token?: string };
  if (!token || !token.trim()) {
    res.status(400).json({ error: 'Verification token is required.' });
    return;
  }

  const user = db
    .prepare(`SELECT id FROM users WHERE verification_token = ?`)
    .get(token.trim()) as { id: number } | undefined;
  if (!user) {
    res.status(400).json({ error: 'Invalid or expired verification token.' });
    return;
  }

  db.prepare(
    `UPDATE users SET email_verified = 1, verification_token = NULL, updated_at = datetime('now') WHERE id = ?`
  ).run(user.id);
  logAudit(user.id, 'EMAIL_VERIFIED', 'user', user.id);

  res.json({ ok: true, message: 'Your email address has been verified.' });
});

authRouter.post('/change-password', requireAuth, (req: AuthenticatedRequest, res) => {
  const { currentPassword, newPassword, confirmPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  };

  if (!newPassword || newPassword.length < 8) {
    res.status(400).json({ error: 'New password must be at least 8 characters long.' });
    return;
  }
  if (confirmPassword !== undefined && newPassword !== confirmPassword) {
    res.status(400).json({ error: 'New password and confirmation do not match.' });
    return;
  }

  const user = db
    .prepare(`SELECT id, password_hash, has_local_password FROM users WHERE id = ?`)
    .get(req.user!.id) as
    | { id: number; password_hash: string; has_local_password: number }
    | undefined;

  if (!user) {
    res.status(404).json({ error: 'Account not found.' });
    return;
  }

  if (user.has_local_password === 1) {
    if (!currentPassword || !verifyPassword(currentPassword, user.password_hash)) {
      res.status(401).json({ error: 'Current password is incorrect.' });
      return;
    }
  }

  db.prepare(
    `UPDATE users SET password_hash = ?, has_local_password = 1, updated_at = datetime('now') WHERE id = ?`
  ).run(hashPassword(newPassword), user.id);

  logAudit(user.id, 'PASSWORD_CHANGED', 'user', user.id);
  res.json({
    ok: true,
    message: 'Password saved. You can now sign in with your email and password.',
    user: buildUserResponse(user.id),
  });
});

authRouter.post('/forgot-password', authLimiter, (req, res) => {
  const { email } = req.body as { email?: string };
  if (!email) {
    res.status(400).json({ error: 'Please enter your account email address.' });
    return;
  }
  const normalizedEmail = email.trim().toLowerCase();
  const user = db
    .prepare(`SELECT id, role, is_demo FROM users WHERE email = ?`)
    .get(normalizedEmail) as { id: number; role: string; is_demo: number } | undefined;

  if (!user || user.is_demo === 1 || user.role === 'admin' || user.role === 'instructor') {
    res.json({
      message: 'If an eligible student account matches that email, reset instructions have been issued.',
    });
    return;
  }

  const resetToken = crypto.randomBytes(18).toString('hex');
  const expires = new Date(Date.now() + 1000 * 60 * 30).toISOString();
  db.prepare(
    `UPDATE users SET reset_token = ?, reset_token_expires = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(resetToken, expires, user.id);

  res.json({
    message: 'Password reset token generated. Use it within 30 minutes to set a new password.',
    resetToken,
  });
});

authRouter.post('/reset-password', (req, res) => {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string };
  if (!token || !newPassword || newPassword.length < 8) {
    res.status(400).json({
      error: 'Valid reset token and a new password (min 8 characters) are required.',
    });
    return;
  }

  const user = db
    .prepare(`SELECT id, role, reset_token_expires FROM users WHERE reset_token = ?`)
    .get(token.trim()) as { id: number; role: string; reset_token_expires: string | null } | undefined;

  if (
    !user ||
    user.role === 'admin' ||
    user.role === 'instructor' ||
    !user.reset_token_expires ||
    new Date(user.reset_token_expires).getTime() < Date.now()
  ) {
    res.status(400).json({ error: 'Invalid or expired password reset token.' });
    return;
  }

  db.prepare(
    `UPDATE users SET password_hash = ?, has_local_password = 1, reset_token = NULL, reset_token_expires = NULL, updated_at = datetime('now') WHERE id = ?`
  ).run(hashPassword(newPassword), user.id);
  logAudit(user.id, 'PASSWORD_RESET', 'user', user.id);

  res.json({ ok: true, message: 'Your password has been updated. You may now sign in.' });
});
