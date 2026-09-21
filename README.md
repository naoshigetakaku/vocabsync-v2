# VocabSync

A minimal vocabulary notebook. Words live in a Google Spreadsheet, so the same
list appears on every device. No server of your own, no build step, no fees.

The home screen is the open folder's words, by themselves; tap one for its
part of speech, definition and note, or tap the folder name at the top to
switch folders and make new ones. Words in no folder gather under Unsorted,
which appears in that menu only when something is in it. Swipe a word **left**
to archive it and **right** to bring it back; the **All / Archived** tabs show
the folder's live words or the ones put aside.

Along the bottom: **List**, **Cards** — the same words one screen at a time,
shuffled, a tap turning each card over — and **Quiz**, which asks about them on
a spacing that widens each time you get one right. Every word carries a
YouGlish and a DuckDuckGo link, for how it is said and for everything else.

## How it fits together

```
Browser  ──►  Apps Script Web App  ──►  Google Spreadsheet
static files       free API layer          the actual data
```

The spreadsheet is the source of truth. The browser keeps a local copy so the
app opens instantly and still works offline, but that copy can be evicted by
the OS at any time and is never treated as authoritative.

## Setup

### 1. Spreadsheet and backend

1. Create a Google Spreadsheet.
2. **Extensions → Apps Script**, and replace the default `Code.gs` with
   [`apps-script/Code.gs`](apps-script/Code.gs).
3. Change `PASSPHRASE` at the top to something long and random — **in the
   Apps Script editor only**. The copy in this repository is public, so the
   real passphrase must never be written into it. Leave the placeholder where
   it is.
4. Run `setup()` once from the editor and approve the permission prompt.
   Run it again after any future update to this file: it adds new columns to
   an existing sheet without disturbing the rows already in it.
5. **Deploy → New deployment → Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Copy the `/exec` URL.

### 2. Publish the front end

Push this folder to a public GitHub repository and enable **Settings → Pages →
Deploy from a branch**. Nothing needs to be configured or compiled.

### 3. Connect

Open the site. It asks for the Web App URL and the passphrase, verifies them
against the sheet, and stores them on the device.

Afterwards the same sheet is reachable from the control at the top of the
screen, as **Connection**: point the device at a different deployment,
re-enter the passphrase after changing it in `Code.gs`, or disconnect
entirely. Disconnecting clears both values from that device; the words stay in
the spreadsheet.

If the app reports that Apps Script is out of date, the deployment predates a
column the app is already using — a word's known/unknown status, for
instance, gets written nowhere.
Paste the current `Code.gs`, run `setup()`, and deploy a **new version** of the
existing deployment.

Every device does this once. On iOS a page opened in Safari and the same page
launched from the Home Screen have **separate storage**, so each one needs its
own connection.

## Adding it to the iOS Home Screen

Open the site in Safari, tap Share, then **Add to Home Screen**. It then runs
full screen with no browser chrome, and gets its own icon.

Deleting the icon deletes the local cache with it. Nothing is lost — the words
are in the spreadsheet — but the app has to be connected again.

The installed app always keeps the fixed, phone-shaped layout. In a browser
window 700px or wider (iPad or Mac) the layout spreads out instead: a
multi-column word list and larger cards. The switch is the
`display-mode: browser` media query in `css/layout.css`.

## What is in the sheet

One row per word, in a tab called `Words`:

| Column | Field | Notes |
|---|---|---|
| A | `id` | UUID, generated server-side |
| B | `word` | |
| C | `pos` | Verb / Adj / Adv / Noun / Idiom / Expression / Acronym |
| D | `definition` | |
| E | `note` | |
| F | `createdAt` | ISO 8601 |
| G | `updatedAt` | ISO 8601 |
| H | `color` | `default` or one of fifteen hues; see below |
| I | `folder` | Folder name, or blank for unsorted |
| J | `archivedFrom` | The folder a word was archived out of |
| K | `status` | `unknown` for a labelled word, else blank |
| L | `reviews` | Answers given about this word, ever |
| M | `streak` | Right answers in a row |
| N | `labelStreak` | Right answers in a row since the label went on |
| O | `gap` | Answers to wait before asking again |
| P | `ease` | How fast the gap grows for this word |
| Q | `dueTick` | The answer count at which it is due again |
| R | `archived` | `1` for an archived word, else blank |
| S | `lapses` | Answers missed about this word, ever |

`color` is one of sixteen keys — `default` plus fifteen hues. The key is what
is stored, never a hex value, so the same word picks the shade pitched for the
device's current theme.

New fields are always appended on the right. Inserting one in the middle would
shift every existing row's data into the wrong column.

A second tab, `Folders`, is the register of folder names — `id`, `name`,
`createdAt` and a `photo` column left over from an earlier version that nothing
reads. Words point at their folder by **name**, which keeps the sheet readable
by eye; renaming a folder rewrites the column, and deleting one blanks it, so
the words survive as **Unsorted**.

Running `setup()` again after an update appends any missing header to an
existing sheet without touching a row; words saved before a column existed read
back with its default — no colour, no label, nothing asked yet. It also clears
the `known` status a previous version wrote, which no longer means anything.

**Archiving.** `archived` is a column of its own rather than a value of
`status`, so a word can be archived without losing the quiz label that governs
how often it is asked. Archiving never touches `folder`: restoring a word just
clears the flag and it reappears where it always was, with its schedule
intact. `archivedFrom` records that folder anyway, for the one case the folder
column cannot cover — the folder being deleted while the word is away.

