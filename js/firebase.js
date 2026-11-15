// Firebase connection shared by every page.
const V = '13.1.0'; // Firebase JS SDK version on Google's CDN
const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
const A = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`);
const F = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
import { firebaseConfig } from './firebase-config.js';

export const app = initializeApp(firebaseConfig);
export const auth = A.getAuth(app);
export const db = F.getFirestore(app);
export const fs = F; // doc, getDoc, setDoc, updateDoc, onSnapshot, collection, query, where, arrayUnion, writeBatch, ...

export const configured = !String(firebaseConfig.apiKey).includes('PASTE');

// Resolves with the signed-in user (anonymous if nobody is signed in).
export function signInGuest() {
  return new Promise((resolve, reject) => {
    const stop = A.onAuthStateChanged(auth, async user => {
      if (user) { stop(); resolve(user); return; }
      try { await A.signInAnonymously(auth); } catch (e) { stop(); reject(e); }
    });
  });
}

// Host/admin: Google sign-in so the same account works on any device.
export async function signInHost() {
  const user = await new Promise(r => { const s = A.onAuthStateChanged(auth, u => { s(); r(u); }); });
  if (user && !user.isAnonymous) return user;
  const res = await A.signInWithPopup(auth, new A.GoogleAuthProvider());
  return res.user;
}

export async function isAdmin(uid) {
  try { return (await F.getDoc(F.doc(db, 'admins', uid))).exists(); } catch { return false; }
}

export const gameRef = code => F.doc(db, 'games', code);
export const sub = (code, ...path) => F.doc(db, 'games', code, ...path);
export const subCol = (code, name) => F.collection(db, 'games', code, name);
