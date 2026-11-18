# Weihnachtsbingo 2026 – Einrichtung

Einmalig ca. 20–30 Minuten. Kostet nichts. Du brauchst ein Google-Konto (für Firebase) und ein GitHub-Konto (für die Webseite).

## Übersicht

| Datei | Wofür |
|---|---|
| `index.html` | Seite für die Spieler (jeder bekommt einen persönlichen Link) |
| `admin.html` | Seite für dich als Spielleiter: Spieler anlegen, sperren, Wörter ziehen |
| `js/firebase-config.js` | **Hier trägst du deine Firebase-Daten ein** |
| `firestore.rules` | Sicherheitsregeln, werden in Firebase eingefügt |

---

## 1. Firebase einrichten (kostenlose Datenbank)

1. Gehe auf <https://console.firebase.google.com> und melde dich mit deinem Google-Konto an.
2. **Projekt erstellen**, z. B. Name `weihnachtsbingo`. Google Analytics kannst du **deaktivieren**.
3. Links **Build → Firestore Database → Datenbank erstellen**
   - Standort: `europe-west3 (Frankfurt)`
   - **Produktionsmodus** wählen → Erstellen
4. Links **Build → Authentication → Jetzt starten**
   - Anbieter **E-Mail/Passwort** aktivieren → Speichern
   - Reiter **Users → Nutzer hinzufügen**: deine E-Mail und ein Passwort (das ist dein Spielleiter-Login)
   - Danach siehst du in der Liste die **Nutzer-UID** (lange Zeichenkette) → kopieren
5. Zahnrad oben links → **Projekteinstellungen → Allgemein → Meine Apps →** Symbol `</>` (Web-App)
   - Spitzname z. B. `bingo`, **kein** Hosting anhaken → App registrieren
   - Du siehst einen Block `const firebaseConfig = { apiKey: "...", ... }`
6. Öffne `js/firebase-config.js` und trage ein:
   - die Werte aus `firebaseConfig` (apiKey, authDomain, projectId, …)
   - bei `ADMIN_UID` deine Nutzer-UID aus Schritt 4
7. Öffne `firestore.rules`, ersetze `ADMIN_UID_HIER` durch deine UID und kopiere den **ganzen Inhalt**
   in Firebase unter **Firestore Database → Regeln**. Danach auf **Veröffentlichen** klicken.

> Die Werte in `firebase-config.js` sind nicht geheim, sie stehen später sowieso öffentlich in der Webseite.
> Geschützt wird alles durch die Regeln: Nur du kannst Wörter ziehen und sperren. Ein Spieler kann
> nur sein eigenes Feld ändern, und auch das nur bis zur Sperre.

## 2. Lokal ausprobieren (optional)

Im Projektordner ein Terminal öffnen und eingeben:

```
python -m http.server 8000
```

Dann im Browser <http://localhost:8000/admin.html> öffnen, anmelden und einen Testspieler anlegen.
Bei Klick auf **Link kopieren** bekommst du den Spielerlink, den du in einem zweiten Fenster öffnest.

## 3. Webseite kostenlos veröffentlichen (GitHub Pages)

1. Konto anlegen auf <https://github.com> (kostenlos).
2. Oben rechts **+ → New repository**
   - Name: `weihnachtsbingo`
   - **Public** (GitHub Pages ist für öffentliche Repositories kostenlos)
   - → Create repository
3. Auf der neuen Seite **uploading an existing file** anklicken und **alle Dateien und den Ordner `js`**
   per Drag & Drop hineinziehen (die `ANLEITUNG.md` darf mit). → **Commit changes**
4. **Settings → Pages**: bei *Source* „Deploy from a branch“, Branch `main`, Ordner `/ (root)` → **Save**
5. Nach 1–2 Minuten ist die Seite erreichbar unter
   `https://DEIN-GITHUB-NAME.github.io/weihnachtsbingo/admin.html`
6. In Firebase unter **Authentication → Einstellungen → Autorisierte Domains** die Domain
   `DEIN-GITHUB-NAME.github.io` hinzufügen.

> In GitHub stehen keine Spielerdaten, nur der Programmcode. Die Felder und Links liegen in Firebase.

## 4. Spiel starten

1. `admin.html` öffnen und anmelden.
2. Unter **Spieler** alle Mitspieler anlegen.
3. Unter **Felder sperren** das Datum eintragen, ab dem keine Änderungen mehr möglich sind
   (z. B. 30.11. 23:59), und **Datum speichern** klicken.
4. Jedem Spieler per **WhatsApp**-Knopf oder **Link kopieren** seinen persönlichen Link schicken.
   **Wichtig:** Jeder Link gehört zu genau einem Spieler, also nicht in die Familiengruppe posten,
   sondern einzeln verschicken.

## 5. In der Adventszeit

- Täglich `admin.html` öffnen, Wort eintragen und **Wort hinzufügen** klicken. Bei allen Spielern
  färbt sich das Feld sofort grün.
- Beim Tippen siehst du schon, bei wem das Wort steht, und auch ähnliche Schreibweisen
  (z. B. „Plätzchen“ vs. „Plätzchen backen“). So kannst du die Schreibweise anpassen.
- Ein falsch eingetragenes Wort kannst du mit ✕ wieder entfernen.
- Volle Reihen, Spalten oder Diagonalen werden rot markiert, und der Spieler sieht „BINGO!“.
  In der Spielerliste siehst du, wer vorne liegt.

## Tipps für die Mitspieler

- Einfach den Link antippen, es muss nichts installiert werden.
- **Als App auf den Startbildschirm legen:**
  - iPhone (Safari): Teilen-Symbol → „Zum Home-Bildschirm“
  - Android (Chrome): ⋮ → „Zum Startbildschirm hinzufügen“
- Groß- und Kleinschreibung ist egal. Die Schreibweise sollte aber passen
  („Glühwein“ ist nicht dasselbe wie „Gluehwein“).

## Kosten

Der kostenlose Firebase-Tarif „Spark“ erlaubt 50.000 Lesevorgänge und 20.000 Schreibvorgänge **pro Tag**.
Eine Familie braucht davon nur einen Bruchteil. Es ist keine Kreditkarte nötig, also können keine Kosten entstehen.
