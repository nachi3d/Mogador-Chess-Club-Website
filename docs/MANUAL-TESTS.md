# Manual test checklist — Mogador Chess Club

Run `npm run demo` and work down this list. It builds, clears any stale preview
server, serves the **production build**, and prints the URL.

> **This is a living document.** Every session that adds or changes something a
> visitor can see must update it in the same commit, alongside `CHANGELOG.md`.
> A checklist that lags the site is worse than none: it makes an incomplete pass
> feel complete.

**What this is for.** The Playwright suite already covers everything it can
assert. This list is for what it cannot: whether the thing is actually *usable* —
whether a board is comfortable one-handed, whether an error message reads as
helpful rather than accusing, whether the engine feels beatable. Where a check
duplicates an automated one it is because a human should still look at it.

Legend: **FR** = French page, **EN** = English page. "Both" = do it in each.

---

## 0. Before you start

- [ ] `npm run demo` printed a **branch you meant to test** (it warns in yellow if it is not `dev`)
- [ ] The build completed — no errors, and no warnings you have not seen before
- [ ] The commit line printed matches what you think you are testing

---

## 1. Smoke and i18n

- [ ] `/` loads. Heading is *Mogador Chess Club*, nav is in French
- [ ] `/en/` loads, nav is in English, `<html lang="en">`
- [ ] FR is served at the **root** — no `/fr/` anywhere in the URL bar, ever
- [ ] The language switcher **preserves the path** on every route:
      `/`, `/cours/`, `/pieges/`, `/exercices/`, `/jouer/`, `/agenda/`, `/contact/`,
      `/mentions-legales/`, `/parametres/`
- [ ] Switch FR → EN → FR and land back on the **exact** starting path
- [ ] Nav labels are translated but URLs are not (`/en/pieges/`, `/en/jouer/`) — this is deliberate
- [ ] Footer shows the venue block, the association credit, and the Nachi3D Labs credit
- [ ] No layout breaks between roughly 320 px and a wide desktop

---

## 2. Legal, licence and credits

- [ ] `/mentions-legales/` and `/en/mentions-legales/` both load
- [ ] **Every** page footer has a **Source (GPL)** link to the GitHub repo
      *(this is a licence obligation, not decoration — spot-check home, a trap, an exercise, `/jouer/`)*
- [ ] The footer **Pièces : cburnett** link lands on the credit section, not the top of the page
- [ ] The legal page names: publisher (Nachi3D Labs / Seàn McGannon), host (Cloudflare Pages),
      **Colin M. L. Burnett** with a CC BY-SA 3.0 link, Chessground, Stockfish
- [ ] The **code vs content** licence section is present and reads clearly in both languages:
      code GPL, teaching content CC BY-NC-ND, and the substance/structure distinction
- [ ] The credits table scrolls sideways on a narrow phone **without the page scrolling sideways**
- [ ] Links inside legal prose are **underlined**, not colour-only

---

## 3. Traps — the replayer (`/pieges/legal/`)

- [ ] The trap index shows cards with level badge, ECO and theme chips
- [ ] **The index mounts no board** — no chessboard anywhere on `/pieges/`
- [ ] On the detail page the board appears and the pieces are in the starting position
- [ ] Next / prev / start / end all move the highlighted move in the list
- [ ] Clicking a move in the list jumps straight to it, both forwards and backwards
- [ ] ← and → arrow keys step through the game without clicking the board first
- [ ] Home / End jump to the extremes

### Regressions that have bitten before — check these specifically

- [ ] **Move numbers read `1.`, not `1..`**
      *(a hydration mismatch: the server sends one text node and Preact used to append a second)*
- [ ] **Mash → rapidly, ~15 times.** Every press must count; it must land on `Nd5#` and
      not stop short. Then mash ← back to the start the same way
      *(the handler used to compute its target from a stale cursor and swallow presses)*
- [ ] The final position is **checkmate** and says so; the mated king's square is marked
- [ ] Per-ply commentary changes as you step, and is in the page's language
- [ ] Arrows and circles appear on the plies that have them, and point at pieces that are there
- [ ] The WhatsApp share button opens WhatsApp with a prefilled message and **no recipient**

---

## 4. Exercises

Index — `/exercices/`:

- [ ] Cards show title, level badge, themes and move count; **no board is mounted**
- [ ] Cards link to the detail page

Detail — `/exercices/mat-du-couloir/`:

- [ ] The position renders and it is clear whose move it is
- [ ] **Solve it by dragging** a piece — the board accepts the move
- [ ] **Solve it by tapping** — tap the piece, then tap the destination square
- [ ] Solving shows the success state, the checkmate note, and the replayable solution list
- [ ] Clicking a move in that solution list shows the position at that move

