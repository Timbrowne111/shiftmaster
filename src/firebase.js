import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, updatePassword, signOut as fbSignOut, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyC1-XG25ESmI97gHYYKwK9Zb4PUvjW5O6A",
  authDomain: "shiftmaster-de483.firebaseapp.com",
  databaseURL: "https://shiftmaster-de483-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "shiftmaster-de483",
  storageBucket: "shiftmaster-de483.firebasestorage.app",
  messagingSenderId: "497684359968",
  appId: "1:497684359968:web:092384543a44de6fdb4545",
  measurementId: "G-K5SL7Y2MR0"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

const secondApp = initializeApp(firebaseConfig, "userCreation");
const secondAuth = getAuth(secondApp);

const googleProvider = new GoogleAuthProvider();

// ── Firestore helpers ──
export async function dbGet(key) {
  try {
    const snap = await getDoc(doc(db, 'shiftmaster', key));
    return snap.exists() ? snap.data().value : null;
  } catch (e) {
    console.error('DB read error:', e);
    return null;
  }
}

export async function dbSet(key, value) {
  try {
    await setDoc(doc(db, 'shiftmaster', key), { value, updatedAt: new Date().toISOString() });
  } catch (e) {
    console.error('DB write error:', e);
  }
}

// ── Auth helpers ──
export async function authLogin(email, password) {
  try {
    const r = await signInWithEmailAndPassword(auth, email, password);
    return { ok: true, uid: r.user.uid, email: r.user.email };
  } catch (e) {
    return { ok: false, code: e.code };
  }
}

export async function authLoginGoogle() {
  try {
    const r = await signInWithPopup(auth, googleProvider);
    return { ok: true, uid: r.user.uid, email: r.user.email.toLowerCase() };
  } catch (e) {
    if (e.code === 'auth/popup-closed-by-user') return { ok: false, code: 'cancelled' };
    return { ok: false, code: e.code, msg: e.message };
  }
}

export async function authCreateUser(email, password) {
  try {
    await createUserWithEmailAndPassword(secondAuth, email, password);
    await fbSignOut(secondAuth);
    return { ok: true };
  } catch (e) {
    if (e.code === 'auth/email-already-in-use') return { ok: true };
    return { ok: false, code: e.code, msg: e.message };
  }
}

export async function authSendReset(email) {
  try {
    await sendPasswordResetEmail(auth, email);
    return { ok: true };
  } catch (e) {
    return { ok: false, code: e.code };
  }
}

export async function authChangePassword(newPassword) {
  try {
    if (auth.currentUser) {
      await updatePassword(auth.currentUser, newPassword);
      return { ok: true };
    }
    return { ok: false, msg: 'Not signed in' };
  } catch (e) {
    return { ok: false, code: e.code, msg: e.message };
  }
}

export async function authLogout() {
  try { await fbSignOut(auth); } catch {}
}
