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
- `js/app.js`: the player page (`index.html`). `js/admin.js`: the game-master page (`admin.html`).
- `js/firebase.js` / `js/firebase-config.js`: Firebase init plus `ADMIN_UID`.

### Firestore data model and trust model

| Path | Content | Access |
|---|---|---|
| `game/settings` | `{ locked }`: manual lock of all player fields | read all, write admin |
| `players/{code}` | `{ name, boardId }`. The doc ID is the **secret** in the player's personal link | `get` by anyone who knows the code; `list`/write admin only |
| `boards/{boardId}` | `{ name, cells[25], canAddWords }`: public bingo board | read all; the owner may change only `cells`, and only while not locked |
| `members/{uid}` | `{ code, boardId }`: links an anonymous-auth browser to a player | own uid only; created by proving the code (rules check `players/{code}.boardId`) |
| `days/{1..24}` | `{ words[], updatedBy, updatedAt }`: words of each Advent day | read all; write by admin or by members whose board has `canAddWords != false` |
| `draws/*` | legacy format, migrated away | admin only |

The key design constraint: everyone can see all boards, but the personal links (`players/{code}`) must never be listable by players. Writes are authorized through `members/{auth.uid}`. Players sign in **anonymously** in the background (`joinGame()` in `app.js`); the admin signs in with email/password, and `admin.js` treats anonymous users as logged out.

On first login, `admin.js` (`maybeMigrate`) migrates legacy data once: it creates `boards` for players without a `boardId`, moves December `draws` into `days` and deletes the old `lockDate`. The player page shows a hint until this has run.

### Game rules in code

- Words are compared via `normalize()`, which ignores case and extra whitespace. Spelling still matters ("Glühwein" ≠ "Gluehwein").
- Every word of every day counts as drawn. A day can hold several words (e.g. "Nikolaus" and "Weihnachtsmann"), and each one is its own hit.
- In the player UI, a day's door becomes editable only from that December day of `SEASON_YEAR` (`isDayOpen`). The rules do **not** enforce this, and the admin can always edit.

### Rendering conventions

State is held in a module-level `state` object; Firestore `onSnapshot` listeners update it and call `render()`. To keep animations smooth, the player's own grid is built once and then updated in place (adding `pop` to newly hit cells), and admin player cards are reused by key instead of rebuilt with `innerHTML`. Tab views animate in via the `.enter` class. Every animation must respect `prefers-reduced-motion` (both in CSS and through `reducedMotion()`).
