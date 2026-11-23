import {
  doc, collection, onSnapshot, getDoc, setDoc, updateDoc, deleteDoc, writeBatch, serverTimestamp,
  arrayUnion, arrayRemove,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut,
  EmailAuthProvider, reauthenticateWithCredential, updatePassword,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { app, db, configured } from "./firebase.js";
import {
  CELL_COUNT, MIN_PASSWORD_LENGTH, MAX_GAME_NAME_LENGTH, SEASON_YEAR, normalize, cleanWord, cleanName,
  isValidName, accountEmail, cellsOf, canAddWords, daysMap, drawnMap, scoreBoard, ranking, isDayOpen,
  escapeHtml, emptyCells, randomId, swapCells, nameKey, loginKey, newSecret, gameIdFrom, songsEnabled,
} from "./bingo.js";
import {
  $, toast, initTabs, startSnow, confetti, openOverlay, closeOverlay, miniGridHtml, calendarHtml,
  createDayEditor, storageGet, storageSet, storageRemove, reducedMotion, initPasswordToggles,
  resetPasswords, enableCellDrag,
} from "./ui.js";
import { createSongsView, seedDefaultSongs } from "./songs.js";
import { createSettingsView } from "./settings.js";

// Datenmodell (siehe firestore.rules):
//   users/{uid}                { name, games: [gameId], secret, loginKey }  Konto, eigene Spiele, Firebase-Passwort
//   names/{nameKey}            { uid }                         Benutzername vergeben (alte Konten mit echter E-Mail)
//   logins/{loginKey}          { uid, email, secret }          Benutzername + Passwort → Firebase-Anmeldedaten
//   games/{g}                  { name, owner, ownerName, locked, songsEnabled, songsSeeded, createdAt }
//   games/{g}/boards/{uid}     { name, cells[25], canAddWords } Bingo-Feld, Dokument-ID = Konto
//   games/{g}/members/{uid}    { invite, joinedAt }            Nachweis der Einladung (privat)
//   games/{g}/recovery/{uid}   { email, secret }               Anmeldedaten für die Spielleitung (Zurücksetzen)
//   games/{g}/resets/{token}   { uid, name, email, secret, createdAt }  Link zum Zurücksetzen (?spiel=…&passwort=…)
//   games/{g}/days/{1..24}, songs/{id}, songDays/{1..24}, private/invite
//
// Das eigentliche Firebase-Passwort ist ein Zufallsgeheimnis (secret). Das Passwort, das der Spieler
// eintippt, schaltet es nur frei (logins/). So kann die Spielleitung ohne Server ein Passwort zurücksetzen:
// Sie gibt das Geheimnis per Link weiter, der Spieler legt damit ein neues Passwort fest, und das Geheimnis
// wird dabei ausgetauscht (der Link ist danach wertlos).

const auth = configured ? getAuth(app) : null;
/** Adresse beim Öffnen der Seite (Einladungslink: ?spiel=…&einladung=…). */
const startParams = new URLSearchParams(location.search);

const state = {
  user: null,            // angemeldetes Konto (null = nicht angemeldet, schaut als Gast zu)
  profile: null,         // users/{uid}: { name, games, secret, loginKey }
  gameInfo: new Map(),   // gameId → { name, owner, ownerName } oder null (gibt es nicht mehr)
  gameId: null,          // gerade geöffnetes Spiel
  game: null,            // games/{gameId}
  boards: null,          // alle Felder des Spiels
  dayDocs: null,         // Rohdaten der Tage
  days: new Map(),       // Tag → Wörter
  editIndex: null,
  prevMask: null,
  firstRender: true,
  settingsStarted: false,
  songsOn: false,        // Lieder-Abo des geöffneten Spiels läuft
  boardsFromCache: true, // Felder bisher nur aus dem Zwischenspeicher (noch nicht vom Server bestätigt)
  pendingTab: null,      // Reiter, der beim nächsten Öffnen eines Spiels gezeigt wird
  invite: null,          // { gameId, code } aus dem Einladungslink
  reset: null,           // { gameId, token, uid, name, email, secret } aus dem Link zum Zurücksetzen
};
/** Abos des geöffneten Spiels – beim Wechseln alle abbestellen. */
let gameUnsubs = [];
/** Lieder-Abo (eigenes, weil die Spielleitung die Lieder jederzeit aus- und einschalten kann). */
let songsUnsub = null;
/** Spiel aus dem Link (Einladungs- oder Zuschauer-Link) bzw. aus dem Gast-Formular. */
let linkGame = startParams.get("spiel");
/** Spiele, die schon wieder in die eigene Liste eingetragen wurden. */
const relisted = new Set();
let tabs;

/** Spiele, in denen die Anmeldedaten für die Spielleitung schon hinterlegt wurden. */
const recoverySynced = new Set();
/** Hinweis „Passwort einmal bestätigen“ (alte Konten) nur einmal pro Seitenaufruf. */
let confirmAsked = false;

if (startParams.get("spiel") && startParams.get("einladung")) {
  state.invite = { gameId: startParams.get("spiel"), code: startParams.get("einladung") };
}

const SCREENS = ["loading", "error", "auth", "home", "invite", "reset", "game"];
function showScreen(name) {
  for (const id of SCREENS) $(id).hidden = id !== name;
}

function showError(text) {
  showScreen("error");
  $("error").textContent = text;
}

function onLoadError(err) {
  console.error(err);
  showError("Die Daten konnten nicht geladen werden. Bitte prüfe die Internetverbindung und lade die Seite neu.");
}

/** Adresszeile anpassen, ohne die Seite neu zu laden. */
function setUrl(params) {
  const url = new URL(location.href);
  url.search = new URLSearchParams(params).toString();
  url.hash = "";
  history.replaceState(null, "", url.toString());
}

const greet = (text) => { $("greeting").textContent = text; };
const userName = () => state.profile?.name ?? "";
const myGames = () => state.profile?.games ?? [];
const gameInfoOf = (g) => ({ name: String(g?.name ?? "Weihnachtsbingo"), owner: g?.owner ?? "", ownerName: String(g?.ownerName ?? "") });

// ---------- Start ----------

startSnow();
initPasswordToggles();

// Lieder-Reiter (gehört immer zum gerade geöffneten Spiel)
const songsView = createSongsView({
  root: $("songs"),
  getUser: () => {
    const none = { name: "", uid: "", canEdit: false, isOwner: false };
    if (!state.user) return { ...none, note: "👀 Als Gast kannst du die Lieder nur ansehen." };
    if (!me()) return { ...none, note: "👀 Du schaust bei diesem Spiel nur zu." };
    return { name: userName(), uid: state.user.uid, canEdit: true, isOwner: isOwner(), note: "" };
  },
  onChange: () => { renderCalendar(); dayEditor.refresh(); },
});

// Reiter der Spielleitung
const settingsView = createSettingsView({
  root: $("settings"),
  getCtx: () => ({
    gameId: state.gameId, game: state.game, boards: state.boards, days: state.days, uid: state.user?.uid,
  }),
  onDeleted: () => { closeGame(); showHome(); },
  onSongsOn: () => { if (state.game && !state.game.songsSeeded) seedSongs(state.gameId); },
});

if (!configured) {
  showError("Das Spiel ist noch nicht eingerichtet (Firebase-Daten fehlen in js/firebase-config.js).");
} else {
  boot().catch(onLoadError);
}

async function boot() {
  await (typeof auth.authStateReady === "function"
    ? auth.authStateReady()
    : new Promise((resolve) => { const off = onAuthStateChanged(auth, () => { off(); resolve(); }); }));
  // Link der Spielleitung zum Zurücksetzen des Passworts
  if (linkGame && startParams.get("passwort")) return showReset(linkGame, startParams.get("passwort"));
  const user = auth.currentUser;
  if (user && !user.isAnonymous) return signedIn(user);
  // Anonyme Anmeldung aus der alten Version aufräumen
  if (user?.isAnonymous) await signOut(auth).catch(() => {});

  if (startParams.get("einladung") && !startParams.get("spiel")) {
    toast("Dieser Einladungslink gehört zur alten Version. Bitte frag nach dem neuen Link.", 7000);
  }
  // Gast: Zuschauer-Link, oder schon einmal als Gast zugeschaut
  const guestGame = storageGet("bingoGast");
  if (linkGame && (startParams.get("zuschauen") || guestGame === linkGame)) return watchAsGuest(linkGame);
  if (!linkGame && guestGame) return watchAsGuest(guestGame);
  showAuth();
}

/** Ohne Konto zuschauen. */
function watchAsGuest(gameId) {
  linkGame = gameId;
  storageSet("bingoGast", gameId);
  openGame(gameId);
}

/**
 * Nach dem Anmelden: Konto-Dokument laden (bei einem neuen Konto anlegen) und weiter zum Spiel,
 * zur Einladung oder zur Liste der eigenen Spiele.
 * @param created  nur direkt nach „Konto erstellen“: { name, secret, key }
 */
async function signedIn(user, created = null) {
  state.user = user;
  showScreen("loading");
  const ref = doc(db, "users", user.uid);
  let snap = await getDoc(ref);
  if (!snap.exists()) {
    if (!created) {
      await signOut(auth);
      state.user = null;
      showAuth("Bitte melde dich noch einmal an.");
      return;
    }
    // Konto und Anmeldedaten in einem Rutsch
    const batch = writeBatch(db);
    batch.set(ref, { name: created.name, games: [], secret: created.secret, loginKey: created.key });
    batch.set(doc(db, "logins", created.key), { uid: user.uid, email: user.email, secret: created.secret });
    await batch.commit();
    snap = await getDoc(ref);
  }
  state.profile = profileOf(snap.data());
  storageRemove("bingoGast");

  onSnapshot(ref, (s) => {
    if (!s.exists()) return;
    state.profile = profileOf(s.data());
    loadGameInfos().then(() => {
      renderSwitcher();
      if (!$("home").hidden) renderHome();
    });
  }, (err) => console.error("Konto:", err));

  await loadGameInfos();
  syncRecovery();
  // Alte Konten: Firebase-Passwort ist noch das eingetippte – einmal bestätigen lassen
  if (!hasSecret() && !confirmAsked) {
    confirmAsked = true;
    setTimeout(() => openPasswordDialog("confirm"), 900);
  }

  const g = linkGame;
  if (state.invite && !myGames().includes(state.invite.gameId)) return showInvite();
  if (g) return openGame(g);
  const last = storageGet("bingoSpiel");
  if (last && myGames().includes(last)) return openGame(last);
  showHome();
}

function profileOf(data) {
  return {
    name: String(data?.name ?? ""),
    games: Array.isArray(data?.games) ? data.games.map(String) : [],
    secret: typeof data?.secret === "string" ? data.secret : "",
    loginKey: typeof data?.loginKey === "string" ? data.loginKey : "",
  };
}

/** Konto nutzt schon ein Zufallsgeheimnis als Firebase-Passwort (sonst: altes Konto). */
const hasSecret = () => Boolean(state.profile?.secret && state.profile?.loginKey);

/**
 * Anmeldedaten für die Spielleitung hinterlegen (games/{g}/recovery/{uid}), damit sie einen Link
 * zum Zurücksetzen erzeugen kann. Nur in Spielen, die man nicht selbst leitet.
 */
async function syncRecovery(force = false) {
  const user = auth.currentUser;
  const secret = state.profile?.secret;
  if (!user || !secret) return;
  if (force) recoverySynced.clear();
  const ids = myGames().filter((id) => !recoverySynced.has(id) && state.gameInfo.get(id)?.owner !== user.uid);
  await Promise.all(ids.map(async (id) => {
    try {
      await setDoc(doc(db, "games", id, "recovery", user.uid), { email: user.email, secret });
      recoverySynced.add(id);
    } catch (err) {
      console.warn("Anmeldedaten für die Spielleitung nicht hinterlegt:", id, err);
    }
  }));
}

/**
 * Neues Zufallsgeheimnis als Firebase-Passwort setzen und unter dem Schlüssel aus Name + Passwort
 * ablegen. Erst speichern, dann das Firebase-Passwort ändern: Scheitert das, gilt das alte noch.
 * Braucht eine frische Anmeldung.
 */
async function setSecret(user, name, password, oldKey = "") {
  const secret = newSecret();
  const key = await loginKey(name, password);
  const batch = writeBatch(db);
  if (oldKey && oldKey !== key) batch.delete(doc(db, "logins", oldKey));
  batch.set(doc(db, "logins", key), { uid: user.uid, email: user.email, secret });
  batch.update(doc(db, "users", user.uid), { secret, loginKey: key });
  await batch.commit();
  await updatePassword(user, secret);
  if (state.profile && state.user?.uid === user.uid) Object.assign(state.profile, { secret, loginKey: key });
  return secret;
}

/** Namen der eigenen Spiele holen. Gelöschte Spiele fliegen aus der eigenen Liste. */
async function loadGameInfos() {
  const missing = myGames().filter((id) => !state.gameInfo.has(id));
  await Promise.all(missing.map(async (id) => {
    try {
      const s = await getDoc(doc(db, "games", id));
      state.gameInfo.set(id, s.exists() ? gameInfoOf(s.data()) : null);
    } catch (err) {
      console.error(err);
    }
  }));
  const gone = myGames().filter((id) => state.gameInfo.get(id) === null);
  if (gone.length) forgetGames(gone);
}

function forgetGames(ids) {
  if (!state.user || !ids.length) return;
  updateDoc(doc(db, "users", state.user.uid), { games: arrayRemove(...ids) })
    .catch((err) => console.warn("Liste der Spiele nicht aktualisiert:", err));
}

// ---------- Anmelden / Konto erstellen ----------

let authMode = "login";

function setAuthMode(mode) {
  authMode = mode;
  for (const b of $("auth-mode").querySelectorAll("[data-mode]")) {
    const on = b.dataset.mode === mode;
    b.classList.toggle("active", on);
    b.setAttribute("aria-checked", String(on));
  }
  $("auth-mode").style.setProperty("--idx", mode === "register" ? 1 : 0);
  for (const el of $("auth").querySelectorAll("[data-only]")) el.hidden = el.dataset.only !== mode;
  $("auth-btn").textContent = mode === "register" ? "Konto erstellen" : "Anmelden";
  $("auth-pass").autocomplete = mode === "register" ? "new-password" : "current-password";
  $("auth-msg").textContent = "";
  $("forgot-box").hidden = true;
}

async function showAuth(message = "") {
  greet("Schön, dass du da bist ✨");
  setAuthMode(state.invite ? "register" : authMode);
  $("auth-msg").textContent = message;
  showScreen("auth");
  const g = linkGame;
  $("guest-form").hidden = true;
  $("auth-invite").hidden = true;
  if (g) {
    try {
      const s = await getDoc(doc(db, "games", g));
      if (s.exists()) {
        $("auth-invite").textContent = state.invite
          ? `🎄 Du wurdest zu „${s.data().name}“ eingeladen. Erstelle ein Konto oder melde dich an, um mitzuspielen.`
          : `🎄 Spiel „${s.data().name}“: Melde dich an, um mitzuspielen.`;
        $("auth-invite").hidden = false;
      }
    } catch (err) {
      console.warn(err);
    }
  }
}

$("auth-mode").addEventListener("click", (e) => {
  const b = e.target.closest("[data-mode]");
  if (b && b.dataset.mode !== authMode) setAuthMode(b.dataset.mode);
});

$("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const msg = $("auth-msg");
  const register = authMode === "register";
  const name = cleanName($("auth-name").value);
  const password = $("auth-pass").value;
  if (!isValidName(name)) {
    msg.textContent = "Der Benutzername braucht 2 bis 30 Zeichen.";
    return;
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    msg.textContent = `Das Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`;
    return;
  }
  msg.textContent = "";
  $("auth-btn").disabled = true;
  try {
    if (register) {
      // Namen alter Konten mit echter E-Mail-Adresse sind in names/ reserviert
      if ((await getDoc(doc(db, "names", await nameKey(name)))).exists()) {
        throw Object.assign(new Error("name taken"), { code: "auth/email-already-in-use" });
      }
      const secret = newSecret();
      const key = await loginKey(name, password);
      const user = (await createUserWithEmailAndPassword(auth, await accountEmail(name), secret)).user;
      resetPasswords($("auth"));
      await signedIn(user, { name, secret, key });
    } else {
      const { user, legacy } = await signInWithName(name, password);
      if (legacy) {
        // Altes Konto: auf ein Zufallsgeheimnis umstellen (klappt das nicht, bleibt es beim alten Passwort)
        try {
          await setSecret(user, name, password);
        } catch (err) {
          console.warn("Konto nicht umgestellt:", err);
        }
      }
      resetPasswords($("auth"));
      await signedIn(user);
    }
    toast(register ? `Willkommen, ${userName()}! 🎉` : `Willkommen zurück, ${userName()}! 🎄`, 4000);
  } catch (err) {
    console.error(err);
    msg.textContent = authErrorText(err);
    if (!$("auth").hidden) return;
    showScreen("auth");
  } finally {
    $("auth-btn").disabled = false;
  }
});

