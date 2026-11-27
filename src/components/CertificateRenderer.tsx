import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Share2,
  ShieldAlert,
  ShieldCheck,
  User,
} from 'lucide-react';
import { TechTalkHubFullLogo } from './Navbar';

export interface CertificateDisplayData {
  certificate_id: string;
  certificate_type: string;
  level: string;
  score: number;
  issue_date: string;
  status: string;
  verification_url: string;
  qr_code_data: string;
  template_code?: string;
  student_name: string;
  student_photo_url: string | null;
  course_title: string;
  duration_hours: number;
  instructor_name?: string;
  instructor_title?: string;
  director_name?: string;
  director_title?: string;
  is_demo?: boolean;
}

function splitCertificateHeading(rawTitle: string): [string, string | null] {
  const clean = (rawTitle || 'Certificate of Completion').trim();
  const words = clean.split(/\s+/);
  if (words.length >= 3) {
    const splitAt = Math.ceil(words.length * 0.65);
    return [words.slice(0, splitAt).join(' '), words.slice(splitAt).join(' ')];
  }
  if (words.length === 2) {
    return [words[0], words[1]];
  }
  return [clean, null];
}

function getStampPlacement(certificateId: string): {
  angle: number;
  offsetX: number;
  offsetY: number;
} {
  let hash = 0;
  for (let i = 0; i < certificateId.length; i++) {
    hash = (hash * 31 + certificateId.charCodeAt(i)) >>> 0;
  }
  const angle = -11 + (hash % 7); // -11deg to -5deg realistic hand-stamp tilt
  const offsetX = (hash % 9) - 4; // -4px to +4px
  const offsetY = ((hash >> 3) % 7) - 3; // -3px to +3px
  return { angle, offsetX, offsetY };
}

