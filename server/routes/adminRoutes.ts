import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import PDFDocument from 'pdfkit';
import {
  AuthenticatedRequest,
  hashPassword,
  logAudit,
  requireAuth,
  requireRole,
} from '../auth';
import { issueCertificateRecord, replaceCertificateRecord, resolvePublicBaseUrl } from '../certificates';
import { AVATAR_UPLOAD_DIR, db } from '../db';

export const adminRouter = Router();

const certPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

function detectImageType(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

adminRouter.use(requireAuth);
adminRouter.use(requireRole('admin', 'instructor'));

function isInstructorAllowed(userId: number, perm: 'can_edit_courses' | 'can_create_lessons' | 'can_create_assessments' | 'can_view_reports'): boolean {
  const row = db
    .prepare(`SELECT ${perm} as allowed FROM instructors WHERE user_id = ?`)
    .get(userId) as { allowed: number } | undefined;
  return Boolean(row && row.allowed === 1);
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

// Overview Stats & Charts (calculated strictly from actual DB records)
adminRouter.get('/admin/stats', (req: AuthenticatedRequest, res) => {
  if (req.user!.role === 'instructor' && !isInstructorAllowed(req.user!.id, 'can_view_reports')) {
    res.status(403).json({ error: 'Report access is disabled for your instructor account.' });
    return;
  }

  const totalStudents = (db.prepare(`SELECT COUNT(*) as c FROM users WHERE role = 'student'`).get() as { c: number }).c;
  const totalCourses = (db.prepare(`SELECT COUNT(*) as c FROM courses`).get() as { c: number }).c;
  const activeCourses = (db.prepare(`SELECT COUNT(*) as c FROM courses WHERE status = 'published'`).get() as { c: number }).c;
  const certificatesIssued = (db.prepare(`SELECT COUNT(*) as c FROM certificates`).get() as { c: number }).c;
  const certificatesValid = (db.prepare(`SELECT COUNT(*) as c FROM certificates WHERE status = 'VALID'`).get() as { c: number }).c;
  const certificatesRevoked = (db.prepare(`SELECT COUNT(*) as c FROM certificates WHERE status = 'REVOKED'`).get() as { c: number }).c;
  const certificatesVerified = (db.prepare(`SELECT COUNT(*) as c FROM verification_logs`).get() as { c: number }).c;
  const totalEnrollments = (db.prepare(`SELECT COUNT(*) as c FROM enrollments`).get() as { c: number }).c;
  const completedCourses = (db.prepare(`SELECT COUNT(*) as c FROM enrollments WHERE status = 'completed'`).get() as { c: number }).c;

  const activeStudents = (
    db
      .prepare(`SELECT COUNT(DISTINCT student_id) as c FROM enrollments`)
      .get() as { c: number }
  ).c;
  const validVerifications = (
    db.prepare(`SELECT COUNT(*) as c FROM verification_logs WHERE result = 'VALID'`).get() as { c: number }
  ).c;
  const invalidVerifications = (
    db.prepare(`SELECT COUNT(*) as c FROM verification_logs WHERE result != 'VALID'`).get() as { c: number }
  ).c;

  // Real category enrollment distribution
  const enrollmentsByCategory = db
    .prepare(
      `SELECT cat.name as label, COUNT(e.id) as value
       FROM categories cat
       LEFT JOIN courses c ON c.category_id = cat.id
       LEFT JOIN enrollments e ON e.course_id = c.id
       GROUP BY cat.id
       ORDER BY value DESC, cat.display_order ASC`
    )
    .all();

  const verificationBreakdown = db
    .prepare(
      `SELECT result as label, COUNT(*) as value
       FROM verification_logs
       GROUP BY result`
    )
    .all();

  const registrationsByDay = db
    .prepare(
      `SELECT substr(created_at, 1, 10) as date, COUNT(*) as count
       FROM users WHERE role = 'student'
       GROUP BY substr(created_at, 1, 10)
       ORDER BY date DESC LIMIT 14`
    )
    .all();

  const certsByDay = db
    .prepare(
      `SELECT substr(issue_date, 1, 10) as date, COUNT(*) as count
       FROM certificates
       GROUP BY substr(issue_date, 1, 10)
       ORDER BY date DESC LIMIT 14`
    )
    .all();

  const mostVerifiedCertificates = db
    .prepare(
      `SELECT vl.certificate_id, COUNT(*) as verifications,
              COALESCE(NULLIF(cert.recipient_name, ''), sp.full_name, u.email, 'TechTalkHub Recipient') as student_name,
              c.title as course_title, cert.status
       FROM verification_logs vl
       LEFT JOIN certificates cert ON vl.certificate_record_id = cert.id
       LEFT JOIN users u ON cert.student_id = u.id
       LEFT JOIN student_profiles sp ON cert.student_id = sp.user_id
       LEFT JOIN courses c ON cert.course_id = c.id
       WHERE vl.certificate_record_id IS NOT NULL
       GROUP BY vl.certificate_id
       ORDER BY verifications DESC
       LIMIT 5`
    )
    .all();

  res.json({
    cards: {
      totalStudents,
      activeStudents,
      totalCourses,
      activeCourses,
      certificatesIssued,
      certificatesValid,
      certificatesVerified,
      validVerifications,
      invalidVerifications,
      certificatesRevoked,
      totalEnrollments,
      completedCourses,
    },
    charts: {
      enrollmentsByCategory,
      verificationBreakdown,
      registrationsByDay,
      certsByDay,
      mostVerifiedCertificates,
    },
  });
});

// Students Management (Admin only)
adminRouter.get('/admin/students', requireRole('admin'), (_req, res) => {
  const students = db
    .prepare(
      `SELECT u.id, u.email, u.email_verified, u.is_active, u.is_demo, u.created_at,
              sp.username, sp.full_name, sp.phone, sp.country, sp.city, sp.photo_path,
              (SELECT COUNT(*) FROM enrollments e WHERE e.student_id = u.id) as enrollment_count,
              (SELECT COUNT(*) FROM enrollments e WHERE e.student_id = u.id AND e.status = 'completed') as completed_count,
              (SELECT COUNT(*) FROM certificates cert WHERE cert.student_id = u.id AND cert.status = 'VALID') as certificate_count
       FROM users u
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       WHERE u.role = 'student'
       ORDER BY u.created_at DESC`
    )
    .all() as Array<Record<string, unknown>>;

  res.json({
    students: students.map((s) => ({
      ...s,
      photo_url: s.photo_path ? `/api/uploads/avatars/${path.basename(String(s.photo_path))}` : null,
      email_verified: Boolean(s.email_verified),
      is_active: Boolean(s.is_active),
      is_demo: Boolean(s.is_demo),
    })),
  });
});

adminRouter.patch('/admin/students/:id', requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const studentId = Number(req.params.id);
  const { isActive, emailVerified } = req.body as {
    isActive?: boolean;
    emailVerified?: boolean;
  };
  if (typeof isActive === 'boolean') {
    db.prepare(`UPDATE users SET is_active = ?, updated_at = datetime('now') WHERE id = ? AND role = 'student'`)
      .run(isActive ? 1 : 0, studentId);
  }
  if (typeof emailVerified === 'boolean') {
    db.prepare(`UPDATE users SET email_verified = ?, updated_at = datetime('now') WHERE id = ? AND role = 'student'`)
      .run(emailVerified ? 1 : 0, studentId);
  }
  logAudit(req.user!.id, 'STUDENT_UPDATED', 'user', studentId, { isActive, emailVerified });
  res.json({ ok: true });
});

// Instructors Management (Admin only)
adminRouter.get('/admin/instructors', requireRole('admin'), (_req, res) => {
  const instructors = db
    .prepare(
      `SELECT i.*, u.email, u.is_active,
              (SELECT COUNT(*) FROM courses c WHERE c.instructor_id = i.id) as course_count
       FROM instructors i
       LEFT JOIN users u ON i.user_id = u.id
       ORDER BY i.id ASC`
    )
    .all();
  res.json({ instructors });
});

adminRouter.post('/admin/instructors', requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const { email, password, fullName, title, specialty, bio, permissions } = req.body as {
    email?: string;
    password?: string;
    fullName?: string;
    title?: string;
    specialty?: string;
    bio?: string;
    permissions?: {
      canEditCourses?: boolean;
      canCreateLessons?: boolean;
      canCreateAssessments?: boolean;
      canViewReports?: boolean;
    };
  };

  if (!email || !password || password.length < 8 || !fullName) {
    res.status(400).json({ error: 'Full name, email, and password (min 8 chars) are required.' });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (db.prepare(`SELECT id FROM users WHERE email = ?`).get(normalizedEmail)) {
    res.status(409).json({ error: 'An account with this email already exists.' });
    return;
  }

  const instId = db.transaction(() => {
    const uRes = db
      .prepare(
        `INSERT INTO users (email, password_hash, role, email_verified, is_active, is_demo)
         VALUES (?, ?, 'instructor', 1, 1, 0)`
      )
      .run(normalizedEmail, hashPassword(password));
    const userId = Number(uRes.lastInsertRowid);
    const iRes = db
      .prepare(
        `INSERT INTO instructors (
           user_id, full_name, title, specialty, bio,
           can_edit_courses, can_create_lessons, can_create_assessments, can_view_reports, is_demo
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
      )
      .run(
        userId,
        fullName.trim(),
        (title || 'Technology Instructor').trim(),
        (specialty || 'Computing & IT').trim(),
        (bio || '').trim(),
        permissions?.canEditCourses === false ? 0 : 1,
        permissions?.canCreateLessons === false ? 0 : 1,
        permissions?.canCreateAssessments === false ? 0 : 1,
        permissions?.canViewReports === false ? 0 : 1
      );
    return Number(iRes.lastInsertRowid);
  })();

  logAudit(req.user!.id, 'INSTRUCTOR_CREATED', 'instructor', instId, { email: normalizedEmail });
  res.status(201).json({ instructor: db.prepare(`SELECT * FROM instructors WHERE id = ?`).get(instId) });
});

adminRouter.patch('/admin/instructors/:id', requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const {
    canEditCourses,
    canCreateLessons,
    canCreateAssessments,
    canViewReports,
    title,
    specialty,
  } = req.body as Record<string, unknown>;

  const current = db.prepare(`SELECT * FROM instructors WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!current) {
    res.status(404).json({ error: 'Instructor not found.' });
    return;
  }

  db.prepare(
    `UPDATE instructors SET
       title = ?, specialty = ?,
       can_edit_courses = ?, can_create_lessons = ?, can_create_assessments = ?, can_view_reports = ?
     WHERE id = ?`
  ).run(
    typeof title === 'string' ? title : current.title,
    typeof specialty === 'string' ? specialty : current.specialty,
    typeof canEditCourses === 'boolean' ? (canEditCourses ? 1 : 0) : current.can_edit_courses,
    typeof canCreateLessons === 'boolean' ? (canCreateLessons ? 1 : 0) : current.can_create_lessons,
    typeof canCreateAssessments === 'boolean' ? (canCreateAssessments ? 1 : 0) : current.can_create_assessments,
    typeof canViewReports === 'boolean' ? (canViewReports ? 1 : 0) : current.can_view_reports,
    id
  );

  logAudit(req.user!.id, 'INSTRUCTOR_PERMISSIONS_UPDATED', 'instructor', id);
  res.json({ ok: true });
});

// Categories CRUD (Admin only)
adminRouter.get('/admin/categories', (_req, res) => {
  const categories = db
    .prepare(
      `SELECT cat.*, COUNT(c.id) as course_count
       FROM categories cat
       LEFT JOIN courses c ON c.category_id = cat.id
       GROUP BY cat.id
       ORDER BY cat.display_order ASC, cat.id ASC`
    )
    .all();
  res.json({ categories });
});

adminRouter.post('/admin/categories', requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const { name, description, displayOrder } = req.body as {
    name?: string;
    description?: string;
    displayOrder?: number;
  };
  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Category name is required.' });
    return;
  }
  const slug = slugify(name);
  const info = db
    .prepare(
      `INSERT INTO categories (name, slug, description, display_order, is_demo) VALUES (?, ?, ?, ?, 0)`
    )
    .run(name.trim(), slug, (description || '').trim(), Number(displayOrder || 99));
  logAudit(req.user!.id, 'CATEGORY_CREATED', 'category', Number(info.lastInsertRowid));
  res.status(201).json({ category: db.prepare(`SELECT * FROM categories WHERE id = ?`).get(info.lastInsertRowid) });
});

adminRouter.delete('/admin/categories/:id', requireRole('admin'), (req, res) => {
  const id = Number(req.params.id);
  const count = (db.prepare(`SELECT COUNT(*) as c FROM courses WHERE category_id = ?`).get(id) as { c: number }).c;
  if (count > 0) {
    res.status(400).json({ error: 'Cannot delete category while courses remain assigned to it.' });
    return;
  }
  db.prepare(`DELETE FROM categories WHERE id = ?`).run(id);
  res.json({ ok: true });
});

// Courses CRUD (Admin + Permitted Instructors)
adminRouter.get('/admin/courses', (req: AuthenticatedRequest, res) => {
  let whereClause = '1=1';
  const params: Array<number> = [];
  if (req.user!.role === 'instructor') {
    const inst = db.prepare(`SELECT id FROM instructors WHERE user_id = ?`).get(req.user!.id) as { id: number } | undefined;
    if (inst) {
      whereClause = 'c.instructor_id = ?';
      params.push(inst.id);
    }
  }
  const courses = db
    .prepare(
      `SELECT c.*, cat.name as category_name, COALESCE(i.full_name, 'Unassigned') as instructor_name,
              ct.name as template_name,
              (SELECT COUNT(*) FROM course_modules m WHERE m.course_id = c.id) as module_count,
              (SELECT COUNT(*) FROM lessons l JOIN course_modules m ON l.module_id = m.id WHERE m.course_id = c.id) as lesson_count,
              (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) as enrollment_count
       FROM courses c
       JOIN categories cat ON c.category_id = cat.id
       LEFT JOIN instructors i ON c.instructor_id = i.id
       LEFT JOIN certificate_templates ct ON c.template_id = ct.id
       WHERE ${whereClause}
       ORDER BY c.id DESC`
    )
    .all(...params);
  res.json({ courses });
});

adminRouter.post('/admin/courses', requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const {
    categoryId,
    instructorId,
    title,
    courseCode,
    level,
    shortDescription,
    description,
    requirements,
    learningObjectives,
    durationHours,
    passMark,
    certificateType,
    templateId,
    thumbnailUrl,
    status,
  } = req.body as Record<string, unknown>;

  if (!title || !courseCode || !categoryId || !level || !description) {
    res.status(400).json({ error: 'Title, course code, category, level, and description are required.' });
    return;
  }

  const cleanSlug = `${slugify(String(title))}-${Date.now().toString(36).slice(-4)}`;
  const info = db
    .prepare(
      `INSERT INTO courses (
         category_id, instructor_id, title, slug, course_code, level,
         short_description, description, requirements, learning_objectives, duration_hours, pass_mark,
         certificate_type, template_id, thumbnail_url, status, is_demo
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    )
    .run(
      Number(categoryId),
      instructorId ? Number(instructorId) : null,
      String(title).trim(),
      cleanSlug,
      String(courseCode).trim().toUpperCase(),
      String(level),
      String(shortDescription || String(description).trim().slice(0, 160)).trim(),
      String(description).trim(),
      String(requirements || '').trim(),
      JSON.stringify(Array.isArray(learningObjectives) ? learningObjectives : []),
      Number(durationHours || 20),
      Number(passMark || 70),
      String(certificateType || 'Certificate of Completion'),
      Number(templateId || 1),
      String(thumbnailUrl || '/src/assets/images/course_web_cyber_1795780020210.jpg'),
      String(status || 'published')
    );

  const courseId = Number(info.lastInsertRowid);
  // Create default assessment container
  db.prepare(
    `INSERT INTO assessments (course_id, title, pass_mark) VALUES (?, ?, ?)`
  ).run(courseId, `${String(title).trim()} — Final Assessment`, Number(passMark || 70));

  logAudit(req.user!.id, 'COURSE_CREATED', 'course', courseId, { title });
  res.status(201).json({ course: db.prepare(`SELECT * FROM courses WHERE id = ?`).get(courseId) });
});

adminRouter.put('/admin/courses/:id', (req: AuthenticatedRequest, res) => {
  if (req.user!.role === 'instructor' && !isInstructorAllowed(req.user!.id, 'can_edit_courses')) {
    res.status(403).json({ error: 'You do not have permission to edit courses.' });
    return;
  }
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT * FROM courses WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Course not found.' });
    return;
  }

  const b = req.body as Record<string, unknown>;
  db.prepare(
    `UPDATE courses SET
       category_id = ?, instructor_id = ?, title = ?, level = ?,
       short_description = ?, description = ?, requirements = ?,
       learning_objectives = ?, duration_hours = ?, pass_mark = ?,
       certificate_type = ?, template_id = ?, status = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    b.categoryId ? Number(b.categoryId) : existing.category_id,
    b.instructorId !== undefined ? (b.instructorId ? Number(b.instructorId) : null) : existing.instructor_id,
    b.title ? String(b.title).trim() : existing.title,
    b.level ? String(b.level) : existing.level,
    b.shortDescription !== undefined ? String(b.shortDescription).trim() : existing.short_description,
    b.description ? String(b.description).trim() : existing.description,
    b.requirements !== undefined ? String(b.requirements).trim() : existing.requirements,
    Array.isArray(b.learningObjectives) ? JSON.stringify(b.learningObjectives) : existing.learning_objectives,
    b.durationHours ? Number(b.durationHours) : existing.duration_hours,
    b.passMark ? Number(b.passMark) : existing.pass_mark,
    b.certificateType ? String(b.certificateType) : existing.certificate_type,
    b.templateId ? Number(b.templateId) : existing.template_id,
    b.status ? String(b.status) : existing.status,
    id
  );

  logAudit(req.user!.id, 'COURSE_UPDATED', 'course', id);
  res.json({ ok: true });
});

