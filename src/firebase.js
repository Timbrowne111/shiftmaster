import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

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
