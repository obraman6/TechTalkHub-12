import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Auxiliary Firestore sync helpers (primary data is stored in the local SQLite database)

function sanitizeFirestoreId(raw: string, fallback = 'record'): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 128);
  return cleaned || fallback;
}

export async function signInWithGooglePopup(): Promise<{
  firebaseUser: FirebaseUser;
  idToken: string;
}> {
  try {
    const credential = await signInWithPopup(auth, googleProvider);
    const idToken = await credential.user.getIdToken();
    return { firebaseUser: credential.user, idToken };
  } catch (err: any) {
    const code = err?.code || '';
    if (code === 'auth/unauthorized-domain') {
      throw new Error(
        'This domain is not authorized in Firebase Authentication. Please authorize this URL in your Firebase Console (Authentication -> Settings -> Authorized domains) or use Email & Password sign-in.'
      );
    }
    if (code === 'auth/popup-closed-by-user') {
      throw new Error('Google sign-in popup was closed before completing.');
    }
    throw new Error(err?.message || 'Google sign-in failed.');
  }
}

export async function signOutFirebase(): Promise<void> {
  if (auth.currentUser) {
    await signOut(auth);
  }
}

export async function syncFirebaseUserAccount(params: {
  role: 'student' | 'instructor' | 'admin';
  displayName: string;
  username?: string;
  country?: string;
  city?: string;
  phone?: string;
}): Promise<void> {
  const current = auth.currentUser;
  if (!current || !current.emailVerified) return;

  const uid = sanitizeFirestoreId(current.uid);
  const email = (current.email || '').slice(0, 200);
  const displayName = (params.displayName || current.displayName || email.split('@')[0] || 'TechTalkHub User')
    .trim()
    .slice(0, 120);
  const safeDisplayName = displayName.length >= 2 ? displayName : `${displayName} User`;
  const username = sanitizeFirestoreId(
    (params.username || safeDisplayName.toLowerCase()).slice(0, 40),
    `user-${uid.slice(0, 8)}`
  );
  const safeUsername = username.length >= 3 ? username.slice(0, 40) : `u-${uid.slice(0, 10)}`;

  if (params.role === 'admin') {
    const adminPath = `admins/${uid}`;
    try {
      const adminRef = doc(db, 'admins', uid);
      const existingAdmin = await getDoc(adminRef);
      if (!existingAdmin.exists()) {
        await setDoc(adminRef, {
          uid,
          email,
          grantedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, adminPath);
    }
  }

  const userPath = `users/${uid}`;
  try {
    const userRef = doc(db, 'users', uid);
    const existing = await getDoc(userRef);
    if (!existing.exists()) {
      await setDoc(userRef, {
        uid,
        displayName: safeDisplayName,
        username: safeUsername,
        role: params.role === 'admin' ? 'admin' : 'student',
        publicProfileEnabled: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(
        userRef,
        {
          displayName: safeDisplayName,
          username: safeUsername,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }

  const privatePath = `users/${uid}/private/info`;
  try {
    await setDoc(
      doc(db, 'users', uid, 'private', 'info'),
      {
        uid,
        email,
        phone: (params.phone || '').slice(0, 40),
        country: (params.country || '').slice(0, 80),
        city: (params.city || '').slice(0, 80),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, privatePath);
  }
}

export async function syncCertificateToFirestore(cert: {
  certificateId: string;
  recipientName: string;
  courseCode: string;
  courseTitle: string;
  level: string;
  certificateType: string;
  score: number;
  status: 'VALID' | 'REVOKED';
  issueDate: string;
  verificationUrl: string;
  directAdminIssue: boolean;
}): Promise<void> {
  const current = auth.currentUser;
  if (!current || !current.emailVerified) return;

  const certId = sanitizeFirestoreId(cert.certificateId);
  const path = `certificates/${certId}`;
  try {
    const ref = doc(db, 'certificates', certId);
    const existing = await getDoc(ref);
    const payload = {
      certificateId: certId.slice(0, 64),
      recipientName: (cert.recipientName || 'TechTalkHub Recipient').trim().slice(0, 140),
      courseCode: (cert.courseCode || 'TTH').trim().slice(0, 40),
      courseTitle: (cert.courseTitle || 'TechTalkHub Course').trim().slice(0, 180),
      level: (cert.level || 'Foundation').trim().slice(0, 60),
      certificateType: (cert.certificateType || 'Certificate of Completion').trim().slice(0, 80),
      score: Math.min(100, Math.max(0, Number(cert.score || 0))),
      status: cert.status === 'REVOKED' ? 'REVOKED' : 'VALID',
      issueDate: (cert.issueDate || new Date().toISOString()).slice(0, 64),
      verificationUrl: (cert.verificationUrl || `/verify/${certId}`).slice(0, 300),
      issuedByUid: sanitizeFirestoreId(current.uid),
      directAdminIssue: Boolean(cert.directAdminIssue),
      createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    await setDoc(ref, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function syncContactToFirestore(msg: {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
}): Promise<void> {
  const docId = sanitizeFirestoreId(`msg-${msg.id}`);
  const path = `contactMessages/${docId}`;
  try {
    await setDoc(doc(db, 'contactMessages', docId), {
      name: msg.name.trim().slice(0, 120),
      email: msg.email.trim().slice(0, 200),
      subject: msg.subject.trim().slice(0, 160),
      message: msg.message.trim().slice(0, 2000),
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}
