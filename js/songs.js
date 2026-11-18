// Weihnachtslieder: Liederpool und bis zu 3 Lieder pro Adventsabend.
// Wird von Spieler- und Spielleiter-Seite gemeinsam benutzt.
//
//   songs/{songId}    { title, addedBy }               Liederpool, ID = songId(title)
//   songDays/{1..24}  { picked, random, updatedAt }    picked: [{ title, by }] von Spielern gewählt
//                                                       random: [title] zufällig aufgefüllt

import {
  doc, collection, onSnapshot, setDoc, deleteDoc, runTransaction, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db } from "./firebase.js";
import {
  SONGS_PER_DAY, MAX_SONG_LENGTH, SEASON_YEAR, cleanSong, songId, songDayOf, pickRandomSongs,
  dayNumbers, dayLabel, isToday, escapeHtml,
} from "./bingo.js";
import { toast } from "./ui.js";

/** Startbestand des Liederpools (wird einmalig von der Spielleiter-Seite angelegt). */
export const DEFAULT_SONGS = [
  "Alle Jahre wieder",
  "Am Weihnachtsbaume die Lichter brennen",
  "Der Christbaum ist der schönste Baum",
  "Engel auf den Feldern singen",
  "Es ist ein Ros entsprungen",
  "Es ist für uns eine Zeit angekommen",
  "Es kommt ein Schiff, geladen",
  "Fröhliche Weihnacht überall",
  "Herbei, o ihr Gläub'gen",
  "Ich steh an deiner Krippen hier",
  "Ihr Kinderlein, kommet",
  "In der Weihnachtsbäckerei",
  "Josef, lieber Josef mein",
  "Kling, Glöckchen, klingelingeling",
  "Kommet, ihr Hirten",
  "Lasst uns froh und munter sein",
  "Leise rieselt der Schnee",
  "Lobt Gott, ihr Christen alle gleich",
  "Macht hoch die Tür",
  "Maria durch ein Dornwald ging",
  "Morgen, Kinder, wird's was geben",
  "Morgen kommt der Weihnachtsmann",
  "O du fröhliche",
  "O Heiland, reiß die Himmel auf",
  "O Tannenbaum",
  "Schneeflöckchen, Weißröckchen",
  "Sind die Lichter angezündet",
  "Still, still, still, weil's Kindlein schlafen will",
  "Stille Nacht, heilige Nacht",
  "Süßer die Glocken nie klingen",
  "Tochter Zion, freue dich",
  "Tragt in die Welt nun ein Licht",
  "Vom Himmel hoch, da komm ich her",
  "Wir sagen euch an den lieben Advent",
  "Zu Bethlehem geboren",
];

/** Startbestand in einen Batch schreiben. */
export function addDefaultSongs(batch) {
  for (const title of DEFAULT_SONGS) {
    batch.set(doc(db, "songs", songId(title)), { title, addedBy: "Spielleitung" });
  }
}

/** Fehler mit Text für den Nutzer. */
class SongError extends Error {}

/** Tag, der beim Öffnen ausgewählt ist: heute, sonst der 1. bzw. 24. Dezember. */
function initialDay(now = new Date()) {
  const today = dayNumbers().find((n) => isToday(n, now));
  if (today) return today;
  return now > new Date(SEASON_YEAR, 11, 24) ? 24 : 1;
}

/**
 * Reiter „Lieder“.
 * @param opts.root     Element, in das gezeichnet wird
 * @param opts.admin    Spielleitung: darf Lieder aus Pool und Tagen entfernen
 * @param opts.getUser  () => { name, canEdit, note } – wer gerade schreibt und ob er darf
 * @param opts.onChange () => void – nach jedem Update der Lieder (z. B. Kalender neu zeichnen)
 */
