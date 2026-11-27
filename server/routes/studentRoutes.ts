import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { AuthenticatedRequest, logAudit, requireAuth } from '../auth';
import {
  checkCertificateEligibility,
  issueCertificateRecord,
  resolvePublicBaseUrl,
} from '../certificates';
import { AVATAR_UPLOAD_DIR, db } from '../db';

export const studentRouter = Router();

studentRouter.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB limit
});

function detectImageType(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length < 12) return null;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  ) {
    return 'png';
  }
  // WebP: RIFF....WEBP
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

studentRouter.get('/student/dashboard', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;

  const profile = db
    .prepare(`SELECT * FROM student_profiles WHERE user_id = ?`)
    .get(userId) as Record<string, unknown> | undefined;

  const enrollments = db
    .prepare(
      `SELECT e.*, c.title, c.slug, c.course_code, c.level, c.duration_hours, c.thumbnail_url,
              cat.name as category_name,
              ll.title as last_lesson_title,
              (SELECT COUNT(*) FROM lessons l JOIN course_modules m ON l.module_id = m.id WHERE m.course_id = c.id) as total_lessons,
              (SELECT COUNT(*) FROM lesson_progress lp JOIN lessons l ON lp.lesson_id = l.id JOIN course_modules m ON l.module_id = m.id WHERE m.course_id = c.id AND lp.student_id = ? AND lp.completed = 1) as completed_lessons
       FROM enrollments e
       JOIN courses c ON e.course_id = c.id
       JOIN categories cat ON c.category_id = cat.id
       LEFT JOIN lessons ll ON e.last_lesson_id = ll.id
       WHERE e.student_id = ?
       ORDER BY e.enrolled_at DESC`
    )
    .all(userId, userId);

  const certificates = db
    .prepare(
      `SELECT cert.*, c.title as course_title, c.course_code, c.duration_hours, ct.name as template_name
       FROM certificates cert
       JOIN courses c ON cert.course_id = c.id
       JOIN certificate_templates ct ON cert.template_id = ct.id
       WHERE cert.student_id = ?
       ORDER BY cert.issue_date DESC`
    )
    .all(userId);

  const recentAttempts = db
    .prepare(
      `SELECT aa.*, c.title as course_title, c.slug as course_slug, a.title as assessment_title
       FROM assessment_attempts aa
       JOIN courses c ON aa.course_id = c.id
       JOIN assessments a ON aa.assessment_id = a.id
       WHERE aa.student_id = ?
       ORDER BY aa.submitted_at DESC
       LIMIT 10`
    )
    .all(userId);

  res.json({
    profile: profile
      ? {
          ...profile,
          photo_url: profile.photo_path
            ? `/api/uploads/avatars/${path.basename(String(profile.photo_path))}`
            : null,
        }
      : null,
    enrollments,
    certificates,
    recentAttempts,
  });
});

studentRouter.get('/student/profile', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const user = db
    .prepare(`SELECT id, email, role, email_verified, created_at FROM users WHERE id = ?`)
    .get(userId) as Record<string, unknown>;
  const profile = db
    .prepare(`SELECT * FROM student_profiles WHERE user_id = ?`)
    .get(userId) as Record<string, unknown> | undefined;
  const skills = db
    .prepare(`SELECT id, skill_name, source FROM student_skills WHERE student_id = ? ORDER BY source DESC, id ASC`)
    .all(userId);

  const completionChecks = [
    Boolean(profile?.full_name && String(profile.full_name).trim().length >= 2),
    Boolean(profile?.username && String(profile.username).trim().length >= 3),
    Boolean(profile?.photo_path),
    Boolean(profile?.phone && String(profile.phone).trim()),
    Boolean(profile?.country && String(profile.country).trim()),
    Boolean(profile?.city && String(profile.city).trim()),
    Boolean(profile?.headline && String(profile.headline).trim()),
    Boolean(profile?.bio && String(profile.bio).trim()),
    skills.length > 0,
    Boolean(user?.email_verified),
  ];
  const profileCompletionPercent = Math.round(
    (completionChecks.filter(Boolean).length / completionChecks.length) * 100
  );

  res.json({
    user,
    profile: profile
      ? {
          ...profile,
          photo_url: profile.photo_path
            ? `/api/uploads/avatars/${path.basename(String(profile.photo_path))}`
            : null,
          public_profile_enabled: Boolean(profile.public_profile_enabled),
          show_contact_publicly: Boolean(profile.show_contact_publicly),
        }
      : null,
    skills,
    profileCompletionPercent,
  });
});

