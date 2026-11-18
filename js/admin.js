import {
  doc, collection, onSnapshot, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch,
  serverTimestamp, deleteField,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { app, db, configured } from "./firebase.js";
import { ADMIN_UID } from "./firebase-config.js";
import {
  CELL_COUNT, SEASON_YEAR, normalize, cellsOf, canAddWords, daysMap, drawnMap,
  ranking, randomId, escapeHtml,
} from "./bingo.js";
import {
  $, toast, initTabs, startSnow, miniGridHtml, calendarHtml, createDayEditor,
} from "./ui.js";
import { createSongsView, addDefaultSongs } from "./songs.js";

const state = {
  settings: {},
  invite: null,    // { code, open }: geheimer Einladungscode
  players: null,   // geheime Link-Dokumente: { id: code, name, boardId, uid?, pinKey? }
  boards: null,    // öffentliche Felder
  dayDocs: [],
  days: new Map(),
  openGrids: new Set(),
  migrated: false,
};
const unsubscribers = [];
let tabs;

startSnow();

function showError(html) {
  $("error").hidden = false;
  $("error").innerHTML = html;
}

if (!configured) {
  showError("Firebase ist noch nicht eingerichtet. Trage deine Daten in <code>js/firebase-config.js</code> ein (siehe ANLEITUNG.md).");
} else {
  const auth = getAuth(app);

  onAuthStateChanged(auth, (user) => {
    unsubscribers.splice(0).forEach((u) => u());
    $("error").hidden = true;
    if (!user || user.isAnonymous) {
      $("login").hidden = false;
      $("admin").hidden = true;
      return;
    }
    $("login").hidden = true;
    if (user.uid !== ADMIN_UID) {
      showError(`Dieses Konto ist nicht als Spielleiter eingetragen.<br>
        Deine UID lautet: <code>${escapeHtml(user.uid)}</code><br>
        Trage sie in <code>js/firebase-config.js</code> und in <code>firestore.rules</code> ein.
        <p><button type="button" class="btn" id="logout-err">Abmelden</button></p>`);
      $("logout-err").onclick = () => signOut(auth);
      return;
    }
    $("admin").hidden = false;
    tabs ??= initTabs($("tabs"), "bingoAdminTab");
    startAdmin();
  });

  $("login").addEventListener("submit", async (e) => {
    e.preventDefault();
    $("login-msg").textContent = "";
    try {
      await signInWithEmailAndPassword(auth, $("login-email").value.trim(), $("login-pass").value);
    } catch (err) {
      console.error(err);
      $("login-msg").textContent = "Anmeldung fehlgeschlagen. E-Mail oder Passwort falsch?";
    }
  });

  $("logout").addEventListener("click", () => signOut(auth));
}

// ---------- Daten laden ----------

async function startAdmin() {
  const settingsRef = doc(db, "game", "settings");
  const inviteRef = doc(db, "game", "invite");
  try {
    const snap = await getDoc(settingsRef);
    if (!snap.exists()) await setDoc(settingsRef, { locked: false });
    if (!snap.data()?.songsSeeded) await seedSongs(settingsRef);
    const inv = await getDoc(inviteRef);
    if (!inv.exists()) await setDoc(inviteRef, { code: randomId(16), open: true });
  } catch (err) {
    return loadError(err);
  }

  unsubscribers.push(
    onSnapshot(settingsRef, (snap) => {
      state.settings = snap.data() ?? {};
      renderSettings();
      maybeMigrate();
    }, loadError),
    onSnapshot(inviteRef, (snap) => {
      state.invite = snap.data() ?? null;
      renderInvite();
    }, loadError),
    onSnapshot(collection(db, "players"), (snap) => {
      state.players = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderAll();
      maybeMigrate();
    }, loadError),
    onSnapshot(collection(db, "boards"), (snap) => {
      state.boards = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderAll();
    }, loadError),
    onSnapshot(collection(db, "days"), (snap) => {
      state.dayDocs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      state.days = daysMap(state.dayDocs);
      renderAll();
    }, loadError),
    songsView.start(),
  );
}

/** Liederpool einmalig mit den klassischen Weihnachtsliedern füllen. */
async function seedSongs(settingsRef) {
  const batch = writeBatch(db);
  addDefaultSongs(batch);
  batch.set(settingsRef, { songsSeeded: true }, { merge: true });
  await batch.commit();
  toast("🎶 Liederpool mit klassischen Weihnachtsliedern gefüllt.");
}

function loadError(err) {
  console.error(err);
  showError(`Fehler beim Laden: ${escapeHtml(err.message)}<br>
    Sind die neuen Regeln aus <code>firestore.rules</code> in Firebase veröffentlicht?`);
}

/**
 * Einmalige Umstellung vom alten Datenformat:
 *  - Spieler ohne öffentliches Feld bekommen eins (Links bleiben gültig)
 *  - bereits gezogene Dezember-Wörter wandern in den Kalender
 *  - das alte Sperrdatum entfällt
 */
async function maybeMigrate() {
  if (state.migrated || !state.players) return;
  state.migrated = true;
  try {
    const batch = writeBatch(db);
    let changes = 0;

    for (const p of state.players.filter((x) => !x.boardId)) {
      const boardId = randomId();
      batch.set(doc(db, "boards", boardId), { name: p.name ?? "?", cells: cellsOf(p), canAddWords: true });
      batch.update(doc(db, "players", p.id), { boardId, cells: deleteField() });
      changes++;
    }

    if ("lockDate" in state.settings) {
      batch.update(doc(db, "game", "settings"), { lockDate: deleteField() });
      changes++;
    }

    try {
      const draws = await getDocs(collection(db, "draws"));
      const byDay = new Map();
      for (const d of draws.docs) {
        const { word, date } = d.data();
        const m = /^(\d{4})-12-(\d{2})$/.exec(date ?? "");
        const n = m && Number(m[1]) === SEASON_YEAR ? Number(m[2]) : 0;
        if (n < 1 || n > 24 || !word) continue;
        const list = byDay.get(n) ?? [...(state.days.get(n) ?? [])];
        if (!list.some((w) => normalize(w) === normalize(word))) list.push(word);
        byDay.set(n, list);
        batch.delete(d.ref);
        changes++;
      }
      for (const [n, words] of byDay) {
        batch.set(doc(db, "days", String(n)), { words, updatedBy: "Spielleitung", updatedAt: serverTimestamp() });
      }
    } catch (err) {
      console.warn("Alte Ziehungen nicht lesbar (egal):", err);
    }

    if (changes) {
      await batch.commit();
      toast("✨ Daten auf das neue Format umgestellt.");
    }
  } catch (err) {
    console.error(err);
    state.migrated = false;
    toast("Umstellung fehlgeschlagen: " + err.message, 6000);
  }
}

// ---------- Sperre ----------

function renderSettings() {
  const locked = state.settings.locked === true;
  $("lock-toggle").checked = locked;
  $("lock-card").classList.toggle("is-locked", locked);
  $("lock-icon").textContent = locked ? "🔒" : "✏️";
  $("lock-title").textContent = locked ? "Felder gesperrt" : "Felder offen";
  $("lock-sub").textContent = locked
    ? "Niemand kann sein Feld mehr ändern."
    : "Spieler können ihre Felder bearbeiten.";
}

$("lock-toggle").addEventListener("change", (e) => {
  const locked = e.target.checked;
  save(updateDoc(doc(db, "game", "settings"), { locked }), locked ? "🔒 Felder gesperrt." : "✏️ Felder entsperrt.")
    .then((ok) => { if (!ok) renderSettings(); });
});

// ---------- Einladungslink ----------

function inviteLink() {
  const url = new URL("index.html", location.href);
  url.search = new URLSearchParams({ einladung: state.invite.code }).toString();
  return url.toString();
}

function renderInvite() {
  if (!state.invite) return;
  const link = inviteLink();
  $("invite-link").value = link;
  $("invite-open").checked = state.invite.open === true;
  $("invite-wa").href = "https://wa.me/?text=" + encodeURIComponent(
    `🎄 Macht mit beim Weihnachtsbingo! Über diesen Link könnt ihr euch selbst eintragen:\n${link}`);
}

$("invite-copy").addEventListener("click", () => { if (state.invite) copy(inviteLink()); });
$("invite-link").addEventListener("focus", (e) => e.target.select());

$("invite-open").addEventListener("change", (e) => {
  const open = e.target.checked;
  save(updateDoc(doc(db, "game", "invite"), { open }),
    open ? "✅ Neue Spieler können beitreten." : "⛔ Beitritt geschlossen.")
    .then((ok) => { if (!ok) renderInvite(); });
});

$("invite-renew").addEventListener("click", () => {
  if (!confirm("Neuen Einladungslink erzeugen? Der alte Link funktioniert dann nicht mehr. Wer schon mitspielt, bleibt dabei.")) return;
  save(updateDoc(doc(db, "game", "invite"), { code: randomId(16) }), "🔗 Neuer Einladungslink erzeugt.");
});

// ---------- Spieler ----------

function playerLink(code) {
  const url = new URL("index.html", location.href);
  url.search = new URLSearchParams({ spieler: code }).toString();
  return url.toString();
}

function renderAll() {
  renderPlayers();
  renderCalendar();
  dayEditor.refresh();
}

/** Spielerliste – vorhandene Karten werden aktualisiert statt neu gebaut, damit Schalter sanft umspringen. */
function renderPlayers() {
  if (!state.players || !state.boards) return;
  const container = $("players");
  const drawn = drawnMap(state.days);
  const codeOf = new Map(state.players.map((p) => [p.boardId, p.id]));
  const rows = ranking(state.boards, drawn).filter((r) => codeOf.has(r.board.id));

  if (rows.length === 0) {
    container.innerHTML = `<p class="intro-text">Noch niemand beigetreten. Schick den Einladungslink herum!</p>`;
    return;
  }
  container.querySelector(".intro-text")?.remove();

  const keep = new Set();
  rows.forEach((r, idx) => {
    const id = r.board.id;
    keep.add(id);
    let card = container.querySelector(`[data-board="${CSS.escape(id)}"]`);
    if (!card) {
      card = document.createElement("article");
      card.className = "board-card";
      card.dataset.board = id;
      card.style.setProperty("--i", idx);
      card.innerHTML = `
        <header class="ph"></header>
        <p class="meta"></p>
        <label class="perm">
          <span>Darf Tageswörter eintragen</span>
          <span class="switch"><input type="checkbox" data-perm="${escapeHtml(id)}"><span></span></span>
        </label>
        <div class="row wrap-row actions">
          <button type="button" class="btn small" data-copy>🔗 Link kopieren</button>
          <a class="btn small" data-wa target="_blank" rel="noopener">💬 WhatsApp</a>
          <button type="button" class="btn small ghost" data-toggle="${escapeHtml(id)}">Feld ansehen</button>
          <button type="button" class="btn small ghost danger" data-del="${escapeHtml(id)}">Entfernen</button>
        </div>
        <div class="collapse"><div class="collapse-inner"></div></div>`;
    }
    const b = r.board;
    const code = codeOf.get(id);
    const link = playerLink(code);
    card.querySelector(".ph").innerHTML = `
      <span class="rank">${idx + 1}.</span>
      <strong class="name">${escapeHtml(b.name)}</strong>
      ${r.lines.length ? `<span class="badge">BINGO ×${r.lines.length}</span>` : ""}`;
    const hasPin = Boolean(state.players.find((p) => p.boardId === id)?.pinKey);
    card.querySelector(".meta").textContent =
      `${r.hits} Treffer · ${r.filled}/${CELL_COUNT} ausgefüllt${hasPin ? "" : " · noch keine PIN"}`;
    const perm = card.querySelector("[data-perm]");
    if (perm.checked !== canAddWords(b)) perm.checked = canAddWords(b);
    card.querySelector("[data-copy]").dataset.copy = link;
    card.querySelector("[data-wa]").href = "https://wa.me/?text=" + encodeURIComponent(
      `🎄 Hallo ${b.name}! Hier ist dein persönlicher Link zum Weihnachtsbingo:\n${link}`);
    const open = state.openGrids.has(id);
    card.querySelector("[data-toggle]").textContent = open ? "Feld ausblenden" : "Feld ansehen";
    card.querySelector(".collapse").classList.toggle("open", open);
    card.querySelector(".collapse-inner").innerHTML = miniGridHtml(r, drawn);
    container.append(card); // sortiert in Ranglisten-Reihenfolge
  });
  for (const card of container.querySelectorAll("[data-board]")) {
    if (!keep.has(card.dataset.board)) card.remove();
  }
}

$("players").addEventListener("change", (e) => {
  const id = e.target.dataset?.perm;
  if (!id) return;
  const b = state.boards.find((x) => x.id === id);
  const allowed = e.target.checked;
  save(updateDoc(doc(db, "boards", id), { canAddWords: allowed }),
    allowed ? `✅ ${b?.name} darf Wörter eintragen.` : `⛔ ${b?.name} darf keine Wörter mehr eintragen.`)
    .then((ok) => { if (!ok) renderPlayers(); });
});

$("players").addEventListener("click", async (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.copy) {
    await copy(t.dataset.copy);
  } else if (t.dataset.toggle) {
    const id = t.dataset.toggle;
    state.openGrids.has(id) ? state.openGrids.delete(id) : state.openGrids.add(id);
    renderPlayers();
  } else if (t.dataset.del) {
    const b = state.boards.find((x) => x.id === t.dataset.del);
    const p = state.players.find((x) => x.boardId === t.dataset.del);
    if (!b || !p || !confirm(`${b.name} wirklich aus dem Spiel entfernen? Das Feld wird dabei gelöscht.`)) return;
    const card = t.closest(".board-card");
    card.classList.add("leaving");
    const batch = writeBatch(db);
    batch.delete(doc(db, "boards", b.id));
    batch.delete(doc(db, "players", p.id));
    if (p.uid) batch.delete(doc(db, "members", p.uid));
    if (p.pinKey) batch.delete(doc(db, "logins", p.pinKey));
    if (!(await save(batch.commit(), `${b.name} entfernt.`))) card.classList.remove("leaving");
  }
});

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("🔗 Link kopiert.");
  } catch {
    prompt("Link zum Kopieren:", text);
  }
}

