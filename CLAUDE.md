# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A family Christmas bingo for the 2026 Advent season. Static site with no build step, no package manager, and no tests. It is hosted on GitHub Pages, and Firebase (Firestore + Auth) is the only backend. The UI, code comments and `ANLEITUNG.md` (the setup guide for the non-developer owner) are in **German**. Keep it that way.

## Running locally

```
python -m http.server 8000
```
Then open `http://localhost:8000/index.html`. ES modules need to be served over HTTP; `file://` does not work. `js/firebase-config.js` points at the **live production project**, so local runs read and write real data.

Firebase SDK modules are imported straight from `https://www.gstatic.com/firebasejs/10.14.1/...`. Keep every import on the same version.

Deploying means uploading the files to GitHub Pages and pasting `firestore.rules` into the Firebase console (Firestore → Regeln). Nothing deploys the rules automatically. When you change the data model, update `firestore.rules` and `ANLEITUNG.md` as well.

## Architecture

Everything runs on one page, `index.html`. `admin.html` only redirects there (old bookmarks).

- `js/bingo.js`: pure game logic with no DOM or Firebase code (normalizing words, hit masks, bingo lines, ranking, Advent-day helpers, `SEASON_YEAR`, account helpers `cleanName`/`isValidName`/`accountEmail`/`nameKey`/`loginKey`/`isValidEmail`/`isAccountEmail`, `gameIdFrom`, `songsEnabled`, `swapCells`).
- `js/ui.js`: shared UI building blocks (tabs with a sliding indicator that skip `hidden` buttons and expose `refresh()`, snow/confetti canvas, overlay open/close animation, toast, `copyText`, password eye toggles `initPasswordToggles`/`resetPasswords`, pointer-based drag & drop for the own grid `enableCellDrag`, Advent-calendar HTML, mini grid HTML, and the day-word editor dialog `createDayEditor`).
- `js/songs.js`: the "Lieder" tab (`createSongsView`, `start(gameId)` returns an unsubscribe function), plus `DEFAULT_SONGS`/`seedDefaultSongs(gameId, uid)`. Pure song helpers (`songId`, `songDayOf`, `pickRandomSongs`, `SONGS_PER_DAY`) live in `bingo.js`.
- `js/settings.js`: the owner-only "Spiel" tab (`createSettingsView`): lock, rename, songs on/off, invite link, watch link (`watchLink`), player cards, reset and delete game.
- `js/app.js`: screens (auth, "Meine Spiele", invite, game), game switching and the player views.
- `js/firebase.js` / `js/firebase-config.js`: Firebase init.

### Accounts

Every player has a Firebase email/password account. Users type only a **username**; `accountEmail(name)` turns it into a made-up address (`u-<sha256 of normalize(name)>@weihnachtsbingo.example.com`), so usernames are unique and case-insensitive, and no mail is ever sent (so passwords cannot be reset, only changed while logged in via re-authentication). `users/{uid}` holds the display name and the list of game IDs.

Optional real email (for password reset): `verifyBeforeUpdateEmail` turns the account's synthetic address into the real one after the user clicks the link. Because login still uses the username, `logins/{loginKey(name, password)}` (PBKDF2 of name + password, so only someone who knows both can read it) stores `{ email, alt?, uid }`; `alt` is the previously confirmed address while a new one is pending. `signInWithName()` tries the stored addresses, then the synthetic one. `syncLoginKey()` rewrites the doc after every login, password change and email change (after a reset by email the old key is stale, so the user logs in once with the email address, which the login field accepts). `names/{nameKey(name)}` reserves the username once the synthetic address is freed; registration checks it first. `users/{uid}` additionally holds `email` and `loginKey`. A stored email can be changed but not removed.

Guests without an account can watch any game whose ID they know: the watch link `index.html?spiel=<g>&zuschauen=1` opens it directly, the auth screen offers "Als Gast zuschauen" (with a paste-the-link form when the URL has no game), and the last watched game is remembered as `bingoGast` in localStorage.

### Firestore data model and trust model

