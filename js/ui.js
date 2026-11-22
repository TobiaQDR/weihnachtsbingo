// Gemeinsame Oberflächen-Bausteine: Tabs, Schnee, Konfetti, Dialoge, Kalender, Mini-Felder.

import {
  MAX_WORD_LENGTH, MAX_WORDS_PER_DAY, normalize, cleanWord, escapeHtml,
  dayNumbers, isDayOpen, isToday, dayLabel, boardsWith, similarEntries, drawnMap,
} from "./bingo.js";

export const $ = (id) => document.getElementById(id);

export const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* egal */ }
}
function storageRemove(key) {
  try { localStorage.removeItem(key); } catch { /* egal */ }
}
export { storageGet, storageSet, storageRemove };

/** Text in die Zwischenablage, notfalls zum Abschreiben anzeigen. */
export async function copyText(text, done = "🔗 Link kopiert.") {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
  } catch {
    prompt("Zum Kopieren:", text);
  }
}

// ---------- Toast ----------

let toastTimer;
export function toast(text, ms = 3500) {
  let el = $("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.className = "toast";
    el.setAttribute("role", "status");
    document.body.append(el);
  }
  el.textContent = text;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), ms);
}

// ---------- Tabs ----------

/**
 * Tab-Leiste mit gleitendem Indikator. Merkt sich den zuletzt offenen Tab.
 * Reiter mit `hidden` zählen nicht mit; nach dem Ein- oder Ausblenden `refresh()` aufrufen.
 */
export function initTabs(nav, storageKey, onChange = () => {}) {
  const all = [...nav.querySelectorAll("[data-tab]")];
  const viewOf = (name) => document.querySelector(`[data-view="${name}"]`);
  let current = null;

  function show(name, animate = true) {
    const buttons = all.filter((b) => !b.hidden);
    if (!buttons.length) return;
    const idx = Math.max(0, buttons.findIndex((b) => b.dataset.tab === name));
    name = buttons[idx].dataset.tab;
    nav.style.setProperty("--count", buttons.length);
    nav.style.setProperty("--idx", idx);
    for (const b of all) {
      const active = b.dataset.tab === name;
      b.classList.toggle("active", active);
      b.setAttribute("aria-selected", String(active));
      const view = viewOf(b.dataset.tab);
      if (!view) continue;
      if (active && view.hidden) {
        view.hidden = false;
        if (animate && !reducedMotion()) {
          view.classList.remove("enter");
          void view.offsetWidth; // Animation neu starten
          view.classList.add("enter");
          clearTimeout(view._enterTimer);
          view._enterTimer = setTimeout(() => view.classList.remove("enter"), 1100);
        }
      } else if (!active) {
        view.hidden = true;
      }
    }
    storageSet(storageKey, name);
    current = name;
    onChange(name);
  }

  nav.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (b) show(b.dataset.tab);
  });

  show(storageGet(storageKey) || all[0].dataset.tab, false);
  return {
    show,
    /** Nach dem Ein- oder Ausblenden von Reitern: aktuellen Reiter behalten, wenn er noch da ist. */
    refresh: () => show(current ?? storageGet(storageKey), false),
  };
}

// ---------- Passwort-Felder ----------

/** Auge-Knopf neben Passwort-Feldern (`.pw-field`): zeigt das Passwort an oder verbirgt es wieder. */
export function initPasswordToggles(root = document) {
  root.addEventListener("click", (e) => {
    const btn = e.target.closest(".pw-toggle");
    if (!btn) return;
    const input = btn.closest(".pw-field")?.querySelector("input");
    if (!input) return;
    setPasswordVisible(btn.closest(".pw-field"), input.type === "password");
    input.focus();
  });
}

