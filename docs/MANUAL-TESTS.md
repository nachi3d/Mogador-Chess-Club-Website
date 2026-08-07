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
- [ ] **`/contact/` — the WhatsApp CTA opens a chat with the real club number**
      (`+212 6 66 37 77 84`), and the displayed number matches the one the link dials.
      *Check on a phone with WhatsApp installed: a wrong digit here sends a parent to
      a stranger, and nothing on the page would look broken.*

---

## 1b. Navigation menu and board coordinates

### The menu — ⚠️ on a REAL phone, not a narrow desktop window

- [ ] Three groups: **Apprendre**, **S'entraîner**, **Le club**, plus **Accueil**
- [ ] Tapping a group opens it; tapping another closes the first
- [ ] Opening a panel does **not** move the page underneath
- [ ] Tapping outside closes it
- [ ] The group you are inside is highlighted **without** opening anything
      (visit /jouer/ — "S'entraîner" should stand out)
- [ ] Panels are readable and tappable one-handed; nothing runs off the screen
- [ ] Keyboard: Tab to a group, Enter opens, Tab walks the links, Escape closes
      and puts focus back on the group button
- [ ] English nav says Learn / Practise / The club
- [ ] With JavaScript disabled, every nav link is visible and works

### Board coordinates — ⚠️ check at BOTH sizes and BOTH orientations

A constant offset can look plausible at one size and be obviously wrong at
another, which is exactly how the last one survived.

- [ ] Desktop, board at full width: each letter a–h sits centred under **its own**
      file, and **h is fully on the board**
- [ ] Phone, board full-width: same — the letters must not creep right
- [ ] Rank numbers 1–8 line up with their rows
- [ ] A board shown from Black's side (course 1, lesson 4, second board) is also
      correct — the row reverses there
- [ ] Dark mode: coordinates still readable on both square colours

### Not a bug — do not fix this

- [ ] On tutorial steps solved with a rook from a1 (Les cases, La tour), square
      a1 is tinted gold afterwards. That is the **last-move highlight** marking
      where the piece came from. Correct, and the same on any other move

---
## 1c. Boards: pointer play and coordinate legibility

### ⚠️ Solve an exercise BY POINTER in every context — on a real phone

Typing in the move field bypasses the board completely, so a broken board can
look fine to the keyboard. Use fingers only.

- [ ] Tutorial step: tap a piece, tap a square — the move registers
- [ ] Course lesson (e.g. lesson 1): same
- [ ] Course lesson with several boards (Récapitulatif): all three work
- [ ] /exercices/[slug]: same
- [ ] Tapping a piece lights up its legal squares
- [ ] ⚠️ Scroll so the WHOLE board is on screen first. A tap aimed at a square
      that is off-screen does nothing — if a board does not fit comfortably on
      your phone, say so, that is a real problem

### Coordinates in the gutter

- [ ] Letters a–h sit BELOW the board, numbers 1–8 to its LEFT, outside the
      playing squares
- [ ] Each letter is centred under its file; each number beside its rank
- [ ] The squares are still SQUARE, not rectangles
- [ ] Legible in LIGHT mode and in DARK mode
- [ ] Legible on all five board presets (/parametres/)
- [ ] On a phone the board still feels big enough to tap accurately

### Course index

- [ ] /cours/ — clicking anywhere on the "Bien ouvrir une partie" card opens it
- [ ] Tab reaches the card once, with a visible ring; Enter opens it
- [ ] A course with no lessons yet is NOT clickable (it has no page)

---
## 1d. Which board do I play on?

### ⚠️ The two-second test — on a real phone

Open a lesson that has two boards (course 1, lesson 1) and DO NOT read carefully.

- [ ] Within two seconds, is it obvious which board you are meant to play on?
- [ ] The demonstration says *Démonstration — utilise les flèches* and looks quiet
- [ ] The exercise says *À toi de jouer* and looks like the active one
- [ ] If you hand the phone to someone who has never seen the site, do they
      reach for the right board? That is the actual test

### The demonstration

- [ ] *Lancer la démonstration* is an obvious, full-size, filled button
- [ ] Pressing it plays the first move and the button disappears
- [ ] The small arrow controls remain usable throughout
- [ ] Trying to drag a piece on the demonstration does nothing, and no squares
      light up
- [ ] The mouse cursor over the demonstration is a normal arrow, not a pointer
- [ ] Arrow keys still step through it

### The exercise

- [ ] Tapping a piece lights its legal squares, and the move can be completed
- [ ] Typing a move still works
- [ ] Both labels are readable in LIGHT and DARK mode

### Single-board pages

- [ ] /pieges/[slug] shows the demonstration tag (deliberate — the same
      "can I touch this?" question applies with only one board)
- [ ] /exercices/[slug] shows the *À toi de jouer* tag

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

## 6b. Course 1 — `/cours/bien-ouvrir-une-partie/`

### Structure

- [ ] The course index lists **six** lessons, numbered, in order, with no board
- [ ] `/en/cours/bien-ouvrir-une-partie/` shows the same six in English
- [ ] Each lesson has prev/next; lesson 1 has no prev, lesson 6 no next
- [ ] Boards appear **inside** the prose, after the paragraph they illustrate —
      not all bunched at the end
