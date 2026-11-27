import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Award,
  BookOpen,
  CheckCircle2,
  Mail,
  MapPin,
  Phone,
  QrCode,
  ShieldCheck,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { syncContactToFirestore } from '../lib/firebase';

export function AboutPage() {
  useEffect(() => {
    document.title = 'About TechTalkHub — Technology • Skills • Innovation';
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">
      <div className="space-y-4 max-w-3xl">
        <div className="text-xs font-bold uppercase tracking-widest text-blue-700">
          About TechTalkHub
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
          Practical technology skills backed by verifiable credentials.
        </h1>
        <p className="text-base text-slate-600 leading-relaxed">
          TechTalkHub is an online technology learning and certification platform focused on
          practical competence across computer applications, web software engineering,
          cybersecurity, networking, hardware maintenance, graphic design, and data analysis.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2.5">
          <BookOpen className="w-6 h-6 text-blue-700" />
          <h2 className="font-display text-lg font-bold text-slate-900">Structured Tracks</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Every program combines sequential modules, hands-on study notes, and milestone
            progress tracking before opening the final examination.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2.5">
          <Award className="w-6 h-6 text-blue-700" />
          <h2 className="font-display text-lg font-bold text-slate-900">Earned Assessment</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Certificates require 100% lesson completion, passing the timed assessment against the
            course pass mark, and a verified student portrait photograph.
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-2.5">
          <QrCode className="w-6 h-6 text-blue-700" />
          <h2 className="font-display text-lg font-bold text-slate-900">Open QR Registry</h2>
          <p className="text-sm text-slate-600 leading-relaxed">
            Employers and institutions can scan any issued certificate QR code or enter its unique
            TTH-CF identifier to check live validity or revocation status.
          </p>
        </div>
      </div>

      <div className="bg-slate-900 text-white rounded-2xl p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <h2 className="font-display text-xl font-bold">Ready to start learning?</h2>
          <p className="text-sm text-slate-300">
            Explore our published technical tracks or verify an existing credential.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 shrink-0">
          <Link
            to="/courses"
            className="px-4 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            Browse Courses
          </Link>
          <Link
            to="/verify"
            className="px-4 py-2.5 text-sm font-semibold bg-white text-slate-900 hover:bg-slate-100 rounded-lg"
          >
            Verify Certificate
          </Link>
        </div>
      </div>
    </div>
  );
}

export function CertificationProcessPage() {
  useEffect(() => {
    document.title = 'Certification Process & Verification | TechTalkHub';
  }, []);

  const steps = [
    ['01', 'Enroll in a Course', 'Register a student account and enroll in any published TechTalkHub track.'],
    ['02', 'Upload Official Photo', 'Add a clear portrait photo in your Student Profile for your certificate record.'],
    ['03', 'Complete All Modules', 'Work through every module and mark all lessons complete (100% course progress).'],
    ['04', 'Pass Final Assessment', 'Score at or above the course pass mark within the allotted exam time and attempts.'],
    ['05', 'Unique Credential Issued', 'Receive a tamper-evident PDF and web credential with a unique TTH-CF identifier.'],
    ['06', 'Public QR Verification', 'Employers scan your QR code or query /verify/:certificateId to confirm authenticity.'],
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
      <div className="space-y-3 max-w-3xl">
        <div className="text-xs font-bold uppercase tracking-widest text-blue-700">
          Credential Governance
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-slate-900">
          How TechTalkHub Certification Works
        </h1>
        <p className="text-base text-slate-600">
          Every TechTalkHub certificate is backed by completed coursework, graded assessments, and
          real-time public verification.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {steps.map(([num, title, desc]) => (
          <div key={num} className="bg-white border border-slate-200 rounded-xl p-6 space-y-2">
            <div className="font-mono text-xs font-bold text-blue-700">STEP {num}</div>
            <h2 className="font-display text-lg font-bold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-600 leading-relaxed">{desc}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
        <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm">
          <ShieldCheck className="w-5 h-5" />
          What Employers See During Verification
        </div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-slate-700 pt-1">
          <li className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            Live status: VALID, REVOKED, or NOT FOUND
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            Student name & verified official photograph
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            Course title, level, hours & exam score
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            Verified skills & revocation reason (if revoked)
          </li>
        </ul>
      </div>
    </div>
  );
}

export function ContactPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Contact TechTalkHub — Verification & Support';
    apiFetch<{ settings: Record<string, string> }>('/api/public/settings')
      .then((res) => setSettings(res.settings || {}))
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setDoneMsg(null);
    try {
      const res = await apiFetch<{ id: number; message: string }>('/api/contact', {
        method: 'POST',
        body: JSON.stringify({ name, email, subject, message }),
      });
      syncContactToFirestore({
        id: String(res.id || Date.now()),
        name,
        email,
        subject,
        message,
      }).catch(() => {});
      setDoneMsg(res.message);
      setName('');
      setEmail('');
      setSubject('');
      setMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send message.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
      <div className="space-y-2 max-w-2xl">
        <div className="text-xs font-bold uppercase tracking-widest text-blue-700">
          Support & Registry Desk
        </div>
        <h1 className="font-display text-3xl font-bold text-slate-900">Contact TechTalkHub</h1>
        <p className="text-sm text-slate-600">
          Reach out for course inquiries, employer credential verification assistance, or institutional
          training support.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <h2 className="font-display text-lg font-bold text-slate-900">Direct Channels</h2>
          <div className="space-y-4 text-sm">
            <div className="flex items-start gap-3">
              <Mail className="w-4 h-4 text-blue-700 mt-1 shrink-0" />
              <div>
                <div className="text-xs font-semibold text-slate-500">Email</div>
                <div className="font-medium text-slate-900">
                  {settings.contact_email || 'support@techtalkhub.org'}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="w-4 h-4 text-blue-700 mt-1 shrink-0" />
              <div>
                <div className="text-xs font-semibold text-slate-500">Phone</div>
                <div className="font-medium text-slate-900">
                  {settings.support_phone || '+255 700 000 000'}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <MapPin className="w-4 h-4 text-blue-700 mt-1 shrink-0" />
              <div>
                <div className="text-xs font-semibold text-slate-500">Timezone</div>
                <div className="font-medium text-slate-900">
                  {settings.default_timezone || 'Africa/Dar_es_Salaam'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <form
          onSubmit={handleSubmit}
          className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4"
        >
          <h2 className="font-display text-lg font-bold text-slate-900">Send a Message</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Email *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Subject *</label>
            <input
              type="text"
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Message *</label>
            <textarea
              rows={4}
              required
              minLength={10}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>

          {doneMsg && <p className="text-sm text-emerald-700 font-medium">{doneMsg}</p>}
          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg cursor-pointer"
          >
            {busy ? 'Sending...' : 'Submit Inquiry'}
          </button>
        </form>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  useEffect(() => {
    document.title = 'Page Not Found | TechTalkHub';
  }, []);

  return (
    <div className="min-h-[65vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-md text-center space-y-4">
        <div className="font-mono text-sm font-bold text-blue-700">ERROR 404</div>
        <h1 className="font-display text-3xl font-bold text-slate-900">Page Not Found</h1>
        <p className="text-sm text-slate-600">
          The page you requested does not exist or may have been moved.
        </p>
        <div className="flex flex-wrap justify-center gap-3 pt-2">
          <Link
            to="/"
            className="px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg"
          >
            Go Home
          </Link>
          <Link
            to="/courses"
            className="px-4 py-2 bg-slate-100 text-slate-800 text-sm font-semibold rounded-lg"
          >
            Browse Courses
          </Link>
          <Link
            to="/verify"
            className="px-4 py-2 bg-slate-100 text-slate-800 text-sm font-semibold rounded-lg"
          >
            Verify Certificate
          </Link>
        </div>
      </div>
    </div>
  );
}
