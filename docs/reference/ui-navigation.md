# Reference — navigation, mobile layout and the home page

**Read when:** touching the header, the mobile bottom bar, the home page (desktop menu or mobile dashboard), or the resume resolver.

> Part of the Mogador Chess Club reference set. The binding rules live in
> [CLAUDE.md](../../CLAUDE.md); this file holds the detail behind them.
>
> ⚠️ This text was split out of CLAUDE.md verbatim, so a phrase like "the rule
> above" or "see the section below" may point at a neighbouring section **here**
> or at the rule it belongs to **in CLAUDE.md**. Nothing was cut; if a reference
> does not resolve on this page, it resolves there.

---

## Navigation — grouped disclosures, not a dropdown

Seven flat links had outgrown one row, badly on a phone. The nav is now three
groups plus a home link:

| Group | Contents |
|---|---|
| **Apprendre** | Les bases, Cours, Pièges |
| **S'entraîner** | Exercices, Jouer |
| **Le club** | Agenda, Contact |

`/` stays a top-level link — home is where the logo already goes, and burying it
would be worse than the wrap. The language switcher, account button and theme
toggle are untouched.

### ⚠️ Disclosure semantics, NOT `role="menu"`

The brief asked for "menu semantics". It is deliberately **not** built that way.

`role="menu"` / `menuitem` describes an APPLICATION menu: screen readers announce
"menu", expect arrow-key roving focus with a single tab stop, and stop announcing
the contents as links. These are site navigation links. The WAI **disclosure
navigation** pattern is the correct semantics — a `<button>` with `aria-expanded`
and `aria-controls` revealing a plain `<ul>` of links, walked with Tab, which is
what every reader already expects of a website.

### ⚠️ Click, never hover

The phone is the primary device and hover does not exist there. The panels open
on click at every viewport; there is no hover behaviour to be unreachable.

### ⚠️ The `html.js` gate — no layout shift, and no no-JS trap

Panels are hidden by CSS gated on `html.js`, exactly as the theme toggle and the
scroll reveals are:

```css
:global(html.js) .nav-panel { display: none; }
:global(html.js) .nav-group[data-open] .nav-panel { display: flex; position: absolute; }
```

Because the inline head script sets `js` before `<body>` exists, panels are
closed from the FIRST paint — nothing flashes open and collapses. Without JS the
rule never applies and every link renders, visible. Open panels are absolutely
positioned, so opening one cannot move the page: **measured 0px shift of
`<main>`**.

Escape closes and **returns focus to the toggle** — without that a keyboard
reader is dropped at the top of the document. Opening one group closes the
others; two open panels overlap on a narrow screen.

**Current section, not current page.** The toggle carries `is-current` when the
reader is anywhere inside its group, so the section is visible without opening
anything.

---

---

## ⚠️ MOBILE AND DESKTOP DIVERGE AT 768px — ON PURPOSE (M1 + M2)

Direction: `docs/direction/mcc-direction-mobile-app.md`. It **supersedes the E5
retro menu on mobile only**.

| | below 768px | 768px and above |
|---|---|---|
| Navigation | fixed **bottom bar**, four entries | grouped header, unchanged |
| Header | **one line**: name + theme + language | logo, three nav groups, settings, theme, language |
| Home | **dashboard** (dominant card, tiles, stats, next session) | the E5 retro menu, unchanged |

### ⚠️ DO NOT "UNIFY" THESE. THE DIVERGENCE IS THE FEATURE.

The retro menu was designed for a large screen. At 390px it was a list of links
on a dark background, under a header that already repeated every one of them:
two stacked menus before any useful content, five entries of identical weight,
nothing saying where to start. That is not an execution defect — the design was
wrong for the format.

`tests/e2e/mobile-app.spec.ts` pins **both sides of the breakpoint**, including
767px and 768px explicitly. A future session tidying the two layouts into one
finds out there.

### How the two home pages coexist

Both are in the DOM; CSS decides which is on screen. Three details are
load-bearing:

- **The dashboard comes FIRST in the DOM.** Below 768px the menu screen hides
  everything of its own *except the tagline*, so the phone reading order is:
  dominant card → tiles → stats → next session → that sentence. It is ONE
  element, shared. A second copy in the same file is a sentence that will
  eventually disagree with itself.