- [ ] Lesson 5 has three separate replayers, one per opening

### ⚠️ The locale-pair check

The `.fr.md` / `.en.md` files collide in the loader unless `generateId` keeps the
locale. If that regresses, both URLs render the **same** language.

- [ ] `/cours/bien-ouvrir-une-partie/roquer-tot/` is in French
- [ ] `/en/cours/bien-ouvrir-une-partie/roquer-tot/` is in English
- [ ] Spot-check one more pair — the bodies must genuinely differ

### The boards

- [ ] Every replayer steps through with the arrows/next button, and the
      commentary changes with the move
- [ ] **Each comment describes the move actually on the board.** This is the
      one to read carefully: an off-by-one would put the right words on the
      wrong move, and it would look completely normal
- [ ] Lesson 6's three exercises each solve, and the ticks persist on reload
- [ ] The keyboard field works on every exercise

### ⚠️ Chess accuracy — Seàn's review

The checker proves the moves are **legal** and the plies are **in range**. It
cannot judge whether the teaching is correct.

- [ ] Lesson 2: is `Nf3` genuinely the best knight move to recommend here?
- [ ] Lesson 4: does the Qh5 line fairly represent why an early queen is bad?
- [ ] Lesson 5: are the three openings the right three for a beginner, and are
      the stated plans accurate?
- [ ] ⚠️ **Lesson 5, ENGLISH — read this one properly.** The FR is Seàn's; the
      **EN prose was written by Claude**, because the brief supplied an
      instruction ("same three sections, translated natively") rather than copy.
      It has had no human read at all. Check it says the same things as the FR,
      and that it reads as English rather than as a translation.
- [ ] Lesson 6 exercise C now asks for a developing move and accepts `Nf3`
      permissively — confirm the task and the accepted answer agree
- [ ] Only ONE exercise in the course is `onlyMove: true` (lesson 3, castling).
      Play a different legal move in any other exercise: it must say "not the
      line we had in mind", never that you are wrong
- [ ] Cross-links land: lesson 4 → Légal's mate, lesson 6 → exercises and the
      beginner tutorial

---

## 7a. The beginner tutorial — `/apprendre-les-bases/`

Written for someone who has never played. The chess is machine-checked; **the
teaching is not** — that judgement is the point of this section.

### Structure

- [ ] `/apprendre-les-bases/` lists **13 steps**, numbered, in order
- [ ] `/en/apprendre-les-bases/` shows the same 13 in English
- [ ] The index shows **no chessboard at all** (the boards live on the steps)
- [ ] Each step has prev/next; step 1 has no prev, step 13 has no next
- [ ] Step 13 offers a way onward — exercises, or play the computer

### The board on each step

- [ ] **Tap a piece: every square it can legally reach lights up.** This is the
      whole teaching mechanism — if it stops working the tutorial is just prose
- [ ] Complete the task → the step is marked solved
- [ ] Play a *different* legal move → it says the move is not what was asked, and
      does **not** call the reader wrong in a way that suggests the move is illegal
- [ ] The keyboard field works on every step (type `Cf3`, `Nf3` or `g1f3`)
- [ ] Reload a solved step: the board resets so it can be replayed, but the page
      greets you as a returning solver
- [ ] Go back to the index: the solved step carries a tick

### Pedagogy — ⚠️ Seàn's review, and only Seàn's

Read the **French** of all 13 steps as though you had never played chess.

- [ ] No word is used before it is explained (check especially *échec*, *pièce*,
      *capturer*, *diagonale*)
- [ ] Sentences are short enough for a 12-year-old, without sounding babyish
- [ ] Step 10 (*la prise en passant*) is genuinely understandable — it is the
      rule that loses people
- [ ] Step 8 makes the difference between **mat** and **pat** unmistakable
- [ ] The English reads as though written in English, not translated from French
- [ ] Nothing is factually wrong about the rules

### Entry points

- [ ] Home: *Nouveau aux échecs ? Commence ici* is visible, below the two main
      buttons and clearly quieter than them
- [ ] `/cours/`: the prerequisite line is at the **top** of the page
- [ ] It is **not** in the nav — that is deliberate; see CLAUDE.md

---

## 7b. Pacing and ambient motion (Session 6)

### The home page

