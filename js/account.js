// Konten: Anmelden mit Benutzername + Passwort, Firebase-Passwort als Zufallsgeheimnis,
// Anmeldedaten für den Admin (Passwort zurücksetzen). Gemeinsam für index.html und admin.html.
//
//   users/{uid}         { name, games, secret, loginKey }   eigenes Konto
//   logins/{loginKey}   { uid, email, secret }               Benutzername + Passwort → Firebase-Anmeldedaten
//   recovery/{uid}      { name, email, secret }              Kopie für den Admin (nur Admin und man selbst)
//   resets/{token}      { uid, name, email, secret, createdAt }   Link zum Zurücksetzen (index.html?passwort=…)
//   admins/{uid}        {}                                   wer Admin ist (nur in der Firebase-Konsole anlegen)
//
// Das eigentliche Firebase-Passwort ist ein Zufallsgeheimnis (secret). Das eingetippte Passwort schaltet es nur
// frei (logins/). So kann der Admin ohne Server ein Passwort zurücksetzen: Er gibt das Geheimnis per Link weiter,
// der Spieler legt damit ein neues Passwort fest, und das Geheimnis wird dabei ausgetauscht (Link wertlos).

import { doc, getDoc, setDoc, writeBatch } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, updatePassword,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { app, db, configured } from "./firebase.js";
import { MIN_PASSWORD_LENGTH, accountEmail, loginKey, newSecret } from "./bingo.js";

export const auth = configured ? getAuth(app) : null;

export const WRONG_LOGIN = ["auth/invalid-credential", "auth/invalid-login-credentials", "auth/user-not-found", "auth/wrong-password"];

/** Wartet, bis Firebase weiß, ob jemand angemeldet ist. */
export function authReady() {
  return typeof auth.authStateReady === "function"
    ? auth.authStateReady()
    : new Promise((resolve) => { const off = onAuthStateChanged(auth, () => { off(); resolve(); }); });
}

/**
 * Anmelden mit Benutzername + Passwort. Normalfall: logins/{Schlüssel} liefert das Geheimnis, das das
 * eigentliche Firebase-Passwort ist. Alte Konten (noch ohne Geheimnis) melden sich direkt mit dem
 * eingetippten Passwort an – an der erfundenen Adresse oder einer früher hinterlegten E-Mail-Adresse.
 * @returns {Promise<{ user, legacy: boolean }>}
 */
export async function signInWithName(name, password) {
  let stored = null;
  try {
    const s = await getDoc(doc(db, "logins", await loginKey(name, password)));
    if (s.exists()) stored = s.data();
  } catch (err) {
    console.warn("Anmeldedaten:", err);
  }
  const synthetic = await accountEmail(name);
  let lastErr;
  if (typeof stored?.secret === "string") {
    try {
      const email = String(stored.email || synthetic);
      return { user: (await signInWithEmailAndPassword(auth, email, stored.secret)).user, legacy: false };
    } catch (err) {
      lastErr = err;
      if (!WRONG_LOGIN.includes(err.code)) throw err;
    }
  }
  // Alte Konten; alte Einträge { email, alt } = früher hinterlegte E-Mail-Adressen
  const candidates = [...new Set([stored?.email, stored?.alt, synthetic].map((x) => String(x ?? "")).filter(Boolean))];
  for (const email of candidates) {
    try {
      return { user: (await signInWithEmailAndPassword(auth, email, password)).user, legacy: true };
    } catch (err) {
      lastErr = err;
      if (!WRONG_LOGIN.includes(err.code)) throw err;
    }
  }
  throw lastErr;
}

/**
 * Neues Zufallsgeheimnis als Firebase-Passwort setzen und unter dem Schlüssel aus Name + Passwort ablegen,
 * dazu die Kopie für den Admin. Erst speichern, dann das Firebase-Passwort ändern: Scheitert das, gilt das
 * alte noch. Braucht eine frische Anmeldung.
 * @returns {Promise<{ secret, key }>}
 */
export async function setSecret(user, name, password, oldKey = "") {
  const secret = newSecret();
  const key = await loginKey(name, password);
  // Für den Admin der Name genau wie im Konto (die Regeln prüfen das), nicht wie eingetippt
  const accountName = String((await getDoc(doc(db, "users", user.uid))).data()?.name ?? name);
  const batch = writeBatch(db);
  if (oldKey && oldKey !== key) batch.delete(doc(db, "logins", oldKey));
  batch.set(doc(db, "logins", key), { uid: user.uid, email: user.email, secret });
  batch.update(doc(db, "users", user.uid), { secret, loginKey: key });
  batch.set(doc(db, "recovery", user.uid), { name: accountName, email: user.email, secret });
  await batch.commit();
  await updatePassword(user, secret);
  return { secret, key };
}

/** Kopie der Anmeldedaten für den Admin hinterlegen (falls sie fehlt oder veraltet ist). */
export async function saveRecovery(user, name, secret) {
  if (!user || !secret) return;
  try {
    await setDoc(doc(db, "recovery", user.uid), { name, email: user.email, secret });
  } catch (err) {
    console.warn("Anmeldedaten für den Admin nicht hinterlegt:", err);
  }
}

/** Ist das angemeldete Konto Admin (Eintrag in admins/)? */
export async function isAdmin(user) {
  if (!user) return false;
  try {
    return (await getDoc(doc(db, "admins", user.uid))).exists();
  } catch (err) {
    console.warn("Admin-Prüfung:", err);
    return false;
  }
}

export function authErrorText(err) {
  switch (err?.code) {
    case "auth/email-already-in-use":
      return "Diesen Benutzernamen gibt es schon. Bist du das? Dann wähle oben „Anmelden“. Sonst nimm bitte einen anderen Namen.";
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Benutzername oder Passwort stimmt nicht. Noch kein Konto? Dann wähle oben „Konto erstellen“.";
    case "auth/weak-password":
      return `Das Passwort ist zu kurz (mindestens ${MIN_PASSWORD_LENGTH} Zeichen).`;
    case "auth/too-many-requests":
      return "Zu viele Versuche. Bitte warte kurz und versuche es dann nochmal.";
    case "auth/requires-recent-login":
      return "Bitte melde dich kurz ab und wieder an und versuche es dann nochmal.";
    case "auth/network-request-failed":
      return "Keine Verbindung. Bitte prüfe die Internetverbindung.";
    case "auth/operation-not-allowed":
      return "Anmelden ist noch nicht eingerichtet (in Firebase „E-Mail/Passwort“ aktivieren).";
    default:
      return "Das hat leider nicht geklappt. Bitte nochmal versuchen.";
  }
}
