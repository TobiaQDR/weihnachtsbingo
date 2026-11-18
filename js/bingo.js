// Gemeinsame Spiellogik für Spieler- und Spielleiter-Ansicht.

export const CELL_COUNT = 25;
export const MAX_WORD_LENGTH = 40;
export const MAX_WORDS_PER_DAY = 12;
export const DAY_COUNT = 24;
/** Jahr der Adventszeit, für die das Spiel läuft. */
export const SEASON_YEAR = 2026;

/** Wörter vergleichbar machen: Groß/Klein egal, überflüssige Leerzeichen weg. */
export function normalize(word) {
  return String(word ?? "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

export function cleanWord(word) {
  return String(word ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_WORD_LENGTH);
}

export function emptyCells() {
  return Array(CELL_COUNT).fill("");
}

export function cellsOf(board) {
  const cells = Array.isArray(board?.cells) ? board.cells.slice(0, CELL_COUNT) : [];
  while (cells.length < CELL_COUNT) cells.push("");
  return cells.map((c) => String(c ?? ""));
}

export function canAddWords(board) {
  return board?.canAddWords !== false;
}

// ---------- Adventskalender ----------

export function dayNumbers() {
  return Array.from({ length: DAY_COUNT }, (_, i) => i + 1);
}

/** Tag-Dokumente → Map Tag → Wortliste */
export function daysMap(dayDocs) {
  const map = new Map();
  for (const d of dayDocs) {
    const n = Number(d.id);
    if (n >= 1 && n <= DAY_COUNT) {
      map.set(n, (Array.isArray(d.words) ? d.words : []).map(String).filter((w) => w.trim()));
    }
  }
  return map;
}

/** Alle gezogenen Wörter: normalisiertes Wort → erster Tag, an dem es dran war. */
export function drawnMap(days) {
  const map = new Map();
  for (const n of [...days.keys()].sort((a, b) => a - b)) {
    for (const w of days.get(n)) {
      const k = normalize(w);
      if (k && !map.has(k)) map.set(k, n);
    }
  }
  return map;
}

/** Ist das Türchen für Spieler schon offen? */
export function isDayOpen(n, now = new Date()) {
  return now >= new Date(SEASON_YEAR, 11, n);
}

export function isToday(n, now = new Date()) {
  return now.getFullYear() === SEASON_YEAR && now.getMonth() === 11 && now.getDate() === n;
}

export function dayLabel(n) {
  return new Date(SEASON_YEAR, 11, n).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" });
}

// ---------- Treffer & Bingo ----------

/** true/false je Feld: wurde das Wort schon gezogen? */
export function hitMask(cells, drawn) {
  return cells.map((c) => {
    const n = normalize(c);
    return n !== "" && drawn.has(n);
  });
}

const LINES = (() => {
  const idx = [0, 1, 2, 3, 4];
  const lines = [];
  for (const r of idx) lines.push(idx.map((c) => r * 5 + c)); // Reihen
  for (const c of idx) lines.push(idx.map((r) => r * 5 + c)); // Spalten
  lines.push(idx.map((i) => i * 6)); // Diagonale ↘
  lines.push(idx.map((i) => (i + 1) * 4)); // Diagonale ↙
  return lines;
})();

/** Alle vollständigen Reihen/Spalten/Diagonalen (jeweils als Liste von Feld-Indizes). */
export function bingoLines(mask) {
  return LINES.filter((line) => line.every((i) => mask[i]));
}

/** Auswertung eines Feldes. */
export function scoreBoard(board, drawn) {
  const cells = cellsOf(board);
  const mask = hitMask(cells, drawn);
  const lines = bingoLines(mask);
  return {
    board, cells, mask, lines,
    hits: mask.filter(Boolean).length,
    filled: cells.filter((c) => c.trim()).length,
  };
}

/** Rangliste: meiste Bingos, dann meiste Treffer, dann Name. */
export function ranking(boards, drawn) {
  return boards.map((b) => scoreBoard(b, drawn))
    .sort((a, b) => b.lines.length - a.lines.length || b.hits - a.hits
      || String(a.board.name).localeCompare(String(b.board.name), "de"));
}

export function boardsWith(boards, word) {
  const n = normalize(word);
  if (!n) return [];
  return boards.filter((b) => cellsOf(b).some((c) => normalize(c) === n));
}

/** Ähnliche Einträge (enthält / ist enthalten) – hilft bei Tippfehlern und Varianten. */
export function similarEntries(boards, word) {
  const n = normalize(word);
  if (n.length < 3) return [];
  const out = [];
  for (const b of boards) {
    for (const c of cellsOf(b)) {
      const m = normalize(c);
      if (m && m !== n && (m.includes(n) || n.includes(m))) out.push({ name: b.name, word: c });
    }
  }
  return out;
}

// ---------- Sonstiges ----------

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export function randomId(length = 12) {
  const rnd = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(rnd, (x) => ALPHABET[x % ALPHABET.length]).join("");
}

/** Lesbarer, schwer zu erratender Code für den persönlichen Link, z. B. "oma-k7m2x9qp". */
export function makePlayerCode(name) {
  const slug = normalize(name)
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
  const suffix = randomId(10);
  return slug ? `${slug}-${suffix}` : suffix;
}

// ---------- PIN ----------

/** 4 bis 8 Ziffern. */
export function isValidPin(pin) {
  return /^\d{4,8}$/.test(String(pin ?? ""));
}

/**
 * Schlüssel des Anmelde-Dokuments logins/{key}: SHA-256 aus Feld und PIN.
 * Wer Name und PIN kennt, findet darüber seinen geheimen Spieler-Code.
 */
export async function pinKey(boardId, pin) {
  const data = new TextEncoder().encode(`weihnachtsbingo:${boardId}:${pin}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

// ---------- Weihnachtslieder ----------

export const SONGS_PER_DAY = 3;
export const MAX_SONG_LENGTH = 60;

export function cleanSong(title) {
  return String(title ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_SONG_LENGTH);
}

/** Dokument-ID eines Liedes im Pool, z. B. "stille-nacht-heilige-nacht". Gleiche ID = gleiches Lied. */
export function songId(title) {
  return normalize(title)
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Lieder eines Tages aus dem Dokument songDays/{n}: { picked: [{ title, by }], random: [title] } */
export function songDayOf(data) {
  const picked = (Array.isArray(data?.picked) ? data.picked : [])
    .filter((p) => p && String(p.title ?? "").trim())
    .map((p) => ({ title: String(p.title), by: String(p.by ?? "") }));
  const random = (Array.isArray(data?.random) ? data.random : []).map(String).filter((t) => t.trim());
  return { picked, random };
}

/**
 * Zufällige Lieder aus dem Pool ziehen.
 * @param pool       alle Liedtitel
 * @param count      wie viele
 * @param exclude    Titel, die nicht vorkommen dürfen (z. B. von Spielern gewählte)
 * @param previous   bisherige Zufallslieder – werden nur genommen, wenn nichts anderes übrig ist
 * @param usedCount  Map songId → wie oft das Lied an anderen Tagen schon dran ist (seltene zuerst)
 */
export function pickRandomSongs(pool, count, { exclude = [], previous = [], usedCount = new Map() } = {}) {
  const ex = new Set(exclude.map(songId));
  const prev = new Set(previous.map(songId));
  const seen = new Set();
  const candidates = [];
  for (const title of pool) {
    const id = songId(title);
    if (!id || ex.has(id) || seen.has(id)) continue;
    seen.add(id);
    candidates.push({ title, rank: (prev.has(id) ? 1000 : 0) + (usedCount.get(id) ?? 0), r: Math.random() });
  }
  return candidates
    .sort((a, b) => a.rank - b.rank || a.r - b.r)
    .slice(0, Math.max(0, count))
    .map((c) => c.title);
}