- **The `<h1>` goes `sr-only` on mobile, never `display: none`.** The club name
  is already visible in the reduced header, so repeating it is the redundancy
  M1 exists to remove — but `display: none` takes the page's only `<h1>` out of
  the accessibility tree and leaves the document with no top-level heading.
- **The desktop menu markup and CSS are untouched.** Everything mobile lives in
  a `max-width: 767.98px` query.

### The bottom bar

⚠️ **SUPERSEDED BY M4 — it is now FIVE SECTIONS.** See "M4 — five sections, and
knowing where you are" at the foot of this file; the reasoning below is kept
because the objection it raises is the one M4 had to answer with measurements.

**M1: exactly four entries: Accueil, Apprendre, Jouer, Progrès.** Not five.

⚠️ **Settings is deliberately not one of them.** It is visited twice and then
never again, so it does not earn a slot in the one element visible on every
screen — and five targets across 390px is 78px each, where labels truncate.
Pièges, exercices, agenda and contact live *inside* these four sections.

- ≥48px targets, `aria-current="page"` on the active entry, and the active
  state is colour **plus** a rule above it, never colour alone.
- **It never hides on scroll.** Stability beats the pixels.
- ⚠️ **`env(safe-area-inset-bottom)` in TWO places**: as the bar's own bottom
  padding (so its background reaches into the iOS gesture area) and in the
  footer's bottom padding (so the bar does not cover the last line of every
  page). The bar is `position: fixed` and therefore takes no space — the page
  has to reserve it. `--mcc-bottom-nav` is the shared row height; `env()`
  cannot live inside a custom property and still resolve per device.

### ⚠️ BELOW 768px THE EXERCISE CONTROLS COMPACT. THE BOARD DOES NOT. (M3)

Measured at 360×640: the exercise component was **796px against 587px of
usable viewport, and the board was only 330px of it.** The other 466px was the
control stack — two stacked meters, a reserved verdict panel, a four-part
move-entry form and a standalone hint button, each a full-width block with
20px between them.

**The decision is to compact the controls and leave the board alone.** The
board is the thing being taught with; winning back pixels by shrinking it
would be solving the wrong problem. Measured after:

| | 390×844 | 360×640 |
|---|---|---|
| exercise component | 799 → **618** (usable 791 — fits) | 796 → **615** (usable 587) |
| control stack | 403 → **244** | 403 → **244** |
| board | 333 → **333** | 330 → **330** |
| scroll to reach prev/next | 815 → **618** | 1079 → **882** |

⚠️ **360×640 still does not fit in one screen — 615 against 587.** The
remaining 28px is one short nudge rather than the 209px scroll it was, and
`mobile-fit.spec.ts` bounds it at 660 rather than pretending otherwise.
Closing it completely would have cost either the board's size or the verdict
panel's reserved height.

**It is CSS only, and that is what keeps the desktop safe.** The dense row is
built with flex `order` from elements that are *not* adjacent in the DOM, so
the markup — and therefore the screen-reader reading order and the ≥768px
layout — is untouched. A JSX restructure would have moved the hint button
above the verdict panel on desktop too.

Three things pay for it, and each has a rule:

- **The meters go inline.** Label-above-value costs two lines for four words.
- **The verdict panel's reserve shrinks, it does not go.** 6.5rem → 5.25rem,
  because the panel is full-page-width here rather than a 15rem side column,
  so the same sentences take fewer lines. Removing the reserve would put the
  move field back to jumping under the reader's thumb between attempts.
- **The move-entry help line is `sr-only` until the field has focus.**
  ⚠️ Clipped, NEVER `display: none` — the field points at it with
  `aria-describedby`, and a clipped element is in the accessibility tree with
  certainty where a `display: none` target is honoured by most screen readers
  and guaranteed by none. It is safe to let it grow because the form is the
  LAST element in the column below 768px (`order: 6`); anything placed after
  it makes the reveal shift content again.
  **The visible label stays.** Hiding it and leaning on the placeholder saves
  another 22px and is the well-known trap: a placeholder disappears the moment
  the reader types.

`main`'s block padding also drops 2.5rem → 1.5rem below 768px — 80px of a
640px screen spent before the reader reaches anything, on every page.

### ⚠️ Every long route ends with a way onward (M3)