Feedback:

- [ ] **A wrong move** (e.g. Ra7 here) shakes the board, says *"Ce n'est pas le bon coup"*,
      **increments the attempt counter**, and puts the piece back
- [ ] **An illegal move** (drag the rook diagonally) is simply refused — the board does not
      accept it and **the attempt counter does not move**
- [ ] On `/exercices/opposition-et-mat/`, play **Kf7** (a move that also mates):
      it must say *"pas la ligne que nous avions en tête"* and **never** *"pas le bon coup"*,
      and must show the note about other winning moves
      *(this is the rule the whole feature exists to honour — read the wording, do not skim it)*
- [ ] The hint button reveals the hint, and it stays revealed after a reload
- [ ] "Recommencer" resets the attempts to 0 but the exercise stays marked solved

Progress:

- [ ] After solving, `/exercices/` shows a green **Résolu** tick on that card and no other
- [ ] The tick survives a reload
- [ ] Returning to a solved exercise greets you with *"Déjà résolu"*
- [ ] Revealing the tick causes **no layout shift** — the card does not change height
- [ ] **In a private/incognito window**, the whole exercise still works end to end;
      there is simply no tick afterwards, and **nothing errors**
      *(open the console — a storage failure must be silent, not a red wall)*

---

## 5. Keyboard move entry

On any exercise, and on `/jouer/` — **without touching the board at all**:

- [ ] The field is visibly labelled and the help text names the accepted notations
- [ ] **English SAN** works: `Ra8`
- [ ] **French SAN** works: `Ta8` (T = tour), `Cf3` (C = cavalier), `Fc4` (F = fou)
- [ ] **Coordinates** work: `a1a8`
- [ ] Castling works when it is legal: `O-O`, and also `0-0`
- [ ] **Gibberish** (`zzz`) says the move was *not understood* — and does **not** count an attempt
- [ ] **A legal-looking but impossible move** (`Th8` with no rook able to reach) says it is
      *not possible in this position* — a different message, and again **no attempt counted**
- [ ] Editing the field clears the previous error message
- [ ] After the opponent replies, **focus returns to the field** — you can keep typing without
      reaching for the mouse
- [ ] An exercise can be solved from **start to finish** using only the keyboard

---

## 6. Play the computer (`/jouer/`)

### The engine must not load until you ask for it

- [ ] Open DevTools → **Network**, filter `stockfish`, then load `/jouer/` and scroll to the board
- [ ] **Nothing is requested.** No `stockfish.js`, no `stockfish.wasm`
- [ ] Press **Commencer la partie** — *now* both are fetched (~3.6 MB total)
- [ ] Reload and start again: the engine comes from the **service worker cache**, not the network

### Playing

- [ ] **As White**: play `e4`; the computer answers within a few seconds
- [ ] **As Black**: the computer opens before you move at all
- [ ] Moves work by **dragging**, by **tapping**, and from the **keyboard field**
- [ ] The move list fills in correctly, White and Black in the right columns
- [ ] While the computer is thinking the board does not accept moves and says so
- [ ] Try all three levels — **Débutant** should feel genuinely beatable by a beginner,
      **Avancé** clearly should not
      *(these are hand-set skill levels, not measured ratings — judgement call, and worth making)*

### Ending

- [ ] **Resign** ends the game and says you resigned
- [ ] **Nouvelle partie** returns to the colour/level form
- [ ] Starting a second game does **not** re-download the engine
- [ ] Play out a **checkmate** (easiest at Débutant) — it is announced, and says who won
- [ ] If you can, reach a **draw** (stalemate, repetition, or insufficient material) and check the wording
- [ ] Navigate away mid-game — the engine worker must stop
      *(Task Manager / Activity Monitor: no node/renderer stuck at high CPU)*

---

## 7. Themes — `/parametres/`

### Dark mode

- [ ] The header has a sun/moon/auto button. Pressing it cycles **light → dark → system**
- [ ] Its tooltip and accessible name state the **current** mode, not just "change theme"
- [ ] Dark mode looks like *the club room at night* — deep green, cream text, brass that
      catches the light. If it reads as a generic grey dark mode, that is a bug
- [ ] Text is comfortable everywhere: home, a course, a trap, an exercise, `/jouer/`,
      the legal notice, the agenda
- [ ] **No white flash** when navigating between pages in dark mode — watch the transition
      carefully, several times, including a hard reload
- [ ] Choose **system**, then flip your OS between light and dark: the site follows
      **without a reload**
- [ ] Choose light or dark explicitly: the site now ignores the OS setting
- [ ] The choice survives a reload, and applies on every page

