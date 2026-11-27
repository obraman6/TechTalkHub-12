import { Link } from 'react-router-dom';
import { TechTalkHubFullLogo } from './Navbar';

export function Footer() {
  return (
    <footer className="bg-slate-950 text-slate-300 border-t border-slate-800 no-print">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 pb-10 border-b border-slate-800">
          <div className="md:col-span-2 space-y-3">
            <div className="inline-flex bg-white rounded-xl px-3.5 py-2">
              <TechTalkHubFullLogo className="h-11 w-auto" />
            </div>
            <p className="text-sm text-slate-400 max-w-md leading-relaxed">
              Practical technology education, structured skills assessments, and
              tamper-evident QR-verified certification trusted by learners and employers.
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Platform
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/courses" className="hover:text-white transition-colors">
                  Browse Courses
                </Link>
              </li>
              <li>
                <Link to="/verify" className="hover:text-white transition-colors">
                  Verify Certificate
                </Link>
              </li>
              <li>
                <Link to="/register" className="hover:text-white transition-colors">
                  Student Registration
                </Link>
              </li>
              <li>
                <Link to="/login" className="hover:text-white transition-colors">
                  Portal Sign In
                </Link>
              </li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Trust & Support
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/about" className="hover:text-white transition-colors">
                  About TechTalkHub
                </Link>
              </li>
              <li>
                <Link to="/certification" className="hover:text-white transition-colors">
                  Certification Process
                </Link>
              </li>
              <li>
                <Link to="/contact" className="hover:text-white transition-colors">
                  Contact & Support
                </Link>
              </li>
              <li className="text-slate-400">QR Verification Registry</li>
            </ul>
          </div>
        </div>

        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-500">
          <p>© {new Date().getFullYear()} TechTalkHub. All rights reserved.</p>
          <p>Official verification authority: /verify/:certificateId</p>
        </div>
      </div>
    </footer>
  );
}
