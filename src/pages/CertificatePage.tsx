import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Search, ShieldAlert } from 'lucide-react';
import { CertificateRenderer, type CertificateDisplayData } from '../components/CertificateRenderer';
import { apiFetch } from '../lib/api';

export function CertificatePage() {
  const { certificateId } = useParams();
  const [cert, setCert] = useState<CertificateDisplayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!certificateId) return;
    setLoading(true);
    setError(null);
    apiFetch<{ status: string; certificate?: CertificateDisplayData; message?: string }>(
      `/api/verify/${encodeURIComponent(certificateId)}`
    )
      .then((res) => {
        if (res.certificate) {
          setCert(res.certificate);
          document.title = `${res.certificate.student_name} — ${res.certificate.certificate_id} | TechTalkHub`;
        } else {
          setError(res.message || 'Certificate record could not be found.');
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Certificate record could not be found.');
      })
      .finally(() => setLoading(false));
  }, [certificateId]);

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <Link
          to="/courses"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Catalog
        </Link>
        <Link
          to="/verify"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-700 hover:underline"
        >
          <Search className="w-4 h-4" />
          Verify Another Certificate
        </Link>
      </div>

      {loading ? (
        <div className="h-96 bg-white border border-slate-200 rounded-2xl animate-pulse" />
      ) : cert ? (
        <CertificateRenderer certificate={cert} />
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-700 mx-auto flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Certificate Not Found
          </h1>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            {error || 'No credential matching this identifier exists in the TechTalkHub registry.'}
          </p>
          <Link
            to="/verify"
            className="inline-block px-4 py-2 bg-blue-700 text-white text-sm font-semibold rounded-lg"
          >
            Go to Verification Lookup
          </Link>
        </div>
      )}
    </div>
  );
}