studentRouter.put('/student/profile', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const {
    fullName,
    username,
    phone,
    country,
    city,
    headline,
    bio,
    publicProfileEnabled,
    showContactPublicly,
    skills,
  } = req.body as {
    fullName?: string;
    username?: string;
    phone?: string;
    country?: string;
    city?: string;
    headline?: string;
    bio?: string;
    publicProfileEnabled?: boolean;
    showContactPublicly?: boolean;
    skills?: string[];
  };

  if (!fullName || fullName.trim().length < 2) {
    res.status(400).json({ error: 'Full name must be at least 2 characters.' });
    return;
  }

  const cleanUsername = (username || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);

  if (cleanUsername.length < 3) {
    res.status(400).json({ error: 'Username must be at least 3 valid characters.' });
    return;
  }

  const clash = db
    .prepare(`SELECT user_id FROM student_profiles WHERE username = ? AND user_id != ?`)
    .get(cleanUsername, userId);
  if (clash) {
    res.status(409).json({ error: 'That username is already taken.' });
    return;
  }

  db.prepare(
    `INSERT INTO student_profiles (
       user_id, username, full_name, phone, country, city, headline, bio,
       public_profile_enabled, show_contact_publicly
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       username = excluded.username,
       full_name = excluded.full_name,
       phone = excluded.phone,
       country = excluded.country,
       city = excluded.city,
       headline = excluded.headline,
       bio = excluded.bio,
       public_profile_enabled = excluded.public_profile_enabled,
       show_contact_publicly = excluded.show_contact_publicly,
       updated_at = datetime('now')`
  ).run(
    userId,
    cleanUsername,
    fullName.trim(),
    (phone || '').trim(),
    (country || '').trim(),
    (city || '').trim(),
    (headline || 'TechTalkHub Learner').trim(),
    (bio || '').trim(),
    publicProfileEnabled === false ? 0 : 1,
    showContactPublicly ? 1 : 0
  );

  if (Array.isArray(skills)) {
    db.prepare(`DELETE FROM student_skills WHERE student_id = ? AND source = 'self'`).run(userId);
    const ins = db.prepare(
      `INSERT OR IGNORE INTO student_skills (student_id, skill_name, source) VALUES (?, ?, 'self')`
    );
    for (const s of skills.slice(0, 20)) {
      const clean = String(s || '').trim();
      if (clean) ins.run(userId, clean);
    }
  }

  logAudit(userId, 'PROFILE_UPDATED', 'student_profile', userId);
  res.json({ ok: true, message: 'Profile saved successfully.' });
});