Trap and exercise detail pages carried a back link at the **top only**. A
reader who finished one on a phone was ~2 300px down, with the bottom bar
offering "Apprendre" (the courses) and nothing pointing at the index they came
from, and had to scroll the whole page back up to leave.

Both now end with the same link, from the **same i18n key** as the one at the
top — one destination, one name. `mobile-fit.spec.ts` asserts on four routes
and three phone sizes that the end-of-content navigation is visible, clears
the fixed bar, and is ≥44px.

### `/progres/` exists because the bar needs a fourth destination

The direction doc points "Progrès" at `/compte/` *or a local view while
accounts are off*. Accounts are off and `/compte/` is **not emitted at all**, so
pointing there would 404 from the one navigation element on every mobile screen.
When accounts land (v2-S3) the synced view goes here, in the same shape.

It is the **fourth** duplication of `mcc:progress:v1` in an inline script, after
the theme head script, `AccountButton` and the home resolver — same trade, same
reason, and the spec seeds the key directly so a divergence from
`src/lib/progress.ts` fails there.

### ⚠️ A ROUTE THAT EXISTS ON ONE LAYOUT ONLY IS A BUG

`/progres/` shipped in M3 reachable from the mobile bottom bar and **from
nothing at all on desktop**. The page built, rendered, and passed every one of
its own specs; a desktop reader simply had no way to reach it except by typing
the URL.

This is the same defect as an index card with no destination (Critical Feature
32), inverted: there, a way in that leads nowhere; here, a page with no way in.
Both are invisible to testing for the same reason — **nothing is broken, only
absent**, and absence is what a suite full of "this element does the right
thing" assertions cannot see.

So the rule is Critical Feature 36: **every destination the bottom bar reaches
must be reachable from the desktop header.** `mobile-app.spec.ts` reads the
bar's hrefs at phone width, then demands each one of the desktop header — in
both locales. ⚠️ **The list is read off the bar, never hard-coded**: that is the
whole value, because a fifth entry added to the bar then fails until it has a
desktop home. A spec listing four known paths would have passed throughout the
bug.

#### Where `/progres/` went, and why not the other two places

**Its own top-level entry in the nav root**, last, after the three groups.

- **Not inside a nav group.** It is not "Apprendre" (nothing to read) and not
  "S'entraîner" (nothing to do) — it is about the *reader*. Filing it under a
  content section is the same category error this file already rejects for
  putting settings under "Le club".
- **Not in the header-tools cluster.** Those are **preference controls** —
  theme, language, settings — and they are icon-only. Progress is not a
  preference; it is a destination you return to and read, and it needs a name
  rather than a glyph.
- **Top-level works** because the nav root already carries one plain link
  (Accueil), so it is not a new shape; it is a link rather than a disclosure,
  so it adds no fourth panel; and it sits where the bar puts it.

The label is `nav.progress` — **the same key the bar uses**, per Critical
Feature 20. Until this change that key had exactly one caller, which is a
smell worth noticing: a destination named nowhere else is usually a destination
reachable from nowhere else.

⚠️ **Measured cost: the header wraps to two rows between 768px and 1023px.**
The fifth entry adds 72px of nav width, which pushes `header-inner` past its
single line at those widths — 77px tall becomes 129px. Verified against `dev`:
the same header wraps at 768px *without* the change, so wrapping is existing
designed behaviour (`flex-wrap: wrap` is deliberate) and this widens the band
rather than introducing it. 1024px and up are unchanged. Not fixable by
trimming the gap — the four gaps only hold 16px at 0.25rem — so it was accepted
rather than papered over. In BACKLOG.

### Settings in the desktop header — beside the tools, not in a nav group

Chosen over "inside Le club", and the reasoning is in `SettingsLink.astro`: it
is a **preference control**, so it belongs with the other two preference
controls; the theme toggle beside it is a shortcut to one of these very
settings; and the nav groups are **content sections** that a reader walks
looking for something to read. "Le club" is about the organisation — filing a
personal display preference under it is exactly where nobody would look.

Desktop only. On a phone it would be a fourth icon on the single line M1 exists
to clear. The footer link stays.

### ⚠️ NEVER PUT `opacity` ON TEXT OVER AN AUDITED FILL