adminRouter.post('/admin/courses/:id/duplicate', requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const sourceId = Number(req.params.id);
  const src = db.prepare(`SELECT * FROM courses WHERE id = ?`).get(sourceId) as Record<string, unknown> | undefined;
  if (!src) {
    res.status(404).json({ error: 'Course not found.' });
    return;
  }

  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  const newTitle = `${String(src.title)} (Copy)`;
  const newSlug = `${slugify(newTitle)}-${suffix.toLowerCase()}`;
  const newCode = `${String(src.course_code)}-${suffix}`;

  const newCourseId = db.transaction(() => {
    const cRes = db
      .prepare(
        `INSERT INTO courses (
           category_id, instructor_id, title, slug, course_code, level,
           short_description, description, requirements, learning_objectives,
           duration_hours, pass_mark, certificate_type, template_id, thumbnail_url, status, is_demo
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 0)`
      )
      .run(
        src.category_id,
        src.instructor_id,
        newTitle,
        newSlug,
        newCode,
        src.level,
        src.short_description || '',
        src.description,
        src.requirements || '',
        src.learning_objectives,
        src.duration_hours,
        src.pass_mark,
        src.certificate_type,
        src.template_id,
        src.thumbnail_url
      );
    const createdId = Number(cRes.lastInsertRowid);

    const modules = db
      .prepare(`SELECT * FROM course_modules WHERE course_id = ? ORDER BY order_index ASC`)
      .all(sourceId) as Array<Record<string, unknown>>;
    const lessonStmt = db.prepare(`SELECT * FROM lessons WHERE module_id = ? ORDER BY order_index ASC`);
    for (const m of modules) {
      const mRes = db
        .prepare(
          `INSERT INTO course_modules (course_id, title, description, order_index, is_published)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(createdId, m.title, m.description || '', m.order_index, m.is_published ?? 1);
      const newModId = Number(mRes.lastInsertRowid);
      const lessons = lessonStmt.all(Number(m.id)) as Array<Record<string, unknown>>;
      for (const l of lessons) {
        db.prepare(
          `INSERT INTO lessons (module_id, title, content_markdown, video_url, attachment_name, notes, duration_minutes, order_index)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          newModId,
          l.title,
          l.content_markdown || '',
          l.video_url || '',
          l.attachment_name || '',
          l.notes || '',
          l.duration_minutes || 20,
          l.order_index || 1
        );
      }
    }

    const srcAssess = db
      .prepare(`SELECT * FROM assessments WHERE course_id = ?`)
      .get(sourceId) as Record<string, unknown> | undefined;
    if (srcAssess) {
      const aRes = db
        .prepare(
          `INSERT INTO assessments (course_id, title, instructions, assessment_type, time_limit_minutes, max_attempts, pass_mark, randomize_questions, randomize_options)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          createdId,
          srcAssess.title,
          srcAssess.instructions || '',
          srcAssess.assessment_type || 'final',
          srcAssess.time_limit_minutes || 30,
          srcAssess.max_attempts || 3,
          srcAssess.pass_mark || 70,
          srcAssess.randomize_questions ?? 1,
          srcAssess.randomize_options ?? 1
        );
      const newAssessId = Number(aRes.lastInsertRowid);
      const qs = db
        .prepare(`SELECT * FROM questions WHERE assessment_id = ? ORDER BY order_index ASC`)
        .all(Number(srcAssess.id)) as Array<Record<string, unknown>>;
      for (const q of qs) {
        db.prepare(
          `INSERT INTO questions (assessment_id, question_text, question_type, options_json, correct_answers_json, explanation, points, order_index)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          newAssessId,
          q.question_text,
          q.question_type,
          q.options_json,
          q.correct_answers_json,
          q.explanation || '',
          q.points || 1,
          q.order_index || 1
        );
      }
    }
    return createdId;
  })();

  logAudit(req.user!.id, 'COURSE_DUPLICATED', 'course', newCourseId, { sourceId });
  res.status(201).json({ course: db.prepare(`SELECT * FROM courses WHERE id = ?`).get(newCourseId) });
});

