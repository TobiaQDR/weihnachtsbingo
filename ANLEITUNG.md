# Weihnachtsbingo 2026 – Einrichtung

Einmalig ca. 20–30 Minuten. Kostet nichts. Du brauchst ein Google-Konto (für Firebase) und ein GitHub-Konto (für die Webseite).

> **Läuft die Seite schon mit der alten Version?** Dann reicht der Abschnitt
> [„Update auf die neue Version“](#update-auf-die-neue-version) ganz unten.

## Übersicht

| Datei | Wofür |
|---|---|
| `index.html` | Seite für die Spieler (jeder bekommt einen persönlichen Link) |
| `admin.html` | Seite für dich als Spielleiter: Spieler anlegen, Felder sperren, Rechte vergeben, Kalender pflegen |
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
   - Anbieter **Anonym** ebenfalls aktivieren → Speichern
     (damit erkennt die Seite die Spieler im Hintergrund, ohne dass sie sich anmelden müssen)
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
> Geschützt wird alles durch die Regeln: Nur du kannst sperren und Rechte vergeben. Ein Spieler kann
> nur sein eigenes Feld ändern, und auch das nur, solange die Felder nicht gesperrt sind. Die Felder aller
> Spieler kann jeder sehen, die persönlichen Links aber nicht.

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
3. Sobald alle ihre Felder ausgefüllt haben, oben den **Schalter „Felder sperren“** umlegen.
   Mit demselben Schalter kannst du jederzeit wieder entsperren.
4. Jedem Spieler per **WhatsApp**-Knopf oder **Link kopieren** seinen persönlichen Link schicken.
   **Wichtig:** Jeder Link gehört zu genau einem Spieler, also nicht in die Familiengruppe posten,
   sondern einzeln verschicken.

## 5. In der Adventszeit

- Im Reiter **📅 Kalender** gibt es 24 Türchen. Tippt man auf eins, sieht man die Wörter des Tages
  und bei wem sie im Feld stehen.
- **Alle Spieler** können die Wörter eines Tages eintragen und ändern (sobald das Türchen offen ist,
  also ab dem jeweiligen Dezembertag). Als Spielleitung kannst du jeden Tag bearbeiten.
- **Mehrere Wörter pro Tag** sind möglich, z. B. „Nikolaus“ und „Weihnachtsmann“. Jedes davon zählt
  als Treffer.
- Beim Eintippen sieht man schon, bei wem das Wort steht, und auch ähnliche Schreibweisen
  (z. B. „Plätzchen“ vs. „Plätzchen backen“).
- Im Reiter **👥 Spieler** kannst du pro Spieler mit dem Schalter **„Darf Tageswörter eintragen“**
  das Recht wegnehmen und wieder geben.
- Im Reiter **👀 Alle Felder** sehen alle Spieler jederzeit die Felder der anderen samt Rangliste.
- Volle Reihen, Spalten oder Diagonalen werden rot-golden markiert, und es gibt Konfetti und „BINGO!“.

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

## Update auf die neue Version

Die bisherigen Spieler-Links bleiben gültig, die eingetragenen Felder bleiben erhalten.

1. In Firebase unter **Authentication → Sign-in method** den Anbieter **Anonym** aktivieren.
2. Den Inhalt von `firestore.rules` in Firebase unter **Firestore Database → Regeln** einfügen und
   **Veröffentlichen**.
3. Alle Dateien (inklusive Ordner `js` mit der neuen `ui.js`) wieder bei GitHub hochladen.
4. **Einmal `admin.html` öffnen und anmelden.** Dabei werden die Daten automatisch umgestellt
   (Meldung „Daten auf das neue Format umgestellt“). Erst danach funktionieren die Spieler-Links wieder.