studentRouter.post(
  '/student/profile/photo',
  upload.single('photo'),
  (req: AuthenticatedRequest, res) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Please select an image file to upload.' });
      return;
    }

    const detected = detectImageType(file.buffer);
    if (!detected) {
      res.status(400).json({
        error: 'Unsupported image format. Please upload a valid JPG, JPEG, PNG, or WebP photo.',
      });
      return;
    }

    const userId = req.user!.id;
    const filename = `avatar_${userId}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${detected}`;
    const targetPath = path.resolve(AVATAR_UPLOAD_DIR, filename);

    if (!targetPath.startsWith(AVATAR_UPLOAD_DIR + path.sep)) {
      res.status(400).json({ error: 'Invalid upload destination.' });
      return;
    }

    const existing = db
      .prepare(`SELECT photo_path FROM student_profiles WHERE user_id = ?`)
      .get(userId) as { photo_path: string | null } | undefined;

    fs.writeFileSync(targetPath, file.buffer);

    if (existing?.photo_path) {
      const oldResolved = path.resolve(AVATAR_UPLOAD_DIR, path.basename(existing.photo_path));
      if (oldResolved.startsWith(AVATAR_UPLOAD_DIR + path.sep) && fs.existsSync(oldResolved)) {
        try {
          fs.unlinkSync(oldResolved);
        } catch {
          // ignore cleanup failure
        }
      }
    }

    if (!existing) {
      const userRow = db
        .prepare(`SELECT email FROM users WHERE id = ?`)
        .get(userId) as { email: string } | undefined;
      const baseSlug = (userRow?.email?.split('@')[0] || `user${userId}`)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .slice(0, 24);
      const uniqueUsername = `${baseSlug || 'user'}-${userId}`;
      db.prepare(
        `INSERT OR IGNORE INTO student_profiles (user_id, username, full_name, headline, photo_path)
         VALUES (?, ?, ?, 'TechTalkHub Learner', ?)`
      ).run(userId, uniqueUsername, userRow?.email?.split('@')[0] || 'TechTalkHub User', filename);
    } else {
      db.prepare(
        `UPDATE student_profiles SET photo_path = ?, updated_at = datetime('now') WHERE user_id = ?`
      ).run(filename, userId);
    }

    logAudit(userId, 'PROFILE_PHOTO_UPLOADED', 'student_profile', userId, { filename });
    res.json({
      ok: true,
      photo_url: `/api/uploads/avatars/${filename}`,
    });
  }
);

studentRouter.delete('/student/profile/photo', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const existing = db
    .prepare(`SELECT photo_path FROM student_profiles WHERE user_id = ?`)
    .get(userId) as { photo_path: string | null } | undefined;

  if (existing?.photo_path) {
    const resolved = path.resolve(AVATAR_UPLOAD_DIR, path.basename(existing.photo_path));
    if (resolved.startsWith(AVATAR_UPLOAD_DIR + path.sep) && fs.existsSync(resolved)) {
      try {
        fs.unlinkSync(resolved);
      } catch {
        // ignore
      }
    }
  }

  db.prepare(
    `UPDATE student_profiles SET photo_path = NULL, updated_at = datetime('now') WHERE user_id = ?`
  ).run(userId);
  res.json({ ok: true });
});

studentRouter.post('/student/courses/:courseId/enroll', (req: AuthenticatedRequest, res) => {
  const courseId = Number(req.params.courseId);
  const userId = req.user!.id;

  const course = db
    .prepare(`SELECT id, title, status FROM courses WHERE id = ? AND status = 'published'`)
    .get(courseId) as { id: number; title: string; status: string } | undefined;
  if (!course) {
    res.status(404).json({ error: 'Course not found or unavailable.' });
    return;
  }

  const existing = db
    .prepare(`SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?`)
    .get(userId, courseId);
  if (existing) {
    res.json({ enrollment: existing, alreadyEnrolled: true });
    return;
  }

  const info = db
    .prepare(
      `INSERT INTO enrollments (student_id, course_id, status, progress_percent)
       VALUES (?, ?, 'active', 0)`
    )
    .run(userId, courseId);

  logAudit(userId, 'COURSE_ENROLLED', 'course', courseId);
  res.status(201).json({
    enrollment: db.prepare(`SELECT * FROM enrollments WHERE id = ?`).get(info.lastInsertRowid),
  });
});

