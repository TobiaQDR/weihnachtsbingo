// Wird in index.html und admin.html als normales (nicht-Modul-)Skript im <head> geladen, vor allen Modulen.
// Lokaler Testmodus (nur auf localhost): einschalten mit ?lokal, ausschalten mit ?lokal=aus.
// Ersetzt Firebase durch eine Attrappe im Browser (js/test/), es geht nichts an die echte Datenbank.
(function () {
  if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
  try {
    var p = new URLSearchParams(location.search).get("lokal");
    if (p === "aus") localStorage.removeItem("bingoLokal");
    else if (p !== null) localStorage.setItem("bingoLokal", "1");
    if (localStorage.getItem("bingoLokal") !== "1") return;
  } catch (e) {
    return;
  }
  var sdk = "https://www.gstatic.com/firebasejs/10.14.1/";
  var imports = {};
  imports[sdk + "firebase-app.js"] = "./js/test/fake-app.js";
  imports[sdk + "firebase-auth.js"] = "./js/test/fake-auth.js";
  imports[sdk + "firebase-firestore.js"] = "./js/test/fake-firestore.js";
  var map = document.createElement("script");
  map.type = "importmap";
  map.textContent = JSON.stringify({ imports: imports });
  document.currentScript.after(map);
})();
