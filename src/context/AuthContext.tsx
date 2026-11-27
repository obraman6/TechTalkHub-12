import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, setAuthToken } from '../lib/api';
import {
  signInWithGooglePopup,
  signOutFirebase,
  syncFirebaseUserAccount,
} from '../lib/firebase';

export interface StudentProfile {
  user_id: number;
  username: string;
  full_name: string;
  phone: string;
  country: string;
  city: string;
  headline: string;
  bio: string;
  photo_path: string | null;
  public_profile_enabled: number | boolean;
  show_contact_publicly: number | boolean;
}

export interface InstructorRecord {
  id: number;
  user_id: number;
  full_name: string;
  title: string;
  specialty: string;
  can_edit_courses: number;
  can_create_lessons: number;
  can_create_assessments: number;
  can_view_reports: number;
}

export interface AuthUser {
  id: number;
  email: string;
  role: 'student' | 'instructor' | 'admin';
  email_verified: boolean;
  is_active: number;
  is_demo: boolean;
  has_local_password?: boolean;
  created_at: string;
  profile: StudentProfile | null;
  instructor: InstructorRecord | null;
}

export interface BootstrapStatus {
  hasDemoData: boolean;
  firebaseEnabled?: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  bootstrapStatus: BootstrapStatus;
  refreshUser: () => Promise<void>;
  refreshBootstrap: () => Promise<void>;
  login: (payload: { email: string; password: string }) => Promise<AuthUser>;
  loginWithGoogle: () => Promise<AuthUser>;
  register: (payload: {
    fullName: string;
    username?: string;
    email: string;
    password: string;
    confirmPassword?: string;
    termsAccepted?: boolean;
    country?: string;
    city?: string;
    phone?: string;
  }) => Promise<{ user: AuthUser; verificationToken?: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus>({
    hasDemoData: false,
  });

  const refreshBootstrap = useCallback(async () => {
    try {
      const status = await apiFetch<BootstrapStatus>('/api/auth/bootstrap-status');
      setBootstrapStatus(status);
    } catch {
      // ignore
    }
  }, []);

  const refreshUser = useCallback(async () => {
    try {
      const res = await apiFetch<{ user: AuthUser }>('/api/auth/me');
      setUser(res.user);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await Promise.all([refreshUser(), refreshBootstrap()]);
      setLoading(false);
    })();
  }, [refreshUser, refreshBootstrap]);

  const login = async (payload: { email: string; password: string }) => {
    const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setAuthToken(res.token);
    setUser(res.user);
    return res.user;
  };

  const loginWithGoogle = async () => {
    const { firebaseUser, idToken } = await signInWithGooglePopup();
    const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/firebase-login', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    });
    setAuthToken(res.token);
    setUser(res.user);
    await refreshBootstrap();

    try {
      await syncFirebaseUserAccount({
        role: res.user.role,
        displayName:
          res.user.profile?.full_name ||
          firebaseUser.displayName ||
          res.user.email.split('@')[0],
        username: res.user.profile?.username,
        country: res.user.profile?.country,
        city: res.user.profile?.city,
        phone: res.user.profile?.phone,
      });
    } catch (syncErr) {
      console.warn('Firestore profile sync skipped:', syncErr);
    }

    return res.user;
  };

  const register = async (payload: {
    fullName: string;
    username?: string;
    email: string;
    password: string;
    confirmPassword?: string;
    termsAccepted?: boolean;
    country?: string;
    city?: string;
    phone?: string;
  }) => {
    const res = await apiFetch<{ token: string; user: AuthUser; verificationToken?: string }>(
      '/api/auth/register',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
    setAuthToken(res.token);
    setUser(res.user);
    return { user: res.user, verificationToken: res.verificationToken };
  };

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    try {
      await signOutFirebase();
    } catch {
      // ignore
    }
    setAuthToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        bootstrapStatus,
        refreshUser,
        refreshBootstrap,
        login,
        loginWithGoogle,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
