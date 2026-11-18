import {
  doc, collection, onSnapshot, updateDoc,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db, configured } from "./firebase.js";
import {
  CELL_COUNT, normalize, cellsOf, drawnSet, hitMask, bingoLines,
  isLocked, lockDateOf, sortDraws, formatDay, formatDateTime, escapeHtml,
} from "./bingo.js";

const $ = (id) => document.getElementById(id);
const state = { player: null, settings: null, draws: [], editIndex: null };

// ---------- Start ----------

function getCode() {
  const fromUrl = new URLSearchParams(location.search).get("spieler");
  try {
    if (fromUrl) localStorage.setItem("bingoCode", fromUrl);
    return fromUrl || localStorage.getItem("bingoCode");
  } catch {
    return fromUrl;
  }
}

function forgetCode() {
  try { localStorage.removeItem("bingoCode"); } catch { /* egal */ }
}

function showError(text) {
  $("loading").hidden = true;
  $("game").hidden = true;
  $("error").hidden = false;
  $("error").textContent = text;
}

const code = getCode();

if (!configured) {
  showError("Das Spiel ist noch nicht eingerichtet (Firebase-Daten fehlen in js/firebase-config.js).");
} else if (!code) {
  showError("Bitte öffne den persönlichen Link, den du für das Weihnachtsbingo bekommen hast.");
} else {
  start(code);
}

function start(code) {
  const playerRef = doc(db, "players", code);

  onSnapshot(playerRef, (snap) => {
    if (!snap.exists()) {
      forgetCode();
      showError("Diesen Spieler-Link gibt es nicht (mehr). Bitte frag beim Spielleiter nach deinem Link.");
      return;
    }
    state.player = { ref: playerRef, ...snap.data() };
    render();
  }, onLoadError);

  onSnapshot(doc(db, "game", "settings"), (snap) => {
    state.settings = snap.exists() ? snap.data() : {};
    render();
  }, onLoadError);

  onSnapshot(collection(db, "draws"), (snap) => {
    state.draws = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    render();
  }, onLoadError);

  // Der Sperrzeitpunkt kann erreicht werden, ohne dass sich Daten ändern
  setInterval(render, 30_000);
}

function onLoadError(err) {
  console.error(err);
  showError("Die Daten konnten nicht geladen werden. Bitte prüfe die Internetverbindung und lade die Seite neu.");
}

// ---------- Anzeige ----------

function render() {
  const { player, settings } = state;
  if (!player || settings === null) return;

  $("loading").hidden = true;
  $("error").hidden = true;
  $("game").hidden = false;
  $("greeting").textContent = `Hallo ${player.name}!`;

  const locked = isLocked(settings);
  const cells = cellsOf(player);
  const drawn = drawnSet(state.draws);
  const mask = hitMask(cells, drawn);
  const lines = bingoLines(mask);
  const onLine = new Set(lines.flat());

  // Bingo-Hinweis
  const banner = $("bingo");
  banner.hidden = lines.length === 0;
  banner.textContent = lines.length === 1
    ? "🎉 BINGO! Du hast eine volle Reihe!"
    : `🎉 BINGO! Du hast ${lines.length} volle Reihen!`;

  // Status
  const filled = cells.filter((c) => c.trim() !== "").length;
  const lockDate = lockDateOf(settings);
  let status;
  if (locked) {
    status = "🔒 Die Felder sind gesperrt. Jetzt heißt es abwarten, welche Wörter gezogen werden!";
  } else {
    status = "✏️ Tippe auf ein Feld, um ein Wort einzutragen.";
    if (filled < CELL_COUNT) status += ` Noch ${CELL_COUNT - filled} Felder frei.`;
    if (lockDate) status += ` Die Felder werden am ${formatDateTime(lockDate)} gesperrt.`;
  }
  $("status").textContent = status;

  // Bingo-Feld
  const grid = $("grid");
  grid.classList.toggle("locked", locked);
  grid.innerHTML = cells.map((word, i) => {
    const classes = ["cell"];
    if (!word.trim()) classes.push("empty");
    if (mask[i]) classes.push("hit");
    if (onLine.has(i)) classes.push("line");
    const label = word.trim() ? escapeHtml(word) : (locked ? "–" : "+");
    const aria = `Feld ${i + 1}: ${escapeHtml(word) || "leer"}${mask[i] ? ", gezogen" : ""}`;
    return `<button type="button" class="${classes.join(" ")}" data-i="${i}"
      ${locked ? "disabled" : ""} aria-label="${aria}"><span>${label}</span></button>`;
  }).join("");

  const hits = mask.filter(Boolean).length;
  $("progress").textContent = `${hits} von ${CELL_COUNT} Feldern getroffen`;

  // Gezogene Wörter
  const mine = new Set(cells.map(normalize));
  const draws = sortDraws(state.draws);
  $("draws").innerHTML = draws.length === 0
    ? `<li class="muted">Noch keine Wörter gezogen.</li>`
    : draws.map((d) => {
        const have = mine.has(normalize(d.word));
        return `<li class="${have ? "have" : ""}">
          <span class="date">${escapeHtml(formatDay(d.date))}</span>
          <span class="word">${escapeHtml(d.word)}</span>
          ${have ? `<span class="tick" title="Steht in deinem Feld">✓</span>` : ""}
        </li>`;
      }).join("");

  // Wurde gesperrt, während das Eingabefenster offen ist → schließen
  if (locked && state.editIndex !== null) closeEditor();
}

// ---------- Eingabe ----------

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
  $("editor-input").value = cellsOf(state.player)[i];
  $("editor-msg").textContent = "";
  $("editor").hidden = false;
  $("editor-input").focus();
  $("editor-input").select();
}

function closeEditor() {
  state.editIndex = null;
  $("editor").hidden = true;
}

async function saveCell(value) {
  const i = state.editIndex;
  if (i === null) return;
  const word = value.replace(/\s+/g, " ").trim();
  const cells = cellsOf(state.player);

  if (word && cells.some((c, j) => j !== i && normalize(c) === normalize(word))) {
    $("editor-msg").textContent = "Dieses Wort steht schon in einem anderen Feld.";
    return;
  }

  cells[i] = word;
  closeEditor();
  try {
    await updateDoc(state.player.ref, { cells });
  } catch (err) {
    console.error(err);
    toast(isLocked(state.settings)
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
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeEditor(); });

let toastTimer;
function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}
