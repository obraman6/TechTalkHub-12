import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  QrCode,
  Search,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

interface LandingData {
  stats: {
    totalStudents: number;
    totalCourses: number;
    certificatesIssued: number;
    verificationRequests: number;
  };
  categories: Array<{
    id: number;
    name: string;
    slug: string;
    description: string;
    course_count: number;
  }>;
  popularCourses: Array<{
    id: number;
    title: string;
    slug: string;
    course_code: string;
    level: string;
    duration_hours: number;
    certificate_type: string;
    thumbnail_url: string;
    description: string;
    category_name: string;
    instructor_name: string;
    module_count: number;
    lesson_count: number;
    enrollment_count: number;
  }>;
}

export function LandingPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<LandingData | null>(null);
  const [certQuery, setCertQuery] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch<LandingData>('/api/public/landing')
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleVerifySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = certQuery.trim().toUpperCase();
    if (!cleaned) return;
    navigate(`/verify/${encodeURIComponent(cleaned)}`);
  };

  return (
    <div className="bg-slate-50">
      {/* Hero Section */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
              <div className="text-sm font-semibold text-blue-700 tracking-wide">
                TechTalkHub • Technology • Skills • Innovation
              </div>
              <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900 leading-[1.12] text-balance">
                Learn Technology. Build Skills. Get Certified.
              </h1>
              <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-xl">
                Master practical computer, software, IT support, data, and cybersecurity
                disciplines. Complete structured lessons, pass formal assessments, and earn
                QR-verified certificates trusted by employers.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link
                  to="/courses"
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
                >
                  Explore Courses
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/verify"
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
                >
                  <QrCode className="w-4 h-4" />
                  Verify Certificate
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold text-blue-700 border border-blue-200 hover:bg-blue-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  Create Account
                </Link>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[280px] sm:min-h-[360px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 relative">
                <img
                  src="/src/assets/images/hero_tech_learning_1795780019909.jpg"
                  alt="TechTalkHub modern technology training studio and engineering desks"
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
                <div className="absolute bottom-5 left-5 right-5 text-white">
                  <div className="text-xs font-medium text-blue-300">
                    Authoritative Credential Verification
                  </div>
                  <div className="font-display text-lg font-bold mt-0.5">
                    Every TechTalkHub certificate includes a unique ID, student portrait, and live QR verification record.
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Full-width Live Database Statistics Row */}
          <div className="mt-10 pt-8 border-t border-slate-200 grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <div className="text-xs font-medium text-slate-500">Registered Students</div>
              <div className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1 tabular-nums">
                {loading ? '—' : data?.stats.totalStudents ?? 0}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Published Courses</div>
              <div className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1 tabular-nums">
                {loading ? '—' : data?.stats.totalCourses ?? 0}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Valid Certificates Issued</div>
              <div className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1 tabular-nums">
                {loading ? '—' : data?.stats.certificatesIssued ?? 0}
              </div>
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500">Verification Checks Logged</div>
              <div className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1 tabular-nums">
                {loading ? '—' : data?.stats.verificationRequests ?? 0}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Prominent Certificate Verification Search Box */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-7 relative z-10">
        <div className="bg-slate-900 text-white rounded-2xl p-6 sm:p-8 shadow-sm border border-slate-800">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            <div className="lg:col-span-5 space-y-1.5">
              <div className="flex items-center gap-2 text-blue-400 text-sm font-semibold">
                <ShieldCheck className="w-4 h-4" />
                Employer & Third-Party Verification
              </div>
              <h2 className="font-display text-xl sm:text-2xl font-bold">
                Verify a TechTalkHub Certificate
              </h2>
              <p className="text-sm text-slate-300">
                Enter a Certificate ID or scan a certificate QR code to inspect the
                authentic database record.
              </p>
            </div>

            <form
              onSubmit={handleVerifySubmit}
              className="lg:col-span-7 flex flex-col sm:flex-row gap-3"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={certQuery}
                  onChange={(e) => setCertQuery(e.target.value)}
                  placeholder="Enter Certificate ID (e.g. TTH-CF-2026-A1B2C3)"
                  aria-label="Enter Certificate ID"
                  className="w-full pl-10 pr-4 py-3 bg-white text-slate-900 placeholder:text-slate-400 rounded-lg font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Verify Certificate
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Course Categories */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
              Course Categories
            </h2>
            <p className="text-slate-600 mt-1">
              Structured pathways from Foundation Level 1 through Professional certification.
            </p>
          </div>
          <Link
            to="/courses"
            className="text-sm font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap"
          >
            View all courses →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(data?.categories || []).map((cat) => (
            <Link
              key={cat.id}
              to={`/courses?category=${encodeURIComponent(cat.slug)}`}
              className="bg-white border border-slate-200 hover:border-blue-600 rounded-xl p-5 transition-colors flex flex-col justify-between gap-3"
            >
              <div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  {cat.name}
                </h3>
                <p className="text-sm text-slate-600 mt-1.5 line-clamp-2">
                  {cat.description}
                </p>
              </div>
              <div className="text-xs font-semibold text-blue-700 tabular-nums">
                {cat.course_count} {cat.course_count === 1 ? 'Course' : 'Courses'}
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Popular Courses */}
      <section className="bg-white border-y border-slate-200 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
                Featured Curriculum
              </h2>
              <p className="text-slate-600 mt-1">
                Explore instructor-led courses with automated assessments and verified credentials.
              </p>
            </div>
            <Link
              to="/courses"
              className="text-sm font-semibold text-blue-700 hover:text-blue-800 whitespace-nowrap"
            >
              Browse full catalog →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(data?.popularCourses || []).map((course) => (
              <div
                key={course.id}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between hover:border-slate-300 transition-colors"
              >
                <div>
                  <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
                    <img
                      src={course.thumbnail_url}
                      alt={course.title}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="p-5 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <span className="font-medium text-blue-700">{course.category_name}</span>
                      <span aria-hidden="true">·</span>
                      <span>{course.level}</span>
                    </div>
                    <h3 className="font-display text-lg font-bold text-slate-900">
                      {course.title}
                    </h3>
                    <p className="text-sm text-slate-600 line-clamp-2">{course.description}</p>
                  </div>
                </div>

                <div className="px-5 pb-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-500 tabular-nums">
                    {course.duration_hours} hrs · {course.lesson_count} lessons ·{' '}
                    {course.enrollment_count} enrolled
                  </div>
                  <Link
                    to={`/courses/${course.slug}`}
                    className="px-3.5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
                  >
                    View Course
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works & Certification Integrity */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="max-w-2xl mb-10">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
            How TechTalkHub Certification Works
          </h2>
          <p className="text-slate-600 mt-2">
            Every certificate is earned through verified completion and backed by an
            auditable database record.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              num: '01',
              icon: UserCheck,
              title: 'Create Profile & Photo',
              desc: 'Register your learner account, verify your email, and upload your official portrait photograph.',
            },
            {
              num: '02',
              icon: BookOpen,
              title: 'Study Structured Modules',
              desc: 'Enroll in Foundation to Professional courses and complete every module and lesson.',
            },
            {
              num: '03',
              icon: CheckCircle2,
              title: 'Pass Formal Exam',
              desc: 'Complete timed, randomized assessments and achieve the required minimum pass mark.',
            },
            {
              num: '04',
              icon: Award,
              title: 'QR-Verified Credential',
              desc: 'Download your A4 PDF certificate featuring your photo, unique ID, and scannable QR code.',
            },
          ].map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.num}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-blue-700">{step.num}</span>
                  <Icon className="w-5 h-5 text-slate-700" />
                </div>
                <h3 className="font-display text-base font-bold text-slate-900">
                  {step.title}
                </h3>
                <p className="text-sm text-slate-600 leading-relaxed">{step.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-slate-900 text-white py-14">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center space-y-5">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-balance">
            Ready to build verifiable technology skills?
          </h2>
          <p className="text-slate-300 text-sm sm:text-base max-w-2xl mx-auto">
            Create your TechTalkHub account today, enroll in your first course, and earn a
            credential employers can verify in seconds.
          </p>
          <div className="flex flex-wrap justify-center gap-3 pt-2">
            <Link
              to="/register"
              className="px-6 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              Get Started Now
            </Link>
            <Link
              to="/courses"
              className="px-6 py-3 text-sm font-semibold text-white border border-slate-700 hover:bg-slate-800 rounded-lg transition-colors"
            >
              Browse Catalog
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
