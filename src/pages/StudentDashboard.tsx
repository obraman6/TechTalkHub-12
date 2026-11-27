import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Award,
  BookOpen,
  Compass,
  ExternalLink,
  FileCheck,
  LayoutDashboard,
  LogOut,
  Settings,
  TrendingUp,
  User,
} from 'lucide-react';
import { CertificateRenderer, type CertificateDisplayData } from '../components/CertificateRenderer';
import { ProfilePhotoUploader } from '../components/ProfilePhotoUploader';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';

type StudentTab =
  | 'dashboard'
  | 'courses'
  | 'progress'
  | 'assessments'
  | 'certificates'
  | 'profile'
  | 'settings';

interface DashboardData {
  profile: {
    user_id: number;
    username: string;
    full_name: string;
    phone: string;
    country: string;
    city: string;
    headline: string;
    bio: string;
    photo_url: string | null;
    public_profile_enabled: number | boolean;
    show_contact_publicly: number | boolean;
  } | null;
  enrollments: Array<{
    id: number;
    course_id: number;
    title: string;
    slug: string;
    course_code: string;
    level: string;
    duration_hours: number;
    category_name: string;
    status: string;
    progress_percent: number;
    total_lessons: number;
    completed_lessons: number;
    last_lesson_title?: string | null;
    enrolled_at: string;
  }>;
  certificates: Array<{
    id: number;
    certificate_id: string;
    certificate_type: string;
    level: string;
    score: number;
    issue_date: string;
    status: string;
    course_title: string;
    duration_hours: number;
    template_name: string;
  }>;
  recentAttempts: Array<{
    id: number;
    course_title: string;
    course_slug: string;
    assessment_title: string;
    score_percent: number;
    correct_count: number;
    total_questions: number;
    passed: number;
    submitted_at: string;
  }>;
}