// ---------- Kalender ----------

function renderCalendar() {
  if (!state.boards) return;
  $("calendar").innerHTML = calendarHtml(state.days, state.boards, { admin: true });
}

const dayEditor = createDayEditor({
  getBoards: () => state.boards ?? [],
  getDays: () => state.days,
  getMeta: (n) => state.dayDocs.find((d) => d.id === String(n)) ?? null,
  onSave: (n, words) => {
    const ref = doc(db, "days", String(n));
    return save(
      words.length
        ? setDoc(ref, { words, updatedBy: "Spielleitung", updatedAt: serverTimestamp() })
        : deleteDoc(ref),
      `🎁 ${n}. Dezember gespeichert.`,
    );
  },
});

$("calendar").addEventListener("click", (e) => {
  const door = e.target.closest("[data-day]");
  if (door) dayEditor.open(Number(door.dataset.day), { canEdit: true });
});

// ---------- Lieder ----------

const songsView = createSongsView({
  root: $("songs"),
  admin: true,
  getUser: () => ({ name: "Spielleitung", canEdit: true, note: "" }),
});

// ---------- Hilfen ----------

async function save(promise, successText) {
  try {
    await promise;
    toast(successText);
    return true;
  } catch (err) {
    console.error(err);
    toast("Speichern fehlgeschlagen: " + err.message, 6000);
    return false;
  }
}