- [ ] The hero shows **Jouer** / **Play** as the primary (green) button, and it lands on `/jouer/`
- [ ] **Découvrir les pièges** / **Explore traps** sits beside it and lands on `/pieges/`
- [ ] Three pillar cards below: **Apprendre → /cours/**, **S'entraîner → /exercices/**, **Jouer → /jouer/**
- [ ] Clicking anywhere on a pillar card follows its link; tabbing reaches each card once
      *(one link per card — if Tab stops twice on a card, the whole-card overlay has regressed)*
- [ ] Chess-piece silhouettes drift slowly behind the hero. **They should be barely
      noticeable** — if you notice them before you notice the heading, they are too strong
- [ ] Scrolling moves the silhouettes at a different rate from the text (parallax).
      *Chromium-only: Firefox/Safari without `animation-timeline` still drift, just without
      parallax. That is expected, not a bug.*
- [ ] **Read the hero text over a silhouette.** It must stay comfortable in BOTH light and
      dark. This is the one thing `check-contrast.mjs` cannot see — see CLAUDE.md for the
      arithmetic and the 0.075 ceiling

### Section reveals

- [ ] `/pieges/`, `/exercices/`, `/cours/`, `/agenda/` — cards fade and rise slightly as you
      scroll to them, staggered a little across a row
- [ ] Scrolling back **up** does not re-hide anything already revealed
- [ ] **Board detail pages have no reveals and no silhouettes** — `/pieges/legal/`,
      `/exercices/mat-du-couloir/`, `/jouer/`. The board is the show there
- [ ] With JavaScript disabled, every page still shows all of its content
      *(the reveal CSS is gated on `html.js` — if content is invisible without JS, that gate broke)*

### The bot must feel like it thinks

- [ ] `/jouer/` at **Débutant** — play a move. The engine's reply takes a beat (roughly half a
      second), it does not appear in the same instant as yours
- [ ] The delay **varies** between moves rather than being metronomic
- [ ] At **Avancé** the engine may take clearly longer on a complicated position. That is
      correct — the delay is a floor, not a cap
- [ ] Pieces are **readable while they move**: you can see which piece went where rather
      than a blur or a jump
- [ ] An exercise with a scripted reply (`/exercices/fourchette-de-cavalier/`) is paced the
      same as `/jouer/` — you should not be able to feel which one has a real engine
- [ ] Stepping a replay (`/pieges/legal/`) feels **snappier** than a played move. Holding the
      arrow key still drops nothing

### Reduced motion

Turn it on at the OS level (Windows: Settings → Accessibility → Visual effects →
Animation effects off; macOS: Accessibility → Display → Reduce motion; or DevTools →
Rendering → Emulate `prefers-reduced-motion`).

- [ ] Silhouettes are **still there** but completely still — the texture stays, the motion goes
- [ ] Section reveals do not animate; content is simply present
- [ ] Board moves are **instant** — pieces appear on their new square with no slide
- [ ] The opponent **still pauses briefly** before replying (~150ms). It should not fire back
      in the same instant. *This is deliberate: with a screen reader the two move
      announcements must not overlap*

---

## 7c. Accounts (v2-S1)

Needs a configured Supabase project. If `PUBLIC_SUPABASE_URL` is unset the sign-in
form says so plainly and everything else on the site still works — check that too.

### ⚠️ The real magic link — the one thing automation does NOT cover

The e2e suite mints links through the admin API and never sends an email. Delivery,
the template and a link opened from a real inbox are only ever checked here.

- [ ] `/connexion/` → enter a **real** address you can read → "Vérifiez votre boîte e-mail"
- [ ] The email actually **arrives** (check spam — the built-in Supabase mailer is
      not domain-aligned yet; see BACKLOG.md)
- [ ] Open the link **on a different device** from the one that requested it. It must
      still sign you in. *(This is the PKCE-vs-implicit decision being verified: with
      PKCE this fails, which is exactly why the flow is implicit.)*
- [ ] You land on `/compte/`, and the address bar has **no `#access_token=…`** left in it
- [ ] Request a second link and click the **first** one again — it must be refused
      cleanly with "Ce lien n'est plus valide", not a blank page

### Signed-in state

- [ ] Header shows **Mon compte** / **My account** instead of **Se connecter**
- [ ] **Reload.** Still signed in, header unchanged
- [ ] Close the tab, reopen the site. Still signed in
- [ ] `/compte/` shows your email, your role, and your first name
- [ ] Change the display name → **Enregistrer** → reload → the new name persisted
- [ ] Switch the language on `/compte/` → reload → it stuck
- [ ] Progress and Attendance sections are visible and marked **À venir** / **Coming soon**

### Sign out

- [ ] **Se déconnecter** returns you to the home page
- [ ] Header is back to **Se connecter**
- [ ] Reload — still signed out (no flicker of an account link on the way)
- [ ] DevTools → Application → Local Storage: **`mcc:auth:v1` is gone**, and so are
      the `sb-…-auth-token` entries

### ⚠️ The guest zero-request check — do this in DevTools, every time

The single easiest thing to break in v2. One stray static import and every reader
downloads the auth client.

- [ ] Open a **private window** (no prior sign-in, so no `mcc:auth:v1`)
- [ ] DevTools → **Network**, filter `supabase`
- [ ] Visit `/`, `/cours/`, `/pieges/legal/`, `/exercices/mat-du-couloir/`, `/jouer/`
- [ ] **Zero requests.** Not one, to any `*.supabase.co` host
- [ ] Clear the filter and confirm no ~200 KB auth chunk is fetched either
- [ ] Now open `/connexion/` — still zero Supabase requests until you **submit** the form

### Privacy policy

- [ ] `/politique-confidentialite/` and `/en/politique-confidentialite/` both load
- [ ] Linked from the **footer of every page**, and from `/mentions-legales/`
- [ ] The minors paragraph is present in both languages
- [ ] Links inside paragraphs are **underlined**, not colour-only

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