| Path | Content | Access |
|---|---|---|
| `users/{uid}` | `{ name, games[], email?, loginKey? }`: display name (fixed after create), the user's games, optional email | own uid only; update only `games`, `email`, `loginKey` |
| `names/{nameKey}` | `{ uid }`: reserved username (only written when adding an email) | `get` by anyone; create/delete by that uid |
| `logins/{loginKey}` | `{ email, alt?, uid }`: username login for accounts with a real email | `get` by anyone, no `list`; create/update/delete by that uid |
| `games/{g}` | `{ name, owner, ownerName, locked, songsEnabled, songsSeeded, createdAt }`. `owner` (creator) is the game master; `songsEnabled` missing = on | `get` by anyone, `list` by nobody; create with `owner == auth.uid`; update (`name`, `locked`, `songsEnabled`, `songsSeeded`) and delete by owner |
| `games/{g}/private/invite` | `{ code, open }`: secret invite code for `index.html?spiel=<g>&einladung=<code>` | owner only (rules still `get()` it) |
| `games/{g}/members/{uid}` | `{ invite, joinedAt }`: private proof of invitation | read/delete by self or owner; create by self with a valid open invite, only together with the board (`existsAfter`) |
| `games/{g}/boards/{uid}` | `{ name, cells[25], canAddWords }`: public bingo board; doc ID = account uid | read all; create by self (empty cells, name = `users/{uid}.name`) if owner or with a `members` doc in the same batch; self may change only `cells` while not locked; owner may change only `canAddWords`; delete by self (leave) or owner (remove) |
| `games/{g}/days/{1..24}` | `{ words[], updatedBy, updatedAt }` | read all; write by owner or by players whose board has `canAddWords != false` |
| `games/{g}/songs/{songId}` | `{ title, addedBy, addedByUid }`: song pool; doc ID = `songId(title)` slug | read all; create by owner or players (`addedByUid == auth.uid`, only while `songsOn(g)`); delete by the adder or the owner |
| `games/{g}/songDays/{1..24}` | `{ picked: [{ title, by, uid }], random: [title], updatedAt }`: up to 3 songs per evening | read all; write by owner or any player (players only while `songsOn(g)`); players may only add or remove `picked` entries carrying their own `uid` (`allMine()` on both `removeAll` diffs) |

Old top-level collections (`game`, `players`, `logins`, `boards`, …) from the previous single-game version are no longer read or covered by the rules.

Flows (all multi-doc writes are **one batch** so the rules can cross-check with `getAfter()`/`existsAfter()`):
- Create game: `games/{g}` + `private/invite` + own `boards/{uid}` + `arrayUnion` in `users/{uid}.games`; then `seedDefaultSongs` sets `songsSeeded` (retried when the owner opens the game).
- Join via invite: `boards/{uid}` + `members/{uid}` (with the invite code) + `arrayUnion`.
- Leave: delete board + member + `arrayRemove`. The owner cannot leave, only delete the game.
- Owner removes a player: delete board + member. The removed player's `users.games` is cleaned up by their own client when it sees a server snapshot without its board (`render()` in `app.js`); deleted games are cleaned up the same way (`gameGone()`, `loadGameInfos()`).
- Reset (`resetGame()` in `settings.js`): unlock, delete other boards, members, `songDays` (optionally `days`), clear the owner's cells. Delete game: all subcollections, then the game doc.

Switching games happens in place: `openGame()` unsubscribes everything in `gameUnsubs` (`closeGame()`), resets the per-game state and subscribes again. The settings listener is started only for the owner. The songs listener is separate (`songsUnsub`): `syncSongs()` in `render()` starts or stops it whenever `songsEnabled(game)` changes, and the "Lieder" tab plus the song info in calendar and day editor (`daySongs()`) are hidden while songs are off.

### Songs

Songs a player chooses (`picked`) are fixed for other players; random songs (`random`) fill the remaining slots and are replaced when someone picks a song or presses "neu würfeln" again (`pickRandomSongs` prefers songs not used on other days and avoids the previous random ones). All day writes go through a transaction in `changeDay()`. Players may plan songs for any day (no `isDayOpen` check) and remove their own picked songs and pool songs; the owner may remove everything and fill all days at once.

### Game rules in code

- Words are compared via `normalize()`, which ignores case and extra whitespace. Spelling still matters ("Glühwein" ≠ "Gluehwein").
- Every word of every day counts as drawn. A day can hold several words (e.g. "Nikolaus" and "Weihnachtsmann"), and each one is its own hit.
- Ranking (`ranking(boards, drawn, mode)` with `RANKING_MODES`): `"lines"` = bingos (rows, columns and both diagonals), then `bestLine` (most hits in one line), then hits; `"hits"` = hits, then bingos, then `bestLine`. Ties in all keys share a `rank` (1, 1, 3). The player picks the mode in "Alle Felder" (stored as `bingoRanking` in localStorage); the owner's player list always uses `"lines"`.
- In the player UI, a day's door becomes editable only from that December day of `SEASON_YEAR` (`isDayOpen`). The rules do **not** enforce this, and the owner can always edit.

### Rendering conventions

State is held in a module-level `state` object; Firestore `onSnapshot` listeners update it and call `render()`. To keep animations smooth, the player's own grid is built once and then updated in place (adding `pop` to newly hit cells), and the owner's player cards are reused by key instead of rebuilt with `innerHTML`. Cell swaps via drag & drop also swap `state.prevMask` so moved hits do not replay the pop animation. Tab views animate in via the `.enter` class. Every animation must respect `prefers-reduced-motion` (both in CSS and through `reducedMotion()`).
