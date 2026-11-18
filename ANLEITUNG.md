# Weihnachtsbingo 2026 – Einrichtung

Einmalig ca. 20–30 Minuten. Kostet nichts. Du brauchst ein Google-Konto (für Firebase) und ein GitHub-Konto (für die Webseite).

> **Läuft die Seite schon mit der alten Version?** Dann reicht der Abschnitt
> [„Update auf die neue Version“](#update-auf-die-neue-version) ganz unten.

## Übersicht

| Datei | Wofür |
|---|---|
| `index.html` | Seite für die Spieler (Einladungslink: neu mitspielen, mit Name + PIN anmelden oder als Gast zuschauen) |
| `admin.html` | Seite für dich als Spielleiter: Einladungslink verschicken, Felder sperren, Rechte vergeben, Spieler entfernen, Kalender und Lieder pflegen |
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
> Geschützt wird alles durch die Regeln: Nur du kannst sperren, Rechte vergeben und Spieler entfernen.
> Mitspielen kann nur, wer den Einladungslink hat. Ein Spieler kann nur sein eigenes Feld ändern, und auch
> das nur, solange die Felder nicht gesperrt sind. Die Felder aller Spieler kann jeder sehen, die
> persönlichen Links aber nicht. Die PIN schützt vor Verwechslungen und neugierigen Verwandten, ist
> aber kein Banktresor: Wer sich mit Technik auskennt, könnte eine 4-stellige PIN durchprobieren.

## 2. Lokal ausprobieren (optional)

Im Projektordner ein Terminal öffnen und eingeben:

```
python -m http.server 8000
```

Dann im Browser <http://localhost:8000/admin.html> öffnen und anmelden. Unter **Einladungslink** auf
**Link kopieren** klicken und den Link in einem privaten Fenster öffnen, dort als Testspieler beitreten.
**Achtung:** Auch lokal wird in die echte Datenbank geschrieben. Den Testspieler danach wieder entfernen.

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
2. Im Reiter **👥 Spieler** steht oben der **Einladungslink**. Ihn per **WhatsApp**-Knopf oder
   **Link kopieren** an alle schicken, gern auch in die Familiengruppe.
3. Wer den Link öffnet, hat drei Möglichkeiten:
   - **🎁 Neu mitspielen**: Namen und eine **PIN** (4 bis 8 Ziffern) eingeben, schon ist man dabei.
     Jeder neue Spieler darf erst einmal Tageswörter eintragen.
   - **🔑 Ich spiele schon mit**: auf einem weiteren Gerät (Handy, Tablet, Laptop) den eigenen Namen
     aus der Liste wählen und die PIN eingeben. Danach ist man dort in seinem Feld.
   - **👀 Nur zuschauen**: als Gast alle Felder, die Rangliste und die Wörter im Kalender ansehen.
     Gäste bekommen kein eigenes Feld und können nichts eintragen.
   Das Gerät merkt sich, wer man ist. Unter dem eigenen Feld kann man die **PIN ändern** und sich
   **abmelden** (z. B. auf einem Tablet, das sich mehrere teilen).
4. Sind alle dabei, kannst du den Schalter **„Neue Spieler dürfen beitreten“** ausschalten. Wenn der
   Link in falsche Hände geraten ist, erzeugt **„Neuen Link erzeugen“** einen neuen; der alte
   funktioniert dann nicht mehr. Wer schon mitspielt, bleibt dabei.
5. Sobald alle ihre Felder ausgefüllt haben, oben den **Schalter „Felder sperren“** umlegen.
   Mit demselben Schalter kannst du jederzeit wieder entsperren.

### Spieler verwalten

Im Reiter **👥 Spieler** hat jeder Spieler eine Karte:

- **„Darf Tageswörter eintragen“**: Recht wegnehmen oder wieder geben.
- **„noch keine PIN“** steht dabei, wenn ein Spieler noch keine PIN festgelegt hat (z. B. weil er schon
  vor dem Update dabei war). Er kann sie unter seinem Feld festlegen.
- **Link kopieren / WhatsApp**: den persönlichen Link des Spielers schicken. Damit kommt er direkt in
  sein Feld, auch wenn er seine PIN vergessen hat. Dort kann er dann eine neue PIN festlegen.
- **Entfernen**: Spieler samt Feld aus dem Spiel nehmen. Sein persönlicher Link funktioniert dann nicht mehr.

## 5. In der Adventszeit

- Im Reiter **📅 Kalender** gibt es 24 Türchen. Tippt man auf eins, sieht man die Wörter des Tages
  und bei wem sie im Feld stehen. Darunter stehen die Lieder des Abends; 🎶 am Türchen zeigt, wie
  viele es schon sind.
- **Alle Spieler** können die Wörter eines Tages eintragen und ändern (sobald das Türchen offen ist,
  also ab dem jeweiligen Dezembertag). Als Spielleitung kannst du jeden Tag bearbeiten.
- **Mehrere Wörter pro Tag** sind möglich, z. B. „Nikolaus“ und „Weihnachtsmann“. Jedes davon zählt
  als Treffer.
- Beim Eintippen sieht man schon, bei wem das Wort steht, und auch ähnliche Schreibweisen
  (z. B. „Plätzchen“ vs. „Plätzchen backen“).
- Im Reiter **👀 Alle Felder** sehen alle Spieler jederzeit die Felder der anderen als **Rangliste**,
  mit dem Platz als Zahl (die ersten drei in Gold, Silber und Bronze). Oben wählt man die Wertung:
  - **🎉 Bingos & längste Reihe**: zuerst zählen volle Reihen, Spalten und Diagonalen, bei Gleichstand
    die längste angefangene Reihe (z. B. 4 von 5), dann die Treffer.
  - **🎯 Meiste Treffer**: zuerst zählen die Treffer, dann die Bingos.
  Wer in allem gleichauf ist, teilt sich den Platz.
- Volle Reihen, Spalten oder Diagonalen werden rot-golden markiert, und es gibt Konfetti und „BINGO!“.

### Weihnachtslieder

Im Reiter **🎶 Lieder** wird für jeden Abend (1. bis 24. Dezember) festgelegt, was gesungen wird.

- Oben die Tage antippen; heute ist vorausgewählt. Pro Abend gibt es **höchstens 3 Lieder**.
- **Lied aussuchen**: Jeder Spieler kann ein Lied aus dem Liederpool wählen und mit **＋** hinzufügen.
  Es steht dann mit seinem Namen (👤) da und bleibt fest, andere Spieler können es nicht austauschen.
- **🎲 Mit Zufallsliedern auffüllen**: füllt die freien Plätze mit zufälligen Liedern aus dem Pool
  (gestrichelt, „🎲 Zufall“). Nochmal drücken („Neu würfeln“) ersetzt die Zufallslieder durch neue.
  Lieder, die an anderen Abenden schon dran sind, kommen seltener.
- Sucht jemand ein Lied aus, obwohl schon 3 Lieder dastehen, fliegt dafür ein Zufallslied raus.
- **📖 Liederpool**: Zu Beginn mit klassischen deutschen Weihnachtsliedern gefüllt. Jeder Spieler kann
  Lieder ergänzen (es reicht der Name des Liedes).
- **Als Spielleitung** kannst du mit **✕** Lieder aus dem Pool und von einzelnen Abenden entfernen,
  auch die von Spielern ausgesuchten.
- Gäste sehen die Lieder nur an. Lieder kann man auch schon für spätere Abende aussuchen.
- **🎲 Alle Abende zufällig auffüllen** (nur Spielleitung, oben im Reiter): füllt an allen 24 Abenden
  die freien Plätze mit Zufallsliedern. Schon eingetragene Lieder bleiben stehen, und die Lieder
  verteilen sich möglichst gleichmäßig über die Abende.

### Spiel zurücksetzen

Ganz unten im Reiter **👥 Spieler** gibt es **„Spiel zurücksetzen“** (z. B. für einen Probelauf oder das
nächste Jahr). Nach Eintippen von `RESET` werden alle Spieler mit ihren Feldern, Links und PINs sowie
die Lieder aller Abende gelöscht. Auf Wunsch (Häkchen) auch die Wörter im Kalender. Liederpool und
Einladungslink bleiben, die Felder werden entsperrt. Danach können alle über den Einladungslink neu
beitreten. **Das lässt sich nicht rückgängig machen.**

## Tipps für die Mitspieler

- Einfach den Link antippen, es muss nichts installiert werden.
- **PIN gut merken.** Damit kommt man auf jedem weiteren Gerät über den Einladungslink in sein Feld.
- **Als App auf den Startbildschirm legen:**
  - iPhone (Safari): Teilen-Symbol → „Zum Home-Bildschirm“
  - Android (Chrome): ⋮ → „Zum Startbildschirm hinzufügen“
- Groß- und Kleinschreibung ist egal. Die Schreibweise sollte aber passen
  („Glühwein“ ist nicht dasselbe wie „Gluehwein“).

## Kosten

Der kostenlose Firebase-Tarif „Spark“ erlaubt 50.000 Lesevorgänge und 20.000 Schreibvorgänge **pro Tag**.
Eine Familie braucht davon nur einen Bruchteil. Es ist keine Kreditkarte nötig, also können keine Kosten entstehen.

## Update auf die neue Version

### Update „Spiel zurücksetzen“

1. Den Inhalt von `firestore.rules` in Firebase unter **Firestore Database → Regeln** einfügen und
   **Veröffentlichen** (sonst klappt das Zurücksetzen nicht).
2. Alle Dateien wieder bei GitHub hochladen.

### Update „Weihnachtslieder“

1. Den Inhalt von `firestore.rules` in Firebase unter **Firestore Database → Regeln** einfügen und
   **Veröffentlichen**.
2. Alle Dateien wieder bei GitHub hochladen (inklusive der neuen Datei `js/songs.js`).
3. **Einmal `admin.html` öffnen und anmelden.** Dabei wird der Liederpool mit den klassischen
   Weihnachtsliedern gefüllt (Meldung „Liederpool … gefüllt“).

### Update „PIN und Gäste“

1. Den Inhalt von `firestore.rules` in Firebase unter **Firestore Database → Regeln** einfügen und
   **Veröffentlichen**.
2. Alle Dateien wieder bei GitHub hochladen.
3. Wer schon mitspielt, bleibt dabei und sieht über seinem Feld den Hinweis **„PIN festlegen“**.
   Erst mit PIN kann man sich auf weiteren Geräten anmelden.

### Update „Einladungslink“

1. Den Inhalt von `firestore.rules` in Firebase unter **Firestore Database → Regeln** einfügen und
   **Veröffentlichen**.
2. Alle Dateien wieder bei GitHub hochladen.
3. **Einmal `admin.html` öffnen und anmelden.** Dabei wird der Einladungslink erzeugt. Alle bisherigen
   Spieler und Links bleiben gültig.

### Update von der allerersten Version

Die bisherigen Spieler-Links bleiben gültig, die eingetragenen Felder bleiben erhalten.

1. In Firebase unter **Authentication → Sign-in method** den Anbieter **Anonym** aktivieren.
2. Den Inhalt von `firestore.rules` in Firebase unter **Firestore Database → Regeln** einfügen und
   **Veröffentlichen**.
3. Alle Dateien (inklusive Ordner `js` mit der neuen `ui.js`) wieder bei GitHub hochladen.
4. **Einmal `admin.html` öffnen und anmelden.** Dabei werden die Daten automatisch umgestellt
   (Meldung „Daten auf das neue Format umgestellt“). Erst danach funktionieren die Spieler-Links wieder.