adminRouter.delete('/admin/courses/:id', requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  db.prepare(`DELETE FROM courses WHERE id = ?`).run(id);
  logAudit(req.user!.id, 'COURSE_DELETED', 'course', id);
  res.json({ ok: true });
});

// Modules & Lessons CRUD
adminRouter.get('/admin/courses/:courseId/curriculum', (req, res) => {
  const courseId = Number(req.params.courseId);
  const modules = db
    .prepare(`SELECT * FROM course_modules WHERE course_id = ? ORDER BY order_index ASC`)
    .all(courseId) as Array<Record<string, unknown>>;
  const lessonStmt = db.prepare(`SELECT * FROM lessons WHERE module_id = ? ORDER BY order_index ASC`);
  const enriched = modules.map((m) => ({
    ...m,
    lessons: lessonStmt.all(Number(m.id)),
  }));
  const assessment = db.prepare(`SELECT * FROM assessments WHERE course_id = ?`).get(courseId) as Record<string, unknown> | undefined;
  const questions = assessment
    ? db.prepare(`SELECT * FROM questions WHERE assessment_id = ? ORDER BY order_index ASC`).all(Number(assessment.id))
    : [];
  res.json({ modules: enriched, assessment: assessment || null, questions });
});

adminRouter.post('/admin/modules', (req: AuthenticatedRequest, res) => {
  if (req.user!.role === 'instructor' && !isInstructorAllowed(req.user!.id, 'can_create_lessons')) {
    res.status(403).json({ error: 'Permission denied.' });
    return;
  }
  const { courseId, title, description, orderIndex } = req.body as {
    courseId: number;
    title: string;
    description?: string;
    orderIndex?: number;
  };
  if (!courseId || !title) {
    res.status(400).json({ error: 'Course ID and module title are required.' });
    return;
  }
  const info = db
    .prepare(`INSERT INTO course_modules (course_id, title, description, order_index) VALUES (?, ?, ?, ?)`)
    .run(courseId, title.trim(), (description || '').trim(), Number(orderIndex || 1));
  res.status(201).json({ module: db.prepare(`SELECT * FROM course_modules WHERE id = ?`).get(info.lastInsertRowid) });
});