function setPasswordVisible(field, show) {
  const input = field.querySelector("input");
  const btn = field.querySelector(".pw-toggle");
  if (input) input.type = show ? "text" : "password";
  if (btn) {
    btn.textContent = show ? "🙈" : "👁️";
    btn.setAttribute("aria-label", show ? "Passwort verbergen" : "Passwort anzeigen");
    btn.setAttribute("aria-pressed", String(show));
  }
}

/** Alle Passwort-Felder in `root` wieder verbergen und leeren (z. B. beim Öffnen eines Dialogs). */
export function resetPasswords(root) {
  for (const field of root.querySelectorAll(".pw-field")) {
    setPasswordVisible(field, false);
    field.querySelector("input").value = "";
  }
}

// ---------- Drag & Drop im Bingo-Feld ----------

/**
 * Felder per Ziehen tauschen. Mit der Maus sofort, auf dem Handy nach kurzem Gedrückthalten
 * (sonst könnte man über dem Feld nicht mehr scrollen).
 * @param grid     Container mit `.cell`-Knöpfen (data-i)
 * @param canDrag  () => boolean
 * @param onSwap   (from, to) => void
 * @returns { wasDrag } – wasDrag() ist direkt nach einem Ziehen true (dann den Klick ignorieren)
 */
export function enableCellDrag(grid, { canDrag, onSwap }) {
  const LONG_PRESS_MS = 280;
  const MOVE_TOLERANCE = 8;
  let d = null; // laufender Zug
  let suppressClick = false;

  const cellAt = (x, y) => {
    const el = document.elementFromPoint(x, y)?.closest(".cell");
    return el && grid.contains(el) && !el.disabled ? el : null;
  };

  function begin() {
    d.active = true;
    const rect = d.cell.getBoundingClientRect();
    const ghost = d.cell.cloneNode(true);
    ghost.classList.add("drag-ghost");
    ghost.classList.remove("pop", "dragging", "drop-target");
    ghost.removeAttribute("data-i");
    ghost.setAttribute("aria-hidden", "true");
    Object.assign(ghost.style, {
      width: `${rect.width}px`, height: `${rect.height}px`, left: `${rect.left}px`, top: `${rect.top}px`,
    });
    document.body.append(ghost);
    d.ghost = ghost;
    d.cell.classList.add("dragging");
    grid.classList.add("drag-active");
    if (d.touch && navigator.vibrate) navigator.vibrate(15);
    move(d.lastX, d.lastY);
  }

  function move(x, y) {
    d.ghost.style.transform = `translate(${x - d.startX}px, ${y - d.startY}px) scale(1.08) rotate(-3deg)`;
    const target = cellAt(x, y);
    const next = target && target !== d.cell ? target : null;
    if (next !== d.target) {
      d.target?.classList.remove("drop-target");
      next?.classList.add("drop-target");
      d.target = next;
    }
  }

  function finish(commit) {
    if (!d) return;
    clearTimeout(d.timer);
    const { active, cell, target, ghost } = d;
    d = null;
    grid.classList.remove("drag-active");
    cell.classList.remove("dragging");
    target?.classList.remove("drop-target");
    ghost?.remove();
    if (active) {
      // Der Klick nach dem Loslassen soll keinen Eingabedialog öffnen
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 50);
      if (commit && target) onSwap(Number(cell.dataset.i), Number(target.dataset.i));
    }
  }

  grid.addEventListener("pointerdown", (e) => {
    if (d || e.button > 0 || !canDrag()) return;
    const cell = e.target.closest(".cell");
    if (!cell || cell.disabled) return;
    const touch = e.pointerType !== "mouse";
    d = {
      cell, pointerId: e.pointerId, touch, active: false, target: null,
      startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY,
    };
    if (touch) d.timer = setTimeout(() => { if (d && !d.active) begin(); }, LONG_PRESS_MS);
  });

  window.addEventListener("pointermove", (e) => {
    if (!d || e.pointerId !== d.pointerId) return;
    d.lastX = e.clientX;
    d.lastY = e.clientY;
    if (!d.active) {
      if (Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < MOVE_TOLERANCE) return;
      if (d.touch) return finish(false); // vor dem Gedrückthalten bewegt: der Nutzer will scrollen
      begin();
    }
    move(e.clientX, e.clientY);
  });

  // Während des Ziehens auf dem Handy nicht scrollen
  grid.addEventListener("touchmove", (e) => { if (d?.active) e.preventDefault(); }, { passive: false });
  // Langes Drücken soll kein Kontextmenü öffnen
  grid.addEventListener("contextmenu", (e) => { if (d) e.preventDefault(); });

  window.addEventListener("pointerup", (e) => { if (d && e.pointerId === d.pointerId) finish(true); });
  window.addEventListener("pointercancel", (e) => { if (d && e.pointerId === d.pointerId) finish(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && d) finish(false); });

  return { wasDrag: () => suppressClick };
}

