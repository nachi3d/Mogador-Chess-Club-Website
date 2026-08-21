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

## 0b. Does it feel like a game? — ⚠️ THE TWO QUESTIONS, ON A REAL PHONE

Everything else in this document asks *does it work*. This section asks *does it
feel right*, and it is the only part a passing test suite cannot answer. Specs
can prove a duration is 150ms; they cannot prove 150ms is the right number.

Do this section **first**, before you have looked at anything else — the answers
are about first impressions and you only get one.

### Q0 — Does the home page feel like opening a game? — ⚠️ AND is the club's purpose clear to an adult in five seconds?

Two questions that pull in opposite directions, which is exactly why they are
asked together. Open `/` on a phone, cold.

**The game half:**

- [ ] Does the first screen read as a **main menu** — title, a stack of choices —
      rather than as a web page with links on it?
- [ ] Move the selection with ↑ / ↓. A small **knight** marks the line you are
      on. Does it feel like a cursor moving, or like six things lighting up?
- [ ] Enter follows the selection. Home and End jump to the ends; the selection
      wraps around, as a game menu does
- [ ] **No scrolling to reach any entry**, on the smallest phone you have.
      Rotate to landscape and check again — that is the tightest case
- [ ] Every entry is comfortable to hit with a thumb

**The adult half — ask someone who has never seen the site:**

- [ ] Hand them the phone for **five seconds**, then take it back. Can they say
      what this is and who it is for? If they cannot, the sentence under the menu
      is the thing to fix — it is the only descriptive text above the fold
- [ ] Scroll down. Is there enough there for a parent deciding whether to bring
      their child — and for Google?
- [ ] ⚠️ **The menu labels and the header nav labels are the same words.** Open
      the nav and compare, in both languages. Two names for one destination reads
      as two different sites

**"Reprendre" — the detail that makes it a game:**

- [ ] On a browser that has never used the site: **five** entries, no Reprendre
- [ ] Start a tutorial step, get one move wrong, go home: **Reprendre** appears,
      first in the list, and takes you back to that step
- [ ] Finish that step, go home: Reprendre now points at the **next** one
- [ ] Skip ahead — do a later lesson — then go home. It resumes at the **furthest**
      point you reached, not the earliest thing you skipped
- [ ] DevTools → Application → Local Storage → delete `mcc:progress:v1`, reload:
      Reprendre is gone and the menu is otherwise untouched
- [ ] Set `mcc:progress:v1` to `not json` by hand, reload: still five clean
      entries, **nothing in the console**

**With JavaScript disabled** (DevTools → Settings → Debugger → Disable JS):

- [ ] **Five** entries, all visible, all clickable. No Reprendre — that is
      correct, not a bug: progress cannot be read without JavaScript
- [ ] Tab reaches each of the five in turn
- [ ] The descriptive section below still renders in full

### Q1 — Does the site feel alive within five seconds of landing?

- [ ] Open `/` on a phone and **do nothing** for five seconds. Is there any sense
      of the page being alive, or does it read as a printed poster?
- [ ] The drifting silhouettes behind the hero: can you *notice* them if you look,
      and *forget* them while reading the heading? Both must be true.
      *(They were 47–71s before E1 — imperceptible. They are 13–20s now. If they
      have overshot into distracting, the number to change is the period, in
      `HeroAmbient.astro`.)*
- [ ] There are **two** layers of pieces now. Can you see depth — some drifting
      further than others — or does it read as one flat field?
- [ ] Do it again in **dark mode**. Light mode was the flatter of the two and got
      the bigger share of the second layer; check that dark has not become busy.

### Q2 — Does a correct move FEEL satisfying on a phone?

Open `/exercices/mat-du-couloir/` on a real phone and solve it.

- [ ] The moment the piece lands: does the square you moved to acknowledge it?
      A brief brass ring, then gone.
- [ ] Is the ring **brief enough**? It must not still be there when you look back.
- [ ] The move counter hops as it advances. Small — a nod, not a jump.
- [ ] The solve lands in **two beats**: the frame settles, *then* the badge
      arrives. You should be able to feel the gap. If it reads as one event, the
      delay is not working.
- [ ] **Is it satisfying without being loud?** No confetti, nothing bounces, the
      board itself does not shimmer. If any of it feels like a slot machine, say
      so — that is the failure this section exists to catch.
- [ ] Press any button and hold: it should move *down* and its shadow should
      close up, like a key. A button that only changes colour is a failure.

### And the one that overrides all of it

- [ ] **Is the board still calm?** Look at a trap replayer and an exercise board
      with fresh eyes. The rule is that motion lives *around* the board. If the
      board itself has started to feel busy, that is a defect regardless of how
      good anything else feels.

---

## 0c. ⚠️ THE PHONE IS THE PRIMARY DEVICE — M1/M2

**On a real phone.** A narrow desktop window gives you the layout but not the
thumb, and the thumb is the whole point of moving navigation to the bottom.

### The two-second test

- [ ] Open the home page. **Within two seconds, is it obvious what to do next?**
      There should be exactly one big coloured card and it should say either
      *Jouer une partie* or *Reprendre — <lesson>*. If your eye has to choose
      between two things of similar weight, the hierarchy has failed
- [ ] Is the primary card **fully visible without scrolling**?
- [ ] A returning student: does *Reprendre* name the lesson they actually
      stopped on, and does the bar show roughly the right amount?

### Thumb reach

- [ ] Hold the phone one-handed, as a teenager would. **Can you reach all four
      bar entries with your thumb without shifting your grip?**
- [ ] Tap each one. They respond immediately and the press is felt (the card
      and the bar entry both move slightly)
- [ ] The active entry is obvious at a glance — colour *and* the rule above it
- [ ] ⚠️ **On an iPhone with a gesture bar**: the bar sits ABOVE it, not
      underneath. Tapping the bottom row never triggers the home gesture instead
- [ ] Scroll a long page (a lesson, the legal notice) to the very bottom.
      **Nothing is hidden behind the bar** — the last line clears it
- [ ] The bar **never disappears** while scrolling, in either direction

### The dashboard in all four themes

- [ ] Switch through **Bois, Marbre, Souiri, Terminal**, light and dark, and
      look at the home page in each. The dominant card must stay obviously
      dominant and the text on it must stay comfortable to read
- [ ] ⚠️ In **Terminal**, the primary card is inverse video (bright fill, dark
      text) and the corners are square. That is deliberate — rounded corners on
      a phosphor terminal would be the one detail that says "phone app"
- [ ] The little board motif in the corner of the two tiles follows your theme
      AND your board preset. It must stay a background detail — if it competes
      with the card's words, it is too strong
- [ ] The *Prochaine séance* line shows the next real session, with its venue

### The reduced header

- [ ] The header is **one line**: club name, theme button, language button.
      No nav, no settings gear
- [ ] It takes a small fraction of the screen — nothing like the third it used
      to take
- [ ] Rotating to landscape and back does not break either the header or the bar

### And on desktop, nothing changed

- [ ] At a desktop width the **retro menu and the grouped header are exactly as
      they were**. The bottom bar is absent
- [ ] The **settings gear** is in the header, beside the theme and language
      buttons, and reaches `/parametres/` without scrolling to the footer
- [ ] Resize the window slowly across 768px: the two layouts swap cleanly, and
      neither appears twice

---

## 0d. ⚠️ WALK A FULL LESSON ON A PHONE — M3

**The question, and it is the whole section:** *does anything require zooming,
hunting, or scrolling back?* Start at `/` and go all the way through one lesson
to the next one, on a real phone, without touching the address bar.

- [ ] From the dashboard, reach a course, then a lesson, using only what is on
      screen. Nothing needed a pinch or a horizontal scroll
- [ ] Every card is **full width, left-aligned, with a real shadow** and the
      same corner radius as the dashboard's cards. Moving from home to `/cours/`
      does not change the shape of the objects
- [ ] Press a card: it **pushes flat** and springs back — the same press as a
      button, on a surface that starts raised
- [ ] The board is reachable and **fully visible when you go to play on it** —
      you never tap a square you cannot see
- [ ] Prev/next at the end of the lesson are reachable, and **nothing hides
      behind the bottom bar** — scroll to the very bottom and check the last
      line clears it
- [ ] At **360px** as well as 390px. The header wraps to two lines at 360px
      (97px vs 61px) — known, not yet fixed

### The exercise controls, compacted — M3 (suite)

The block used to be 799px against 791px of usable screen at 390×844, of which
the board was only 333px. The controls were compacted; **the board was not
touched**. Measured after: 618px at 390×844, 615px at 360×640.

- [ ] Under the board there is **ONE dense row**: `COUP n / n`, `ESSAIS n`, and
      the *Afficher l'indice* button, all on the same line. Not three stacked
      blocks
- [ ] The board is **the same size as before** — it fills the column, and a
      square is still comfortable to tap
- [ ] Play a wrong move: the verdict panel appears **without the move field
      jumping up or down**. The reserve is smaller on a phone than on a desktop
      because the panel is full-width here, but it is still reserved
- [ ] After a wrong move, **Recommencer joins the same row** beside the hint
      button. Both are still ≥44px
- [ ] Reveal the hint: the button is replaced by the hint panel, full width,
      and the row keeps the counters
- [ ] ⚠️ **The notation help line under the move field is hidden until you tap
      into the field**, then appears. It is *clipped*, not removed — a screen
      reader still announces it as the field's description. Check with
      VoiceOver/TalkBack if you can
- [ ] Solve it: the solution list appears full width, and the row still holds
      the counters and *Recommencer*
- [ ] **On a desktop (≥768px) none of this applies** — the controls are still a
      stack, the hint button still sits below the verdict panel, and the help
      line is plainly visible. If a desktop looks like a phone, that is the
      regression

### A way out at the END of the page — M3 (suite)

Trap and exercise pages had a back link at the top only, so finishing one on a
phone meant scrolling ~2 300px back up to leave.

- [ ] `/pieges/legal/` — scroll to the bottom: **← Tous les pièges** sits beside
      the WhatsApp button, clears the bottom bar, and is a comfortable target
- [ ] `/exercices/mat-du-couloir/` — same, **← Tous les exercices**
- [ ] Both in English (`/en/…`), same words as the link at the top of the page

### The index tells you where you stopped

- [ ] On a fresh device every card reads **"Pas encore commencé"** — quiet, not
      shouted, and it is a true statement rather than a placeholder
