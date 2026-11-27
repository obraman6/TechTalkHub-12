import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import QRCode from 'qrcode';
import { logAudit } from '../auth';
import { resolvePublicBaseUrl, streamCertificatePdf } from '../certificates';
import { AVATAR_UPLOAD_DIR, db } from '../db';
import { createRateLimiter } from '../rateLimit';

export const publicRouter = Router();

const verifyLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Verification rate limit reached. Please try again in a minute.',
});

const contactLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many contact submissions. Please wait a few minutes before sending another message.',
});

publicRouter.get('/public/landing', (_req, res) => {
  const totalStudents = (
    db.prepare(`SELECT COUNT(*) as c FROM users WHERE role = 'student' AND is_active = 1`).get() as { c: number }
  ).c;
  const totalCourses = (
    db.prepare(`SELECT COUNT(*) as c FROM courses WHERE status = 'published'`).get() as { c: number }
  ).c;
  const certificatesIssued = (
    db.prepare(`SELECT COUNT(*) as c FROM certificates WHERE status = 'VALID'`).get() as { c: number }
  ).c;
  const verificationRequests = (
    db.prepare(`SELECT COUNT(*) as c FROM verification_logs`).get() as { c: number }
  ).c;

  const categories = db
    .prepare(
      `SELECT cat.id, cat.name, cat.slug, cat.description,
              COUNT(c.id) as course_count
       FROM categories cat
       LEFT JOIN courses c ON c.category_id = cat.id AND c.status = 'published'
       GROUP BY cat.id
       ORDER BY cat.display_order ASC, cat.id ASC`
    )
    .all();

  const popularCourses = db
    .prepare(
      `SELECT c.id, c.title, c.slug, c.course_code, c.level, c.duration_hours,
              c.certificate_type, c.thumbnail_url, c.status, c.description,
              cat.name as category_name, cat.slug as category_slug,
              COALESCE(i.full_name, 'TechTalkHub Faculty') as instructor_name,
              (SELECT COUNT(*) FROM course_modules m WHERE m.course_id = c.id) as module_count,
              (SELECT COUNT(*) FROM lessons l JOIN course_modules m ON l.module_id = m.id WHERE m.course_id = c.id) as lesson_count,
              (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) as enrollment_count
       FROM courses c
       JOIN categories cat ON c.category_id = cat.id
       LEFT JOIN instructors i ON c.instructor_id = i.id
       WHERE c.status = 'published'
       ORDER BY enrollment_count DESC, c.id ASC
       LIMIT 6`
    )
    .all();

  res.json({
    stats: {
      totalStudents,
      totalCourses,
      certificatesIssued,
      verificationRequests,
    },
    categories,
    popularCourses,
  });
});

publicRouter.get('/categories', (_req, res) => {
  const categories = db
    .prepare(
      `SELECT cat.*, COUNT(c.id) as course_count
       FROM categories cat
       LEFT JOIN courses c ON c.category_id = cat.id AND c.status = 'published'
       GROUP BY cat.id
       ORDER BY cat.display_order ASC, cat.id ASC`
    )
    .all();
  res.json({ categories });
});

