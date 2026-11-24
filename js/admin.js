// admin.html: Passwort-Links für alle Konten. Nur für Konten, die in admins/{uid} stehen
// (die Regeln lassen recovery/ und resets/ sonst gar nicht zu).
//
//   recovery/{uid}   { name, email, secret }                    hinterlegt jedes Konto beim Anmelden
//   resets/{token}   { uid, name, email, secret, createdAt }    Link index.html?passwort=<token>, einmal gültig

import {
  doc, collection, getDoc, getDocs, query, where, writeBatch, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { db, configured } from "./firebase.js";
import { auth, authReady, signInWithName, setSecret, isAdmin, authErrorText } from "./account.js";
import { cleanName, escapeHtml, normalize, randomId } from "./bingo.js";
import { $, toast, copyText, startSnow, initPasswordToggles, resetPasswords } from "./ui.js";

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

function fail(err) {
  console.error(err);
  showScreen("error");
  $("error").textContent = "Die Daten konnten nicht geladen werden. Bitte prüfe die Internetverbindung und lade die Seite neu.";
}

async function check(user) {
  if (!user || user.isAnonymous) {
    resetPasswords($("auth"));
    showScreen("auth");
    $("auth-name").focus();
    return;
  }
  showScreen("loading");
  if (!(await isAdmin(user))) {
    const s = await getDoc(doc(db, "users", user.uid)).catch(() => null);
    $("denied-name").textContent = String(s?.data()?.name ?? "");
    $("denied-uid").textContent = user.uid;
    showScreen("denied");
    return;
  }
  await loadAccounts();
  showScreen("admin");
}

$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = cleanName($("auth-name").value);
  const password = $("auth-pass").value;
  const msg = $("auth-msg");
  msg.textContent = "";
  $("auth-btn").disabled = true;
  try {
    const { user, legacy } = await signInWithName(name, password);
    // Altes Konto gleich umstellen (wie beim Anmelden auf der Spielseite)
    if (legacy) await setSecret(user, name, password).catch((err) => console.warn("Umstellung:", err));
    await check(user);
  } catch (err) {
    console.error(err);
    msg.textContent = authErrorText(err);
  } finally {
    $("auth-btn").disabled = false;
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
