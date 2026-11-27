import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Request, Response } from 'express';
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { AVATAR_UPLOAD_DIR, CERT_PDF_DIR, db } from './db';
import { logAudit } from './auth';

export function resolvePublicBaseUrl(req?: Request): string {
  const setting = db
    .prepare(`SELECT value FROM platform_settings WHERE key = 'verification_base_url'`)
    .get() as { value: string } | undefined;
  const configured = setting?.value?.trim();
  if (configured && configured.startsWith('http')) {
    return configured.replace(/\/+$/, '');
  }
  const envUrl = process.env.APP_URL?.trim();
  if (envUrl && envUrl !== 'MY_APP_URL' && envUrl.startsWith('http')) {
    return envUrl.replace(/\/+$/, '');
  }
  if (req) {
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
    if (host) {
      return `${proto}://${host}`;
    }
  }
  return 'http://localhost:3000';
}

export function generateUniqueCertificateId(courseCode: string): string {
  const cleanCode = courseCode
    .replace(/^TTH-/i, '')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase()
    .slice(0, 4) || 'TECH';
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 20; attempt++) {
    const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
    const candidate = `TTH-${cleanCode}-${year}-${suffix}`;
    const existing = db
      .prepare(`SELECT id FROM certificates WHERE certificate_id = ?`)
      .get(candidate);
    if (!existing) {
      return candidate;
    }
  }
  return `TTH-${cleanCode}-${year}-${Date.now().toString(36).toUpperCase()}`;
}

export interface EligibilityResult {
  eligible: boolean;
  progressPercent: number;
  completedLessons: number;
  totalLessons: number;
  assessmentPassed: boolean;
  bestScore: number | null;
  passMark: number;
  hasPhoto: boolean;
  photoRequired: boolean;
  existingCertificateId: string | null;
  reasons: string[];
}

export function checkCertificateEligibility(
  studentId: number,
  courseId: number
): EligibilityResult {
  const course = db
    .prepare(`SELECT id, pass_mark FROM courses WHERE id = ?`)
    .get(courseId) as { id: number; pass_mark: number } | undefined;

  if (!course) {
    return {
      eligible: false,
      progressPercent: 0,
      completedLessons: 0,
      totalLessons: 0,
      assessmentPassed: false,
      bestScore: null,
      passMark: 70,
      hasPhoto: false,
      photoRequired: true,
      existingCertificateId: null,
      reasons: ['Course not found.'],
    };
  }

  const totalLessonsRow = db
    .prepare(
      `SELECT COUNT(*) as c FROM lessons l
       JOIN course_modules m ON l.module_id = m.id
       WHERE m.course_id = ?`
    )
    .get(courseId) as { c: number };

  const completedLessonsRow = db
    .prepare(
      `SELECT COUNT(*) as c FROM lesson_progress lp
       JOIN lessons l ON lp.lesson_id = l.id
       JOIN course_modules m ON l.module_id = m.id
       WHERE m.course_id = ? AND lp.student_id = ? AND lp.completed = 1`
    )
    .get(courseId, studentId) as { c: number };

  const totalLessons = totalLessonsRow.c;
  const completedLessons = completedLessonsRow.c;
  const progressPercent =
    totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 100;

  const bestAttempt = db
    .prepare(
      `SELECT score_percent, passed FROM assessment_attempts
       WHERE student_id = ? AND course_id = ?
       ORDER BY passed DESC, score_percent DESC LIMIT 1`
    )
    .get(studentId, courseId) as { score_percent: number; passed: number } | undefined;

  const assessRow = db
    .prepare(`SELECT pass_mark FROM assessments WHERE course_id = ?`)
    .get(courseId) as { pass_mark: number } | undefined;
  const passMark = assessRow?.pass_mark ?? course.pass_mark ?? 70;
  const assessmentPassed = Boolean(bestAttempt && bestAttempt.passed === 1);

  const profile = db
    .prepare(`SELECT photo_path FROM student_profiles WHERE user_id = ?`)
    .get(studentId) as { photo_path: string | null } | undefined;

  const photoSetting = db
    .prepare(`SELECT value FROM platform_settings WHERE key = 'require_photo_for_certificate'`)
    .get() as { value: string } | undefined;
  const photoRequired = photoSetting ? photoSetting.value !== 'false' : true;
  const hasPhoto = Boolean(profile?.photo_path);

  const existingCert = db
    .prepare(
      `SELECT certificate_id FROM certificates
       WHERE student_id = ? AND course_id = ? AND status = 'VALID'
       ORDER BY id DESC LIMIT 1`
    )
    .get(studentId, courseId) as { certificate_id: string } | undefined;

  const reasons: string[] = [];
  if (progressPercent < 100) {
    reasons.push(`Complete all course lessons (${completedLessons}/${totalLessons} completed).`);
  }
  if (!assessmentPassed) {
    reasons.push(`Pass the final assessment with at least ${passMark}%.`);
  }
  if (photoRequired && !hasPhoto) {
    reasons.push('Please upload a profile photo before generating your certificate.');
  }

  return {
    eligible: progressPercent === 100 && assessmentPassed && (!photoRequired || hasPhoto),
    progressPercent,
    completedLessons,
    totalLessons,
    assessmentPassed,
    bestScore: bestAttempt ? bestAttempt.score_percent : null,
    passMark,
    hasPhoto,
    photoRequired,
    existingCertificateId: existingCert?.certificate_id ?? null,
    reasons,
  };
}