- [ ] Attempt an exercise and get it wrong, then go back to `/exercices/`: that
      card now reads **"En cours"**. This is the state that did not exist before
- [ ] Solve it: **"Résolu"** with a tick, on a green fill
- [ ] A course card on `/cours/` shows **"En cours"** while any lesson exercise
      is unsolved, and **"Terminé"** only when they all are
- [ ] Same three states on `/apprendre-les-bases/`
- [ ] ⚠️ In **all four themes, light and dark**: the "En cours" outline and the
      "Résolu" fill are both legible. No text on those fills may be faded —
      an alpha over an audited pair is invisible to `check-contrast.mjs`
- [ ] Turn JavaScript off: every card still reads "Pas encore commencé" and
      nothing is broken or blank

### "Reprendre" is now on four pages — M3 (suite)

One resolver, four journeys. They can legitimately name different steps: `/`
walks the tutorial then the lessons, `/cours/` the lessons alone, `/exercices/`
the exercises alone, and `/progres/` all three.

- [ ] On a **fresh device**, none of the three index pages shows a resume card.
      Nothing is claimed that is not known
- [ ] Start a lesson exercise and leave it. `/cours/` now shows **REPRENDRE —
      <that lesson>** above the card list, with a tally and a bar
- [ ] `/exercices/` shows one only once you have touched an exercise, and it
      names the exercise
- [ ] ⚠️ **Nothing on the page jumps when the card appears.** Reload a few
      times and watch the first card of the list — it must not shift down
- [ ] Turn JavaScript off: no resume card anywhere, and every index is still
      fully usable
- [ ] The home page behaves **exactly as before** — the retro menu's sixth entry
      on desktop, the dominant "Reprendre" card on a phone. This was an
      extraction, so any change here is a regression

## The progress page has substance — M3 (suite)

`/progres/` used to be three bars and an empty-state button.

- [ ] With nothing stored: every count reads **0 sur N** — real, not blank — and
      **La suite** names the first three steps of the journey as links. No
      "vous n'avez rien commencé" sentence, because the page now shows you
      where to start instead
- [ ] It works with **JavaScript off**: the counts sit at zero and the three
      "La suite" links are real and correct
- [ ] Solve a few things. The three bars move, **Exercices par niveau** counts
      only levels that actually contain an exercise, and **Exercices par thème**
      shows a chip per theme with `n/m`
- [ ] **La suite** now names the first three things you have *not* finished —
      and note it can differ from the resume card, which resumes the FURTHEST
      point rather than the earliest gap. Both are correct
- [ ] **Rang et points · bientôt** — it says "bientôt" and prints no number.
      ⚠️ If a rank or a score ever appears here without something computing it,
      that is the site inventing a fact about a student
- [ ] Finish everything: the list is replaced by **"Vous avez tout terminé."**
- [ ] Both locales, all four themes, light and dark

---


## 0e. ⚠️ M4 — FIVE SECTIONS, AND KNOWING WHERE YOU ARE

⚠️ **THE ONE QUESTION THIS SECTION EXISTS FOR, and it is the last item below:
from a lesson three levels deep, can you get back to where you came from
without the browser button?** Everything else here is checking the parts; that
is checking the thing.

Do it on a **real phone**, in French, at arm's length. `npm run demo -- --host`.

### The bar

- [ ] Five entries: **Accueil · Apprendre · Jouer · Moi · Réglages**
- [ ] Every one is comfortably thumb-sized. ⚠️ **No label is clipped or
      ellipsised** — check "Apprendre" and "Réglages" specifically, and check EN
      where "Settings" is the long one
- [ ] It does not move or hide when you scroll
- [ ] Nothing on any page hides behind it, including the last footer line
- [ ] On a notched phone the bar's background reaches into the gesture area —
      no strip of page colour underneath it

### Each entry is a SECTION, not a shortcut

- [ ] **Apprendre** lands on a chooser with four cards: Les bases, Leçons,
      Exercices, Pièges. ⚠️ **Not** straight into the courses
- [ ] Each card says what is behind it AND how far you have got — "0 sur 18
      leçons terminées". ⚠️ **A chooser that only lists names has lost the
      point**; if the state lines are missing, the resolver is not running
- [ ] Solve an exercise, come back: the exercises card counts it
- [ ] **Moi** lands on a chooser: Ma progression, Réglages, and Mon compte when
      accounts are on
- [ ] **Réglages** lands on the settings page — theme, sound
- [ ] Every card opens something. ⚠️ **A card that does nothing is worse than an
      absent one**

### ⚠️ The active tab is right at EVERY depth

Walk down and watch the bar, without tapping it:

- [ ] `/apprendre/` → **Apprendre** lit
- [ ] Leçons → a course → a lesson inside it → **Apprendre** still lit, three
      levels down
- [ ] A trap, an exercise, a tutorial step → **Apprendre** still lit
- [ ] `/progres/` → **Moi** lit, not Apprendre
- [ ] ⚠️ **A tutorial step must light Apprendre without the hub swallowing it** —
      if `/apprendre-les-bases/…` and `/apprendre/` ever both look active,
      something dropped a trailing slash

### ⚠️ The trail — the way up says where it goes

- [ ] Every page below a landing has a **‹ Something** at the top, and the
      Something is the **parent's own name**
- [ ] On a lesson it reads **‹ Bien ouvrir une partie** — the course, by name.
      ⚠️ Not "Retour", not "Toutes les leçons"
- [ ] On an exercise: **‹ Exercices**. On a trap: **‹ Pièges**
- [ ] On the courses index: **‹ Apprendre**
- [ ] Tapping it lands where the label said. ⚠️ **If it goes somewhere else, the
      label is the bug, not the destination**
- [ ] It is easy to hit with a thumb without aiming
- [ ] ⚠️ **The five landings and the home page have NO trail** — the bar is
      already their way out, and a back link there is clutter
- [ ] On a lesson, prev/next is still at the foot AND the trail is at the top.
      ⚠️ **Two different controls** — one moves along the sequence, one leaves it

### ⚠️ THE QUESTION

- [ ] Open the site fresh. Go Apprendre → Leçons → a course → a lesson. Read a
      bit. **Now get back to the course, and then to Apprendre, without the
      browser's back button and without guessing.** If you hesitate at any
      step, say where — that hesitation is the bug this whole section is for

### Both themes, both modes, and the guest

- [ ] Walk the bar, `/apprendre/` and a lesson in **Terminal dark** and **Bois
      light**. Every card border, the active tab's rule and the trail chevron
      are visible in both
- [ ] With `prefers-reduced-motion` on, the bar and the cards still respond to a
      press — feedback is never removed, only made instant
- [ ] Signed out (or with accounts off): the bar is still the **same five
      entries**. ⚠️ **A bar whose shape changes with sign-in state is a bar
      nobody can learn**
- [ ] Desktop: the header is unchanged apart from **Vue d'ensemble** in the
      Apprendre group and **Moi** where "Progrès" used to be. Nothing else moved

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

### The frame

- [ ] The gold frame goes all the way round the board AND its coordinates —
      the rank numbers and file letters are INSIDE it, not cut by it
- [ ] The gap between the frame and its contents looks even on all four sides
- [ ] Still true after solving an exercise, and after a refused move
- [ ] Still true on a phone and on a desktop
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

#### ⚠️ Every card opens — on all three indexes

The rule: **a card that renders has a destination.** `/cours/` used to show
"Les bases : le plateau et les pièces" as a card that did nothing when clicked,
because that course had no lesson pages. An inert card reads as a broken site,
not as "unavailable", so the state no longer exists.

- [ ] `/cours/`, `/pieges/`, `/exercices/` — **click every card**. Each opens a
      real page. None is inert, and none 404s.
