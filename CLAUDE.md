# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A family Christmas bingo for the 2026 Advent season. Static site with no build step, no package manager, and no tests. It is hosted on GitHub Pages, and Firebase (Firestore + Auth) is the only backend. The UI, code comments and `ANLEITUNG.md` (the setup guide for the non-developer owner) are in **German**. Keep it that way.

## Running locally

```
python -m http.server 8000
```
Then open `http://localhost:8000/admin.html` (game master) or `index.html?spieler=<code>` (player). ES modules need to be served over HTTP; `file://` does not work. `js/firebase-config.js` points at the **live production project**, so local runs read and write real data.

Firebase SDK modules are imported straight from `https://www.gstatic.com/firebasejs/10.14.1/...`. Keep every import on the same version.

Deploying means uploading the files to GitHub Pages and pasting `firestore.rules` into the Firebase console (Firestore → Regeln). Nothing deploys the rules automatically. When you change the data model, update `firestore.rules` and `ANLEITUNG.md` as well.

## Architecture

- `js/bingo.js`: pure game logic with no DOM or Firebase code (normalizing words, hit masks, bingo lines, ranking, Advent-day helpers, `SEASON_YEAR`).
- `js/ui.js`: shared UI building blocks for both pages (tabs with a sliding indicator, snow/confetti canvas, overlay open/close animation, toast, Advent-calendar HTML, mini grid HTML, and the day-word editor dialog `createDayEditor`).
- `js/songs.js`: the "Lieder" tab shared by both pages (`createSongsView`), including its own Firestore listeners and writes, plus `DEFAULT_SONGS`/`addDefaultSongs` for the initial pool. Pure song helpers (`songId`, `songDayOf`, `pickRandomSongs`, `SONGS_PER_DAY`) live in `bingo.js`.
- `js/app.js`: the player page (`index.html`). `js/admin.js`: the game-master page (`admin.html`).
- `js/firebase.js` / `js/firebase-config.js`: Firebase init plus `ADMIN_UID`.

### Firestore data model and trust model

| Path | Content | Access |
|---|---|---|
| `game/settings` | `{ locked }`: manual lock of all player fields | read all, write admin |
| `game/invite` | `{ code, open }`: secret invite code for `index.html?einladung=<code>`; created by `admin.js` on login | admin only (rules still `get()` it) |
| `players/{code}` | `{ name, boardId, uid?, invite?, pinKey? }`. The doc ID is the **secret** in the player's personal link | `get` by anyone who knows the code; `list`/delete admin only; update by admin, or by the owner (only `pinKey`); create by admin or self-join |
| `logins/{pinKey}` | `{ code, boardId }`: PIN login. Key = SHA-256 of `weihnachtsbingo:{boardId}:{pin}` (`pinKey()` in `bingo.js`) | `get` by anyone (knowing board + PIN = knowing the key); `list` admin only; create only for the own player and only with the key stored in `players/{code}.pinKey`; delete by owner or admin |
| `boards/{boardId}` | `{ name, cells[25], canAddWords }`: public bingo board | read all; create by admin or self-join (empty cells, `canAddWords == true`); the owner may change only `cells`, and only while not locked |
| `members/{uid}` | `{ code, boardId }`: links an anonymous-auth browser to a player | own uid only (admin may delete); created by proving the code (rules check `getAfter(players/{code}).boardId`) |
| `days/{1..24}` | `{ words[], updatedBy, updatedAt }`: words of each Advent day | read all; write by admin or by members whose board has `canAddWords != false` |
| `songs/{songId}` | `{ title, addedBy }`: song pool; doc ID = `songId(title)` slug, which prevents duplicates | read all; create by admin or members; update/delete admin only |
| `songDays/{1..24}` | `{ picked: [{ title, by }], random: [title], updatedAt }`: up to 3 songs per evening | read all; write by admin or any member (not tied to `canAddWords`); members must keep every existing `picked` entry (`hasAll`) and stay at ≤ 3 total |
| `draws/*` | legacy format, migrated away | admin only |

The key design constraint: everyone can see all boards, but the personal links (`players/{code}`) must never be listable by players. Writes are authorized through `members/{auth.uid}`. The invite link offers three choices: join as a new player, log in as an existing player (name + PIN) or watch as a guest. Joining writes `boards/{id}`, `players/{code}` (with `uid`, the `invite` code and `pinKey`), `members/{uid}` and `logins/{pinKey}` in **one batch**, and the rules tie them together with `getAfter()` and check the invite against `game/invite` (`open == true`). Logging in on another device picks a board from the public list, computes `pinKey(boardId, pin)`, reads `logins/{key}` to get the player code and then links the device via `members/{uid}` as usual (each device has its own anonymous uid). Changing the PIN creates the new `logins` doc, deletes the old one and updates `players/{code}.pinKey` in one batch. Guests (`state.guest`, remembered as `bingoGast` in localStorage) only read public data, sign in to nothing and get no "Mein Feld" tab. The admin can toggle `open`, regenerate the code, change `canAddWords` and remove players (deletes board, player, `members/{uid}` of the joining device and `logins/{pinKey}`). Players sign in **anonymously** in the background (`ensureUser()` / `joinGame()` in `app.js`); the admin signs in with email/password, and `admin.js` treats anonymous users as logged out.

On first login, `admin.js` (`maybeMigrate`) migrates legacy data once: it creates `boards` for players without a `boardId`, moves December `draws` into `days` and deletes the old `lockDate`. The player page shows a hint until this has run.

### Songs

Songs a player chooses (`picked`) are fixed for players; random songs (`random`) fill the remaining slots and are replaced when someone picks a song or presses "neu würfeln" again (`pickRandomSongs` prefers songs not used on other days and avoids the previous random ones). All day writes go through a transaction in `changeDay()`. Players may plan songs for any day (no `isDayOpen` check). `admin.js` seeds the pool once and sets `game/settings.songsSeeded`, so deleting songs later does not re-seed them.

### Game rules in code

- Words are compared via `normalize()`, which ignores case and extra whitespace. Spelling still matters ("Glühwein" ≠ "Gluehwein").
- Every word of every day counts as drawn. A day can hold several words (e.g. "Nikolaus" and "Weihnachtsmann"), and each one is its own hit.
- In the player UI, a day's door becomes editable only from that December day of `SEASON_YEAR` (`isDayOpen`). The rules do **not** enforce this, and the admin can always edit.

### Rendering conventions

State is held in a module-level `state` object; Firestore `onSnapshot` listeners update it and call `render()`. To keep animations smooth, the player's own grid is built once and then updated in place (adding `pop` to newly hit cells), and admin player cards are reused by key instead of rebuilt with `innerHTML`. Tab views animate in via the `.enter` class. Every animation must respect `prefers-reduced-motion` (both in CSS and through `reducedMotion()`).
