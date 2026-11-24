// admin.html: Passwort-Links für alle Spieler-Konten.
//
// Der Admin meldet sich mit einem eigenen Firebase-Konto an (echte E-Mail-Adresse + Passwort, angelegt in der
// Firebase-Konsole), nicht mit einem Spieler-Konto. Damit sich Admin- und Spieler-Anmeldung im selben Browser
// nicht gegenseitig abmelden, läuft die Seite mit einer eigenen Firebase-Instanz ("admin").
// Admin ist nur, wer zusätzlich in admins/{uid} steht (nur in der Konsole anlegbar; die Regeln lassen
// recovery/ und resets/ sonst gar nicht zu).
//
//   recovery/{uid}   { name, email, secret }                    hinterlegt jedes Spieler-Konto beim Anmelden
//   resets/{token}   { uid, name, email, secret, createdAt }    Link index.html?passwort=<token>, einmal gültig

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore, doc, collection, getDoc, getDocs, query, where, writeBatch, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, sendPasswordResetEmail, signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { firebaseConfig } from "./firebase-config.js";
import { configured } from "./firebase.js";
import { escapeHtml, normalize, randomId } from "./bingo.js";
import { $, toast, copyText, startSnow, initPasswordToggles, resetPasswords } from "./ui.js";

const app = configured ? initializeApp(firebaseConfig, "admin") : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
if (auth) auth.languageCode = "de";

const SCREENS = ["loading", "error", "auth", "denied", "admin"];
function showScreen(name) {
  for (const id of SCREENS) $(id).hidden = id !== name;
}

/** Alle Konten mit hinterlegten Anmeldedaten: [{ uid, name, email, secret }] */
let accounts = [];
/** uid → zuletzt erzeugter Link (nur in dieser Sitzung) */
const links = new Map();

startSnow();
initPasswordToggles();

if (!configured) {
  showScreen("error");
  $("error").textContent = "Das Spiel ist noch nicht eingerichtet (Firebase-Daten fehlen in js/firebase-config.js).";
} else {
  authReady().then(() => check(auth.currentUser)).catch(fail);
}

function authReady() {
  return typeof auth.authStateReady === "function"
    ? auth.authStateReady()
    : new Promise((resolve) => { const off = onAuthStateChanged(auth, () => { off(); resolve(); }); });
}

function fail(err) {
  console.error(err);
  showScreen("error");
  $("error").textContent = "Die Daten konnten nicht geladen werden. Bitte prüfe die Internetverbindung und lade die Seite neu.";
}

async function isAdmin(user) {
  try {
    return (await getDoc(doc(db, "admins", user.uid))).exists();
  } catch (err) {
    console.warn("Admin-Prüfung:", err);
    return false;
  }
}

async function check(user) {
  if (!user || user.isAnonymous) {
    resetPasswords($("auth"));
    $("forgot-msg").textContent = "";
    showScreen("auth");
    $("auth-email").focus();
    return;
  }
  showScreen("loading");
  if (!(await isAdmin(user))) {
    $("denied-email").textContent = user.email ?? "";
    $("denied-uid").textContent = user.uid;
    showScreen("denied");
    return;
  }
  await loadAccounts();
  showScreen("admin");
}

function errorText(err) {
  switch (err?.code) {
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "E-Mail-Adresse oder Passwort stimmt nicht.";
    case "auth/invalid-email":
      return "Das ist keine gültige E-Mail-Adresse.";
    case "auth/too-many-requests":
      return "Zu viele Versuche. Bitte warte kurz und versuche es dann nochmal.";
    case "auth/network-request-failed":
      return "Keine Verbindung. Bitte prüfe die Internetverbindung.";
    case "auth/operation-not-allowed":
      return "Anmelden mit E-Mail/Passwort ist in Firebase nicht aktiviert.";
    default:
      return "Das hat leider nicht geklappt. Bitte nochmal versuchen.";
  }
}

$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("auth-email").value.trim();
  const password = $("auth-pass").value;
  const msg = $("auth-msg");
  msg.textContent = "";
  $("auth-btn").disabled = true;
  try {
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    await check(user);
  } catch (err) {
    console.error(err);
    msg.textContent = errorText(err);
  } finally {
    $("auth-btn").disabled = false;
  }
});