/**
 * Anmelden mit Benutzername + Passwort. Normalfall: logins/{Schlüssel} liefert das Geheimnis, das das
 * eigentliche Firebase-Passwort ist. Alte Konten (noch ohne Geheimnis) melden sich direkt mit dem
 * eingetippten Passwort an – an der erfundenen Adresse oder einer früher hinterlegten E-Mail-Adresse.
 * @returns {Promise<{ user, legacy: boolean }>}
 */
async function signInWithName(name, password) {
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

const WRONG_LOGIN = ["auth/invalid-credential", "auth/invalid-login-credentials", "auth/user-not-found", "auth/wrong-password"];

function authErrorText(err) {
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

$("auth-guest").addEventListener("click", () => {
  if (linkGame) return watchAsGuest(linkGame);
  // Ohne Link in der Adresse: Link einfügen lassen
  const form = $("guest-form");
  form.hidden = !form.hidden;
  $("guest-msg").textContent = "";
  if (!form.hidden) $("guest-link").focus();
});

$("guest-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = gameIdFrom($("guest-link").value);
  const msg = $("guest-msg");
  if (!id) {
    msg.textContent = "Das ist kein Link zu einem Spiel. Kopiere den ganzen Link, den du bekommen hast.";
    return;
  }
  try {
    if (!(await getDoc(doc(db, "games", id))).exists()) {
      msg.textContent = "Dieses Spiel gibt es nicht (mehr).";
      return;
    }
  } catch (err) {
    console.error(err);
    msg.textContent = "Keine Verbindung. Bitte nochmal versuchen.";
    return;
  }
  $("guest-link").value = "";
  watchAsGuest(id);
});

// Passwort vergessen: Hinweis auf die Spielleitung
$("forgot-open").addEventListener("click", () => {
  $("forgot-box").hidden = !$("forgot-box").hidden;
});

// ---------- Neues Passwort über den Link der Spielleitung ----------

async function showReset(gameId, token) {
  showScreen("loading");
  greet("Neues Passwort 🔑");
  let snap;
  try {
    snap = await getDoc(doc(db, "games", gameId, "resets", token));
  } catch (err) {
    return onLoadError(err);
  }
  if (!snap.exists()) {
    linkGame = null;
    setUrl({});
    const user = auth.currentUser;
    if (user && !user.isAnonymous) {
      toast("🔑 Dieser Link zum Zurücksetzen ist ungültig oder wurde schon benutzt.", 6000);
      return signedIn(user);
    }
    return showAuth("🔑 Dieser Link zum Zurücksetzen ist ungültig oder wurde schon benutzt. Frag bei der Spielleitung nach einem neuen.");
  }
  const d = snap.data();
  state.reset = {
    gameId, token, uid: String(d.uid), name: String(d.name ?? ""), email: String(d.email), secret: String(d.secret),
  };
  const current = auth.currentUser;
  $("reset-for").textContent = `Für das Konto „${state.reset.name}“.`
    + (current && current.uid !== state.reset.uid
      ? " Auf diesem Gerät ist gerade ein anderes Konto angemeldet – es wird dabei abgemeldet."
      : "");
  $("reset-name").value = state.reset.name;
  $("reset-msg").textContent = "";
  resetPasswords($("reset"));
  showScreen("reset");
  $("reset-pass").focus();
}

$("reset-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = state.reset;
  const password = $("reset-pass").value;
  const msg = $("reset-msg");
  if (!r) return;
  if (password.length < MIN_PASSWORD_LENGTH) {
    msg.textContent = `Das Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`;
    return;
  }
  msg.textContent = "";
  $("reset-btn").disabled = true;
  try {
    if (auth.currentUser) await signOut(auth);
    const user = (await signInWithEmailAndPassword(auth, r.email, r.secret)).user;
    const profile = profileOf((await getDoc(doc(db, "users", user.uid))).data());
    // Neues Geheimnis: Der Link und alles, was die Spielleitung bisher kannte, wird damit wertlos
    await setSecret(user, profile.name || r.name, password, profile.loginKey);
    await deleteDoc(doc(db, "games", r.gameId, "resets", r.token)).catch((err) => console.warn(err));
    state.reset = null;
    resetPasswords($("reset"));
    await signedIn(user); // hinterlegt dabei auch das neue Geheimnis für die Spielleitungen
    toast(`🔑 Neues Passwort gespeichert. Willkommen zurück, ${userName()}!`, 5000);
  } catch (err) {
    console.error(err);
    msg.textContent = WRONG_LOGIN.includes(err.code)
      ? "Dieser Link ist nicht mehr gültig. Frag bei der Spielleitung nach einem neuen."
      : authErrorText(err);
  } finally {
    $("reset-btn").disabled = false;
  }
});