It cost a Lighthouse accessibility regression (100 → 96) that the entire
Playwright suite passed. `--mcc-primary-contrast` on `--mcc-primary` is proved
by `check-contrast.mjs` in all eight theme/mode combinations — and then CSS set
the text to `opacity: 0.9`, which blends it toward the fill and drops the real
ratio to **4.42:1**. The tokens were right; the rendering was not.

**The auditor cannot see an alpha applied on top of a pair it has proved.**
Same class as the ambient-layer ceiling, which is why that one is computed by
hand in a comment. Differentiate by size, weight and letter-spacing.

⚠️ And the reason the specs missed it: every axe test **seeded progress**, and
the resolver *removes* that element when it resolves. The never-seeded state
was the one state nobody audited. **A state that only exists before the reader
has done anything is still a state a reader sees** — axe now runs on both
branches, and in dark mode, where the lighter primary fill has less headroom.

---

## The home page is a MAIN MENU (E5) — ⚠️ ON DESKTOP ONLY SINCE M2

**Everything in this section applies at 768px and above.** Below it the menu is
replaced by the dashboard — see the divergence section above. The rules here
(identical labels, one screen, no-JS shape, the Reprendre resolution) are all
still live at desktop widths, and the resolver is shared with the dashboard.

Direction: `docs/direction/mcc-direction-esthetique-addendum.md` § E5. The home
page is a 1990s PC-game main menu — club title, a centred vertical stack, a small
**knight** marking the active line. It is CSS plus a roving tabindex; no new
dependency, no island.

### The three tensions, and where each is resolved

| Tension | Resolution |
|---|---|
| **SEO** — six words do not index | The menu owns the first screen; the descriptive content lives BELOW it and carries the markup. `<h1>` stays at the top, the meta description is **set explicitly** rather than falling back to `site.description`, and `#a-propos` is real prose under a real `<h2>`. |
| **Adults** — a parent must understand in five seconds | One descriptive sentence sits directly under the menu, **above the fold**, and a spec measures that it is. |
| **Redundancy with the grouped nav** | Not a defect — games have a main menu *and* shortcuts. |

### ⚠️ THE LABELS ARE THE NAV'S LABELS. NOT COPIES OF THEM.

Every menu entry takes its label from the **same `nav.*` key** the header uses.
There is deliberately no `menu.play` string, and adding one is the exact mistake
the rule exists to prevent: two different names for one destination reads as two
different sites.

`main-menu.spec.ts` does not hard-code the words. It reads the **header's own
labels** off the page and requires the menu's to be a subset — so renaming a nav
item without renaming its menu entry fails there.

A consequence worth knowing: an unscoped `getByRole('link', { name: … })` on the
home page now matches **two** elements and fails Playwright's strict mode. That
collision is the guarantee working. Scope to `.site-nav`; do not rename anything
to make it go away.

### Where the entries point

Two of the six labels are nav **groups**, which are toggles rather than links, so
each is pointed at the destination a reader most wants from it:

| Entry | Target |
|---|---|
| Reprendre | resolved in the browser — see below |
| Jouer | `/jouer/` |
| Apprendre | `/cours/` |
| S'entraîner | `/exercices/` |
| Pièges d'ouverture | `/pieges/` |
| Le club | `/agenda/` — "when does it meet" is asked far more than "how do I write to it", and the agenda links contact |

### "Reprendre" — the resolution rule

