import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { TechTalkHubFullLogo } from '../components/Navbar';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';



export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberSession, setRememberSession] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const goAfterLogin = (role: string) => {
    if (redirect && redirect.startsWith('/')) {
      navigate(redirect);
      return;
    }
    navigate(role === 'admin' || role === 'instructor' ? '/admin' : '/student');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const u = await login({ email, password });
      goAfterLogin(u.role);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setBusy(false);
    }
  };



  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="space-y-2 text-center">
          <div className="flex justify-center">
            <TechTalkHubFullLogo className="h-14 sm:h-16 w-auto" />
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Sign In to TechTalkHub
          </h1>
          <p className="text-sm text-slate-600">
            Access your courses, assessments, and verified certificates.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-slate-700">Password</label>
              <Link
                to="/forgot-password"
                className="text-xs font-medium text-blue-700 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={rememberSession}
              onChange={(e) => setRememberSession(e.target.checked)}
              className="accent-blue-700"
            />
            Remember session on this browser
          </label>

          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
          >
            {busy ? 'Please wait...' : 'Sign In'}
          </button>
        </form>



        <p className="text-center text-sm text-slate-600">
          New to TechTalkHub?{' '}
          <Link to="/register" className="font-semibold text-blue-700 hover:underline">
            Create student account
          </Link>
        </p>
      </div>
    </div>
  );
}

function suggestUsernameFromName(name: string): string {
  const parts = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 28);
  return `${parts[0]}${parts[parts.length - 1]}`.slice(0, 28);
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [verificationToken, setVerificationToken] = useState<string | null>(null);
  const [verified, setVerified] = useState(false);

  const handleFullNameChange = (val: string) => {
    setFullName(val);
    if (!usernameTouched) {
      setUsername(suggestUsernameFromName(val));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError('Password and Confirm Password do not match.');
      return;
    }
    if (!termsAccepted) {
      setError('Please accept the Terms and Conditions to continue.');
      return;
    }
    setBusy(true);
    try {
      const res = await register({
        fullName,
        username,
        email,
        password,
        confirmPassword,
        termsAccepted,
        country,
        city,
        phone,
      });
      if (res.verificationToken) {
        setVerificationToken(res.verificationToken);
      } else {
        navigate('/student');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyNow = async () => {
    if (!verificationToken) return;
    setBusy(true);
    try {
      await apiFetch('/api/auth/verify-email', {
        method: 'POST',
        body: JSON.stringify({ token: verificationToken }),
      });
      setVerified(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="space-y-1.5 text-center">
          <div className="flex justify-center">
            <TechTalkHubFullLogo className="h-14 sm:h-16 w-auto" />
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Create Student Account
          </h1>
          <p className="text-sm text-slate-600">
            Enroll in courses, track progress, and earn QR-verified certificates.
          </p>
        </div>

        {verificationToken ? (
          <div className="space-y-4 bg-slate-50 border border-slate-200 rounded-xl p-5">
            <h2 className="font-display text-lg font-bold text-slate-900">
              {verified ? 'Email Verified Successfully' : 'Verify Your Email Address'}
            </h2>
            {!verified ? (
              <>
                <p className="text-sm text-slate-600">
                  Your account has been created. Confirm your email address using the
                  verification token below:
                </p>
                <div className="font-mono text-xs bg-white border border-slate-200 p-2.5 rounded break-all">
                  {verificationToken}
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleVerifyNow}
                    className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg cursor-pointer"
                  >
                    Verify Email Now
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/student')}
                    className="px-4 py-2.5 bg-slate-200 text-slate-800 text-sm font-semibold rounded-lg cursor-pointer"
                  >
                    Continue to Portal
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/student')}
                className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold rounded-lg cursor-pointer"
              >
                Open Student Dashboard
              </button>
            )}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => handleFullNameChange(e.target.value)}
                  placeholder="As it should appear on certificates"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Public Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsernameTouched(true);
                    setUsername(e.target.value);
                  }}
                  placeholder="e.g. rubenbuberwa"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Email Address *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Password *
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Confirm Password *
                </label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter password"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Country</label>
                <input
                  type="text"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="Tanzania"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Dar es Salaam"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Phone</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+255..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
                />
              </div>
            </div>

            <label className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer pt-1">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(e) => setTermsAccepted(e.target.checked)}
                className="accent-blue-700 mt-0.5"
              />
              <span>
                I confirm that my registration details are accurate and agree to the TechTalkHub
                Terms of Service, assessment integrity policy, and certificate verification rules.
              </span>
            </label>

            {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 px-4 bg-blue-700 hover:bg-blue-800 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors cursor-pointer"
            >
              {busy ? 'Creating Account...' : 'Create Student Account'}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-slate-600">
          Already registered?{' '}
          <Link to="/login" className="font-semibold text-blue-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiFetch<{ message: string; resetToken?: string }>(
        '/api/auth/forgot-password',
        {
          method: 'POST',
          body: JSON.stringify({ email }),
        }
      );
      setMessage(res.message);
      if (res.resetToken) setResetToken(res.resetToken);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed.');
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, newPassword }),
      });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed.');
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 space-y-5">
        <h1 className="font-display text-2xl font-bold text-slate-900">Reset Password</h1>
        {done ? (
          <div className="space-y-4">
            <p className="text-sm text-emerald-700 font-medium">
              Your password has been updated.
            </p>
            <Link
              to="/login"
              className="block w-full text-center py-2.5 bg-blue-700 text-white rounded-lg text-sm font-semibold"
            >
              Sign In Now
            </Link>
          </div>
        ) : resetToken ? (
          <form onSubmit={handleReset} className="space-y-4">
            {message && <p className="text-xs text-slate-600">{message}</p>}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reset Token
              </label>
              <input
                type="text"
                required
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono text-xs"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                New Password
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              className="w-full py-2.5 bg-blue-700 text-white rounded-lg text-sm font-semibold cursor-pointer"
            >
              Update Password
            </button>
          </form>
        ) : (
          <form onSubmit={handleRequest} className="space-y-4">
            <p className="text-sm text-slate-600">
              Enter your registered email address to receive a password reset token.
            </p>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm"
            />
            {message && <p className="text-xs text-slate-600">{message}</p>}
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              className="w-full py-2.5 bg-blue-700 text-white rounded-lg text-sm font-semibold cursor-pointer"
            >
              Send Reset Token
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
