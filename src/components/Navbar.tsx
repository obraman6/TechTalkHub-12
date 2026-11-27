import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export function TechTalkHubLogoMark({ className = 'w-9 h-9' }: { className?: string }) {
  return (
    <img
      src="/assets/techtalkhub-mark.png"
      alt="TechTalkHub"
      referrerPolicy="no-referrer"
      className={`object-contain ${className}`}
    />
  );
}

export function TechTalkHubFullLogo({ className = 'h-12 w-auto' }: { className?: string }) {
  return (
    <img
      src="/assets/techtalkhub-logo.png"
      alt="TechTalkHub — Technology • Skills • Innovation"
      referrerPolicy="no-referrer"
      className={`object-contain ${className}`}
    />
  );
}

export function Navbar() {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const dashboardHref =
    user?.role === 'admin' || user?.role === 'instructor' ? '/admin' : '/student';

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Clean Brand Logo */}
        <Link
          to="/"
          aria-label="TechTalkHub Home"
          className="flex items-center shrink-0 py-1"
        >
          <TechTalkHubFullLogo className="h-11 sm:h-12 w-auto" />
        </Link>

        {/* Zone 2: Concise Single-Line Navigation Links */}
        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
          <Link
            to="/courses"
            className={`whitespace-nowrap shrink-0 hover:text-slate-900 transition-colors ${
              isActive('/courses') ? 'text-blue-700 font-semibold' : ''
            }`}
          >
            Courses
          </Link>
          <Link
            to="/verify"
            className={`whitespace-nowrap shrink-0 hover:text-slate-900 transition-colors ${
              isActive('/verify') ? 'text-blue-700 font-semibold' : ''
            }`}
          >
            Verify Certificate
          </Link>
          {user ? (
            <Link
              to={dashboardHref}
              className={`whitespace-nowrap shrink-0 hover:text-slate-900 transition-colors ${
                isActive('/student') || isActive('/admin') ? 'text-blue-700 font-semibold' : ''
              }`}
            >
              {user.role === 'student' ? 'Student Portal' : 'Console'}
            </Link>
          ) : (
            <Link
              to="/login"
              className={`whitespace-nowrap shrink-0 hover:text-slate-900 transition-colors ${
                isActive('/login') ? 'text-blue-700 font-semibold' : ''
              }`}
            >
              Sign In
            </Link>
          )}
        </nav>

        {/* Zone 3: Single Primary CTA */}
        <div className="hidden md:flex items-center shrink-0">
          {user ? (
            <button
              type="button"
              onClick={() => navigate(dashboardHref)}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Open Dashboard
            </button>
          ) : (
            <Link
              to="/register"
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 hover:bg-blue-800 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Create Account
            </Link>
          )}
        </div>

        {/* Mobile Hamburger */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
          className="md:hidden p-2 rounded-lg text-slate-700 hover:bg-slate-100"
        >
          {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 py-4 space-y-3">
          <Link
            to="/courses"
            onClick={() => setMobileOpen(false)}
            className="block py-2 text-sm font-medium text-slate-700"
          >
            Courses
          </Link>
          <Link
            to="/verify"
            onClick={() => setMobileOpen(false)}
            className="block py-2 text-sm font-medium text-slate-700"
          >
            Verify Certificate
          </Link>
          {user ? (
            <Link
              to={dashboardHref}
              onClick={() => setMobileOpen(false)}
              className="block w-full text-center py-2.5 px-4 text-sm font-semibold text-white bg-blue-700 rounded-lg"
            >
              Open Dashboard
            </Link>
          ) : (
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Link
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="text-center py-2.5 px-4 text-sm font-semibold text-slate-800 border border-slate-300 rounded-lg"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                onClick={() => setMobileOpen(false)}
                className="text-center py-2.5 px-4 text-sm font-semibold text-white bg-blue-700 rounded-lg"
              >
                Create Account
              </Link>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