studentRouter.get('/student/courses/:slug/learn', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const course = db
    .prepare(
      `SELECT c.*, cat.name as category_name, COALESCE(i.full_name, 'TechTalkHub Faculty') as instructor_name
       FROM courses c
       JOIN categories cat ON c.category_id = cat.id
       LEFT JOIN instructors i ON c.instructor_id = i.id
       WHERE c.slug = ?`
    )
    .get(req.params.slug) as Record<string, unknown> | undefined;

  if (!course) {
    res.status(404).json({ error: 'Course not found.' });
    return;
  }

  const courseId = Number(course.id);
  const enrollment = db
    .prepare(`SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?`)
    .get(userId, courseId);

  if (!enrollment) {
    res.status(403).json({ error: 'Please enroll in this course to access lessons.' });
    return;
  }

  const modules = db
    .prepare(
      `SELECT * FROM course_modules WHERE course_id = ? AND COALESCE(is_published, 1) = 1 ORDER BY order_index ASC`
    )
    .all(courseId) as Array<Record<string, unknown>>;

  const lessonsStmt = db.prepare(
    `SELECT l.*,
            COALESCE(lp.completed, 0) as completed,
            COALESCE(lp.notes, '') as student_notes,
            lp.completed_at
     FROM lessons l
     LEFT JOIN lesson_progress lp ON lp.lesson_id = l.id AND lp.student_id = ?
     WHERE l.module_id = ?
     ORDER BY l.order_index ASC`
  );

  const enrichedModules = modules.map((m) => {
    const lessons = lessonsStmt.all(userId, Number(m.id)) as Array<Record<string, unknown>>;
    const completedCount = lessons.filter((l) => Number(l.completed) === 1).length;
    const modProgress = lessons.length > 0 ? Math.round((completedCount / lessons.length) * 100) : 100;
    return {
      ...m,
      progress_percent: modProgress,
      lessons: lessons.map((l) => ({
        ...l,
        completed: Boolean(l.completed),
      })),
    };
  });

  const assessment = db
    .prepare(
      `SELECT id, title, instructions, time_limit_minutes, max_attempts, pass_mark,
              (SELECT COUNT(*) FROM questions q WHERE q.assessment_id = assessments.id) as question_count
       FROM assessments WHERE course_id = ?`
    )
    .get(courseId);

  const attempts = db
    .prepare(
      `SELECT id, score_percent, correct_count, total_questions, passed, submitted_at
       FROM assessment_attempts
       WHERE student_id = ? AND course_id = ?
       ORDER BY submitted_at DESC`
    )
    .all(userId, courseId);

  const eligibility = checkCertificateEligibility(userId, courseId);

  res.json({
    course,
    enrollment,
    modules: enrichedModules,
    assessment: assessment || null,
    attempts,
    eligibility,
  });
});

studentRouter.post('/student/lessons/:lessonId/complete', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const lessonId = Number(req.params.lessonId);
  const completed = req.body.completed !== false;

  const lesson = db
    .prepare(
      `SELECT l.id, m.course_id FROM lessons l
       JOIN course_modules m ON l.module_id = m.id
       WHERE l.id = ?`
    )
    .get(lessonId) as { id: number; course_id: number } | undefined;

  if (!lesson) {
    res.status(404).json({ error: 'Lesson not found.' });
    return;
  }

  const enrollment = db
    .prepare(`SELECT id FROM enrollments WHERE student_id = ? AND course_id = ?`)
    .get(userId, lesson.course_id);
  if (!enrollment) {
    res.status(403).json({ error: 'You are not enrolled in this course.' });
    return;
  }

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO lesson_progress (student_id, lesson_id, completed, completed_at)
       VALUES (?, ?, ?, CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END)
       ON CONFLICT(student_id, lesson_id) DO UPDATE SET
         completed = excluded.completed,
         completed_at = excluded.completed_at`
    ).run(userId, lessonId, completed ? 1 : 0, completed ? 1 : 0);

    const total = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM lessons l
           JOIN course_modules m ON l.module_id = m.id
           WHERE m.course_id = ?`
        )
        .get(lesson.course_id) as { c: number }
    ).c;

    const done = (
      db
        .prepare(
          `SELECT COUNT(*) as c FROM lesson_progress lp
           JOIN lessons l ON lp.lesson_id = l.id
           JOIN course_modules m ON l.module_id = m.id
           WHERE m.course_id = ? AND lp.student_id = ? AND lp.completed = 1`
        )
        .get(lesson.course_id, userId) as { c: number }
    ).c;

    const pct = total > 0 ? Math.round((done / total) * 100) : 100;
    const status = pct === 100 ? 'completed' : 'active';
    db.prepare(
      `UPDATE enrollments
       SET progress_percent = ?, status = ?, last_lesson_id = ?,
           completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, datetime('now')) ELSE NULL END
       WHERE student_id = ? AND course_id = ?`
    ).run(pct, status, lessonId, status, userId, lesson.course_id);

    return { progressPercent: pct, completedLessons: done, totalLessons: total, status };
  });

  const progress = tx();
  const eligibility = checkCertificateEligibility(userId, lesson.course_id);
  res.json({ ok: true, progress, eligibility });
});

