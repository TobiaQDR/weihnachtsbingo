// Attrappe für firebase-auth.js im lokalen Testmodus: E-Mail/Passwort-Konten im localStorage.
// Die Anmeldung gilt pro Tab (sessionStorage), damit man in zwei Tabs zwei Spieler sein kann.
import { getStore, commitStore, tick } from "./fake-env.js";

const SESSION_KEY = "bingoLokalAngemeldet";

class FakeUser {
  constructor(uid, email) {
    this.uid = uid;
    this.email = email;
    this.isAnonymous = false;
    this.displayName = null;
  }
  async reload() {}
  async getIdToken() { return "lokal"; }
}

function authError(code) {
  return Object.assign(new Error(`Firebase: Error (${code}).`), { code });
}

// Eine Anmeldung pro Firebase-App (wie im echten SDK): index.html nutzt die Standard-App,
// admin.html eine eigene App "admin". Gespeichert pro Tab im sessionStorage.
const sessionKey = (name) => (name === "[DEFAULT]" ? SESSION_KEY : `${SESSION_KEY}:${name}`);

function restoreUser(name) {
  try {
    const email = sessionStorage.getItem(sessionKey(name));
    const acc = email && getStore().accounts[email];
    return acc ? new FakeUser(acc.uid, email) : null;
  } catch {
    return null;
  }
}

const instances = new Map();

function setCurrent(a, user) {
  a.currentUser = user;
  try {
    if (user) sessionStorage.setItem(sessionKey(a.name), user.email);
    else sessionStorage.removeItem(sessionKey(a.name));
  } catch { /* egal */ }
  for (const fn of [...a.listeners]) fn(user);
}

export function getAuth(app) {
  const name = app?.name ?? "[DEFAULT]";
  if (!instances.has(name)) {
    instances.set(name, {
      app, name, currentUser: restoreUser(name), languageCode: null, listeners: new Set(),
      authStateReady: () => Promise.resolve(),
    });
  }
  return instances.get(name);
}

export function onAuthStateChanged(a, callback) {
  a.listeners.add(callback);
  setTimeout(() => callback(a.currentUser), 0);
  return () => a.listeners.delete(callback);
}

const norm = (email) => String(email ?? "").trim().toLowerCase();

function checkPassword(email, password) {
  const acc = getStore().accounts[norm(email)];
  if (!acc || acc.password !== password) throw authError("auth/invalid-credential");
  return acc;
}

export async function signInWithEmailAndPassword(a, email, password) {
  await tick();
  const acc = checkPassword(email, password);
  const user = new FakeUser(acc.uid, norm(email));
  setCurrent(a, user);
  return { user };
}

export async function createUserWithEmailAndPassword(a, email, password) {
  await tick();
  const e = norm(email);
  if (!/^[^\s@]+@[^\s@]+$/.test(e)) throw authError("auth/invalid-email");
  if (String(password).length < 6) throw authError("auth/weak-password");
  const store = getStore();
  if (store.accounts[e]) throw authError("auth/email-already-in-use");
  const uid = "lokal" + crypto.getRandomValues(new Uint32Array(3)).join("").slice(0, 20);
  commitStore({ ...store, accounts: { ...store.accounts, [e]: { uid, password: String(password) } } });
  const user = new FakeUser(uid, e);
  setCurrent(a, user);
  return { user };
}

export async function signOut(a) {
  await tick();
  setCurrent(a, null);
}

export async function sendPasswordResetEmail(a, email) {
  await tick();
  if (!/^[^\s@]+@[^\s@]+$/.test(norm(email))) throw authError("auth/invalid-email");
  // Im Testmodus wird nichts verschickt
  console.info(`🧪 Testmodus: Mail zum Zurücksetzen an ${norm(email)} würde jetzt verschickt.`);
}

export const EmailAuthProvider = {
  credential: (email, password) => ({ email, password }),
};

export async function reauthenticateWithCredential(user, credential) {
  await tick();
  checkPassword(credential.email, credential.password);
  return { user };
}

export async function updatePassword(user, password) {
  await tick();
  if (String(password).length < 6) throw authError("auth/weak-password");
  const store = getStore();
  const acc = store.accounts[user.email];
  if (!acc) throw authError("auth/user-not-found");
  commitStore({ ...store, accounts: { ...store.accounts, [user.email]: { ...acc, password: String(password) } } });
}