- [ ] Same in English: `/en/cours/`, `/en/pieges/`, `/en/exercices/`
- [ ] `/cours/` shows **no** "Les bases" card. The tutorial is reached from the
      prerequisite line at the top ("Jamais joué ? Commence par apprendre les
      bases."), and from there **only** — one destination, one name on the page
- [ ] The prerequisite line still goes to `/apprendre-les-bases/`, and the
      tutorial index still lists its 13 steps

### v2-S4 — the role boundary and the admin surfaces

**The surfaces ARE built** (part 2), and they are only reachable in a build with
`PUBLIC_AUTH_ENABLED=true`. ⚠️ **Walking them needs a test project, a seed and a
prof role — the whole procedure is [`docs/LOCAL-ACCOUNTS.md`](./LOCAL-ACCOUNTS.md),
which is the single source for it.** Do not improvise the environment: `.env.local`
holds the PRODUCTION project, and a hand-typed build wired to it would create real
accounts in the live club's database.

What belongs on *this* list is what only a person can judge.

With the flag **off** — the shape production ships, and what `npm run demo` gives
you:

- [ ] Nothing about admin, attendance or teacher points is visible or reachable
      anywhere on the site
- [ ] `/agenda` still renders, from the snapshot baked at build time — the git
      collection is gone, and the flag being off changes nothing about it

With the flag **on** (`npm run demo:accounts`):

- [ ] ⚠️ **Mark a full class on a phone, at Dar Souiri, during a real session.
      How long does it take?** Twenty teenagers, one tap each, standing up. If
      it needs a modal per student or a save button per row it has failed,
      however correct it is. The suite measures 59 ms of UI per child; it cannot
      measure a room
- [ ] The "Qui joue ?" picker on a **shared family tablet**: does the right child
      get asked for, and does a child's own phone stop asking?
- [ ] The points a prof sees on `/admin/eleve/` and the points that child sees on
      `/progres/` are **the same number**. Two plausible, different totals is the
      worst failure this display can have

#### The profiles block on `/compte/` — walk it as an account with ONE profile

⚠️ **Sign in as `seed-eleve-2` (Omar, one child), not as the two-child family.**
One profile is the shape every real signup produces, and it is the shape in which
this whole section used to be invisible. Procedure in
[`docs/LOCAL-ACCOUNTS.md`](./LOCAL-ACCOUNTS.md) §6a.

- [ ] The block is **first on the page**, open, with the child listed and the add
      form reachable — the regression that shipped for two releases
- [ ] ⚠️ **The word « élève » appears NOWHERE in it.** « Ajouter un enfant » or
      « Ajouter un profil », never « Ajouter un élève ». The staff side keeps the
      word; a parent reading about their own family should not meet it
- [ ] Each card carries a **rank, a points total and an exercise count**, and a
      bar. ⚠️ **If a card shows `0 points` for a profile that has solved
      something, the numbers are not being derived** — that is Critical Feature 61
- [ ] **Qui joue ?** is *not* there at one profile, and appears as soon as a
      second is added. Two rules, and only the picker is the conditional one
- [ ] There is no **Retirer** at one profile, and a sentence explains it rather
      than a greyed-out button explaining nothing
- [ ] **Retirer** on a second profile asks first, **names it**, and says the
      progress goes with it. Cancel leaves everything alone
- [ ] **Renommer** works, and the new name is what the picker's button says
- [ ] ⚠️ **The buttons look like this site's buttons** — border, ink, 44px, and
      the press. They are built by script, so a scoped `<style>` would silently
      miss every one of them; that is exactly what had happened to the picker

#### ⚠️ The three blocks — the shape of the page IS the feature

`/compte/` used to be one flat column in which the interface language and
permanent deletion carried the same weight as a child's progress.

- [ ] Top to bottom: **the profiles**, then **Réglages du compte**, then
      **Options avancées**. Nothing else between them
- [ ] Both disclosures are **closed** when the page loads. ⚠️ **If "Options
      avancées" is open, deletion is competing with the roster again**
- [ ] They open on click AND on Enter/Space from the keyboard, and the whole
      summary row is the target — not just the word
- [ ] **Se déconnecter** is visible without opening anything. It is ordinary and
      frequent; it must not be buried next to deletion
- [ ] As a prof or admin, **Espace encadrants** is also visible without opening
      anything. ⚠️ A prof at Dar Souiri must not have to guess that the register
      lives behind "Réglages du compte"
- [ ] Inside Réglages: the field is « Votre prénom » with a sentence saying it is
      the **account holder's** name and appears on no player profile. ⚠️ « Prénom
      affiché » told a parent nothing — displayed where, and whose?

#### ⚠️ A skipped onboarding must point at the placeholder name

- [ ] Sign in on a **fresh** account and press "Passer cette étape"
- [ ] On `/compte/`, **Réglages du compte is already open**, and a note under the
      name field says the name came from your email address
- [ ] Change it and save: the note goes away and does not come back on reload
- [ ] ⚠️ **If the note is there but the block is closed, nobody will ever read
      it** — that is the whole reason the block opens itself

#### Supprimer mon compte — the one that cannot be undone

⚠️ **Use a throwaway seeded account, never your own.** There is no bin.

- [ ] It is inside **Options avancées**, and you had to open that to get here
- [ ] The section names what goes — profils, progression, parties, points,
      présences — **before** the confirmation, not after
- [ ] **Supprimer** reveals a typed confirmation and the first button goes away.
      Two delete buttons in the same place is one mis-tap on a family tablet
- [ ] `Supprimer` in lower case does NOT arm it; `SUPPRIMER` does. A phone's
      autocapitalisation must not be enough on its own
- [ ] **Annuler** puts everything back and deletes nothing
- [ ] After confirming: you land on the home page as a guest, and signing in
      again with that address creates a **new, empty** account
- [ ] ⚠️ Your **device-local** progress is still there, and still works. That is
      correct and the notice says so — it is your copy, on your machine

#### The public agenda — the staleness banner

⚠️ **This is the half of the agenda feature a machine cannot judge**, because
the question is whether a prof believes it.

- [ ] Publish a session in `/admin/seances` **without rebuilding**. The banner
      says the public agenda is not up to date, and gives the last build date
- [ ] `/agenda/` does NOT show it yet — correct, and the banner is what makes
      that honest rather than broken
- [ ] Rebuild (`npm run demo:accounts`). The banner flips to "à jour" and the
      session is on `/agenda/`
- [ ] Cancel a session: it stays on `/agenda/` and **says** it is cancelled. Not
      faded, not struck through — a parent must not squint at it and turn up
- [ ] A **draft** never appears on `/agenda/` at all

#### ⚠️ After ANY production deploy — the agenda is not empty

⚠️ **This is the one that actually bit.** On 2026-08-14 `/agenda/` told the
public "Aucune séance programmée pour le moment" for about fourteen hours. Every
check was green, the page rendered perfectly, and the database was already
correct — the deployed build simply predated the row by thirteen hours.

- [ ] `npm run smoke:prod` — `/agenda/` reports a **session count**, and the
      count is not zero. It now fails on an empty agenda rather than passing
- [ ] The count matches what `/admin/seances` lists as published or cancelled.
      ⚠️ **The check cannot know the count is right, only that it is non-zero**
- [ ] Open `/agenda/` and `/en/agenda/` in a browser and read them. A build that
      baked before a session existed looks identical to a club with nothing
      scheduled — **the page cannot tell you which it is, and neither can a 200**

### v2-S5 — a parent signs up, ON A PHONE

⚠️ **THE WHOLE POINT IS THE QUESTION AT THE END: did anything need explaining?**
The specs prove the screen works; they cannot tell you whether a parent who has
never seen this site understands what they are being asked. Do this on a real
phone, in French, without reading the code first — and if you find yourself
about to explain something out loud, that sentence belongs on the page.

Run `npm run demo:accounts -- --host` and use the LAN address.

**Signing up**

- [ ] `/connexion/` on a phone: the field is reachable without zooming, and the
      keyboard that opens is an **email** keyboard
- [ ] Submit a real address. The confirmation replaces the form and does **not**
      echo the address back
- [ ] Follow the link. You land on **`/bienvenue/`**, not `/compte/`

**The welcome screen — ⚠️ THE QUESTION IS THE FEATURE**

- [ ] Step one is **« Qui va utiliser ce compte ? »** with three full-width
      buttons, each carrying a sentence saying what it means. No name field yet
- [ ] All three are reachable with one thumb at 390px, with no horizontal scroll
- [ ] ⚠️ **Read « Les deux » as a parent who plays.** It must read as the ordinary
      case, not as an odd extra. If it feels like bending the tool, the copy is
      wrong — that parent is the club's typical family (Critical Feature 57)

**« Moi, je joue »**

- [ ] Step two asks **« Comment vous appelez-vous ? »** and nothing about children
- [ ] Save. `/compte/` is headed **« Votre profil »** and your card is badged
      **VOUS**. ⚠️ Nothing anywhere says "votre enfant"

**« Mon enfant (ou mes enfants) »**

- [ ] Step two asks **« Le prénom de votre enfant »** and does *not* ask yours
- [ ] The field is **empty**, and a note says the current name came from your
      email address. ⚠️ **If it is pre-filled with something like `nachiketas3d`,
      that is the bug this screen exists to fix**
- [ ] "Ajouter un autre enfant" reveals a field and moves focus into it. Repeat
      until the button disappears rather than doing nothing
- [ ] Save. `/compte/` is headed **« Vos enfants »**, and **no** card is badged
      VOUS

**« Les deux »**

- [ ] Step two shows **both** sections, yours first
- [ ] Fill your name and two children. Save
- [ ] `/compte/` is headed **« Vous et vos enfants »**, your card is badged VOUS
      and sits first, and the picker offers all three
- [ ] ⚠️ **Your own card earns points like any other.** Solve an exercise as
      yourself and the number moves

**Changing your mind, and being asked once**

- [ ] From step two, **« Changer de réponse »** goes back to the question, and a
      different answer really takes
- [ ] Sign out, sign in again: you land on `/compte/`, **never** `/bienvenue/`
- [ ] Open `/bienvenue/` by hand afterwards — it sends you to `/compte/`
- [ ] On an account that answered « Mon enfant », **« C'est moi »** on a card
      claims it: the badge appears, the heading changes, and the button is gone
      from every other card

**Skipping**

- [ ] With a *fresh* account, press "Passer cette étape" — available at **both**
      steps. You land on `/compte/`
- [ ] The profiles block is there, the add form works, the roster shows the
      auto-created profile. ⚠️ **A skipped onboarding must leave nothing broken**
- [ ] The heading is the neutral **« Les profils de ce compte »**. ⚠️ **Skipping
      is not an answer** — if the page has decided you are a parent, it guessed

**Reading the account**

- [ ] `/compte/` says « Titulaire du compte » next to your address, inside
      Réglages, and the model block there explains that players are profiles
      beneath the account
- [ ] With ONE profile and no answer given, it reads « un seul profil de joueur »
      and there is no "Qui joue ?" picker
- [ ] Add a second: the wording changes to « 2 profils de joueur » and the picker
      appears
- [ ] ⚠️ **Read the one-profile sentence as if you were a fifteen-year-old who
      signed up alone.** It must not tell them they have a child. If it does,
      that is Critical Feature 54 and the copy is wrong, not the reader

**Both themes, both modes**

- [ ] Walk `/bienvenue/` and `/compte/` in **Terminal dark** and **Bois light** —
      the two extremes. Every card border, badge and bar is visible in both
- [ ] The **VOUS** badge is ink-on-brass, never white-on-brass
- [ ] With `prefers-reduced-motion` on, the answer buttons still respond to
      hover and focus — the border change is feedback, and feedback is never
      removed, only made instant

**Deleting**

- [ ] With two children on the account, work down `/compte/` → Supprimer. The
      list names the students, the progress, the points and the presences
      **before** the confirmation
- [ ] Type `SUPPRIMER`. You are signed out and sent home
- [ ] Sign in again with the same address: it is a brand-new account, and it
      sends you back to `/bienvenue/`

**The admin side** (as an admin, not a prof)

- [ ] `/admin/` shows a **Comptes** tab. As a prof it does not, and
      `/admin/comptes/` says "réservé aux administrateurs" rather than
      "réservé aux professeurs"
- [ ] The list shows the sign-ups newest first, and a never-confirmed one is
      marked in **words**, not only by colour
- [ ] Removing an account needs a typed reason before the button enables
- [ ] The reason appears in the Suppressions journal. ⚠️ **Nothing in that
      journal identifies the deleted account** — no address, no id, no counts

### v2-S3 — progress sync (only once `PUBLIC_AUTH_ENABLED` is on)

⚠️ **THE CHECK THAT MATTERS IS THE FIRST ONE, AND IT IS THE ONLY ONE THAT
CANNOT BE UNDONE.** A student who worked as a guest for a month and signs in on
their phone must lose nothing. The suite covers the merge with conflicting state
on both sides; this is the same thing on a real device, which is where a student
will actually do it.

- [ ] ⚠️ **On a real phone**, as a guest: solve several exercises, finish a
      tutorial step or two, play a game against the engine. Note roughly what
      you did. Then sign in
- [ ] Everything is still there — `/progres/` shows the same counts, the same
      rank, the same points. **Nothing went backwards**
- [ ] `/compte/` says what was recovered ("12 exercices et 3 leçons récupérés").
      If it says your progress is up to date when you know you brought a
      month's work, stop — that is the failure that looks like success
- [ ] Sign in on a SECOND device with no history. Everything arrives
- [ ] Do one exercise on each device, then reload both. Both have both
- [ ] **Sign out.** Your progress is still there and still works — you are a
      guest again, with your work
- [ ] Turn wifi off, do a whole session, lock the phone, unlock it, turn wifi
      back on and open `/progres/`. Everything arrives. This is the classroom
      case and it is why the queue survives a reload
- [ ] `/progres/` shows one discreet sync line and does not become a page about
      syncing. As a guest it shows nothing at all

### The sweep, before a release run

`npm run demo` clears stale preview servers **and** orphaned test browsers. The
second half exists because ~60 leftover browsers corrupted three release gates
in a row.

- [ ] After any interrupted `test:release`, run `npm run demo` (or just let it
      run before the next matrix). Step 1 should name anything it killed
- [ ] ⚠️ **Your own browser must still be open.** The sweep matches on the
      executable path under Playwright's cache, never on the process name —
      if Chrome or Edge ever closes when this runs, that is a serious bug, not
      a tidy-up
- [ ] If a `test:release` is running in another terminal, `npm run demo` must
      **not** disturb it: browsers with a live launcher are deliberately spared

### E2 — sound

The suite proves the plumbing: no `AudioContext` before a gesture, off by
default, one context not one per move, the invitation offered once. **It cannot
hear anything.** Everything below is the part only a person can judge, and the
last item is the real test.

- [ ] Open any exercise with sound **off** (the default). Play a few moves.
      Silence — including the wrong move, the solve, everything
- [ ] `/parametres/` → **Son**: the toggle is off and the three volume steps are
      greyed out. Turn it on — you hear one short click immediately, and the
      steps become selectable
- [ ] Try all three volume steps. Each plays a click as you pick it. On a phone
      at arm's length, is **Doux** audible and **Fort** not startling?
- [ ] Solve an exercise with sound on. **Does the correct move feel
      satisfying?** It should read as "yes, that" — not as a fanfare
- [ ] Play a wrong move. ⚠️ **Does it feel corrective rather than punishing?**
      This is the one that matters most: the site teaches children, and an error
      must inform without scolding. If it reads as a buzzer, say so — the whole
      voice is four numbers in `src/lib/sound.ts`
- [ ] Play a capture, and a move that gives check. The capture should sit lower
      and heavier than a plain move; the check should sound tense, and a capture
      that *is* a check should play only the check
- [ ] Earn an achievement. It should be recognisably the solve sound "plus
      something", not a different event
- [ ] ⚠️ **Do twenty exercises in one sitting. Is anything grating?** Nothing
      else on this checklist can answer that, and it is the question that
      decides whether the feature stays as it is

- [ ] Turn sound on, then put the tab in the background and let an exercise play
      out. Nothing should be audible from a tab you are not looking at
- [ ] With sound on, put the phone on silent. Everything still works and nothing
      is lost — every sound has a visible counterpart
- [ ] Solve your first exercise on a fresh browser profile: the invitation
      appears once, below the verdict. Say **no thanks**, then solve another —
      it must never come back
- [ ] Repeat on a profile with reduced motion requested (macOS/iOS: Reduce
      Motion; Windows: Show animations off). No invitation at all — but
      `/parametres/` still lets you turn sound on, and it works

### Batch 4 — the six new opening traps

`/pieges/` now lists **seven**. The chess is machine-verified and every declared
mechanism is asserted on each build; what a machine cannot check is whether the
words land on the right move and whether the teaching is honest.

- [ ] `/pieges/` lists seven traps, and every card opens (both locales)
- [ ] Step through **each** replayer with the arrow keys. On every commented
      ply, read the comment against the move that just played — the checker
      proves a ply is in range, never that the sentence matches the move
- [ ] The three mates really are mate on the board: `mat-du-berger` (Qxf7#),
      `blackburne-shilling` (Nf3#), `mat-caro-kann` (Nd6#)
- [ ] `blackburne-shilling` says in its **summary** that the trap is unsound.
      That sentence is not decoration — if it ever disappears, the site is
      teaching a losing line as a winning trick
- [ ] `fegatello` says Black survives with best play. Same rule
- [ ] `piege-de-l-elephant` states the final count as **a knight for a pawn**,
      not "a piece". Walk the count in the last comment and check it
- [ ] `arche-de-noe`: at the end, confirm on the board that the b3 bishop
      really has only a4 and c4, and that a black pawn covers both
- [ ] Arrows and circles point at something real on each commented ply, and no
      arrow starts from an empty square
- [ ] Read `node scripts/check-content.mjs`'s manual-review queue: six trap
      entries, each naming what a human has to confirm

### ⚠️ No route may exist on one layout only

`/progres/` shipped reachable from the mobile bottom bar and from **nothing**
on desktop. Nothing was broken; a way in was simply absent, which is the class
of defect a checklist catches and a suite does not.

- [ ] On a **desktop** window, from the home page: reach `/progres/` using only
      what is on screen. It is a top-level nav entry — **Progrès**, after
      "Le club" — not inside a group and not an icon in the tools cluster
- [ ] It marks itself current when you are on it (colour **and** underline)
- [ ] Its label is the same word the phone's bottom bar uses. One destination,
      one name
- [ ] Do the same walk in English at `/en/`
- [ ] Narrow the window to about **900px**: the header wraps to two rows —
      nav on the first, settings/theme/language on the second. Known and
      recorded (BACKLOG); check it still reads as deliberate rather than broken
- [ ] Widen past **1024px**: back to one row
- [ ] On a phone the "Progrès" nav entry must **not** appear in the header —
      the bar is the navigation there, and two navigations would be read out
      twice by a screen reader

- [ ] On desktop, `/progres/` shows a **rank**, a **points** total, the
      **streak** (once you have solved two in a row in this tab) and the
      **achievements** list. Check in all four themes — the theme changes the
      surfaces, and this page had been looked at far more on a phone than on a
      wide screen

### Course 3 — "Les motifs tactiques" (7 lessons)

- [ ] `/cours/` lists three courses, in order: Bien ouvrir une partie, Les mats
      élémentaires, **Les motifs tactiques** (badge *intermédiaire*)
- [ ] `/cours/les-motifs-tactiques/` lists seven lessons, 1–7, and each opens
- [ ] Same in English at `/en/cours/les-motifs-tactiques/`

#### ⚠️ Read each board against the sentence next to it

Four of this course's eight positions originally described something the board
did not contain, and **every one of them passed `check-content.mjs`** — legal,
six fields, solvable. Five of those claims are now asserted on every build
(`claims[]`), so the pin, the fork, the discovery and the surcharge mate cannot
silently come back. The three on the **manual review queue** cannot be machine-
stated and are still yours:

- [ ] Run `node scripts/check-content.mjs` and read the *"board(s) a machine
      cannot vouch for"* list at the end. Every course-3 entry there names what
      to check; work down it
- [ ] The list should shrink over time, never grow silently. If a board you
      just wrote appears as **"no claim declared"**, either declare one or add
      a `manual` note saying why you cannot

- [ ] **L2, le clouage** — on the diagram, try to move the c6 knight in your
      head: it must be **unable** to move. If a black pawn is sitting on d7, the
      pin is fake and this is the bug coming back
- [ ] **L4, la découverte** — the bishop must be on **b2**, on the same diagonal
      as the knight on e5. Take the knight away mentally: the bishop must then
      hit h8
- [ ] **L6, l'attraction** — there must be **no black pawn on f7**. If there is,
      `2...fxg6` just wins a knight and the whole demonstration is refuted
- [ ] **L7, la surcharge** — the knight is on **g5**, the white king on **h1**.
      Play it out: `Bxg5 Qxg5` must **not** be check, and `Re8` must be mate

#### The lesson 6 replayer — step through it, do not skim

- [ ] Step forward one ply at a time. The commentary appears on moves **1, 3
      and 5 of the list** (plies 0, 2, 4 — White's moves), never on Black's
- [ ] Ply 0 (`Rh8+`): the comment names f8, g7, f7 and h7 as the king's four
      unavailable squares. Check all four on the board — f7 is covered by the
      **knight on e5**, h7 by the rook that just arrived
- [ ] Ply 2 (`Ng6+`): the knight on g6 visibly attacks **both** the king on h8
      and the queen on e7
- [ ] Ply 4 (`Nxe7+`): the queen is gone and it is check
- [ ] Jump to the end, then back to the start: the white rook returns to **h1**
      and the black queen to e7

#### The exercises

- [ ] Each of the seven "Essaie toi-même" boards solves with the intended move,
      by **tapping** as well as by typing
- [ ] **L5, la déviation** is the one exercise with `onlyMove: false`. Play
      `Ra8+` instead of `Rxd7` (it forces mate in two). It must say *"ce n'est
      pas la ligne que nous avions en tête"* — **never** "incorrect". If it ever
      calls that move wrong, that is a regression, not a copy change
- [ ] Cross-links open: L1 → the knight-fork exercise, L4 → `/pieges/legal/`,
      L6 → le mat étouffé, L7 → le mat du couloir. In English they must carry
      the `/en/` prefix

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
- [ ] Solving lands in **two beats** — the frame settles, then the badge arrives.
      Watch for the gap; if it reads as one event the delay has been lost
- [ ] The destination square carries a brief brass ring as the move lands, and it
      is **gone** a moment later — it must not linger as a second highlight
      competing with the last-move tint
- [ ] The move counter **hops** as the step advances (two-step exercises:
      `/exercices/opposition-et-mat/`)
- [ ] Solving shows the success state, the checkmate note, and the replayable solution list
- [ ] Clicking a move in that solution list shows the position at that move

Feedback:

- [ ] **A wrong move** (e.g. Ra7 here) shakes the board, says *"Ce n'est pas le bon coup"*,
      **increments the attempt counter**, and puts the piece back
- [ ] ⚠️ **It now also says WHY**: *"Ce coup est légal, mais il ne fait pas ce qu'on
      cherche ici."* (EN: *"That move is legal, but it isn't what we're looking for
      here."*) Failure must inform — a beginner who cannot tell "illegal" from
      "not the point" learns the wrong lesson from the same red text
- [ ] The attempt counter reads **1**, not 2. The reason is an extra sentence, not
      a second kind of mistake — both verdicts count identically
- [ ] The strict panel and the permissive panel are the **same shape**: one line of
      explanation each. If one is visibly longer, the reader will read that as
      "worse mistake"
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

## 4b. ⚠️ PLAY A WHOLE EXERCISE ON A PHONE, BY TAPPING ONLY

**On a real phone, not a narrow desktop window** — a desktop browser has no
virtual keyboard, which is the entire point of this section.

This is the check that would have caught the defect Seàn hit: every tapped move
used to re-focus the move-entry field, which opens the keyboard, which shrinks
the viewport, which scrolls the board out of view. The automated suite cannot
see it, because a headless browser has no soft keyboard.

Use a **two-step** exercise (`/exercices/opposition-et-mat/`) — a one-move
exercise never reaches the code path.

- [ ] Tap a piece, tap its destination. **The keyboard must never open**
- [ ] **The board must never scroll out of view** — not after your move, not
      after the opponent replies, not after a refused move
- [ ] Play the exercise to the end by tapping only. It should feel like a board,
      not like a form
- [ ] Do the same on a **course lesson** (the exercise sits far down the page,
      so a stray focus has a long way to scroll), a **tutorial step**, and
      **`/jouer/`**
- [ ] On `/jouer/`, **tapping "Commencer" must not open the keyboard either** —
      the setup form is replaced by the board, and focus used to land in the field
- [ ] Play several moves against the engine by tapping. The board stays put
      through every engine reply

### The other half — the field must still be there, and still work

- [ ] The move field is **visible and enabled** on the phone. It is never hidden
      or disabled on touch: some students prefer typing, and it is the
      accessible path
- [ ] **Tap into the field yourself and type a move.** It works, the keyboard
      opens (because you asked for it), and after the opponent replies **focus
      returns to the field** so you can keep typing
- [ ] Now tap a piece on the board instead. Focus **leaves** the field and the
      keyboard closes — the modality of the last move decides, not the device

---

## 4c. ⚠️ THE EXERCISE FILTERS — batch 5

`/exercices/` is 27 entries. The filters are **real pages**, not `?niveau=`:
static output leaves no server to read a query string, and a browser-side
filter would leave the chips dead with JS off.

- [ ] `/exercices/` lists **27** exercises, with two rows of chips above them:
      **Par niveau** and **Par thème**
- [ ] Click a level chip — the URL becomes `/exercices/niveau/debutant/`, fewer
      cards are shown, and **every one of them really is at that level**
- [ ] The chip you clicked is visibly marked, and a **← Tous les exercices**
      link brings everything back
- [ ] Click a theme chip — same behaviour, and every card carries that theme
- [ ] ⚠️ **Turn JavaScript off** (DevTools → Settings → Debugger → Disable
      JavaScript) and do it again. **The filters must still work.** This is the
      whole reason they are routes; a query-string filter would look identical
      until this step
- [ ] `/exercices/theme/pas-un-theme/` **404s** — a filter with no matches is
      never built, which is why there is no empty state
- [ ] `/en/exercices/` — the segments are **not** translated
      (`/en/exercices/niveau/…`, never `…/level/…`), and the language switcher
      still lands on the counterpart page
- [ ] The last lesson of **Les mats élémentaires** and of **Les motifs
      tactiques** each end with a link into the matching drill set

### The chess itself — ⚠️ the part a machine cannot check

`check-content.mjs` proves every position is legal, that each solution does what
it claims, and that every `onlyMove: true` mate is unique. **It cannot read the
hint next to the board.** Spot-check a handful:

- [ ] Solve three mates in 1 by tapping. Each mates on the first move
- [ ] `/exercices/sacrifice-puis-mat/` — play **Rd8+** instead of the stored
      **Qd8+**. It must say *"ce n'est pas la ligne que nous avions en tête"*,
      **never "faux"**: both moves mate, which is exactly why it is
      `onlyMove: false`
- [ ] Read three hints. None of them names the move

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
### Difficulty — the thing that was wrong until v0.6.0

Until v0.6.0 all three levels were effectively **one opponent**, and a club
player could not win a single game. The presets are now measured
(`node scripts/engine-lab/run.mjs --verify`), but the whole point is that a
human has to agree with the numbers.

- [ ] **Débutant: you must be able to WIN.** Play three or four games. If you
      are a club player you should win comfortably and fairly often by simply
      taking material it gives away
- [ ] **Débutant hangs pieces, on purpose.** Roughly two moves in five are
      random. If it never leaves anything en prise, the blunder path is not
      running — check the browser console for a UCI error
      *(it is not "the engine playing badly"; it is a deliberate random legal
      move, and it is the only thing that makes a beginner able to win)*
- [ ] ⚠️ **But it must still look like chess.** If it feels like nonsense
      rather than a weak opponent, the blunder rate is too high — that is a
      real regression, not a taste question
- [ ] **Intermédiaire**: you should have to play accurately. Beatable, but it
      punishes a hung piece
- [ ] **Avancé**: it should never hand you anything, and should punish a real
      mistake
- [ ] The three feel **clearly different from each other** — that ordering is
      the fix. If two feel the same, say so
      *(these are win rates against crude reference bots, NOT Elo — the UI
      still prints no rating, deliberately)*

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

### 7a. The four themes — ⚠️ THE JUDGEMENT CALLS, ON A REAL PHONE, DAY AND NIGHT

Everything measurable about the themes is already proved: 275 contrast assertions in
`check-contrast.mjs` and 51 specs in `themes.spec.ts`. **What no machine can answer is
whether they are any good**, and those questions are the whole reason E6 was a session
of its own. Do these outdoors in daylight and again in a dark room.

- [ ] `/parametres/` shows **four themes first**, each with a live preview: the page
      colour, its texture, a board, a knight, and the theme's own heading letter
- [ ] The previews **look like the themes they promise**. A preview that lies is worse
      than no preview
- [ ] Pick each theme in turn. Every one changes the background, the surfaces, the
      headings, the board **and the pieces** together — not just the background
- [ ] The board and pieces change on a real board too (`/pieges/legal/`), not only on
      the settings page

#### ⚠️ Q3 — Does **Souiri** feel like Essaouira?

This is the identity theme and the one no other chess site will have. It is either the
best thing in this session or it is decoration.

- [ ] The blue reads as **the blue of the doors and the boats**, not as a generic
      "brand blue"
- [ ] The background is recognisably **zellige** — a tiling, with structure — and not
      just a texture. Look at it at arm's length on a phone, which is how it will be seen
- [ ] The lime white feels like **a whitewashed wall**, warm, not like a grey UI surface
- [ ] The saffron accent belongs with the other two. If it reads as an error colour,
      that is a bug
- [ ] Show it to someone from Essaouira if you can. **Their reaction is the test.**

#### ⚠️ Q4 — Is **Terminal** readable, or just a gimmick?

- [ ] Read a **whole lesson** in Terminal dark, on a phone, without stopping. If your
      eyes hurt or you switch away before the end, it is a gimmick and it must be
      softened or dropped
- [ ] The phosphor green does not **vibrate** against the black. (It is deliberately
      stepped back from the saturated `#00ff41` cliché for exactly this reason)
- [ ] Amber for links and focus, green for everything read — is that distinction
      **learnable in one page**, or does it just look like two random colours?
- [ ] The scanlines are visible enough to be intentional and faint enough to read
      through. On a low-brightness phone screen especially
- [ ] **Terminal light** ("the printout") is coherent rather than a joke — a reader
      whose OS is in light mode gets this, and it has to stand on its own
- [ ] The monospace headings do not look cramped or broken at the largest heading size

#### Bois and Marbre

- [ ] **Bois** is unchanged from the site you already know. If anything looks different
      from before this session, that is a regression, not a theme
- [ ] The wood grain on the page and on the board squares is **just barely** perceptible.
      If you can see it without looking for it, it is too strong
- [ ] **Marbre** feels cold and sober — the room with the wood taken out. The veining
      does not repeat visibly
- [ ] The gold vein accent reads as stone, not as brass borrowed from Bois

#### Light and dark inside every theme

- [ ] Every theme has a **day and a night**, and both are usable. Switch mode while on
      each theme in turn — eight combinations, and all eight are shipped
- [ ] **No white flash** on navigation in any theme's dark mode, including a hard reload
- [ ] The theme previews on `/parametres/` **follow the mode you are in** — in dark
      mode all four tiles show their dark palettes

#### The pieces

- [ ] Each theme's pieces suit it: warm Staunton in Bois, crisp outlines in Marbre,
      flat graphic in Souiri, minimal geometric in Terminal
- [ ] ⚠️ **A knight is recognisable at a glance in every set**, at phone size. This is
      the reason textured/raster pieces were rejected; if a set fails it here it must go
- [ ] White and black pieces are clearly distinguishable **on both square colours** of
      that theme's board
- [ ] No piece is missing or shows as an empty square. (A missing piece set is the
      failure mode of forgetting `board` on a page — check a lesson, a tutorial step, a
      trap, an exercise and `/jouer/`)
- [ ] ⚠️ **COUNT THE SQUARES: eight across, eight down, in every theme.** Both defects
      this session shipped in a first draft and survived a screenshot review looked
      *plausible* rather than broken — a 2×2 checker still reads as "a chessboard" at a
      glance, and a board with the black pieces missing still reads as "a position".
      Count, and look for both colours of piece, rather than glancing

#### Typography (E7)

- [ ] The **heading face changes with the theme** and the **body face never does**.
      Compare a lesson in all four themes: the prose is the same face every time
- [ ] A lesson's first paragraph has a **drop cap**, and only the first
- [ ] On a narrow phone the drop cap **disappears** rather than sitting next to two words
- [ ] Inline notation (`Cf3`, `Fc4`) reads as a **small badge** — fixed pitch, light
      ground, a hairline. ⚠️ It rendered in the body font until this session; if it looks
      like ordinary text again, that bug is back
- [ ] French quotation marks are `« comme ceci »` with a narrow space inside them
- [ ] Lesson lines are comfortable to read — roughly 60–70 characters on a desktop

### Board themes

- [ ] The presets and custom colours are behind **"Personnaliser"**, closed by default.
      That is the hierarchy, not a bug: the theme has already chosen a board
- [ ] **"Suivre le thème"** is the first option and is selected when you have never
      pinned a board
- [ ] ⚠️ **Pin a preset, then change theme: the board stays.** This is the decision this
      session made — a board preference is independent of the site's mood. A note appears
      saying so
- [ ] Choose "Suivre le thème" again: the board goes back to following, and now changes
      with each theme you pick
- [ ] If you had chosen a board **before this session**, it is still your board after it.
      Nothing about your setup changed without being asked
- [ ] All six presets are offered with a mini preview each, and the previews look like
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

## 6c. Course 2 — Les mats élémentaires

- [ ] /cours/les-mats-elementaires/ lists six lessons, both locales
- [ ] Each of the six exercises mates in one, by pointer and by keyboard

### Still diagrams — new in this batch

- [ ] Lessons 1, 3, 4 and 6 show STILL boards (no play button, no arrows)
- [ ] ⚠️ Each still board shows its OWN position — if you ever see a full
      32-piece starting position where a diagram should be, the FEN was lost
- [ ] Lessons 2 and 5 have real replayers WITH a play button

### ⚠️ Chess accuracy — Seàn

- [ ] Step through the ladder (lesson 2) and Philidor (lesson 5) move by move:
      does each comment describe the move actually on the board?
- [ ] Lesson 3: is the stalemate diagram genuinely stalemate, and is the
      warning clear enough that a beginner will remember it?
- [ ] Lesson 4: the diagram shows the finished mate — does it read as such?
- [ ] Lesson 5 starts the queen on d1 (the brief had her on b3, which made the
      first move impossible) — does the line still read as Philidor to you?

---
## 6c-bis. After a deploy — the production smoke check

⚠️ **Run this from a machine, not from memory.** These are the failures that
cannot happen on localhost, so no amount of local testing rules them out.

```sh
npm run smoke:prod
```

- [ ] It passes. If everything is unreachable the domain is not attached yet —
      see CLAUDE.md → Deployment for the one dashboard step
- [ ] Open `https://mogadorchess.nachi3dlabs.com/` in a real browser: the
      certificate is valid (no warning), and the padlock is clean
- [ ] View source on any page: the `<link rel="canonical">` names
      **mogadorchess.nachi3dlabs.com**, not `mogadorchess.ma` and not localhost
- [ ] Paste the home URL into WhatsApp: the preview shows the club name and
      description rather than a bare link. That is `og:url` and `og:image`
      resolving against a host that exists
- [ ] DevTools → Application → Manifest: the PWA is installable, icons load
- [ ] DevTools → Application → Service Workers: registered and activated
- [ ] DevTools → Network, hard reload with cache disabled: **no request to any
      origin other than this one.** The engine (`stockfish.*`) must NOT appear
      until you open `/jouer/` and press start
- [ ] Install it to a phone home screen and open it offline: the shell loads

---
## 6d. Progression — rank, points, streak, achievements (E3)

The suite proves the arithmetic. What it cannot prove is whether the ladder
*feels* earned, which is the only thing that matters here: the direction's
non-negotiable is that **a rank gained by clicking does not survive two minutes
with a teenager.**

### ⚠️ The question that decides this feature

- [ ] On a browser that has never used the site, work for **ten minutes** as a
      beginner would: tutorial steps, in order. Do you reach **Cavalier**? If it
      takes longer than one sitting, the first threshold is wrong
- [ ] Does reaching it feel like something, or like a number going up? If it
      reads as noise, the problem is the moment, not the threshold
- [ ] Look at what Dame would take. Does it look like *real work* rather than
      grinding? It should look like finishing nearly everything on the site

### Points, in the solve moment

- [ ] Solve an exercise you have never solved: **"+N points"** appears with the
      solved badge — as part of the SAME arrival, not as a third thing landing
      after it
- [ ] Press "Recommencer" and solve it again: the badge appears and **no points
      line does.** Not "+0" — nothing at all
- [ ] Solve a lesson with three boards (Récapitulatif, course 1). The first two
      boards award nothing; the **last one** awards the lesson
- [ ] Reveal the hint, then solve: the award is smaller and **never zero**
- [ ] ⚠️ Does the reward read as quieter than the solve itself? The solve is the
      event; the points are a footnote to it. If your eye goes to the number
      first, it is too loud

### `/progres/`

- [ ] Rank, points, and a bar toward the next rank — **no "bientôt" anywhere**
- [ ] The breakdown's four figures **add up to the total** (do the arithmetic)
- [ ] Every achievement is listed, earned and unearned. Unearned ones are
      **named**, not hidden behind "???"
- [ ] An earned one differs by **more than colour** — weight, border and a
      filled star as well
- [ ] In all four themes, light and dark: earned and unearned are still
      distinguishable, and nothing is washed out
- [ ] At the top rank the "next rank" line **disappears** rather than leaving a
      gap

### The session streak

- [ ] Solve two exercises in a row with no mistake: a run appears
- [ ] Play a wrong move: the run resets **silently**. ⚠️ There must be NO
      message about losing it — being told twice about one mistake is the thing
      this rule exists to prevent
- [ ] Open a new tab: the run is gone. It is a session, not a record
- [ ] ⚠️ **There is no daily streak, and there must never be one.** If you see
      anything counting consecutive days, that is a regression — the club meets
      weekly

### Games

- [ ] Win against Débutant: a **first-win achievement** toasts
- [ ] Lose several games at any level: **the total does not move**. Not down,
      not at all
- [ ] Resign: same — recorded, costs nothing
- [ ] Win at Avancé and compare with a Débutant win: Avancé is worth
      substantially more
- [ ] Win a fourth time at the same level: no further points (the cap)

### The achievement toast

- [ ] It appears **at the moment of earning**, not on a later page load
- [ ] Reload the page: it does **not** appear again
- [ ] It clears the bottom bar on a phone and does not cover the move field
- [ ] With **reduced motion** on (OS setting): it still appears and still
      announces — it simply arrives without travel. "Reduced motion" is never
      "no feedback"
- [ ] With a screen reader: it is announced **politely** — it does not interrupt
      what is being read

### Guests and broken storage

- [ ] Everything above works with **no account** (there are none)
- [ ] DevTools → Application → Local Storage → delete `mcc:progress:v1`: the
      page still renders, rank back to Pion, nothing in the console
- [ ] Set it to `not json` by hand and reload: same
- [ ] Disable JavaScript: `/progres/` still renders its structure, and the
      no-JS note explains why the numbers are not there

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

## 7b. Pacing and ambient motion (Session 6, revised in E1)

### The home page

- [ ] The first screen is the **main menu** (see 0b above for the full pass)
- [ ] **Jouer** / **Play** is the first standing entry and lands on `/jouer/`
- [ ] **Pièges d'ouverture** / **Opening traps** lands on `/pieges/`
- [ ] Three pillar cards further down: **Apprendre → /cours/**, **S'entraîner → /exercices/**, **Jouer → /jouer/**
- [ ] Clicking anywhere on a pillar card follows its link; tabbing reaches each card once
      *(one link per card — if Tab stops twice on a card, the whole-card overlay has regressed)*
- [ ] Chess-piece silhouettes drift slowly behind the hero. **They should be barely
      noticeable** — if you notice them before you notice the heading, they are too strong
- [ ] ⚠️ **E1 sped them up from 47–71s to 13–20s.** They were previously invisible as
      motion; they should now register if you look for them. The judgement call is
      the balance between the two lines above — say if it has gone too far
- [ ] ⚠️ **There are TWO layers now.** Three further pieces (queen, knight, a second
      pawn) drift slower and travel less. Look for **depth**, not just more pieces —
      if it reads as one flat field, the effect has not landed
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
      *(E1 moved this from 200ms to 180ms — 200 sat in the forbidden 180–250ms gap.
      It should still feel like navigation rather than gameplay.)*

### Buttons, cards and panels (E1)

- [ ] **Press and hold any button.** It moves down and its shadow closes up, like a
      key. Release and it comes back. A button that only changes colour is a failure
- [ ] Every button is comfortable to hit with a thumb — nothing under ~44px tall
      *(they were ~40px before E1, and nothing was measuring it)*
- [ ] **Press and hold a card** on `/pieges/`, `/exercices/`, `/cours/` or a course's
      lesson list: it settles flat, the way the button does
- [ ] Opening a nav group **fades and drops in** rather than snapping; the chevron
      turns faster than the panel opens
- [ ] Revealing a hint on an exercise fades in rather than appearing between frames
- [ ] Nothing anywhere feels like it is in an awkward middle speed. Everything should
      read as either *"that answered me"* (fast) or *"watch this change"* (gentle)

### Reduced motion

Turn it on at the OS level (Windows: Settings → Accessibility → Visual effects →
Animation effects off; macOS: Accessibility → Display → Reduce motion; or DevTools →
Rendering → Emulate `prefers-reduced-motion`).

- [ ] Silhouettes are **still there** but completely still — the texture stays, the motion goes
- [ ] The home menu's **knight cursor still marks the selected line** — it just
      appears rather than sliding in. Removing it would take away the menu's only
      state, so its absence is a bug, not a reduced-motion success
- [ ] ⚠️ **Check the FAR pieces too, not just the near ones.** They are a separate
      layer with its own selector, and E1 shipped with them still drifting under
      reduced motion until a spec caught it. If any piece is moving, that is the bug
- [ ] Buttons still **answer** a press — the shadow still closes — they just do not travel
- [ ] The correct-move ring still marks the destination square; it simply appears
      and goes rather than fading. *Reduced motion removes movement, not feedback*
- [ ] The solve arrives in **one** beat rather than two. That is deliberate: a reader
      who asked for less motion did not ask to wait through a staged arrival
- [ ] Section reveals do not animate; content is simply present
- [ ] Board moves are **instant** — pieces appear on their new square with no slide
- [ ] The opponent **still pauses briefly** before replying (~150ms). It should not fire back
      in the same instant. *This is deliberate: with a screen reader the two move
      announcements must not overlap*

---

## 7c. Accounts (v2-S1) — ⚠️ SWITCHED OFF IN PRODUCTION SINCE v0.3.0

**Read this before running any of the section below.**

`PUBLIC_AUTH_ENABLED` defaults to `false`, and OFF means **not built**: the
account routes are not in `dist/` at all. On a normal `npm run demo` every check
in this section is **not applicable** — skip to 7d.

### 7c-0. What to check on the DEFAULT build (do this one every release)

- [ ] `/connexion/`, `/compte/`, `/en/connexion/`, `/en/compte/` and
      `/auth/callback/` all return **404**, not a redirect and not an empty page
- [ ] The header carries **no** sign-in or account control, in either language
- [ ] DevTools → Application → Local Storage: set `mcc:auth:v1` to `1` by hand,
      reload. **Nothing appears.** The flag is a build switch, not a permission
- [ ] Search the built output: `grep -r supabase.co dist/` → **no matches**
      *(the e2e suite asserts this, but look once yourself before a release —
      it is the guarantee the whole flag exists to provide)*
- [ ] The footer still links the privacy policy, and it still loads. It
      describes the site as a whole, not only accounts, so it is not gated

### 7c-1. The rest of this section needs an ON build

```sh
PUBLIC_AUTH_ENABLED=true npm run demo
```

Also needs a configured Supabase project. If `PUBLIC_SUPABASE_URL` is unset the
sign-in form says so plainly and everything else on the site still works — check
that too.

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

### "Qui joue ?" — the child picker (0005)

⚠️ **Only reachable with `PUBLIC_AUTH_ENABLED=true`.** With the flag off,
`/compte/` is not emitted at all and none of this exists — which is itself the
first check below.

- [ ] With the flag **off**: `/compte/` returns 404, and DevTools → Application →
      Local Storage has **no `mcc:child:v1`** after browsing the whole site
- [ ] First sign-in on a fresh account: **no picker appears**, and a board you
      solve syncs. One child was created silently — this is the autonomous-
      teenager path, and seeing a picker here would be the bug
- [ ] `/compte/` → **Ajouter un enfant** → add a second name. The picker now
      appears with both, one of them marked as chosen
- [ ] Solve an exercise, switch to the other child on `/compte/`, open
      `/progres/` — the second child's progress is **separate**, not shared
- [ ] **Reload.** The chosen child is still the chosen one (remembered per device)
- [ ] Open the site on a **second device** with the same account: it asks again,
      because that device has never been told
- [ ] Keyboard only: Tab to each name, Space selects it, and a screen reader
      announces which is pressed

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

---

## 7d. The admin surfaces (v2-S4 part 2) — ⚠️ NEEDS AN ON BUILD AND A PROF ACCOUNT

These four routes do not exist on the default build. Section 7c-0 already checks
that; everything here needs `PUBLIC_AUTH_ENABLED=true` **and a rebuild**, plus an
account promoted to `prof` with the SQL in `docs/ADMIN.md`.

> ⚠️ **This is the part of the site that is used on a phone, standing up, in a
> room with twenty teenagers in it.** Test it that way — `npm run demo -- --host`
> and a real phone — not in a desktop window. Half the decisions here only make
> sense, and only fail, at 390px with one thumb.

### 7d-0. On the DEFAULT build (do this one every release)

- [ ] `/admin/`, `/admin/eleves/`, `/admin/eleve/`, `/admin/seances/` all **404**
- [ ] `/en/admin/` **404s** as well — the admin UI is French only, by decision

### 7d-1. The way in

- [ ] Signed in as an **élève**: `/compte/` shows **no** "Espace encadrants" block
- [ ] Signed in as a **prof**: the block is there, and its button opens `/admin/`
- [ ] Same at **390px and at 1280px** — the entry point is not layout-dependent
- [ ] Signed OUT, open `/admin/` directly: you get a **sentence**, not an empty
      table, and a link back
- [ ] As an **élève**, open `/admin/eleves/` directly: same refusal.
      ⚠️ Then open DevTools and un-hide the body — the table is **empty**, because
      RLS is what refuses, not the CSS

### 7d-2. The class list

- [ ] `/admin/eleves/` lists **children, not accounts** — a parent with two
      children appears **twice**, with the two names
- [ ] Every column sorts, and clicking the same header again reverses it
- [ ] A student with no activity sorts to the **end**, whichever way — not to the top
- [ ] The points and rank shown here are **the same numbers that student sees** on
      their own `/progres/`. ⚠️ Check one student against their own screen; this is
      the thing that destroys trust when it is wrong
- [ ] A row opens `/admin/eleve/?id=…` with that child's progress, attendance and awards

### 7d-3. Awarding points

- [ ] Award **5 points** with a reason — it appears in the list immediately
- [ ] The tiles above **recompute**; nothing is stored as a balance
- [ ] Try **0**, **-5** and **51** — refused, with a message
- [ ] Try a blank reason and a one-character reason — refused
- [ ] ⚠️ Now sign in as **that student** on another device or a private window:
      `/progres/` shows a **separate block** headed "Points attribués par ton prof",
      with **the reason you typed** printed next to the award
- [ ] A student who has been awarded nothing sees **no such block at all** —
      not an empty one reading "0"

### 7d-4. ⚠️ THE REGISTER — the timed one

**This is the design constraint of the whole feature.** Do it on a phone.

- [ ] `/admin/seances/` preselects the nearest session
- [ ] Every child in the club is listed, each with **three buttons: P / A / E**
- [ ] **Time yourself marking twenty.** Tap P down the list without pausing
- [ ] ⚠️ **One tap per child.** No dialog opens, nothing has to be dismissed,
      and there is **no save button anywhere**
- [ ] ⚠️ **Nothing moves.** The list does not re-sort, rows do not disappear as
      they are marked, and no row changes height under your thumb
- [ ] The counter reads "12 sur 20 marqués · 12 présents" and keeps up
- [ ] Tap a child again on a different letter — it **corrects**, it does not add a
      second row. Reload: your correction is what stuck
- [ ] **Turn airplane mode on and mark three more.** They flip on screen and then
      each row says **"Non enregistré"** and *stays* saying it — it must not
      silently revert to unmarked
- [ ] Turn the network back on, tap those three again — they save

> **Expected timing.** The interface costs about **60 ms per child** (measured:
> 1.18 s for twenty taps, all twenty rows durable 1.47 s after the first tap —
> `attendance-timing.spec.ts`). So a real class of twenty is bounded by how fast
> you can read the names, around **half a minute**. ⚠️ **If it feels like the
> phone is the thing slowing you down, that is a regression** — something started
> blocking between taps.

### 7d-5. Sessions

- [ ] Create a session as a **brouillon** — it appears in the list, marked so
- [ ] It is **not** on the public `/agenda/`, and not offered in the marking picker
      until published
- [ ] **Publier** it — now it is on `/agenda/` and in the picker.
      ⚠️ **After a rebuild**: the agenda is baked at build time, and since
      v0.17.0 publishing ASKS Cloudflare to rebuild rather than waiting for
      somebody to deploy. The staleness banner is still the backstop
- [ ] **Annuler la séance** — it stays in the list, visibly cancelled.
      ⚠️ There is **no delete button**, on purpose: deleting would take its
      register with it
- [ ] A cancelled session's attendance rows still exist (check the student's own
      detail page)
- [ ] As an **élève**, `/agenda/` shows neither the draft nor the cancelled one

### 7d-5b. ⚠️ Recurring sessions — thirteen rows, ONE rebuild (v0.17.0)

Do the whole of this on a **phone**, because that is where a prof programmes a
term. ⚠️ **The claim under test is that thirteen sessions cost ONE Cloudflare
build**, so the last two checks are the ones that matter.

- [ ] Create a session, choose **"Chaque semaine"**, and set **"Jusqu'au"** twelve
      weeks out. ⚠️ **Before pressing anything**, the preview lists **every one of
      the thirteen dates** — not "et 8 autres" — and the button reads
      **"Créer les 13 séances"**
- [ ] Switch to **"Toutes les deux semaines"**: the count halves and the dates
      redraw immediately
- [ ] ⚠️ **Type the wrong year** in "Jusqu'au" (2039 instead of 2029). It is
      **refused**, it says how many were asked for, and **nothing is created**.
      It must never create the first 52 and stay silent about the rest
- [ ] Press create and confirm. Thirteen cards appear, each badged
      **"série · n/13"**, and a **Séries** block appears above the list
- [ ] ⚠️ **Edit ONE of them** — cancel the seventh. It goes "annulée"; the other
      twelve are untouched, and **nothing is deleted**
- [ ] The Séries block now offers **"Annuler les 12 séances à venir"**. Press it:
      all twelve go cancelled, the past ones (if any) are **not** touched
- [ ] ⚠️ **Now the rebuild.** Open the Cloudflare dashboard's build list.
      Creating thirteen sessions must have produced **ONE build**, not thirteen.
      The bulk cancel must have produced **one more**. If you see thirteen, a
      write path has been turned back into a loop — see Critical Feature 67
- [ ] ⚠️ **And check the log agrees**, in the Supabase SQL editor:

      select source, rows_changed, dispatched, note
        from public.rebuild_requests order by id desc limit 5;

      One row saying `sessions.insert` / `13`, one saying `sessions.update` / `12`.
      Thirteen rows each saying `1` is the failure this exists to catch
- [ ] ⚠️ **On the TEST project only**, `dispatched` must be **false** and the note
      must say there is no hook in the vault. A test project that dispatches is
      one vault entry away from spending the club's build minutes on every e2e run

### 7d-5c. ⚠️ The DST check — once, by hand, and worth it

Morocco drops to UTC+0 for Ramadan and back. The expansion steps in **local
calendar days** for exactly that reason, and this is the only way to see it.

- [ ] Create a weekly series that **spans a Ramadan transition** (the dates move
      each year; check before doing it). Every generated session must show the
      **same clock time** — 16:00 stays 16:00 on both sides of the change
- [ ] The same times appear on the public `/agenda/` after a rebuild

### 7d-6. Chrome, themes and motion

- [ ] All four themes × light and dark: the admin pages follow the theme, and
      **nothing is unreadable** — especially the marked P/A/E fills
- [ ] The admin nav strip scrolls horizontally at 320px and every entry is reachable
- [ ] `prefers-reduced-motion`: the marker's fill still lands **instantly**; only
      the travel goes
- [ ] There is **no language switcher** in the header on any `/admin*` page

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

## 8b. ⚠️ THE VIDEO FACADE — a FIXTURE page, not live content

⚠️ **No published trap or course carries a video today.** The facade's test page
is a fixture, and `npm run demo` builds the production shape, so **it is not
there by default**. To work through this section:

```sh
PUBLIC_FIXTURES=true npm run demo
```

then go to **`/pieges/fixture-video-facade/`**. Its id (`FIXTUREvid0`) is not a
video: pressing play gets YouTube's "video unavailable", which is expected and
affects no check below except the network one — where the requests going to
`youtube-nocookie.com` is exactly the point.

### ⚠️ First, the thing that must be true of the PRODUCTION shape

- [ ] `npm run demo` (no env var): `/pieges/fixture-video-facade/` **404s**
- [ ] `/pieges/` shows the real traps and **no FIXTURE card**, in both locales —
      check this in the `PUBLIC_FIXTURES=true` build too, where the page exists
- [ ] `/pieges/legal/` has **no video block at all**

### Before the click — this is the whole feature

- [ ] DevTools → Network, **hard reload with the cache disabled**, then scroll
      right down to the video
- [ ] ⚠️ **Every request still goes to localhost.** Nothing to `youtube.com`,
      `youtube-nocookie.com`, `google.com`, `googlevideo.com` or — the one that
      is easy to miss — **`i.ytimg.com`**. Sort the Network panel by Domain and
      read it; do not filter for "youtube"
- [ ] Application → Cookies: **none**
- [ ] The poster's URL is `/video/FIXTUREvid0.webp` (or `@2x` on a retina
      screen), served by this site
- [ ] The video sits **BELOW the board**, under a "Vidéo" / "Video" heading
- [ ] The privacy line under it links to **Ce qu'un clic envoie** → the `#video`
      section of the legal notice, and that section actually scrolls into view

### The click

- [ ] Press play: the still is replaced by the player **in the same box** — the
      page below it does not jump
- [ ] Network now shows requests to **`youtube-nocookie.com`** and to nothing
      else that is new
- [ ] The play button is **gone**, not sitting behind the player

### Keyboard — do this one, it is the one that regresses silently

- [ ] Tab to the play button. It takes a visible focus ring around the **video**,
      not around the badge
- [ ] It announces the video by name — "Lire la vidéo : " plus the page's own title
- [ ] Press **Enter**: the video starts. Press Tab: you are **inside the
      player**, not back at the top of the page
- [ ] Reload and repeat with **Space** — it must work too

### The rest

- [ ] All four themes, light and dark: the badge is clearly visible against the
      still, and the title and privacy line below it are comfortably readable
- [ ] At **360px**: the facade fits the column, and the board above it is still
      full width — the video must never have squeezed the board
- [ ] With **reduced motion** on: the badge does not grow on hover or focus, but
      it still changes colour and still takes the focus ring
- [ ] `/pieges/fegatello/`, `/pieges/legal/` and `/cours/bien-ouvrir-une-partie/`
      (no `youtube` field): **no heading, no empty box, nothing at all**

### If you change the video

- [ ] Change the id in the content JSON, run
      `node scripts/fetch-video-posters.mjs`, and **commit `public/video/`**
- [ ] `node scripts/check-content.mjs` fails loudly if you forget the poster —
      that is the guard, not a nuisance

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
- [ ] `PUBLIC_AUTH_ENABLED=true npm run test:release` — the gate: chromium over
      the whole suite, the four lanes, and the accounts-OFF sliver. ~25 min.
      ⚠️ Check the sliver ran — it prints as `chromium (OFF)` and it is the only
      thing proving Critical Feature 18
- [ ] `node scripts/check-lanes.mjs` — advisory, read it; never gate on it
- [ ] This checklist, worked through on desktop **and** a real phone
- [ ] Lighthouse ≥ 90 on Performance, Accessibility and SEO
- [ ] ⚠️ **No test fixture is live** — after deploying, `npm run smoke:prod`
      asserts `/pieges/fixture-video-facade/` 404s. A 200 means the production
      build ran with `PUBLIC_FIXTURES=true`; unset it in the Cloudflare build
      variables and redeploy. **No local check can catch this** — every
      Playwright build has fixtures ON by design

---

## After a QUICK CHANGE lands on `main`

A quick change (see CLAUDE.md → Quick change) is verified by `npm run quick` —
chromium only, and only the specs covering what moved. That is deliberate, and
it means **the deployed result is checked by a person instead**. It takes a
minute and it is the whole safety margin the fast path trades away.

**On the deployed URL, not localhost:**

- [ ] The Cloudflare deploy for that commit went **green** — check the dashboard
      rather than assuming; a build that fails at deploy time fails after every
      local gate has already passed
- [ ] Open the **changed page in FR**, and confirm the change is actually there
- [ ] Open the **same page in EN**. A wording fix applied to one locale and not
      the other is the single most likely quick-change mistake
- [ ] The page still renders normally around the change — nothing shifted,
      nothing lost its styling
- [ ] If the change was a **new collection entry**: it appears on its index page
      in both locales, and its detail page opens in both

If any of these is wrong, revert the commit rather than fixing forward — the
same rule as the fast path itself.

### 7e. Réservation d’une séance (0013)

⚠️ **À faire sur un vrai téléphone.** C’est le format que la fonctionnalité
vise : un parent réserve debout, d’une main, souvent en retard.

Pré-requis : `npm run demo:accounts`, un compte avec **deux** profils enfants,
et une séance publiée dans plus de 2 heures.

⚠️ **Une partie de cette section est désormais automatisée** —
`tests/e2e/booking-ui.spec.ts`, sur chromium **et** dans la voie webkit : le
zéro-requête déconnecté, la réservation confirmée en base, l’annulation, la
re-réservation sans rechargement, et le refus d’une séance déjà commencée.
**Ce qui reste manuel est ce qu’aucun spec ne voit** : le confort à une main sur
un vrai téléphone, la lisibilité au soleil, et la taille réelle des cibles.

| # | Étape | Résultat attendu |
|---|---|---|
| 1 | `/agenda/` **déconnecté** | La carte montre « 12 places » (la capacité) et « Connectez-vous pour réserver ». ⚠️ **Aucune requête réseau vers Supabase** — vérifier dans l’onglet Réseau, filtre `supabase`. Zéro. |
| 2 | Se connecter, revenir sur `/agenda/` | Le nombre devient le **compte réel** (« 14 places restantes »), et un bouton **Réserver** apparaît par enfant |
| 3 | Réserver le premier enfant | Le bouton devient **Annuler**, l’étiquette « Réservé » s’affiche, le compte baisse de 1, et le message dit « C’est réservé. » |
| 4 | Réserver le second enfant | Idem. ⚠️ **Deux réservations distinctes** — une par profil, jamais une pour le compte |
| 5 | Annuler le premier | Le bouton redevient **Réserver**, le compte remonte de 1 |
| 6 | Re-réserver le même enfant | Accepté. ⚠️ C’est l’index unique partiel : une annulation libère vraiment la place |
| 7 | Recharger la page | L’état survit — il vient de la base, pas du navigateur |
| 8 | Passer la séance à moins de 2 h (via `/admin/seances`, changer la date) puis recharger | Le bouton **Annuler** est **désactivé** et son infobulle dit pourquoi. ⚠️ Jamais un bouton qui ne fait rien |
| 9 | Sur `/en/agenda/` | Tout est en anglais, y compris les messages de refus |

#### 7e-bis. La page périmée — le cas qui compte

| # | Étape | Résultat attendu |
|---|---|---|
| 1 | Ouvrir `/agenda/` sur le téléphone, ne pas recharger | La carte affiche des places libres |
| 2 | Sur un autre appareil, remplir la séance (réserver jusqu’à `capacité + marge`) | — |
| 3 | Sur le téléphone **sans recharger**, appuyer sur **Réserver** | ⚠️ **« Cette séance est complète. »** puis la carte se met à jour toute seule. **Jamais** un bouton qui ne réagit pas, jamais une erreur technique |

#### 7e-ter. Côté prof — `/admin/seances`

| # | Étape | Résultat attendu |
|---|---|---|
| 1 | Le formulaire « Programmer une séance » | Champs **Places** (12) et **Marge de surréservation** (2), avec l’explication : 12 + 2 = 14 réservations acceptées |
| 2 | Choisir une séance dans **Présences** | Le bloc **Inscrits — N** liste les enfants réservés avec le **téléphone du parent**, cliquable |
| 3 | Le registre en dessous | Les enfants **inscrits sont en tête**, marqués par un liseré. ⚠️ Toute la classe reste listée — un enfant qui vient sans avoir réservé se marque sans rien retaper |
| 4 | Annuler la séance | Les réservations passent à **annulée**, avec « séance annulée » comme motif. ⚠️ Jamais orphelines |
| 5 | Vérifier le nombre de rebuilds | ⚠️ Une réservation ne déclenche **aucun** rebuild ; annuler la séance en déclenche **un** |

#### 7e-quater. Modifier une séance et lire le remplissage (0013)

| # | Étape | Résultat attendu |
|---|---|---|
| 1 | `/admin/seances`, regarder la liste | Chaque carte affiche **« 9 / 14 places »**. ⚠️ Le dénominateur est **capacité + marge**, pas la capacité seule |
| 2 | Une séance sans réservation | « 0 / 14 places ». Une base antérieure à 0013 ou un chargement en cours affiche **« — »**, jamais 0 |
| 3 | Appuyer sur **Modifier** | Le formulaire se remplit, la bannière « Modification d’une séance existante » apparaît, le bouton devient **Enregistrer**, et la page défile jusqu’au formulaire |
| 4 | Vérifier la date et l’heure | ⚠️ Elles doivent être **remplies et justes** — pas un champ vide. C’est le piège de `datetime-local` |
| 5 | Changer **Places** de 12 à 20, enregistrer | La carte affiche « n / 20 » (ou « n / 22 » avec la marge). ⚠️ Le bandeau de fraîcheur de l’agenda passe à « non déployé » — la capacité est publique |
| 6 | Modifier une séance **publiée** | Elle reste publiée. ⚠️ Modifier un **brouillon** ne le publie pas |
| 7 | Le sélecteur « Répétition » pendant une modification | La zone de prévisualisation dit que la répétition ne s’applique qu’à la création |
| 8 | **Annuler la modification** | Le formulaire se vide et revient en mode création (**Créer**) |
| 9 | Modifier une séance d’une **série** | ⚠️ Seule cette séance change. Une série est une étiquette, jamais une règle |

#### 7e-quinquies. `db:push --dry-run` ne ment plus

| # | Étape | Résultat attendu |
|---|---|---|
| 1 | `npm run db:push -- --dry-run` avec une migration en attente | Liste les migrations en attente puis **« ✓ dry run — NOTHING was applied. »** |
| 2 | Relancer la même commande | ⚠️ La migration est **toujours en attente** — c’est la preuve que rien n’a été appliqué |
| 3 | `npm run db:push -- --dryrun` (faute de frappe) | ⚠️ **Refus**, code de sortie 1. Un argument non reconnu n’est jamais ignoré |
