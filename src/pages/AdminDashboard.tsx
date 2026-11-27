import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity,
  Award,
  BarChart3,
  BookOpen,
  Camera,
  ClipboardList,
  Download,
  FileSpreadsheet,
  FolderKanban,
  GraduationCap,
  Layers,
  LayoutDashboard,
  LogOut,
  Plus,
  Settings,
  ShieldAlert,
  Upload,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch, apiUpload } from '../lib/api';
import { syncCertificateToFirestore } from '../lib/firebase';
import { PhotoFitModal } from '../components/PhotoFitModal';

type AdminTab =
  | 'dashboard'
  | 'students'
  | 'instructors'
  | 'courses'
  | 'categories'
  | 'curriculum'
  | 'assessments'
  | 'enrollments'
  | 'results'
  | 'certificates'
  | 'templates'
  | 'verification_logs'
  | 'reports'
  | 'messages'
  | 'settings';

interface StatsResponse {
  cards: {
    totalStudents: number;
    activeStudents: number;
    totalCourses: number;
    activeCourses: number;
    certificatesIssued: number;
    certificatesValid: number;
    certificatesVerified: number;
    validVerifications: number;
    invalidVerifications: number;
    certificatesRevoked: number;
    totalEnrollments: number;
    completedCourses: number;
  };
  charts: {
    enrollmentsByCategory: Array<{ label: string; value: number }>;
    verificationBreakdown: Array<{ label: string; value: number }>;
    registrationsByDay: Array<{ date: string; count: number }>;
    certsByDay: Array<{ date: string; count: number }>;
    mostVerifiedCertificates: Array<{
      certificate_id: string;
      verifications: number;
      student_name: string;
      course_title: string;
      status: string;
    }>;
  };
}