adminRouter.patch('/admin/modules/:id', (req: AuthenticatedRequest, res) => {
  if (req.user!.role === 'instructor' && !isInstructorAllowed(req.user!.id, 'can_create_lessons')) {
    res.status(403).json({ error: 'Permission denied.' });
    return;
  }
  const id = Number(req.params.id);
  const current = db.prepare(`SELECT * FROM course_modules WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!current) {
    res.status(404).json({ error: 'Module not found.' });
    return;
  }
  const { title, description, orderIndex, isPublished } = req.body as {
    title?: string;
    description?: string;
    orderIndex?: number;
    isPublished?: boolean;
  };
  db.prepare(
    `UPDATE course_modules SET title = ?, description = ?, order_index = ?, is_published = ? WHERE id = ?`
  ).run(
    typeof title === 'string' && title.trim() ? title.trim() : current.title,
    typeof description === 'string' ? description.trim() : current.description,
    typeof orderIndex === 'number' ? orderIndex : current.order_index,
    typeof isPublished === 'boolean' ? (isPublished ? 1 : 0) : (current.is_published ?? 1),
    id
  );
  res.json({ module: db.prepare(`SELECT * FROM course_modules WHERE id = ?`).get(id) });
});

adminRouter.delete('/admin/modules/:id', (req: AuthenticatedRequest, res) => {
  if (req.user!.role === 'instructor' && !isInstructorAllowed(req.user!.id, 'can_create_lessons')) {
    res.status(403).json({ error: 'Permission denied.' });
    return;
  }
  db.prepare(`DELETE FROM course_modules WHERE id = ?`).run(Number(req.params.id));
  res.json({ ok: true });
});

adminRouter.post('/admin/lessons', (req: AuthenticatedRequest, res) => {
  if (req.user!.role === 'instructor' && !isInstructorAllowed(req.user!.id, 'can_create_lessons')) {
    res.status(403).json({ error: 'Permission denied.' });
    return;
  }
  const { moduleId, title, contentMarkdown, videoUrl, attachmentName, notes, durationMinutes, orderIndex } = req.body as Record<string, unknown>;
  if (!moduleId || !title) {
    res.status(400).json({ error: 'Module ID and lesson title are required.' });
    return;
  }
  const info = db
    .prepare(
      `INSERT INTO lessons (module_id, title, content_markdown, video_url, attachment_name, notes, duration_minutes, order_index)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      Number(moduleId),
      String(title).trim(),
      String(contentMarkdown || ''),
      String(videoUrl || ''),
      String(attachmentName || ''),
      String(notes || ''),
      Number(durationMinutes || 20),
      Number(orderIndex || 1)
    );
  res.status(201).json({ lesson: db.prepare(`SELECT * FROM lessons WHERE id = ?`).get(info.lastInsertRowid) });
});

