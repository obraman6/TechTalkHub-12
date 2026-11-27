import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { apiFetch } from '../lib/api';

interface CourseItem {
  id: number;
  title: string;
  slug: string;
  course_code: string;
  level: string;
  description: string;
  duration_hours: number;
  pass_mark: number;
  certificate_type: string;
  thumbnail_url: string;
  status: string;
  category_name: string;
  category_slug: string;
  instructor_name: string;
  module_count: number;
  lesson_count: number;
  enrollment_count: number;
}

interface CategoryItem {
  id: number;
  name: string;
  slug: string;
  course_count: number;
}

interface InstructorItem {
  id: number;
  full_name: string;
}

const LEVELS = [
  { label: 'All Levels', value: 'all' },
  { label: 'Foundation', value: 'Foundation — Level 1' },
  { label: 'Intermediate', value: 'Intermediate — Level 2' },
  { label: 'Advanced', value: 'Advanced — Level 3' },
  { label: 'Professional', value: 'Professional' },
];

export function CoursesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [courses, setCourses] = useState<CourseItem[]>([]);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [instructors, setInstructors] = useState<InstructorItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [category, setCategory] = useState(searchParams.get('category') || 'all');
  const [level, setLevel] = useState(searchParams.get('level') || 'all');
  const [instructor, setInstructor] = useState(searchParams.get('instructor') || 'all');

  useEffect(() => {
    apiFetch<{ categories: CategoryItem[] }>('/api/categories')
      .then((res) => setCategories(res.categories))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (category !== 'all') params.set('category', category);
    if (level !== 'all') params.set('level', level);
    if (instructor !== 'all') params.set('instructor', instructor);
    setSearchParams(params, { replace: true });

    setLoading(true);
    apiFetch<{ courses: CourseItem[]; instructors: InstructorItem[] }>(
      `/api/courses?${params.toString()}`
    )
      .then((res) => {
        setCourses(res.courses);
        setInstructors(res.instructors);
      })
      .catch(() => setCourses([]))
      .finally(() => setLoading(false));
  }, [search, category, level, instructor, setSearchParams]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-3xl font-bold text-slate-900">
          TechTalkHub Course Catalog
        </h1>
        <p className="text-slate-600">
          Search across computer fundamentals, software engineering, IT support, cybersecurity,
          design, and data courses.
        </p>
      </div>

      {/* Search & Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-6 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search courses by title, skill, code, or keyword..."
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div className="md:col-span-3">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Filter by category"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name} ({c.course_count})
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-3">
            <select
              value={instructor}
              onChange={(e) => setInstructor(e.target.value)}
              aria-label="Filter by instructor"
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              <option value="all">All Instructors</option>
              {instructors.map((inst) => (
                <option key={inst.id} value={String(inst.id)}>
                  {inst.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Interactive Level Filter Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          {LEVELS.map((lvl) => (
            <button
              key={lvl.value}
              type="button"
              onClick={() => setLevel(lvl.value)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                level === lvl.value
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {lvl.label}
            </button>
          ))}
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <div key={n} className="h-80 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center space-y-3">
          <h3 className="font-display text-lg font-bold text-slate-900">
            No courses match your current filters
          </h3>
          <p className="text-sm text-slate-600">
            Try clearing your search keyword or switching category and level filters.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setCategory('all');
              setLevel('all');
              setInstructor('all');
            }}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-lg cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {courses.map((course) => (
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
                <div className="p-5 space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                    <span className="font-semibold text-blue-700">{course.category_name}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{course.course_code}</span>
                    <span aria-hidden="true">·</span>
                    <span>{course.level}</span>
                  </div>
                  <h2 className="font-display text-lg font-bold text-slate-900">
                    {course.title}
                  </h2>
                  <p className="text-sm text-slate-600 line-clamp-2">{course.description}</p>
                  <div className="text-xs text-slate-500 pt-1">
                    Instructor: {course.instructor_name}
                  </div>
                </div>
              </div>

              <div className="px-5 pb-5 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="text-xs text-slate-500 tabular-nums">
                  {course.duration_hours} hrs · {course.lesson_count} lessons ·{' '}
                  {course.enrollment_count} enrolled
                </div>
                <Link
                  to={`/courses/${course.slug}`}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
                >
                  View Course
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