// ---------- Meine Spiele ----------

function showHome() {
  closeGame();
  setUrl({});
  greet(`Hallo ${userName()}! ✨`);
  renderHome();
  showScreen("home");
}

function renderHome() {
  const games = myGames()
    .map((id) => ({ id, info: state.gameInfo.get(id) }))
    .filter((g) => g.info)
    .sort((a, b) => a.info.name.localeCompare(b.info.name, "de"));
  $("home-games").innerHTML = games.length
    ? games.map(({ id, info }, i) => {
      const mine = info.owner === state.user?.uid;
      return `<button type="button" class="game-card" data-game="${escapeHtml(id)}" style="--i:${i}">
          <span class="game-icon" aria-hidden="true">${mine ? "👑" : "🎄"}</span>
          <span>
            <strong class="name">${escapeHtml(info.name)}</strong>
            <span class="meta">${mine ? "Du leitest das Spiel" : `Spielleitung: ${escapeHtml(info.ownerName || "?")}`}</span>
          </span>
          <span class="game-go" aria-hidden="true">›</span>
        </button>`;
    }).join("")
    : `<p class="intro-text">Du spielst noch bei keinem Spiel mit. Erstelle unten ein eigenes oder öffne einen Einladungslink.</p>`;
}

$("home-games").addEventListener("click", (e) => {
  const b = e.target.closest("[data-game]");
  if (b) openGame(b.dataset.game);
});