// Passwort vergessen: Firebase schickt eine Mail zum Zurücksetzen (nur für das Admin-Konto)
$("forgot-btn").addEventListener("click", async () => {
  const email = $("auth-email").value.trim();
  const msg = $("forgot-msg");
  if (!email) {
    msg.textContent = "Bitte oben zuerst die E-Mail-Adresse eintragen.";
    $("auth-email").focus();
    return;
  }
  $("forgot-btn").disabled = true;
  try {
    await sendPasswordResetEmail(auth, email);
    msg.textContent = `📧 Falls es ein Konto mit ${email} gibt, ist eine Mail zum Zurücksetzen unterwegs (auch im Spam-Ordner nachsehen).`;
  } catch (err) {
    console.error(err);
    msg.textContent = errorText(err);
  } finally {
    $("forgot-btn").disabled = false;
  }
});

$("denied-copy").addEventListener("click", () => copyText($("denied-uid").textContent, "📋 Konto-ID kopiert."));

for (const btn of document.querySelectorAll("[data-logout]")) {
  btn.addEventListener("click", async () => {
    await signOut(auth).catch(() => {});
    links.clear();
    check(null);
  });
}

// ---------- Konten ----------

async function loadAccounts() {
  const snap = await getDocs(collection(db, "recovery"));
  accounts = snap.docs
    .map((d) => ({ uid: d.id, ...d.data() }))
    .filter((a) => typeof a.secret === "string" && typeof a.email === "string")
    .map((a) => ({ ...a, name: String(a.name ?? "") || "(ohne Namen)" }))
    .sort((a, b) => a.name.localeCompare(b.name, "de", { sensitivity: "base" }));
  render();
}

function render() {
  const term = normalize($("search").value);
  const shown = accounts.filter((a) => !term || normalize(a.name).includes(term));
  $("count").textContent = term
    ? `${shown.length} von ${accounts.length} Konten`
    : `${accounts.length} ${accounts.length === 1 ? "Konto" : "Konten"}`;
  $("accounts").innerHTML = shown.length
    ? shown.map((a) => {
      const link = links.get(a.uid);
      return `
        <div class="admin-account">
          <div class="admin-account-head">
            <strong>${escapeHtml(a.name)}</strong>
            <button type="button" class="btn small" data-link="${escapeHtml(a.uid)}">🔑 Link erstellen</button>
          </div>
          ${link ? `
            <div class="admin-link">
              <input type="text" readonly value="${escapeHtml(link)}" aria-label="Link für ${escapeHtml(a.name)}">
              <div class="row">
                <button type="button" class="btn small" data-copy="${escapeHtml(a.uid)}">📋 Kopieren</button>
                <a class="btn small" target="_blank" rel="noopener" href="${escapeHtml(waLink(a.name, link))}">💬 WhatsApp</a>
              </div>
            </div>` : ""}
        </div>`;
    }).join("")
    : `<p class="muted center">${accounts.length ? "Niemand gefunden." : "Noch keine Konten hinterlegt."}</p>`;
}

$("search").addEventListener("input", render);

$("accounts").addEventListener("click", async (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.copy) {
    copyText(links.get(t.dataset.copy));
  } else if (t.dataset.link) {
    const acc = accounts.find((a) => a.uid === t.dataset.link);
    if (!acc) return;
    t.disabled = true;
    try {
      const link = await createLink(acc);
      links.set(acc.uid, link);
      render();
      copyText(link, `🔑 Link für ${acc.name} erstellt und kopiert.`);
    } catch (err) {
      console.error(err);
      toast("Der Link konnte nicht erstellt werden. Bitte nochmal versuchen.");
      t.disabled = false;
    }
  }
});

/** Neuen Link zum Zurücksetzen anlegen; ältere Links desselben Kontos werden gelöscht. */
async function createLink(acc) {
  const token = randomId(32);
  const old = await getDocs(query(collection(db, "resets"), where("uid", "==", acc.uid)));
  const batch = writeBatch(db);
  for (const d of old.docs) batch.delete(d.ref);
  batch.set(doc(db, "resets", token), {
    uid: acc.uid, name: acc.name.slice(0, 30), email: acc.email, secret: acc.secret, createdAt: serverTimestamp(),
  });
  await batch.commit();
  const url = new URL("index.html", location.href);
  url.search = new URLSearchParams({ passwort: token }).toString();
  return url.toString();
}

function waLink(name, link) {
  return "https://wa.me/?text=" + encodeURIComponent(
    `🔑 Hallo ${name}! Über diesen Link kannst du dir ein neues Passwort fürs Weihnachtsbingo geben:\n${link}`,
  );
}
