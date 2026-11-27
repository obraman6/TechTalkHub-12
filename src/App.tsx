import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Footer } from './components/Footer';
import { Navbar } from './components/Navbar';
import { AuthProvider } from './context/AuthContext';
import { AdminDashboard } from './pages/AdminDashboard';
import { ForgotPasswordPage, LoginPage, RegisterPage } from './pages/AuthPages';
import { CertificatePage } from './pages/CertificatePage';
import { CourseDetailPage } from './pages/CourseDetailPage';
import { CoursePlayerPage } from './pages/CoursePlayerPage';
import { CoursesPage } from './pages/CoursesPage';
import { LandingPage } from './pages/LandingPage';
import { PublicProfilePage } from './pages/PublicProfilePage';
import {
  AboutPage,
  CertificationProcessPage,
  ContactPage,
  NotFoundPage,
} from './pages/StaticTrustPages';
import { StudentDashboard } from './pages/StudentDashboard';
import { VerifyCertificatePage } from './pages/VerifyCertificatePage';

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
        <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
          <Navbar />
          <div className="flex-1">
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/certification" element={<CertificationProcessPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/courses" element={<CoursesPage />} />
              <Route path="/courses/:slug" element={<CourseDetailPage />} />
              <Route path="/learn/:slug" element={<CoursePlayerPage />} />
              <Route path="/certificate/:certificateId" element={<CertificatePage />} />
              <Route path="/verify" element={<VerifyCertificatePage />} />
              <Route path="/verify/:certificateId" element={<VerifyCertificatePage />} />
              <Route path="/profile" element={<StudentDashboard defaultTab="profile" />} />
              <Route path="/profile/:username" element={<PublicProfilePage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/student" element={<StudentDashboard />} />
              <Route path="/admin" element={<AdminDashboard />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </div>
          <Footer />
        </div>
      </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