### Board themes

- [ ] All five presets are offered with a mini preview each, and the previews look like
      the boards they promise
- [ ] Pick each one and check a real board (`/pieges/legal/`): squares change, and the
      **coordinates stay readable on both square colours** — this is the one to actually
      look at rather than tick
- [ ] The choice persists across pages and reloads
- [ ] Board themes are independent of light/dark: switching mode does not change the board

### Custom colours

- [ ] The two pickers change the preview live, as you drag
- [ ] "Appliquer mes couleurs" applies them to the real board on `/pieges/legal/`
- [ ] The contrast readout shows a number per square and updates as you pick
- [ ] Pick something deliberately awful (a mid-grey such as `#7a7a7a`): the
      **"Lisibilité réduite"** warning appears, and you are still allowed to apply it
- [ ] The warning stays visible while those colours are in use
- [ ] "Revenir au damier choisi" restores the preset that was selected underneath —
      not Classique, unless that was the one
- [ ] Choosing a preset while custom colours are active drops the custom colours

### Mid-game and edge cases

- [ ] **Change the theme mid-game on `/jouer/`**: start a game, make a move, then switch
      mode and board from the settings page in another tab or via the header toggle.
      The board re-skins and **the game is not disturbed** — same position, same move
      list, the engine still answers
- [ ] Change the board theme mid-exercise: the position and attempt count are untouched
- [ ] In a **private/incognito window** the settings page still works for the session;
      nothing errors, the choice simply is not remembered
- [ ] With JavaScript disabled: the site renders in light mode, is fully usable, the
      theme toggle is **absent** (not present-and-broken), and `/parametres/` explains why

---

## 8. Privacy — zero third-party requests

- [ ] DevTools → Network, **hard reload** with the cache disabled
- [ ] On `/`, `/pieges/legal/`, `/exercices/mat-du-couloir/` and `/jouer/`:
      **every** request goes to localhost. No fonts, scripts, images or analytics from anywhere else
- [ ] Application → Cookies: **none**, on any page
- [ ] Start a game on `/jouer/` and re-check: still no external origin

---

## 9. PWA

- [ ] `/manifest.webmanifest` loads and carries the club name and the green theme colour
- [ ] Application → Service Workers: registered and activated
- [ ] Application → Cache Storage: the shell is precached, and **`stockfish.js` / `stockfish.wasm`
      are NOT in the precache** — they appear in `mcc-engine` only after you have played
- [ ] Offline (DevTools → Network → Offline), a previously visited page still loads
- [ ] Install it on a real phone: correct icon, correct name, opens without browser chrome

---

## 10. On a real phone — `npm run demo -- --host`

Same Wi-Fi, open the Network URL the script prints.

- [ ] **The board is usable one-handed** — this is the whole test, and the reason it is here
- [ ] Tapping a piece then a square is comfortable; targets do not feel fiddly
- [ ] Controls are reachable with a thumb; nothing important sits under the browser bar
- [ ] The keyboard field does not get autocapitalised or autocorrected into nonsense
- [ ] Nothing overflows sideways on any page
- [ ] `/jouer/` is usable: the engine loads, and the phone does not become unpleasantly hot
- [ ] **Dark mode on the real screen**, in a dim room: the page is not glaring, the board
      is not glaring either, and the coordinates are still readable at arm's length
      *(an OLED phone shows contrast very differently from a desktop LCD — this is why
      it is checked here and not only in the browser)*
- [ ] Switch mode on the phone while a game is in progress — no flash, no lost game
      *(the engine holds a fixed 64 MiB and runs one thread — it should be fine, but check)*

---

## 11. Accessibility, by hand

axe covers a lot of this automatically; these are the parts it cannot judge.

- [ ] **Tab through a whole page**: focus order is sensible and the focus ring is always visible
- [ ] The skip link appears on first Tab and works
- [ ] With a screen reader, an exercise verdict is announced when it changes
- [ ] Nothing important is conveyed by **colour alone** — the wrong-move feedback also has words
- [ ] With **reduced motion** enabled at the OS level, the board shake and the solve celebration
      do not move — but the feedback is still obvious
- [ ] Zoom the browser to 200%: nothing is cut off or overlapping

---

## Before asking for a merge to `main`

- [ ] `npm run build` — clean
- [ ] `node scripts/check-content.mjs` — green
- [ ] `node scripts/check-contrast.mjs` — green
- [ ] `npx playwright test` — full matrix (see CLAUDE.md for the known environmental flakes)
- [ ] This checklist, worked through on desktop **and** a real phone
- [ ] Lighthouse ≥ 90 on Performance, Accessibility and SEO