Swiping left archives, swiping right restores, and only the swipe that would
change something is offered. Archiving asks first, because it takes a word off
the list, the cards and the quiz at once; restoring does not, because it only
undoes that. Archived is grey rather than red throughout: putting a word aside
is housekeeping, not a verdict on it.

**The label.** `status` is shown nowhere. It survives as the input to the
scheduler: missing a word in the quiz labels it, a labelled word comes round at
0.4× its gap — never more than 10 answers away, and never sooner than the
learning step — ahead of anything else due, and three right answers in a row
clear it.

**The quiz.** The intervals follow Anki's, with answers in place of days: the
clock is the total number of answers ever given (`reviews` summed over every
word), and each word records the count at which it is due again. A new word
comes back after 2 answers, graduates to 10 on the next right answer, and from
there multiplies by its own `ease` — 2.5 to begin with, dropping 0.2 on every
miss and never below 1.3, so an easy word runs 2, 10, 25, 63, 158, 395. A miss
is a lapse: it drops the word back onto the 2-answer step, and the next right
answers walk it out again. Every gap is fuzzed ±5%, so words learnt together do
not stay bunched. Misses are counted in `lapses`.

Nothing due yet? A word never asked is let in, at most one in every four
questions while a backlog is waiting. Counting answers rather than days means a
week away leaves no pile of overdue cards, and a long sitting never runs out.
Answers are applied locally at once and sent to the sheet five at a time
through `updateMany`, so no card ever waits on the network — and nothing is
lost if the app is closed mid-session.

The colour changes the word's own type only — never the definition, the note,
or the part-of-speech badge — and the stored value is the key rather than a hex
code, so the same word picks the right shade in light and dark.

## Updating the code

After changing any file, bump `CACHE_VERSION` in [`sw.js`](sw.js) before
pushing. Without that, devices keep serving the old version out of cache
forever.

The worker updates itself: on the next visit it caches the new shell, takes
over, and the page reloads once. There is nothing to accept.

Two rules in `sw.js` exist because breaking either one bricks the app:

- **The page and its modules must come from one cache generation.** Serving
  fresh HTML from the network while the scripts still come from the previous
  cache pairs new markup with old code, and the old code reaches for elements
  that no longer exist.
- **The updater must survive a broken release.** `start()` in
  [`js/app.js`](js/app.js) registers the worker outside the try/catch that
  wraps the interface, so the code that fetches the fix is never the code that
  just crashed.

To change `Code.gs`: **Deploy → Manage deployments →** edit the existing entry
→ Version: **New version**. That keeps the same URL. Picking "New deployment"
mints a different URL and every device would need reconnecting.

## What you should know about the security model

The deployment is published as "Anyone", which is the only setting that lets a
static page reach it. Apps Script cannot read request headers, so restricting
by domain is impossible. **The passphrase is the only thing protecting the
sheet.** Make it long, and do not put anything sensitive in there.

Leaving `DEFAULT_API_URL` empty in [`js/config.js`](js/config.js) is
deliberate: the deployment URL then never appears in the public repository at
all. Filling it in trades that for one less field during setup.

## Files

| Path | Purpose |
|---|---|
| `index.html` | Markup. No inline styles or scripts. |
| `css/theme.css` | Tokens, light/dark palette, base resets. |
| `css/layout.css` | App shell, header, word list. |
| `css/components.css` | Dialogs, forms, buttons, banners. |
| `css/animations.css` | All motion, plus the reduced-motion escape hatch. |
| `js/config.js` | Constants. |
| `js/storage.js` | Guarded localStorage wrapper. |
| `js/auth.js` | Device-local credentials. |
| `js/api.js` | Transport to Apps Script. |
| `js/store.js` | State, cache, offline outbox. |
| `js/dialog.js` | Animated open/close for `<dialog>`. |
| `js/swipe.js` | Swipe a sheet down to dismiss it. |
| `js/scroll-lock.js` | Freezes the list behind an open dialog. |
| `js/picker.js` | The app's own option list, replacing `<select>`. |
| `js/confirm.js` | Centred confirmation popup. |
| `js/toast.js` | Transient messages. |
| `js/sort.js` | List ordering and its picker. |
| `js/links.js` | The YouGlish and DuckDuckGo pair, shared by three screens. |
| `js/view.js` | Open folder, All / Archived tab, and which tab bar section. |
| `js/list.js` | The word list. |
| `js/folder-menu.js` | The panel under the header: pick, make, rename, delete. |
| `js/folder-form.js` | Renaming a folder. |
| `js/cards.js` | Cards, shuffled; tap to turn one over. |
| `js/quiz.js` | The quiz: what is waiting, and the session. |
| `js/scheduler.js` | When a word comes back, counted in answers. |
| `js/swipe-row.js` | Drag a word left to archive it, right to restore it. |
| `js/detail.js` | Detail dialog. |
| `js/form.js` | Add / edit form. |
| `js/setup.js` | First-run connection sheet. |
| `js/install-hint.js` | iOS Add-to-Home-Screen nudge. |
| `js/app.js` | Bootstrap and wiring. |
| `sw.js` | Offline shell. Bump `CACHE_VERSION` on release. |
| `manifest.json` | PWA metadata. |
| `icons/icon.svg` | Source of the mark. |
| `apps-script/Code.gs` | Backend. Not served — paste into Apps Script. |

## Replacing the icon

`icons/icon.svg` is the source. iOS ignores SVG for Home Screen icons, so PNGs
at 180, 192 and 512 px are also required. Any converter works; keep the same
filenames and the background opaque, since iOS applies its own rounded mask.

## Running it locally

```
python3 -m http.server 8765
```

Then open `http://localhost:8765`. Modules and service workers need a real
origin, so opening `index.html` from the file system will not work.