export function createSongsView({ root, admin = false, getUser, onChange = () => {} }) {
  const st = {
    pool: null,          // [{ id, title, addedBy }]
    days: null,          // Map Tag → { picked, random }
    day: initialDay(),
    busy: false,
    listKey: "",
  };

  root.innerHTML = `
    <p class="intro-text">Jeden Abend singen wir bis zu ${SONGS_PER_DAY} Weihnachtslieder 🎶</p>
    <section class="card songs-card">
      <div class="song-days" data-days></div>
      <div class="dd-head">
        <span class="dd-num" data-num></span>
        <div>
          <h2 data-title></h2>
          <p class="dd-meta" data-meta></p>
        </div>
      </div>
      <ol class="song-list" data-list></ol>
      <div data-edit>
        <div class="row add-row">
          <select data-select aria-label="Lied aussuchen"></select>
          <button type="button" class="btn primary round" data-add aria-label="Lied hinzufügen">＋</button>
        </div>
        <button type="button" class="btn block" data-random></button>
        <p class="hint">Selbst ausgesuchte Lieder bleiben fest. Zufallslieder werden ersetzt, wenn jemand ein Lied aussucht.</p>
      </div>
      <p class="dd-note" data-note hidden></p>
    </section>
    <section class="card">
      <h2>📖 Liederpool <span class="tag" data-count></span></h2>
      <p class="muted pool-text">Aus diesen Liedern wird zufällig gezogen.</p>
      <form class="row add-row" data-pool-form autocomplete="off">
        <input type="text" data-pool-input maxlength="${MAX_SONG_LENGTH}" enterkeyhint="done"
               placeholder="Neues Lied …" aria-label="Neues Lied für den Pool">
        <button type="submit" class="btn primary round" aria-label="Lied in den Pool aufnehmen">＋</button>
      </form>
      <ul class="song-chips" data-pool></ul>
    </section>`;

  const q = (sel) => root.querySelector(sel);
  const user = () => getUser() ?? { name: "", canEdit: false, note: "" };
  const poolTitles = () => (st.pool ?? []).map((s) => s.title);
  const dayOf = (n) => st.days?.get(n) ?? { picked: [], random: [] };

  // ---------- Daten ----------

  function start() {
    const offPool = onSnapshot(collection(db, "songs"), (s) => {
      st.pool = s.docs.map((d) => ({ id: d.id, title: String(d.data().title ?? ""), addedBy: String(d.data().addedBy ?? "") }))
        .filter((x) => x.title.trim())
        .sort((a, b) => a.title.localeCompare(b.title, "de"));
      render();
      onChange();
    }, onError);
    const offDays = onSnapshot(collection(db, "songDays"), (s) => {
      st.days = new Map(s.docs.map((d) => [Number(d.id), songDayOf(d.data())]));
      render();
      onChange();
    }, onError);
    return () => { offPool(); offDays(); };
  }

  function onError(err) {
    console.error("Lieder:", err);
    q("[data-note]").hidden = false;
    q("[data-note]").textContent = "Die Lieder konnten nicht geladen werden. Sind die neuen Regeln veröffentlicht?";
  }

  /** Wie oft ein Lied an anderen Tagen schon dran ist (damit der Zufall Abwechslung bringt). */
  function usedElsewhere(n) {
    const count = new Map();
    for (const [d, s] of st.days ?? []) {
      if (d === n) continue;
      for (const t of [...s.picked.map((p) => p.title), ...s.random]) {
        const id = songId(t);
        count.set(id, (count.get(id) ?? 0) + 1);
      }
    }
    return count;
  }

  /** Lieder eines Tages ändern – in einer Transaktion, damit gleichzeitige Änderungen nichts überschreiben. */
  async function changeDay(n, fn, successText) {
    if (st.busy) return;
    st.busy = true;
    render();
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, "songDays", String(n));
        const cur = songDayOf((await tx.get(ref)).data());
        const next = fn(cur);
        tx.set(ref, { picked: next.picked, random: next.random, updatedAt: serverTimestamp() });
      });
      if (successText) toast(successText);
    } catch (err) {
      if (err instanceof SongError) toast(err.message, 5000);
      else {
        console.error(err);
        toast("Speichern hat nicht geklappt. Bitte nochmal versuchen.");
      }
    } finally {
      st.busy = false;
      render();
    }
  }

  function addToDay(title) {
    const name = user().name;
    const id = songId(title);
    changeDay(st.day, (cur) => {
      if (cur.picked.some((p) => songId(p.title) === id)) throw new SongError("Das Lied ist an diesem Abend schon ausgesucht.");
      if (cur.picked.length >= SONGS_PER_DAY) throw new SongError(`An diesem Abend sind schon ${SONGS_PER_DAY} Lieder ausgesucht.`);
      const picked = [...cur.picked, { title, by: name }];
      // Ein Zufallslied mit demselben Titel wird zum ausgesuchten, sonst fliegt das letzte Zufallslied raus
      let random = cur.random.filter((t) => songId(t) !== id);
      random = random.slice(0, Math.max(0, SONGS_PER_DAY - picked.length));
      return { picked, random };
    }, `🎶 „${title}“ ausgesucht.`);
  }

  function fillRandom() {
    const n = st.day;
    const pool = poolTitles();
    const used = usedElsewhere(n);
    changeDay(n, (cur) => {
      const free = SONGS_PER_DAY - cur.picked.length;
      if (free <= 0) throw new SongError("Alle Plätze sind schon mit ausgesuchten Liedern belegt.");
      const random = pickRandomSongs(pool, free, {
        exclude: cur.picked.map((p) => p.title), previous: cur.random, usedCount: used,
      });
      if (!random.length) throw new SongError("Im Liederpool ist kein passendes Lied mehr.");
      return { picked: cur.picked, random };
    }, "🎲 Zufallslieder gezogen.");
  }

  function removeFromDay(kind, title) {
    const id = songId(title);
    changeDay(st.day, (cur) => ({
      picked: kind === "picked" ? cur.picked.filter((p) => songId(p.title) !== id) : cur.picked,
      random: kind === "random" ? cur.random.filter((t) => songId(t) !== id) : cur.random,
    }), `„${title}“ entfernt.`);
  }

  async function addToPool(raw) {
    const title = cleanSong(raw);
    const id = songId(title);
    if (!id) return false;
    const existing = st.pool?.find((s) => s.id === id);
    if (existing) {
      toast(`„${existing.title}“ ist schon im Liederpool.`);
      return false;
    }
    try {
      await setDoc(doc(db, "songs", id), { title, addedBy: user().name });
      toast(`📖 „${title}“ ist jetzt im Liederpool.`);
      return true;
    } catch (err) {
      console.error(err);
      toast("Das Lied konnte nicht gespeichert werden.");
      return false;
    }
  }

  async function removeFromPool(id) {
    const song = st.pool?.find((s) => s.id === id);
    if (!song || !confirm(`„${song.title}“ aus dem Liederpool entfernen? An Abenden, an denen es schon steht, bleibt es stehen.`)) return;
    try {
      await deleteDoc(doc(db, "songs", id));
      toast(`„${song.title}“ entfernt.`);
    } catch (err) {
      console.error(err);
      toast("Entfernen hat nicht geklappt: " + err.message, 6000);
    }
  }

  // ---------- Anzeige ----------

  function render() {
    if (!st.pool || !st.days) return;
    const u = user();
    const n = st.day;
    const { picked, random } = dayOf(n);

    // Tagesleiste
    q("[data-days]").innerHTML = dayNumbers().map((d) => {
      const s = dayOf(d);
      const count = s.picked.length + s.random.length;
      const cls = ["sday"];
      if (d === n) cls.push("active");
      if (isToday(d)) cls.push("today");
      if (count) cls.push("has");
      return `<button type="button" class="${cls.join(" ")}" data-day="${d}" aria-pressed="${d === n}"
          aria-label="${d}. Dezember, ${count} von ${SONGS_PER_DAY} Liedern">
        <span>${d}</span><small>${"♪".repeat(count) || "·"}</small></button>`;
    }).join("");

    // Kopf
    q("[data-num]").textContent = n;
    q("[data-title]").textContent = dayLabel(n);
    const total = picked.length + random.length;
    q("[data-meta]").textContent = `${isToday(n) ? "Heute · " : ""}${total} von ${SONGS_PER_DAY} Liedern`;

    // Liederliste (nur neu zeichnen, wenn sich etwas geändert hat – sonst hüpfen die Einträge bei jedem Update)
    const key = JSON.stringify([n, picked, random, admin && u.canEdit]);
    if (key !== st.listKey) {
      st.listKey = key;
      const item = (kind, title, tag, i) => `<li class="song ${kind}" style="--i:${i}">
          <span class="song-title">${escapeHtml(title)}</span>
          <span class="song-tag">${tag}</span>
          ${admin ? `<button type="button" class="icon-btn danger" data-remove="${kind}" data-title="${escapeHtml(title)}"
            aria-label="${escapeHtml(title)} entfernen">✕</button>` : ""}
        </li>`;
      const rows = [
        ...picked.map((p, i) => item("picked", p.title, `👤 ${escapeHtml(p.by || "Spieler")}`, i)),
        ...random.map((t, i) => item("random", t, "🎲 Zufall", picked.length + i)),
      ];
      for (let i = total; i < SONGS_PER_DAY; i++) rows.push(`<li class="song free" style="--i:${i}">♪ freier Platz</li>`);
      q("[data-list]").innerHTML = rows.join("");
    }

    // Bearbeiten
    q("[data-edit]").hidden = !u.canEdit;
    q("[data-note]").hidden = !u.note;
    q("[data-note]").textContent = u.note ?? "";
    if (u.canEdit) {
      const select = q("[data-select]");
      const chosen = select.value;
      const pickedIds = new Set(picked.map((p) => songId(p.title)));
      const full = picked.length >= SONGS_PER_DAY;
      select.innerHTML = `<option value="">${full ? "Alle Plätze ausgesucht" : "Lied aussuchen …"}</option>` + st.pool
        .map((s) => `<option value="${escapeHtml(s.id)}"${pickedIds.has(s.id) ? " disabled" : ""}>${escapeHtml(s.title)}</option>`)
        .join("");
      if (chosen && !pickedIds.has(chosen) && st.pool.some((s) => s.id === chosen)) select.value = chosen;
      select.disabled = full || st.busy;
      q("[data-add]").disabled = full || st.busy;

      const rnd = q("[data-random]");
      rnd.hidden = full;
      rnd.disabled = st.busy;
      rnd.textContent = random.length ? "🎲 Zufallslieder neu würfeln" : "🎲 Mit Zufallsliedern auffüllen";
    }

    // Pool
    q("[data-count]").textContent = st.pool.length;
    q("[data-pool-form]").hidden = !u.canEdit;
    q(".pool-text").textContent = u.canEdit
      ? "Aus diesen Liedern wird zufällig gezogen. Fehlt eins? Einfach ergänzen."
      : "Aus diesen Liedern wird zufällig gezogen.";
    q("[data-pool]").innerHTML = st.pool.length
      ? st.pool.map((s) => `<li class="song-chip" title="${s.addedBy ? `Ergänzt von ${escapeHtml(s.addedBy)}` : ""}">
          <span>${escapeHtml(s.title)}</span>
          ${admin ? `<button type="button" class="chip-x" data-unpool="${escapeHtml(s.id)}" aria-label="${escapeHtml(s.title)} aus dem Pool entfernen">✕</button>` : ""}
        </li>`).join("")
      : `<li class="dd-empty">Der Liederpool ist leer.</li>`;
  }

  // ---------- Ereignisse ----------

  root.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b || b.disabled) return;
    if (b.dataset.day) {
      st.day = Number(b.dataset.day);
      render();
    } else if (b.hasAttribute("data-add")) {
      const song = st.pool?.find((s) => s.id === q("[data-select]").value);
      if (!song) return toast("Bitte erst ein Lied aussuchen.");
      addToDay(song.title);
    } else if (b.hasAttribute("data-random")) {
      fillRandom();
    } else if (b.dataset.remove) {
      if (confirm(`„${b.dataset.title}“ von diesem Abend entfernen?`)) removeFromDay(b.dataset.remove, b.dataset.title);
    } else if (b.dataset.unpool) {
      removeFromPool(b.dataset.unpool);
    }
  });

  q("[data-pool-form]").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = q("[data-pool-input]");
    if (await addToPool(input.value)) input.value = "";
  });

  return {
    start,
    refresh: render,
    /** Lieder eines Abends ({ picked, random }) oder null, solange noch nichts geladen ist. */
    getDay: (n) => (st.days ? dayOf(n) : null),
    /** Abend auswählen (z. B. aus dem Kalender heraus). */
    showDay: (n) => { st.day = n; render(); },
  };
}