$("create-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!state.user) return;
  const name = cleanName($("create-name").value, MAX_GAME_NAME_LENGTH) || `Weihnachtsbingo ${SEASON_YEAR}`;
  const uid = state.user.uid;
  const gameId = randomId(20);
  const withSongs = $("create-songs").checked;
  $("create-btn").disabled = true;
  try {
    // Spiel, Einladung, eigenes Feld und Eintrag in der eigenen Liste in einem Rutsch
    const batch = writeBatch(db);
    batch.set(doc(db, "games", gameId), {
      name, owner: uid, ownerName: userName(), locked: false, songsEnabled: withSongs, songsSeeded: false,
      createdAt: serverTimestamp(),
    });
    batch.set(doc(db, "games", gameId, "private", "invite"), { code: randomId(16), open: true });
    batch.set(doc(db, "games", gameId, "boards", uid), { name: userName(), cells: emptyCells(), canAddWords: true });
    batch.update(doc(db, "users", uid), { games: arrayUnion(gameId) });
    await batch.commit();
  } catch (err) {
    console.error(err);
    toast("Das Spiel konnte nicht erstellt werden. Bitte nochmal versuchen.", 5000);
    return;
  } finally {
    $("create-btn").disabled = false;
  }
  $("create-name").value = "";
  state.gameInfo.set(gameId, { name, owner: uid, ownerName: userName() });
  if (withSongs) await seedSongs(gameId);
  toast(`🎉 „${name}“ ist erstellt! Schick jetzt den Einladungslink herum.`, 5000);
  state.pendingTab = "settings";
  openGame(gameId);
});

/** Liederpool eines eigenen Spiels mit klassischen Liedern füllen. */
async function seedSongs(gameId) {
  try {
    await seedDefaultSongs(gameId, state.user.uid);
  } catch (err) {
    console.error("Liederpool:", err);
    toast("Der Liederpool konnte nicht gefüllt werden.", 5000);
  }
}

// ---------- Einladung annehmen ----------

async function showInvite() {
  const { gameId } = state.invite;
  showScreen("loading");
  try {
    const [g, b] = await Promise.all([
      getDoc(doc(db, "games", gameId)),
      getDoc(doc(db, "games", gameId, "boards", state.user.uid)),
    ]);
    if (!g.exists()) {
      state.invite = null;
      toast("Dieses Spiel gibt es nicht mehr.", 5000);
      return showHome();
    }
    if (b.exists()) return openGame(gameId); // schon dabei
    const info = gameInfoOf(g.data());
    greet(`Hallo ${userName()}! ✨`);
    $("invite-game").textContent = `„${info.name}“`;
    $("invite-owner").textContent = info.ownerName ? `Spielleitung: ${info.ownerName}` : "";
    $("invite-msg").textContent = "";
    setUrl({ spiel: gameId, einladung: state.invite.code });
    showScreen("invite");
  } catch (err) {
    onLoadError(err);
  }
}