export function CertificateRenderer({
  certificate,
  showActions = true,
}: {
  certificate: CertificateDisplayData;
  showActions?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [photoLoadError, setPhotoLoadError] = useState(false);

  const isRevoked = certificate.status === 'REVOKED';
  const isoDate = new Date(certificate.issue_date).toISOString().slice(0, 10);

  const fullVerifyUrl =
    certificate.verification_url.startsWith('http')
      ? certificate.verification_url
      : `${window.location.origin}/verify/${certificate.certificate_id}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(fullVerifyUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${certificate.student_name} — ${certificate.course_title} Certificate`,
          text: `Verify ${certificate.student_name}'s TechTalkHub credential (${certificate.certificate_id})`,
          url: fullVerifyUrl,
        });
        return;
      } catch {
        // user cancelled or unavailable
      }
    }
    await handleCopyLink();
  };

  const initials = certificate.student_name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

  const [headingLine1, headingLine2] = splitCertificateHeading(certificate.certificate_type);
  const directorDisplayName = certificate.director_name || 'ENG.Ruben B. Rudovick';
  const stampPlacement = getStampPlacement(certificate.certificate_id || 'TTH');

  return (
    <div className="space-y-4">
      {showActions && (
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white border border-slate-200 rounded-xl p-4 no-print">
          <div className="flex items-center gap-2.5 text-sm">
            {isRevoked ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-red-700">
                <ShieldAlert className="w-4 h-4" />
                REVOKED CREDENTIAL
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                <ShieldCheck className="w-4 h-4" />
                VERIFIED CREDENTIAL
              </span>
            )}
            <span className="text-slate-300" aria-hidden="true">·</span>
            <span className="font-mono text-xs sm:text-sm font-medium text-slate-700">
              {certificate.certificate_id}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href={`/api/certificates/${encodeURIComponent(certificate.certificate_id)}/pdf`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              Download PDF
            </a>
            <button
              type="button"
              onClick={handleCopyLink}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
              {copied ? 'Link Copied' : 'Copy Verification Link'}
            </button>
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              Share
            </button>
            <Link
              to={`/verify/${encodeURIComponent(certificate.certificate_id)}`}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs sm:text-sm font-medium text-blue-700 border border-blue-200 hover:bg-blue-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <ExternalLink className="w-4 h-4" />
              Verification Page
            </Link>
          </div>
        </div>
      )}

      {/* Prestige Navy & Gold Geometric Certificate Canvas */}
      <div className="relative overflow-hidden bg-white border border-slate-300 shadow-md rounded-sm">
        {/* Decorative Geometric Corner Ribbons & Subtle Guilloché Wave Curves */}
        <svg
          viewBox="0 0 1000 707"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none select-none"
          aria-hidden="true"
        >
          {/* Top-left gold wedge & navy ribbon */}
          <polygon points="0,0 185,0 0,34" fill="#E6A800" />
          <polygon points="0,34 150,0 445,0 525,38 0,38" fill="#1D3557" />

          {/* Top-right navy band, gold diagonal sash & corner navy triangle */}
          <polygon points="565,0 815,0 845,38 595,38" fill="#1D3557" />
          <polygon points="785,0 845,0 1000,155 1000,222" fill="#E6A800" />
          <polygon points="845,0 1000,0 1000,155" fill="#1D3557" />

          {/* Bottom-left navy triangle, gold diagonal sash & navy ribbon */}
          <polygon points="0,542 158,707 0,707" fill="#1D3557" />
          <polygon points="0,478 228,707 158,707 0,542" fill="#E6A800" />
          <polygon points="185,672 415,672 465,707 215,707" fill="#1D3557" />

          {/* Bottom-right navy ribbon & gold wedge */}
          <polygon points="480,672 1000,672 1000,707 520,707" fill="#1D3557" />
          <polygon points="815,707 1000,672 1000,707" fill="#E6A800" />

          {/* Left subtle curved wave lines */}
          <g fill="none" stroke="#94A3B8" strokeOpacity="0.45" strokeWidth="1">
            <path d="M 0,92 C 45,105 55,148 92,145 C 120,143 130,115 148,118" />
            <path d="M 0,104 C 44,116 54,158 92,155 C 120,152 130,124 148,127" />
            <path d="M 0,116 C 43,127 53,168 92,165 C 120,161 130,133 148,136" />
            <path d="M 0,128 C 42,138 52,178 92,175 C 120,170 130,142 148,145" />
            <path d="M 0,140 C 41,149 51,188 92,185 C 120,179 130,151 148,154" />
            <path d="M 0,210 C 48,235 65,295 25,342 C 12,356 4,364 0,368" />
            <path d="M 0,224 C 46,248 61,303 22,348 C 10,361 3,368 0,372" />
            <path d="M 0,238 C 44,261 57,311 19,354 C 8,366 2,372 0,376" />
          </g>

          {/* Bottom-right subtle curved wave lines */}
          <g fill="none" stroke="#94A3B8" strokeOpacity="0.45" strokeWidth="1">
            <path d="M 1000,455 C 945,455 935,515 955,562 C 972,602 965,642 930,672" />
            <path d="M 1000,468 C 940,468 928,522 948,568 C 964,606 955,644 920,672" />
            <path d="M 1000,481 C 935,481 921,529 941,574 C 956,610 945,646 910,672" />
            <path d="M 1000,494 C 930,494 914,536 934,580 C 948,614 935,648 900,672" />
            <path d="M 822,672 C 845,615 888,582 932,605 C 962,621 978,645 1000,655" />
            <path d="M 835,672 C 856,620 894,591 936,613 C 965,628 980,650 1000,660" />
            <path d="M 848,672 C 867,625 900,600 940,621 C 968,635 982,655 1000,665" />
          </g>
        </svg>

        {/* Inner Certificate Content */}
        <div className="relative z-10 px-6 sm:px-14 lg:px-16 pt-14 sm:pt-16 pb-14 sm:pb-16">
          {isRevoked && (
            <div className="mb-5 bg-red-50 border border-red-300 rounded-lg px-4 py-2.5 text-center max-w-xl mx-auto">
              <p className="text-xs sm:text-sm font-bold text-red-800 tracking-wide uppercase">
                Certificate Revoked — This credential is no longer valid
              </p>
            </div>
          )}

          {/* Top Classic Serif Title */}
          <div className="text-center mb-6 sm:mb-8">
            <h1 className="font-cert-serif text-3xl sm:text-5xl font-extrabold text-slate-950 leading-[1.06] tracking-tight">
              {headingLine1}
              {headingLine2 && (
                <>
                  <br />
                  {headingLine2}
                </>
              )}
            </h1>
          </div>

          {/* Middle Section: Mandatory Graduate Portrait Photo + Centered Recipient Award Block */}
          <div className="grid grid-cols-1 md:grid-cols-[168px_1fr] gap-6 sm:gap-8 items-center max-w-4xl mx-auto">
            {/* Graduate Portrait Photo */}
            <div className="flex flex-col items-center gap-2 relative z-10">
              <div className="w-36 sm:w-40 aspect-[5/6] rounded-lg p-1 bg-white border-2 border-[#1D3557] ring-2 ring-[#E6A800]/75 shadow-md">
                <div className="w-full h-full rounded-[4px] overflow-hidden bg-slate-50 flex items-center justify-center">
                  {certificate.student_photo_url && !photoLoadError ? (
                    <img
                      src={certificate.student_photo_url}
                      alt={`${certificate.student_name} portrait`}
                      onError={() => setPhotoLoadError(true)}
                      className="w-full h-full object-cover object-top block"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 p-3 text-center bg-slate-50 w-full h-full">
                      {initials ? (
                        <span className="font-display text-2xl font-bold text-slate-600 mb-1">
                          {initials}
                        </span>
                      ) : (
                        <User className="w-8 h-8 mb-1" />
                      )}
                      <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wide">
                        Graduate Photo
                      </span>
                    </div>
                  )}
                </div>
              </div>
              <span
                className={`text-[10px] font-bold uppercase tracking-wider bg-white/90 px-2 py-0.5 rounded ${
                  isRevoked ? 'text-red-700' : 'text-[#1D3557]'
                }`}
              >
                {isRevoked ? 'Revoked' : 'Verified Graduate'}
              </span>
            </div>

            {/* Centered Recipient & Course Details */}
            <div className="text-center space-y-3 sm:space-y-3.5 px-2">
              <p className="text-sm sm:text-base font-medium text-slate-800">
                This certificate is proudly awarded to
              </p>

              <div className="pt-1">
                <h2 className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-slate-950 pb-2 border-b border-slate-500 max-w-md mx-auto text-balance">
                  {certificate.student_name}
                </h2>
              </div>

              <p className="text-xs sm:text-sm italic text-slate-700">
                for completing the course with outstanding performance at TechTalkHub
              </p>

              <h3 className="font-display text-lg sm:text-2xl font-bold text-slate-950 pt-0.5 text-balance">
                {certificate.course_title}
              </h3>

              <div className="pt-2 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-slate-700">
                <div>
                  <span className="uppercase tracking-wider text-[10px] font-semibold text-slate-500 block">
                    Level
                  </span>
                  <span className="font-semibold text-slate-900">{certificate.level}</span>
                </div>
                <span className="hidden sm:inline text-slate-300">|</span>
                <div>
                  <span className="uppercase tracking-wider text-[10px] font-semibold text-slate-500 block">
                    Assessment Score
                  </span>
                  <span className="font-semibold text-slate-900 tabular-nums">
                    {certificate.score}%
                  </span>
                </div>
                <span className="hidden sm:inline text-slate-300">|</span>
                <div>
                  <span className="uppercase tracking-wider text-[10px] font-semibold text-slate-500 block">
                    Completed Date
                  </span>
                  <span className="font-mono font-semibold text-slate-900 tabular-nums">
                    {isoDate}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom 3-Column Bar: Serial & QR | Official Center TechTalkHub Logo | Academic Director Signature */}
          <div className="mt-10 pt-4 grid grid-cols-1 md:grid-cols-3 gap-8 items-end max-w-4xl mx-auto">
            {/* Left: QR Code + Serial Number & Issued On */}
            <div className="flex items-center justify-center md:justify-start gap-3.5">
              {certificate.qr_code_data && (
                <div className="flex flex-col items-center shrink-0">
                  <div className="p-1 bg-white border border-slate-300 rounded">
                    <img
                      src={certificate.qr_code_data}
                      alt={`QR code for ${certificate.certificate_id}`}
                      className="w-16 h-16 block"
                    />
                  </div>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-slate-600 mt-1">
                    Scan to Verify
                  </span>
                </div>
              )}
              <div className="text-left space-y-2">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
                    Serial Number
                  </div>
                  <div className="font-mono text-xs font-bold text-slate-900 tabular-nums">
                    {certificate.certificate_id}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-700">
                    Issued On:
                  </div>
                  <div className="font-mono text-xs font-medium text-slate-800 tabular-nums">
                    {isoDate}
                  </div>
                </div>
              </div>
            </div>

            {/* Center: Official TechTalkHub Logo */}
            <div className="flex flex-col items-center justify-center">
              <TechTalkHubFullLogo className="h-20 sm:h-24 w-auto" />
            </div>

            {/* Right: Signature + Hand-Stamped Ink Seal + ENG.Ruben B. Rudovick / Academic Director */}
            <div className="relative flex flex-col items-center text-center pt-4">
              <img
                src="/assets/techtalkhub-stamp.png"
                alt="TechTalkHub Authorized Certification Official Stamp"
                referrerPolicy="no-referrer"
                style={{
                  transform: `rotate(${stampPlacement.angle}deg) translate(${stampPlacement.offsetX}px, ${stampPlacement.offsetY}px)`,
                }}
                className="pointer-events-none select-none absolute -top-5 -left-2 sm:-left-4 w-28 sm:w-32 h-auto opacity-[0.86] mix-blend-multiply z-20"
              />
              <div className="relative z-10 font-signature text-2xl sm:text-3xl font-bold text-slate-900 leading-none pb-1 px-4">
                {directorDisplayName}
              </div>
              <div className="relative z-10 w-52 border-t border-slate-700 pt-1.5">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-900">
                  {directorDisplayName}
                </div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 mt-0.5">
                  {certificate.director_title || 'Academic Director, TechTalkHub'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