export function StudentDashboard({ defaultTab }: { defaultTab?: StudentTab } = {}) {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = defaultTab || (searchParams.get('tab') as StudentTab) || 'dashboard';
  const [tab, setTab] = useState<StudentTab>(initialTab);

  useEffect(() => {
    if (defaultTab) setTab(defaultTab);
  }, [defaultTab]);

  const [data, setData] = useState<DashboardData | null>(null);
  const [certsDetailed, setCertsDetailed] = useState<CertificateDisplayData[]>([]);
  const [selectedCert, setSelectedCert] = useState<CertificateDisplayData | null>(null);
  const [skills, setSkills] = useState<Array<{ id: number; skill_name: string; source: string }>>([]);
  const [profileCompletion, setProfileCompletion] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  // Profile form state
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [headline, setHeadline] = useState('');
  const [bio, setBio] = useState('');
  const [publicEnabled, setPublicEnabled] = useState(true);
  const [showContact, setShowContact] = useState(false);
  const [skillsInput, setSkillsInput] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [verifyTokenMsg, setVerifyTokenMsg] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      const [dash, profRes, certsRes] = await Promise.all([
        apiFetch<DashboardData>('/api/student/dashboard'),
        apiFetch<{
          profile: DashboardData['profile'];
          skills: Array<{ id: number; skill_name: string; source: string }>;
          profileCompletionPercent?: number;
        }>('/api/student/profile'),
        apiFetch<{ certificates: CertificateDisplayData[] }>('/api/student/certificates'),
      ]);
      setData(dash);
      setSkills(profRes.skills || []);
      setProfileCompletion(profRes.profileCompletionPercent ?? 0);
      setCertsDetailed(certsRes.certificates || []);
      if (certsRes.certificates?.length && !selectedCert) {
        setSelectedCert(certsRes.certificates[0]);
      }

      if (profRes.profile) {
        setFullName(profRes.profile.full_name || '');
        setUsername(profRes.profile.username || '');
        setPhone(profRes.profile.phone || '');
        setCountry(profRes.profile.country || '');
        setCity(profRes.profile.city || '');
        setHeadline(profRes.profile.headline || '');
        setBio(profRes.profile.bio || '');
        setPublicEnabled(Boolean(profRes.profile.public_profile_enabled));
        setShowContact(Boolean(profRes.profile.show_contact_publicly));
        setSkillsInput(
          (profRes.skills || [])
            .filter((s) => s.source === 'self')
            .map((s) => s.skill_name)
            .join(', ')
        );
      }
    } finally {
      setLoading(false);
    }
  }, [selectedCert]);

  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
    loadAll();
  }, [user, navigate, loadAll]);

  const switchTab = (next: StudentTab) => {
    setTab(next);
    setSearchParams({ tab: next }, { replace: true });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setProfileMsg(null);
    try {
      const parsedSkills = skillsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await apiFetch('/api/student/profile', {
        method: 'PUT',
        body: JSON.stringify({
          fullName,
          username,
          phone,
          country,
          city,
          headline,
          bio,
          publicProfileEnabled: publicEnabled,
          showContactPublicly: showContact,
          skills: parsedSkills,
        }),
      });
      setProfileMsg('Profile saved successfully.');
      await Promise.all([loadAll(), refreshUser()]);
    } catch (err) {
      setProfileMsg(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleVerifyEmailPrompt = async () => {
    try {
      const res = await apiFetch<{ verificationToken: string }>(
        '/api/auth/resend-verification',
        { method: 'POST' }
      );
      await apiFetch('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: res.verificationToken }),
      });
      setVerifyTokenMsg('Email verified successfully.');
      await refreshUser();
    } catch {
      setVerifyTokenMsg('Unable to verify email.');
    }
  };

  const navItems: Array<{ id: StudentTab | 'browse'; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'courses', label: 'My Courses', icon: BookOpen },
    { id: 'browse', label: 'Browse Courses', icon: Compass },
    { id: 'progress', label: 'My Progress', icon: TrendingUp },
    { id: 'assessments', label: 'Assessments', icon: FileCheck },
    { id: 'certificates', label: 'My Certificates', icon: Award },
    { id: 'profile', label: 'My Profile', icon: User },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const completedCourses = (data?.enrollments || []).filter((e) => e.status === 'completed');

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Desktop Sidebar */}
        <aside className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <div className="px-3 py-2 mb-2 border-b border-slate-100">
            <div className="font-display text-sm font-bold text-slate-900 truncate">
              {data?.profile?.full_name || user?.email}
            </div>
            <div className="text-xs text-slate-500">Student Portal</div>
          </div>

          <div className="flex lg:flex-col overflow-x-auto lg:overflow-visible gap-1 pb-2 lg:pb-0">
            {navItems.map((item) => {
              const Icon = item.icon;
              if (item.id === 'browse') {
                return (
                  <Link
                    key={item.id}
                    to="/courses"
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap shrink-0"
                  >
                    <Icon className="w-4 h-4 text-slate-500" />
                    {item.label}
                  </Link>
                );
              }
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => switchTab(item.id as StudentTab)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                    active
                      ? 'bg-blue-50 text-blue-800 font-semibold'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${active ? 'text-blue-700' : 'text-slate-500'}`} />
                  {item.label}
                </button>
              );
            })}

            <button
              type="button"
              onClick={async () => {
                await logout();
                navigate('/');
              }}
              className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-red-700 hover:bg-red-50 whitespace-nowrap shrink-0 cursor-pointer lg:mt-2 lg:border-t lg:border-slate-100 lg:pt-3"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="lg:col-span-9 space-y-6">
          {loading ? (
            <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ) : (
            <>
              {tab === 'dashboard' && (
                <div className="space-y-6">
                  <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h1 className="font-display text-2xl font-bold text-slate-900">
                        Welcome back, {data?.profile?.full_name || 'Learner'}
                      </h1>
                      <p className="text-sm text-slate-600 mt-1">
                        Track your active courses, examination scores, and verified certificates.
                      </p>
                    </div>
                    {data?.profile?.username && (
                      <Link
                        to={`/profile/${encodeURIComponent(data.profile.username)}`}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-blue-700 border border-blue-200 hover:bg-blue-50 rounded-lg whitespace-nowrap"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Public Profile
                      </Link>
                    )}
                  </div>

                  {/* Summary Metrics */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <div className="text-xs text-slate-500">Enrolled Courses</div>
                      <div className="font-display text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                        {data?.enrollments.length || 0}
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <div className="text-xs text-slate-500">Completed Courses</div>
                      <div className="font-display text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                        {completedCourses.length}
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <div className="text-xs text-slate-500">Certificates Earned</div>
                      <div className="font-display text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                        {data?.certificates.length || 0}
                      </div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-5">
                      <div className="text-xs text-slate-500">Exam Attempts</div>
                      <div className="font-display text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                        {data?.recentAttempts.length || 0}
                      </div>
                    </div>
                  </div>

                  {/* Current Courses */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h2 className="font-display text-lg font-bold text-slate-900">
                        Current Courses
                      </h2>
                      <Link to="/courses" className="text-xs font-semibold text-blue-700 hover:underline">
                        Browse more courses →
                      </Link>
                    </div>
                    {(data?.enrollments.length || 0) === 0 ? (
                      <div className="py-8 text-center space-y-3">
                        <p className="text-sm text-slate-600">
                          You have not enrolled in any courses yet.
                        </p>
                        <Link
                          to="/courses"
                          className="inline-block px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg"
                        >
                          Explore Course Catalog
                        </Link>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {data?.enrollments.map((enr) => (
                          <div
                            key={enr.id}
                            className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                          >
                            <div className="space-y-1">
                              <div className="text-xs text-slate-500">
                                {enr.category_name} · {enr.level}
                              </div>
                              <div className="font-display text-base font-bold text-slate-900">
                                {enr.title}
                              </div>
                              <div className="text-xs text-slate-500 tabular-nums">
                                {enr.completed_lessons}/{enr.total_lessons} lessons completed ({enr.progress_percent}%)
                                {enr.last_lesson_title ? ` · Last viewed: ${enr.last_lesson_title}` : ''}
                              </div>
                            </div>
                            <Link
                              to={`/learn/${enr.slug}`}
                              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-blue-700 rounded-lg whitespace-nowrap self-start sm:self-center"
                            >
                              {enr.progress_percent === 100 ? 'Review & Assessment' : 'Continue Learning'}
                            </Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {(tab === 'courses' || tab === 'progress') && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <h2 className="font-display text-xl font-bold text-slate-900">
                    {tab === 'courses' ? 'My Enrolled Courses' : 'Detailed Learning Progress'}
                  </h2>
                  {(data?.enrollments.length || 0) === 0 ? (
                    <div className="py-10 text-center space-y-3">
                      <p className="text-sm text-slate-600">No enrolled courses yet.</p>
                      <Link
                        to="/courses"
                        className="inline-block px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg"
                      >
                        Browse Courses
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {data?.enrollments.map((enr) => (
                        <div key={enr.id} className="border border-slate-200 rounded-xl p-5 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="text-xs text-slate-500">
                                <span className="font-mono">{enr.course_code}</span> · {enr.level}
                              </div>
                              <h3 className="font-display text-lg font-bold text-slate-900">
                                {enr.title}
                              </h3>
                            </div>
                            <Link
                              to={`/learn/${enr.slug}`}
                              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
                            >
                              Open Course
                            </Link>
                          </div>
                          <div>
                            <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                              <span>
                                {enr.completed_lessons} of {enr.total_lessons} lessons completed
                              </span>
                              <span className="tabular-nums">{enr.progress_percent}%</span>
                            </div>
                            <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-700"
                                style={{ width: `${enr.progress_percent}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {tab === 'assessments' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <h2 className="font-display text-xl font-bold text-slate-900">
                    Assessment History & Results
                  </h2>
                  {(data?.recentAttempts.length || 0) === 0 ? (
                    <p className="text-sm text-slate-600 py-6">
                      You have not taken any course assessments yet. Open an enrolled course to take its final exam.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase border-b border-slate-200">
                          <tr>
                            <th className="py-3 pr-4">Course</th>
                            <th className="py-3 pr-4">Score</th>
                            <th className="py-3 pr-4">Status</th>
                            <th className="py-3">Submitted</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {data?.recentAttempts.map((att) => (
                            <tr key={att.id}>
                              <td className="py-3 pr-4 font-semibold text-slate-900">
                                <Link to={`/learn/${att.course_slug}`} className="hover:text-blue-700">
                                  {att.course_title}
                                </Link>
                              </td>
                              <td className="py-3 pr-4 tabular-nums">
                                {att.score_percent}% ({att.correct_count}/{att.total_questions})
                              </td>
                              <td className="py-3 pr-4">
                                <span
                                  className={`font-semibold text-xs ${
                                    att.passed ? 'text-emerald-700' : 'text-red-700'
                                  }`}
                                >
                                  {att.passed ? 'PASSED' : 'NOT PASSED'}
                                </span>
                              </td>
                              <td className="py-3 text-slate-500 tabular-nums">
                                {new Date(att.submitted_at).toLocaleDateString()}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {tab === 'certificates' && (
                <div className="space-y-6">
                  <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                    <h2 className="font-display text-xl font-bold text-slate-900">
                      My Earned Certificates
                    </h2>
                    {certsDetailed.length === 0 ? (
                      <div className="py-10 text-center space-y-2">
                        <p className="text-sm text-slate-600">
                          You have not earned any certificates yet.
                        </p>
                        <p className="text-xs text-slate-500">
                          Complete 100% of a course, pass the assessment, and ensure your profile photo is uploaded.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {certsDetailed.map((c) => (
                          <button
                            key={c.certificate_id}
                            type="button"
                            onClick={() => setSelectedCert(c)}
                            className={`text-left p-4 border rounded-xl transition-colors cursor-pointer ${
                              selectedCert?.certificate_id === c.certificate_id
                                ? 'border-blue-600 bg-blue-50/50'
                                : 'border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="font-mono font-bold text-blue-700">
                                {c.certificate_id}
                              </span>
                              <span
                                className={`font-semibold ${
                                  c.status === 'VALID' ? 'text-emerald-700' : 'text-red-700'
                                }`}
                              >
                                {c.status}
                              </span>
                            </div>
                            <div className="font-display font-bold text-slate-900 mt-1">
                              {c.course_title}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5">
                              {c.certificate_type} · {c.level}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {selectedCert && <CertificateRenderer certificate={selectedCert} />}
                </div>
              )}

              {tab === 'profile' && (
                <div className="space-y-6">
                  <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-2.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold text-slate-900">
                        Profile Completion
                      </span>
                      <span className="font-mono font-bold text-blue-700 tabular-nums">
                        {profileCompletion}%
                      </span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-700 transition-all"
                        style={{ width: `${profileCompletion}%` }}
                      />
                    </div>
                    <p className="text-xs text-slate-500">
                      Registered: {user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'} ·{' '}
                      Email: {user?.email}
                    </p>
                  </div>

                  <ProfilePhotoUploader
                    currentPhotoUrl={data?.profile?.photo_url || null}
                    fullName={fullName || user?.email || 'Student'}
                    onUpdated={() => {
                      loadAll();
                      refreshUser();
                    }}
                  />

                  <form
                    onSubmit={handleSaveProfile}
                    className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="font-display text-xl font-bold text-slate-900">
                        Student Profile Details
                      </h2>
                      {username && (
                        <Link
                          to={`/profile/${encodeURIComponent(username)}`}
                          className="text-xs font-semibold text-blue-700 hover:underline"
                        >
                          View Public Profile →
                        </Link>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Full Name (appears on certificates)
                        </label>
                        <input
                          type="text"
                          required
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Public Username (/profile/username)
                        </label>
                        <input
                          type="text"
                          required
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="w-full px-3.5 py-2 border border-slate-300 rounded-lg font-mono text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Professional Headline
                        </label>
                        <input
                          type="text"
                          value={headline}
                          onChange={(e) => setHeadline(e.target.value)}
                          placeholder="e.g. Certified IT Support Specialist"
                          className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Phone Number
                        </label>
                        <input
                          type="tel"
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Country
                        </label>
                        <input
                          type="text"
                          value={country}
                          onChange={(e) => setCountry(e.target.value)}
                          className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          City
                        </label>
                        <input
                          type="text"
                          value={city}
                          onChange={(e) => setCity(e.target.value)}
                          className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Short Biography
                      </label>
                      <textarea
                        rows={3}
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Additional Skills (comma-separated)
                      </label>
                      <input
                        type="text"
                        value={skillsInput}
                        onChange={(e) => setSkillsInput(e.target.value)}
                        placeholder="Windows Administration, Networking, Python"
                        className="w-full px-3.5 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                      {skills.some((s) => s.source === 'verified_course') && (
                        <p className="text-xs text-emerald-700 mt-1">
                          Verified course skills:{' '}
                          {skills
                            .filter((s) => s.source === 'verified_course')
                            .map((s) => s.skill_name)
                            .join(', ')}
                        </p>
                      )}
                    </div>

                    <div className="space-y-2 pt-2 border-t border-slate-100 text-sm">
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={publicEnabled}
                          onChange={(e) => setPublicEnabled(e.target.checked)}
                          className="accent-blue-700"
                        />
                        <span>Enable my public TechTalkHub certification profile</span>
                      </label>
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={showContact}
                          onChange={(e) => setShowContact(e.target.checked)}
                          className="accent-blue-700"
                        />
                        <span>Display my email and phone publicly on my certification profile</span>
                      </label>
                    </div>

                    {profileMsg && (
                      <p className="text-sm font-medium text-blue-700">{profileMsg}</p>
                    )}

                    <button
                      type="submit"
                      disabled={savingProfile}
                      className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg cursor-pointer"
                    >
                      {savingProfile ? 'Saving...' : 'Save Profile Changes'}
                    </button>
                  </form>
                </div>
              )}

              {tab === 'settings' && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <h2 className="font-display text-xl font-bold text-slate-900">
                    Account Settings & Verification
                  </h2>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                      <div>
                        <div className="font-semibold text-slate-900">Account Email</div>
                        <div className="text-slate-600">{user?.email}</div>
                      </div>
                      {user?.email_verified ? (
                        <span className="text-xs font-semibold text-emerald-700">
                          Email Verified ✓
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={handleVerifyEmailPrompt}
                          className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 rounded-lg cursor-pointer"
                        >
                          Verify Email Now
                        </button>
                      )}
                    </div>
                    {verifyTokenMsg && (
                      <p className="text-sm text-emerald-700 font-medium">{verifyTokenMsg}</p>
                    )}

                    <div className="flex items-center justify-between p-4 border border-slate-200 rounded-lg">
                      <div>
                        <div className="font-semibold text-slate-900">Password Management</div>
                        <div className="text-slate-600">Reset or rotate your account password securely.</div>
                      </div>
                      <Link
                        to="/forgot-password"
                        className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg"
                      >
                        Reset Password
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