studentRouter.post('/student/lessons/:lessonId/notes', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const lessonId = Number(req.params.lessonId);
  const notes = String(req.body.notes || '');

  db.prepare(
    `INSERT INTO lesson_progress (student_id, lesson_id, completed, notes)
     VALUES (?, ?, 0, ?)
     ON CONFLICT(student_id, lesson_id) DO UPDATE SET notes = excluded.notes`
  ).run(userId, lessonId, notes);

  res.json({ ok: true });
});

studentRouter.post('/student/lessons/:lessonId/view', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const lessonId = Number(req.params.lessonId);
  const lesson = db
    .prepare(
      `SELECT l.id, m.course_id FROM lessons l
       JOIN course_modules m ON l.module_id = m.id
       WHERE l.id = ?`
    )
    .get(lessonId) as { id: number; course_id: number } | undefined;
  if (!lesson) {
    res.status(404).json({ error: 'Lesson not found.' });
    return;
  }
  db.prepare(
    `UPDATE enrollments SET last_lesson_id = ? WHERE student_id = ? AND course_id = ?`
  ).run(lessonId, userId, lesson.course_id);
  res.json({ ok: true });
});

studentRouter.get('/student/assessments/:courseId', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const courseId = Number(req.params.courseId);

  const enrollment = db
    .prepare(`SELECT * FROM enrollments WHERE student_id = ? AND course_id = ?`)
    .get(userId, courseId);
  if (!enrollment) {
    res.status(403).json({ error: 'Enroll in the course before taking the assessment.' });
    return;
  }

  const assessment = db
    .prepare(`SELECT * FROM assessments WHERE course_id = ?`)
    .get(courseId) as Record<string, unknown> | undefined;
  if (!assessment) {
    res.status(404).json({ error: 'No assessment configured for this course yet.' });
    return;
  }

  const attempts = db
    .prepare(
      `SELECT id, score_percent, correct_count, total_questions, passed, submitted_at
       FROM assessment_attempts WHERE student_id = ? AND assessment_id = ? ORDER BY submitted_at DESC`
    )
    .all(userId, Number(assessment.id));

  let questions = db
    .prepare(
      `SELECT id, question_text, question_type, options_json, points, order_index
       FROM questions WHERE assessment_id = ? ORDER BY order_index ASC`
    )
    .all(Number(assessment.id)) as Array<{
    id: number;
    question_text: string;
    question_type: string;
    options_json: string;
    points: number;
    order_index: number;
  }>;

  if (Number(assessment.randomize_questions) === 1) {
    questions = shuffleArray(questions);
  }

  const formattedQuestions = questions.map((q) => {
    let options: string[] = [];
    try {
      options = JSON.parse(q.options_json);
    } catch {
      options = [];
    }
    if (Number(assessment.randomize_options) === 1 && q.question_type !== 'true_false') {
      options = shuffleArray(options);
    }
    return {
      id: q.id,
      question_text: q.question_text,
      question_type: q.question_type,
      options,
      points: q.points,
    };
  });

  res.json({
    assessment,
    attempts,
    attemptsUsed: attempts.length,
    maxAttempts: Number(assessment.max_attempts),
    questions: formattedQuestions,
  });
});