publicRouter.get('/courses', (req, res) => {
  const search = String(req.query.search || '').trim().toLowerCase();
  const category = String(req.query.category || '').trim();
  const level = String(req.query.level || '').trim();
  const instructor = String(req.query.instructor || '').trim();

  const conditions: string[] = [`c.status = 'published'`];
  const params: Array<string | number> = [];

  if (category && category !== 'all') {
    conditions.push(`cat.slug = ?`);
    params.push(category);
  }
  if (level && level !== 'all') {
    conditions.push(`c.level = ?`);
    params.push(level);
  }
  if (instructor && instructor !== 'all') {
    conditions.push(`i.id = ?`);
    params.push(Number(instructor));
  }
  if (search) {
    conditions.push(
      `(LOWER(c.title) LIKE ? OR LOWER(c.description) LIKE ? OR LOWER(c.course_code) LIKE ? OR LOWER(c.learning_objectives) LIKE ? OR LOWER(cat.name) LIKE ? OR LOWER(COALESCE(i.full_name, '')) LIKE ?)`
    );
    const like = `%${search}%`;
    params.push(like, like, like, like, like, like);
  }

  const sql = `
    SELECT c.id, c.title, c.slug, c.course_code, c.level, c.description,
           c.learning_objectives, c.duration_hours, c.pass_mark, c.certificate_type,
           c.thumbnail_url, c.status, c.created_at, c.updated_at,
           cat.id as category_id, cat.name as category_name, cat.slug as category_slug,
           i.id as instructor_id, COALESCE(i.full_name, 'TechTalkHub Faculty') as instructor_name,
           (SELECT COUNT(*) FROM course_modules m WHERE m.course_id = c.id) as module_count,
           (SELECT COUNT(*) FROM lessons l JOIN course_modules m ON l.module_id = m.id WHERE m.course_id = c.id) as lesson_count,
           (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) as enrollment_count
    FROM courses c
    JOIN categories cat ON c.category_id = cat.id
    LEFT JOIN instructors i ON c.instructor_id = i.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY c.id ASC
  `;

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
  const courses = rows.map((r) => ({
    ...r,
    learning_objectives: (() => {
      try {
        return JSON.parse(String(r.learning_objectives || '[]'));
      } catch {
        return [];
      }
    })(),
  }));

  const instructors = db
    .prepare(`SELECT id, full_name, specialty FROM instructors ORDER BY full_name ASC`)
    .all();

  res.json({ courses, instructors });
});

publicRouter.get('/courses/:slug', (req, res) => {
  const course = db
    .prepare(
      `SELECT c.*, cat.name as category_name, cat.slug as category_slug,
              i.full_name as instructor_name, i.title as instructor_title, i.specialty as instructor_specialty, i.bio as instructor_bio,
              (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) as enrollment_count
       FROM courses c
       JOIN categories cat ON c.category_id = cat.id
       LEFT JOIN instructors i ON c.instructor_id = i.id
       WHERE c.slug = ? AND c.status = 'published'`
    )
    .get(req.params.slug) as Record<string, unknown> | undefined;

  if (!course) {
    res.status(404).json({ error: 'Course not found.' });
    return;
  }

  const modules = db
    .prepare(
      `SELECT id, title, description, order_index FROM course_modules WHERE course_id = ? AND COALESCE(is_published, 1) = 1 ORDER BY order_index ASC`
    )
    .all(course.id) as Array<{ id: number; title: string; description: string; order_index: number }>;

  const lessonsByModule = db.prepare(
    `SELECT id, module_id, title, duration_minutes, order_index FROM lessons WHERE module_id = ? ORDER BY order_index ASC`
  );

  const enrichedModules = modules.map((m) => ({
    ...m,
    lessons: lessonsByModule.all(m.id),
  }));

  const assessment = db
    .prepare(
      `SELECT id, title, time_limit_minutes, max_attempts, pass_mark,
              (SELECT COUNT(*) FROM questions q WHERE q.assessment_id = assessments.id) as question_count
       FROM assessments WHERE course_id = ?`
    )
    .get(course.id);

  res.json({
    course: {
      ...course,
      learning_objectives: (() => {
        try {
          return JSON.parse(String(course.learning_objectives || '[]'));
        } catch {
          return [];
        }
      })(),
    },
    modules: enrichedModules,
    assessment: assessment || null,
  });
});