export interface IssueCertificateParams {
  studentId: number;
  courseId: number;
  attemptId?: number | null;
  score: number;
  certificateType?: string;
  templateId?: number;
  issuedBy?: number | null;
  recipientName?: string;
  recipientPhotoPath?: string | null;
  issueDate?: string;
  baseUrl: string;
  bypassEligibility?: boolean;
  throwIfDuplicate?: boolean;
}

export async function issueCertificateRecord(params: IssueCertificateParams) {
  const course = db
    .prepare(
      `SELECT id, title, course_code, level, certificate_type, template_id, learning_objectives
       FROM courses WHERE id = ?`
    )
    .get(params.courseId) as
    | {
        id: number;
        title: string;
        course_code: string;
        level: string;
        certificate_type: string;
        template_id: number;
        learning_objectives: string;
      }
    | undefined;

  if (!course) {
    throw new Error('Course not found');
  }

  const user = db
    .prepare(`SELECT id, email, role FROM users WHERE id = ?`)
    .get(params.studentId) as { id: number; email: string; role: string } | undefined;

  if (!user) {
    throw new Error('User account not found');
  }

  const profile = db
    .prepare(`SELECT user_id, full_name, photo_path FROM student_profiles WHERE user_id = ?`)
    .get(params.studentId) as
    | { user_id: number; full_name: string; photo_path: string | null }
    | undefined;

  if (!profile && !params.bypassEligibility) {
    throw new Error('Student profile not found');
  }

  const photoSetting = db
    .prepare(`SELECT value FROM platform_settings WHERE key = 'require_photo_for_certificate'`)
    .get() as { value: string } | undefined;
  const photoRequired = photoSetting ? photoSetting.value !== 'false' : true;

  if (photoRequired && !profile?.photo_path && !params.bypassEligibility) {
    throw new Error('Please upload a profile photo before generating your certificate.');
  }

  if (!params.bypassEligibility) {
    const existingValid = db
      .prepare(
        `SELECT * FROM certificates WHERE student_id = ? AND course_id = ? AND status = 'VALID' ORDER BY id DESC LIMIT 1`
      )
      .get(params.studentId, params.courseId);

    if (existingValid) {
      if (params.throwIfDuplicate) {
        throw new Error('This student already has a valid certificate for this course.');
      }
      return existingValid;
    }
  } else if (params.throwIfDuplicate && !params.recipientName?.trim()) {
    const existingValid = db
      .prepare(
        `SELECT * FROM certificates WHERE student_id = ? AND course_id = ? AND status = 'VALID' AND (recipient_name IS NULL OR recipient_name = '') ORDER BY id DESC LIMIT 1`
      )
      .get(params.studentId, params.courseId);
    if (existingValid) {
      throw new Error('This student already has a valid certificate for this course.');
    }
  }

  const effectiveRecipientName =
    params.recipientName?.trim() ||
    profile?.full_name ||
    (user.role === 'admin'
      ? (
          db.prepare(`SELECT value FROM platform_settings WHERE key = 'director_name'`).get() as
            | { value: string }
            | undefined
        )?.value || user.email
      : user.email);

  const certificateId = generateUniqueCertificateId(course.course_code);
  const verificationUrl = `${params.baseUrl.replace(/\/+$/, '')}/verify/${certificateId}`;
  const pdfUrl = `/api/certificates/${certificateId}/pdf`;
  const qrCodeData = await QRCode.toDataURL(verificationUrl, {
    width: 320,
    margin: 2,
    errorCorrectionLevel: 'M',
    color: { dark: '#0F172A', light: '#FFFFFF' },
  });

  const certType = params.certificateType || course.certificate_type || 'Certificate of Completion';
  const templateId = params.templateId || course.template_id || 1;
  const parsedDate = params.issueDate?.trim() ? new Date(params.issueDate.trim()) : null;
  const issueDate =
    parsedDate && !Number.isNaN(parsedDate.getTime())
      ? parsedDate.toISOString()
      : new Date().toISOString();

  const insert = db.prepare(
    `INSERT INTO certificates (
      certificate_id, student_id, course_id, attempt_id, certificate_type,
      level, score, issue_date, status, verification_url, qr_code_data,
      pdf_url, template_id, issued_by, student_photo_snapshot, recipient_name, is_demo
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'VALID', ?, ?, ?, ?, ?, ?, ?, 0)`
  );

  const snapshotPhoto = params.recipientPhotoPath?.trim()
    ? path.basename(params.recipientPhotoPath.trim())
    : params.recipientName?.trim()
      ? null
      : (profile?.photo_path ?? null);

  const res = insert.run(
    certificateId,
    params.studentId,
    params.courseId,
    params.attemptId ?? null,
    certType,
    course.level,
    params.score,
    issueDate,
    verificationUrl,
    qrCodeData,
    pdfUrl,
    templateId,
    params.issuedBy ?? null,
    snapshotPhoto,
    effectiveRecipientName
  );

  // Add verified course objectives as verified student skills for student learners
  if (user.role === 'student' && !params.recipientName?.trim()) {
    try {
      const objectives = JSON.parse(course.learning_objectives || '[]') as string[];
      const insertSkill = db.prepare(
        `INSERT OR IGNORE INTO student_skills (student_id, skill_name, source, course_id)
         VALUES (?, ?, 'verified_course', ?)`
      );
      for (const skill of objectives.slice(0, 6)) {
        if (typeof skill === 'string' && skill.trim()) {
          insertSkill.run(params.studentId, skill.trim(), params.courseId);
        }
      }
    } catch {
      // ignore malformed objectives JSON
    }
  }

  logAudit(params.issuedBy ?? params.studentId, 'CERTIFICATE_ISSUED', 'certificate', certificateId, {
    studentId: params.studentId,
    recipientName: effectiveRecipientName,
    courseId: params.courseId,
    score: params.score,
    templateId,
    directAdminIssue: Boolean(params.bypassEligibility),
  });

  return db.prepare(`SELECT * FROM certificates WHERE id = ?`).get(res.lastInsertRowid);
}

