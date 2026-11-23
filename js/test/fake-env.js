// Lokaler Testmodus: gemeinsamer Speicher, simuliertes Datum und Hinweisleiste.
// Wird nur geladen, wenn index.html den Testmodus einschaltet (localhost + ?lokal).
// Alle Daten liegen im localStorage dieses Browsers; nichts geht an Firebase.

const KEY = "bingoLokalDaten";
const DATE_KEY = "bingoLokalDatum";
const RealDate = Date;

// ---------- Simuliertes Datum (zum Testen der Türchen) ----------

function readFakeDay() {
  try {
    return localStorage.getItem(DATE_KEY) || "";
  } catch {
    return "";
  }
}

const fakeDay = readFakeDay();
if (/^\d{4}-\d{2}-\d{2}$/.test(fakeDay)) {
  const now = new RealDate();
  const [y, m, d] = fakeDay.split("-").map(Number);
  const target = new RealDate(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds());
  const offset = target.getTime() - now.getTime();
  class ShiftedDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(RealDate.now() + offset);
      else super(...args);
    }
    static now() {
      return RealDate.now() + offset;
    }
  }
  globalThis.Date = ShiftedDate;
}

export const realNow = () => RealDate.now();

// ---------- Speicher ----------

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && typeof raw === "object") return { docs: raw.docs ?? {}, accounts: raw.accounts ?? {} };
  } catch {
    // leer anfangen
  }
  return { docs: {}, accounts: {} };
}

let store = load();
const subscribers = new Set();

/** Aktueller Datenstand: { docs: { "pfad/zum/doc": daten }, accounts: { email: { uid, password } } } */
export const getStore = () => store;

/** Neuen Stand übernehmen, speichern und alle Abos benachrichtigen. */
export function commitStore(next) {
  store = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch (err) {
    console.warn("Testmodus: Speichern im Browser fehlgeschlagen", err);
  }
  notify();
}

export function subscribe(fn) {
  subscribers.add(fn);
  return () => subscribers.delete(fn);
}

function notify() {
  for (const fn of [...subscribers]) {
    try {
      fn();
    } catch (err) {
      console.error(err);
    }
  }
}

// Änderungen aus anderen Tabs (z. B. zweiter Spieler im zweiten Tab)
window.addEventListener("storage", (e) => {
  if (e.key !== KEY) return;
  store = load();
  notify();
});

/** Kurze künstliche Verzögerung, damit sich der Testmodus ähnlich wie das echte Netz verhält. */
export const tick = () => new Promise((resolve) => setTimeout(resolve, 15));

// ---------- Hinweisleiste ----------

function banner() {
  const style = document.createElement("style");
  style.textContent = `
    .lokal-bar { position: fixed; left: 10px; bottom: 10px; z-index: 9999; font: 600 13px/1.3 Nunito, system-ui, sans-serif;
      color: #3a2400; }
    .lokal-bar > button { background: #ffd54a; color: inherit; border: 2px solid #b8860b; border-radius: 999px;
      padding: 6px 12px; cursor: pointer; font: inherit; box-shadow: 0 2px 8px rgba(0,0,0,.3); }
    .lokal-panel { margin-bottom: 8px; background: #fff8dc; border: 2px solid #b8860b; border-radius: 12px; padding: 10px 12px;
      width: min(300px, calc(100vw - 40px)); box-shadow: 0 4px 16px rgba(0,0,0,.35); }
    .lokal-panel p { margin: 0 0 8px; font-weight: 400; }
    .lokal-panel label { display: block; margin: 8px 0 4px; }
    .lokal-panel input { width: 100%; box-sizing: border-box; margin: 0; padding: 4px 6px; font: inherit; }
    .lokal-panel .lokal-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
    .lokal-panel .lokal-row button { flex: 1; font: inherit; padding: 5px 8px; border-radius: 8px; border: 1px solid #b8860b;
      background: #fff; color: inherit; cursor: pointer; }
    @media print { .lokal-bar { display: none; } }`;
  document.head.append(style);

  const bar = document.createElement("div");
  bar.className = "lokal-bar";
  bar.innerHTML = `
    <div class="lokal-panel" hidden>
      <p><strong>🧪 Lokaler Testmodus</strong><br>Alles bleibt in diesem Browser, nichts geht an Firebase.
        Die Sicherheitsregeln werden <em>nicht</em> geprüft. Mehrere Spieler: jeden in einem eigenen Tab anmelden.</p>
      <label for="lokal-day">Simuliertes Datum (leer = heute)</label>
      <input id="lokal-day" type="date" value="${fakeDay}">
      <div class="lokal-row">
        <button type="button" data-lokal="day">Datum übernehmen</button>
      </div>
      <div class="lokal-row">
        <button type="button" data-lokal="clear">Testdaten löschen</button>
        <button type="button" data-lokal="off">Testmodus beenden</button>
      </div>
    </div>
    <button type="button" data-lokal="toggle" title="Lokaler Testmodus">🧪 Testmodus${fakeDay ? ` · ${fakeDay}` : ""}</button>`;
  document.body.append(bar);

  const panel = bar.querySelector(".lokal-panel");
  bar.addEventListener("click", (e) => {
    const action = e.target.closest("[data-lokal]")?.dataset.lokal;
    if (action === "toggle") {
      panel.hidden = !panel.hidden;
    } else if (action === "day") {
      const v = bar.querySelector("#lokal-day").value;
      try {
        if (v) localStorage.setItem(DATE_KEY, v);
        else localStorage.removeItem(DATE_KEY);
      } catch { /* egal */ }
      location.reload();
    } else if (action === "clear") {
      if (!confirm("Alle lokalen Testdaten (Konten, Spiele, Felder) löschen?")) return;
      try {
        localStorage.removeItem(KEY);
        sessionStorage.clear();
        for (const k of ["bingoSpiel", "bingoGast"]) localStorage.removeItem(k);
      } catch { /* egal */ }
      location.href = location.pathname;
    } else if (action === "off") {
      try {
        localStorage.removeItem("bingoLokal");
        localStorage.removeItem(DATE_KEY);
        for (const k of ["bingoSpiel", "bingoGast"]) localStorage.removeItem(k);
      } catch { /* egal */ }
      location.href = location.pathname;
    }
  });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", banner);
else banner();
console.info("🧪 Lokaler Testmodus aktiv: Firebase ist durch eine Attrappe ersetzt (js/test/).");
