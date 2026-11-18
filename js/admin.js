import {
  doc, collection, onSnapshot, getDoc, setDoc, updateDoc, addDoc, deleteDoc,
  serverTimestamp, Timestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { app, db, configured } from "./firebase.js";
import { ADMIN_UID } from "./firebase-config.js";
import {
  CELL_COUNT, normalize, emptyCells, cellsOf, drawnSet, hitMask, bingoLines,
  isLocked, lockDateOf, sortDraws, formatDay, formatDateTime, todayIso,
  makePlayerCode, escapeHtml,
} from "./bingo.js";

const $ = (id) => document.getElementById(id);
const state = { settings: {}, draws: [], players: [], openGrids: new Set() };
const unsubscribers = [];

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
    if (!user) {
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
  try {
    const snap = await getDoc(settingsRef);
    if (!snap.exists()) await setDoc(settingsRef, { locked: false, lockDate: null });
  } catch (err) {
    return loadError(err);
  }

  unsubscribers.push(
    onSnapshot(settingsRef, (snap) => {
      state.settings = snap.data() ?? {};
      renderSettings();
      renderPlayers();
    }, loadError),
    onSnapshot(collection(db, "draws"), (snap) => {
      state.draws = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      renderDraws();
      renderPlayers();
    }, loadError),
    onSnapshot(collection(db, "players"), (snap) => {
      state.players = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(a.name).localeCompare(String(b.name), "de"));
      renderDraws();
      renderPlayers();
    }, loadError),
  );

  $("draw-date").value = todayIso();
  const timer = setInterval(renderSettings, 30_000);
  unsubscribers.push(() => clearInterval(timer));
}

function loadError(err) {
  console.error(err);
  showError(`Fehler beim Laden: ${escapeHtml(err.message)}<br>
    Stimmen die UID in <code>firestore.rules</code> und die veröffentlichten Regeln?`);
}

// ---------- Felder sperren ----------

function toLocalInput(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function renderSettings() {
  const s = state.settings;
  const lockDate = lockDateOf(s);
  const locked = isLocked(s);

  let text = locked ? "🔒 Die Felder sind gesperrt." : "✏️ Spieler können ihre Felder noch bearbeiten.";
  if (s.locked) text += " (manuell gesperrt)";
  else if (lockDate) text += ` Automatische Sperre: ${formatDateTime(lockDate)}.`;
  $("lock-status").textContent = text;

  $("lock-toggle").textContent = s.locked ? "Manuelle Sperre aufheben" : "Felder jetzt sperren";
  if (document.activeElement !== $("lock-date")) {
    $("lock-date").value = lockDate ? toLocalInput(lockDate) : "";
  }
}

const settingsRef = () => doc(db, "game", "settings");

$("lock-toggle").addEventListener("click", () => save(
  updateDoc(settingsRef(), { locked: !state.settings.locked }),
  state.settings.locked ? "Manuelle Sperre aufgehoben." : "Felder gesperrt.",
));

$("lock-date-save").addEventListener("click", () => {
  const v = $("lock-date").value;
  if (!v) return toast("Bitte zuerst Datum und Uhrzeit wählen.");
  save(updateDoc(settingsRef(), { lockDate: Timestamp.fromDate(new Date(v)) }), "Sperrdatum gespeichert.");
});

$("lock-date-clear").addEventListener("click", () => save(
  updateDoc(settingsRef(), { lockDate: null }), "Sperrdatum entfernt.",
));

// ---------- Wörter ziehen ----------

function playersWith(word) {
  const n = normalize(word);
  if (!n) return [];
  return state.players.filter((p) => cellsOf(p).some((c) => normalize(c) === n));
}

/** Ähnliche Wörter (enthält / ist enthalten) – hilft bei Tippfehlern und Varianten. */
function similarEntries(word) {
  const n = normalize(word);
  if (n.length < 3) return [];
  const out = [];
  for (const p of state.players) {
    for (const c of cellsOf(p)) {
      const m = normalize(c);
      if (m && m !== n && (m.includes(n) || n.includes(m))) out.push({ name: p.name, word: c });
    }
  }
  return out;
}

function updateDrawHint() {
  const word = $("draw-word").value;
  const hint = $("draw-hint");
  if (!normalize(word)) { hint.innerHTML = ""; return; }

  const parts = [];
  if (drawnSet(state.draws).has(normalize(word))) parts.push("⚠️ Dieses Wort wurde schon gezogen.");
  const exact = playersWith(word);
  parts.push(exact.length
    ? `Steht bei: <strong>${exact.map((p) => escapeHtml(p.name)).join(", ")}</strong>`
    : "Steht bei niemandem genau so im Feld.");
  const similar = similarEntries(word);
  if (similar.length) {
    parts.push("Ähnlich: " + similar.map((s) => `${escapeHtml(s.name)} („${escapeHtml(s.word)}“)`).join(", "));
  }
  hint.innerHTML = parts.join("<br>");
}

$("draw-word").addEventListener("input", updateDrawHint);

$("draw-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const word = $("draw-word").value.replace(/\s+/g, " ").trim();
  const date = $("draw-date").value;
  if (!word || !date) return;
  if (drawnSet(state.draws).has(normalize(word)) && !confirm(`„${word}“ wurde schon gezogen. Trotzdem nochmal hinzufügen?`)) return;
  const ok = await save(addDoc(collection(db, "draws"), { word, date, createdAt: serverTimestamp() }), `„${word}“ hinzugefügt.`);
  if (ok) {
    $("draw-word").value = "";
    updateDrawHint();
    $("draw-word").focus();
  }
});

