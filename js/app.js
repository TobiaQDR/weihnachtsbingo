import {
  doc, collection, onSnapshot, getDoc, getDocs, setDoc, updateDoc, writeBatch, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { app, db, configured } from "./firebase.js";
import {
  CELL_COUNT, normalize, cleanWord, cellsOf, canAddWords, daysMap, drawnMap, scoreBoard, ranking,
  isDayOpen, escapeHtml, emptyCells, makePlayerCode, randomId,
} from "./bingo.js";
import {
  $, toast, initTabs, startSnow, confetti, openOverlay, closeOverlay, miniGridHtml,
  calendarHtml, createDayEditor, storageGet, storageSet, reducedMotion,
} from "./ui.js";

const state = {
  code: null,
  boardId: null,
  boards: null,     // alle Felder
  dayDocs: null,    // Rohdaten der Tage
  days: new Map(),  // Tag → Wörter
  settings: null,
  member: false,    // darf schreiben (anonym angemeldet und Link bestätigt)
  editIndex: null,
  prevMask: null,
};

// ---------- Start ----------

const MAX_NAME_LENGTH = 30;
/** Geheimer Code aus dem Einladungslink (index.html?einladung=…), mit dem man selbst beitritt. */
const invite = new URLSearchParams(location.search).get("einladung");

function getCode() {
  const fromUrl = new URLSearchParams(location.search).get("spieler");
  if (fromUrl) storageSet("bingoCode", fromUrl);
  return fromUrl || storageGet("bingoCode");
}

function forgetCode() {
  try { localStorage.removeItem("bingoCode"); } catch { /* egal */ }
}

function showError(text) {
  $("loading").hidden = true;
  $("join").hidden = true;
  $("game").hidden = true;
  $("error").hidden = false;
  $("error").textContent = text;
}

startSnow();
state.code = getCode();

if (!configured) {
  showError("Das Spiel ist noch nicht eingerichtet (Firebase-Daten fehlen in js/firebase-config.js).");
} else if (state.code) {
  start().catch(onLoadError);
} else if (invite) {
  showJoin();
} else {
  showError("Bitte öffne den Link, den du für das Weihnachtsbingo bekommen hast.");
}

/** Persönlicher Link dieses Spielers (damit kommt man auch auf anderen Geräten ins eigene Feld). */
function personalLink() {
  const url = new URL(location.href);
  url.search = new URLSearchParams({ spieler: state.code }).toString();
  url.hash = "";
  return url.toString();
}

async function start() {
  const snap = await getDoc(doc(db, "players", state.code));
  if (!snap.exists()) {
    forgetCode();
    state.code = null;
    if (invite) {
      showJoin();
      return;
    }
    showError("Diesen Spieler-Link gibt es nicht (mehr). Vielleicht wurdest du aus dem Spiel entfernt – frag bitte beim Spielleiter nach.");
    return;
  }
  // Adresszeile auf den persönlichen Link umstellen, damit ein Lesezeichen immer ins eigene Feld führt
  if (new URLSearchParams(location.search).get("spieler") !== state.code) {
    history.replaceState(null, "", personalLink());
  }
  state.boardId = snap.data().boardId;
  if (!state.boardId) {
    showError("Das Spiel wurde gerade aktualisiert. Der Spielleiter muss einmal die Spielleiter-Seite öffnen – danach geht es hier weiter.");
    return;
  }

  onSnapshot(collection(db, "boards"), (s) => {
    state.boards = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  }, onLoadError);

  onSnapshot(collection(db, "days"), (s) => {
    state.dayDocs = s.docs.map((d) => ({ id: d.id, ...d.data() }));
    state.days = daysMap(state.dayDocs);
    render();
  }, onLoadError);

  onSnapshot(doc(db, "game", "settings"), (s) => {
    state.settings = s.exists() ? s.data() : {};
    render();
  }, onLoadError);

  // Türchen öffnen sich um Mitternacht
  setInterval(renderCalendar, 60_000);

  joinGame();
}

/** Angemeldeten Nutzer holen, notfalls im Hintergrund anonym anmelden. */
async function ensureUser() {
  const auth = getAuth(app);
  await (typeof auth.authStateReady === "function"
    ? auth.authStateReady()
    : new Promise((resolve) => { const off = onAuthStateChanged(auth, () => { off(); resolve(); }); }));
  return auth.currentUser ?? (await signInAnonymously(auth)).user;
}

/** Diesen Browser mit dem Spieler verknüpfen (nötig zum Schreiben). */
async function joinGame() {
  try {
    const user = await ensureUser();
    const ref = doc(db, "members", user.uid);
    const m = await getDoc(ref);
    if (!m.exists() || m.data().code !== state.code || m.data().boardId !== state.boardId) {
      await setDoc(ref, { code: state.code, boardId: state.boardId });
    }
    state.member = true;
  } catch (err) {
    console.error("Anmeldung fehlgeschlagen:", err);
    state.member = false;
    toast("Du kannst gerade nur zuschauen – die Anmeldung hat nicht geklappt.", 6000);
  }
  render();
}

// ---------- Selbst beitreten ----------

function showJoin() {
  $("loading").hidden = true;
  $("error").hidden = true;
  $("join").hidden = false;
  $("join-name").focus();
}

$("join").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = $("join-name").value.replace(/\s+/g, " ").trim().slice(0, MAX_NAME_LENGTH);
  if (!name) return;
  $("join-msg").textContent = "";
  $("join-btn").disabled = true;
  let code;
  try {
    const boards = await getDocs(collection(db, "boards"));
    if (boards.docs.some((d) => normalize(d.data().name) === normalize(name))) {
      $("join-msg").textContent = `„${name}“ spielt schon mit. Nimm bitte einen anderen Namen, z. B. mit Nachnamen.`;
      return;
    }
    const user = await ensureUser();
    code = makePlayerCode(name);
    const boardId = randomId();
    // Feld, geheimer Spieler-Link und Verknüpfung mit diesem Browser in einem Rutsch
    const batch = writeBatch(db);
    batch.set(doc(db, "boards", boardId), { name, cells: emptyCells(), canAddWords: true });
    batch.set(doc(db, "players", code), { name, boardId, uid: user.uid, invite });
    batch.set(doc(db, "members", user.uid), { code, boardId });
    await batch.commit();
  } catch (err) {
    console.error(err);
    $("join-msg").textContent = "Beitreten hat nicht geklappt. Vielleicht ist der Einladungslink nicht mehr gültig – frag bitte beim Spielleiter nach.";
    return;
  } finally {
    $("join-btn").disabled = false;
  }

  storageSet("bingoCode", code);
  state.code = code;
  $("join").hidden = true;
  $("loading").hidden = false;
  toast(`Willkommen, ${name}! 🎉 Speichere dir diese Seite als Lesezeichen.`, 6000);
  start().catch(onLoadError);
});