publicRouter.get('/verify/:certificateId', verifyLimiter, async (req, res) => {
  const rawId = decodeURIComponent(req.params.certificateId || '').trim().toUpperCase();
  if (!rawId) {
    res.status(400).json({ status: 'NOT_FOUND', error: 'Certificate ID is required.' });
    return;
  }

  const row = db
    .prepare(
      `SELECT cert.*,
              COALESCE(NULLIF(cert.recipient_name, ''), sp.full_name, u.email, 'TechTalkHub Recipient') as student_name,
              sp.username as student_username,
              sp.photo_path as current_photo_path,
              COALESCE(sp.headline, 'Certified TechTalkHub Graduate') as student_headline,
              COALESCE(sp.public_profile_enabled, 0) as public_profile_enabled,
              c.title as course_title, c.course_code, c.duration_hours, c.slug as course_slug,
              cat.name as category_name,
              ct.name as template_name, ct.code as template_code, ct.accent_color,
              COALESCE(i.full_name, 'TechTalkHub Faculty') as instructor_name,
              COALESCE(i.title, 'Course Instructor') as instructor_title
       FROM certificates cert
       LEFT JOIN users u ON cert.student_id = u.id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       JOIN courses c ON cert.course_id = c.id
       JOIN categories cat ON c.category_id = cat.id
       JOIN certificate_templates ct ON cert.template_id = ct.id
       LEFT JOIN instructors i ON c.instructor_id = i.id
       WHERE UPPER(cert.certificate_id) = ?`
    )
    .get(rawId) as Record<string, unknown> | undefined;

  const ua = String(req.headers['user-agent'] || '').slice(0, 140);
  const ipHash = crypto
    .createHash('sha256')
    .update(String(req.ip || 'unknown'))
    .digest('hex')
    .slice(0, 16);

  if (!row) {
    db.prepare(
      `INSERT INTO verification_logs (certificate_id, certificate_record_id, result, user_agent_summary, ip_hash)
       VALUES (?, NULL, 'NOT_FOUND', ?, ?)`
    ).run(rawId, ua, ipHash);

    res.status(404).json({
      status: 'NOT_FOUND',
      certificateId: rawId,
      message: 'The certificate ID provided could not be verified in the TechTalkHub certification database.',
    });
    return;
  }

  const resultStatus = row.status === 'REVOKED' ? 'REVOKED' : 'VALID';
  db.prepare(
    `INSERT INTO verification_logs (certificate_id, certificate_record_id, result, user_agent_summary, ip_hash)
     VALUES (?, ?, ?, ?, ?)`
  ).run(String(row.certificate_id), Number(row.id), resultStatus, ua, ipHash);

  const baseUrl = resolvePublicBaseUrl(req);
  const verificationUrl = `${baseUrl}/verify/${row.certificate_id}`;
  const qrDataUrl = await QRCode.toDataURL(verificationUrl, {
    width: 300,
    margin: 1,
    color: { dark: '#0F172A', light: '#FFFFFF' },
  });

  const skills = db
    .prepare(`SELECT skill_name, source FROM student_skills WHERE student_id = ? ORDER BY source DESC, id ASC`)
    .all(Number(row.student_id));

  const directorName = (
    db.prepare(`SELECT value FROM platform_settings WHERE key = 'director_name'`).get() as { value: string } | undefined
  )?.value || 'ENG.Ruben B. Rudovick';
  const directorTitle = (
    db.prepare(`SELECT value FROM platform_settings WHERE key = 'director_title'`).get() as { value: string } | undefined
  )?.value || 'Academic Director, TechTalkHub';

  const photoPath = (row.student_photo_snapshot || row.current_photo_path || null) as string | null;

  res.json({
    status: resultStatus,
    certificate: {
      certificate_id: row.certificate_id,
      certificate_type: row.certificate_type,
      level: row.level,
      score: row.score,
      issue_date: row.issue_date,
      status: row.status,
      revoked_at: row.revoked_at,
      revocation_reason: row.revocation_reason,
      verification_url: verificationUrl,
      qr_code_data: qrDataUrl,
      template_code: row.template_code,
      template_name: row.template_name,
      accent_color: row.accent_color,
      is_demo: Boolean(row.is_demo),
      student_name: row.student_name,
      student_username: row.student_username,
      student_headline: row.student_headline,
      student_photo_url: photoPath ? `/api/uploads/avatars/${path.basename(photoPath)}` : null,
      public_profile_enabled: Boolean(row.public_profile_enabled),
      course_title: row.course_title,
      course_code: row.course_code,
      course_slug: row.course_slug,
      category_name: row.category_name,
      duration_hours: row.duration_hours,
      instructor_name: row.instructor_name,
      instructor_title: row.instructor_title,
      director_name: directorName,
      director_title: directorTitle,
      verified_skills: skills,
    },
  });
});

