import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  Award,
  BookOpen,
  Camera,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Lock,
  PlayCircle,
  Save,
} from 'lucide-react';
import { CertificateRenderer, type CertificateDisplayData } from '../components/CertificateRenderer';
import { apiFetch } from '../lib/api';

interface LessonItem {
  id: number;
  module_id: number;
  title: string;
  content_markdown: string;
  video_url: string;
  attachment_name: string;
  notes: string;
  duration_minutes: number;
  completed: boolean;
  student_notes: string;
}

interface ModuleItem {
  id: number;
  title: string;
  description: string;
  progress_percent: number;
  lessons: LessonItem[];
}

interface LearnPayload {
  course: {
    id: number;
    title: string;
    slug: string;
    course_code: string;
    level: string;
    duration_hours: number;
    pass_mark: number;
    certificate_type: string;
    category_name: string;
    instructor_name: string;
  };
  enrollment: {
    status: string;
    progress_percent: number;
  };
  modules: ModuleItem[];
  assessment: {
    id: number;
    title: string;
    instructions: string;
    time_limit_minutes: number;
    max_attempts: number;
    pass_mark: number;
    question_count: number;
  } | null;
  attempts: Array<{
    id: number;
    score_percent: number;
    correct_count: number;
    total_questions: number;
    passed: number;
    submitted_at: string;
  }>;
  eligibility: {
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
  };
}

interface ExamQuestion {
  id: number;
  question_text: string;
  question_type: 'mcq_single' | 'mcq_multi' | 'true_false';
  options: string[];
  points: number;
}

interface ExamSubmitResponse {
  scorePercent: number;
  correctCount: number;
  totalQuestions: number;
  passMark: number;
  passed: boolean;
  showAnswersAfterSubmit?: boolean;
  breakdown: Array<{
    questionId: number;
    questionText: string;
    selectedAnswers: string[];
    correctAnswers?: string[];
    isCorrect: boolean;
    explanation?: string;
  }>;
  issuedCertificate: { certificate_id: string } | null;
  needsPhoto: boolean;
}

function isSafeHttpUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function CoursePlayerPage() {
  const { slug } = useParams();
  const [data, setData] = useState<LearnPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<'lesson' | 'assessment'>('lesson');
  const [activeLessonId, setActiveLessonId] = useState<number | null>(null);
  const [noteText, setNoteText] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Assessment states
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number>(0);
  const [examResult, setExamResult] = useState<ExamSubmitResponse | null>(null);
  const [submittingExam, setSubmittingExam] = useState(false);
  const [claimedCert, setClaimedCert] = useState<CertificateDisplayData | null>(null);

  const loadCourse = useCallback(async () => {
    if (!slug) return;
    try {
      const res = await apiFetch<LearnPayload>(
        `/api/student/courses/${encodeURIComponent(slug)}/learn`
      );
      setData(res);
      setActiveLessonId((prev) => {
        if (prev) return prev;
        const firstIncomplete = res.modules
          .flatMap((m) => m.lessons)
          .find((l) => !l.completed);
        return firstIncomplete?.id || res.modules[0]?.lessons[0]?.id || null;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load course.');
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    loadCourse();
  }, [loadCourse]);

  const activeLesson = data?.modules
    .flatMap((m) => m.lessons)
    .find((l) => l.id === activeLessonId);

  useEffect(() => {
    if (activeLesson) {
      setNoteText(activeLesson.student_notes || '');
      apiFetch(`/api/student/lessons/${activeLesson.id}/view`, { method: 'POST' }).catch(() => {});
    }
  }, [activeLesson?.id, activeLesson?.student_notes]);

  // Load issued certificate details if exists
  useEffect(() => {
    const certId = data?.eligibility.existingCertificateId;
    if (!certId) return;
    apiFetch<{ certificate: CertificateDisplayData }>(`/api/verify/${encodeURIComponent(certId)}`)
      .then((res) => {
        if (res.certificate) setClaimedCert(res.certificate);
      })
      .catch(() => {});
  }, [data?.eligibility.existingCertificateId]);

  // Countdown timer during active exam
  useEffect(() => {
    if (!examQuestions || secondsLeft <= 0 || examResult) return;
    const timer = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [examQuestions, secondsLeft, examResult]);

  const handleToggleComplete = async (lessonId: number, completed: boolean) => {
    try {
      await apiFetch(`/api/student/lessons/${lessonId}/complete`, {
        method: 'POST',
        body: JSON.stringify({ completed }),
      });
      await loadCourse();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update progress.');
    }
  };

  const handleSaveNotes = async () => {
    if (!activeLesson) return;
    setSavingNote(true);
    try {
      await apiFetch(`/api/student/lessons/${activeLesson.id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ notes: noteText }),
      });
      await loadCourse();
    } finally {
      setSavingNote(false);
    }
  };

  const handleDownloadGuide = (lesson: LessonItem) => {
    const blob = new Blob(
      [
        `TECHTALKHUB STUDY MATERIAL\n`,
        `Course: ${data?.course.title}\n`,
        `Lesson: ${lesson.title}\n`,
        `==================================================\n\n`,
        lesson.content_markdown,
        lesson.notes ? `\n\nInstructor Notes:\n${lesson.notes}\n` : '',
      ],
      { type: 'text/plain;charset=utf-8' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = lesson.attachment_name || `${lesson.title.toLowerCase().replace(/\s+/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleStartExam = async () => {
    if (!data) return;
    setError(null);
    setExamResult(null);
    try {
      const res = await apiFetch<{
        assessment: { time_limit_minutes: number };
        questions: ExamQuestion[];
      }>(`/api/student/assessments/${data.course.id}`);
      setExamQuestions(res.questions);
      setAnswers({});
      setCurrentQuestionIdx(0);
      setConfirmSubmit(false);
      setSecondsLeft((res.assessment.time_limit_minutes || 20) * 60);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load assessment.');
    }
  };

  const handleOptionChange = (
    questionId: number,
    option: string,
    type: ExamQuestion['question_type']
  ) => {
    setAnswers((prev) => {
      const key = String(questionId);
      if (type === 'mcq_multi') {
        const current = prev[key] || [];
        const exists = current.includes(option);
        return {
          ...prev,
          [key]: exists ? current.filter((o) => o !== option) : [...current, option],
        };
      }
      return { ...prev, [key]: [option] };
    });
  };

  const handleSubmitExam = async () => {
    if (!data) return;
    setSubmittingExam(true);
    setError(null);
    try {
      const res = await apiFetch<ExamSubmitResponse>(
        `/api/student/assessments/${data.course.id}/submit`,
        {
          method: 'POST',
          body: JSON.stringify({ answers }),
        }
      );
      setExamResult(res);
      await loadCourse();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit assessment.');
    } finally {
      setSubmittingExam(false);
    }
  };

  const handleClaimCertificate = async () => {
    if (!data) return;
    setError(null);
    try {
      await apiFetch(`/api/student/courses/${data.course.id}/claim-certificate`, {
        method: 'POST',
      });
      await loadCourse();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to generate certificate.');
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="h-72 bg-white border border-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center space-y-4">
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Course Access Required
        </h1>
        <p className="text-slate-600">{error || 'Please enroll in this course first.'}</p>
        <Link to={`/courses/${slug}`} className="inline-block px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold">
          Go to Course Page
        </Link>
      </div>
    );
  }

  const { course, enrollment, modules, assessment, attempts, eligibility } = data;
  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Course Progress Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500">
            {course.category_name} · <span className="font-mono">{course.course_code}</span> ·{' '}
            {course.level}
          </div>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900 mt-0.5">
            {course.title}
          </h1>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="min-w-[180px]">
            <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
              <span>Course Progress</span>
              <span className="tabular-nums">{enrollment.progress_percent}%</span>
            </div>
            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-700 transition-all"
                style={{ width: `${enrollment.progress_percent}%` }}
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => setViewMode(viewMode === 'lesson' ? 'assessment' : 'lesson')}
            className="px-4 py-2 text-sm font-semibold text-white bg-slate-900 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            {viewMode === 'lesson' ? 'Final Assessment & Certificate' : 'Back to Lessons'}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Main Two-Zone Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Module Navigator */}
        <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
            <h2 className="font-display text-sm font-bold text-slate-900">
              Modules & Lessons
            </h2>
            <span className="text-xs text-slate-500 tabular-nums">
              {eligibility.completedLessons}/{eligibility.totalLessons} done
            </span>
          </div>

          <div className="space-y-3">
            {modules.map((mod) => (
              <div key={mod.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800 px-1">
                  <span className="truncate">{mod.title}</span>
                  <span className="tabular-nums text-blue-700 shrink-0">
                    {mod.progress_percent === 100 ? '✓' : `${mod.progress_percent}%`}
                  </span>
                </div>
                <div className="space-y-1">
                  {mod.lessons.map((lesson) => {
                    const isSelected = viewMode === 'lesson' && lesson.id === activeLessonId;
                    return (
                      <button
                        key={lesson.id}
                        type="button"
                        onClick={() => {
                          setActiveLessonId(lesson.id);
                          setViewMode('lesson');
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-blue-50 text-blue-800 font-semibold border border-blue-200'
                            : 'hover:bg-slate-50 text-slate-700'
                        }`}
                      >
                        <span className="flex items-center gap-2 truncate">
                          {lesson.completed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          ) : (
                            <BookOpen className="w-4 h-4 text-slate-400 shrink-0" />
                          )}
                          <span className="truncate">{lesson.title}</span>
                        </span>
                        <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                          {lesson.duration_minutes}m
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Final Assessment Nav Entry */}
            <div className="pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setViewMode('assessment')}
                className={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer ${
                  viewMode === 'assessment'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-800 hover:bg-slate-200'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Award className="w-4 h-4" />
                  Final Assessment & Certificate
                </span>
                {eligibility.progressPercent < 100 && <Lock className="w-3.5 h-3.5 opacity-70" />}
              </button>
            </div>
          </div>
        </aside>

        {/* Right Main Stage */}
        <div className="lg:col-span-8 space-y-6">
          {viewMode === 'lesson' && activeLesson ? (
            <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <div className="text-xs font-semibold text-blue-700">
                    Lesson · {activeLesson.duration_minutes} Minutes
                  </div>
                  <h2 className="font-display text-2xl font-bold text-slate-900 mt-1">
                    {activeLesson.title}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleComplete(activeLesson.id, !activeLesson.completed)}
                  className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-colors cursor-pointer ${
                    activeLesson.completed
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
                      : 'bg-blue-700 text-white hover:bg-blue-800'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {activeLesson.completed ? 'Completed ✓' : 'Mark Lesson Complete'}
                </button>
              </div>

              {activeLesson.video_url && isSafeHttpUrl(activeLesson.video_url) && (
                <div className="bg-slate-900 text-white rounded-xl p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <PlayCircle className="w-6 h-6 text-blue-400 shrink-0" />
                    <div className="text-sm">
                      <div className="font-semibold">Educational Video Resource</div>
                      <div className="text-xs text-slate-400 truncate max-w-md">
                        {activeLesson.video_url}
                      </div>
                    </div>
                  </div>
                  <a
                    href={activeLesson.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 rounded-lg shrink-0"
                  >
                    Watch Video
                  </a>
                </div>
              )}

              {/* Lesson Prose */}
              <div className="space-y-3 text-slate-700 leading-relaxed text-[15px] whitespace-pre-line">
                {activeLesson.content_markdown}
              </div>

              {activeLesson.notes && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700">
                  <div className="font-semibold text-slate-900 mb-1 flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-blue-700" />
                    Instructor Summary Note
                  </div>
                  <p>{activeLesson.notes}</p>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => handleDownloadGuide(activeLesson)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  Download Study Notes
                </button>
              </div>

              {/* Student Personal Notes */}
              <div className="pt-4 border-t border-slate-100 space-y-2.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500">
                  My Personal Lesson Notes
                </label>
                <textarea
                  rows={3}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  placeholder="Write your study takeaways or reminders for this lesson..."
                  className="w-full p-3 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
                <button
                  type="button"
                  disabled={savingNote}
                  onClick={handleSaveNotes}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  {savingNote ? 'Saving...' : 'Save Notes'}
                </button>
              </div>
            </div>
          ) : (
            /* Final Assessment & Certificate Eligibility Panel */
            <div className="space-y-6">
              {/* Eligibility Checklist */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h2 className="font-display text-xl font-bold text-slate-900">
                  Certificate Eligibility Status
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div className="p-3.5 border border-slate-200 rounded-lg flex items-center justify-between">
                    <span className="text-slate-700">Course Lessons (100%)</span>
                    <span
                      className={`font-semibold tabular-nums ${
                        eligibility.progressPercent === 100 ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {eligibility.progressPercent}%
                    </span>
                  </div>
                  <div className="p-3.5 border border-slate-200 rounded-lg flex items-center justify-between">
                    <span className="text-slate-700">Assessment ({eligibility.passMark}% min)</span>
                    <span
                      className={`font-semibold ${
                        eligibility.assessmentPassed ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {eligibility.assessmentPassed
                        ? `PASSED (${eligibility.bestScore}%)`
                        : 'Pending'}
                    </span>
                  </div>
                  <div className="p-3.5 border border-slate-200 rounded-lg flex items-center justify-between sm:col-span-2">
                    <span className="text-slate-700">Official Student Profile Photo</span>
                    {eligibility.hasPhoto ? (
                      <span className="font-semibold text-emerald-700">Uploaded ✓</span>
                    ) : (
                      <Link
                        to="/student?tab=profile"
                        className="inline-flex items-center gap-1.5 font-semibold text-blue-700 hover:underline"
                      >
                        <Camera className="w-4 h-4" />
                        Upload Photo Required
                      </Link>
                    )}
                  </div>
                </div>

                {!eligibility.hasPhoto && eligibility.photoRequired && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3.5 text-sm text-amber-900 flex items-start gap-2.5">
                    <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold">
                        Please upload a profile photo before generating your certificate.
                      </p>
                      <Link
                        to="/student?tab=profile"
                        className="text-xs font-semibold text-blue-700 hover:underline mt-1 inline-block"
                      >
                        Go to My Profile to upload your portrait photo →
                      </Link>
                    </div>
                  </div>
                )}

                {eligibility.eligible && !eligibility.existingCertificateId && (
                  <button
                    type="button"
                    onClick={handleClaimCertificate}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg cursor-pointer"
                  >
                    <Award className="w-4 h-4" />
                    Generate & Claim Official Certificate
                  </button>
                )}
              </div>

              {/* Earned Certificate Preview */}
              {claimedCert && (
                <div className="space-y-3">
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    Your Earned Certificate
                  </h3>
                  <CertificateRenderer certificate={claimedCert} />
                </div>
              )}

              {/* Assessment Runner */}
              {assessment && (
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-100">
                    <div>
                      <h3 className="font-display text-lg font-bold text-slate-900">
                        {assessment.title}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                        {assessment.question_count} Questions · {assessment.time_limit_minutes} Min Limit · Pass Mark: {assessment.pass_mark}% · Attempts: {attempts.length}/{assessment.max_attempts}
                      </p>
                    </div>

                    {!examQuestions && attempts.length < assessment.max_attempts && (
                      <button
                        type="button"
                        onClick={handleStartExam}
                        className="px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                      >
                        {attempts.length > 0 ? 'Retake Assessment' : 'Start Assessment'}
                      </button>
                    )}
                  </div>

                  {!examQuestions && !examResult && (
                    <div className="space-y-3">
                      <p className="text-sm text-slate-600">{assessment.instructions}</p>
                      {attempts.length > 0 && (
                        <div className="space-y-2 pt-2">
                          <div className="text-xs font-semibold uppercase text-slate-500">
                            Previous Attempts
                          </div>
                          <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                            {attempts.map((a) => (
                              <div
                                key={a.id}
                                className="px-4 py-2.5 flex items-center justify-between text-sm"
                              >
                                <span className="tabular-nums font-medium">
                                  Score: {a.score_percent}% ({a.correct_count}/{a.total_questions})
                                </span>
                                <span
                                  className={`font-semibold text-xs ${
                                    a.passed ? 'text-emerald-700' : 'text-red-700'
                                  }`}
                                >
                                  {a.passed ? 'PASSED' : 'FAILED'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {examQuestions && !examResult && (
                    <div className="space-y-6">
                      <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 text-white px-4 py-2.5 rounded-lg text-sm">
                        <span>
                          Question {currentQuestionIdx + 1} of {examQuestions.length} ·{' '}
                          {Object.keys(answers).filter((k) => (answers[k] || []).length > 0).length} answered
                        </span>
                        <span className="font-mono font-bold tabular-nums flex items-center gap-1.5">
                          <Clock className="w-4 h-4" />
                          {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
                        </span>
                      </div>

                      {/* Question Navigator */}
                      <div className="flex flex-wrap gap-1.5">
                        {examQuestions.map((eq, i) => {
                          const answered = (answers[String(eq.id)] || []).length > 0;
                          const isCurrent = i === currentQuestionIdx;
                          return (
                            <button
                              key={eq.id}
                              type="button"
                              onClick={() => setCurrentQuestionIdx(i)}
                              className={`w-8 h-8 rounded-lg text-xs font-mono font-bold cursor-pointer border transition-colors ${
                                isCurrent
                                  ? 'bg-blue-700 text-white border-blue-700'
                                  : answered
                                    ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {i + 1}
                            </button>
                          );
                        })}
                      </div>

                      {(() => {
                        const q = examQuestions[currentQuestionIdx];
                        if (!q) return null;
                        return (
                          <div className="border border-slate-200 rounded-xl p-5 space-y-3">
                            <div className="text-xs font-semibold text-blue-700">
                              Question {currentQuestionIdx + 1} of {examQuestions.length}{' '}
                              {q.question_type === 'mcq_multi' ? '(Select all that apply)' : ''}
                            </div>
                            <p className="font-semibold text-slate-900">{q.question_text}</p>
                            <div className="space-y-2">
                              {q.options.map((opt) => {
                                const selected = (answers[String(q.id)] || []).includes(opt);
                                return (
                                  <label
                                    key={opt}
                                    className={`flex items-center gap-3 p-3 border rounded-lg text-sm cursor-pointer transition-colors ${
                                      selected
                                        ? 'border-blue-600 bg-blue-50 text-slate-900 font-medium'
                                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                                    }`}
                                  >
                                    <input
                                      type={q.question_type === 'mcq_multi' ? 'checkbox' : 'radio'}
                                      name={`q_${q.id}`}
                                      checked={selected}
                                      onChange={() => handleOptionChange(q.id, opt, q.question_type)}
                                      className="accent-blue-700"
                                    />
                                    <span>{opt}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}

                      {confirmSubmit && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
                          <div className="text-amber-950 font-medium">
                            Ready to submit? You answered{' '}
                            {Object.keys(answers).filter((k) => (answers[k] || []).length > 0).length} of{' '}
                            {examQuestions.length} questions.
                          </div>
                          <div className="flex gap-2">
                            <button
                              type="button"
                              onClick={() => setConfirmSubmit(false)}
                              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg cursor-pointer"
                            >
                              Keep Reviewing
                            </button>
                            <button
                              type="button"
                              disabled={submittingExam}
                              onClick={handleSubmitExam}
                              className="px-4 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                            >
                              {submittingExam ? 'Grading...' : 'Confirm & Submit'}
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={currentQuestionIdx === 0}
                            onClick={() => setCurrentQuestionIdx((i) => Math.max(0, i - 1))}
                            className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg cursor-pointer"
                          >
                            Previous
                          </button>
                          <button
                            type="button"
                            disabled={currentQuestionIdx >= examQuestions.length - 1}
                            onClick={() =>
                              setCurrentQuestionIdx((i) => Math.min(examQuestions.length - 1, i + 1))
                            }
                            className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 rounded-lg cursor-pointer"
                          >
                            Next
                          </button>
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => {
                              setExamQuestions(null);
                              setConfirmSubmit(false);
                            }}
                            className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 rounded-lg cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmSubmit(true)}
                            className="px-5 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg cursor-pointer"
                          >
                            Submit Assessment
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {examResult && (
                    <div className="space-y-5">
                      <div
                        className={`p-5 rounded-xl border ${
                          examResult.passed
                            ? 'bg-emerald-50 border-emerald-200'
                            : 'bg-red-50 border-red-200'
                        }`}
                      >
                        <div className="text-xs font-bold uppercase tracking-wider">
                          Assessment Result
                        </div>
                        <div className="font-display text-2xl font-bold text-slate-900 mt-1 tabular-nums">
                          Score: {examResult.scorePercent}% —{' '}
                          {examResult.passed ? 'PASSED' : 'NOT PASSED'}
                        </div>
                        <p className="text-sm text-slate-700 mt-1">
                          You answered {examResult.correctCount} of {examResult.totalQuestions}{' '}
                          questions correctly (Required pass mark: {examResult.passMark}%).
                        </p>
                        {examResult.needsPhoto && (
                          <p className="text-sm font-semibold text-amber-800 mt-2">
                            Please upload a profile photo before generating your certificate.
                          </p>
                        )}
                      </div>

                      <div className="space-y-3">
                        <h4 className="font-display text-sm font-bold text-slate-900">
                          Question Review & Explanations
                        </h4>
                        {examResult.breakdown.map((b, i) => (
                          <div
                            key={b.questionId}
                            className="border border-slate-200 rounded-lg p-4 space-y-1.5 text-sm"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-900">
                                {i + 1}. {b.questionText}
                              </span>
                              <span
                                className={`text-xs font-bold shrink-0 ${
                                  b.isCorrect ? 'text-emerald-700' : 'text-red-700'
                                }`}
                              >
                                {b.isCorrect ? 'CORRECT' : 'INCORRECT'}
                              </span>
                            </div>
                            <div className="text-xs text-slate-600">
                              Your answer: {b.selectedAnswers.join(', ') || 'None'}
                              {b.correctAnswers && b.correctAnswers.length > 0 && (
                                <> · Correct: {b.correctAnswers.join(', ')}</>
                              )}
                            </div>
                            {b.explanation && (
                              <p className="text-xs text-slate-500 pt-1">{b.explanation}</p>
                            )}
                          </div>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setExamQuestions(null);
                          setExamResult(null);
                        }}
                        className="px-4 py-2 text-sm font-semibold text-slate-800 bg-slate-100 rounded-lg cursor-pointer"
                      >
                        Close Review
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