$("my-link").addEventListener("click", async () => {
  const link = personalLink();
  try {
    await navigator.clipboard.writeText(link);
    toast("🔗 Dein Link ist kopiert. Damit kommst du auch auf anderen Geräten in dein Feld – nicht weitergeben!", 6000);
  } catch {
    prompt("Dein persönlicher Link (nicht weitergeben):", link);
  }
});

function onLoadError(err) {
  console.error(err);
  showError("Die Daten konnten nicht geladen werden. Bitte prüfe die Internetverbindung und lade die Seite neu.");
}

// ---------- Anzeige ----------

const me = () => state.boards?.find((b) => b.id === state.boardId);
const locked = () => state.settings?.locked === true;

let tabs;
let firstRender = true;

function render() {
  if (!state.boards || !state.dayDocs || !state.settings) return;
  const board = me();
  if (!board) {
    forgetCode();
    showError("Du bist nicht mehr im Spiel, die Spielleitung hat dich entfernt. Bitte frag dort nach.");
    return;
  }

  $("loading").hidden = true;
  $("error").hidden = true;
  if ($("game").hidden) {
    $("game").hidden = false;
    tabs ??= initTabs($("tabs"), "bingoTab");
  }
  $("greeting").textContent = `Hallo ${board.name}! ✨`;

  renderMine(board);
  renderAll();
  renderCalendar();
  dayEditor.refresh();

  if (locked() && state.editIndex !== null) closeEditor();
  firstRender = false;
}

function buildGrid() {
  const grid = $("grid");
  grid.innerHTML = Array.from({ length: CELL_COUNT }, (_, i) =>
    `<button type="button" class="cell" data-i="${i}" style="--i:${i}"><span class="cell-word"></span><span class="cell-day"></span></button>`,
  ).join("");
  grid.addEventListener("animationend", (e) => {
    if (e.animationName === "hit-pop") e.target.classList.remove("pop");
  });
  grid.classList.add("intro");
  setTimeout(() => grid.classList.remove("intro"), 1400);
}