$("invite-join").addEventListener("click", async () => {
  if (!state.invite || !state.user) return;
  const { gameId, code } = state.invite;
  const uid = state.user.uid;
  $("invite-join").disabled = true;
  try {
    // Feld, Einladungsnachweis und Eintrag in der eigenen Liste in einem Rutsch
    const batch = writeBatch(db);
    batch.set(doc(db, "games", gameId, "boards", uid), { name: userName(), cells: emptyCells(), canAddWords: true });
    batch.set(doc(db, "games", gameId, "members", uid), { invite: code, joinedAt: serverTimestamp() });
    batch.update(doc(db, "users", uid), { games: arrayUnion(gameId) });
    // Anmeldedaten für die Spielleitung (damit sie ein vergessenes Passwort zurücksetzen kann)
    const secret = state.profile?.secret;
    if (secret) batch.set(doc(db, "games", gameId, "recovery", uid), { email: state.user.email, secret });
    await batch.commit();
    if (secret) recoverySynced.add(gameId);
  } catch (err) {
    console.error(err);
    $("invite-msg").textContent = "Beitreten hat nicht geklappt. Vielleicht ist der Einladungslink nicht mehr gültig oder der Beitritt geschlossen – frag bitte bei der Spielleitung nach.";
    return;
  } finally {
    $("invite-join").disabled = false;
  }
  state.invite = null;
  toast(`Willkommen im Spiel, ${userName()}! 🎉`, 4000);
  state.pendingTab = "mine";
  openGame(gameId);
});

$("invite-watch").addEventListener("click", () => {
  if (state.invite) openGame(state.invite.gameId);
});

// ---------- Spiel öffnen und wechseln ----------

function openGame(gameId) {
  closeGame();
  state.gameId = gameId;
  if (state.user) storageSet("bingoSpiel", gameId);
  setUrl(state.invite?.gameId === gameId ? { spiel: gameId, einladung: state.invite.code } : { spiel: gameId });
  showScreen("loading");

  const g = (...path) => [db, "games", gameId, ...path];
  gameUnsubs.push(
    onSnapshot(doc(...g()), (s) => {
      if (!s.exists()) {
        // Nur dem Server glauben – der Zwischenspeicher kennt ein Spiel vielleicht noch nicht
        if (!s.metadata.fromCache) gameGone();
        return;
      }
      state.game = s.data();
      state.gameInfo.set(gameId, gameInfoOf(state.game));
      renderSwitcher();
      render();
    }, onLoadError),
    onSnapshot(collection(...g("boards")), (s) => {
      state.boards = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      state.boardsFromCache = s.metadata.fromCache;
      render();
    }, onLoadError),
    onSnapshot(collection(...g("days")), (s) => {
      state.dayDocs = s.docs.map((d) => ({ id: d.id, ...d.data() }));
      state.days = daysMap(state.dayDocs);
      render();
    }, onLoadError),
  );
}

/** Lieder-Abo passend zur Einstellung des Spiels starten oder beenden. */
function syncSongs() {
  const on = songsEnabled(state.game);
  if (on && !state.songsOn) {
    state.songsOn = true;
    songsUnsub = songsView.start(state.gameId);
  } else if (!on && state.songsOn) {
    stopSongs();
  }
}

function stopSongs() {
  songsUnsub?.();
  songsUnsub = null;
  state.songsOn = false;
}

/** Abos des bisherigen Spiels beenden und alles zurücksetzen. */
function closeGame() {
  gameUnsubs.splice(0).forEach((off) => off());
  stopSongs();
  dayEditor.close();
  if (state.editIndex !== null) closeEditor();
  Object.assign(state, {
    gameId: null, game: null, boards: null, dayDocs: null, days: new Map(),
    prevMask: null, firstRender: true, settingsStarted: false, boardsFromCache: true,
  });
  $("grid").innerHTML = ""; // beim nächsten Spiel neu aufbauen (mit Intro-Animation)
}

/** Das geöffnete Spiel wurde gelöscht. */
function gameGone() {
  const name = state.gameInfo.get(state.gameId)?.name ?? "Das Spiel";
  const wasOwner = isOwner();
  const id = state.gameId;
  state.gameInfo.set(id, null);
  closeGame();
  if (!wasOwner) toast(`„${name}“ gibt es nicht mehr.`, 5000);
  if (!state.user) {
    storageRemove("bingoGast");
    linkGame = null;
    setUrl({});
    return showAuth("Dieses Spiel gibt es nicht (mehr).");
  }
  forgetGames([id]);
  showHome();
}

function renderSwitcher() {
  const select = $("game-switch");
  if (!state.user) return;
  const ids = [...myGames()];
  if (state.gameId && !ids.includes(state.gameId)) ids.push(state.gameId); // nur zuschauen
  const options = ids
    .map((id) => ({ id, info: state.gameInfo.get(id) }))
    .filter((o) => o.info)
    .sort((a, b) => a.info.name.localeCompare(b.info.name, "de"));
  select.innerHTML = options.map(({ id, info }) =>
    `<option value="${escapeHtml(id)}">${info.owner === state.user.uid ? "👑 " : "🎄 "}${escapeHtml(info.name)}${myGames().includes(id) ? "" : " (zuschauen)"}</option>`,
  ).join("") + `<option value="">➕ Meine Spiele / neues Spiel …</option>`;
  select.value = state.gameId ?? "";
}

$("game-switch").addEventListener("change", (e) => {
  const id = e.target.value;
  if (!id) return showHome();
  if (id !== state.gameId) openGame(id);
});

// ---------- Konto: Passwort, Abmelden, Spiel verlassen ----------

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-action]");
  if (!b) return;
  if (b.dataset.action === "home") {
    state.invite = null;
    showHome();
  } else if (b.dataset.action === "password") {
    openPasswordDialog();
  } else if (b.dataset.action === "logout") {
    logout();
  }
});

async function logout() {
  if (!confirm("Auf diesem Gerät abmelden? Deine Spiele bleiben erhalten. Wieder anmelden kannst du dich mit Benutzername und Passwort.")) return;
  closeGame();
  storageRemove("bingoSpiel");
  storageRemove("bingoGast");
  await signOut(auth).catch((err) => console.warn(err));
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  location.replace(url.toString());
}

/** Passwort-Dialog. mode = "change" (ändern) oder "confirm" (altes Konto einmal bestätigen). */
let pwMode = "change";

function openPasswordDialog(mode = "change") {
  if (!auth.currentUser) return;
  pwMode = mode;
  const confirmMode = mode === "confirm";
  $("pw-title").textContent = confirmMode ? "🔑 Passwort bestätigen" : "Passwort ändern";
  $("pw-intro").hidden = !confirmMode;
  $("pw-old-label").textContent = confirmMode ? "Dein Passwort" : "Bisheriges Passwort";
  $("pw-new-box").hidden = confirmMode;
  $("pw-cancel").textContent = confirmMode ? "Später" : "Abbrechen";
  $("pw-save").textContent = confirmMode ? "Bestätigen" : "Speichern";
  resetPasswords($("pw-dialog"));
  $("pw-msg").textContent = "";
  openOverlay($("pw-dialog"));
  $("pw-old").focus();
}