adminRouter.delete('/admin/lessons/:id', (req: AuthenticatedRequest, res) => {
  if (req.user!.role === 'instructor' && !isInstructorAllowed(req.user!.id, 'can_create_lessons')) {
    res.status(403).json({ error: 'Permission denied.' });
    return;
  }
  db.prepare(`DELETE FROM lessons WHERE id = ?`).run(Number(req.params.id));
  res.json({ ok: true });
});

// Assessments & Questions
adminRouter.put('/admin/assessments/:courseId', (req: AuthenticatedRequest, res) => {
  if (req.user!.role === 'instructor' && !isInstructorAllowed(req.user!.id, 'can_create_assessments')) {
    res.status(403).json({ error: 'Permission denied.' });
    return;
  }
  const courseId = Number(req.params.courseId);
  const {
    title,
    instructions,
    assessmentType,
    timeLimitMinutes,
    maxAttempts,
    passMark,
    randomizeQuestions,
    randomizeOptions,
  } = req.body as Record<string, unknown>;

  db.prepare(
    `INSERT INTO assessments (course_id, title, instructions, assessment_type, time_limit_minutes, max_attempts, pass_mark, randomize_questions, randomize_options)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(course_id) DO UPDATE SET
       title = excluded.title,
       instructions = excluded.instructions,
       assessment_type = excluded.assessment_type,
       time_limit_minutes = excluded.time_limit_minutes,
       max_attempts = excluded.max_attempts,
       pass_mark = excluded.pass_mark,
       randomize_questions = excluded.randomize_questions,
       randomize_options = excluded.randomize_options`
  ).run(
    courseId,
    String(title || 'Course Final Assessment'),
    String(instructions || ''),
    ['final', 'module', 'practice'].includes(String(assessmentType)) ? String(assessmentType) : 'final',
    Number(timeLimitMinutes || 30),
    Number(maxAttempts || 3),
    Number(passMark || 70),
    randomizeQuestions === false ? 0 : 1,
    randomizeOptions === false ? 0 : 1
  );
  res.json({ ok: true });
});

adminRouter.post('/admin/questions', (req: AuthenticatedRequest, res) => {
  if (req.user!.role === 'instructor' && !isInstructorAllowed(req.user!.id, 'can_create_assessments')) {
    res.status(403).json({ error: 'Permission denied.' });
    return;
  }
  const { assessmentId, questionText, questionType, options, correctAnswers, explanation, points } = req.body as {
    assessmentId: number;
    questionText: string;
    questionType: 'mcq_single' | 'mcq_multi' | 'true_false';
    options: string[];
    correctAnswers: string[];
    explanation?: string;
    points?: number;
  };
  if (!assessmentId || !questionText || !Array.isArray(options) || !Array.isArray(correctAnswers) || correctAnswers.length === 0) {
    res.status(400).json({ error: 'Question text, options, and at least one correct answer are required.' });
    return;
  }
  const info = db
    .prepare(
      `INSERT INTO questions (assessment_id, question_text, question_type, options_json, correct_answers_json, explanation, points, order_index)
       VALUES (?, ?, ?, ?, ?, ?, ?, 99)`
    )
    .run(
      assessmentId,
      questionText.trim(),
      questionType || 'mcq_single',
      JSON.stringify(options),
      JSON.stringify(correctAnswers),
      (explanation || '').trim(),
      Number(points || 1)
    );
  res.status(201).json({ question: db.prepare(`SELECT * FROM questions WHERE id = ?`).get(info.lastInsertRowid) });
});