studentRouter.post('/student/assessments/:courseId/submit', async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const courseId = Number(req.params.courseId);
  const answersInput = (req.body.answers || {}) as Record<string, string[]>;

  const assessment = db
    .prepare(`SELECT * FROM assessments WHERE course_id = ?`)
    .get(courseId) as Record<string, unknown> | undefined;
  if (!assessment) {
    res.status(404).json({ error: 'Assessment not found.' });
    return;
  }

  const attemptsUsed = (
    db
      .prepare(
        `SELECT COUNT(*) as c FROM assessment_attempts WHERE student_id = ? AND assessment_id = ?`
      )
      .get(userId, Number(assessment.id)) as { c: number }
  ).c;

  if (attemptsUsed >= Number(assessment.max_attempts)) {
    res.status(400).json({
      error: `Maximum attempts (${assessment.max_attempts}) reached for this assessment.`,
    });
    return;
  }

  const questions = db
    .prepare(`SELECT * FROM questions WHERE assessment_id = ? ORDER BY order_index ASC`)
    .all(Number(assessment.id)) as Array<{
    id: number;
    question_text: string;
    correct_answers_json: string;
    explanation: string;
    points: number;
  }>;

  if (questions.length === 0) {
    res.status(400).json({ error: 'This assessment has no questions yet.' });
    return;
  }

  let correctCount = 0;
  let earnedPoints = 0;
  let totalPoints = 0;

  const breakdown = questions.map((q) => {
    totalPoints += q.points || 1;
    let correctAnswers: string[] = [];
    try {
      correctAnswers = JSON.parse(q.correct_answers_json);
    } catch {
      correctAnswers = [];
    }
    const selected = Array.isArray(answersInput[String(q.id)])
      ? answersInput[String(q.id)].map(String)
      : [];

    const normExpected = [...correctAnswers].map((s) => s.trim()).sort();
    const normSelected = [...new Set(selected.map((s) => s.trim()))].sort();

    const isCorrect =
      normExpected.length > 0 &&
      normExpected.length === normSelected.length &&
      normExpected.every((val, idx) => val === normSelected[idx]);

    if (isCorrect) {
      correctCount += 1;
      earnedPoints += q.points || 1;
    }

    return {
      questionId: q.id,
      questionText: q.question_text,
      selectedAnswers: normSelected,
      correctAnswers: normExpected,
      isCorrect,
      explanation: q.explanation,
    };
  });

  const scorePercent = totalPoints > 0 ? Math.round((earnedPoints / totalPoints) * 100) : 0;
  const passMark = Number(assessment.pass_mark || 70);
  const passed = scorePercent >= passMark;

  const attemptId = db.transaction(() => {
    const att = db
      .prepare(
        `INSERT INTO assessment_attempts (assessment_id, student_id, course_id, score_percent, correct_count, total_questions, passed)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        Number(assessment.id),
        userId,
        courseId,
        scorePercent,
        correctCount,
        questions.length,
        passed ? 1 : 0
      );
    const id = Number(att.lastInsertRowid);
    const insAns = db.prepare(
      `INSERT INTO assessment_answers (attempt_id, question_id, selected_answers_json, is_correct)
       VALUES (?, ?, ?, ?)`
    );
    for (const item of breakdown) {
      insAns.run(id, item.questionId, JSON.stringify(item.selectedAnswers), item.isCorrect ? 1 : 0);
    }
    return id;
  })();

  logAudit(userId, 'ASSESSMENT_SUBMITTED', 'assessment', Number(assessment.id), {
    courseId,
    scorePercent,
    passed,
  });

  let issuedCertificate = null;
  let needsPhoto = false;
  let eligibility = checkCertificateEligibility(userId, courseId);

  if (passed && eligibility.eligible) {
    issuedCertificate = await issueCertificateRecord({
      studentId: userId,
      courseId,
      attemptId,
      score: scorePercent,
      baseUrl: resolvePublicBaseUrl(req),
    });
    eligibility = checkCertificateEligibility(userId, courseId);
  } else if (passed && eligibility.photoRequired && !eligibility.hasPhoto && eligibility.progressPercent === 100) {
    needsPhoto = true;
  }

  const showAnswersSetting = (
    db
      .prepare(`SELECT value FROM platform_settings WHERE key = 'show_answers_after_submit'`)
      .get() as { value: string } | undefined
  )?.value;
  const showAnswersAfterSubmit = showAnswersSetting !== 'false';

  const visibleBreakdown = showAnswersAfterSubmit
    ? breakdown
    : breakdown.map((item) => ({
        questionId: item.questionId,
        questionText: item.questionText,
        selectedAnswers: item.selectedAnswers,
        isCorrect: item.isCorrect,
      }));

  res.json({
    attemptId,
    scorePercent,
    correctCount,
    totalQuestions: questions.length,
    passMark,
    passed,
    showAnswersAfterSubmit,
    breakdown: visibleBreakdown,
    eligibility,
    issuedCertificate,
    needsPhoto,
  });
});

studentRouter.post('/student/courses/:courseId/claim-certificate', async (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const courseId = Number(req.params.courseId);

  const eligibility = checkCertificateEligibility(userId, courseId);
  if (eligibility.existingCertificateId) {
    const existing = db
      .prepare(`SELECT * FROM certificates WHERE certificate_id = ?`)
      .get(eligibility.existingCertificateId);
    res.json({ certificate: existing });
    return;
  }

  if (!eligibility.eligible) {
    res.status(400).json({
      error: eligibility.reasons[0] || 'Certificate eligibility requirements are not yet satisfied.',
      eligibility,
    });
    return;
  }

  const bestAttempt = db
    .prepare(
      `SELECT id, score_percent FROM assessment_attempts
       WHERE student_id = ? AND course_id = ? AND passed = 1
       ORDER BY score_percent DESC LIMIT 1`
    )
    .get(userId, courseId) as { id: number; score_percent: number } | undefined;

  const certificate = await issueCertificateRecord({
    studentId: userId,
    courseId,
    attemptId: bestAttempt?.id ?? null,
    score: bestAttempt?.score_percent ?? eligibility.bestScore ?? 100,
    baseUrl: resolvePublicBaseUrl(req),
  });

  res.status(201).json({ certificate });
});

studentRouter.get('/student/certificates', (req: AuthenticatedRequest, res) => {
  const userId = req.user!.id;
  const rows = db
    .prepare(
      `SELECT cert.*, c.title as course_title, c.course_code, c.duration_hours, c.slug as course_slug,
              cat.name as category_name, ct.name as template_name, ct.code as template_code,
              COALESCE(NULLIF(cert.recipient_name, ''), sp.full_name, u.email, 'TechTalkHub Recipient') as student_name,
              sp.photo_path as current_photo_path
       FROM certificates cert
       JOIN courses c ON cert.course_id = c.id
       JOIN categories cat ON c.category_id = cat.id
       JOIN certificate_templates ct ON cert.template_id = ct.id
       LEFT JOIN users u ON u.id = cert.student_id
       LEFT JOIN student_profiles sp ON sp.user_id = cert.student_id
       WHERE cert.student_id = ?
       ORDER BY cert.issue_date DESC`
    )
    .all(userId) as Array<Record<string, unknown>>;

  res.json({
    certificates: rows.map((r) => {
      const effectivePhoto = r.student_photo_snapshot || r.current_photo_path;
      return {
        ...r,
        student_photo_url: effectivePhoto
          ? `/api/uploads/avatars/${path.basename(String(effectivePhoto))}`
          : null,
      };
    }),
  });
});