// ---------- Schnee ----------

export function startSnow() {
  if (reducedMotion()) return;
  const canvas = document.createElement("canvas");
  canvas.className = "snow";
  canvas.setAttribute("aria-hidden", "true");
  document.body.prepend(canvas);
  const ctx = canvas.getContext("2d");
  let w = 0, h = 0, flakes = [];
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(Math.min(110, (w * h) / 9000));
    flakes = Array.from({ length: count }, () => newFlake(true));
  }
  function newFlake(anywhere) {
    const r = Math.random() * 2.4 + 0.8;
    return {
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : -10,
      r,
      vy: r * 0.28 + Math.random() * 0.3,
      phase: Math.random() * Math.PI * 2,
      sway: Math.random() * 0.6 + 0.2,
      alpha: Math.random() * 0.5 + 0.35,
    };
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(3, (now - last) / 16.7);
    last = now;
    ctx.clearRect(0, 0, w, h);
    for (const f of flakes) {
      f.phase += 0.012 * dt;
      f.y += f.vy * dt;
      f.x += Math.sin(f.phase) * f.sway * 0.5 * dt;
      if (f.y > h + 10) Object.assign(f, newFlake(false));
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${f.alpha})`;
      ctx.fill();
    }
    if (!document.hidden) requestAnimationFrame(frame);
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) { last = performance.now(); requestAnimationFrame(frame); }
  });
  window.addEventListener("resize", resize);
  resize();
  requestAnimationFrame(frame);
}

// ---------- Konfetti ----------

export function confetti() {
  if (reducedMotion()) return;
  const canvas = document.createElement("canvas");
  canvas.className = "confetti";
  document.body.append(canvas);
  const ctx = canvas.getContext("2d");
  const w = canvas.width = window.innerWidth;
  const h = canvas.height = window.innerHeight;
  const colors = ["#e63946", "#f5c518", "#2f9e5b", "#ffffff", "#ffd6a5"];
  const parts = Array.from({ length: 160 }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.3,
    y: h * 0.35,
    vx: (Math.random() - 0.5) * 16,
    vy: Math.random() * -16 - 4,
    size: Math.random() * 7 + 4,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    color: colors[Math.floor(Math.random() * colors.length)],
    star: Math.random() < 0.25,
  }));
  const start = performance.now();
  function frame(now) {
    const t = now - start;
    ctx.clearRect(0, 0, w, h);
    for (const p of parts) {
      p.vy += 0.35;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / 3200);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.star) {
        ctx.font = `${p.size * 2.2}px serif`;
        ctx.fillText("★", 0, 0);
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    }
    if (t < 3200) requestAnimationFrame(frame);
    else canvas.remove();
  }
  requestAnimationFrame(frame);
}

// ---------- Overlays ----------

export function openOverlay(el) {
  clearTimeout(el._closeTimer);
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add("open");
}

export function closeOverlay(el) {
  el.classList.remove("open");
  clearTimeout(el._closeTimer);
  el._closeTimer = setTimeout(() => { el.hidden = true; }, reducedMotion() ? 0 : 260);
}

// ---------- Mini-Felder ----------

export function miniGridHtml(score, drawn) {
  const onLine = new Set(score.lines.flat());
  return `<div class="grid mini">${score.cells.map((c, i) => {
    const cls = ["cell"];
    if (!c.trim()) cls.push("empty");
    if (score.mask[i]) cls.push("hit");
    if (onLine.has(i)) cls.push("line");
    const day = score.mask[i] ? drawn.get(normalize(c)) : null;
    return `<div class="${cls.join(" ")}" title="${escapeHtml(c)}${day ? ` – ${day}. Dezember` : ""}"><span>${escapeHtml(c) || "·"}</span></div>`;
  }).join("")}</div>`;
}

// ---------- Adventskalender ----------

/**
 * @param days Map Tag → Wörter
 * @param boards alle Felder
 * @param myCells (optional) eigene Wörter, um eigene Treffer hervorzuheben
 * @param songs  (optional) (n) => { picked, random } – Lieder des Abends
 */
export function calendarHtml(days, boards, { myCells = [], admin = false, songs = () => null } = {}) {
  const mine = new Set(myCells.map(normalize).filter(Boolean));
  return dayNumbers().map((n, idx) => {
    const words = days.get(n) ?? [];
    const open = admin || isDayOpen(n);
    const cls = ["door"];
    if (!open) cls.push("closed");
    if (words.length) cls.push("filled");
    if (isToday(n)) cls.push("today");
    const iHave = words.some((w) => mine.has(normalize(w)));
    if (iHave) cls.push("mine");
    const hitters = new Set();
    for (const w of words) for (const b of boardsWith(boards, w)) hitters.add(b.id);
    const shown = words.slice(0, 3).map(escapeHtml).join("<br>");
    const more = words.length > 3 ? `<small>+${words.length - 3} weitere</small>` : "";
    const s = songs(n);
    const songCount = s ? s.picked.length + s.random.length : 0;
    const songTitles = s ? [...s.picked.map((p) => p.title), ...s.random] : [];
    return `<button type="button" class="${cls.join(" ")}" data-day="${n}" style="--i:${idx}"
        aria-label="${n}. Dezember${words.length ? ": " + escapeHtml(words.join(", ")) : ""}${songCount ? `, Lieder: ${escapeHtml(songTitles.join(", "))}` : ""}">
      <span class="door-num">${n}</span>
      ${words.length ? `<span class="door-words">${shown}${more}</span>`
        : `<span class="door-empty">${open ? "＋" : "❄"}</span>`}
      ${hitters.size ? `<span class="door-hits" title="So viele Spieler haben ein Wort von diesem Tag">🎯 ${hitters.size}</span>` : ""}
      ${songCount ? `<span class="door-songs" title="${escapeHtml(songTitles.join(" · "))}">🎶 ${songCount}</span>` : ""}
      ${iHave ? `<span class="door-star" title="Steht in deinem Feld">★</span>` : ""}
    </button>`;
  }).join("");
}

// ---------- Dialog: Wörter eines Tages ----------

/**
 * @param opts.getBoards  () => alle Felder
 * @param opts.getDays    () => Map Tag → Wörter
 * @param opts.getMeta    (n) => { updatedBy } oder null
 * @param opts.onSave     async (n, words) => boolean
 * @param opts.getSongs   (n) => { picked, random } oder null – Lieder des Abends
 * @param opts.onOpenSongs (n) => void – zum Lieder-Reiter wechseln
 */
export function createDayEditor({ getBoards, getDays, getMeta = () => null, onSave, getSongs = () => null, onOpenSongs = null }) {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <form class="dialog day-dialog" autocomplete="off" role="dialog" aria-modal="true" aria-labelledby="dd-title">
      <div class="dd-head">
        <span class="dd-num" id="dd-num"></span>
        <div>
          <h2 id="dd-title">Tag</h2>
          <p class="dd-meta" id="dd-meta"></p>
        </div>
      </div>
      <ul class="dd-words" id="dd-words"></ul>
      <div id="dd-edit">
        <div class="row add-row">
          <input id="dd-input" type="text" maxlength="${MAX_WORD_LENGTH}" enterkeyhint="enter"
                 placeholder="Wort eintragen …" aria-label="Neues Wort">
          <button type="button" class="btn primary round" id="dd-add" aria-label="Wort hinzufügen">＋</button>
        </div>
        <p class="hint" id="dd-hint">Mehrere Wörter möglich, z. B. „Nikolaus“ und „Weihnachtsmann“. Jedes zählt als Treffer.</p>
      </div>
      <p class="dd-note" id="dd-note" hidden></p>
      <div class="dd-songs" id="dd-songs" hidden></div>
      <div class="buttons">
        <button type="button" class="btn ghost" id="dd-cancel">Abbrechen</button>
        <button type="submit" class="btn primary" id="dd-save">Speichern</button>
      </div>
    </form>`;
  document.body.append(overlay);

  const q = (sel) => overlay.querySelector(sel);
  const input = q("#dd-input");
  const st = { day: null, words: [], canEdit: false, dirty: false };

  function renderWords() {
    const boards = getBoards();
    q("#dd-words").innerHTML = st.words.length === 0
      ? `<li class="dd-empty">${st.canEdit ? "Noch kein Wort eingetragen." : "Für diesen Tag gibt es noch kein Wort."}</li>`
      : st.words.map((w, i) => {
          const who = boardsWith(boards, w).map((b) => escapeHtml(b.name));
          return `<li class="dw" style="--i:${i}">
            <span class="dw-word">${escapeHtml(w)}</span>
            <span class="dw-who">${who.length ? "🎯 " + who.join(", ") : "bei niemandem"}</span>
            ${st.canEdit ? `<span class="dw-actions">
              <button type="button" class="icon-btn" data-edit="${i}" aria-label="${escapeHtml(w)} bearbeiten">✎</button>
              <button type="button" class="icon-btn danger" data-del="${i}" aria-label="${escapeHtml(w)} entfernen">✕</button>
            </span>` : ""}
          </li>`;
        }).join("");
  }

  function renderSongs() {
    const box = q("#dd-songs");
    const s = st.day !== null ? getSongs(st.day) : null;
    box.hidden = !s;
    if (!s) return;
    const rows = [
      ...s.picked.map((p) => `<li class="song picked"><span class="song-title">${escapeHtml(p.title)}</span>
        <span class="song-tag">👤 ${escapeHtml(p.by || "Spieler")}</span></li>`),
      ...s.random.map((t) => `<li class="song random"><span class="song-title">${escapeHtml(t)}</span>
        <span class="song-tag">🎲 Zufall</span></li>`),
    ];
    box.innerHTML = `<h3>🎶 Lieder des Abends</h3>
      <ul class="song-list">${rows.join("") || `<li class="song free">Noch keine Lieder ausgesucht.</li>`}</ul>
      ${onOpenSongs ? `<button type="button" class="btn small ghost" id="dd-to-songs">Lieder aussuchen ›</button>` : ""}`;
  }

  function updateHint() {
    const word = input.value;
    const hint = q("#dd-hint");
    if (!normalize(word)) {
      hint.innerHTML = "Mehrere Wörter möglich, z. B. „Nikolaus“ und „Weihnachtsmann“. Jedes zählt als Treffer.";
      return;
    }
    const boards = getBoards();
    const parts = [];
    const otherDay = drawnMap(getDays()).get(normalize(word));
    if (otherDay && otherDay !== st.day) parts.push(`⚠️ War schon am ${otherDay}. Dezember dran.`);
    const exact = boardsWith(boards, word);
    parts.push(exact.length
      ? `🎯 Steht bei: <strong>${exact.map((b) => escapeHtml(b.name)).join(", ")}</strong>`
      : "Steht bei niemandem genau so im Feld.");
    const similar = similarEntries(boards, word);
    if (similar.length) {
      parts.push("Ähnlich: " + similar.slice(0, 6).map((s) => `${escapeHtml(s.name)} („${escapeHtml(s.word)}“)`).join(", "));
    }
    hint.innerHTML = parts.join("<br>");
  }

  function addFromInput() {
    const word = cleanWord(input.value);
    if (!word) return false;
    if (st.words.some((w) => normalize(w) === normalize(word))) {
      toast("Dieses Wort steht schon in der Liste.");
      return false;
    }
    if (st.words.length >= MAX_WORDS_PER_DAY) {
      toast(`Höchstens ${MAX_WORDS_PER_DAY} Wörter pro Tag.`);
      return false;
    }
    st.words.push(word);
    st.dirty = true;
    input.value = "";
    updateHint();
    renderWords();
    input.focus();
    return true;
  }

  function open(n, { canEdit, note = "" }) {
    st.day = n;
    st.words = [...(getDays().get(n) ?? [])];
    st.canEdit = canEdit;
    st.dirty = false;
    q("#dd-num").textContent = n;
    q("#dd-title").textContent = dayLabel(n);
    const meta = getMeta(n);
    q("#dd-meta").textContent = meta?.updatedBy ? `Zuletzt eingetragen von ${meta.updatedBy}` : "";
    q("#dd-edit").hidden = !canEdit;
    q("#dd-save").hidden = !canEdit;
    q("#dd-cancel").textContent = canEdit ? "Abbrechen" : "Schließen";
    q("#dd-note").hidden = !note;
    q("#dd-note").textContent = note;
    input.value = "";
    updateHint();
    renderWords();
    renderSongs();
    openOverlay(overlay);
    if (canEdit && !st.words.length) setTimeout(() => input.focus(), 60);
  }

  function close() {
    st.day = null;
    closeOverlay(overlay);
  }

  q("#dd-words").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.del) {
      const li = b.closest("li");
      li.classList.add("leaving");
      setTimeout(() => {
        st.words.splice(Number(b.dataset.del), 1);
        st.dirty = true;
        renderWords();
      }, reducedMotion() ? 0 : 200);
    } else if (b.dataset.edit) {
      const i = Number(b.dataset.edit);
      if (normalize(input.value)) addFromInput();
      input.value = st.words[i];
      st.words.splice(i, 1);
      st.dirty = true;
      renderWords();
      updateHint();
      input.focus();
      input.select();
    }
  });

  q("#dd-songs").addEventListener("click", (e) => {
    if (!e.target.closest("#dd-to-songs")) return;
    if (st.dirty && st.canEdit && !confirm("Änderungen verwerfen?")) return;
    const n = st.day;
    close();
    onOpenSongs(n);
  });

  input.addEventListener("input", updateHint);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addFromInput();
    }
  });
  q("#dd-add").addEventListener("click", addFromInput);

  q("form").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!st.canEdit) return close();
    if (normalize(input.value)) addFromInput(); // nicht vergessen, was noch im Feld steht
    const day = st.day;
    const btn = q("#dd-save");
    btn.disabled = true;
    const ok = await onSave(day, [...st.words]);
    btn.disabled = false;
    if (ok) close();
  });

  q("#dd-cancel").addEventListener("click", () => {
    if (st.dirty && st.canEdit && !confirm("Änderungen verwerfen?")) return;
    close();
  });
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay && !(st.dirty && st.canEdit)) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlay.hidden && !(st.dirty && st.canEdit)) close();
  });

  return { open, close, isOpen: () => st.day !== null, refresh: () => { if (st.day !== null) { renderWords(); renderSongs(); } } };
}

