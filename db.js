// Backend: Firebase Auth (email + password) and Firestore with an offline cache.
// Exposes window.PPBackend for app.js, which knows nothing about Firebase.
import { firebaseConfig } from './firebase-config.js';

const V = '10.12.2';
const base = `https://www.gstatic.com/firebasejs/${V}/`;

async function start() {
  if (!firebaseConfig) {
    window.PPBackend = { missingConfig: true };
    window.dispatchEvent(new Event('pp-backend'));
    return;
  }
  const { initializeApp } = await import(base + 'firebase-app.js');
  const A = await import(base + 'firebase-auth.js');
  const F = await import(base + 'firebase-firestore.js');
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  let fs;
  try {
    fs = F.initializeFirestore(app, {
      ignoreUndefinedProperties: true,
      localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }),
    });
  } catch (e) {
    fs = F.getFirestore(app);
  }
  const db = {
    collection: (c) => ({
      doc: (id) => {
        const ref = id ? F.doc(fs, c, id) : F.doc(F.collection(fs, c));
        return {
          id: ref.id,
          set: (d) => F.setDoc(ref, d),
          update: (d) => F.setDoc(ref, d, { merge: true }),
          delete: () => F.deleteDoc(ref),
        };
      },
      onSnapshot: (next, err) => F.onSnapshot(F.collection(fs, c), { includeMetadataChanges: true }, (snap) => next({
        docs: snap.docs.map((d) => ({ id: d.id, data: () => d.data() })),
        metadata: { hasPendingWrites: snap.metadata.hasPendingWrites, fromCache: snap.metadata.fromCache },
      }), err),
    }),
  };
  window.PPBackend = {
    db,
    onAuth: (cb) => A.onAuthStateChanged(auth, (u) => cb(u ? { email: u.email, uid: u.uid } : null)),
    signIn: (email, pw) => A.signInWithEmailAndPassword(auth, email, pw),
    signOut: () => A.signOut(auth),
    resetPassword: (email) => A.sendPasswordResetEmail(auth, email),
  };
  window.dispatchEvent(new Event('pp-backend'));
}
start().catch((e) => {
  window.PPBackend = { loadError: String(e && e.message || e) };
  window.dispatchEvent(new Event('pp-backend'));
});