function closePasswordDialog() {
  closeOverlay($("pw-dialog"));
}

$("pw-cancel").addEventListener("click", closePasswordDialog);
$("pw-dialog").addEventListener("click", (e) => { if (e.target === $("pw-dialog")) closePasswordDialog(); });

$("pw-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const confirmMode = pwMode === "confirm";
  const oldPw = $("pw-old").value;
  const newPw = confirmMode ? oldPw : $("pw-new").value;
  const msg = $("pw-msg");
  if (!oldPw) {
    msg.textContent = confirmMode ? "Bitte dein Passwort eingeben." : "Bitte dein bisheriges Passwort eingeben.";
    return;
  }
  if (!confirmMode && newPw.length < MIN_PASSWORD_LENGTH) {
    msg.textContent = `Das neue Passwort braucht mindestens ${MIN_PASSWORD_LENGTH} Zeichen.`;
    return;
  }
  const user = auth.currentUser;
  if (!user || !state.profile) return;
  $("pw-save").disabled = true;
  msg.textContent = "";
  try {
    if (hasSecret()) {
      // Das Firebase-Passwort (Geheimnis) bleibt; nur der Schlüssel aus Name + Passwort wechselt
      if ((await loginKey(userName(), oldPw)) !== state.profile.loginKey) {
        throw Object.assign(new Error("wrong password"), { code: "auth/wrong-password" });
      }
      if (!confirmMode) await changeLoginKey(user, newPw);
    } else {
      // Altes Konto: Passwort bei Firebase prüfen und auf ein Zufallsgeheimnis umstellen
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, oldPw));
      await setSecret(user, userName(), newPw, state.profile.loginKey);
      await syncRecovery(true);
    }
    closePasswordDialog();
    toast(confirmMode ? "✅ Danke! Jetzt kann dir die Spielleitung bei Bedarf ein neues Passwort ermöglichen." : "🔑 Neues Passwort gespeichert.", 5000);
  } catch (err) {
    console.error(err);
    msg.textContent = WRONG_LOGIN.includes(err.code)
      ? (confirmMode ? "Das Passwort stimmt nicht." : "Das bisherige Passwort stimmt nicht.")
      : authErrorText(err);
  } finally {
    $("pw-save").disabled = false;
  }
});

/** Neues Passwort: Anmeldedaten unter dem neuen Schlüssel ablegen, den alten Eintrag löschen. */
async function changeLoginKey(user, password) {
  const key = await loginKey(userName(), password);
  if (key === state.profile.loginKey) return;
  const batch = writeBatch(db);
  batch.delete(doc(db, "logins", state.profile.loginKey));
  batch.set(doc(db, "logins", key), { uid: user.uid, email: user.email, secret: state.profile.secret });
  batch.update(doc(db, "users", user.uid), { loginKey: key });
  await batch.commit();
  state.profile.loginKey = key;
}

$("leave").addEventListener("click", async () => {
  const board = me();
  if (!board || isOwner()) return;
  const name = state.game?.name ?? "";
  if (!confirm(`„${name}“ wirklich verlassen? Dein Feld wird dabei gelöscht. Zurück kommst du nur mit einem Einladungslink.`)) return;
  const gameId = state.gameId;
  const uid = state.user.uid;
  closeGame(); // vorher, sonst hält die Seite das Verlassen für ein Entfernen
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, "games", gameId, "boards", uid));
    batch.delete(doc(db, "games", gameId, "members", uid));
    batch.delete(doc(db, "games", gameId, "recovery", uid));
    batch.update(doc(db, "users", uid), { games: arrayRemove(gameId) });
    await batch.commit();
    toast(`🚪 Du hast „${name}“ verlassen.`, 4000);
  } catch (err) {
    console.error(err);
    toast("Verlassen hat nicht geklappt. Bitte nochmal versuchen.", 5000);
  }
  storageRemove("bingoSpiel");
  showHome();
});

// ---------- Anzeige ----------

const me = () => (state.user && state.boards?.find((b) => b.id === state.user.uid)) || null;
const isOwner = () => Boolean(state.user && state.game?.owner === state.user.uid);
const locked = () => state.game?.locked === true;

function render() {
  if (!state.game || !state.boards || !state.dayDocs) return;
  const board = me();
  const listed = myGames().includes(state.gameId);

  if (state.user && !board && listed && !isOwner() && !state.boardsFromCache) {
    // Aus dem Spiel entfernt (oder zurückgesetzt)
    const name = state.game.name;
    const id = state.gameId;
    closeGame();
    forgetGames([id]);
    toast(`Du bist bei „${name}“ nicht mehr dabei. Die Spielleitung hat dich entfernt.`, 6000);
    return showHome();
  }
  if (state.user && board && !listed && !relisted.has(state.gameId)) {
    // Feld vorhanden, aber nicht in der eigenen Liste (z. B. halb fehlgeschlagener Beitritt): nachtragen
    relisted.add(state.gameId);
    updateDoc(doc(db, "users", state.user.uid), { games: arrayUnion(state.gameId) }).catch(console.error);
  }
  syncSongs();
  if (isOwner() && !state.settingsStarted) {
    state.settingsStarted = true;
    gameUnsubs.push(settingsView.start(state.gameId));
    if (songsEnabled(state.game) && !state.game.songsSeeded) seedSongs(state.gameId);
  }

  // Sichtbare Reiter: Gäste haben kein Feld, nur die Spielleitung hat „Spiel“
  const mineTab = $("tabs").querySelector('[data-tab="mine"]');
  const settingsTab = $("tabs").querySelector('[data-tab="settings"]');
  const songsTab = $("tabs").querySelector('[data-tab="songs"]');
  const songsVisible = songsEnabled(state.game);
  const tabsChanged = mineTab.hidden !== !board || settingsTab.hidden !== !isOwner() || songsTab.hidden !== !songsVisible;
  mineTab.hidden = !board;
  settingsTab.hidden = !isOwner();
  songsTab.hidden = !songsVisible;

  showScreen("game");
  if (!tabs) tabs = initTabs($("tabs"), "bingoTab");
  if (state.pendingTab) {
    tabs.show(state.pendingTab, false);
    state.pendingTab = null;
  } else if (tabsChanged || state.firstRender) {
    tabs.refresh();
  }

  $("game-bar").hidden = !state.user;
  renderGuestBar(board);
  greet(board ? `Hallo ${board.name}! ✨` : state.user ? `Hallo ${userName()}! ✨` : "Hallo! Schön, dass du zuschaust ✨");

  if (board) renderMine(board);
  renderAll();
  renderCalendar();
  dayEditor.refresh();
  if (state.songsOn) songsView.refresh();
  if (isOwner()) settingsView.refresh();

  if (locked() && state.editIndex !== null) closeEditor();
  state.firstRender = false;
}