publicRouter.get('/certificates/:certificateId/pdf', async (req, res) => {
  const rawId = decodeURIComponent(req.params.certificateId || '').trim().toUpperCase();
  const row = db
    .prepare(
      `SELECT cert.*,
              COALESCE(NULLIF(cert.recipient_name, ''), sp.full_name, u.email, 'TechTalkHub Recipient') as student_name,
              sp.photo_path as current_photo_path,
              c.title as course_title, c.course_code, c.duration_hours,
              ct.code as template_code,
              COALESCE(i.full_name, 'TechTalkHub Faculty') as instructor_name,
              COALESCE(i.title, 'Course Instructor') as instructor_title
       FROM certificates cert
       LEFT JOIN users u ON cert.student_id = u.id
       LEFT JOIN student_profiles sp ON sp.user_id = cert.student_id
       JOIN courses c ON cert.course_id = c.id
       JOIN certificate_templates ct ON cert.template_id = ct.id
       LEFT JOIN instructors i ON c.instructor_id = i.id
       WHERE UPPER(cert.certificate_id) = ?`
    )
    .get(rawId) as Record<string, unknown> | undefined;

  if (!row) {
    res.status(404).json({ error: 'Certificate not found.' });
    return;
  }

  const directorName = (
    db.prepare(`SELECT value FROM platform_settings WHERE key = 'director_name'`).get() as { value: string } | undefined
  )?.value || 'ENG.Ruben B. Rudovick';
  const directorTitle = (
    db.prepare(`SELECT value FROM platform_settings WHERE key = 'director_title'`).get() as { value: string } | undefined
  )?.value || 'Academic Director, TechTalkHub';

  const baseUrl = resolvePublicBaseUrl(req);
  const verificationUrl = `${baseUrl}/verify/${row.certificate_id}`;

  logAudit(null, 'CERTIFICATE_DOWNLOADED', 'certificate', String(row.certificate_id));

  await streamCertificatePdf(res, {
    certificate_id: String(row.certificate_id),
    certificate_type: String(row.certificate_type),
    level: String(row.level),
    score: Number(row.score),
    issue_date: String(row.issue_date),
    status: String(row.status),
    verification_url: verificationUrl,
    template_code: String(row.template_code),
    student_name: String(row.student_name),
    student_photo_path: (row.student_photo_snapshot || row.current_photo_path || null) as string | null,
    course_title: String(row.course_title),
    course_code: String(row.course_code),
    duration_hours: Number(row.duration_hours),
    instructor_name: String(row.instructor_name),
    instructor_title: String(row.instructor_title),
    director_name: directorName,
    director_title: directorTitle,
  });
});

