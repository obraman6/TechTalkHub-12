import crypto from 'crypto';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const rootBase = isServerless ? path.resolve('/tmp', 'techtalkhub') : process.cwd();

const DATA_DIR = path.resolve(rootBase, 'data');
const UPLOAD_DIR = path.resolve(rootBase, 'uploads', 'avatars');
const CERT_DIR = path.resolve(rootBase, 'uploads', 'certificates');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(CERT_DIR)) {
  fs.mkdirSync(CERT_DIR, { recursive: true });
}

export const DB_PATH = path.join(DATA_DIR, 'techtalkhub.db');
export const AVATAR_UPLOAD_DIR = UPLOAD_DIR;
export const CERT_PDF_DIR = CERT_DIR;

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('student', 'instructor', 'admin')),
      email_verified INTEGER NOT NULL DEFAULT 0,
      verification_token TEXT,
      reset_token TEXT,
      reset_token_expires TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS student_profiles (
      user_id INTEGER PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      country TEXT DEFAULT '',
      city TEXT DEFAULT '',
      headline TEXT DEFAULT 'TechTalkHub Learner',
      bio TEXT DEFAULT '',
      photo_path TEXT,
      public_profile_enabled INTEGER NOT NULL DEFAULT 1,
      show_contact_publicly INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS instructors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE,
      full_name TEXT NOT NULL,
      title TEXT NOT NULL DEFAULT 'Technology Instructor',
      specialty TEXT NOT NULL DEFAULT 'Computer Science & IT',
      bio TEXT DEFAULT '',
      can_edit_courses INTEGER NOT NULL DEFAULT 1,
      can_create_lessons INTEGER NOT NULL DEFAULT 1,
      can_create_assessments INTEGER NOT NULL DEFAULT 1,
      can_view_reports INTEGER NOT NULL DEFAULT 1,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      display_order INTEGER NOT NULL DEFAULT 0,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS certificate_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE CHECK (code IN ('standard', 'professional', 'professional_program')),
      description TEXT NOT NULL DEFAULT '',
      accent_color TEXT NOT NULL DEFAULT '#1D4ED8',
      border_style TEXT NOT NULL DEFAULT 'double',
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      instructor_id INTEGER,
      title TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      course_code TEXT NOT NULL UNIQUE,
      level TEXT NOT NULL CHECK (level IN (
        'Foundation — Level 1',
        'Intermediate — Level 2',
        'Advanced — Level 3',
        'Professional'
      )),
      description TEXT NOT NULL,
      learning_objectives TEXT NOT NULL DEFAULT '[]',
      duration_hours INTEGER NOT NULL DEFAULT 20,
      pass_mark INTEGER NOT NULL DEFAULT 70,
      certificate_type TEXT NOT NULL DEFAULT 'Certificate of Completion' CHECK (certificate_type IN (
        'Certificate of Completion',
        'Certificate of Achievement',
        'Professional Certificate'
      )),
      template_id INTEGER NOT NULL DEFAULT 1,
      thumbnail_url TEXT NOT NULL DEFAULT '/src/assets/images/course_web_cyber_1795780020210.jpg',
      status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'draft', 'archived')),
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT,
      FOREIGN KEY (instructor_id) REFERENCES instructors(id) ON DELETE SET NULL,
      FOREIGN KEY (template_id) REFERENCES certificate_templates(id) ON DELETE RESTRICT
    );

    CREATE TABLE IF NOT EXISTS course_modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      order_index INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lessons (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      content_markdown TEXT NOT NULL DEFAULT '',
      image_url TEXT DEFAULT '',
      video_url TEXT DEFAULT '',
      attachment_name TEXT DEFAULT '',
      attachment_url TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      duration_minutes INTEGER NOT NULL DEFAULT 25,
      order_index INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (module_id) REFERENCES course_modules(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS enrollments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
      progress_percent INTEGER NOT NULL DEFAULT 0,
      enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      UNIQUE (student_id, course_id),
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS lesson_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      lesson_id INTEGER NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      completed_at TEXT,
      UNIQUE (student_id, lesson_id),
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assessments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      course_id INTEGER NOT NULL UNIQUE,
      title TEXT NOT NULL,
      instructions TEXT NOT NULL DEFAULT 'Answer all questions carefully before submitting. Your score is graded automatically.',
      time_limit_minutes INTEGER NOT NULL DEFAULT 30,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      pass_mark INTEGER NOT NULL DEFAULT 70,
      randomize_questions INTEGER NOT NULL DEFAULT 1,
      randomize_options INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assessment_id INTEGER NOT NULL,
      question_text TEXT NOT NULL,
      question_type TEXT NOT NULL CHECK (question_type IN ('mcq_single', 'mcq_multi', 'true_false')),
      options_json TEXT NOT NULL,
      correct_answers_json TEXT NOT NULL,
      explanation TEXT NOT NULL DEFAULT '',
      points INTEGER NOT NULL DEFAULT 1,
      order_index INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assessment_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      assessment_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      score_percent INTEGER NOT NULL,
      correct_count INTEGER NOT NULL,
      total_questions INTEGER NOT NULL,
      passed INTEGER NOT NULL DEFAULT 0,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (assessment_id) REFERENCES assessments(id) ON DELETE CASCADE,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS assessment_answers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attempt_id INTEGER NOT NULL,
      question_id INTEGER NOT NULL,
      selected_answers_json TEXT NOT NULL,
      is_correct INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (attempt_id) REFERENCES assessment_attempts(id) ON DELETE CASCADE,
      FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS certificates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      certificate_id TEXT NOT NULL UNIQUE,
      student_id INTEGER NOT NULL,
      course_id INTEGER NOT NULL,
      attempt_id INTEGER,
      certificate_type TEXT NOT NULL,
      level TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      issue_date TEXT NOT NULL DEFAULT (datetime('now')),
      status TEXT NOT NULL DEFAULT 'VALID' CHECK (status IN ('VALID', 'REVOKED')),
      verification_url TEXT NOT NULL,
      qr_code_data TEXT NOT NULL,
      template_id INTEGER NOT NULL DEFAULT 1,
      issued_by INTEGER,
      student_photo_snapshot TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      revoked_at TEXT,
      revoked_by INTEGER,
      revocation_reason TEXT,
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
      FOREIGN KEY (attempt_id) REFERENCES assessment_attempts(id) ON DELETE SET NULL,
      FOREIGN KEY (template_id) REFERENCES certificate_templates(id) ON DELETE RESTRICT,
      FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (revoked_by) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS verification_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      certificate_id TEXT NOT NULL,
      certificate_record_id INTEGER,
      result TEXT NOT NULL CHECK (result IN ('VALID', 'REVOKED', 'NOT_FOUND')),
      user_agent_summary TEXT DEFAULT '',
      ip_hash TEXT DEFAULT '',
      verified_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (certificate_record_id) REFERENCES certificates(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_user_id INTEGER,
      action TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      details_json TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS student_skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      skill_name TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'self' CHECK (source IN ('self', 'verified_course')),
      course_id INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (student_id, skill_name),
      FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS platform_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      subject TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  const ensureColumn = (table: string, column: string, definition: string) => {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!cols.some((c) => c.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
  };

  ensureColumn('users', 'last_login_at', 'TEXT');
  ensureColumn('courses', 'short_description', "TEXT DEFAULT ''");
  ensureColumn('courses', 'requirements', "TEXT DEFAULT '[]'");
  ensureColumn('course_modules', 'is_published', 'INTEGER NOT NULL DEFAULT 1');
  ensureColumn('enrollments', 'last_lesson_id', 'INTEGER');
  ensureColumn('assessments', 'assessment_type', "TEXT NOT NULL DEFAULT 'final'");
  ensureColumn('certificates', 'pdf_url', 'TEXT');
  ensureColumn('certificates', 'replaced_by_certificate_id', 'TEXT');
  ensureColumn('certificates', 'recipient_name', "TEXT DEFAULT ''");
  ensureColumn('users', 'has_local_password', 'INTEGER NOT NULL DEFAULT 1');
}

export async function seedInitialData(): Promise<void> {
  // Default platform settings
  const defaultSettings: Array<[string, string]> = [
    ['platform_name', 'TECHTALKHUB'],
    ['tagline', 'Technology • Skills • Innovation'],
    ['require_photo_for_certificate', 'true'],
    ['allow_admin_photo_override', 'true'],
    ['director_name', 'ENG.Ruben B. Rudovick'],
    ['director_title', 'Academic Director, TechTalkHub'],
    ['contact_email', 'support@techtalkhub.com'],
    ['support_phone', '+255 700 123 456'],
    ['website_url', 'https://techtalkhub.com'],
    ['default_pass_mark', '70'],
    ['default_timezone', 'Africa/Dar_es_Salaam'],
    ['show_answers_after_submit', 'true'],
    ['verification_base_url', process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL' ? process.env.APP_URL : ''],
    ['demo_data_present', 'false'],
  ];

  // Ensure any previously seeded demo records are permanently removed and director default is updated
  db.transaction(() => {
    db.prepare(`DELETE FROM certificates WHERE is_demo = 1 OR certificate_id = 'TTH-CF-2026-000184'`).run();
    db.prepare(`UPDATE courses SET instructor_id = NULL WHERE instructor_id IN (SELECT id FROM instructors WHERE is_demo = 1)`).run();
    db.prepare(`DELETE FROM instructors WHERE is_demo = 1`).run();
    db.prepare(`DELETE FROM users WHERE is_demo = 1`).run();
    db.prepare(`UPDATE platform_settings SET value = 'false', updated_at = datetime('now') WHERE key = 'demo_data_present'`).run();
    db.prepare(`UPDATE platform_settings SET value = 'ENG.Ruben B. Rudovick', updated_at = datetime('now') WHERE key = 'director_name' AND value = 'Dr. Samuel K. Nyerere'`).run();
    db.prepare(
      `UPDATE users SET has_local_password = 0
       WHERE id IN (SELECT target_id FROM audit_logs WHERE action = 'FIREBASE_USER_CREATED')
         AND id NOT IN (SELECT target_id FROM audit_logs WHERE action IN ('PASSWORD_RESET', 'PASSWORD_CHANGED'))`
    ).run();
  })();
  // Always enforce owner admin user rudovickruben@gmail.com with admin role and password TechTalkHub2026! on server startup
  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync('TechTalkHub2026!', salt, 64).toString('hex');
    const defaultHash = `${salt}:${derived}`;

    const existingAdmin = db.prepare(`SELECT id FROM users WHERE email = ?`).get('rudovickruben@gmail.com') as { id: number } | undefined;
    if (existingAdmin) {
      db.prepare(
        `UPDATE users SET role = 'admin', password_hash = ?, email_verified = 1, is_active = 1, has_local_password = 1, updated_at = datetime('now') WHERE id = ?`
      ).run(defaultHash, existingAdmin.id);
    } else {
      const userRes = db.prepare(
        `INSERT INTO users (email, password_hash, role, email_verified, is_active, is_demo, has_local_password)
         VALUES (?, ?, 'admin', 1, 1, 0, 1)`
      ).run('rudovickruben@gmail.com', defaultHash);
      const adminUserId = Number(userRes.lastInsertRowid);
      db.prepare(
        `INSERT OR IGNORE INTO student_profiles (user_id, username, full_name, headline)
         VALUES (?, 'rubenbuberwa', 'ENG.Ruben B. Rudovick', 'Academic Director, TechTalkHub')`
      ).run(adminUserId);
    }
  } catch {
    // ignore
  }

  const insertSetting = db.prepare(
    `INSERT OR IGNORE INTO platform_settings (key, value) VALUES (?, ?)`
  );
  for (const [k, v] of defaultSettings) {
    insertSetting.run(k, v);
  }

  // Certificate Templates (3 required)
  const templateCount = (db.prepare(`SELECT COUNT(*) as c FROM certificate_templates`).get() as { c: number }).c;
  if (templateCount === 0) {
    const insertTemplate = db.prepare(
      `INSERT INTO certificate_templates (name, code, description, accent_color, border_style, is_default)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    insertTemplate.run(
      'Template 1 — Standard',
      'standard',
      'Clean institutional layout for Foundation and Intermediate course completion certificates.',
      '#1D4ED8',
      'double',
      1
    );
    insertTemplate.run(
      'Template 2 — Professional',
      'professional',
      'Executive navy and gold-trimmed credential template for Advanced technical courses.',
      '#0F172A',
      'ornate',
      0
    );
    insertTemplate.run(
      'Template 3 — Professional Program',
      'professional_program',
      'Flagship certification layout with formal verification seal for multi-module professional programs.',
      '#0369A1',
      'seal',
      0
    );
  }

  // Categories (8 official categories from specification)
  const catCount = (db.prepare(`SELECT COUNT(*) as c FROM categories`).get() as { c: number }).c;
  if (catCount === 0) {
    const categories = [
      ['Computer Fundamentals', 'computer-fundamentals', 'Essential computing literacy, operating systems, internet, and digital productivity.', 1],
      ['Microsoft Office', 'microsoft-office', 'Workplace mastery across Word, Excel, PowerPoint, Access, and Office Professional.', 2],
      ['Web Development', 'web-development', 'Modern HTML, CSS, JavaScript, responsive design, PHP/MySQL, and full-stack engineering.', 3],
      ['Graphic Design', 'graphic-design', 'Visual communication, Adobe Photoshop, Illustrator, Canva, and digital brand media.', 4],
      ['IT Support & Computer Technician', 'it-support-computer-technician', 'PC hardware diagnostics, OS deployment, troubleshooting, and core networking.', 5],
      ['Cybersecurity', 'cybersecurity', 'Digital safety, network defense, password hygiene, and ethical hacking foundations.', 6],
      ['Data & Database', 'data-database', 'Data analysis, spreadsheet intelligence, relational databases, and SQL querying.', 7],
      ['Programming & App Development', 'programming-app-development', 'Software logic, Python, Java, Android, Flutter, and cross-platform mobile apps.', 8],
    ];
    const insertCat = db.prepare(
      `INSERT INTO categories (name, slug, description, display_order, is_demo) VALUES (?, ?, ?, ?, 0)`
    );
    for (const [name, slug, desc, order] of categories) {
      insertCat.run(name, slug, desc, order);
    }
  }

  // Seed official Course Catalog ONLY if catalog is empty (no demo users or demo certificates)
  const courseCount = (db.prepare(`SELECT COUNT(*) as c FROM courses`).get() as { c: number }).c;
  if (courseCount === 0) {

    const catMap = new Map<string, number>();
    for (const row of db.prepare(`SELECT id, slug FROM categories`).all() as Array<{ id: number; slug: string }>) {
      catMap.set(row.slug, row.id);
    }

    const IMG_WEB = '/src/assets/images/course_web_cyber_1795780020210.jpg';
    const IMG_HW = '/src/assets/images/course_hardware_it_1795780020791.jpg';
    const IMG_DATA = '/src/assets/images/course_design_data_1795780021394.jpg';

    type CourseSeed = {
      cat: string;
      title: string;
      slug: string;
      code: string;
      level: 'Foundation — Level 1' | 'Intermediate — Level 2' | 'Advanced — Level 3' | 'Professional';
      hours: number;
      passMark: number;
      certType: 'Certificate of Completion' | 'Certificate of Achievement' | 'Professional Certificate';
      templateId: number;
      thumb: string;
      desc: string;
      objectives: string[];
    };

    const catalog: CourseSeed[] = [
      // Computer Fundamentals
      {
        cat: 'computer-fundamentals',
        title: 'Computer Fundamentals',
        slug: 'computer-fundamentals',
        code: 'TTH-CF',
        level: 'Foundation — Level 1',
        hours: 40,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_HW,
        desc: 'Build complete fluency in modern computing: hardware components, operating systems, file architecture, internet safety, and everyday digital workflows.',
        objectives: ['Computer Architecture & Hardware', 'Windows & File Management', 'Internet & Email Protocols', 'Digital Security Essentials'],
      },
      {
        cat: 'computer-fundamentals',
        title: 'Introduction to Information Technology',
        slug: 'introduction-to-information-technology',
        code: 'TTH-IT101',
        level: 'Foundation — Level 1',
        hours: 30,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_WEB,
        desc: 'Explore core IT concepts including enterprise systems, cloud computing, digital networks, and technology career pathways.',
        objectives: ['IT Infrastructure Basics', 'Cloud & Network Concepts', 'Information Systems'],
      },
      {
        cat: 'computer-fundamentals',
        title: 'Windows Operating System Essentials',
        slug: 'windows-operating-system-essentials',
        code: 'TTH-WIN',
        level: 'Foundation — Level 1',
        hours: 20,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_HW,
        desc: 'Master Windows navigation, system settings, storage management, user accounts, and built-in security tools.',
        objectives: ['Windows Desktop & File Explorer', 'System Configuration & Updates', 'User Account Control'],
      },
      {
        cat: 'computer-fundamentals',
        title: 'Internet and Email Essentials',
        slug: 'internet-and-email-essentials',
        code: 'TTH-NET101',
        level: 'Foundation — Level 1',
        hours: 16,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_WEB,
        desc: 'Navigate web browsers effectively, manage professional email communication, and recognize online phishing threats.',
        objectives: ['Browser Efficiency & Search', 'Professional Email Etiquette', 'Safe Browsing Practices'],
      },
      {
        cat: 'computer-fundamentals',
        title: 'Digital Productivity',
        slug: 'digital-productivity',
        code: 'TTH-PROD',
        level: 'Foundation — Level 1',
        hours: 18,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_DATA,
        desc: 'Streamline daily work using cloud collaboration suites, shared calendars, task boards, and structured digital organization.',
        objectives: ['Cloud Drive Collaboration', 'Time & Task Workflows', 'Document Versioning'],
      },
      {
        cat: 'computer-fundamentals',
        title: 'Typing and Computer Skills',
        slug: 'typing-and-computer-skills',
        code: 'TTH-TYPE',
        level: 'Foundation — Level 1',
        hours: 15,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_DATA,
        desc: 'Develop accurate touch-typing speed, keyboard shortcuts, and confident mouse and trackpad ergonomics.',
        objectives: ['Touch Typing Ergonomics', 'Productivity Shortcuts', 'Accuracy & Speed Drills'],
      },

      // Microsoft Office
      {
        cat: 'microsoft-office',
        title: 'Microsoft Word Essentials',
        slug: 'microsoft-word-essentials',
        code: 'TTH-WORD1',
        level: 'Foundation — Level 1',
        hours: 24,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_DATA,
        desc: 'Create structured business documents, reports, styles, tables, and print-ready PDFs with Microsoft Word.',
        objectives: ['Document Formatting & Styles', 'Tables & Layout Control', 'Headers, Footers & Export'],
      },
      {
        cat: 'microsoft-office',
        title: 'Microsoft Word Advanced',
        slug: 'microsoft-word-advanced',
        code: 'TTH-WORD2',
        level: 'Intermediate — Level 2',
        hours: 28,
        passMark: 75,
        certType: 'Certificate of Achievement',
        templateId: 2,
        thumb: IMG_DATA,
        desc: 'Automate long documents with mail merge, dynamic tables of contents, cross-references, and review workflows.',
        objectives: ['Mail Merge & Templates', 'Long-Document Indexing', 'Track Changes & Collaboration'],
      },
      {
        cat: 'microsoft-office',
        title: 'Microsoft Excel Essentials',
        slug: 'microsoft-excel-essentials',
        code: 'TTH-XLS1',
        level: 'Foundation — Level 1',
        hours: 30,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_DATA,
        desc: 'Build reliable spreadsheets using formulas, cell referencing, conditional formatting, and clear charts.',
        objectives: ['Core Formulas & Functions', 'Data Formatting & Charts', 'Worksheet Organization'],
      },
      {
        cat: 'microsoft-office',
        title: 'Microsoft Excel Advanced',
        slug: 'microsoft-excel-advanced',
        code: 'TTH-XLS2',
        level: 'Advanced — Level 3',
        hours: 36,
        passMark: 75,
        certType: 'Certificate of Achievement',
        templateId: 2,
        thumb: IMG_DATA,
        desc: 'Master PivotTables, XLOOKUP, nested logical formulas, data validation, and interactive executive dashboards.',
        objectives: ['XLOOKUP & Dynamic Arrays', 'PivotTables & Slicers', 'Automated Reporting'],
      },
      {
        cat: 'microsoft-office',
        title: 'Microsoft PowerPoint',
        slug: 'microsoft-powerpoint',
        code: 'TTH-PPT',
        level: 'Foundation — Level 1',
        hours: 20,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_DATA,
        desc: 'Design clear executive slide decks using slide masters, visual hierarchy, charts, and speaker notes.',
        objectives: ['Slide Master Architecture', 'Visual Storytelling', 'Presenter Delivery Tools'],
      },
      {
        cat: 'microsoft-office',
        title: 'Microsoft Access Fundamentals',
        slug: 'microsoft-access-fundamentals',
        code: 'TTH-ACC',
        level: 'Intermediate — Level 2',
        hours: 26,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_DATA,
        desc: 'Design relational desktop databases with normalized tables, queries, data-entry forms, and printable reports.',
        objectives: ['Table Relationships', 'Query Builder', 'Forms & Structured Reports'],
      },
      {
        cat: 'microsoft-office',
        title: 'Microsoft Office Professional',
        slug: 'microsoft-office-professional',
        code: 'TTH-OFFPRO',
        code_dummy: undefined,
        level: 'Professional',
        hours: 60,
        passMark: 80,
        certType: 'Professional Certificate',
        templateId: 3,
        thumb: IMG_DATA,
        desc: 'Comprehensive workplace certification integrating Word, Excel, PowerPoint, Access, and Outlook enterprise workflows.',
        objectives: ['Integrated Office Suites', 'Executive Data & Document Pipelines', 'Workplace Automation'],
      } as CourseSeed,

      // Web Development
      {
        cat: 'web-development',
        title: 'HTML and Web Structure',
        slug: 'html-and-web-structure',
        code: 'TTH-HTML',
        level: 'Foundation — Level 1',
        hours: 24,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_WEB,
        desc: 'Author semantic HTML5 documents, accessible forms, structured media, and search-engine-ready page markup.',
        objectives: ['Semantic HTML5 Landmarks', 'Accessible Forms & Tables', 'Document Metadata'],
      },
      {
        cat: 'web-development',
        title: 'CSS Web Design',
        slug: 'css-web-design',
        code: 'TTH-CSS',
        level: 'Foundation — Level 1',
        hours: 28,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_WEB,
        desc: 'Style modern web interfaces with Flexbox, CSS Grid, custom properties, typography systems, and responsive breakpoints.',
        objectives: ['Flexbox & CSS Grid', 'Typography & Color Systems', 'Component Styling'],
      },
      {
        cat: 'web-development',
        title: 'JavaScript Fundamentals',
        slug: 'javascript-fundamentals',
        code: 'TTH-JS',
        level: 'Intermediate — Level 2',
        hours: 40,
        passMark: 75,
        certType: 'Certificate of Achievement',
        templateId: 2,
        thumb: IMG_WEB,
        desc: 'Program interactive browser experiences using ES6+ syntax, DOM manipulation, events, and asynchronous fetch APIs.',
        objectives: ['ES6+ Language Core', 'DOM & Event Architecture', 'Async Fetch & JSON APIs'],
      },
      {
        cat: 'web-development',
        title: 'Responsive Web Design',
        slug: 'responsive-web-design',
        code: 'TTH-RWD',
        level: 'Intermediate — Level 2',
        hours: 30,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_WEB,
        desc: 'Architect mobile-first web layouts that adapt seamlessly across smartphones, tablets, laptops, and wide monitors.',
        objectives: ['Fluid Grids & Media Queries', 'Mobile Navigation Patterns', 'Cross-Device Testing'],
      },
      {
        cat: 'web-development',
        title: 'PHP and MySQL Fundamentals',
        slug: 'php-and-mysql-fundamentals',
        code: 'TTH-PHP',
        level: 'Intermediate — Level 2',
        hours: 42,
        passMark: 75,
        certType: 'Certificate of Achievement',
        templateId: 2,
        thumb: IMG_WEB,
        desc: 'Build dynamic server-rendered web applications with PHP, prepared SQL statements, sessions, and CRUD architecture.',
        objectives: ['Server-Side PHP Logic', 'Prepared MySQL Queries', 'Authentication & Forms'],
      },
      {
        cat: 'web-development',
        title: 'Full-Stack Web Development Fundamentals',
        slug: 'full-stack-web-development-fundamentals',
        code: 'TTH-FSWD',
        level: 'Professional',
        hours: 80,
        passMark: 80,
        certType: 'Professional Certificate',
        templateId: 3,
        thumb: IMG_WEB,
        desc: 'End-to-end engineering program covering modern front-end frameworks, REST APIs, relational databases, and deployment.',
        objectives: ['Frontend Component Engineering', 'REST API Architecture', 'Database Design & Security'],
      },

      // Graphic Design
      {
        cat: 'graphic-design',
        title: 'Graphic Design Fundamentals',
        slug: 'graphic-design-fundamentals',
        code: 'TTH-GD1',
        level: 'Foundation — Level 1',
        hours: 25,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_DATA,
        desc: 'Learn composition, grid systems, color theory, typographic contrast, and visual brand consistency.',
        objectives: ['Layout Grids & Balance', 'Color Psychology & Contrast', 'Typography Pairing'],
      },
      {
        cat: 'graphic-design',
        title: 'Adobe Photoshop Essentials',
        slug: 'adobe-photoshop-essentials',
        code: 'TTH-PS',
        level: 'Intermediate — Level 2',
        hours: 32,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_DATA,
        desc: 'Master non-destructive layers, masking, photo retouching, color grading, and export optimization.',
        objectives: ['Layers & Smart Objects', 'Masking & Compositing', 'Print & Web Export'],
      },
      {
        cat: 'graphic-design',
        title: 'Adobe Illustrator Essentials',
        slug: 'adobe-illustrator-essentials',
        code: 'TTH-AI',
        level: 'Intermediate — Level 2',
        hours: 32,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 2,
        thumb: IMG_DATA,
        desc: 'Create scalable vector logos, icons, typography lockups, and print-ready brand identity assets.',
        objectives: ['Pen Tool & Vector Geometry', 'Brand Mark Construction', 'SVG & Print Workflows'],
      },
      {
        cat: 'graphic-design',
        title: 'Canva Design Essentials',
        slug: 'canva-design-essentials',
        code: 'TTH-CANVA',
        level: 'Foundation — Level 1',
        hours: 16,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_DATA,
        desc: 'Produce clean marketing collateral, presentations, and brand kits rapidly using Canva.',
        objectives: ['Brand Kits & Templates', 'Social Media Formats', 'Print & PDF Exports'],
      },
      {
        cat: 'graphic-design',
        title: 'Digital Poster Design',
        slug: 'digital-poster-design',
        code: 'TTH-POSTER',
        level: 'Foundation — Level 1',
        hours: 18,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_DATA,
        desc: 'Structure high-impact event posters and editorial announcements with clear focal hierarchy.',
        objectives: ['Visual Focal Anchors', 'Print Resolution & Bleed', 'Typographic Hierarchy'],
      },
      {
        cat: 'graphic-design',
        title: 'Social Media Content Design',
        slug: 'social-media-content-design',
        code: 'TTH-SMCD',
        level: 'Intermediate — Level 2',
        hours: 22,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_DATA,
        desc: 'Design cohesive multi-platform carousel campaigns, thumbnails, and visual brand systems.',
        objectives: ['Aspect Ratio Systems', 'Carousel Storytelling', 'Brand Consistency'],
      },

      // IT Support & Computer Technician
      {
        cat: 'it-support-computer-technician',
        title: 'Computer Hardware Fundamentals',
        slug: 'computer-hardware-fundamentals',
        code: 'TTH-HW1',
        level: 'Foundation — Level 1',
        hours: 32,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_HW,
        desc: 'Identify, assemble, and test CPUs, motherboards, RAM, NVMe storage, power supplies, and cooling systems.',
        objectives: ['Motherboard & CPU Architecture', 'Memory & Storage Technologies', 'ESD Safety & Assembly'],
      },
      {
        cat: 'it-support-computer-technician',
        title: 'Computer Maintenance and Troubleshooting',
        slug: 'computer-maintenance-and-troubleshooting',
        code: 'TTH-CMT',
        level: 'Intermediate — Level 2',
        hours: 36,
        passMark: 75,
        certType: 'Certificate of Achievement',
        templateId: 2,
        thumb: IMG_HW,
        desc: 'Diagnose POST errors, thermal throttling, storage failures, driver conflicts, and preventive maintenance.',
        objectives: ['Systematic Fault Isolation', 'Hardware Diagnostics', 'Preventive Maintenance'],
      },
      {
        cat: 'it-support-computer-technician',
        title: 'Windows Installation and Configuration',
        slug: 'windows-installation-and-configuration',
        code: 'TTH-WIC',
        level: 'Intermediate — Level 2',
        hours: 24,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_HW,
        desc: 'Perform clean UEFI/GPT OS deployments, disk partitioning, driver provisioning, and recovery backups.',
        objectives: ['UEFI & Disk Partitioning', 'Driver & Update Deployment', 'System Imaging & Recovery'],
      },
      {
        cat: 'it-support-computer-technician',
        title: 'Software Installation and Troubleshooting',
        slug: 'software-installation-and-troubleshooting',
        code: 'TTH-SIT',
        level: 'Foundation — Level 1',
        hours: 20,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_HW,
        desc: 'Manage enterprise software packages, resolve dependency errors, and audit startup services.',
        objectives: ['Package Deployment', 'Dependency & Crash Logs', 'Service Optimization'],
      },
      {
        cat: 'it-support-computer-technician',
        title: 'IT Support Fundamentals',
        slug: 'it-support-fundamentals',
        code: 'TTH-ITS',
        level: 'Foundation — Level 1',
        hours: 30,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_HW,
        desc: 'Deliver structured helpdesk support, ticketing triage, remote diagnostics, and clear user communication.',
        objectives: ['Helpdesk Triage Workflows', 'Remote Support Tools', 'Incident Documentation'],
      },
      {
        cat: 'it-support-computer-technician',
        title: 'Computer Networking Fundamentals',
        slug: 'computer-networking-fundamentals',
        code: 'TTH-CNF',
        level: 'Intermediate — Level 2',
        hours: 38,
        passMark: 75,
        certType: 'Certificate of Achievement',
        templateId: 2,
        thumb: IMG_WEB,
        desc: 'Understand TCP/IP, subnetting, DNS, DHCP, switching, routing, and wireless LAN troubleshooting.',
        objectives: ['OSI & TCP/IP Models', 'IPv4 Subnetting & DHCP', 'LAN/Wi-Fi Diagnostics'],
      },
      {
        cat: 'it-support-computer-technician',
        title: 'Computer Technician Essentials',
        slug: 'computer-technician-essentials',
        code: 'TTH-CTE',
        level: 'Professional',
        hours: 65,
        passMark: 80,
        certType: 'Professional Certificate',
        templateId: 3,
        thumb: IMG_HW,
        desc: 'Complete technician qualification combining hardware repair, OS deployment, networking, and enterprise IT support.',
        objectives: ['Full Workstation Servicing', 'OS & Network Commissioning', 'Field Technician Standards'],
      },

      // Cybersecurity
      {
        cat: 'cybersecurity',
        title: 'Cybersecurity Fundamentals',
        slug: 'cybersecurity-fundamentals',
        code: 'TTH-CYB1',
        level: 'Foundation — Level 1',
        hours: 35,
        passMark: 75,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_WEB,
        desc: 'Understand the CIA triad, threat actors, malware taxonomy, encryption fundamentals, and defensive controls.',
        objectives: ['CIA Triad & Risk Management', 'Threat & Malware Analysis', 'Access Control & Encryption'],
      },
      {
        cat: 'cybersecurity',
        title: 'Internet Safety and Digital Security',
        slug: 'internet-safety-and-digital-security',
        code: 'TTH-ISDS',
        level: 'Foundation — Level 1',
        hours: 18,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_WEB,
        desc: 'Protect personal and workplace accounts from social engineering, credential stuffing, and unsafe networks.',
        objectives: ['Phishing Detection', 'Safe Wi-Fi & VPN Usage', 'Device Hardening'],
      },
      {
        cat: 'cybersecurity',
        title: 'Password and Account Security',
        slug: 'password-and-account-security',
        code: 'TTH-PAS',
        level: 'Foundation — Level 1',
        hours: 14,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_WEB,
        desc: 'Deploy password managers, hardware security keys, MFA, and recovery hygiene across critical accounts.',
        objectives: ['Multi-Factor Authentication', 'Passkeys & Vaults', 'Breach Response'],
      },
      {
        cat: 'cybersecurity',
        title: 'Network Security Fundamentals',
        slug: 'network-security-fundamentals',
        code: 'TTH-NSF',
        level: 'Intermediate — Level 2',
        hours: 40,
        passMark: 75,
        certType: 'Certificate of Achievement',
        templateId: 2,
        thumb: IMG_WEB,
        desc: 'Configure firewalls, IDS/IPS rules, VLAN segmentation, TLS inspection, and secure remote access.',
        objectives: ['Firewall & ACL Policies', 'Network Segmentation', 'Traffic Monitoring'],
      },
      {
        cat: 'cybersecurity',
        title: 'Ethical Hacking Fundamentals',
        slug: 'ethical-hacking-fundamentals',
        code: 'TTH-EHF',
        level: 'Advanced — Level 3',
        hours: 48,
        passMark: 80,
        certType: 'Certificate of Achievement',
        templateId: 2,
        thumb: IMG_WEB,
        desc: 'Conduct authorized reconnaissance, vulnerability scanning, web app testing, and responsible remediation reporting.',
        objectives: ['Authorized Reconnaissance', 'OWASP Top 10 Testing', 'Vulnerability Reporting'],
      },
      {
        cat: 'cybersecurity',
        title: 'Cybersecurity Essentials',
        slug: 'cybersecurity-essentials',
        code: 'TTH-CYBPRO',
        level: 'Professional',
        hours: 70,
        passMark: 80,
        certType: 'Professional Certificate',
        templateId: 3,
        thumb: IMG_WEB,
        desc: 'Professional certification program spanning security operations, incident response, identity defense, and governance.',
        objectives: ['SOC Monitoring & Triage', 'Incident Response Playbooks', 'Enterprise Security Governance'],
      },

      // Data & Database
      {
        cat: 'data-database',
        title: 'Data Analysis Fundamentals',
        slug: 'data-analysis-fundamentals',
        code: 'TTH-DAF',
        level: 'Foundation — Level 1',
        hours: 32,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_DATA,
        desc: 'Clean datasets, compute summary statistics, spot trends, and communicate actionable findings.',
        objectives: ['Data Cleaning Workflows', 'Descriptive Metrics', 'Analytical Storytelling'],
      },
      {
        cat: 'data-database',
        title: 'Excel for Data Analysis',
        slug: 'excel-for-data-analysis',
        code: 'TTH-EDA',
        level: 'Intermediate — Level 2',
        hours: 34,
        passMark: 75,
        certType: 'Certificate of Achievement',
        templateId: 2,
        thumb: IMG_DATA,
        desc: 'Use Power Query, PivotTables, statistical functions, and KPI modeling to analyze business datasets.',
        objectives: ['Power Query ETL', 'KPI Dashboards', 'Statistical Modeling'],
      },
      {
        cat: 'data-database',
        title: 'Database Fundamentals',
        slug: 'database-fundamentals',
        code: 'TTH-DBF',
        level: 'Foundation — Level 1',
        hours: 28,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_DATA,
        desc: 'Understand entity-relationship modeling, normalization (1NF–3NF), primary/foreign keys, and ACID transactions.',
        objectives: ['ER Diagramming', 'Schema Normalization', 'Referential Integrity'],
      },
      {
        cat: 'data-database',
        title: 'SQL Fundamentals',
        slug: 'sql-fundamentals',
        code: 'TTH-SQL',
        level: 'Intermediate — Level 2',
        hours: 36,
        passMark: 75,
        certType: 'Certificate of Achievement',
        templateId: 2,
        thumb: IMG_DATA,
        desc: 'Write expressive SELECT queries, JOINs, aggregations, CTEs, and safe parameterized DML statements.',
        objectives: ['Relational JOINs & Grouping', 'Subqueries & CTEs', 'Indexing & Query Tuning'],
      },
      {
        cat: 'data-database',
        title: 'Digital Business Skills',
        slug: 'digital-business-skills',
        code: 'TTH-DBS',
        level: 'Foundation — Level 1',
        hours: 24,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_DATA,
        desc: 'Apply digital operations, analytics literacy, online commerce tools, and financial spreadsheets in business.',
        objectives: ['Digital Operations', 'Business Analytics', 'Customer Systems'],
      },

      // Programming & App Development
      {
        cat: 'programming-app-development',
        title: 'Programming Fundamentals',
        slug: 'programming-fundamentals',
        code: 'TTH-PROG1',
        level: 'Foundation — Level 1',
        hours: 34,
        passMark: 70,
        certType: 'Certificate of Completion',
        templateId: 1,
        thumb: IMG_WEB,
        desc: 'Master computational thinking, variables, control flow, functions, data structures, and debugging.',
        objectives: ['Algorithms & Flow Control', 'Modular Functions', 'Debugging Techniques'],
      },
      {
        cat: 'programming-app-development',
        title: 'Python Fundamentals',
        slug: 'python-fundamentals',
        code: 'TTH-PY1',
        level: 'Intermediate — Level 2',
        hours: 44,
        passMark: 75,
        certType: 'Certificate of Achievement',
        templateId: 2,
        thumb: IMG_WEB,
        desc: 'Build clean Python scripts, object-oriented modules, file processors, and API integrations.',
        objectives: ['Pythonic Data Structures', 'OOP & Modules', 'File & API Automation'],
      },
      {
        cat: 'programming-app-development',
        title: 'Java Fundamentals',
        slug: 'java-fundamentals',
        code: 'TTH-JAVA',
        level: 'Intermediate — Level 2',
        hours: 46,
        passMark: 75,
        certType: 'Certificate of Achievement',
        templateId: 2,
        thumb: IMG_WEB,
        desc: 'Develop strongly typed object-oriented applications using Java classes, interfaces, collections, and exceptions.',
        objectives: ['Strong Typing & OOP', 'Collections Framework', 'Exception Handling'],
      },
      {
        cat: 'programming-app-development',
        title: 'Android Development Fundamentals',
        slug: 'android-development-fundamentals',
        code: 'TTH-AND',
        level: 'Advanced — Level 3',
        hours: 52,
        passMark: 75,
        certType: 'Certificate of Achievement',
        templateId: 2,
        thumb: IMG_WEB,
        desc: 'Build responsive native Android apps with Kotlin, Jetpack Compose UI, lifecycle management, and local persistence.',
        objectives: ['Kotlin & Compose UI', 'Activity & State Lifecycle', 'Local Storage & APIs'],
      },
      {
        cat: 'programming-app-development',
        title: 'Flutter App Development',
        slug: 'flutter-app-development',
        code: 'TTH-FLT',
        level: 'Advanced — Level 3',
        hours: 50,
        passMark: 75,
        certType: 'Certificate of Achievement',
        templateId: 2,
        thumb: IMG_WEB,
        desc: 'Create cross-platform iOS and Android applications from a single Dart codebase with responsive widgets.',
        objectives: ['Dart & Widget Trees', 'Navigation & State', 'Cross-Platform Builds'],
      },
      {
        cat: 'programming-app-development',
        title: 'Mobile App Development Essentials',
        slug: 'mobile-app-development-essentials',
        code: 'TTH-MOBPRO',
        level: 'Professional',
        hours: 68,
        passMark: 80,
        certType: 'Professional Certificate',
        templateId: 3,
        thumb: IMG_WEB,
        desc: 'End-to-end mobile engineering covering UI architecture, offline sync, authentication, testing, and store release.',
        objectives: ['Mobile UX Architecture', 'Offline Sync & Auth', 'Production App Deployment'],
      },
    ];

    const insertCourse = db.prepare(
      `INSERT INTO courses (
        category_id, instructor_id, title, slug, course_code, level,
        description, learning_objectives, duration_hours, pass_mark,
        certificate_type, template_id, thumbnail_url, status, is_demo
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', 0)`
    );

    const insertModule = db.prepare(
      `INSERT INTO course_modules (course_id, title, description, order_index) VALUES (?, ?, ?, ?)`
    );
    const insertLesson = db.prepare(
      `INSERT INTO lessons (module_id, title, content_markdown, video_url, attachment_name, notes, duration_minutes, order_index)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const insertAssessment = db.prepare(
      `INSERT INTO assessments (course_id, title, instructions, time_limit_minutes, max_attempts, pass_mark, randomize_questions, randomize_options)
       VALUES (?, ?, ?, ?, 3, ?, 1, 1)`
    );
    const insertQuestion = db.prepare(
      `INSERT INTO questions (assessment_id, question_text, question_type, options_json, correct_answers_json, explanation, points, order_index)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
    );

    let cfCourseId = 0;

    for (const c of catalog) {
      const catId = catMap.get(c.cat)!;
      const res = insertCourse.run(
        catId,
        null,
        c.title,
        c.slug,
        c.code,
        c.level,
        c.desc,
        JSON.stringify(c.objectives),
        c.hours,
        c.passMark,
        c.certType,
        c.templateId,
        c.thumb
      );
      const courseId = Number(res.lastInsertRowid);

      if (c.slug === 'computer-fundamentals') {
        cfCourseId = courseId;
        // Exact 5-module curriculum from Section 7
        const cfModules = [
          {
            title: 'Module 1 — Introduction to Computers',
            desc: 'History, classification of computers, data vs information, and modern digital ecosystems.',
            lessons: [
              ['What Is a Computer System?', 'A computer is an electronic programmable device that accepts raw data (input), processes it according to stored instructions, produces meaningful output, and stores results for future use.\n\n### Core Information Processing Cycle\n1. **Input**: Keyboard, mouse, scanner, microphone.\n2. **Processing**: Central Processing Unit (CPU) executing arithmetic and logic operations.\n3. **Output**: Display monitors, printers, speakers.\n4. **Storage**: Primary memory (RAM) and secondary storage (NVMe SSD, HDD).', 25],
              ['Types of Computers & Digital Devices', 'Modern computing spans embedded microcontrollers, smartphones, laptops, workstations, enterprise servers, and cloud data centers. Selecting the right form factor depends on compute throughput, portability, and reliability requirements.', 20],
            ],
          },
          {
            title: 'Module 2 — Computer Hardware',
            desc: 'Physical architecture: motherboard, CPU, RAM, storage devices, and peripherals.',
            lessons: [
              ['CPU, Motherboard, and RAM Explained', 'The **motherboard** interconnects every subsystem via high-speed buses. The **CPU** fetches, decodes, and executes instructions using clock cycles measured in GHz. **RAM** (Random Access Memory) provides volatile, ultra-fast working memory for active applications.', 30],
              ['Storage Technologies: SSD vs HDD', 'Solid State Drives (NVMe/SATA SSDs) store data on NAND flash memory with zero moving parts, delivering fast boot times and random read/write speeds compared to magnetic spinning Hard Disk Drives (HDDs).', 25],
            ],
          },
          {
            title: 'Module 3 — Software and Operating Systems',
            desc: 'System software, application software, file hierarchies, and OS utilities.',
            lessons: [
              ['Operating Systems & Resource Management', 'An Operating System (Windows, Linux, macOS) manages hardware scheduling, memory allocation, device drivers, file systems (NTFS, ext4, APFS), and user permissions.', 30],
              ['File Systems, Extensions, and Backups', 'Organize project directories logically, distinguish file extensions (.docx, .xlsx, .pdf, .png, .zip), and follow the **3-2-1 backup rule**: 3 copies, 2 media types, 1 offsite location.', 25],
            ],
          },
          {
            title: 'Module 4 — Internet and Email',
            desc: 'Web protocols, DNS, browsers, professional email etiquette, and cloud collaboration.',
            lessons: [
              ['How the Internet Works (DNS, HTTP/HTTPS)', 'Every device on the internet communicates using IP addresses. The **Domain Name System (DNS)** translates human-readable domain names into IP addresses, while **HTTPS** encrypts browser traffic using TLS certificates.', 25],
              ['Professional Email & Cloud Productivity', 'Use clear subject lines, distinguish To/CC/BCC appropriately, verify recipient addresses before sending attachments, and organize cloud drives with least-privilege sharing permissions.', 20],
            ],
          },
          {
            title: 'Module 5 — Computer Security',
            desc: 'Passwords, multi-factor authentication, phishing defense, and malware prevention.',
            lessons: [
              ['Account Security, Passwords & MFA', 'Never reuse passwords across services. Use a password manager to generate unique 14+ character passphrases and enable **Multi-Factor Authentication (MFA)** via authenticator apps or hardware security keys.', 25],
              ['Recognizing Phishing & Malware Threats', 'Inspect sender domains carefully, avoid urgent links asking for credentials, keep your operating system patched, and maintain active endpoint protection.', 25],
            ],
          },
        ];

        cfModules.forEach((m, idx) => {
          const mRes = insertModule.run(courseId, m.title, m.desc, idx + 1);
          m.lessons.forEach(([lTitle, lContent, mins], lIdx) => {
            insertLesson.run(
              mRes.lastInsertRowid,
              lTitle,
              lContent,
              '',
              `${c.code}-M${idx + 1}-Study-Guide.txt`,
              `Key takeaway for ${lTitle}: review core definitions before taking the final certification assessment.`,
              mins,
              lIdx + 1
            );
          });
        });

        const assessRes = insertAssessment.run(
          courseId,
          'Computer Fundamentals — Final Certification Exam',
          'Complete all questions to demonstrate mastery of computer hardware, operating systems, internet protocols, and digital security. Required pass mark: 70%.',
          25,
          70
        );
        const aId = assessRes.lastInsertRowid;
        const cfQuestions = [
          ['Which component is responsible for executing arithmetic and logic instructions in a computer?', 'mcq_single', ['Central Processing Unit (CPU)', 'Power Supply Unit (PSU)', 'Optical Drive', 'Monitor'], ['Central Processing Unit (CPU)'], 'The CPU fetches, decodes, and executes instructions using its Arithmetic Logic Unit (ALU) and Control Unit.'],
          ['Which type of memory is volatile and loses its contents when power is turned off?', 'mcq_single', ['RAM (Random Access Memory)', 'NVMe SSD', 'Hard Disk Drive (HDD)', 'USB Flash Drive'], ['RAM (Random Access Memory)'], 'RAM stores active working data temporarily while powered on.'],
          ['HTTPS encrypts communication between a web browser and server using TLS.', 'true_false', ['True', 'False'], ['True'], 'HTTPS wraps HTTP inside TLS encryption to protect data in transit.'],
          ['Select ALL examples of input devices.', 'mcq_multi', ['Keyboard', 'Optical Mouse', 'Printer', 'Microphone'], ['Keyboard', 'Optical Mouse', 'Microphone'], 'Keyboards, mice, and microphones send data into the computer; printers are output devices.'],
          ['What does DNS stand for in internet networking?', 'mcq_single', ['Domain Name System', 'Digital Network Storage', 'Dynamic Node Server', 'Data Navigation Service'], ['Domain Name System'], 'DNS translates human-readable domain names like techtalkhub.com into IP addresses.'],
          ['Which backup strategy is considered an industry best practice?', 'mcq_single', ['3-2-1 Backup Rule', 'Storing a single copy on the desktop', 'Deleting old files weekly', 'Sharing passwords over email'], ['3-2-1 Backup Rule'], 'Three copies on two different media types with one copy offsite protects against hardware failure and disasters.'],
          ['Multi-Factor Authentication (MFA) adds an extra verification layer beyond just a password.', 'true_false', ['True', 'False'], ['True'], 'MFA combines something you know (password) with something you have (authenticator/key) or are.'],
          ['Which storage device uses flash memory with no moving mechanical parts?', 'mcq_single', ['Solid State Drive (SSD)', 'Magnetic Tape Drive', 'Spinning Hard Disk Drive (HDD)', 'Floppy Disk'], ['Solid State Drive (SSD)'], 'SSDs use NAND flash memory chips rather than spinning magnetic platters.'],
        ];
        cfQuestions.forEach((q, qIdx) => {
          insertQuestion.run(
            aId,
            q[0],
            q[1],
            JSON.stringify(q[2]),
            JSON.stringify(q[3]),
            q[4],
            qIdx + 1
          );
        });
      } else {
        // Structured 3-module curriculum & 5-question assessment for every other course in the catalog
        const m1 = insertModule.run(courseId, `Module 1 — Core Foundations of ${c.title}`, `Essential concepts, terminology, and environment setup for ${c.title}.`, 1).lastInsertRowid;
        const m2 = insertModule.run(courseId, `Module 2 — Applied Workflows & Implementation`, `Hands-on techniques, best practices, and structured exercises.`, 2).lastInsertRowid;
        const m3 = insertModule.run(courseId, `Module 3 — Real-World Mastery & Review`, `Production standards, troubleshooting, and certification readiness.`, 3).lastInsertRowid;

        insertLesson.run(m1, `Introduction & Core Architecture`, `### Welcome to ${c.title}\n\n${c.desc}\n\n### Learning Objectives\n${c.objectives.map((o) => `- ${o}`).join('\n')}\n\nTake time to review each objective and complete the practice checklist below before moving to Module 2.`, '', `${c.code}-Syllabus.txt`, 'Review all module objectives before starting practical labs.', 25, 1);
        insertLesson.run(m1, `Essential Tools & Setup`, `Configure a clean, reliable workspace for ${c.title}. Verify tool versions, organize workspace folders, and follow institutional file-naming conventions.`, '', '', '', 20, 2);
        insertLesson.run(m2, `Core Techniques & Practical Patterns`, `Apply structured problem-solving in ${c.title}. Break complex tasks into verifiable steps, test edge cases early, and document your outputs clearly.`, '', '', '', 35, 1);
        insertLesson.run(m2, `Common Pitfalls & Quality Assurance`, `Learn how professionals audit their work for accuracy, security, performance, and maintainability before final delivery.`, '', '', '', 30, 2);
        insertLesson.run(m3, `Capstone Review & Assessment Preparation`, `Consolidate everything covered across ${c.title}. Ensure all previous lessons are marked complete and review your notes prior to attempting the final assessment (Pass mark: ${c.passMark}%).`, '', '', '', 25, 1);

        const assessRes = insertAssessment.run(
          courseId,
          `${c.title} — Final Assessment`,
          `Pass mark required for certification: ${c.passMark}%. Questions and answer choices are randomized per attempt.`,
          20,
          c.passMark
        );
        const aId = assessRes.lastInsertRowid;
        const baseQs = [
          [`Which statement best describes the primary focus of ${c.title}?`, 'mcq_single', [c.objectives[0] || 'Core practical mastery', 'Unrelated analog hardware', 'Random unverified guessing', 'Manual paper filing only'], [c.objectives[0] || 'Core practical mastery'], `${c.title} focuses directly on ${c.objectives[0] || 'structured technical proficiency'}.`],
          [`Completing all required lessons and passing with at least ${c.passMark}% is required to earn a verified TechTalkHub certificate.`, 'true_false', ['True', 'False'], ['True'], `TechTalkHub enforces both 100% lesson completion and a minimum score of ${c.passMark}%.`],
          [`Which of the following are core learning outcomes in ${c.title}?`, 'mcq_multi', [c.objectives[0] || 'Technical accuracy', c.objectives[1] || 'Structured workflows', 'Ignoring quality checks', 'Sharing account passwords'], [c.objectives[0] || 'Technical accuracy', c.objectives[1] || 'Structured workflows'], 'Professional competence combines foundational accuracy with structured execution.'],
          [`Why should every output in ${c.title} be validated against quality standards before final delivery?`, 'mcq_single', ['To prevent errors, security risks, and rework', 'To slow down project delivery unnecessarily', 'To avoid documenting processes', 'To bypass verification requirements'], ['To prevent errors, security risks, and rework'], 'Consistent verification ensures reliable, production-grade results.'],
          [`A TechTalkHub certificate issued for ${c.title} can be verified publicly via its Certificate ID and QR code.`, 'true_false', ['True', 'False'], ['True'], 'Every issued certificate carries a unique Certificate ID and scannable QR verification link.'],
        ];
        baseQs.forEach((q, qIdx) => {
          insertQuestion.run(aId, q[0], q[1], JSON.stringify(q[2]), JSON.stringify(q[3]), q[4], qIdx + 1);
        });
      }
    }
  }
}
