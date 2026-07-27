import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc, setDoc } from 'firebase/firestore';

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
