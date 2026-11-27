import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Award, CheckCircle2, Download, ExternalLink, MapPin, User } from 'lucide-react';
import { TechTalkHubLogoMark } from '../components/Navbar';
import { apiFetch } from '../lib/api';

interface PublicProfileResponse {
  profile: {
    username: string;
    full_name: string;
    headline: string;
    bio: string;
    country: string;
    city: string;
    photo_url: string | null;
    member_since: string;
    is_demo: boolean;
    email: string | null;
    phone: string | null;
  };
  certificates: Array<{
    certificate_id: string;
    certificate_type: string;
    level: string;
    score: number;
    issue_date: string;
    status: string;
    course_title: string;
    course_slug: string;
    duration_hours: number;
    category_name: string;
  }>;
  completedCourses: Array<{
    title: string;
    slug: string;
    level: string;
    duration_hours: number;
    completed_at: string;
    category_name: string;
  }>;
  skills: Array<{ skill_name: string; source: string }>;
}

export function PublicProfilePage() {
  const { username } = useParams();
  const [data, setData] = useState<PublicProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!username) return;
    setLoading(true);
    apiFetch<PublicProfileResponse>(`/api/profile/${encodeURIComponent(username)}`)
      .then((res) => {
        setData(res);
        document.title = `${res.profile.full_name} — TechTalkHub Certified Profile`;
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Profile not found.'))
      .finally(() => setLoading(false));
  }, [username]);

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
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Public Profile Unavailable
        </h1>
        <p className="text-slate-600">{error || 'This certification profile does not exist or is private.'}</p>
        <Link to="/" className="inline-block px-4 py-2 bg-blue-700 text-white rounded-lg text-sm font-semibold">
          Return Home
        </Link>
      </div>
    );
  }

  const { profile, certificates, completedCourses, skills } = data;
  const location = [profile.city, profile.country].filter(Boolean).join(', ');

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Header Card */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4 pb-6 mb-6 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <TechTalkHubLogoMark className="w-9 h-9 shrink-0" />
            <span className="font-display text-sm font-bold tracking-wide text-slate-900">
              TECHTALKHUB VERIFIED CERTIFICATION PROFILE
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-6 items-start">
          <div className="w-32 aspect-[5/6] rounded-xl border border-slate-200 bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center">
            {profile.photo_url ? (
              <img
                src={profile.photo_url}
                alt={profile.full_name}
                className="w-full h-full object-cover object-top block"
                referrerPolicy="no-referrer"
              />
            ) : (
              <User className="w-10 h-10 text-slate-400" />
            )}
          </div>

          <div className="space-y-3 flex-1">
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
                {profile.full_name}
              </h1>
              <p className="text-sm font-semibold text-blue-700 mt-0.5">{profile.headline}</p>
            </div>

            {profile.bio && (
              <p className="text-sm text-slate-600 leading-relaxed max-w-2xl">{profile.bio}</p>
            )}

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
              {location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {location}
                </span>
              )}
              <span>
                Member since{' '}
                {new Date(profile.member_since).toLocaleDateString('en-GB', {
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
              {profile.email && <span>Email: {profile.email}</span>}
              {profile.phone && <span>Phone: {profile.phone}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Skills */}
      {skills.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <h2 className="font-display text-lg font-bold text-slate-900">
            Verified & Declared Skills
          </h2>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-slate-800">
            {skills.map((s, idx) => (
              <span key={s.skill_name} className="inline-flex items-center gap-1.5">
                {s.source === 'verified_course' && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                )}
                <span className={s.source === 'verified_course' ? 'font-semibold' : ''}>
                  {s.skill_name}
                </span>
                {idx < skills.length - 1 && (
                  <span className="text-slate-300" aria-hidden="true">·</span>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Verified Certificates */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <h2 className="font-display text-lg font-bold text-slate-900">
          Verified Certificates ({certificates.length})
        </h2>
        {certificates.length === 0 ? (
          <p className="text-sm text-slate-500">No certificates issued yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {certificates.map((cert) => (
              <div
                key={cert.certificate_id}
                className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Award className="w-4 h-4 text-blue-700" />
                    <span className="font-mono font-bold text-slate-800">
                      {cert.certificate_id}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={
                        cert.status === 'VALID'
                          ? 'font-semibold text-emerald-700'
                          : 'font-semibold text-red-700'
                      }
                    >
                      {cert.status}
                    </span>
                  </div>
                  <h3 className="font-display text-base font-bold text-slate-900">
                    {cert.course_title}
                  </h3>
                  <div className="text-xs text-slate-500">
                    {cert.certificate_type} · {cert.level} · Issued{' '}
                    {new Date(cert.issue_date).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    to={`/verify/${encodeURIComponent(cert.certificate_id)}`}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-blue-700 border border-blue-200 hover:bg-blue-50 rounded-lg"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Verify
                  </Link>
                  <a
                    href={`/api/certificates/${encodeURIComponent(cert.certificate_id)}/pdf`}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg"
                  >
                    <Download className="w-3.5 h-3.5" />
                    PDF
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Completed Courses */}
      {completedCourses.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
          <h2 className="font-display text-lg font-bold text-slate-900">
            Completed Courses ({completedCourses.length})
          </h2>
          <div className="divide-y divide-slate-100">
            {completedCourses.map((c) => (
              <div key={c.slug} className="py-3 flex items-center justify-between gap-4 text-sm">
                <div>
                  <Link to={`/courses/${c.slug}`} className="font-semibold text-slate-900 hover:text-blue-700">
                    {c.title}
                  </Link>
                  <div className="text-xs text-slate-500">
                    {c.category_name} · {c.level} · {c.duration_hours} hrs
                  </div>
                </div>
                <span className="text-xs font-medium text-emerald-700">Completed</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
