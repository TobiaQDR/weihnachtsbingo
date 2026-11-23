# Weihnachtsbingo 2026 – Einrichtung

Einmalig ca. 20–30 Minuten. Kostet nichts. Du brauchst ein Google-Konto (für Firebase) und ein GitHub-Konto (für die Webseite).

> **Läuft die Seite schon mit einer älteren Version?** Dann lies den Abschnitt
> [„Update auf die neue Version“](#update-auf-die-neue-version) ganz unten.

## Übersicht

| Datei | Wofür |
|---|---|
| `index.html` | Die ganze Seite: anmelden, eigene Spiele, Spiele erstellen, mitspielen, Spielleitung |
| `admin.html` | Nur noch eine Weiterleitung auf `index.html` (für alte Lesezeichen) |
| `js/firebase-config.js` | **Hier trägst du deine Firebase-Daten ein** |
| `firestore.rules` | Sicherheitsregeln, werden in Firebase eingefügt |

So funktioniert es:

- **Jeder braucht ein Konto** mit Benutzername und Passwort. Der Benutzername ist gleichzeitig der Name,
  unter dem man im Spiel zu sehen ist. Jeden Benutzernamen gibt es nur einmal.
- **Jeder kann Spiele erstellen.** Wer ein Spiel erstellt, ist dort die **Spielleitung**: Sie verschickt
  den Einladungslink, sperrt die Felder, vergibt Rechte und kann Spieler entfernen. Mitspielen tut sie auch.
- **Mehrere Spiele gleichzeitig** sind möglich (z. B. eins für die Familie, eins für die Freunde).
  Unter „🏠 Meine Spiele“ sieht man alle Spiele, bei denen man mitmacht, und oben im Spiel kann man
  über die Auswahlliste zwischen ihnen wechseln.
- **Zuschauen geht auch ohne Konto**, als Gast mit dem Link zum Spiel.
- Eine **E-Mail-Adresse** braucht niemand. Wer sein Passwort vergisst, bekommt von der Spielleitung
  einen Link, mit dem er ein neues festlegt.

---

## 1. Firebase einrichten (kostenlose Datenbank)

1. Gehe auf <https://console.firebase.google.com> und melde dich mit deinem Google-Konto an.
2. **Projekt erstellen**, z. B. Name `weihnachtsbingo`. Google Analytics kannst du **deaktivieren**.
3. Links **Build → Firestore Database → Datenbank erstellen**
   - Standort: `europe-west3 (Frankfurt)`
   - **Produktionsmodus** wählen → Erstellen
4. Links **Build → Authentication → Jetzt starten**
   - Anbieter **E-Mail/Passwort** aktivieren → Speichern.
     Die Spieler brauchen trotzdem keine E-Mail-Adresse: Die Seite macht aus dem Benutzernamen intern
     eine erfundene Adresse, an die nie etwas geschickt wird.
5. Zahnrad oben links → **Projekteinstellungen → Allgemein → Meine Apps →** Symbol `</>` (Web-App)
   - Spitzname z. B. `bingo`, **kein** Hosting anhaken → App registrieren
   - Du siehst einen Block `const firebaseConfig = { apiKey: "...", ... }`
6. Öffne `js/firebase-config.js` und trage die Werte aus `firebaseConfig` ein (apiKey, authDomain, projectId, …).
7. Öffne `firestore.rules`, kopiere den **ganzen Inhalt** in Firebase unter
   **Firestore Database → Regeln** und klicke auf **Veröffentlichen**.

> Die Werte in `firebase-config.js` sind nicht geheim, sie stehen später sowieso öffentlich in der Webseite.
> Geschützt wird alles durch die Regeln: Nur die Spielleitung eines Spiels kann sperren, Rechte vergeben und
> Spieler entfernen. Mitspielen kann nur, wer den Einladungslink hat. Jeder kann nur sein eigenes Feld
> ändern, und auch das nur, solange die Felder nicht gesperrt sind. Die Felder aller Spieler eines Spiels
> kann jeder sehen, der den Link zum Spiel hat.

## 2. Lokal ausprobieren (optional)

### Testmodus ohne echte Datenbank (empfohlen)

Im Projektordner doppelt auf **`lokal-testen.bat`** klicken. Es öffnet sich ein schwarzes Fenster (offen
lassen) und der Browser mit <http://localhost:8000/index.html?lokal>. Unten links steht **🧪 Testmodus**.

- Alles bleibt in diesem Browser, nichts geht an Firebase. Man kann also gefahrlos Konten anlegen,
  Spiele erstellen, zurücksetzen und löschen.
- **Mehrere Spieler:** jeden in einem eigenen Browser-Tab anmelden. Änderungen erscheinen in allen Tabs.
- Über **🧪 Testmodus** lässt sich ein **Datum simulieren** (z. B. 5. Dezember), um die Türchen zu testen,
  und es gibt **Testdaten löschen** und **Testmodus beenden**.
- Die Sicherheitsregeln (`firestore.rules`) werden im Testmodus **nicht** geprüft.
- Ohne die `.bat`: Terminal im Projektordner öffnen, `python -m http.server 8000` eingeben und
  <http://localhost:8000/index.html?lokal> öffnen.

### Mit der echten Datenbank

Im Projektordner ein Terminal öffnen und eingeben:

```
python -m http.server 8000
```

Dann im Browser <http://localhost:8000/index.html> öffnen (ist der Testmodus noch an:
<http://localhost:8000/index.html?lokal=aus>), ein Konto erstellen und ein Testspiel anlegen.
Im Reiter **⚙️ Spiel** auf **Link kopieren** klicken und den Link in einem privaten Fenster öffnen, dort
mit einem zweiten Testkonto beitreten.
**Achtung:** Auch lokal wird in die echte Datenbank geschrieben. Das Testspiel danach im Reiter
**⚙️ Spiel** ganz unten wieder löschen.

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
   `https://DEIN-GITHUB-NAME.github.io/weihnachtsbingo/`
6. In Firebase unter **Authentication → Einstellungen → Autorisierte Domains** die Domain
   `DEIN-GITHUB-NAME.github.io` hinzufügen.

> In GitHub stehen keine Spielerdaten, nur der Programmcode. Konten, Spiele und Felder liegen in Firebase.

## 4. Spiel starten

1. Die Seite öffnen und **🎁 Konto erstellen**: Benutzername (z. B. „Oma Erika“) und Passwort
   (mindestens 6 Zeichen). Mit dem 👁️-Knopf neben dem Passwortfeld kann man das Passwort beim Tippen
   kurz anzeigen, sonst ist es verdeckt.
2. Unter **🏠 Meine Spiele → Neues Spiel erstellen** einen Namen eingeben (z. B. „Familie Müller“).
   Mit dem Häkchen **🎶 Mit Weihnachtsliedern** legst du fest, ob es den Reiter „Lieder“ gibt (das lässt
   sich später im Reiter **⚙️ Spiel** jederzeit ändern). Du bist jetzt die Spielleitung und landest im
   Reiter **⚙️ Spiel**.
3. Dort steht der **Einladungslink**. Ihn per **WhatsApp**-Knopf oder **Link kopieren** an alle
   schicken, gern auch in die Familiengruppe.
4. Wer den Link öffnet, hat diese Möglichkeiten:
   - **Konto erstellen** bzw. **Anmelden** und dann **🎁 Mitspielen**. Jeder neue Spieler darf erst
     einmal Tageswörter eintragen.
   - **👀 Als Gast zuschauen**: ohne Konto alle Felder, die Rangliste, den Kalender und die Lieder
     ansehen. Gäste bekommen kein eigenes Feld und können nichts eintragen.
5. Auf jedem weiteren Gerät (Handy, Tablet, Laptop) meldet man sich einfach mit Benutzername und
   Passwort an. Das Gerät merkt sich die Anmeldung. Unter dem eigenen Feld kann man das **Passwort
   ändern** und sich **abmelden** (z. B. auf einem Tablet, das sich mehrere teilen).
6. Sind alle dabei, kannst du den Schalter **„Neue Spieler dürfen beitreten“** ausschalten. Wenn der
   Link in falsche Hände geraten ist, erzeugt **„Neuen Link erzeugen“** einen neuen; der alte
   funktioniert dann nicht mehr. Wer schon mitspielt, bleibt dabei.
7. Sobald alle ihre Felder ausgefüllt haben, im Reiter **⚙️ Spiel** den **Schalter „Felder sperren“**
   umlegen. Mit demselben Schalter kannst du jederzeit wieder entsperren.

### Zuschauen ohne Konto

- Im Reiter **⚙️ Spiel** gibt es neben dem Einladungslink einen **Zuschauer-Link**. Wer ihn öffnet,
  landet direkt im Spiel, ganz ohne Anmeldung, kann aber nicht beitreten. Ideal für Verwandte, die
  nur mitfiebern wollen.
- Auch mit dem Einladungslink kann man auf **👀 Als Gast zuschauen** tippen.
- Ohne Link: auf der Startseite **👀 Als Gast zuschauen** antippen und einen Link zum Spiel einfügen.
- Das Gerät merkt sich das Spiel, beim nächsten Öffnen der Seite geht es direkt weiter.
  Oben im Spiel führt **„Anmelden oder mitspielen“** zur Anmeldung.
- Der Zuschauer-Link lässt sich nicht ändern. Wer ihn hat, kann immer zuschauen, solange es das Spiel gibt.

### Mehrere Spiele

- Jeder kann beliebig viele Spiele erstellen und bei beliebig vielen mitspielen.
- **🏠 Meine Spiele** zeigt alle eigenen Spiele (👑 = du leitest das Spiel).
- Im Spiel oben über die **Auswahlliste** direkt zu einem anderen Spiel wechseln.
- Das Feld, die Rangliste, der Kalender und die Lieder gehören immer zu einem Spiel.
- **🚪 Spiel verlassen** (unter dem eigenen Feld) nimmt dich samt Feld aus einem Spiel. Zurück geht es
  nur wieder über den Einladungslink. Die Spielleitung kann ihr eigenes Spiel nicht verlassen, nur löschen.

### Passwort ändern oder vergessen

- Wer sein Passwort noch weiß, kann es unter dem eigenen Feld oder unter „Meine Spiele“ mit
  **🔑 Passwort ändern** jederzeit ändern.
- **Passwort vergessen?** Der Spielleitung Bescheid sagen. Sie tippt im Reiter **⚙️ Spiel** auf der
  Karte des Spielers auf **🔑 Passwort-Link** und schickt den Link (per WhatsApp-Knopf oder kopiert).
  Wer den Link öffnet, legt ein neues Passwort fest und ist gleich angemeldet. Danach meldet man sich
  wie gewohnt mit Benutzername und neuem Passwort an.
- Der Link funktioniert **nur einmal**. Erzeugt die Spielleitung einen neuen, wird der alte ungültig.
  Den Link nur an die betroffene Person schicken, nicht in die Gruppe: Wer ihn hat, kommt in das Konto.
- Wer selbst ein Spiel leitet, kann sich das Passwort von der Spielleitung eines **anderen** Spiels
  zurücksetzen lassen, bei dem er mitspielt. Gibt es keins, lässt sich das Passwort nicht zurücksetzen.
  **Als Spielleitung das eigene Passwort also besonders gut merken.**
- **Konten von vor diesem Update:** Beim ersten Öffnen nach dem Update fragt die Seite einmal nach dem
  Passwort (oder man meldet sich einfach neu an). Erst danach kann die Spielleitung einen Passwort-Link
  erzeugen. Weiß jemand sein Passwort schon nicht mehr und ist auch nirgends mehr angemeldet, hilft nur
  ein neues Konto mit anderem Namen und erneutes Beitreten über den Einladungslink.

> **Gut zu wissen:** Damit das ohne eigenen Server klappt, kann die Spielleitung eines Spiels technisch
> auf die Konten ihrer Mitspieler zugreifen (genau das macht der Passwort-Link möglich). Das eingetippte
> Passwort selbst sieht sie nie. Tritt also nur Spielen von Leuten bei, denen du vertraust; in der Familie
> ist das kein Thema.

### Spieler verwalten (Spielleitung)

Im Reiter **⚙️ Spiel** hat jeder Spieler eine Karte:

- **„Darf Tageswörter eintragen“**: Recht wegnehmen oder wieder geben.
- **Feld ansehen**: das Feld des Spielers aufklappen.
- **🔑 Passwort-Link**: Link erzeugen, mit dem der Spieler ein neues Passwort festlegt (siehe
  „Passwort ändern oder vergessen“).
- **Entfernen**: Spieler samt Feld aus dem Spiel nehmen. Er sieht das Spiel dann nicht mehr in seiner
  Liste und kann nur mit dem Einladungslink wieder beitreten.

Außerdem kannst du dort den **Spielnamen ändern** und die **Weihnachtslieder ein- oder ausschalten**.
Ausgeschaltet verschwindet der Reiter „Lieder“ für alle; schon ausgesuchte Lieder bleiben gespeichert
und sind nach dem Wiedereinschalten wieder da.

## 5. In der Adventszeit

- Im Reiter **📅 Kalender** gibt es 24 Türchen. Tippt man auf eins, sieht man die Wörter des Tages
  und bei wem sie im Feld stehen. Darunter stehen die Lieder des Abends; 🎶 am Türchen zeigt, wie
  viele es schon sind.
- **Alle Spieler** können die Wörter eines Tages eintragen und ändern (sobald das Türchen offen ist,
  also ab dem jeweiligen Dezembertag). Die Spielleitung kann jeden Tag bearbeiten.
- **Mehrere Wörter pro Tag** sind möglich, z. B. „Nikolaus“ und „Weihnachtsmann“. Jedes davon zählt
  als Treffer.
- Beim Eintippen sieht man schon, bei wem das Wort steht, und auch ähnliche Schreibweisen
  (z. B. „Plätzchen“ vs. „Plätzchen backen“).
- **Felder tauschen:** Im eigenen Feld kann man ein Wort auf ein anderes Feld **ziehen**, dann tauschen
  die beiden ihren Platz. Mit der Maus einfach ziehen; am Handy das Feld **kurz gedrückt halten** und
  dann ziehen. Das geht nur, solange die Felder nicht gesperrt sind.
- Im Reiter **👀 Alle Felder** sehen alle jederzeit die Felder der anderen als **Rangliste**,
  mit dem Platz als Zahl (die ersten drei in Gold, Silber und Bronze). Oben wählt man die Wertung:
  - **🎉 Bingos & längste Reihe**: zuerst zählen volle Reihen, Spalten und Diagonalen, bei Gleichstand
    die längste angefangene Reihe (z. B. 4 von 5), dann die Treffer.
  - **🎯 Meiste Treffer**: zuerst zählen die Treffer, dann die Bingos.
  Wer in allem gleichauf ist, teilt sich den Platz.
- Volle Reihen, Spalten oder Diagonalen werden rot-golden markiert, und es gibt Konfetti und „BINGO!“.

### Weihnachtslieder

Im Reiter **🎶 Lieder** wird für jeden Abend (1. bis 24. Dezember) festgelegt, was gesungen wird.
Jedes Spiel hat seinen eigenen Liederpool und seine eigenen Abende. Die Spielleitung kann die Lieder
im Reiter **⚙️ Spiel** ausschalten, wenn sie bei einem Spiel nicht passen.

- Oben die Tage antippen; heute ist vorausgewählt. Pro Abend gibt es **höchstens 3 Lieder**.
- **Lied aussuchen**: Jeder Spieler kann ein Lied aus dem Liederpool wählen und mit **＋** hinzufügen.
  Es steht dann mit seinem Namen (👤) da und bleibt fest, andere Spieler können es nicht austauschen.
  **Eigene ausgesuchte Lieder** kann man mit **✕** wieder entfernen, die von anderen nicht.
- **🎲 Mit Zufallsliedern auffüllen**: füllt die freien Plätze mit zufälligen Liedern aus dem Pool
  (gestrichelt, „🎲 Zufall“). Nochmal drücken („Neu würfeln“) ersetzt die Zufallslieder durch neue.
  Lieder, die an anderen Abenden schon dran sind, kommen seltener.
- Sucht jemand ein Lied aus, obwohl schon 3 Lieder dastehen, fliegt dafür ein Zufallslied raus.
- **📖 Liederpool**: Beim Erstellen eines Spiels mit klassischen deutschen Weihnachtsliedern gefüllt.
  Jeder Spieler kann Lieder ergänzen (es reicht der Name des Liedes) und **seine eigenen Lieder mit ✕
  wieder entfernen** (grün hinterlegt). Lieder von anderen kann man nicht entfernen.
- **Die Spielleitung** kann mit **✕** alle Lieder aus dem Pool und von einzelnen Abenden entfernen.
- Gäste sehen die Lieder nur an. Lieder kann man auch schon für spätere Abende aussuchen.
- **🎲 Alle Abende zufällig auffüllen** (nur Spielleitung, oben im Reiter): füllt an allen 24 Abenden
  die freien Plätze mit Zufallsliedern. Schon eingetragene Lieder bleiben stehen, und die Lieder
  verteilen sich möglichst gleichmäßig über die Abende.

### Spiel zurücksetzen oder löschen (Spielleitung)

Ganz unten im Reiter **⚙️ Spiel**:

- **Spiel zurücksetzen** (z. B. nach einem Probelauf): Nach Eintippen von `RESET` werden alle anderen
  Spieler mit ihren Feldern entfernt, dein eigenes Feld geleert und die Lieder aller Abende gelöscht.
  Auf Wunsch (Häkchen) auch die Wörter im Kalender. Liederpool und Einladungslink bleiben, die Felder
  werden entsperrt. Danach können alle über den Einladungslink neu beitreten.
- **Spiel löschen**: Nach Eintippen von `LÖSCHEN` wird das ganze Spiel gelöscht. Es verschwindet bei
  allen aus der Liste.

**Beides lässt sich nicht rückgängig machen.**

## Tipps für die Mitspieler

- Einfach den Link antippen, es muss nichts installiert werden.
- **Benutzername und Passwort gut merken.** Damit kommt man auf jedem Gerät an seine Spiele.
- **Als App auf den Startbildschirm legen:**
  - iPhone (Safari): Teilen-Symbol → „Zum Home-Bildschirm“
  - Android (Chrome): ⋮ → „Zum Startbildschirm hinzufügen“
- Groß- und Kleinschreibung ist egal, beim Benutzernamen und bei den Wörtern. Die Schreibweise der
  Wörter sollte aber passen („Glühwein“ ist nicht dasselbe wie „Gluehwein“).

## Kosten

Der kostenlose Firebase-Tarif „Spark“ erlaubt 50.000 Lesevorgänge und 20.000 Schreibvorgänge **pro Tag**.
Eine Familie braucht davon nur einen Bruchteil. Es ist keine Kreditkarte nötig, also können keine Kosten entstehen.

## Update auf die neue Version

### Update „Passwort-Link statt E-Mail“

Die freiwillige E-Mail-Adresse gibt es nicht mehr. Ein vergessenes Passwort setzt jetzt die
Spielleitung per Link zurück (siehe „Passwort ändern oder vergessen“).

1. **Zuerst** den Inhalt von `firestore.rules` in Firebase unter **Firestore Database → Regeln**
   einfügen und **Veröffentlichen**. (Mit den alten Regeln klappt das Erstellen neuer Konten nicht.)
2. Dann alle Dateien wieder bei GitHub hochladen.
3. Bisherige Konten funktionieren weiter. Beim nächsten Öffnen fragt die Seite jeden einmal nach dem
   Passwort; erst danach kann die Spielleitung für ihn einen Passwort-Link erzeugen.
4. Wer schon eine E-Mail-Adresse hinterlegt hatte, meldet sich weiter mit dem **Benutzernamen** an.
5. Optional: Unter **Authentication → Templates → SMTP-Einstellungen** kannst du das eigene Postfach
   wieder austragen, falls du es eingerichtet hattest. Es werden keine Mails mehr verschickt.

### Update „Lieder an/aus, Zuschauer-Link“

1. Den Inhalt von `firestore.rules` in Firebase unter **Firestore Database → Regeln** einfügen und
   **Veröffentlichen**.
2. Alle Dateien wieder bei GitHub hochladen.

Bestehende Spiele behalten ihre Lieder (eingeschaltet). Konten und Spiele bleiben unverändert.

### Update „Konten und mehrere Spiele“

Mit diesem Update braucht jeder ein Konto, und Spiele gehören dem, der sie erstellt.
**Die bisherigen Spieler, Felder, PINs, Tageswörter und Lieder werden nicht übernommen**, alle legen sich
ein Konto an und treten dem neuen Spiel bei. Bisherige Spieler-Links und der alte Einladungslink
funktionieren nicht mehr.

1. In Firebase unter **Authentication → Sign-in method** prüfen, dass **E-Mail/Passwort** aktiviert ist
   (war für den alten Spielleiter-Login schon an). Den Anbieter **Anonym** kannst du jetzt deaktivieren.
2. Den Inhalt von `firestore.rules` in Firebase unter **Firestore Database → Regeln** einfügen und
   **Veröffentlichen**.
3. Alle Dateien wieder bei GitHub hochladen (inklusive der neuen Datei `js/settings.js`). Die Datei
   `js/admin.js` gibt es nicht mehr und kann bei GitHub gelöscht werden.
4. Die Seite öffnen, ein Konto erstellen und ein neues Spiel anlegen (siehe Abschnitt 4). Den neuen
   Einladungslink an alle schicken.
5. Optional aufräumen: In Firebase unter **Firestore Database → Daten** die alten Sammlungen `game`,
   `players`, `boards`, `members`, `logins`, `days`, `songs`, `songDays` und `draws` löschen
   (⋮ neben dem Namen → Sammlung löschen). Unter **Authentication → Users** kannst du die anonymen
   Nutzer und den alten Spielleiter-Login löschen. Nötig ist das nicht, die neue Version liest diese
   Daten nicht mehr.