function renderDraws() {
  const draws = sortDraws(state.draws);
  $("draws").innerHTML = draws.length === 0
    ? `<li class="muted">Noch keine Wörter gezogen.</li>`
    : draws.map((d) => {
        const who = playersWith(d.word).map((p) => escapeHtml(p.name));
        return `<li>
          <span class="date">${escapeHtml(formatDay(d.date))}</span>
          <span class="word">${escapeHtml(d.word)}
            <small>${who.length ? who.join(", ") : "bei niemandem"}</small></span>
          <button type="button" class="btn small ghost" data-del-draw="${escapeHtml(d.id)}" title="Entfernen">✕</button>
        </li>`;
      }).join("");
  updateDrawHint();
}

$("draws").addEventListener("click", (e) => {
  const id = e.target.closest("[data-del-draw]")?.dataset.delDraw;
  if (!id) return;
  const d = state.draws.find((x) => x.id === id);
  if (d && confirm(`„${d.word}“ wirklich wieder entfernen?`)) {
    save(deleteDoc(doc(db, "draws", id)), "Wort entfernt.");
  }
});

// ---------- Spieler ----------

function playerLink(id) {
  const url = new URL("index.html", location.href);
  url.search = new URLSearchParams({ spieler: id }).toString();
  return url.toString();
}

$("player-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("player-name").value.trim();
  if (!name) return;
  if (state.players.some((p) => normalize(p.name) === normalize(name))
      && !confirm(`Es gibt schon einen Spieler „${name}“. Trotzdem anlegen?`)) return;
  const id = makePlayerCode(name);
  const ok = await save(setDoc(doc(db, "players", id), { name, cells: emptyCells() }), `${name} angelegt.`);
  if (ok) $("player-name").value = "";
});

function renderPlayers() {
  const drawn = drawnSet(state.draws);
  const locked = isLocked(state.settings);

  const rows = state.players.map((p) => {
    const cells = cellsOf(p);
    const mask = hitMask(cells, drawn);
    return { p, cells, mask, hits: mask.filter(Boolean).length, lines: bingoLines(mask) };
  }).sort((a, b) => b.lines.length - a.lines.length || b.hits - a.hits
    || String(a.p.name).localeCompare(String(b.p.name), "de"));

  $("players").innerHTML = rows.length === 0
    ? `<p class="muted">Noch keine Spieler angelegt.</p>`
    : rows.map(({ p, cells, mask, hits, lines }) => {
        const filled = cells.filter((c) => c.trim()).length;
        const open = state.openGrids.has(p.id);
        const onLine = new Set(lines.flat());
        const link = playerLink(p.id);
        const whatsapp = "https://wa.me/?text=" + encodeURIComponent(
          `🎄 Hallo ${p.name}! Hier ist dein persönlicher Link zum Weihnachtsbingo:\n${link}`);
        return `<article class="player">
          <div class="player-head">
            <strong>${escapeHtml(p.name)}</strong>
            ${lines.length ? `<span class="badge">BINGO ×${lines.length}</span>` : ""}
          </div>
          <p class="meta">${locked ? "" : `${filled}/${CELL_COUNT} Felder ausgefüllt · `}${hits} Treffer</p>
          <div class="row wrap-row">
            <button type="button" class="btn small" data-copy="${escapeHtml(link)}">Link kopieren</button>
            <a class="btn small" href="${escapeHtml(whatsapp)}" target="_blank" rel="noopener">WhatsApp</a>
            <button type="button" class="btn small ghost" data-toggle="${escapeHtml(p.id)}">${open ? "Feld ausblenden" : "Feld ansehen"}</button>
            <button type="button" class="btn small ghost danger" data-del-player="${escapeHtml(p.id)}">Löschen</button>
          </div>
          ${open ? `<div class="grid mini">${cells.map((c, i) => `<div class="cell${c.trim() ? "" : " empty"}${mask[i] ? " hit" : ""}${onLine.has(i) ? " line" : ""}"><span>${escapeHtml(c) || "–"}</span></div>`).join("")}</div>` : ""}
        </article>`;
      }).join("");
}

$("players").addEventListener("click", async (e) => {
  const t = e.target.closest("button");
  if (!t) return;
  if (t.dataset.copy) {
    await copy(t.dataset.copy);
  } else if (t.dataset.toggle) {
    const id = t.dataset.toggle;
    state.openGrids.has(id) ? state.openGrids.delete(id) : state.openGrids.add(id);
    renderPlayers();
  } else if (t.dataset.delPlayer) {
    const p = state.players.find((x) => x.id === t.dataset.delPlayer);
    if (p && confirm(`${p.name} mit dem ganzen Feld wirklich löschen?`)) {
      save(deleteDoc(doc(db, "players", p.id)), `${p.name} gelöscht.`);
    }
  }
});

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Link kopiert.");
  } catch {
    prompt("Link zum Kopieren:", text);
  }
}

// ---------- Hilfen ----------

async function save(promise, successText) {
  try {
    await promise;
    toast(successText);
    return true;
  } catch (err) {
    console.error(err);
    toast("Speichern fehlgeschlagen: " + err.message);
    return false;
  }
}

let toastTimer;
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3500);
}
