import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Award, BookOpen, CheckCircle2, Clock, FileCheck, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';

interface CourseDetailResponse {
  course: {
    id: number;
    title: string;
    slug: string;
    course_code: string;
    level: string;
    description: string;
    learning_objectives: string[];
    duration_hours: number;
    pass_mark: number;
    certificate_type: string;
    thumbnail_url: string;
    category_name: string;
    instructor_name: string;
    instructor_title: string;
    instructor_specialty: string;
    instructor_bio: string;
    enrollment_count: number;
  };
  modules: Array<{
    id: number;
    title: string;
    description: string;
    lessons: Array<{ id: number; title: string; duration_minutes: number }>;
  }>;
  assessment: {
    id: number;
    title: string;
    time_limit_minutes: number;
    max_attempts: number;
    pass_mark: number;
    question_count: number;
  } | null;
}

export function CourseDetailPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [data, setData] = useState<CourseDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [enrolling, setEnrolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    apiFetch<CourseDetailResponse>(`/api/courses/${encodeURIComponent(slug)}`)
      .then(setData)
      .catch((err) => setError(err instanceof Error ? err.message : 'Course not found.'))
      .finally(() => setLoading(false));
  }, [slug]);

  const handleEnroll = async () => {
    if (!data) return;
    if (!user) {
      navigate(`/login?redirect=/courses/${data.course.slug}`);
      return;
    }
    setEnrolling(true);
    setError(null);
    try {
      await apiFetch(`/api/student/courses/${data.course.id}/enroll`, {
        method: 'POST',
      });
      navigate(`/learn/${data.course.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to enroll.');
    } finally {
      setEnrolling(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12">
        <div className="h-64 bg-white border border-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-slate-900">Course Not Found</h1>
        <p className="text-slate-600">{error || 'The requested course could not be found.'}</p>
        <Link to="/courses" className="inline-block px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold">
          Return to Catalog
        </Link>
      </div>
    );
  }

  const { course, modules, assessment } = data;
  const totalLessons = modules.reduce((acc, m) => acc + m.lessons.length, 0);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-10">
      {/* Header Split */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <div className="lg:col-span-7 space-y-5 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-blue-700">{course.category_name}</span>
              <span aria-hidden="true">·</span>
              <span className="font-mono font-medium">{course.course_code}</span>
              <span aria-hidden="true">·</span>
              <span className="font-semibold text-slate-800">{course.level}</span>
            </div>

            <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-900 text-balance">
              {course.title}
            </h1>
            <p className="text-slate-600 leading-relaxed">{course.description}</p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-slate-100 text-sm">
              <div>
                <div className="text-xs text-slate-500">Duration</div>
                <div className="font-semibold text-slate-900 tabular-nums">
                  {course.duration_hours} Hours
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Curriculum</div>
                <div className="font-semibold text-slate-900 tabular-nums">
                  {modules.length} Modules · {totalLessons} Lessons
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Pass Mark</div>
                <div className="font-semibold text-slate-900 tabular-nums">{course.pass_mark}%</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Enrolled</div>
                <div className="font-semibold text-slate-900 tabular-nums">
                  {course.enrollment_count} Students
                </div>
              </div>
            </div>

            {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={enrolling}
                onClick={handleEnroll}
                className="px-6 py-3 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 disabled:opacity-60 rounded-lg transition-colors cursor-pointer"
              >
                {enrolling ? 'Enrolling...' : user ? 'Enroll & Start Learning' : 'Sign In to Enroll'}
              </button>
              <Link
                to="/courses"
                className="px-4 py-3 text-sm font-medium text-slate-700 hover:text-slate-900"
              >
                ← All Courses
              </Link>
            </div>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="h-full min-h-[240px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
            <img
              src={course.thumbnail_url}
              alt={course.title}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      </div>

      {/* Body Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-8 space-y-8">
          {/* Learning Objectives */}
          {course.learning_objectives.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="font-display text-xl font-bold text-slate-900">
                Learning Objectives & Verified Skills
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {course.learning_objectives.map((obj, idx) => (
                  <div key={idx} className="flex items-start gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{obj}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Modules & Lessons */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
            <h2 className="font-display text-xl font-bold text-slate-900">
              Course Curriculum
            </h2>
            <div className="space-y-4">
              {modules.map((mod) => (
                <div key={mod.id} className="border border-slate-200 rounded-lg overflow-hidden">
                  <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-4">
                    <div>
                      <h3 className="font-display text-sm font-bold text-slate-900">{mod.title}</h3>
                      {mod.description && (
                        <p className="text-xs text-slate-600 mt-0.5">{mod.description}</p>
                      )}
                    </div>
                    <span className="text-xs text-slate-500 tabular-nums shrink-0">
                      {mod.lessons.length} lessons
                    </span>
                  </div>
                  <ul className="divide-y divide-slate-100">
                    {mod.lessons.map((l) => (
                      <li
                        key={l.id}
                        className="px-4 py-2.5 flex items-center justify-between gap-4 text-sm"
                      >
                        <span className="flex items-center gap-2.5 text-slate-700">
                          <BookOpen className="w-4 h-4 text-slate-400 shrink-0" />
                          {l.title}
                        </span>
                        <span className="text-xs text-slate-500 flex items-center gap-1 tabular-nums shrink-0">
                          <Clock className="w-3.5 h-3.5" />
                          {l.duration_minutes} min
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2.5 text-blue-700 font-semibold text-sm">
              <Award className="w-5 h-5" />
              Certification Details
            </div>
            <dl className="space-y-2.5 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Credential Type</dt>
                <dd className="font-semibold text-slate-900 text-right">{course.certificate_type}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Course Level</dt>
                <dd className="font-semibold text-slate-900 text-right">{course.level}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Assessment</dt>
                <dd className="font-semibold text-slate-900 text-right tabular-nums">
                  {assessment ? `${assessment.question_count} Questions` : 'Included'}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-slate-500">Required Score</dt>
                <dd className="font-semibold text-slate-900 text-right tabular-nums">
                  {course.pass_mark}%
                </dd>
              </div>
            </dl>
            <div className="pt-3 border-t border-slate-100 text-xs text-slate-600 flex items-start gap-2">
              <FileCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>
                Includes unique Certificate ID, QR verification link, student photograph, and A4 PDF download.
              </span>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
            <div className="flex items-center gap-2.5 text-slate-900 font-semibold text-sm">
              <User className="w-4 h-4 text-slate-600" />
              Course Instructor
            </div>
            <div>
              <div className="font-display font-bold text-slate-900">
                {course.instructor_name || 'TechTalkHub Faculty'}
              </div>
              <div className="text-xs text-blue-700 font-medium">
                {course.instructor_title || 'Technology Instructor'}
              </div>
            </div>
            {course.instructor_bio && (
              <p className="text-sm text-slate-600 leading-relaxed">{course.instructor_bio}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