The **journey** is built at build time (content) and resolved in the browser
(the reader's own `localStorage`).

Journey order: the 13 tutorial steps by `order`, then every course lesson by
course `order` then lesson `order`. **A lesson with no exercise board is
excluded** — it records nothing in `mcc:progress:v1`, so it can be neither
touched nor completed, and including it would block the scan forever.

- **touched** — any of the step's keys has `solved`, `attempts > 0` or `hintUsed`. Opening a page leaves no trace; reading is not progress.
- **complete** — every one of the step's keys is `solved`.

Then, and this is the part that makes it feel like a game:

1. find the **last** touched step;
2. from there forward, take the first step that is not complete — which is that same step when the reader stopped mid-way through it;
3. if everything after it is complete, fall back to the earliest incomplete step anywhere (one they skipped);
4. if nothing is incomplete, or nothing was ever touched, **render nothing**.

⚠️ **FURTHEST, not earliest.** A game's Continue resumes where you stopped, not
at the first gap you skipped past. Both branches have a spec.

### ⚠️ THE RESOLVER IS SHARED, AND THE JOURNEY IS A PARAMETER (M3)

It used to live inside `HomePage.astro`'s inline script, with a near-copy of
the same rule in `ProgressPage.astro` and a third copy of just the key scheme
in `CoursPage.astro`. Two answers to "where did this reader stop" is one too
many, and the failure is silent — the pages name different lessons and neither
looks broken.

| File | What it owns |
|---|---|
| `src/lib/journey.ts` | The **only** place the `mcc:progress:v1` key scheme is written. Build-time; imports `astro:content`, so no island may touch it |
| `src/components/progress/ResumeResolver.astro` | The rule, the inline script, and the declarative binding |
| `src/components/progress/ResumeCard.astro` | The card `/cours/`, `/exercices/` and `/progres/` show |

**Each call site resolves its own journey, and they may legitimately differ:**

| Page | Journey |
|---|---|
| `/` | tutorial, then lessons — the course sequence |
| `/cours/` | lessons alone |
| `/exercices/` | exercises alone |
| `/progres/` | all three |

So `/progres/` can name a different step from `/` once a reader has touched a
standalone exercise. That is four answers to four questions, not a drift.

⚠️ **`journeys` is a RECORD, one component instance per page.** `/progres/`
needs a table for the whole journey, one per group bar, and one per level and
theme bucket. Five instances would emit five copies of the inline script, four
of them no-ops; one instance resolves every table in a single pass.

⚠️ **A level and a theme are just journeys.** `done / total` over an ordered
set of steps is exactly what the resolver computes, so the by-level and
by-theme breakdowns on `/progres/` are extra tables rather than extra logic.
Their steps carry no `u` or `t` — a statistic has nowhere to send anyone.

⚠️ **The declarative contract has two halves, and collapsing them breaks it.**
`[data-resume-count]` and `[data-resume-fill]` are filled **whether or not
there is a step to resume**; the link, the title and the un-hiding happen
**only when there is one**. That is what lets one contract serve a statistic
("2 sur 13", true and worth showing at zero) and an offer ("Reprendre — La
tour", which must not appear until it is true). `ResumeCard` is `hidden` by
default and stays hidden; a group bar is not and always gets its numbers.

**The home dashboard stays bespoke**, reading `window.MCC_RESUME.home` from a
plain inline script that runs *after* the resolver. It swaps a card's eyebrow,
title, bar, secondary tile and stats line — too specific to describe in
attributes. Document order is the whole of the ordering guarantee; both are
inline and synchronous, so there is no race to lose but there is an order to
keep.

**`tests/e2e/resume.spec.ts` was written BEFORE the extraction**, run green
against the old code and green against the new. It pins CLS, the script's
non-deferred attributes, and both dashboard branches. Its `journeyOf()`
accepts `[data-menu-journey]` *or* `[data-resume-journey]` precisely so that
not one assertion had to move — only the handle did.

⚠️ **The CLS assertion has teeth, and was verified to.** Wrapping the resolver
in `DOMContentLoaded` in a built `dist/index.html` produced **CLS 0.0057** and
failed the test.

### ⚠️ The resolver is `is:inline`, and it duplicates the progress key

Both deliberate, and this is the **third** such duplication on the site after the
theme head script and `AccountButton`.

**Inline**, because it runs synchronously during parsing, before first paint. A
bundled module script is deferred, so "Reprendre" would appear one frame late and
push a vertically-centred menu down under the reader's eyes — a visible jump on
the most-visited page and a CLS regression on the page least able to afford one.
Measured: **CLS 0.000 before and after.**

**Duplicating `mcc:progress:v1`**, because an inline script cannot import a bare
specifier. The general rule in "the single migration point" still stands;
`main-menu.spec.ts` seeds the key directly, so a divergence from
`src/lib/progress.ts` fails there rather than in production. It only ever READS,
and it fails silent — a corrupt store leaves five entries and no error.

### ⚠️ With no JavaScript there are FIVE entries, not six

"Reprendre" is a claim about stored progress, which cannot be read without
JavaScript. Rendering it anyway would either point nowhere useful or assert
something we do not know. The five standing entries are real links and all work.

The roving tabindex is applied **by the script**, never in the server markup —
otherwise a no-JS reader would meet five links marked `tabindex="-1"` that
nothing will ever move focus to. Progressive enhancement means the enhanced state
is the one that is *added*.

### One screen, and how it is held

`min-block-size: calc(100svh - 9rem)` on the menu screen. **`svh`, not `vh`**: on
mobile Safari `vh` is the *largest* viewport, so `100vh` is taller than what is
visible while the address bar shows, and the last entry would sit under it. Every
size is a `clamp()` against viewport height so six entries, a title and a
sentence all clear a short phone. A spec measures every entry's bottom edge
against the viewport at 390×844 **with the sixth entry present**, and asserts
nothing was scrolled to achieve it.

The cursor sits in **reserved space to the left of the label**, and the rows are
left-aligned inside a centred, width-limited list. A centred row would re-centre
itself every time the cursor appeared — the label would twitch sideways on every
arrow press.

### Motion: one Réponse, and nothing else

The cursor is `opacity` + a small `translateX`, both on `--motion-response`. No
new family. Under `prefers-reduced-motion` the cursor **still marks the line** —
it is the menu's only state — it simply arrives without travel.

---

---

## M4 — five sections, and knowing where you are

**Read when:** touching the bottom bar, the trail, a section landing, or adding
a route.

### The two problems, and the second is the real one

1. The bar was the wrong shape: four entries, one of which ("Progrès") was a
   **leaf page** rather than a section — it was there because "the bar needs a
   fourth destination", which is a layout reason, not a navigational one.
2. **You lost your place.** The person who built the site repeatedly could not
   tell where he was, or get back to a page he had just seen, without the
   browser's own back button.

Nothing was broken. Every page rendered, every link worked, every spec passed.
The defect was **absence** — the same class as `/progres/` existing on one
layout only, and invisible for the same reason.

### The audit — what every route had for a way back, before M4

| | routes |
|---|---|
| **Nothing at all** (11) | `/cours/` · `/pieges/` · `/exercices/` · `/apprendre-les-bases/` · `/progres/` · `/agenda/` · `/contact/` · `/mentions-legales/` · `/politique-confidentialite/` · `/compte/` · `/connexion/` |
| **A COLLECTION name** (4) | `/pieges/[slug]/` "Tous les pièges" · `/exercices/[slug]/` "Tous les exercices" · `/apprendre-les-bases/[step]/` "Toutes les étapes" · `/cours/[c]/[lesson]/` "Toutes les leçons" |
| **The parent, named** (1) | `/cours/[course]/` "← Cours" |

⚠️ **NOT ONE OF THEM WAS A BARE "RETOUR", AND THE COLLECTION NAMES ARE THE
INTERESTING FAILURE.** "Toutes les leçons" on a lesson page is not wrong — it is
just not an answer to the question a reader three levels down is asking, which
is *which course am I about to land in*. The lesson and tutorial pages also
carried a small inline parent link inside the step counter ("Bien ouvrir une
partie · Étape 3 sur 6"): it named the right thing, at text size, in a line that
reads as metadata. It is gone, replaced by the trail, because two links to one
place — one of them a 17px target — is how the way up got missed.

**After M4: 54 of 59 public FR routes carry a trail.** The five without are
`/`, `/apprendre/`, `/jouer/`, `/moi/`, `/parametres/` — home and the five
landings, which are the top.

### The trail

`src/components/nav/Trail.astro`, one component, used everywhere.

- ⚠️ **IT NAMES THE PARENT**, and for a lesson that is the course by title.
- ⚠️ **IT IS A LINK, NEVER `history.back()`.** A reader arriving from a shared
  link, a search result or a bookmark has no history to go back to, and a back
  control that does nothing is worse than no back control. It also means the
  destination shows in the status bar and opens in a new tab.
- ⚠️ **44px, AND THE PADDING IS WHAT PROVIDES IT.** The text is ~17px tall; a
  refactor that trims the padding leaves something that looks identical and
  cannot be hit. The negative inline margin pulls the target's edge back to the
  gutter so the label still aligns with the title beneath it.
- The visible label is the parent's name alone; the accessible name adds the
  verb (`trail.upTo`), because "‹ Exercices" read aloud is a chevron and a noun.

### The bar: five sections

| Entry | Lands on | Lights up for |
|---|---|---|
| Accueil | `/` | `/` exactly |
| Apprendre | `/apprendre/` | the hub, `/cours/`, `/pieges/`, `/exercices/`, `/apprendre-les-bases/` and everything under them |
| Jouer | `/jouer/` | `/jouer/` |
| Moi | `/moi/` | `/moi/`, `/progres/`, `/compte/`, `/connexion/`, `/bienvenue/` |
| Réglages | `/parametres/` | `/parametres/` |

⚠️ **`/apprendre/` AND `/apprendre-les-bases/` ARE DISTINCT PREFIXES ONLY
BECAUSE OF THE TRAILING SLASH.** Drop it from the hub's match list and every
tutorial page reads as the hub. `mobile-app.spec.ts` walks both.

#### The measurement M1 asked for

M1 capped the bar at four because "five targets across 390px is 78px each, which
is where labels start truncating". The arithmetic was right; the conclusion was
a guess. Measured, Chromium, both locales:

```
           cell        longest label        headroom
 390px  78.0 × 52   "Apprendre" 56.6px       21.4px
 360px  72.0 × 52   "Apprendre" 56.6px       15.4px
 (EN)               "Settings"  43.9px
```

Nothing truncates. Every target clears 48px in **both** dimensions.

⚠️ **THE SPEC MEASURES `scrollWidth` AGAINST `clientWidth`, NOT TEXT AGAINST THE
LABEL BOX** — and the obvious version is circular. `.mobile-nav-label` is a span
in a centred flex column, so it shrink-wraps its own text and the two widths are
equal by construction; the first draft of that assertion "failed" at *49.0px of
text in a 49px box*, which is not truncation, it is the same number twice.

⚠️ **WHEN A LABEL STOPS FITTING, SHORTEN THE WORD.** Never shrink the target,
never add an ellipsis. A bar reading "Appren…" has stopped naming its sections,
which is the failure M1 predicted and used to justify four.

### The landings are choosers, not menus

⚠️ **A CHOOSER THAT ONLY LISTS NAMES WASTES THE TAP IT COSTS.** Putting a screen
between the bar and the content is an extra tap for every reader every time, and
a stack of bare links does not pay for it — that is a menu, and the bar was
already a menu. Each card carries a name, one line of what is behind it, and
**the reader's own state**: "0 sur 18 leçons terminées" is the answer to the
question they arrived with.

⚠️ **THE COUNTS COME FROM `ResumeResolver`.** It already owns the one reading of
`mcc:progress:v1` and the one definition of "done"; a fifth copy on the page
whose whole job is to say how far along you are is how two surfaces come to
disagree.

⚠️ **TRAPS CARRY A FACT, NOT A TALLY.** Nothing records that a trap has been
READ — traps are reading material and `progress.ts` tracks solving — so the card
says how many there are. Inventing a "read" key to fill the slot would be a new
progress semantic smuggled in through a navigation change. In BACKLOG.
⚠️ And a bare number was the first attempt: "8" with no unit reads as a bug.

### Moi, and the shape that must not change

⚠️ **SIGNED OUT, "MOI" STILL LEADS TO MOI.** The entry stays, the card stays,
and only the sentence under it changes — swapped by the same `mcc:auth:v1` flag
the header reads, never by contacting Supabase, which a guest must not do. A bar
whose entries come and go with state cannot be learned.

⚠️ **WITH ACCOUNTS OFF THE ACCOUNT CARD IS ABSENT, NOT INERT.** `/compte/` and
`/connexion/` are not emitted in that build, so a card pointing at either would
be Critical Feature 32 all over again. The section still holds Ma progression
and Réglages, so it is never an empty screen.

### Critical Feature 36, and what the header had to gain

Both new bar destinations need a desktop home:

- `/apprendre/` joined the header's **Apprendre** group as its first item,
  labelled `nav.overview` ("Vue d'ensemble") — a group called "Apprendre" whose
  first item is also "Apprendre" reads as a mistake.
- The header's plain `/progres/` link **became** `/moi/`, labelled `nav.me`.
  Pointing the header at the leaf while the bar points at the section would give
  the two layouts different maps of the same site. `/progres/` stays reachable
  in one hop, from the chooser.

The CF36 spec reads the destinations **off the bar** and demands each of the
header, so a sixth entry fails until it has a desktop home.
