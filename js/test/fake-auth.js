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

function restoreUser() {
  try {
    const email = sessionStorage.getItem(SESSION_KEY);
    const acc = email && getStore().accounts[email];
    return acc ? new FakeUser(acc.uid, email) : null;
  } catch {
    return null;
  }
}

const auth = {
  app: null,
  currentUser: restoreUser(),
  languageCode: null,
  listeners: new Set(),
  authStateReady: () => Promise.resolve(),
};

function setCurrent(user) {
  auth.currentUser = user;
  try {
    if (user) sessionStorage.setItem(SESSION_KEY, user.email);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* egal */ }
  for (const fn of [...auth.listeners]) fn(user);
}

export function getAuth() {
  return auth;
}

export function onAuthStateChanged(a, callback) {
  auth.listeners.add(callback);
  setTimeout(() => callback(auth.currentUser), 0);
  return () => auth.listeners.delete(callback);
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
  setCurrent(user);
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
  setCurrent(user);
  return { user };
}

export async function signOut() {
  await tick();
  setCurrent(null);
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
