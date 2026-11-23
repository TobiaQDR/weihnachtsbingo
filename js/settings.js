// Reiter „Spiel“: Einstellungen für die Spielleitung (wer das Spiel erstellt hat).
// Sperre, Spielname, Lieder an/aus, Einladungs- und Zuschauer-Link, Spieler verwalten,
// zurücksetzen und löschen.
//
//   games/{g}                 { name, owner, ownerName, locked, songsEnabled, songsSeeded, createdAt }
//   games/{g}/private/invite  { code, open }   nur die Spielleitung liest ihn

import {
  doc, collection, onSnapshot, getDocs, updateDoc, writeBatch, arrayRemove,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { db } from "./firebase.js";
import {
  CELL_COUNT, MAX_GAME_NAME_LENGTH, cleanName, canAddWords, drawnMap, ranking, randomId, escapeHtml, emptyCells,
  songsEnabled,
} from "./bingo.js";
import { toast, miniGridHtml, openOverlay, closeOverlay, copyText } from "./ui.js";

/** Einladungslink eines Spiels. */
export function inviteLink(gameId, code) {
  const url = new URL("index.html", location.href);
  url.search = new URLSearchParams({ spiel: gameId, einladung: code }).toString();
  return url.toString();
}

/** Zuschauer-Link: öffnet das Spiel direkt als Gast, ohne Konto und ohne Beitreten. */
export function watchLink(gameId) {
  const url = new URL("index.html", location.href);
  url.search = new URLSearchParams({ spiel: gameId, zuschauen: "1" }).toString();
  return url.toString();
}

/**
 * @param opts.root       Element, in das gezeichnet wird
 * @param opts.getCtx     () => { gameId, game, boards, days, uid }
 * @param opts.onDeleted  () => void – nach dem Löschen des Spiels
 * @param opts.onSongsOn  () => void – Lieder wurden eingeschaltet (z. B. Liederpool füllen)
 */
export function createSettingsView({ root, getCtx, onDeleted, onSongsOn = () => {} }) {
  const st = { invite: null, openGrids: new Set(), busy: false };

  root.innerHTML = `
    <section class="card lock-card" data-lock-card>
      <div class="lock-row">
        <span class="lock-icon" data-lock-icon aria-hidden="true">✏️</span>
        <div class="lock-text">
          <strong data-lock-title>Felder offen</strong>
          <span class="muted" data-lock-sub></span>
        </div>
        <label class="switch big" title="Felder sperren / entsperren">
          <input type="checkbox" data-lock aria-label="Felder sperren">
          <span></span>
        </label>
      </div>
    </section>

    <section class="card">
      <h2>Spielname</h2>
      <form class="row" data-name-form autocomplete="off">
        <input type="text" data-name maxlength="${MAX_GAME_NAME_LENGTH}" aria-label="Spielname" enterkeyhint="done">
        <button type="submit" class="btn primary">Speichern</button>
      </form>
      <label class="perm">
        <span>🎶 Weihnachtslieder für jeden Abend
          <small class="muted perm-sub">Ausgeschaltet verschwindet der Reiter „Lieder“. Schon ausgesuchte Lieder bleiben gespeichert.</small></span>
        <span class="switch"><input type="checkbox" data-songs-on aria-label="Weihnachtslieder"><span></span></span>
      </label>
    </section>

    <section class="card">
      <h2>Einladungslink</h2>
      <p class="muted">Wer diesen Link öffnet, kann mit seinem Konto beitreten oder als Gast zuschauen. Du kannst ihn einfach in die Familiengruppe schicken.</p>
      <input type="text" data-invite-link readonly aria-label="Einladungslink" value="Wird geladen …">
      <div class="row wrap-row actions">
        <button type="button" class="btn small" data-invite-copy>🔗 Link kopieren</button>
        <a class="btn small" data-invite-wa target="_blank" rel="noopener">💬 WhatsApp</a>
        <button type="button" class="btn small ghost danger" data-invite-renew>Neuen Link erzeugen</button>
      </div>
      <label class="perm">
        <span>Neue Spieler dürfen beitreten</span>
        <span class="switch"><input type="checkbox" data-invite-open><span></span></span>
      </label>
      <h2 class="watch-link">Zuschauer-Link</h2>
      <p class="muted">Damit kann man ohne Konto zuschauen (alle Felder, Rangliste, Kalender), aber nicht beitreten.
        Praktisch für Verwandte, die nur mitfiebern wollen.</p>
      <input type="text" data-watch-link readonly aria-label="Zuschauer-Link">
      <div class="row wrap-row actions">
        <button type="button" class="btn small" data-watch-copy>🔗 Link kopieren</button>
        <a class="btn small" data-watch-wa target="_blank" rel="noopener">💬 WhatsApp</a>
      </div>
    </section>

    <p class="intro-text">👥 Spieler</p>
    <div class="boards" data-players></div>

    <section class="card danger-card">
      <h2>Spiel zurücksetzen</h2>
      <p class="muted">Entfernt alle anderen Spieler mit ihren Feldern und die Lieder aller Abende. Dein Feld wird geleert. Liederpool und Einladungslink bleiben.</p>
      <button type="button" class="btn ghost danger block" data-reset-open>🗑️ Spiel zurücksetzen …</button>
      <h2 class="danger-gap">Spiel löschen</h2>
      <p class="muted">Löscht das ganze Spiel mit allen Feldern, Wörtern und Liedern.</p>
      <button type="button" class="btn ghost danger block" data-delete-open>❌ Spiel löschen …</button>
    </section>`;

  // Dialoge
  const resetDialog = overlay(`
    <form class="dialog" autocomplete="off" role="dialog" aria-modal="true" aria-labelledby="reset-title">
      <h2 id="reset-title">Spiel zurücksetzen?</h2>
      <p>Das wird gelöscht:</p>
      <ul class="reset-list">
        <li>alle anderen Spieler mit ihren Feldern</li>
        <li>die Wörter in deinem eigenen Feld</li>
        <li>die Lieder aller Abende</li>
      </ul>
      <label class="check">
        <input type="checkbox" data-reset-words>
        <span>Auch die Wörter im Kalender löschen</span>
      </label>
      <p class="muted">Bleibt erhalten: Liederpool und Einladungslink. Die Felder werden entsperrt.
        <strong>Das lässt sich nicht rückgängig machen.</strong></p>
      <label>Zum Bestätigen <strong>RESET</strong> eintippen
        <input type="text" data-confirm autocapitalize="characters" enterkeyhint="done">
      </label>
      <p class="msg" data-msg></p>
      <div class="buttons">
        <button type="button" class="btn ghost" data-cancel>Abbrechen</button>
        <button type="submit" class="btn primary danger-fill" data-go>Endgültig zurücksetzen</button>
      </div>
    </form>`);

  const deleteDialog = overlay(`
    <form class="dialog" autocomplete="off" role="dialog" aria-modal="true" aria-labelledby="delete-title">
      <h2 id="delete-title">Spiel löschen?</h2>
      <p>Das ganze Spiel „<strong data-game-name></strong>“ wird gelöscht – mit allen Feldern, Wörtern
        im Kalender und Liedern. Alle Mitspieler verlieren es aus ihrer Liste.
        <strong>Das lässt sich nicht rückgängig machen.</strong></p>
      <label>Zum Bestätigen <strong>LÖSCHEN</strong> eintippen
        <input type="text" data-confirm autocapitalize="characters" enterkeyhint="done">
      </label>
      <p class="msg" data-msg></p>
      <div class="buttons">
        <button type="button" class="btn ghost" data-cancel>Abbrechen</button>
        <button type="submit" class="btn primary danger-fill" data-go>Endgültig löschen</button>
      </div>
    </form>`);

  const q = (sel) => root.querySelector(sel);
  const ctx = () => getCtx();
  const gameRef = () => doc(db, "games", ctx().gameId);
  const sub = (name, id) => doc(db, "games", ctx().gameId, name, id);

  // ---------- Daten ----------

  /** Einladung abonnieren (gehört nur der Spielleitung). Gibt eine Funktion zum Abbestellen zurück. */
  function start(gameId) {
    st.invite = null;
    st.openGrids.clear();
    renderInvite();
    return onSnapshot(doc(db, "games", gameId, "private", "invite"), (s) => {
      st.invite = s.exists() ? s.data() : null;
      renderInvite();
    }, (err) => {
      console.error("Einladung:", err);
      toast("Der Einladungslink konnte nicht geladen werden.", 5000);
    });
  }

  // ---------- Anzeige ----------

  function render() {
    const { game } = ctx();
    if (!game) return;
    const locked = game.locked === true;
    q("[data-lock]").checked = locked;
    q("[data-lock-card]").classList.toggle("is-locked", locked);
    q("[data-lock-icon]").textContent = locked ? "🔒" : "✏️";
    q("[data-lock-title]").textContent = locked ? "Felder gesperrt" : "Felder offen";
    q("[data-lock-sub]").textContent = locked
      ? "Niemand kann sein Feld mehr ändern."
      : "Alle können ihre Felder bearbeiten.";
    const nameInput = q("[data-name]");
    if (document.activeElement !== nameInput) nameInput.value = game.name ?? "";
    q("[data-songs-on]").checked = songsEnabled(game);
    renderWatch();
    renderPlayers();
  }

  function renderInvite() {
    const link = st.invite ? inviteLink(ctx().gameId, st.invite.code) : "";
    q("[data-invite-link]").value = link || "Wird geladen …";
    q("[data-invite-open]").checked = st.invite?.open === true;
    q("[data-invite-wa]").href = link
      ? "https://wa.me/?text=" + encodeURIComponent(
        `🎄 Macht mit beim Weihnachtsbingo „${ctx().game?.name ?? ""}“! Über diesen Link könnt ihr beitreten:\n${link}`)
      : "#";
  }

  function renderWatch() {
    const link = watchLink(ctx().gameId);
    q("[data-watch-link]").value = link;
    q("[data-watch-wa]").href = "https://wa.me/?text=" + encodeURIComponent(
      `🎄 Schaut beim Weihnachtsbingo „${ctx().game?.name ?? ""}“ zu – ganz ohne Anmeldung:
${link}`);
  }

  /** Spielerliste – vorhandene Karten werden aktualisiert statt neu gebaut, damit Schalter sanft umspringen. */
  function renderPlayers() {
    const { boards, days, uid } = ctx();
    if (!boards) return;
    const container = q("[data-players]");
    const drawn = drawnMap(days);
    const rows = ranking(boards, drawn);

    if (rows.length <= 1) {
      if (!container.querySelector(".intro-text")) {
        container.insertAdjacentHTML("afterbegin",
          `<p class="intro-text">Außer dir ist noch niemand dabei. Schick den Einladungslink herum!</p>`);
      }
    } else {
      container.querySelector(".intro-text")?.remove();
    }

    const keep = new Set();
    rows.forEach((r, idx) => {
      const id = r.board.id;
      const isMe = id === uid;
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
          ${isMe ? "" : `<label class="perm">
            <span>Darf Tageswörter eintragen</span>
            <span class="switch"><input type="checkbox" data-perm="${escapeHtml(id)}"><span></span></span>
          </label>`}
          <div class="row wrap-row actions">
            <button type="button" class="btn small ghost" data-toggle="${escapeHtml(id)}">Feld ansehen</button>
            ${isMe ? "" : `<button type="button" class="btn small ghost danger" data-del="${escapeHtml(id)}">Entfernen</button>`}
          </div>
          <div class="collapse"><div class="collapse-inner"></div></div>`;
      }
      const b = r.board;
      card.classList.toggle("me", isMe);
      card.querySelector(".ph").innerHTML = `
        <span class="rank">${r.rank}.</span>
        <strong class="name">${escapeHtml(b.name)}</strong>
        ${isMe ? `<span class="tag">Du · Spielleitung</span>` : ""}
        ${r.lines.length ? `<span class="badge">BINGO ×${r.lines.length}</span>` : ""}`;
      card.querySelector(".meta").textContent = `${r.hits} Treffer · ${r.filled}/${CELL_COUNT} ausgefüllt`;
      const perm = card.querySelector("[data-perm]");
      if (perm && perm.checked !== canAddWords(b)) perm.checked = canAddWords(b);
      const open = st.openGrids.has(id);
      card.querySelector("[data-toggle]").textContent = open ? "Feld ausblenden" : "Feld ansehen";
      card.querySelector(".collapse").classList.toggle("open", open);
      card.querySelector(".collapse-inner").innerHTML = miniGridHtml(r, drawn);
      container.append(card); // sortiert in Ranglisten-Reihenfolge
    });
    for (const card of container.querySelectorAll("[data-board]")) {
      if (!keep.has(card.dataset.board)) card.remove();
    }
  }

  // ---------- Ereignisse ----------

  q("[data-lock]").addEventListener("change", (e) => {
    const locked = e.target.checked;
    save(updateDoc(gameRef(), { locked }), locked ? "🔒 Felder gesperrt." : "✏️ Felder entsperrt.")
      .then((ok) => { if (!ok) render(); });
  });

  q("[data-name-form]").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = q("[data-name]");
    const name = cleanName(input.value, MAX_GAME_NAME_LENGTH);
    if (!name) return toast("Bitte einen Namen eingeben.");
    input.blur();
    if (name === ctx().game?.name) return;
    save(updateDoc(gameRef(), { name }), "✏️ Spielname gespeichert.");
  });

  q("[data-songs-on]").addEventListener("change", (e) => {
    const on = e.target.checked;
    save(updateDoc(gameRef(), { songsEnabled: on }),
      on ? "🎶 Weihnachtslieder eingeschaltet." : "🔕 Weihnachtslieder ausgeschaltet.")
      .then((ok) => {
        if (!ok) render();
        else if (on) onSongsOn();
      });
  });

  q("[data-watch-copy]").addEventListener("click", () => copyText(watchLink(ctx().gameId)));
  q("[data-watch-link]").addEventListener("focus", (e) => e.target.select());

  q("[data-invite-copy]").addEventListener("click", () => {
    if (st.invite) copyText(inviteLink(ctx().gameId, st.invite.code));
  });
  q("[data-invite-link]").addEventListener("focus", (e) => e.target.select());

  q("[data-invite-open]").addEventListener("change", (e) => {
    const open = e.target.checked;
    save(updateDoc(sub("private", "invite"), { open }),
      open ? "✅ Neue Spieler können beitreten." : "⛔ Beitritt geschlossen.")
      .then((ok) => { if (!ok) renderInvite(); });
  });

  q("[data-invite-renew]").addEventListener("click", () => {
    if (!confirm("Neuen Einladungslink erzeugen? Der alte Link funktioniert dann nicht mehr. Wer schon mitspielt, bleibt dabei.")) return;
    save(updateDoc(sub("private", "invite"), { code: randomId(16) }), "🔗 Neuer Einladungslink erzeugt.");
  });

  q("[data-players]").addEventListener("change", (e) => {
    const id = e.target.dataset?.perm;
    if (!id) return;
    const b = ctx().boards.find((x) => x.id === id);
    const allowed = e.target.checked;
    save(updateDoc(sub("boards", id), { canAddWords: allowed }),
      allowed ? `✅ ${b?.name} darf Wörter eintragen.` : `⛔ ${b?.name} darf keine Wörter mehr eintragen.`)
      .then((ok) => { if (!ok) renderPlayers(); });
  });

  q("[data-players]").addEventListener("click", async (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.toggle) {
      const id = t.dataset.toggle;
      st.openGrids.has(id) ? st.openGrids.delete(id) : st.openGrids.add(id);
      renderPlayers();
    } else if (t.dataset.del) {
      const b = ctx().boards.find((x) => x.id === t.dataset.del);
      if (!b || !confirm(`${b.name} wirklich aus dem Spiel entfernen? Das Feld wird dabei gelöscht.`)) return;
      const card = t.closest(".board-card");
      card.classList.add("leaving");
      const batch = writeBatch(db);
      batch.delete(sub("boards", b.id));
      batch.delete(sub("members", b.id));
      if (!(await save(batch.commit(), `${b.name} entfernt.`))) card.classList.remove("leaving");
    }
  });

  // Zurücksetzen
  q("[data-reset-open]").addEventListener("click", () => {
    resetDialog.q("[data-confirm]").value = "";
    resetDialog.q("[data-reset-words]").checked = false;
    resetDialog.q("[data-msg]").textContent = "";
    openOverlay(resetDialog.el);
    resetDialog.q("[data-confirm]").focus();
  });

  resetDialog.onSubmit(async () => {
    if (resetDialog.q("[data-confirm]").value.trim().toUpperCase() !== "RESET") {
      resetDialog.q("[data-msg]").textContent = "Bitte RESET eintippen.";
      return;
    }
    const n = await resetGame(resetDialog.q("[data-reset-words]").checked);
    toast(`🗑️ Spiel zurückgesetzt (${n} Einträge gelöscht).`, 5000);
  }, "Wird zurückgesetzt …", "Zurücksetzen hat nicht (ganz) geklappt: ");

  // Löschen
  q("[data-delete-open]").addEventListener("click", () => {
    deleteDialog.q("[data-confirm]").value = "";
    deleteDialog.q("[data-msg]").textContent = "";
    deleteDialog.q("[data-game-name]").textContent = ctx().game?.name ?? "";
    openOverlay(deleteDialog.el);
    deleteDialog.q("[data-confirm]").focus();
  });

  deleteDialog.onSubmit(async () => {
    if (deleteDialog.q("[data-confirm]").value.trim().toUpperCase() !== "LÖSCHEN") {
      deleteDialog.q("[data-msg]").textContent = "Bitte LÖSCHEN eintippen.";
      return;
    }
    const name = ctx().game?.name ?? "";
    await deleteGame();
    toast(`❌ „${name}“ gelöscht.`, 5000);
    onDeleted();
  }, "Wird gelöscht …", "Löschen hat nicht (ganz) geklappt: ");

  // ---------- Aktionen ----------

  async function docsOf(names) {
    const refs = [];
    for (const name of names) {
      const snap = await getDocs(collection(db, "games", ctx().gameId, name));
      refs.push(...snap.docs.map((d) => d.ref));
    }
    return refs;
  }

  /** Löscht in Häppchen (ein Batch darf höchstens 500 Schreibvorgänge enthalten). */
  async function deleteAll(refs, lastBatch = () => {}) {
    for (let i = 0; i < refs.length || i === 0; i += 450) {
      const batch = writeBatch(db);
      for (const ref of refs.slice(i, i + 450)) batch.delete(ref);
      if (i + 450 >= refs.length) lastBatch(batch);
      await batch.commit();
    }
  }

  /**
   * Entfernt alle anderen Spieler, leert das eigene Feld und löscht die Lieder der Abende
   * (auf Wunsch auch die Tageswörter). Entsperrt die Felder. Liederpool und Einladung bleiben.
   */
  async function resetGame(clearWords) {
    const { uid } = ctx();
    // Zuerst entsperren, sonst darf das eigene Feld nicht geleert werden
    await updateDoc(gameRef(), { locked: false });
    const refs = (await docsOf(["boards", "members", "songDays", ...(clearWords ? ["days"] : [])]))
      .filter((ref) => !(ref.parent.id === "boards" && ref.id === uid));
    await deleteAll(refs, (batch) => batch.update(sub("boards", uid), { cells: emptyCells() }));
    st.openGrids.clear();
    return refs.length;
  }

  /** Löscht alle Unterdokumente und zuletzt das Spiel selbst. */
  async function deleteGame() {
    const { gameId, uid } = ctx();
    const refs = await docsOf(["boards", "members", "days", "songs", "songDays"]);
    refs.push(sub("private", "invite"));
    await deleteAll(refs, (batch) => {
      batch.delete(doc(db, "games", gameId));
      batch.update(doc(db, "users", uid), { games: arrayRemove(gameId) });
    });
  }

  return { start, refresh: render };
}

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

/** Bestätigungsdialog: Overlay mit Formular, Abbrechen und Klick daneben schließen. */
function overlay(html) {
  const el = document.createElement("div");
  el.className = "overlay";
  el.hidden = true;
  el.innerHTML = html;
  document.body.append(el);
  const q = (sel) => el.querySelector(sel);
  const close = () => closeOverlay(el);
  q("[data-cancel]").addEventListener("click", close);
  el.addEventListener("click", (e) => { if (e.target === el) close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !el.hidden) close(); });
  return {
    el,
    q,
    /** fn wirft bei Fehlern; gibt sie normal zurück und hat keine Meldung gesetzt, schließt der Dialog. */
    onSubmit(fn, busyText, errorPrefix) {
      q("form").addEventListener("submit", async (e) => {
        e.preventDefault();
        const go = q("[data-go]");
        const msg = q("[data-msg]");
        go.disabled = true;
        msg.textContent = busyText;
        try {
          await fn();
          if (msg.textContent === busyText) {
            msg.textContent = "";
            close();
          }
        } catch (err) {
          console.error(err);
          msg.textContent = errorPrefix + err.message;
        } finally {
          go.disabled = false;
        }
      });
    },
  };
}
