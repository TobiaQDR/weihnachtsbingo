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
export { storageGet, storageSet };

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

/** Tab-Leiste mit gleitendem Indikator. Merkt sich den zuletzt offenen Tab. */
export function initTabs(nav, storageKey, onChange = () => {}) {
  const buttons = [...nav.querySelectorAll("[data-tab]")];
  nav.style.setProperty("--count", buttons.length);
  const views = new Map(buttons.map((b) => [b.dataset.tab, document.querySelector(`[data-view="${b.dataset.tab}"]`)]));

  function show(name, animate = true) {
    const idx = Math.max(0, buttons.findIndex((b) => b.dataset.tab === name));
    name = buttons[idx].dataset.tab;
    nav.style.setProperty("--idx", idx);
    buttons.forEach((b, i) => {
      b.classList.toggle("active", i === idx);
      b.setAttribute("aria-selected", String(i === idx));
    });
    for (const [key, view] of views) {
      const active = key === name;
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
    onChange(name);
  }

  nav.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (b) show(b.dataset.tab);
  });

  show(storageGet(storageKey) || buttons[0].dataset.tab, false);
  return { show };
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
 */
export function calendarHtml(days, boards, { myCells = [], admin = false } = {}) {
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
    return `<button type="button" class="${cls.join(" ")}" data-day="${n}" style="--i:${idx}"
        aria-label="${n}. Dezember${words.length ? ": " + escapeHtml(words.join(", ")) : ""}">
      <span class="door-num">${n}</span>
      ${words.length ? `<span class="door-words">${shown}${more}</span>`
        : `<span class="door-empty">${open ? "＋" : "❄"}</span>`}
      ${hitters.size ? `<span class="door-hits" title="So viele Spieler haben ein Wort von diesem Tag">🎯 ${hitters.size}</span>` : ""}
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
 */
export function createDayEditor({ getBoards, getDays, getMeta = () => null, onSave }) {
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

  return { open, close, isOpen: () => st.day !== null, refresh: () => { if (st.day !== null) renderWords(); } };
}

