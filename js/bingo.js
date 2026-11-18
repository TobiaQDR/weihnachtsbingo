// Gemeinsame Spiellogik für Spieler- und Spielleiter-Ansicht.

export const CELL_COUNT = 25;
export const MAX_WORD_LENGTH = 40;

/** Wörter vergleichbar machen: Groß/Klein egal, überflüssige Leerzeichen weg. */
export function normalize(word) {
  return String(word ?? "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
}

export function emptyCells() {
  return Array(CELL_COUNT).fill("");
}

export function cellsOf(player) {
  const cells = Array.isArray(player?.cells) ? player.cells.slice(0, CELL_COUNT) : [];
  while (cells.length < CELL_COUNT) cells.push("");
  return cells.map((c) => String(c ?? ""));
}

export function drawnSet(draws) {
  return new Set(draws.map((d) => normalize(d.word)).filter(Boolean));
}

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

export function lockDateOf(settings) {
  const d = settings?.lockDate;
  return d && typeof d.toDate === "function" ? d.toDate() : null;
}

export function isLocked(settings, now = new Date()) {
  if (!settings) return false;
  if (settings.locked === true) return true;
  const d = lockDateOf(settings);
  return d ? now >= d : false;
}

/** Sortiert Ziehungen: neueste zuerst. */
export function sortDraws(draws) {
  return [...draws].sort((a, b) => {
    const byDate = String(b.date ?? "").localeCompare(String(a.date ?? ""));
    if (byDate !== 0) return byDate;
    return (b.createdAt?.toMillis?.() ?? Infinity) - (a.createdAt?.toMillis?.() ?? Infinity);
  });
}

export function formatDay(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
}

export function formatDateTime(date) {
  return date.toLocaleString("de-DE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }) + " Uhr";
}

export function todayIso() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Lesbarer, schwer zu erratender Code für den persönlichen Link, z. B. "oma-k7m2x9qp". */
export function makePlayerCode(name) {
  const slug = normalize(name)
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 20);
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const rnd = crypto.getRandomValues(new Uint32Array(10));
  const suffix = Array.from(rnd, (x) => alphabet[x % alphabet.length]).join("");
  return slug ? `${slug}-${suffix}` : suffix;
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}