adminRouter.delete('/admin/questions/:id', (req: AuthenticatedRequest, res) => {
  if (req.user!.role === 'instructor' && !isInstructorAllowed(req.user!.id, 'can_create_assessments')) {
    res.status(403).json({ error: 'Permission denied.' });
    return;
  }
  db.prepare(`DELETE FROM questions WHERE id = ?`).run(Number(req.params.id));
  res.json({ ok: true });
});

// Enrollments & Results
adminRouter.get('/admin/enrollments', (_req, res) => {
  const enrollments = db
    .prepare(
      `SELECT e.*, sp.full_name as student_name, u.email as student_email,
              c.title as course_title, c.course_code, c.level
       FROM enrollments e
       JOIN users u ON e.student_id = u.id
       JOIN student_profiles sp ON sp.user_id = u.id
       JOIN courses c ON e.course_id = c.id
       ORDER BY e.enrolled_at DESC`
    )
    .all();
  res.json({ enrollments });
});

adminRouter.get('/admin/results', (_req, res) => {
  const results = db
    .prepare(
      `SELECT aa.*, sp.full_name as student_name, u.email as student_email,
              c.title as course_title, c.course_code, a.pass_mark
       FROM assessment_attempts aa
       JOIN users u ON aa.student_id = u.id
       JOIN student_profiles sp ON sp.user_id = u.id
       JOIN courses c ON aa.course_id = c.id
       JOIN assessments a ON aa.assessment_id = a.id
       ORDER BY aa.submitted_at DESC`
    )
    .all();
  res.json({ results });
});

// Certificates Management (Admin only)
adminRouter.get('/admin/certificates', requireRole('admin'), (_req, res) => {
  const certificates = db
    .prepare(
      `SELECT cert.*,
              COALESCE(NULLIF(cert.recipient_name, ''), sp.full_name, u.email, 'TechTalkHub Recipient') as student_name,
              sp.username as student_username,
              sp.photo_path as current_photo_path,
              u.email as student_email,
              c.title as course_title, c.course_code, c.duration_hours,
              ct.name as template_name, ct.code as template_code
       FROM certificates cert
       LEFT JOIN users u ON cert.student_id = u.id
       LEFT JOIN student_profiles sp ON sp.user_id = u.id
       JOIN courses c ON cert.course_id = c.id
       JOIN certificate_templates ct ON cert.template_id = ct.id
       ORDER BY cert.created_at DESC`
    )
    .all() as Array<Record<string, unknown>>;

  res.json({
    certificates: certificates.map((c) => {
      const effectivePhoto = c.student_photo_snapshot || c.current_photo_path;
      return {
        ...c,
        student_photo_url: effectivePhoto
          ? `/api/uploads/avatars/${path.basename(String(effectivePhoto))}`
          : null,
        is_demo: Boolean(c.is_demo),
      };
    }),
  });
});

adminRouter.post(
  '/admin/certificates/upload-photo',
  requireRole('admin'),
  certPhotoUpload.single('photo'),
  (req: AuthenticatedRequest, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Please select a graduate photo file (JPG, PNG, or WebP).' });
      return;
    }
    const ext = detectImageType(req.file.buffer);
    if (!ext) {
      res.status(400).json({ error: 'Unsupported file format. Upload a valid JPG, PNG, or WebP image.' });
      return;
    }

    const filename = `cert-recipient-${crypto.randomBytes(10).toString('hex')}.${ext}`;
    const target = path.resolve(AVATAR_UPLOAD_DIR, filename);
    if (!target.startsWith(AVATAR_UPLOAD_DIR + path.sep)) {
      res.status(400).json({ error: 'Invalid upload destination.' });
      return;
    }
    fs.writeFileSync(target, req.file.buffer);

    logAudit(req.user!.id, 'CERTIFICATE_PHOTO_UPLOADED', 'certificate_photo', filename);
    res.json({
      ok: true,
      photoFilename: filename,
      photoUrl: `/api/uploads/avatars/${filename}`,
    });
  }
);

adminRouter.post('/admin/certificates/issue', requireRole('admin'), async (req: AuthenticatedRequest, res) => {
  const {
    studentId,
    courseId,
    score,
    certificateType,
    templateId,
    overridePhotoRequirement,
    directMode,
    recipientName,
    recipientPhotoPath,
    issueDate,
  } = req.body as {
    studentId?: number;
    courseId: number;
    score?: number;
    certificateType?: string;
    templateId?: number;
    overridePhotoRequirement?: boolean;
    directMode?: boolean;
    recipientName?: string;
    recipientPhotoPath?: string;
    issueDate?: string;
  };

  if (!courseId) {
    res.status(400).json({ error: 'Please select a course for this certificate.' });
    return;
  }

  const isDirect = Boolean(directMode || !studentId);
  if (isDirect && !recipientName?.trim()) {
    res.status(400).json({ error: 'Please enter the recipient full name for the certificate.' });
    return;
  }

  let validatedPhotoFilename: string | null = null;
  if (recipientPhotoPath?.trim()) {
    const cleanName = path.basename(recipientPhotoPath.trim());
    const resolved = path.resolve(AVATAR_UPLOAD_DIR, cleanName);
    if (resolved.startsWith(AVATAR_UPLOAD_DIR + path.sep) && fs.existsSync(resolved)) {
      validatedPhotoFilename = cleanName;
    }
  }

  if (isDirect && !validatedPhotoFilename) {
    res.status(400).json({
      error: 'Graduate photo (Picha ya Mhitimu) is required before issuing a certificate.',
    });
    return;
  }

  if (!isDirect && !validatedPhotoFilename) {
    const studentProfile = db
      .prepare(`SELECT photo_path FROM student_profiles WHERE user_id = ?`)
      .get(Number(studentId)) as { photo_path: string | null } | undefined;
    if (!studentProfile?.photo_path) {
      res.status(400).json({
        error: 'Graduate photo (Picha ya Mhitimu) is required. Please upload a photo before issuing.',
      });
      return;
    }
  }

  try {
    const cert = await issueCertificateRecord({
      studentId: isDirect ? req.user!.id : Number(studentId),
      courseId: Number(courseId),
      score: Number(score ?? 95),
      certificateType,
      templateId: templateId ? Number(templateId) : undefined,
      issuedBy: req.user!.id,
      recipientName: isDirect ? recipientName?.trim() : undefined,
      recipientPhotoPath: validatedPhotoFilename,
      issueDate,
      baseUrl: resolvePublicBaseUrl(req),
      bypassEligibility: isDirect || Boolean(overridePhotoRequirement),
      throwIfDuplicate: !isDirect,
    });
    res.status(201).json({ certificate: cert });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to issue certificate.' });
  }
});