export async function replaceCertificateRecord(params: {
  oldCertificateDbId: number;
  adminUserId: number;
  reason?: string;
  baseUrl: string;
}) {
  const oldCert = db
    .prepare(`SELECT * FROM certificates WHERE id = ?`)
    .get(params.oldCertificateDbId) as
    | {
        id: number;
        certificate_id: string;
        student_id: number;
        course_id: number;
        attempt_id: number | null;
        certificate_type: string;
        score: number;
        template_id: number;
        recipient_name: string | null;
        student_photo_snapshot: string | null;
      }
    | undefined;

  if (!oldCert) {
    throw new Error('Original certificate not found.');
  }

  const newCert = (await issueCertificateRecord({
    studentId: oldCert.student_id,
    courseId: oldCert.course_id,
    attemptId: oldCert.attempt_id,
    score: oldCert.score,
    certificateType: oldCert.certificate_type,
    templateId: oldCert.template_id,
    issuedBy: params.adminUserId,
    recipientName: oldCert.recipient_name || undefined,
    recipientPhotoPath: oldCert.student_photo_snapshot || undefined,
    baseUrl: params.baseUrl,
    bypassEligibility: true,
    throwIfDuplicate: false,
  })) as { certificate_id: string };

  db.prepare(
    `UPDATE certificates
     SET status = 'REVOKED', revoked_at = datetime('now'), revoked_by = ?,
         revocation_reason = ?, replaced_by_certificate_id = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(
    params.adminUserId,
    params.reason || `Replaced by new certificate ${newCert.certificate_id}`,
    newCert.certificate_id,
    oldCert.id
  );

  logAudit(params.adminUserId, 'CERTIFICATE_REPLACED', 'certificate', oldCert.certificate_id, {
    replacedBy: newCert.certificate_id,
  });

  return newCert;
}

export interface CertificatePdfPayload {
  certificate_id: string;
  certificate_type: string;
  level: string;
  score: number;
  issue_date: string;
  status: string;
  verification_url: string;
  template_code: string;
  student_name: string;
  student_photo_path: string | null;
  course_title: string;
  course_code: string;
  duration_hours: number;
  instructor_name: string;
  instructor_title: string;
  director_name: string;
  director_title: string;
}

function resolveSafePhotoPath(photoPath: string | null): string | null {
  if (!photoPath) return null;
  const filename = path.basename(photoPath);
  const resolved = path.resolve(AVATAR_UPLOAD_DIR, filename);
  if (!resolved.startsWith(AVATAR_UPLOAD_DIR + path.sep)) return null;
  if (!fs.existsSync(resolved)) return null;
  return resolved;
}

export async function streamCertificatePdf(
  res: Response,
  data: CertificatePdfPayload
): Promise<void> {
  const doc = new PDFDocument({
    size: 'A4',
    layout: 'landscape',
    margin: 0,
    info: {
      Title: `TechTalkHub Certificate — ${data.certificate_id}`,
      Author: 'TechTalkHub Certification Authority',
      Subject: `${data.certificate_type} for ${data.course_title}`,
    },
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${data.certificate_id}.pdf"`
  );

  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  doc.on('end', () => {
    try {
      const safeName = `${path.basename(data.certificate_id)}.pdf`;
      const target = path.resolve(CERT_PDF_DIR, safeName);
      if (target.startsWith(CERT_PDF_DIR + path.sep)) {
        fs.writeFileSync(target, Buffer.concat(chunks));
      }
    } catch {
      // ignore disk cache error
    }
  });
  doc.pipe(res);

  const W = 841.89;
  const H = 595.28;
  const navy = '#1D3557';
  const gold = '#E6A800';

  // Pure white canvas
  doc.rect(0, 0, W, H).fill('#FFFFFF');

  // Helper to scale 1000x707 reference coordinates to A4 Landscape (841.89x595.28)
  const sx = (x: number) => (x / 1000) * W;
  const sy = (y: number) => (y / 707) * H;
  const drawPoly = (pts: Array<[number, number]>, color: string) => {
    doc.save();
    doc.fillColor(color);
    doc.moveTo(sx(pts[0][0]), sy(pts[0][1]));
    for (let i = 1; i < pts.length; i++) {
      doc.lineTo(sx(pts[i][0]), sy(pts[i][1]));
    }
    doc.closePath().fill();
    doc.restore();
  };

  // Top-left gold wedge & navy ribbon
  drawPoly([[0, 0], [185, 0], [0, 34]], gold);
  drawPoly([[0, 34], [150, 0], [445, 0], [525, 38], [0, 38]], navy);

  // Top-right navy band, gold diagonal sash & corner triangle
  drawPoly([[565, 0], [815, 0], [845, 38], [595, 38]], navy);
  drawPoly([[785, 0], [845, 0], [1000, 155], [1000, 222]], gold);
  drawPoly([[845, 0], [1000, 0], [1000, 155]], navy);

  // Bottom-left navy triangle, gold diagonal sash & navy ribbon
  drawPoly([[0, 542], [158, 707], [0, 707]], navy);
  drawPoly([[0, 478], [228, 707], [158, 707], [0, 542]], gold);
  drawPoly([[185, 672], [415, 672], [465, 707], [215, 707]], navy);

  // Bottom-right navy ribbon & gold wedge
  drawPoly([[480, 672], [1000, 672], [1000, 707], [520, 707]], navy);
  drawPoly([[815, 707], [1000, 672], [1000, 707]], gold);

  // Subtle fine-line guilloché wave accents on left and bottom-right
  doc.save();
  doc.strokeColor('#94A3B8').strokeOpacity(0.42).lineWidth(0.75);
  for (let i = 0; i < 5; i++) {
    const dy = i * 11;
    doc
      .moveTo(sx(0), sy(92 + dy))
      .bezierCurveTo(sx(45), sy(105 + dy), sx(55), sy(148 + dy), sx(92), sy(145 + dy))
      .stroke();
  }
  for (let i = 0; i < 3; i++) {
    const dy = i * 12;
    doc
      .moveTo(sx(0), sy(210 + dy))
      .bezierCurveTo(sx(46), sy(235 + dy), sx(60), sy(295 + dy), sx(22), sy(342 + dy))
      .stroke();
  }
  for (let i = 0; i < 4; i++) {
    const dx = i * 9;
    const dy = i * 11;
    doc
      .moveTo(sx(1000), sy(455 + dy))
      .bezierCurveTo(sx(945 - dx), sy(455 + dy), sx(932 - dx), sy(520 + dy), sx(952 - dx), sy(575 + dy))
      .stroke();
  }
  for (let i = 0; i < 3; i++) {
    const dx = i * 12;
    doc
      .moveTo(sx(822 + dx), sy(672))
      .bezierCurveTo(sx(845 + dx), sy(615), sx(890 + dx), sy(585), sx(940 + dx), sy(612))
      .stroke();
  }
  doc.restore();

  // Top Centered Classic Serif Title (e.g., Certificate of / Completion)
  const rawHeading = (data.certificate_type || 'Certificate of Completion').trim();
  const words = rawHeading.split(/\s+/);
  let headingLines: string[] = [rawHeading];
  if (words.length >= 3) {
    const splitAt = Math.ceil(words.length * 0.65);
    headingLines = [words.slice(0, splitAt).join(' '), words.slice(splitAt).join(' ')];
  } else if (words.length === 2) {
    headingLines = [words[0], words[1]];
  }

  doc.fillColor('#0F172A').font('Times-Bold').fontSize(33);
  doc.text(headingLines[0], 70, 50, { width: W - 140, align: 'center' });
  if (headingLines[1]) {
    doc.text(headingLines[1], 70, 84, { width: W - 140, align: 'center' });
  }

  // Left Portrait Column: Mandatory Graduate Portrait Photo (exact 5:6 inner portrait box)
  const photoBoxX = 68;
  const photoBoxY = 148;
  const photoBoxW = 125;
  const photoBoxH = 148;

  // Solid white mat behind photo so background guilloche waves never bleed through
  doc.roundedRect(photoBoxX, photoBoxY, photoBoxW, photoBoxH, 6).fill('#FFFFFF');
  doc.lineWidth(2).strokeColor(navy).roundedRect(photoBoxX, photoBoxY, photoBoxW, photoBoxH, 6).stroke();
  doc.lineWidth(1).strokeColor(gold).roundedRect(photoBoxX + 3, photoBoxY + 3, photoBoxW - 6, photoBoxH - 6, 4).stroke();

  const innerPhotoW = photoBoxW - 10; // 115
  const innerPhotoH = photoBoxH - 10; // 138 (115:138 = 5:6 ratio)
  const safePhoto = resolveSafePhotoPath(data.student_photo_path);
  let photoEmbedded = false;
  if (safePhoto) {
    try {
      doc.save();
      doc.roundedRect(photoBoxX + 5, photoBoxY + 5, innerPhotoW, innerPhotoH, 3).clip();
      doc.image(safePhoto, photoBoxX + 5, photoBoxY + 5, {
        cover: [innerPhotoW, innerPhotoH],
        align: 'center',
      });
      doc.restore();
      photoEmbedded = true;
    } catch {
      photoEmbedded = false;
    }
  }

  if (!photoEmbedded) {
    doc.roundedRect(photoBoxX + 5, photoBoxY + 5, innerPhotoW, innerPhotoH, 3).fill('#F8FAFC');
    const initials = data.student_name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0].toUpperCase())
      .join('');
    doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(28).text(initials || 'TTH', photoBoxX, photoBoxY + 54, { width: photoBoxW, align: 'center' });
    doc.fillColor('#64748B').font('Helvetica').fontSize(8).text('GRADUATE PHOTO', photoBoxX, photoBoxY + 92, { width: photoBoxW, align: 'center' });
  }

  doc
    .fillColor(data.status === 'VALID' ? navy : '#DC2626')
    .font('Helvetica-Bold')
    .fontSize(8)
    .text(
      data.status === 'VALID' ? 'VERIFIED GRADUATE' : 'REVOKED',
      photoBoxX,
      photoBoxY + photoBoxH + 8,
      { width: photoBoxW, align: 'center' }
    );

  // Main Centered Award Block (positioned cleanly to the right of the portrait, balanced before top-right sash)
  const awardX = 212;
  const awardW = 528;

  doc
    .fillColor('#1E293B')
    .font('Helvetica')
    .fontSize(12)
    .text('This certificate is proudly awarded to', awardX, 152, { width: awardW, align: 'center' });

  const nameFontSize = data.student_name.length > 28 ? 22 : 27;
  doc
    .fillColor('#0F172A')
    .font('Helvetica-Bold')
    .fontSize(nameFontSize)
    .text(data.student_name, awardX, 178, { width: awardW, align: 'center' });

  // Horizontal underline beneath recipient name
  const lineCenterX = awardX + awardW / 2;
  doc
    .moveTo(lineCenterX - 185, 214)
    .lineTo(lineCenterX + 185, 214)
    .lineWidth(0.9)
    .strokeColor('#64748B')
    .stroke();

  doc
    .fillColor('#334155')
    .font('Helvetica-Oblique')
    .fontSize(10.5)
    .text('for completing the course with outstanding performance at TechTalkHub', awardX, 224, {
      width: awardW,
      align: 'center',
    });

  const courseFontSize = data.course_title.length > 48 ? 15 : 18;
  doc
    .fillColor('#0F172A')
    .font('Helvetica-Bold')
    .fontSize(courseFontSize)
    .text(data.course_title, awardX, 248, { width: awardW, align: 'center' });

  // Clean Metadata Row: Level | Score | Completed Date (NO Duration, NO URL)
  const isoDate = new Date(data.issue_date).toISOString().slice(0, 10);
  const metaY = 294;
  const metaColW = awardW / 3;
  const metaItems = [
    ['LEVEL', data.level],
    ['ASSESSMENT SCORE', `${data.score}%`],
    ['COMPLETED DATE', isoDate],
  ];
  metaItems.forEach(([label, val], idx) => {
    const mx = awardX + idx * metaColW;
    doc.fillColor('#64748B').font('Helvetica-Bold').fontSize(7.5).text(label, mx, metaY, { width: metaColW, align: 'center' });
    doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(9.5).text(val, mx, metaY + 12, { width: metaColW, align: 'center' });
  });

  // Bottom 3-Column Bar:
  // 1) Left: QR Code + Serial Number + Issued On (kept clear of bottom-left diagonal sash)
  const bottomRowY = 398;
  const qrBuffer = await QRCode.toBuffer(data.verification_url, {
    width: 220,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#0F172A', light: '#FFFFFF' },
  });
  const qrX = 148;
  const qrY = bottomRowY + 4;
  const qrSize = 66;
  doc.rect(qrX - 3, qrY - 3, qrSize + 6, qrSize + 6).lineWidth(0.75).strokeColor('#CBD5E1').stroke();
  doc.image(qrBuffer, qrX, qrY, { width: qrSize, height: qrSize });
  doc.fillColor('#475569').font('Helvetica-Bold').fontSize(6.5).text('SCAN TO VERIFY', qrX - 8, qrY + qrSize + 6, { width: qrSize + 16, align: 'center' });

  const serialX = qrX + qrSize + 14;
  doc.fillColor('#334155').font('Helvetica-Bold').fontSize(8.5).text('SERIAL NUMBER', serialX, bottomRowY + 8, { width: 135 });
  doc.fillColor('#0F172A').font('Courier-Bold').fontSize(9).text(data.certificate_id, serialX, bottomRowY + 20, { width: 135 });
  doc.fillColor('#334155').font('Helvetica-Bold').fontSize(8.5).text('ISSUED ON:', serialX, bottomRowY + 40, { width: 135 });
  doc.fillColor('#0F172A').font('Courier').fontSize(9).text(isoDate, serialX, bottomRowY + 52, { width: 135 });

  // 2) Bottom-Center: Official TechTalkHub Logo
  const logoPath = path.resolve(process.cwd(), 'public', 'assets', 'techtalkhub-logo.png');
  if (fs.existsSync(logoPath)) {
    const logoH = 74;
    const logoW = logoH * 1.59;
    doc.image(logoPath, W / 2 - logoW / 2 + 10, bottomRowY - 2, { height: logoH });
  } else {
    doc.fillColor(navy).font('Helvetica-Bold').fontSize(15).text('TECHTALKHUB', W / 2 - 70, bottomRowY + 25, { width: 140, align: 'center' });
  }

  // 3) Bottom-Right: Academic Director Signature + Realistic Hand-Stamped Official Seal
  const directorName = data.director_name || 'ENG.Ruben B. Rudovick';
  const sigX = 570;
  const sigW = 195;
  doc.fillColor('#0F172A').font('Times-BoldItalic').fontSize(15).text(directorName, sigX, bottomRowY + 14, { width: sigW, align: 'center' });
  doc.moveTo(sigX + 12, bottomRowY + 38).lineTo(sigX + sigW - 12, bottomRowY + 38).lineWidth(0.9).strokeColor('#334155').stroke();
  doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(9).text(directorName.toUpperCase(), sigX, bottomRowY + 44, { width: sigW, align: 'center' });
  doc.fillColor('#334155').font('Helvetica-Bold').fontSize(7.5).text((data.director_title || 'Academic Director, TechTalkHub').toUpperCase(), sigX, bottomRowY + 57, { width: sigW, align: 'center' });

  const stampPath = path.resolve(process.cwd(), 'public', 'assets', 'techtalkhub-stamp.png');
  if (fs.existsSync(stampPath)) {
    let stampHash = 0;
    const cid = data.certificate_id || 'TTH';
    for (let i = 0; i < cid.length; i++) {
      stampHash = (stampHash * 31 + cid.charCodeAt(i)) >>> 0;
    }
    const stampAngle = -11 + (stampHash % 7); // -11deg to -5deg
    const stampOffX = (stampHash % 9) - 4;
    const stampOffY = ((stampHash >> 3) % 7) - 3;
    const stampW = 94;
    const stampH = 90.5;
    const stampCenterX = sigX + 26 + stampOffX;
    const stampCenterY = bottomRowY + 26 + stampOffY;

    doc.save();
    doc.opacity(0.84);
    doc.translate(stampCenterX, stampCenterY);
    doc.rotate(stampAngle);
    doc.image(stampPath, -stampW / 2, -stampH / 2, { width: stampW, height: stampH });
    doc.restore();
  }

  // Revoked watermark overlay if certificate was revoked
  if (data.status === 'REVOKED') {
    doc.save();
    doc.rotate(-22, { origin: [W / 2, H / 2] });
    doc
      .fillColor('#DC2626')
      .opacity(0.22)
      .font('Helvetica-Bold')
      .fontSize(72)
      .text('REVOKED', W / 2 - 200, H / 2 - 40, { width: 400, align: 'center' });
    doc.restore();
  }

  doc.end();
}
