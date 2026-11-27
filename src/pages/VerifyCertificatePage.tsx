import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  Search,
  ShieldCheck,
  User,
  XCircle,
} from 'lucide-react';
import { CertificateRenderer } from '../components/CertificateRenderer';
import { TechTalkHubLogoMark } from '../components/Navbar';
import { apiFetch, ApiError } from '../lib/api';

interface VerifyPayload {
  status: 'VALID' | 'REVOKED' | 'NOT_FOUND';
  certificate?: {
    certificate_id: string;
    certificate_type: string;
    level: string;
    score: number;
    issue_date: string;
    status: string;
    revoked_at: string | null;
    revocation_reason: string | null;
    verification_url: string;
    qr_code_data: string;
    template_code: string;
    is_demo: boolean;
    student_name: string;
    student_username: string;
    student_headline: string;
    student_photo_url: string | null;
    public_profile_enabled: boolean;
    course_title: string;
    course_code: string;
    course_slug: string;
    category_name: string;
    duration_hours: number;
    instructor_name: string;
    instructor_title: string;
    director_name: string;
    director_title: string;
    verified_skills: Array<{ skill_name: string; source: string }>;
  };
  message?: string;
}

export function VerifyCertificatePage() {
  const { certificateId } = useParams();
  const navigate = useNavigate();
  const [inputCode, setInputCode] = useState(certificateId || '');
  const [result, setResult] = useState<VerifyPayload | null>(null);
  const [loading, setLoading] = useState(Boolean(certificateId));
  const [showFullCertificate, setShowFullCertificate] = useState(false);

  useEffect(() => {
    if (!certificateId) {
      setResult(null);
      setLoading(false);
      document.title = 'Verify Certificate — TechTalkHub';
      return;
    }

    setInputCode(certificateId);
    setLoading(true);
    setShowFullCertificate(false);

    apiFetch<VerifyPayload>(`/api/verify/${encodeURIComponent(certificateId)}`)
      .then((res) => {
        setResult(res);
        if (res.certificate) {
          document.title = `${res.certificate.certificate_id} (${res.status}) — TechTalkHub Verification`;
        }
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 404) {
          setResult({
            status: 'NOT_FOUND',
            message:
              'The certificate ID provided could not be verified in the TechTalkHub certification database.',
          });
          document.title = 'Certificate Not Found — TechTalkHub';
        } else {
          setResult({
            status: 'NOT_FOUND',
            message: 'Unable to verify certificate right now. Please try again.',
          });
        }
      })
      .finally(() => setLoading(false));
  }, [certificateId]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = inputCode.trim().toUpperCase();
    if (!cleaned) return;
    navigate(`/verify/${encodeURIComponent(cleaned)}`);
  };

  const cert = result?.certificate;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
      {/* Search Header */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-3">
          <TechTalkHubLogoMark className="w-12 h-12 shrink-0" />
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900">
              TechTalkHub Certificate Verification
            </h1>
            <p className="text-sm text-slate-600">
              Official verification authority for TechTalkHub credentials. Enter a Certificate ID below.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              placeholder="Enter Certificate ID (e.g. TTH-CF-2026-A1B2C3)"
              aria-label="Certificate ID"
              className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-lg font-mono text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <button
            type="submit"
            className="px-6 py-3 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer"
          >
            Verify Certificate
          </button>
        </form>
      </div>

      {/* Loading */}
      {loading && (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center text-slate-600">
          Querying TechTalkHub certification database...
        </div>
      )}

      {/* NOT FOUND */}
      {!loading && result?.status === 'NOT_FOUND' && (
        <div className="bg-white border border-red-200 rounded-2xl p-8 space-y-4">
          <div className="flex items-start gap-4">
            <XCircle className="w-10 h-10 text-red-600 shrink-0" />
            <div className="space-y-1.5">
              <div className="text-xs font-bold uppercase tracking-wider text-red-700">
                Verification Failed
              </div>
              <h2 className="font-display text-2xl font-bold text-slate-900">
                CERTIFICATE NOT FOUND
              </h2>
              <p className="text-slate-600">
                The certificate ID{' '}
                <span className="font-mono font-semibold text-slate-900">
                  {certificateId?.toUpperCase()}
                </span>{' '}
                could not be verified in the TechTalkHub certification database.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* REVOKED */}
      {!loading && result?.status === 'REVOKED' && cert && (
        <div className="bg-white border border-amber-300 rounded-2xl p-8 space-y-6">
          <div className="flex items-start gap-4 pb-6 border-b border-amber-200">
            <AlertTriangle className="w-10 h-10 text-amber-600 shrink-0" />
            <div className="space-y-1.5">
              <div className="text-xs font-bold uppercase tracking-wider text-amber-800">
                Credential Status Alert
              </div>
              <h2 className="font-display text-2xl font-bold text-slate-900">
                CERTIFICATE REVOKED
              </h2>
              <p className="text-sm text-slate-700">
                This credential has been revoked by TechTalkHub administration and is no
                longer valid.
              </p>
            </div>
          </div>

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-500">Certificate ID</dt>
              <dd className="font-mono font-bold text-slate-900 mt-1">{cert.certificate_id}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-500">Status</dt>
              <dd className="font-bold text-red-700 mt-1">REVOKED</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-500">Issued To</dt>
              <dd className="font-semibold text-slate-900 mt-1">{cert.student_name}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-500">Course</dt>
              <dd className="font-semibold text-slate-900 mt-1">{cert.course_title}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-xs font-semibold uppercase text-slate-500">Revocation Reason</dt>
              <dd className="text-slate-800 mt-1">
                {cert.revocation_reason || 'No public reason specified.'}
              </dd>
            </div>
          </dl>
        </div>
      )}

      {/* VALID VERIFIED RECORD */}
      {!loading && result?.status === 'VALID' && cert && (
        <div className="space-y-6">
          <div className="bg-white border border-emerald-200 rounded-2xl overflow-hidden">
            {/* Top Status Strip */}
            <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-emerald-800">
                <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                <div>
                  <div className="font-display text-base sm:text-lg font-bold">
                    VERIFIED CERTIFICATE — STATUS: VALID
                  </div>
                  <div className="text-xs text-emerald-700">
                    Authentic TechTalkHub credential verified directly against the certification database
                  </div>
                </div>
              </div>
            </div>

            {/* Verified Student & Certificate Summary */}
            <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-[190px_1fr] gap-8">
              <div className="space-y-3">
                <div className="w-40 aspect-[5/6] rounded-xl border border-slate-200 bg-white p-1 overflow-hidden flex items-center justify-center shadow-xs">
                  {cert.student_photo_url ? (
                    <img
                      src={cert.student_photo_url}
                      alt={`${cert.student_name} verified portrait`}
                      className="w-full h-full object-cover object-top rounded-lg block"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 p-4 text-center bg-slate-100 w-full h-full rounded-lg">
                      <User className="w-10 h-10 mb-1" />
                      <span className="text-xs font-medium">No Portrait Uploaded</span>
                    </div>
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  Issued by <span className="font-semibold text-slate-800">TechTalkHub</span>
                </div>
              </div>

              <div className="space-y-6">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-blue-700">
                    {cert.student_headline || 'Certified TechTalkHub Learner'}
                  </div>
                  <h2 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 mt-1">
                    {cert.student_name}
                  </h2>
                </div>

                <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 text-sm pt-4 border-t border-slate-100">
                  <div>
                    <dt className="text-xs text-slate-500">Certificate ID</dt>
                    <dd className="font-mono font-bold text-slate-900 mt-0.5">
                      {cert.certificate_id}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Course</dt>
                    <dd className="font-semibold text-slate-900 mt-0.5">{cert.course_title}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Level</dt>
                    <dd className="font-semibold text-slate-900 mt-0.5">{cert.level}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Certificate Type</dt>
                    <dd className="font-semibold text-slate-900 mt-0.5">
                      {cert.certificate_type}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Assessment Score</dt>
                    <dd className="font-semibold text-slate-900 mt-0.5 tabular-nums">
                      {cert.score}%
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Course Duration</dt>
                    <dd className="font-semibold text-slate-900 mt-0.5 tabular-nums">
                      {cert.duration_hours} Learning Hours
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Date Issued</dt>
                    <dd className="font-semibold text-slate-900 mt-0.5">
                      {new Date(cert.issue_date).toLocaleDateString('en-GB', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">Verification</dt>
                    <dd className="font-semibold text-emerald-700 mt-0.5 inline-flex items-center gap-1">
                      <ShieldCheck className="w-4 h-4" />
                      Authentic TechTalkHub Certificate
                    </dd>
                  </div>
                </dl>

                {/* Verified Skills */}
                {cert.verified_skills.length > 0 && (
                  <div className="pt-4 border-t border-slate-100 space-y-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Verified Skills
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm text-slate-800">
                      {cert.verified_skills.map((sk, idx) => (
                        <span key={sk.skill_name} className="inline-flex items-center gap-1.5">
                          <span className="font-medium">{sk.skill_name}</span>
                          {idx < cert.verified_skills.length - 1 && (
                            <span className="text-slate-300" aria-hidden="true">·</span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center gap-3">
                  {cert.public_profile_enabled && (
                    <Link
                      to={`/profile/${encodeURIComponent(cert.student_username)}`}
                      className="px-4 py-2.5 text-sm font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      View Student Profile
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowFullCertificate((v) => !v)}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-blue-700 border border-blue-200 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
                  >
                    <Eye className="w-4 h-4" />
                    {showFullCertificate ? 'Hide Certificate Preview' : 'View Certificate'}
                  </button>
                  <a
                    href={`/api/certificates/${encodeURIComponent(cert.certificate_id)}/pdf`}
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download Certificate PDF
                  </a>
                </div>
              </div>
            </div>
          </div>

          {showFullCertificate && (
            <CertificateRenderer
              certificate={{
                ...cert,
                showActions: true,
              } as never}
            />
          )}
        </div>
      )}
    </div>
  );
}