function renderMine(board) {
  const drawn = drawnMap(state.days);
  const score = scoreBoard(board, drawn);
  const isLocked = locked();
  const canEdit = !isLocked && state.member;
  const onLine = new Set(score.lines.flat());

  // Bingo-Hinweis + Konfetti, wenn eine neue Reihe dazukommt
  const banner = $("bingo");
  const n = score.lines.length;
  banner.hidden = n === 0;
  banner.textContent = n === 1 ? "🎉 BINGO! Du hast eine volle Reihe!" : `🎉 BINGO! Du hast ${n} volle Reihen!`;
  const key = `bingoLines:${state.boardId}`;
  const seen = Number(storageGet(key) || 0);
  if (n > seen) setTimeout(confetti, firstRender ? 600 : 150);
  if (n !== seen) storageSet(key, String(n));

  // Status
  const free = CELL_COUNT - score.filled;
  $("status").innerHTML = isLocked
    ? "🔒 Die Felder sind gesperrt – jetzt heißt es abwarten!"
    : `✏️ Tippe auf ein Feld, um ein Wort einzutragen${free ? ` · <strong>noch ${free} frei</strong>` : " · alles ausgefüllt 👍"}`;
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
}

const MEDALS = ["🥇", "🥈", "🥉"];

function renderAll() {
  const drawn = drawnMap(state.days);
  const rows = ranking(state.boards, drawn);
  $("boards").innerHTML = rows.map((r, idx) => {
    const isMe = r.board.id === state.boardId;
    const rank = r.hits > 0 && idx < 3 ? MEDALS[idx] : `${idx + 1}.`;
    return `<article class="board-card${isMe ? " me" : ""}" style="--i:${idx}">
      <header>
        <span class="rank">${rank}</span>
        <strong class="name">${escapeHtml(r.board.name)}</strong>
        ${isMe ? `<span class="tag">Du</span>` : ""}
        ${r.lines.length ? `<span class="badge">BINGO ×${r.lines.length}</span>` : ""}
      </header>
      <p class="meta">${r.hits} Treffer · ${r.filled}/${CELL_COUNT} ausgefüllt</p>
      <div class="progress-bar small"><span style="width:${(r.hits / CELL_COUNT) * 100}%"></span></div>
      ${miniGridHtml(r, drawn)}
    </article>`;
  }).join("");
}

function renderCalendar() {
  const board = me();
  if (!board) return;
  $("calendar").innerHTML = calendarHtml(state.days, state.boards, { myCells: cellsOf(board) });
  $("calendar-note").textContent = canAddWords(board) && state.member
    ? "Tippe auf ein Türchen, um die Wörter des Tages zu sehen oder einzutragen."
    : "Tippe auf ein Türchen, um die Wörter des Tages zu sehen.";
}

// ---------- Kalender ----------

const dayEditor = createDayEditor({
  getBoards: () => state.boards ?? [],
  getDays: () => state.days,
  getMeta: (n) => state.dayDocs?.find((d) => d.id === String(n)) ?? null,
  onSave: async (n, words) => {
    try {
      await setDoc(doc(db, "days", String(n)), {
        words, updatedBy: me()?.name ?? "", updatedAt: serverTimestamp(),
      });
      toast(`🎁 ${n}. Dezember gespeichert`);
      return true;
    } catch (err) {
      console.error(err);
      toast(canAddWords(me())
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
  let note = "";
  if (!isDayOpen(n)) note = `🔒 Dieses Türchen öffnet sich am ${n}. Dezember.`;
  else if (!canAddWords(me())) note = "Du darfst gerade keine Tageswörter eintragen.";
  else if (!state.member) note = "Eintragen ist gerade nicht möglich. Lade die Seite bitte neu.";
  dayEditor.open(n, { canEdit: !note, note });
});

// ---------- Eingabe ins eigene Feld ----------

$("grid").addEventListener("click", (e) => {
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
  if (i === null) return;
  const word = cleanWord(value);
  const cells = cellsOf(me());

  if (word && cells.some((c, j) => j !== i && normalize(c) === normalize(word))) {
    $("editor-msg").textContent = "Dieses Wort steht schon in einem anderen Feld.";
    return;
  }

  cells[i] = word;
  closeEditor();
  try {
    await updateDoc(doc(db, "boards", state.boardId), { cells });
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
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && state.editIndex !== null) closeEditor(); });