publicRouter.get('/profile/:username', (req, res) => {
  const username = String(req.params.username || '').trim().toLowerCase();
  const profile = db
    .prepare(
      `SELECT sp.*, u.email, u.created_at as member_since, u.is_demo
       FROM student_profiles sp
       JOIN users u ON sp.user_id = u.id
       WHERE LOWER(sp.username) = ? AND u.is_active = 1`
    )
    .get(username) as Record<string, unknown> | undefined;

  if (!profile || Number(profile.public_profile_enabled) !== 1) {
    res.status(404).json({ error: 'Public learner profile not found or set to private.' });
    return;
  }

  const showContact = Number(profile.show_contact_publicly) === 1;

  const certificates = db
    .prepare(
      `SELECT cert.certificate_id, cert.certificate_type, cert.level, cert.score,
              cert.issue_date, cert.status, cert.is_demo,
              c.title as course_title, c.slug as course_slug, c.duration_hours,
              cat.name as category_name
       FROM certificates cert
       JOIN courses c ON cert.course_id = c.id
       JOIN categories cat ON c.category_id = cat.id
       WHERE cert.student_id = ?
       ORDER BY cert.issue_date DESC`
    )
    .all(Number(profile.user_id));

  const completedCourses = db
    .prepare(
      `SELECT c.title, c.slug, c.level, c.duration_hours, e.completed_at, cat.name as category_name
       FROM enrollments e
       JOIN courses c ON e.course_id = c.id
       JOIN categories cat ON c.category_id = cat.id
       WHERE e.student_id = ? AND e.status = 'completed'
       ORDER BY e.completed_at DESC`
    )
    .all(Number(profile.user_id));

  const skills = db
    .prepare(`SELECT skill_name, source FROM student_skills WHERE student_id = ? ORDER BY source DESC, id ASC`)
    .all(Number(profile.user_id));

  res.json({
    profile: {
      username: profile.username,
      full_name: profile.full_name,
      headline: profile.headline,
      bio: profile.bio,
      country: profile.country,
      city: profile.city,
      photo_url: profile.photo_path ? `/api/uploads/avatars/${path.basename(String(profile.photo_path))}` : null,
      member_since: profile.member_since,
      is_demo: Boolean(profile.is_demo),
      email: showContact ? profile.email : null,
      phone: showContact ? profile.phone : null,
    },
    certificates,
    completedCourses,
    skills,
  });
});

publicRouter.get('/uploads/avatars/:filename', (req, res) => {
  const filename = path.basename(req.params.filename || '');
  if (!filename || !/^[a-zA-Z0-9._-]+$/.test(filename)) {
    res.status(400).json({ error: 'Invalid file name.' });
    return;
  }
  const resolved = path.resolve(AVATAR_UPLOAD_DIR, filename);
  if (!resolved.startsWith(AVATAR_UPLOAD_DIR + path.sep) || !fs.existsSync(resolved)) {
    res.status(404).json({ error: 'Photo not found.' });
    return;
  }
  res.sendFile(resolved);
});

publicRouter.get('/public/settings', (_req, res) => {
  const keys = [
    'platform_name',
    'tagline',
    'director_name',
    'director_title',
    'contact_email',
    'support_phone',
    'website_url',
    'default_timezone',
  ];
  const rows = db
    .prepare(
      `SELECT key, value FROM platform_settings WHERE key IN (${keys.map(() => '?').join(',')})`
    )
    .all(...keys) as Array<{ key: string; value: string }>;
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json({ settings });
});

publicRouter.post('/contact', contactLimiter, (req, res) => {
  const { name, email, subject, message } = req.body as {
    name?: string;
    email?: string;
    subject?: string;
    message?: string;
  };

  if (!name || name.trim().length < 2) {
    res.status(400).json({ error: 'Please provide your full name.' });
    return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    res.status(400).json({ error: 'Please provide a valid email address.' });
    return;
  }
  if (!subject || subject.trim().length < 3) {
    res.status(400).json({ error: 'Please include a subject for your inquiry.' });
    return;
  }
  if (!message || message.trim().length < 10) {
    res.status(400).json({ error: 'Please provide a message of at least 10 characters.' });
    return;
  }

  const info = db
    .prepare(
      `INSERT INTO contact_messages (name, email, subject, message) VALUES (?, ?, ?, ?)`
    )
    .run(name.trim(), email.trim().toLowerCase(), subject.trim(), message.trim());

  logAudit(null, 'CONTACT_MESSAGE_SUBMITTED', 'contact_message', Number(info.lastInsertRowid), {
    email: email.trim().toLowerCase(),
    subject: subject.trim(),
  });

  res.status(201).json({
    ok: true,
    id: Number(info.lastInsertRowid),
    message: 'Your inquiry has been recorded. Our team will respond via the platform contact email.',
  });
});