function renderGuestBar(board) {
  const bar = $("guest-bar");
  const action = $("guest-action");
  if (board) {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  if (!state.user) {
    $("guest-text").textContent = "👀 Du schaust als Gast zu. ";
    action.textContent = "Anmelden oder mitspielen";
    action.hidden = false;
  } else {
    $("guest-text").textContent = "👀 Du schaust bei diesem Spiel nur zu. ";
    action.textContent = "Mitspielen";
    action.hidden = state.invite?.gameId !== state.gameId;
  }
}

$("guest-action").addEventListener("click", () => {
  if (!state.user) {
    storageRemove("bingoGast");
    closeGame();
    setAuthMode("login");
    showAuth();
  } else if (state.invite?.gameId === state.gameId) {
    closeGame();
    showInvite();
  }
});

function buildGrid() {
  const grid = $("grid");
  grid.innerHTML = Array.from({ length: CELL_COUNT }, (_, i) =>
    `<button type="button" class="cell" data-i="${i}" style="--i:${i}"><span class="cell-word"></span><span class="cell-day"></span></button>`,
  ).join("");
  if (reducedMotion()) return;
  grid.classList.add("intro");
  setTimeout(() => grid.classList.remove("intro"), 1400);
}

$("grid").addEventListener("animationend", (e) => {
  if (e.animationName === "hit-pop") e.target.classList.remove("pop");
  if (e.animationName === "swap-in") e.target.classList.remove("swapped");
});

function renderMine(board) {
  const drawn = drawnMap(state.days);
  const score = scoreBoard(board, drawn);
  const isLocked = locked();
  const canEdit = !isLocked;
  const onLine = new Set(score.lines.flat());

  // Bingo-Hinweis + Konfetti, wenn eine neue Reihe dazukommt
  const banner = $("bingo");
  const n = score.lines.length;
  banner.hidden = n === 0;
  banner.textContent = n === 1 ? "🎉 BINGO! Du hast eine volle Reihe!" : `🎉 BINGO! Du hast ${n} volle Reihen!`;
  const key = `bingoLines:${state.gameId}`;
  const seen = Number(storageGet(key) || 0);
  if (n > seen) setTimeout(confetti, state.firstRender ? 600 : 150);
  if (n !== seen) storageSet(key, String(n));

  // Status
  const free = CELL_COUNT - score.filled;
  $("status").innerHTML = isLocked
    ? "🔒 Die Felder sind gesperrt – jetzt heißt es abwarten!"
    : `✏️ Tippe auf ein Feld, um ein Wort einzutragen${free ? ` · <strong>noch ${free} frei</strong>` : " · alles ausgefüllt 👍"}
       <small class="status-sub">↔️ Zum Tauschen ein Feld auf ein anderes ziehen (am Handy kurz gedrückt halten)</small>`;
  $("status").classList.toggle("locked", isLocked);

  // Feld
  const grid = $("grid");
  if (!grid.children.length) buildGrid();
  grid.classList.toggle("locked", !canEdit);
  [...grid.children].forEach((btn, i) => {
    const word = score.cells[i];
    const hit = score.mask[i];
    const wasHit = state.prevMask?.[i] ?? hit;
    btn.classList.toggle("empty", !word.trim());
    btn.classList.toggle("hit", hit);
    btn.classList.toggle("line", onLine.has(i));
    btn.disabled = !canEdit;
    btn.querySelector(".cell-word").textContent = word.trim() ? word : (canEdit ? "+" : "–");
    const day = hit ? drawn.get(normalize(word)) : null;
    btn.querySelector(".cell-day").textContent = day ? `${day}.` : "";
    btn.setAttribute("aria-label", `Feld ${i + 1}: ${word || "leer"}${hit ? `, am ${day}. Dezember gezogen` : ""}`);
    if (hit && !wasHit && !reducedMotion()) {
      btn.classList.remove("pop");
      void btn.offsetWidth;
      btn.classList.add("pop");
    }
  });
  state.prevMask = score.mask;

  $("progress").textContent = `${score.hits} von ${CELL_COUNT} Feldern getroffen`;
  $("progress-fill").style.width = `${(score.hits / CELL_COUNT) * 100}%`;
  $("leave").hidden = isOwner();
}

const MEDALS = ["🥇", "🥈", "🥉"];

/** Wertung der Rangliste: "lines" (Bingos & längste Reihe) oder "hits" (meiste Treffer). */
let rankMode = storageGet("bingoRanking") === "hits" ? "hits" : "lines";

function renderRankMode() {
  for (const b of $("rank-mode").querySelectorAll("[data-mode]")) {
    const on = b.dataset.mode === rankMode;
    b.classList.toggle("active", on);
    b.setAttribute("aria-checked", String(on));
  }
  $("rank-mode").style.setProperty("--idx", rankMode === "hits" ? 1 : 0);
}

$("rank-mode").addEventListener("click", (e) => {
  const b = e.target.closest("[data-mode]");
  if (!b || b.dataset.mode === rankMode) return;
  rankMode = b.dataset.mode;
  storageSet("bingoRanking", rankMode);
  renderAll(true);
});

function renderAll(reorder = false) {
  renderRankMode();
  const drawn = drawnMap(state.days);
  const rows = ranking(state.boards, drawn, rankMode);
  const boards = $("boards");
  const myId = state.user?.uid;
  boards.innerHTML = rows.length ? rows.map((r, idx) => {
    const isMe = r.board.id === myId;
    const scored = rankMode === "hits" ? r.hits > 0 : r.bestLine > 0;
    const medal = scored && r.rank <= 3 ? MEDALS[r.rank - 1] : "";
    const main = rankMode === "hits"
      ? `<strong>${r.hits} Treffer</strong> · ${r.lines.length} Bingo · längste Reihe ${r.bestLine}/5`
      : `<strong>${r.lines.length} Bingo</strong> · längste Reihe ${r.bestLine}/5 · ${r.hits} Treffer`;
    return `<article class="board-card${isMe ? " me" : ""}" style="--i:${idx}">
      <header>
        <span class="rank-num${medal ? ` top r${r.rank}` : ""}" aria-label="Platz ${r.rank}">${r.rank}</span>
        ${medal ? `<span class="medal" aria-hidden="true">${medal}</span>` : ""}
        <strong class="name">${escapeHtml(r.board.name)}</strong>
        ${isMe ? `<span class="tag">Du</span>` : ""}
        ${r.board.id === state.game?.owner ? `<span class="tag soft">👑 Spielleitung</span>` : ""}
        ${r.lines.length ? `<span class="badge">BINGO ×${r.lines.length}</span>` : ""}
      </header>
      <p class="meta">${main} · ${r.filled}/${CELL_COUNT} ausgefüllt</p>
      <div class="progress-bar small"><span style="width:${(r.hits / CELL_COUNT) * 100}%"></span></div>
      ${miniGridHtml(r, drawn)}
    </article>`;
  }).join("") : `<p class="intro-text">Noch spielt niemand mit.</p>`;
  // Nach dem Umschalten der Wertung die Karten in neuer Reihenfolge einblenden
  if (reorder && !reducedMotion()) {
    boards.classList.remove("reorder");
    void boards.offsetWidth;
    boards.classList.add("reorder");
    clearTimeout(boards._reorderTimer);
    boards._reorderTimer = setTimeout(() => boards.classList.remove("reorder"), 1200);
  }
}

function renderCalendar() {
  if (!state.boards || !state.dayDocs) return;
  const board = me();
  $("calendar").innerHTML = calendarHtml(state.days, state.boards, {
    myCells: board ? cellsOf(board) : [], admin: isOwner(), songs: daySongs,
  });
  $("calendar-note").textContent = isOwner()
    ? "Tippe auf einen Tag, um Wörter einzutragen oder zu ändern. Als Spielleitung kannst du auch Türchen bearbeiten, die noch zu sind."
    : board && canAddWords(board)
      ? "Tippe auf ein Türchen, um die Wörter des Tages zu sehen oder einzutragen."
      : "Tippe auf ein Türchen, um die Wörter des Tages zu sehen.";
}

// ---------- Kalender ----------

/** Lieder eines Abends für Kalender und Tagesfenster (null, wenn die Lieder aus sind). */
const daySongs = (n) => (state.songsOn && songsEnabled(state.game) ? songsView.getDay(n) : null);

const dayEditor = createDayEditor({
  getBoards: () => state.boards ?? [],
  getDays: () => state.days,
  getMeta: (n) => state.dayDocs?.find((d) => d.id === String(n)) ?? null,
  getSongs: (n) => daySongs(n),
  onOpenSongs: (n) => { songsView.showDay(n); tabs?.show("songs"); },
  onSave: async (n, words) => {
    const ref = doc(db, "games", state.gameId, "days", String(n));
    try {
      if (!words.length && isOwner()) await deleteDoc(ref);
      else await setDoc(ref, { words, updatedBy: userName(), updatedAt: serverTimestamp() });
      toast(`🎁 ${n}. Dezember gespeichert`);
      return true;
    } catch (err) {
      console.error(err);
      toast(canAddWords(me()) || isOwner()
        ? "Speichern hat nicht geklappt. Bitte nochmal versuchen."
        : "Du darfst gerade keine Tageswörter eintragen.");
      return false;
    }
  },
});

$("calendar").addEventListener("click", (e) => {
  const door = e.target.closest("[data-day]");
  if (!door) return;
  const n = Number(door.dataset.day);
  if (isOwner()) return dayEditor.open(n, { canEdit: true });
  let note = "";
  if (!isDayOpen(n)) note = `🔒 Dieses Türchen öffnet sich am ${n}. Dezember.`;
  else if (!me()) return dayEditor.open(n, { canEdit: false });
  else if (!canAddWords(me())) note = "Du darfst gerade keine Tageswörter eintragen.";
  dayEditor.open(n, { canEdit: !note, note });
});

// ---------- Eingabe ins eigene Feld ----------

const cellDrag = enableCellDrag($("grid"), {
  canDrag: () => Boolean(me()) && !locked() && state.editIndex === null,
  onSwap: swapMyCells,
});

/** Zwei Felder des eigenen Feldes tauschen (Drag & Drop). */
async function swapMyCells(a, b) {
  const board = me();
  if (!board || a === b || locked()) return;
  const cells = swapCells(cellsOf(board), a, b);
  // Getroffene Felder wandern mit – sonst würde die Treffer-Animation fälschlich starten
  if (state.prevMask) state.prevMask = swapCells(state.prevMask, a, b);
  const saving = updateDoc(doc(db, "games", state.gameId, "boards", state.user.uid), { cells });
  if (!reducedMotion()) {
    for (const i of [a, b]) {
      const cell = $("grid").children[i];
      cell?.classList.remove("swapped");
      void cell?.offsetWidth;
      cell?.classList.add("swapped");
    }
  }
  try {
    await saving;
  } catch (err) {
    console.error(err);
    toast(locked() ? "Die Felder sind inzwischen gesperrt." : "Tauschen hat nicht geklappt. Bitte nochmal versuchen.");
  }
}

$("grid").addEventListener("click", (e) => {
  if (cellDrag.wasDrag()) return;
  const btn = e.target.closest(".cell");
  if (!btn || btn.disabled) return;
  openEditor(Number(btn.dataset.i));
});

function openEditor(i) {
  state.editIndex = i;
  const row = Math.floor(i / 5) + 1;
  const col = (i % 5) + 1;
  $("editor-title").textContent = `Reihe ${row}, Spalte ${col}`;
  $("editor-input").value = cellsOf(me())[i];
  $("editor-msg").textContent = "";
  openOverlay($("editor"));
  $("editor-input").focus();
  $("editor-input").select();
}

function closeEditor() {
  state.editIndex = null;
  closeOverlay($("editor"));
}

async function saveCell(value) {
  const i = state.editIndex;
  const board = me();
  if (i === null || !board) return;
  const word = cleanWord(value);
  const cells = cellsOf(board);

  if (word && cells.some((c, j) => j !== i && normalize(c) === normalize(word))) {
    $("editor-msg").textContent = "Dieses Wort steht schon in einem anderen Feld.";
    return;
  }

  cells[i] = word;
  closeEditor();
  try {
    await updateDoc(doc(db, "games", state.gameId, "boards", state.user.uid), { cells });
  } catch (err) {
    console.error(err);
    toast(locked()
      ? "Die Felder sind inzwischen gesperrt."
      : "Speichern hat nicht geklappt. Bitte nochmal versuchen.");
  }
}

$("editor-form").addEventListener("submit", (e) => {
  e.preventDefault();
  saveCell($("editor-input").value);
});
$("editor-clear").addEventListener("click", () => saveCell(""));
$("editor-cancel").addEventListener("click", closeEditor);
$("editor").addEventListener("click", (e) => { if (e.target === $("editor")) closeEditor(); });
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (state.editIndex !== null) closeEditor();
  else if (!$("pw-dialog").hidden) closePasswordDialog();});

// Türchen öffnen sich um Mitternacht
setInterval(renderCalendar, 60_000);