adminRouter.post('/admin/certificates/:id/replace', requireRole('admin'), async (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const reason = String(req.body.reason || 'Reissued and replaced by TechTalkHub Administration.').trim();
  try {
    const newCert = await replaceCertificateRecord({
      oldCertificateDbId: id,
      adminUserId: req.user!.id,
      baseUrl: resolvePublicBaseUrl(req),
      reason,
    });
    res.status(201).json({ certificate: newCert });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to replace certificate.' });
  }
});

adminRouter.post('/admin/certificates/:id/revoke', requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const reason = String(req.body.reason || 'Revoked by TechTalkHub Certification Administration.').trim();
  const existing = db.prepare(`SELECT certificate_id FROM certificates WHERE id = ?`).get(id) as { certificate_id: string } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Certificate not found.' });
    return;
  }

  db.prepare(
    `UPDATE certificates
     SET status = 'REVOKED', revoked_at = datetime('now'), revoked_by = ?, revocation_reason = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(req.user!.id, reason, id);

  logAudit(req.user!.id, 'CERTIFICATE_REVOKED', 'certificate', existing.certificate_id, { reason });
  res.json({ ok: true });
});

adminRouter.post('/admin/certificates/:id/reinstate', requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare(`SELECT certificate_id FROM certificates WHERE id = ?`).get(id) as { certificate_id: string } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Certificate not found.' });
    return;
  }
  db.prepare(
    `UPDATE certificates
     SET status = 'VALID', revoked_at = NULL, revoked_by = NULL, revocation_reason = NULL, updated_at = datetime('now')
     WHERE id = ?`
  ).run(id);
  logAudit(req.user!.id, 'CERTIFICATE_REINSTATED', 'certificate', existing.certificate_id);
  res.json({ ok: true });
});

// Certificate Templates
adminRouter.get('/admin/templates', (_req, res) => {
  const templates = db.prepare(`SELECT * FROM certificate_templates ORDER BY id ASC`).all();
  res.json({ templates });
});

adminRouter.put('/admin/templates/:id', requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const id = Number(req.params.id);
  const { name, description, accentColor, isDefault } = req.body as {
    name?: string;
    description?: string;
    accentColor?: string;
    isDefault?: boolean;
  };
  if (isDefault) {
    db.prepare(`UPDATE certificate_templates SET is_default = 0`).run();
  }
  db.prepare(
    `UPDATE certificate_templates
     SET name = COALESCE(?, name), description = COALESCE(?, description),
         accent_color = COALESCE(?, accent_color), is_default = COALESCE(?, is_default)
     WHERE id = ?`
  ).run(name ?? null, description ?? null, accentColor ?? null, typeof isDefault === 'boolean' ? (isDefault ? 1 : 0) : null, id);
  logAudit(req.user!.id, 'TEMPLATE_UPDATED', 'certificate_template', id);
  res.json({ ok: true });
});

// Verification Logs & Audit Logs
adminRouter.get('/admin/verification-logs', requireRole('admin'), (_req, res) => {
  const logs = db
    .prepare(
      `SELECT vl.*, c.status as current_status
       FROM verification_logs vl
       LEFT JOIN certificates c ON vl.certificate_record_id = c.id
       ORDER BY vl.verified_at DESC
       LIMIT 200`
    )
    .all();
  res.json({ logs });
});

adminRouter.get('/admin/audit-logs', requireRole('admin'), (_req, res) => {
  const logs = db
    .prepare(
      `SELECT al.*, u.email as actor_email
       FROM audit_logs al
       LEFT JOIN users u ON al.actor_user_id = u.id
       ORDER BY al.created_at DESC
       LIMIT 200`
    )
    .all();
  res.json({ logs });
});

// Reports & Exports (CSV / PDF)
adminRouter.get('/admin/reports', requireRole('admin'), (_req, res) => {
  const coursePerformance = db
    .prepare(
      `SELECT c.id, c.title, c.course_code, c.level,
              COUNT(DISTINCT e.id) as enrollments,
              COUNT(DISTINCT CASE WHEN e.status = 'active' THEN e.id END) as active_students,
              COUNT(DISTINCT CASE WHEN e.status = 'completed' THEN e.id END) as completions,
              ROUND(
                CASE WHEN COUNT(DISTINCT e.id) > 0
                  THEN (COUNT(DISTINCT CASE WHEN e.status = 'completed' THEN e.id END) * 100.0) / COUNT(DISTINCT e.id)
                  ELSE 0 END, 1
              ) as completion_rate,
              ROUND(AVG(aa.score_percent), 1) as avg_score,
              ROUND(
                CASE WHEN COUNT(DISTINCT aa.id) > 0
                  THEN (COUNT(DISTINCT CASE WHEN aa.passed = 1 THEN aa.id END) * 100.0) / COUNT(DISTINCT aa.id)
                  ELSE 0 END, 1
              ) as pass_rate,
              COUNT(DISTINCT cert.id) as certificates_issued
       FROM courses c
       LEFT JOIN enrollments e ON e.course_id = c.id
       LEFT JOIN assessment_attempts aa ON aa.course_id = c.id
       LEFT JOIN certificates cert ON cert.course_id = c.id AND cert.status = 'VALID'
       GROUP BY c.id
       ORDER BY enrollments DESC, c.id ASC`
    )
    .all();

  const recentVerifications = db
    .prepare(`SELECT result, COUNT(*) as count FROM verification_logs GROUP BY result`)
    .all();

  const monthlyActivity = db
    .prepare(
      `SELECT substr(issue_date, 1, 7) as month, COUNT(*) as certificates
       FROM certificates
       GROUP BY substr(issue_date, 1, 7)
       ORDER BY month DESC LIMIT 6`
    )
    .all();

  res.json({ coursePerformance, recentVerifications, monthlyActivity });
});

adminRouter.get('/admin/contact-messages', requireRole('admin'), (_req, res) => {
  const messages = db
    .prepare(`SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 100`)
    .all();
  res.json({ messages });
});

adminRouter.get('/admin/reports/export', requireRole('admin'), (req, res) => {
  const format = String(req.query.format || 'csv').toLowerCase();
  const type = String(req.query.type || 'certificates').toLowerCase();

  let headers: string[] = [];
  let rows: Array<Array<string | number>> = [];
  let reportTitle = 'TechTalkHub Report';

  if (type === 'students') {
    reportTitle = 'TechTalkHub Student Registrations Report';
    headers = ['ID', 'Full Name', 'Username', 'Email', 'Country', 'Verified', 'Registered At'];
    const data = db
      .prepare(
        `SELECT u.id, sp.full_name, sp.username, u.email, sp.country, u.email_verified, u.created_at
         FROM users u LEFT JOIN student_profiles sp ON sp.user_id = u.id
         WHERE u.role = 'student' ORDER BY u.created_at DESC`
      )
      .all() as Array<Record<string, unknown>>;
    rows = data.map((d) => [
      Number(d.id),
      String(d.full_name || ''),
      String(d.username || ''),
      String(d.email || ''),
      String(d.country || ''),
      d.email_verified ? 'Yes' : 'No',
      String(d.created_at || ''),
    ]);
  } else if (type === 'verifications') {
    reportTitle = 'TechTalkHub Verification Activity Report';
    headers = ['Log ID', 'Certificate ID', 'Result', 'Verified At'];
    const data = db
      .prepare(`SELECT id, certificate_id, result, verified_at FROM verification_logs ORDER BY verified_at DESC LIMIT 500`)
      .all() as Array<Record<string, unknown>>;
    rows = data.map((d) => [Number(d.id), String(d.certificate_id), String(d.result), String(d.verified_at)]);
  } else {
    reportTitle = 'TechTalkHub Certificates Issued Report';
    headers = ['Certificate ID', 'Student', 'Course', 'Level', 'Score %', 'Status', 'Issue Date'];
    const data = db
      .prepare(
        `SELECT cert.certificate_id,
                COALESCE(NULLIF(cert.recipient_name, ''), sp.full_name, u.email, 'TechTalkHub Recipient') as full_name,
                c.title, cert.level, cert.score, cert.status, cert.issue_date
         FROM certificates cert
         LEFT JOIN users u ON u.id = cert.student_id
         LEFT JOIN student_profiles sp ON sp.user_id = cert.student_id
         JOIN courses c ON c.id = cert.course_id
         ORDER BY cert.issue_date DESC`
      )
      .all() as Array<Record<string, unknown>>;
    rows = data.map((d) => [
      String(d.certificate_id),
      String(d.full_name),
      String(d.title),
      String(d.level),
      Number(d.score),
      String(d.status),
      String(d.issue_date),
    ]);
  }

  if (format === 'pdf') {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="techtalkhub-${type}-report.pdf"`);
    doc.pipe(res);

    doc.font('Helvetica-Bold').fontSize(16).fillColor('#0F172A').text(reportTitle);
    doc.font('Helvetica').fontSize(9).fillColor('#64748B').text(`Generated: ${new Date().toISOString()}`);
    doc.moveDown(1);

    const colWidth = Math.floor(760 / headers.length);
    let y = doc.y;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#1D4ED8');
    headers.forEach((h, i) => {
      doc.text(h, 40 + i * colWidth, y, { width: colWidth - 6 });
    });
    y += 18;
    doc.moveTo(40, y - 4).lineTo(800, y - 4).strokeColor('#CBD5E1').stroke();

    doc.font('Helvetica').fontSize(8).fillColor('#0F172A');
    for (const row of rows.slice(0, 40)) {
      if (y > 530) {
        doc.addPage();
        y = 40;
      }
      row.forEach((cell, i) => {
        doc.text(String(cell), 40 + i * colWidth, y, { width: colWidth - 6, ellipsis: true });
      });
      y += 16;
    }
    doc.end();
    return;
  }

  // CSV format
  const escapeCsv = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;
  const csv = [headers.map(escapeCsv).join(','), ...rows.map((r) => r.map(escapeCsv).join(','))].join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="techtalkhub-${type}-report.csv"`);
  res.send(csv);
});

// Platform Settings & Demo Data Purge
adminRouter.get('/admin/settings', requireRole('admin'), (_req, res) => {
  const rows = db.prepare(`SELECT key, value FROM platform_settings`).all() as Array<{ key: string; value: string }>;
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  res.json({ settings });
});

adminRouter.put('/admin/settings', requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const updates = (req.body.settings || {}) as Record<string, string>;
  const stmt = db.prepare(
    `INSERT INTO platform_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`
  );
  for (const [k, v] of Object.entries(updates)) {
    stmt.run(k, String(v));
  }
  logAudit(req.user!.id, 'SETTINGS_UPDATED', 'platform_settings', 'global');
  res.json({ ok: true });
});

adminRouter.post('/admin/purge-demo-data', requireRole('admin'), (req: AuthenticatedRequest, res) => {
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM certificates WHERE is_demo = 1`).run();
    db.prepare(`DELETE FROM instructors WHERE is_demo = 1`).run();
    db.prepare(`DELETE FROM users WHERE is_demo = 1`).run();
    db.prepare(`UPDATE platform_settings SET value = 'false', updated_at = datetime('now') WHERE key = 'demo_data_present'`).run();
  });
  tx();
  logAudit(req.user!.id, 'DEMO_DATA_PURGED', 'system', 'demo');
  res.json({ ok: true, message: 'All sample demo student, instructor, and demo certificate records have been permanently deleted.' });
});