export function AdminDashboard() {
  const { user, logout, refreshUser } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';

  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [students, setStudents] = useState<Array<Record<string, unknown>>>([]);
  const [instructors, setInstructors] = useState<Array<Record<string, unknown>>>([]);
  const [categories, setCategories] = useState<Array<Record<string, unknown>>>([]);
  const [courses, setCourses] = useState<Array<Record<string, unknown>>>([]);
  const [enrollments, setEnrollments] = useState<Array<Record<string, unknown>>>([]);
  const [results, setResults] = useState<Array<Record<string, unknown>>>([]);
  const [certificates, setCertificates] = useState<Array<Record<string, unknown>>>([]);
  const [templates, setTemplates] = useState<Array<Record<string, unknown>>>([]);
  const [verificationLogs, setVerificationLogs] = useState<Array<Record<string, unknown>>>([]);
  const [contactMessages, setContactMessages] = useState<Array<Record<string, unknown>>>([]);
  const [reports, setReports] = useState<{
    coursePerformance: Array<Record<string, unknown>>;
  } | null>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});

  // Curriculum / Assessment editor states
  const [selectedCourseId, setSelectedCourseId] = useState<number>(0);
  const [curriculum, setCurriculum] = useState<{
    modules: Array<{
      id: number;
      title: string;
      description: string;
      order_index: number;
      is_published?: number;
      lessons: Array<Record<string, unknown>>;
    }>;
    assessment: Record<string, unknown> | null;
    questions: Array<Record<string, unknown>>;
  } | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Forms
  const [newCatName, setNewCatName] = useState('');
  const [newCatDesc, setNewCatDesc] = useState('');

  const [newCourse, setNewCourse] = useState({
    title: '',
    courseCode: '',
    categoryId: '',
    level: 'Foundation — Level 1',
    durationHours: '30',
    passMark: '70',
    certificateType: 'Certificate of Completion',
    templateId: '1',
    shortDescription: '',
    requirements: '',
    description: '',
  });

  const [newInst, setNewInst] = useState({
    fullName: '',
    email: '',
    password: '',
    title: 'Technology Instructor',
    specialty: 'Software & IT Systems',
  });

  const [newModTitle, setNewModTitle] = useState('');
  const [newLesson, setNewLesson] = useState({
    moduleId: '',
    title: '',
    durationMinutes: '25',
    videoUrl: '',
    contentMarkdown: '',
  });

  const [newQuestion, setNewQuestion] = useState({
    questionText: '',
    questionType: 'mcq_single' as 'mcq_single' | 'mcq_multi' | 'true_false',
    optionsText: 'Option A\nOption B\nOption C\nOption D',
    correctText: 'Option A',
    explanation: '',
  });

  const [issueForm, setIssueForm] = useState({
    directMode: true,
    recipientName: '',
    recipientPhotoPath: '',
    recipientPhotoUrl: '',
    studentId: '',
    courseId: '',
    score: '95',
    certificateType: 'Certificate of Completion',
    templateId: '1',
    issueDate: new Date().toISOString().slice(0, 10),
    overridePhotoRequirement: true,
  });
  const [uploadingCertPhoto, setUploadingCertPhoto] = useState(false);
  const [pendingCertPhotoFile, setPendingCertPhotoFile] = useState<File | null>(null);
  const [pwForm, setPwForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [savingPw, setSavingPw] = useState(false);
  const [lastIssuedCert, setLastIssuedCert] = useState<{
    certificate_id: string;
    recipient_name?: string;
    course_title?: string;
  } | null>(null);

  const [revokeTarget, setRevokeTarget] = useState<{ id: number; code: string } | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  const flash = (msg: string) => {
    setNotice(msg);
    setError(null);
    setTimeout(() => setNotice(null), 4000);
  };

  const loadTab = useCallback(
    async (activeTab: AdminTab) => {
      setError(null);
      try {
        if (activeTab === 'dashboard') {
          const s = await apiFetch<StatsResponse>('/api/admin/stats');
          setStats(s);
        } else if (activeTab === 'students' && isAdmin) {
          const res = await apiFetch<{ students: Array<Record<string, unknown>> }>('/api/admin/students');
          setStudents(res.students);
        } else if (activeTab === 'instructors' && isAdmin) {
          const res = await apiFetch<{ instructors: Array<Record<string, unknown>> }>('/api/admin/instructors');
          setInstructors(res.instructors);
        } else if (activeTab === 'categories') {
          const res = await apiFetch<{ categories: Array<Record<string, unknown>> }>('/api/admin/categories');
          setCategories(res.categories);
        } else if (activeTab === 'courses') {
          const [cRes, catRes, tplRes] = await Promise.all([
            apiFetch<{ courses: Array<Record<string, unknown>> }>('/api/admin/courses'),
            apiFetch<{ categories: Array<Record<string, unknown>> }>('/api/admin/categories'),
            apiFetch<{ templates: Array<Record<string, unknown>> }>('/api/admin/templates'),
          ]);
          setCourses(cRes.courses);
          setCategories(catRes.categories);
          setTemplates(tplRes.templates);
        } else if (activeTab === 'curriculum' || activeTab === 'assessments') {
          const cRes = await apiFetch<{ courses: Array<Record<string, unknown>> }>('/api/admin/courses');
          setCourses(cRes.courses);
          const cid = selectedCourseId || Number(cRes.courses[0]?.id || 0);
          if (cid) {
            setSelectedCourseId(cid);
            const cur = await apiFetch<typeof curriculum>(`/api/admin/courses/${cid}/curriculum`);
            setCurriculum(cur);
          }
        } else if (activeTab === 'enrollments') {
          const res = await apiFetch<{ enrollments: Array<Record<string, unknown>> }>('/api/admin/enrollments');
          setEnrollments(res.enrollments);
        } else if (activeTab === 'results') {
          const res = await apiFetch<{ results: Array<Record<string, unknown>> }>('/api/admin/results');
          setResults(res.results);
        } else if (activeTab === 'certificates' && isAdmin) {
          const [certRes, stuRes, cRes, tplRes] = await Promise.all([
            apiFetch<{ certificates: Array<Record<string, unknown>> }>('/api/admin/certificates'),
            apiFetch<{ students: Array<Record<string, unknown>> }>('/api/admin/students'),
            apiFetch<{ courses: Array<Record<string, unknown>> }>('/api/admin/courses'),
            apiFetch<{ templates: Array<Record<string, unknown>> }>('/api/admin/templates'),
          ]);
          setCertificates(certRes.certificates);
          setStudents(stuRes.students);
          setCourses(cRes.courses);
          setTemplates(tplRes.templates);
        } else if (activeTab === 'templates' && isAdmin) {
          const res = await apiFetch<{ templates: Array<Record<string, unknown>> }>('/api/admin/templates');
          setTemplates(res.templates);
        } else if (activeTab === 'verification_logs' && isAdmin) {
          const res = await apiFetch<{ logs: Array<Record<string, unknown>> }>('/api/admin/verification-logs');
          setVerificationLogs(res.logs);
        } else if (activeTab === 'reports' && isAdmin) {
          const res = await apiFetch<{ coursePerformance: Array<Record<string, unknown>> }>('/api/admin/reports');
          setReports(res);
        } else if (activeTab === 'messages' && isAdmin) {
          const res = await apiFetch<{ messages: Array<Record<string, unknown>> }>('/api/admin/contact-messages');
          setContactMessages(res.messages);
        } else if (activeTab === 'settings' && isAdmin) {
          const res = await apiFetch<{ settings: Record<string, string> }>('/api/admin/settings');
          setSettings(res.settings);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load section data.');
      }
    },
    [isAdmin, selectedCourseId]
  );

  useEffect(() => {
    if (!user || (user.role !== 'admin' && user.role !== 'instructor')) {
      navigate('/login');
      return;
    }
    loadTab(tab);
  }, [user, navigate, tab, loadTab]);

  const loadCurriculumForCourse = async (cid: number) => {
    setSelectedCourseId(cid);
    const cur = await apiFetch<typeof curriculum>(`/api/admin/courses/${cid}/curriculum`);
    setCurriculum(cur);
  };

  const menu: Array<{
    id: AdminTab;
    label: string;
    instructorLabel?: string;
    icon: React.ComponentType<{ className?: string }>;
    adminOnly?: boolean;
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'students', label: 'Students', icon: Users, adminOnly: true },
    { id: 'instructors', label: 'Instructors', icon: UserCheck, adminOnly: true },
    { id: 'courses', label: 'Courses', instructorLabel: 'My Courses', icon: BookOpen },
    { id: 'categories', label: 'Categories', icon: FolderKanban, adminOnly: true },
    { id: 'curriculum', label: 'Modules & Lessons', instructorLabel: 'Lessons', icon: Layers },
    { id: 'assessments', label: 'Assessments & Questions', instructorLabel: 'Assessments', icon: ClipboardList },
    { id: 'enrollments', label: 'Enrollments', instructorLabel: 'Students', icon: GraduationCap },
    { id: 'results', label: 'Results', icon: Activity },
    { id: 'certificates', label: 'Certificates', icon: Award, adminOnly: true },
    { id: 'templates', label: 'Certificate Templates', icon: FileSpreadsheet, adminOnly: true },
    { id: 'verification_logs', label: 'Verification Logs', icon: ShieldAlert, adminOnly: true },
    { id: 'reports', label: 'Reports', icon: BarChart3, adminOnly: true },
    { id: 'messages', label: 'Contact Inquiries', icon: Users, adminOnly: true },
    { id: 'settings', label: 'Settings', icon: Settings, adminOnly: true },
  ];

  const visibleMenu = menu.filter((m) => !m.adminOnly || isAdmin);

  const switchAdminTab = (next: AdminTab) => {
    setTab(next);
    setSearchQuery('');
    setStatusFilter('ALL');
    setPage(1);
  };

  const q = searchQuery.trim().toLowerCase();
  const paginate = <T,>(items: T[]) => {
    const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const safePage = Math.min(page, totalPages);
    const slice = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
    return { slice, totalPages, safePage };
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Sidebar */}
        <aside className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-4 space-y-1">
          <div className="px-3 py-2 mb-2 border-b border-slate-100">
            <div className="font-display text-sm font-bold text-slate-900 truncate">
              {isAdmin ? 'Admin Console' : 'Instructor Console'}
            </div>
            <div className="text-xs text-slate-500 truncate">{user?.email}</div>
          </div>

          <div className="flex lg:flex-col overflow-x-auto lg:overflow-visible gap-1 pb-2 lg:pb-0">
            {visibleMenu.map((item) => {
              const Icon = item.icon;
              const active = tab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => switchAdminTab(item.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                    active
                      ? 'bg-slate-900 text-white font-semibold'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {!isAdmin && item.instructorLabel ? item.instructorLabel : item.label}
                </button>
              );
            })}
            <button
              type="button"
              onClick={async () => {
                await logout();
                navigate('/');
              }}
              className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium text-red-700 hover:bg-red-50 whitespace-nowrap shrink-0 cursor-pointer lg:mt-2 lg:border-t lg:border-slate-100 lg:pt-3"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </div>
        </aside>

        {/* Main Viewport */}
        <main className="lg:col-span-9 space-y-6">
          {notice && (
            <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-lg text-sm font-medium">
              {notice}
            </div>
          )}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm font-medium">
              {error}
            </div>
          )}

          {/* DASHBOARD */}
          {tab === 'dashboard' && stats && (
            <div className="space-y-6">
              <h1 className="font-display text-2xl font-bold text-slate-900">
                Platform Analytics & Live Metrics
              </h1>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                  ['Total Students', stats.cards.totalStudents],
                  ['Active Students', stats.cards.activeStudents],
                  ['Total Courses', stats.cards.totalCourses],
                  ['Active Courses', stats.cards.activeCourses],
                  ['Total Enrollments', stats.cards.totalEnrollments],
                  ['Completed Courses', stats.cards.completedCourses],
                  ['Certificates Issued', stats.cards.certificatesIssued],
                  ['Valid Verifications', stats.cards.validVerifications],
                  ['Invalid / Revoked Checks', stats.cards.invalidVerifications],
                  ['Revoked Certificates', stats.cards.certificatesRevoked],
                ].map(([label, val]) => (
                  <div key={String(label)} className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="text-xs text-slate-500">{label}</div>
                    <div className="font-display text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                      {val}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Category Enrollments Chart */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <h2 className="font-display text-sm font-bold text-slate-900">
                    Enrollments by Category
                  </h2>
                  <div className="space-y-3">
                    {stats.charts.enrollmentsByCategory.map((row) => {
                      const max = Math.max(1, ...stats.charts.enrollmentsByCategory.map((r) => r.value));
                      const pct = Math.round((row.value / max) * 100);
                      return (
                        <div key={row.label} className="space-y-1 text-xs">
                          <div className="flex justify-between">
                            <span className="text-slate-700 font-medium truncate">{row.label}</span>
                            <span className="font-mono font-bold text-slate-900 tabular-nums">
                              {row.value}
                            </span>
                          </div>
                          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-700" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Verification Activity Chart */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <h2 className="font-display text-sm font-bold text-slate-900">
                    Verification Outcomes & Most Verified Credentials
                  </h2>
                  {stats.charts.verificationBreakdown.length === 0 ? (
                    <p className="text-xs text-slate-500 py-4">No verification queries logged yet.</p>
                  ) : (
                    <div className="space-y-2.5">
                      {stats.charts.verificationBreakdown.map((v) => (
                        <div key={v.label} className="flex items-center justify-between text-sm p-2.5 bg-slate-50 rounded-lg">
                          <span className="font-mono font-semibold text-slate-800">{v.label}</span>
                          <span className="font-bold tabular-nums text-slate-900">{v.value}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {stats.charts.mostVerifiedCertificates && stats.charts.mostVerifiedCertificates.length > 0 && (
                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      <div className="text-xs font-semibold text-slate-500">
                        Most Verified Certificates
                      </div>
                      <div className="space-y-1.5 text-xs">
                        {stats.charts.mostVerifiedCertificates.map((mv) => (
                          <div key={mv.certificate_id} className="flex justify-between items-center gap-2">
                            <span className="truncate text-slate-700">
                              <span className="font-mono font-bold text-blue-700">{mv.certificate_id}</span> · {mv.student_name}
                            </span>
                            <span className="font-mono font-bold text-slate-900 tabular-nums shrink-0">
                              {mv.verifications} checks
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <div className="text-xs font-semibold text-slate-500">
                      Recent Student Registrations (Daily)
                    </div>
                    {stats.charts.registrationsByDay.length === 0 ? (
                      <p className="text-xs text-slate-500">No student registrations yet.</p>
                    ) : (
                      <div className="space-y-1.5 text-xs">
                        {stats.charts.registrationsByDay.slice(0, 5).map((r) => (
                          <div key={r.date} className="flex justify-between font-mono">
                            <span className="text-slate-600">{r.date}</span>
                            <span className="font-bold text-slate-900 tabular-nums">{r.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STUDENTS */}
          {tab === 'students' && (() => {
            const filtered = students.filter(
              (s) =>
                !q ||
                String(s.full_name || '').toLowerCase().includes(q) ||
                String(s.email || '').toLowerCase().includes(q) ||
                String(s.username || '').toLowerCase().includes(q)
            );
            const { slice, totalPages, safePage } = paginate(filtered);
            return (
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="font-display text-xl font-bold text-slate-900">
                    Registered Students ({filtered.length})
                  </h2>
                  <input
                    type="search"
                    placeholder="Search name, email, username..."
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setPage(1);
                    }}
                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm w-full sm:w-64"
                  />
                </div>
                {filtered.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6">No matching students found.</p>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase border-b border-slate-200">
                          <tr>
                            <th className="py-3 pr-4">Student</th>
                            <th className="py-3 pr-4">Email</th>
                            <th className="py-3 pr-4">Enrollments</th>
                            <th className="py-3 pr-4">Certificates</th>
                            <th className="py-3 pr-4">Status</th>
                            <th className="py-3">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {slice.map((s) => (
                            <tr key={Number(s.id)}>
                              <td className="py-3 pr-4 font-semibold text-slate-900">
                                {String(s.full_name || 'Unnamed')}
                              </td>
                              <td className="py-3 pr-4 text-slate-600">{String(s.email)}</td>
                              <td className="py-3 pr-4 tabular-nums">{Number(s.enrollment_count)}</td>
                              <td className="py-3 pr-4 tabular-nums">{Number(s.certificate_count)}</td>
                              <td className="py-3 pr-4 text-xs font-semibold">
                                {s.is_active ? (
                                  <span className="text-emerald-700">Active</span>
                                ) : (
                                  <span className="text-red-700">Suspended</span>
                                )}
                              </td>
                              <td className="py-3">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    await apiFetch(`/api/admin/students/${s.id}`, {
                                      method: 'PATCH',
                                      body: JSON.stringify({ isActive: !s.is_active }),
                                    });
                                    flash('Student status updated.');
                                    loadTab('students');
                                  }}
                                  className="text-xs font-semibold text-blue-700 hover:underline cursor-pointer"
                                >
                                  {s.is_active ? 'Suspend' : 'Activate'}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-600">
                        <span>
                          Page {safePage} of {totalPages}
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={safePage <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            className="px-3 py-1 bg-slate-100 rounded disabled:opacity-40 cursor-pointer"
                          >
                            Prev
                          </button>
                          <button
                            type="button"
                            disabled={safePage >= totalPages}
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            className="px-3 py-1 bg-slate-100 rounded disabled:opacity-40 cursor-pointer"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })()}

          {/* INSTRUCTORS */}
          {tab === 'instructors' && (
            <div className="space-y-6">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await apiFetch('/api/admin/instructors', {
                      method: 'POST',
                      body: JSON.stringify(newInst),
                    });
                    setNewInst({
                      fullName: '',
                      email: '',
                      password: '',
                      title: 'Technology Instructor',
                      specialty: 'Software & IT Systems',
                    });
                    flash('Instructor account created.');
                    loadTab('instructors');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to create instructor.');
                  }
                }}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
              >
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Add Instructor Account
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <input
                    required
                    placeholder="Full Name"
                    value={newInst.fullName}
                    onChange={(e) => setNewInst({ ...newInst, fullName: e.target.value })}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <input
                    required
                    type="email"
                    placeholder="Email"
                    value={newInst.email}
                    onChange={(e) => setNewInst({ ...newInst, email: e.target.value })}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <input
                    required
                    type="password"
                    minLength={8}
                    placeholder="Password (min 8 chars)"
                    value={newInst.password}
                    onChange={(e) => setNewInst({ ...newInst, password: e.target.value })}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Create Instructor
                </button>
              </form>

              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Instructors & Permissions
                </h2>
                <div className="divide-y divide-slate-100">
                  {instructors.map((inst) => (
                    <div key={Number(inst.id)} className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-900">{String(inst.full_name)}</div>
                        <div className="text-xs text-slate-500">
                          {String(inst.email || '')} · {String(inst.title)} · {Number(inst.course_count)} courses
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3 text-xs">
                        {[
                          ['canEditCourses', 'can_edit_courses', 'Edit Courses'],
                          ['canCreateLessons', 'can_create_lessons', 'Lessons'],
                          ['canCreateAssessments', 'can_create_assessments', 'Exams'],
                          ['canViewReports', 'can_view_reports', 'Reports'],
                        ].map(([apiKey, dbKey, label]) => (
                          <label key={apiKey} className="inline-flex items-center gap-1.5 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={Boolean(inst[dbKey])}
                              onChange={async (e) => {
                                await apiFetch(`/api/admin/instructors/${inst.id}`, {
                                  method: 'PATCH',
                                  body: JSON.stringify({ [apiKey]: e.target.checked }),
                                });
                                flash('Instructor permissions updated.');
                                loadTab('instructors');
                              }}
                              className="accent-blue-700"
                            />
                            {label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* CATEGORIES */}
          {tab === 'categories' && (
            <div className="space-y-6">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await apiFetch('/api/admin/categories', {
                      method: 'POST',
                      body: JSON.stringify({ name: newCatName, description: newCatDesc }),
                    });
                    setNewCatName('');
                    setNewCatDesc('');
                    flash('Category added.');
                    loadTab('categories');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Failed to create category.');
                  }
                }}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
              >
                <h2 className="font-display text-lg font-bold text-slate-900">Create Category</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    required
                    placeholder="Category Name (e.g. Cloud Computing)"
                    value={newCatName}
                    onChange={(e) => setNewCatName(e.target.value)}
                    className="px-3.5 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <input
                    placeholder="Short Description"
                    value={newCatDesc}
                    onChange={(e) => setNewCatDesc(e.target.value)}
                    className="px-3.5 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                </div>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg cursor-pointer"
                >
                  Add Category
                </button>
              </form>

              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Course Categories ({categories.length})
                </h2>
                <div className="divide-y divide-slate-100">
                  {categories.map((cat) => (
                    <div key={Number(cat.id)} className="py-3 flex items-center justify-between gap-4">
                      <div>
                        <div className="font-semibold text-slate-900">{String(cat.name)}</div>
                        <div className="text-xs text-slate-500">
                          {String(cat.description)} · {Number(cat.course_count)} courses
                        </div>
                      </div>
                      {Number(cat.course_count) === 0 && (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/admin/categories/${cat.id}`, { method: 'DELETE' });
                            flash('Category removed.');
                            loadTab('categories');
                          }}
                          className="text-xs font-semibold text-red-700 hover:underline cursor-pointer"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* COURSES */}
          {tab === 'courses' && (
            <div className="space-y-6">
              {isAdmin && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    try {
                      await apiFetch('/api/admin/courses', {
                        method: 'POST',
                        body: JSON.stringify({
                          ...newCourse,
                          categoryId: Number(newCourse.categoryId || categories[0]?.id),
                          durationHours: Number(newCourse.durationHours),
                          passMark: Number(newCourse.passMark),
                          templateId: Number(newCourse.templateId),
                        }),
                      });
                      setNewCourse({
                        title: '',
                        courseCode: '',
                        categoryId: '',
                        level: 'Foundation — Level 1',
                        durationHours: '30',
                        passMark: '70',
                        certificateType: 'Certificate of Completion',
                        templateId: '1',
                        shortDescription: '',
                        requirements: '',
                        description: '',
                      });
                      flash('Course created.');
                      loadTab('courses');
                    } catch (err) {
                      setError(err instanceof Error ? err.message : 'Unable to create course.');
                    }
                  }}
                  className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
                >
                  <h2 className="font-display text-lg font-bold text-slate-900">Create New Course</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <input
                      required
                      placeholder="Course Title"
                      value={newCourse.title}
                      onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <input
                      required
                      placeholder="Course Code (e.g. TTH-CLOUD)"
                      value={newCourse.courseCode}
                      onChange={(e) => setNewCourse({ ...newCourse, courseCode: e.target.value })}
                      className="px-3 py-2 border border-slate-300 rounded-lg font-mono text-sm"
                    />
                    <select
                      value={newCourse.categoryId || String(categories[0]?.id || '')}
                      onChange={(e) => setNewCourse({ ...newCourse, categoryId: e.target.value })}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                      {categories.map((c) => (
                        <option key={Number(c.id)} value={String(c.id)}>
                          {String(c.name)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={newCourse.level}
                      onChange={(e) => setNewCourse({ ...newCourse, level: e.target.value })}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                      <option>Foundation — Level 1</option>
                      <option>Intermediate — Level 2</option>
                      <option>Advanced — Level 3</option>
                      <option>Professional</option>
                    </select>
                    <input
                      type="number"
                      min={1}
                      placeholder="Duration Hours"
                      value={newCourse.durationHours}
                      onChange={(e) => setNewCourse({ ...newCourse, durationHours: e.target.value })}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <input
                      type="number"
                      min={1}
                      max={100}
                      placeholder="Pass Mark %"
                      value={newCourse.passMark}
                      onChange={(e) => setNewCourse({ ...newCourse, passMark: e.target.value })}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <input
                      placeholder="Short summary (optional)"
                      value={newCourse.shortDescription}
                      onChange={(e) =>
                        setNewCourse({ ...newCourse, shortDescription: e.target.value })
                      }
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <input
                      placeholder="Prerequisites / requirements (optional)"
                      value={newCourse.requirements}
                      onChange={(e) => setNewCourse({ ...newCourse, requirements: e.target.value })}
                      className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                  <textarea
                    required
                    rows={2}
                    placeholder="Course description..."
                    value={newCourse.description}
                    onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg cursor-pointer"
                  >
                    Create Course
                  </button>
                </form>
              )}

              {(() => {
                const filteredCourses = courses.filter((c) => {
                  const matchText =
                    !q ||
                    String(c.title || '').toLowerCase().includes(q) ||
                    String(c.course_code || '').toLowerCase().includes(q);
                  const matchStatus =
                    statusFilter === 'ALL' || String(c.status || 'published') === statusFilter;
                  return matchText && matchStatus;
                });
                const { slice, totalPages, safePage } = paginate(filteredCourses);
                return (
                  <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="font-display text-lg font-bold text-slate-900">
                        Courses ({filteredCourses.length})
                      </h2>
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="search"
                          placeholder="Search course title or code..."
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setPage(1);
                          }}
                          className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
                        />
                        <select
                          value={statusFilter}
                          onChange={(e) => {
                            setStatusFilter(e.target.value);
                            setPage(1);
                          }}
                          className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                        >
                          <option value="ALL">All Statuses</option>
                          <option value="published">Published</option>
                          <option value="draft">Draft</option>
                          <option value="archived">Archived</option>
                        </select>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase border-b border-slate-200">
                          <tr>
                            <th className="py-3 pr-4">Course</th>
                            <th className="py-3 pr-4">Category</th>
                            <th className="py-3 pr-4">Status</th>
                            <th className="py-3 pr-4">Lessons</th>
                            <th className="py-3 pr-4">Enrolled</th>
                            <th className="py-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {slice.map((c) => {
                            const st = String(c.status || 'published');
                            return (
                              <tr key={Number(c.id)}>
                                <td className="py-3 pr-4">
                                  <div className="font-semibold text-slate-900">{String(c.title)}</div>
                                  <div className="font-mono text-xs text-slate-500">
                                    {String(c.course_code)} · {String(c.level)}
                                  </div>
                                </td>
                                <td className="py-3 pr-4 text-slate-600">{String(c.category_name)}</td>
                                <td className="py-3 pr-4 text-xs font-bold uppercase">
                                  <span
                                    className={
                                      st === 'published'
                                        ? 'text-emerald-700'
                                        : st === 'draft'
                                          ? 'text-amber-700'
                                          : 'text-slate-500'
                                    }
                                  >
                                    {st}
                                  </span>
                                </td>
                                <td className="py-3 pr-4 tabular-nums">{Number(c.lesson_count)}</td>
                                <td className="py-3 pr-4 tabular-nums">{Number(c.enrollment_count)}</td>
                                <td className="py-3">
                                  <div className="flex flex-wrap items-center gap-2.5 text-xs font-semibold">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        loadCurriculumForCourse(Number(c.id));
                                        setTab('curriculum');
                                      }}
                                      className="text-blue-700 hover:underline cursor-pointer"
                                    >
                                      Curriculum
                                    </button>
                                    {isAdmin && (
                                      <>
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            const nextStatus = st === 'published' ? 'draft' : 'published';
                                            await apiFetch(`/api/admin/courses/${c.id}`, {
                                              method: 'PUT',
                                              body: JSON.stringify({ status: nextStatus }),
                                            });
                                            flash(`Course ${nextStatus}.`);
                                            loadTab('courses');
                                          }}
                                          className="text-slate-700 hover:underline cursor-pointer"
                                        >
                                          {st === 'published' ? 'Unpublish' : 'Publish'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            await apiFetch(`/api/admin/courses/${c.id}/duplicate`, {
                                              method: 'POST',
                                            });
                                            flash('Course duplicated as draft.');
                                            loadTab('courses');
                                          }}
                                          className="text-slate-700 hover:underline cursor-pointer"
                                        >
                                          Duplicate
                                        </button>
                                        <button
                                          type="button"
                                          onClick={async () => {
                                            await apiFetch(`/api/admin/courses/${c.id}`, {
                                              method: 'DELETE',
                                            });
                                            flash('Course deleted.');
                                            loadTab('courses');
                                          }}
                                          className="text-red-700 hover:underline cursor-pointer"
                                        >
                                          Delete
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-600">
                        <span>
                          Page {safePage} of {totalPages}
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={safePage <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            className="px-3 py-1 bg-slate-100 rounded disabled:opacity-40 cursor-pointer"
                          >
                            Prev
                          </button>
                          <button
                            type="button"
                            disabled={safePage >= totalPages}
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            className="px-3 py-1 bg-slate-100 rounded disabled:opacity-40 cursor-pointer"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* CURRICULUM (MODULES & LESSONS) */}
          {tab === 'curriculum' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Modules & Lessons Builder
                  </h2>
                  <select
                    value={selectedCourseId}
                    onChange={(e) => loadCurriculumForCourse(Number(e.target.value))}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    {courses.map((c) => (
                      <option key={Number(c.id)} value={Number(c.id)}>
                        {String(c.title)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Add Module */}
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    await apiFetch('/api/admin/modules', {
                      method: 'POST',
                      body: JSON.stringify({
                        courseId: selectedCourseId,
                        title: newModTitle,
                        orderIndex: (curriculum?.modules.length || 0) + 1,
                      }),
                    });
                    setNewModTitle('');
                    flash('Module added.');
                    loadCurriculumForCourse(selectedCourseId);
                  }}
                  className="flex gap-2"
                >
                  <input
                    required
                    placeholder="New Module Title..."
                    value={newModTitle}
                    onChange={(e) => setNewModTitle(e.target.value)}
                    className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-slate-900 text-white text-sm font-semibold rounded-lg cursor-pointer"
                  >
                    Add Module
                  </button>
                </form>

                {/* Add Lesson */}
                {curriculum && curriculum.modules.length > 0 && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const modId = Number(newLesson.moduleId || curriculum.modules[0].id);
                      await apiFetch('/api/admin/lessons', {
                        method: 'POST',
                        body: JSON.stringify({
                          moduleId: modId,
                          title: newLesson.title,
                          durationMinutes: Number(newLesson.durationMinutes),
                          videoUrl: newLesson.videoUrl,
                          contentMarkdown: newLesson.contentMarkdown,
                        }),
                      });
                      setNewLesson({
                        moduleId: '',
                        title: '',
                        durationMinutes: '25',
                        videoUrl: '',
                        contentMarkdown: '',
                      });
                      flash('Lesson created.');
                      loadCurriculumForCourse(selectedCourseId);
                    }}
                    className="border-t border-slate-200 pt-4 space-y-3"
                  >
                    <div className="text-xs font-bold uppercase text-slate-500">Add Lesson</div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <select
                        value={newLesson.moduleId || String(curriculum.modules[0].id)}
                        onChange={(e) => setNewLesson({ ...newLesson, moduleId: e.target.value })}
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                      >
                        {curriculum.modules.map((m) => (
                          <option key={m.id} value={String(m.id)}>
                            {m.title}
                          </option>
                        ))}
                      </select>
                      <input
                        required
                        placeholder="Lesson Title"
                        value={newLesson.title}
                        onChange={(e) => setNewLesson({ ...newLesson, title: e.target.value })}
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                      <input
                        placeholder="Video URL (optional)"
                        value={newLesson.videoUrl}
                        onChange={(e) => setNewLesson({ ...newLesson, videoUrl: e.target.value })}
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>
                    <textarea
                      required
                      rows={3}
                      placeholder="Lesson study content..."
                      value={newLesson.contentMarkdown}
                      onChange={(e) => setNewLesson({ ...newLesson, contentMarkdown: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg cursor-pointer"
                    >
                      Save Lesson
                    </button>
                  </form>
                )}
              </div>

              {/* Existing Modules List */}
              {curriculum?.modules.map((m, idx) => (
                <div key={m.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="font-display font-bold text-slate-900">
                        {m.title}
                        {m.is_published === 0 && (
                          <span className="ml-2 text-xs font-semibold text-amber-700 uppercase">
                            (Unpublished)
                          </span>
                        )}
                      </h3>
                    </div>
                    <div className="flex items-center gap-3 text-xs font-semibold">
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/modules/${m.id}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ isPublished: m.is_published === 0 }),
                          });
                          flash(m.is_published === 0 ? 'Module published.' : 'Module unpublished.');
                          loadCurriculumForCourse(selectedCourseId);
                        }}
                        className="text-slate-700 hover:underline cursor-pointer"
                      >
                        {m.is_published === 0 ? 'Publish' : 'Unpublish'}
                      </button>
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/admin/modules/${m.id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ orderIndex: Math.max(1, (m.order_index || idx + 1) - 1) }),
                            });
                            loadCurriculumForCourse(selectedCourseId);
                          }}
                          className="text-blue-700 hover:underline cursor-pointer"
                        >
                          Move Up
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/modules/${m.id}`, { method: 'DELETE' });
                          flash('Module removed.');
                          loadCurriculumForCourse(selectedCourseId);
                        }}
                        className="text-red-700 hover:underline cursor-pointer"
                      >
                        Delete Module
                      </button>
                    </div>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {m.lessons.map((l) => (
                      <div key={Number(l.id)} className="py-2 flex items-center justify-between text-sm">
                        <span>{String(l.title)}</span>
                        <button
                          type="button"
                          onClick={async () => {
                            await apiFetch(`/api/admin/lessons/${l.id}`, { method: 'DELETE' });
                            flash('Lesson deleted.');
                            loadCurriculumForCourse(selectedCourseId);
                          }}
                          className="text-xs text-red-600 hover:underline cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* ASSESSMENTS & QUESTIONS */}
          {tab === 'assessments' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Exam & Question Bank
                  </h2>
                  <select
                    value={selectedCourseId}
                    onChange={(e) => loadCurriculumForCourse(Number(e.target.value))}
                    className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                  >
                    {courses.map((c) => (
                      <option key={Number(c.id)} value={Number(c.id)}>
                        {String(c.title)}
                      </option>
                    ))}
                  </select>
                </div>

                {curriculum?.assessment && (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const options = newQuestion.optionsText
                        .split('\n')
                        .map((o) => o.trim())
                        .filter(Boolean);
                      const correctAnswers = newQuestion.correctText
                        .split('\n')
                        .map((o) => o.trim())
                        .filter(Boolean);
                      await apiFetch('/api/admin/questions', {
                        method: 'POST',
                        body: JSON.stringify({
                          assessmentId: curriculum.assessment!.id,
                          questionText: newQuestion.questionText,
                          questionType: newQuestion.questionType,
                          options,
                          correctAnswers,
                          explanation: newQuestion.explanation,
                        }),
                      });
                      setNewQuestion({
                        questionText: '',
                        questionType: 'mcq_single',
                        optionsText: 'Option A\nOption B\nOption C\nOption D',
                        correctText: 'Option A',
                        explanation: '',
                      });
                      flash('Question added to exam.');
                      loadCurriculumForCourse(selectedCourseId);
                    }}
                    className="space-y-3 pt-3 border-t border-slate-100"
                  >
                    <div className="text-xs font-bold uppercase text-slate-500">
                      Add Question to: {String(curriculum.assessment.title)}
                    </div>
                    <input
                      required
                      placeholder="Question Prompt"
                      value={newQuestion.questionText}
                      onChange={(e) =>
                        setNewQuestion({ ...newQuestion, questionText: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <select
                        value={newQuestion.questionType}
                        onChange={(e) =>
                          setNewQuestion({
                            ...newQuestion,
                            questionType: e.target.value as 'mcq_single' | 'mcq_multi' | 'true_false',
                            optionsText:
                              e.target.value === 'true_false'
                                ? 'True\nFalse'
                                : newQuestion.optionsText,
                            correctText:
                              e.target.value === 'true_false' ? 'True' : newQuestion.correctText,
                          })
                        }
                        className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                      >
                        <option value="mcq_single">Multiple Choice (Single)</option>
                        <option value="mcq_multi">Multiple Answers</option>
                        <option value="true_false">True / False</option>
                      </select>
                      <textarea
                        rows={3}
                        placeholder="Options (one per line)"
                        value={newQuestion.optionsText}
                        onChange={(e) =>
                          setNewQuestion({ ...newQuestion, optionsText: e.target.value })
                        }
                        className="px-3 py-2 border border-slate-300 rounded-lg text-xs"
                      />
                      <textarea
                        rows={3}
                        placeholder="Correct Answers (exact match, one per line)"
                        value={newQuestion.correctText}
                        onChange={(e) =>
                          setNewQuestion({ ...newQuestion, correctText: e.target.value })
                        }
                        className="px-3 py-2 border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <input
                      placeholder="Answer explanation (shown after submission)"
                      value={newQuestion.explanation}
                      onChange={(e) =>
                        setNewQuestion({ ...newQuestion, explanation: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg cursor-pointer"
                    >
                      Add Question
                    </button>
                  </form>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                <h3 className="font-display font-bold text-slate-900">
                  Existing Questions ({curriculum?.questions.length || 0})
                </h3>
                <div className="divide-y divide-slate-100">
                  {(curriculum?.questions || []).map((q, idx) => (
                    <div key={Number(q.id)} className="py-3 flex items-start justify-between gap-4 text-sm">
                      <div>
                        <div className="font-semibold text-slate-900">
                          {idx + 1}. {String(q.question_text)}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          Type: {String(q.question_type)} · Answer: {String(q.correct_answers_json)}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/questions/${q.id}`, { method: 'DELETE' });
                          flash('Question deleted.');
                          loadCurriculumForCourse(selectedCourseId);
                        }}
                        className="text-xs text-red-700 hover:underline shrink-0 cursor-pointer"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ENROLLMENTS */}
          {tab === 'enrollments' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="font-display text-xl font-bold text-slate-900">
                Course Enrollments ({enrollments.length})
              </h2>
              {enrollments.length === 0 ? (
                <p className="text-sm text-slate-500 py-6">No enrollments recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase border-b border-slate-200">
                      <tr>
                        <th className="py-3 pr-4">Student</th>
                        <th className="py-3 pr-4">Course</th>
                        <th className="py-3 pr-4">Progress</th>
                        <th className="py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {enrollments.map((e) => (
                        <tr key={Number(e.id)}>
                          <td className="py-3 pr-4 font-semibold text-slate-900">
                            {String(e.student_name)}
                          </td>
                          <td className="py-3 pr-4">{String(e.course_title)}</td>
                          <td className="py-3 pr-4 tabular-nums">{Number(e.progress_percent)}%</td>
                          <td className="py-3 text-xs font-semibold uppercase">{String(e.status)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* RESULTS */}
          {tab === 'results' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="font-display text-xl font-bold text-slate-900">
                Assessment Results ({results.length})
              </h2>
              {results.length === 0 ? (
                <p className="text-sm text-slate-500 py-6">No assessment attempts recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase border-b border-slate-200">
                      <tr>
                        <th className="py-3 pr-4">Student</th>
                        <th className="py-3 pr-4">Course</th>
                        <th className="py-3 pr-4">Score</th>
                        <th className="py-3 pr-4">Outcome</th>
                        <th className="py-3">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {results.map((r) => (
                        <tr key={Number(r.id)}>
                          <td className="py-3 pr-4 font-semibold">{String(r.student_name)}</td>
                          <td className="py-3 pr-4">{String(r.course_title)}</td>
                          <td className="py-3 pr-4 tabular-nums">{Number(r.score_percent)}%</td>
                          <td className="py-3 pr-4 text-xs font-bold">
                            <span className={r.passed ? 'text-emerald-700' : 'text-red-700'}>
                              {r.passed ? 'PASSED' : 'FAILED'}
                            </span>
                          </td>
                          <td className="py-3 text-xs text-slate-500 tabular-nums">
                            {new Date(String(r.submitted_at)).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* CERTIFICATES & ISSUING */}
          {tab === 'certificates' && (
            <div className="space-y-6">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setError(null);
                  const selectedStudentObj = students.find(
                    (s) => Number(s.id) === Number(issueForm.studentId || students[0]?.id)
                  );
                  const hasPhoto = Boolean(
                    issueForm.recipientPhotoPath ||
                      (!issueForm.directMode && selectedStudentObj?.photo_path)
                  );
                  if (!hasPhoto) {
                    setError(
                      'Please upload the graduate photo (Picha ya Mhitimu) before generating the certificate.'
                    );
                    return;
                  }
                  try {
                    const selectedCourseIdVal = Number(issueForm.courseId || courses[0]?.id);
                    const selectedCourse = courses.find(
                      (c) => Number(c.id) === selectedCourseIdVal
                    );
                    const res = await apiFetch<{
                      certificate: {
                        certificate_id: string;
                        recipient_name?: string;
                        certificate_type?: string;
                        level?: string;
                        score?: number;
                        issue_date?: string;
                        verification_url?: string;
                      };
                    }>('/api/admin/certificates/issue', {
                      method: 'POST',
                      body: JSON.stringify({
                        directMode: issueForm.directMode,
                        recipientName: issueForm.directMode
                          ? issueForm.recipientName.trim()
                          : undefined,
                        recipientPhotoPath: issueForm.recipientPhotoPath || undefined,
                        studentId: issueForm.directMode
                          ? undefined
                          : Number(issueForm.studentId || students[0]?.id),
                        courseId: selectedCourseIdVal,
                        score: Number(issueForm.score),
                        certificateType: issueForm.certificateType,
                        templateId: Number(issueForm.templateId),
                        issueDate: issueForm.issueDate || undefined,
                        overridePhotoRequirement: issueForm.overridePhotoRequirement,
                      }),
                    });

                    syncCertificateToFirestore({
                      certificateId: res.certificate.certificate_id,
                      recipientName:
                        res.certificate.recipient_name ||
                        issueForm.recipientName.trim() ||
                        'TechTalkHub Recipient',
                      courseCode: String(selectedCourse?.course_code || 'TTH'),
                      courseTitle: String(selectedCourse?.title || 'TechTalkHub Course'),
                      level: String(res.certificate.level || selectedCourse?.level || 'Foundation'),
                      certificateType:
                        res.certificate.certificate_type || issueForm.certificateType,
                      score: Number(res.certificate.score ?? issueForm.score),
                      status: 'VALID',
                      issueDate: String(res.certificate.issue_date || new Date().toISOString()),
                      verificationUrl:
                        res.certificate.verification_url ||
                        `${window.location.origin}/verify/${res.certificate.certificate_id}`,
                      directAdminIssue: issueForm.directMode,
                    }).catch(() => {});

                    setLastIssuedCert({
                      certificate_id: res.certificate.certificate_id,
                      recipient_name: res.certificate.recipient_name,
                      course_title: String(selectedCourse?.title || ''),
                    });
                    setIssueForm((prev) => ({
                      ...prev,
                      recipientPhotoPath: '',
                      recipientPhotoUrl: '',
                    }));
                    flash(`Certificate ${res.certificate.certificate_id} generated and ready.`);
                    loadTab('certificates');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Unable to issue certificate.');
                  }
                }}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-5"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-display text-lg font-bold text-slate-900">
                      Generate &amp; Issue Certificate
                    </h2>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Issue any course certificate directly without requiring course enrollment,
                      lessons, or exam completion — or issue to a registered student.
                    </p>
                  </div>
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-xs font-semibold">
                    <button
                      type="button"
                      onClick={() => setIssueForm({ ...issueForm, directMode: true })}
                      className={`px-3 py-1.5 rounded-md cursor-pointer ${
                        issueForm.directMode
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600'
                      }`}
                    >
                      Direct / Instant (No Study Required)
                    </button>
                    <button
                      type="button"
                      disabled={students.length === 0}
                      onClick={() => setIssueForm({ ...issueForm, directMode: false })}
                      className={`px-3 py-1.5 rounded-md cursor-pointer disabled:opacity-40 ${
                        !issueForm.directMode
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600'
                      }`}
                    >
                      Registered Student ({students.length})
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {issueForm.directMode ? (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Recipient Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        value={issueForm.recipientName}
                        onChange={(e) =>
                          setIssueForm({ ...issueForm, recipientName: e.target.value })
                        }
                        placeholder="e.g. Ruben Rudovick Buberwa"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Select Student
                      </label>
                      <select
                        value={issueForm.studentId || String(students[0]?.id || '')}
                        onChange={(e) => setIssueForm({ ...issueForm, studentId: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                      >
                        {students.map((s) => (
                          <option key={Number(s.id)} value={String(s.id)}>
                            {String(s.full_name || s.email)} ({s.photo_path ? 'Photo ✓' : 'No Photo'})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Course / Certificate Track *
                    </label>
                    <select
                      value={issueForm.courseId || String(courses[0]?.id || '')}
                      onChange={(e) => setIssueForm({ ...issueForm, courseId: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                      {courses.map((c) => (
                        <option key={Number(c.id)} value={String(c.id)}>
                          {String(c.title)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Score (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={issueForm.score}
                      onChange={(e) => setIssueForm({ ...issueForm, score: e.target.value })}
                      placeholder="Score %"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Certificate Type
                    </label>
                    <select
                      value={issueForm.certificateType}
                      onChange={(e) =>
                        setIssueForm({ ...issueForm, certificateType: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                      <option>Certificate of Completion</option>
                      <option>Certificate of Achievement</option>
                      <option>Professional Certificate</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Template Style
                    </label>
                    <select
                      value={issueForm.templateId}
                      onChange={(e) => setIssueForm({ ...issueForm, templateId: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                    >
                      {templates.map((t) => (
                        <option key={Number(t.id)} value={String(t.id)}>
                          {String(t.name)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Issue Date
                    </label>
                    <input
                      type="date"
                      value={issueForm.issueDate}
                      onChange={(e) => setIssueForm({ ...issueForm, issueDate: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                  </div>
                </div>

                {/* Graduate Photo Upload (Mandatory — appears on certificate & PDF) */}
                {(() => {
                  const selectedStudentForPreview = !issueForm.directMode
                    ? students.find(
                        (s) => Number(s.id) === Number(issueForm.studentId || students[0]?.id)
                      )
                    : null;
                  const activePreviewUrl =
                    issueForm.recipientPhotoUrl ||
                    (selectedStudentForPreview?.photo_url
                      ? String(selectedStudentForPreview.photo_url)
                      : '');

                  return (
                    <div
                      className={`border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                        activePreviewUrl
                          ? 'bg-emerald-50/50 border-emerald-200'
                          : 'bg-amber-50/60 border-amber-300'
                      }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <div className="w-20 aspect-[5/6] rounded-lg p-0.5 border-2 border-[#1D3557] ring-1 ring-[#E6A800]/70 bg-white overflow-hidden flex items-center justify-center shrink-0">
                          {activePreviewUrl ? (
                            <img
                              src={activePreviewUrl}
                              alt="Graduate portrait preview"
                              className="w-full h-full object-cover object-top rounded-[4px] block"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <Camera className="w-6 h-6 text-slate-400" />
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-bold text-slate-900">
                            Graduate Photo (Picha ya Mhitimu) *
                          </div>
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            Required: Upload and adjust portrait photo (JPG, PNG, WebP) so the
                            face fits cleanly inside the certificate &amp; PDF frame.
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-semibold rounded-lg cursor-pointer">
                          <Upload className="w-3.5 h-3.5" />
                          {uploadingCertPhoto
                            ? 'Uploading...'
                            : issueForm.recipientPhotoUrl
                              ? 'Change / Adjust Photo'
                              : 'Upload & Fit Photo *'}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="sr-only"
                            disabled={uploadingCertPhoto}
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              e.target.value = '';
                              if (!file) return;
                              setError(null);
                              setPendingCertPhotoFile(file);
                            }}
                          />
                        </label>
                        {issueForm.recipientPhotoUrl && (
                          <button
                            type="button"
                            onClick={() =>
                              setIssueForm((prev) => ({
                                ...prev,
                                recipientPhotoPath: '',
                                recipientPhotoUrl: '',
                              }))
                            }
                            className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-lg cursor-pointer"
                          >
                            <X className="w-3.5 h-3.5" />
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {pendingCertPhotoFile && (
                  <PhotoFitModal
                    file={pendingCertPhotoFile}
                    title="Fit Graduate Photo on Certificate"
                    onCancel={() => setPendingCertPhotoFile(null)}
                    onConfirm={async (croppedBlob) => {
                      setPendingCertPhotoFile(null);
                      setError(null);
                      setUploadingCertPhoto(true);
                      try {
                        const formData = new FormData();
                        formData.append('photo', croppedBlob, 'graduate-photo.jpg');
                        const uploaded = await apiUpload<{
                          photoFilename: string;
                          photoUrl: string;
                        }>('/api/admin/certificates/upload-photo', formData);
                        if (!uploaded?.photoFilename || !uploaded?.photoUrl) {
                          throw new Error('Unable to save uploaded photo. Please try again.');
                        }
                        const { photoFilename, photoUrl } = uploaded;
                        setIssueForm((prev) => ({
                          ...prev,
                          recipientPhotoPath: photoFilename,
                          recipientPhotoUrl: photoUrl,
                        }));
                        flash('Graduate photo fitted and ready for certificate.');
                      } catch (err) {
                        setError(
                          err instanceof Error ? err.message : 'Unable to upload graduate photo.'
                        );
                      } finally {
                        setUploadingCertPhoto(false);
                      }
                    }}
                  />
                )}

                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg cursor-pointer"
                  >
                    {issueForm.directMode
                      ? 'Generate & Take Certificate'
                      : 'Generate & Issue Certificate'}
                  </button>
                </div>

                {lastIssuedCert && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                        Certificate Generated
                      </div>
                      <div className="text-sm font-semibold text-slate-900 mt-0.5">
                        <span className="font-mono">{lastIssuedCert.certificate_id}</span>
                        {lastIssuedCert.recipient_name
                          ? ` — ${lastIssuedCert.recipient_name}`
                          : ''}
                        {lastIssuedCert.course_title ? ` (${lastIssuedCert.course_title})` : ''}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <a
                        href={`/api/certificates/${encodeURIComponent(lastIssuedCert.certificate_id)}/pdf`}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download PDF
                      </a>
                      <Link
                        to={`/certificate/${encodeURIComponent(lastIssuedCert.certificate_id)}`}
                        className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg"
                      >
                        View Certificate
                      </Link>
                      <Link
                        to={`/verify/${encodeURIComponent(lastIssuedCert.certificate_id)}`}
                        className="px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-white border border-emerald-300 hover:bg-emerald-100 rounded-lg"
                      >
                        Public Verify
                      </Link>
                    </div>
                  </div>
                )}
              </form>

              {revokeTarget && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-5 space-y-3">
                  <div className="font-semibold text-sm text-amber-900">
                    Revoke Certificate <span className="font-mono">{revokeTarget.code}</span>
                  </div>
                  <input
                    type="text"
                    value={revokeReason}
                    onChange={(e) => setRevokeReason(e.target.value)}
                    placeholder="Public revocation reason..."
                    className="w-full px-3 py-2 bg-white border border-amber-300 rounded-lg text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        await apiFetch(`/api/admin/certificates/${revokeTarget.id}/revoke`, {
                          method: 'POST',
                          body: JSON.stringify({ reason: revokeReason }),
                        });
                        setRevokeTarget(null);
                        setRevokeReason('');
                        flash('Certificate revoked.');
                        loadTab('certificates');
                      }}
                      className="px-4 py-2 bg-red-700 text-white text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      Confirm Revocation
                    </button>
                    <button
                      type="button"
                      onClick={() => setRevokeTarget(null)}
                      className="px-4 py-2 bg-white border border-slate-300 text-xs font-semibold rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {(() => {
                const filteredCerts = certificates.filter((cert) => {
                  const matchText =
                    !q ||
                    String(cert.certificate_id || '').toLowerCase().includes(q) ||
                    String(cert.student_name || '').toLowerCase().includes(q) ||
                    String(cert.course_title || '').toLowerCase().includes(q);
                  const matchStatus =
                    statusFilter === 'ALL' || String(cert.status || '') === statusFilter;
                  return matchText && matchStatus;
                });
                const { slice, totalPages, safePage } = paginate(filteredCerts);
                return (
                  <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h2 className="font-display text-lg font-bold text-slate-900">
                        Issued Certificates ({filteredCerts.length})
                      </h2>
                      <div className="flex flex-wrap gap-2">
                        <input
                          type="search"
                          placeholder="Search ID, student, course..."
                          value={searchQuery}
                          onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setPage(1);
                          }}
                          className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm"
                        />
                        <select
                          value={statusFilter}
                          onChange={(e) => {
                            setStatusFilter(e.target.value);
                            setPage(1);
                          }}
                          className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                        >
                          <option value="ALL">All Statuses</option>
                          <option value="VALID">VALID</option>
                          <option value="REVOKED">REVOKED</option>
                        </select>
                      </div>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm text-left">
                        <thead className="text-xs text-slate-500 uppercase border-b border-slate-200">
                          <tr>
                            <th className="py-3 pr-4">Certificate ID</th>
                            <th className="py-3 pr-4">Student</th>
                            <th className="py-3 pr-4">Course</th>
                            <th className="py-3 pr-4">Status</th>
                            <th className="py-3">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {slice.map((cert) => (
                            <tr key={Number(cert.id)}>
                              <td className="py-3 pr-4 font-mono font-bold text-xs">
                                <Link
                                  to={`/verify/${encodeURIComponent(String(cert.certificate_id))}`}
                                  className="text-blue-700 hover:underline"
                                >
                                  {String(cert.certificate_id)}
                                </Link>
                              </td>
                              <td className="py-3 pr-4">{String(cert.student_name)}</td>
                              <td className="py-3 pr-4">{String(cert.course_title)}</td>
                              <td className="py-3 pr-4 text-xs font-bold">
                                <span
                                  className={
                                    cert.status === 'VALID' ? 'text-emerald-700' : 'text-red-700'
                                  }
                                >
                                  {String(cert.status)}
                                </span>
                              </td>
                              <td className="py-3">
                                <div className="flex flex-wrap items-center gap-3 text-xs font-semibold">
                                  <Link
                                    to={`/certificate/${encodeURIComponent(String(cert.certificate_id))}`}
                                    className="text-blue-700 hover:underline"
                                  >
                                    Preview
                                  </Link>
                                  <a
                                    href={`/api/certificates/${encodeURIComponent(String(cert.certificate_id))}/pdf`}
                                    className="text-slate-700 hover:underline"
                                  >
                                    PDF
                                  </a>
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      const url = `${window.location.origin}/verify/${encodeURIComponent(String(cert.certificate_id))}`;
                                      await navigator.clipboard.writeText(url).catch(() => {});
                                      flash(`Verification link copied: ${String(cert.certificate_id)}`);
                                    }}
                                    className="text-slate-700 hover:underline cursor-pointer"
                                  >
                                    Copy Link
                                  </button>
                                  {cert.status === 'VALID' ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          try {
                                            const r = await apiFetch<{
                                              certificate: { certificate_id: string };
                                            }>(`/api/admin/certificates/${cert.id}/replace`, {
                                              method: 'POST',
                                              body: JSON.stringify({
                                                reason: 'Replaced with newly issued credential by administration.',
                                              }),
                                            });
                                            flash(`Replaced with ${r.certificate.certificate_id}.`);
                                            loadTab('certificates');
                                          } catch (err) {
                                            setError(
                                              err instanceof Error
                                                ? err.message
                                                : 'Unable to replace certificate.'
                                            );
                                          }
                                        }}
                                        className="text-amber-700 hover:underline cursor-pointer"
                                      >
                                        Replace
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setRevokeTarget({
                                            id: Number(cert.id),
                                            code: String(cert.certificate_id),
                                          })
                                        }
                                        className="text-red-700 hover:underline cursor-pointer"
                                      >
                                        Revoke
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={async () => {
                                        await apiFetch(`/api/admin/certificates/${cert.id}/reinstate`, {
                                          method: 'POST',
                                        });
                                        flash('Certificate reinstated.');
                                        loadTab('certificates');
                                      }}
                                      className="text-emerald-700 hover:underline cursor-pointer"
                                    >
                                      Reinstate
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {totalPages > 1 && (
                      <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs text-slate-600">
                        <span>
                          Page {safePage} of {totalPages}
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            disabled={safePage <= 1}
                            onClick={() => setPage((p) => Math.max(1, p - 1))}
                            className="px-3 py-1 bg-slate-100 rounded disabled:opacity-40 cursor-pointer"
                          >
                            Prev
                          </button>
                          <button
                            type="button"
                            disabled={safePage >= totalPages}
                            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                            className="px-3 py-1 bg-slate-100 rounded disabled:opacity-40 cursor-pointer"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* TEMPLATES */}
          {tab === 'templates' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="font-display text-xl font-bold text-slate-900">
                Certificate Templates
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {templates.map((t) => (
                  <div key={Number(t.id)} className="border border-slate-200 rounded-xl p-5 space-y-2">
                    <div className="font-mono text-xs font-bold text-blue-700 uppercase">
                      {String(t.code)}
                    </div>
                    <h3 className="font-display text-base font-bold text-slate-900">
                      {String(t.name)}
                    </h3>
                    <p className="text-xs text-slate-600">{String(t.description)}</p>
                    {Boolean(t.is_default) ? (
                      <div className="text-xs font-semibold text-emerald-700 pt-2">
                        Default Template ✓
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={async () => {
                          await apiFetch(`/api/admin/templates/${t.id}`, {
                            method: 'PUT',
                            body: JSON.stringify({ isDefault: true }),
                          });
                          flash('Default template updated.');
                          loadTab('templates');
                        }}
                        className="text-xs font-semibold text-blue-700 hover:underline pt-2 cursor-pointer"
                      >
                        Set as Default
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* VERIFICATION LOGS */}
          {tab === 'verification_logs' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="font-display text-xl font-bold text-slate-900">
                Certificate Verification Activity ({verificationLogs.length})
              </h2>
              {verificationLogs.length === 0 ? (
                <p className="text-sm text-slate-500 py-6">No verification requests logged yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase border-b border-slate-200">
                      <tr>
                        <th className="py-3 pr-4">Certificate ID</th>
                        <th className="py-3 pr-4">Result</th>
                        <th className="py-3 pr-4">Client Summary</th>
                        <th className="py-3">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {verificationLogs.map((log) => (
                        <tr key={Number(log.id)}>
                          <td className="py-3 pr-4 font-mono text-xs font-bold">
                            {String(log.certificate_id)}
                          </td>
                          <td className="py-3 pr-4 text-xs font-bold">
                            <span
                              className={
                                log.result === 'VALID'
                                  ? 'text-emerald-700'
                                  : log.result === 'REVOKED'
                                    ? 'text-amber-700'
                                    : 'text-red-700'
                              }
                            >
                              {String(log.result)}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-xs text-slate-500 truncate max-w-xs">
                            {String(log.user_agent_summary || '—')}
                          </td>
                          <td className="py-3 text-xs text-slate-500 tabular-nums">
                            {new Date(String(log.verified_at)).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* REPORTS */}
          {tab === 'reports' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="font-display text-xl font-bold text-slate-900">
                  Export Institutional Reports
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    ['certificates', 'Certificates Issued Report'],
                    ['students', 'Student Registrations Report'],
                    ['verifications', 'Verification Activity Report'],
                  ].map(([type, label]) => (
                    <div key={type} className="border border-slate-200 rounded-xl p-4 space-y-3">
                      <div className="font-semibold text-sm text-slate-900">{label}</div>
                      <div className="flex gap-2">
                        <a
                          href={`/api/admin/reports/export?type=${type}&format=csv`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg"
                        >
                          <Download className="w-3.5 h-3.5" />
                          CSV
                        </a>
                        <a
                          href={`/api/admin/reports/export?type=${type}&format=pdf`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg"
                        >
                          <Download className="w-3.5 h-3.5" />
                          PDF
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {reports && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    Course Completion & Assessment Performance
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 uppercase border-b border-slate-200">
                        <tr>
                          <th className="py-3 pr-4">Course</th>
                          <th className="py-3 pr-4">Enrollments</th>
                          <th className="py-3 pr-4">Completions</th>
                          <th className="py-3 pr-4">Completion Rate</th>
                          <th className="py-3 pr-4">Avg Score</th>
                          <th className="py-3 pr-4">Pass Rate</th>
                          <th className="py-3">Certificates</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {reports.coursePerformance.map((cp) => (
                          <tr key={Number(cp.id)}>
                            <td className="py-3 pr-4 font-semibold">{String(cp.title)}</td>
                            <td className="py-3 pr-4 tabular-nums">{Number(cp.enrollments)}</td>
                            <td className="py-3 pr-4 tabular-nums">{Number(cp.completions)}</td>
                            <td className="py-3 pr-4 tabular-nums">{Number(cp.completion_rate || 0)}%</td>
                            <td className="py-3 pr-4 tabular-nums">
                              {cp.avg_score !== null ? `${cp.avg_score}%` : '—'}
                            </td>
                            <td className="py-3 pr-4 tabular-nums">{Number(cp.pass_rate || 0)}%</td>
                            <td className="py-3 tabular-nums">{Number(cp.certificates_issued)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CONTACT INQUIRIES */}
          {tab === 'messages' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="font-display text-xl font-bold text-slate-900">
                Contact & Verification Inquiries ({contactMessages.length})
              </h2>
              {contactMessages.length === 0 ? (
                <p className="text-sm text-slate-500 py-6">No contact messages submitted yet.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {contactMessages.map((m) => (
                    <div key={Number(m.id)} className="py-4 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900">{String(m.subject)}</span>
                        <span className="text-xs text-slate-500 tabular-nums">
                          {new Date(String(m.created_at)).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-xs text-blue-700 font-medium">
                        {String(m.name)} · {String(m.email)}
                      </div>
                      <p className="text-sm text-slate-700">{String(m.message)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SETTINGS & DEMO DATA PURGE */}
          {tab === 'settings' && (
            <div className="space-y-6">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  await apiFetch('/api/admin/settings', {
                    method: 'PUT',
                    body: JSON.stringify({ settings }),
                  });
                  flash('Platform settings saved.');
                }}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
              >
                <h2 className="font-display text-xl font-bold text-slate-900">
                  Platform & Certification Settings
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Academic Director Name
                    </label>
                    <input
                      value={settings.director_name || ''}
                      onChange={(e) => setSettings({ ...settings, director_name: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Academic Director Title
                    </label>
                    <input
                      value={settings.director_title || ''}
                      onChange={(e) => setSettings({ ...settings, director_title: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Contact Email
                    </label>
                    <input
                      type="email"
                      value={settings.contact_email || ''}
                      onChange={(e) => setSettings({ ...settings, contact_email: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Support Phone
                    </label>
                    <input
                      value={settings.support_phone || ''}
                      onChange={(e) => setSettings({ ...settings, support_phone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Default Pass Mark (%)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={100}
                      value={settings.default_pass_mark || '70'}
                      onChange={(e) => setSettings({ ...settings, default_pass_mark: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Default Timezone
                    </label>
                    <input
                      value={settings.default_timezone || 'Africa/Dar_es_Salaam'}
                      onChange={(e) => setSettings({ ...settings, default_timezone: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Official Verification Base URL (for QR codes)
                    </label>
                    <input
                      value={settings.verification_base_url || ''}
                      onChange={(e) =>
                        setSettings({ ...settings, verification_base_url: e.target.value })
                      }
                      placeholder="Leave blank to use current host automatically"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.require_photo_for_certificate !== 'false'}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          require_photo_for_certificate: e.target.checked ? 'true' : 'false',
                        })
                      }
                      className="accent-blue-700"
                    />
                    <span>Require student profile photo before certificate generation</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.allow_admin_photo_override !== 'false'}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          allow_admin_photo_override: e.target.checked ? 'true' : 'false',
                        })
                      }
                      className="accent-blue-700"
                    />
                    <span>Allow administrator override of photo requirement</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer sm:col-span-2">
                    <input
                      type="checkbox"
                      checked={settings.show_answers_after_submit !== 'false'}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          show_answers_after_submit: e.target.checked ? 'true' : 'false',
                        })
                      }
                      className="accent-blue-700"
                    />
                    <span>Show correct answers and explanations to students after exam submission</span>
                  </label>
                </div>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-blue-700 text-white text-sm font-semibold rounded-lg cursor-pointer"
                >
                  Save Platform Settings
                </button>
              </form>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setError(null);
                  if (pwForm.newPassword !== pwForm.confirmPassword) {
                    setError('New password and confirmation do not match.');
                    return;
                  }
                  setSavingPw(true);
                  try {
                    const res = await apiFetch<{ message: string }>('/api/auth/change-password', {
                      method: 'POST',
                      body: JSON.stringify(pwForm),
                    });
                    setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
                    await refreshUser();
                    flash(res.message);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Unable to update password.');
                  } finally {
                    setSavingPw(false);
                  }
                }}
                className="bg-white border border-slate-200 rounded-xl p-6 space-y-4"
              >
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    Account Sign-In Password
                  </h2>
                  <p className="text-xs text-slate-600 mt-0.5">
                    Set or change the password for your account ({user?.email}) so you can sign in
                    through the standard login page with email and password.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  {user?.has_local_password && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Current Password
                      </label>
                      <input
                        type="password"
                        required
                        value={pwForm.currentPassword}
                        onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      New Password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={pwForm.newPassword}
                      onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
                      placeholder="Minimum 8 characters"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      required
                      minLength={8}
                      value={pwForm.confirmPassword}
                      onChange={(e) => setPwForm({ ...pwForm, confirmPassword: e.target.value })}
                      placeholder="Repeat new password"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={savingPw}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg cursor-pointer"
                >
                  {savingPw
                    ? 'Saving...'
                    : user?.has_local_password
                      ? 'Update Account Password'
                      : 'Set Account Password'}
                </button>
              </form>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
