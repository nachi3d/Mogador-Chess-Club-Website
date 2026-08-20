# Reference — themes, tokens and typography

**Read when:** touching design tokens, a theme, a board preset, a piece set, a font, or the theme head script.

> Part of the Mogador Chess Club reference set. The binding rules live in
> [CLAUDE.md](../../CLAUDE.md); this file holds the detail behind them.
>
> ⚠️ This text was split out of CLAUDE.md verbatim, so a phrase like "the rule
> above" or "see the section below" may point at a neighbouring section **here**
> or at the rule it belongs to **in CLAUDE.md**. Nothing was cut; if a reference
> does not resolve on this page, it resolves there.

---

## Design tokens

`src/styles/tokens.css` is the source of record. Direction: **"old chess club"** — a wood-panelled room with a green baize table, brass lamps and yellowing score sheets. Deliberately distinct from the other Labs projects.

| Role | Scale | Notes |
|---|---|---|
| Primary — the baize | `green` 50–950 | `green-700` CTA fill, `green-800` header/footer |
| Page — the paper | `cream` 50–400 | `cream-100` page background |
| Accent — the lamp | `brass` 100–900 | fills + focus rings; **see the brass rule** |
| Panelling | `wood` 200–800 | secondary accent |
| Text — the pencil | `ink` 400–950 | warm-shifted neutrals |

Semantic aliases are `--mcc-*` in `:root`. Board colours are `--mcc-board-light` `#e8dcbe` and `--mcc-board-dark` `#4f7053` — a light square stepped off the page cream toward wood, and the baize lifted until it separates from it (4.1:1) while staying in the same green family.

Type: **Fraunces Variable** (display) + **Inter Variable** (body) + a system mono stack for notation, FEN and PGN. Self-hosted; see "Generated assets".

### Contrast is proved, not eyeballed

`node scripts/check-contrast.mjs` audits every rendered pair against WCAG AA and **exits non-zero on failure**. It is the FIRST step of `npm run build`, so a regression stops the build before anything else is spent.

It parses `tokens.css` and `board-themes.css` rather than keeping its own copy of the hexes, and runs the whole matrix against **both palettes** and **every board preset**. It also asserts that the pairs behind the deep-variant rules still fail — so a rule can never quietly become stale. See "Theming" for the details and for the pre-existing bug it caught.

### Brass contrast rule — global unlayered override (gotcha)

Brass is a mid-tone metallic. It works as a **fill** and as a **focus ring**, and fails as **text** on cream:

```
brass-500 on cream-100 ...  3.12:1  ✗
brass-600 on cream-100 ...  4.45:1  ✗   ← just under; the dangerous one
brass-700 on cream-100 ...  6.50:1  ✓   ← the deep variant
```

So, exactly as Baby Club does with terracotta:

- `.text-brass { color: var(--color-brass-700) }` — brass **as text** renders in the deep variant.
- `.bg-brass-* { color: var(--color-ink-950) }` — brass **fills** carry ink labels, never white.
- Use `--mcc-accent-text` (= `brass-700`) whenever the accent is type.

**Why this bites:** Tailwind v4 emits utilities inside the `utilities` cascade layer, and **unlayered CSS always beats layered CSS regardless of order or specificity**. So on a `.bg-brass-500` element, `text-white` **silently does nothing** — the utility loses to the unlayered rule. Intentional (it enforces AA app-wide without per-component vigilance), but non-obvious.

**Opt out** (rare — prefer the AA-safe default): Tailwind's important modifier, e.g. `text-cream-50!`. Do **not** add a second unlayered `.bg-brass-500` rule.

Level badges follow the same logic: the three level colours are mid-tones, used as fills with `ink-950` labels, never as text.

---

---

## Themes — FOUR of them, and light/dark lives INSIDE each one (E6+E7)

Direction: `docs/direction/mcc-direction-esthetique-addendum.md` §§ E6, E7.
**Bois, Marbre, Souiri, Terminal.** A theme sets the surfaces, the heading
typeface, the default board preset and the piece set.

### The hierarchy, and why flattening it is the mistake

| Level | Control | Where |
|---|---|---|
| 1 | **Thème** — four moods, four live previews | top of `/parametres/` |
| 2 | **Plateau** — the six presets | inside "Personnaliser" |
| 3 | **Couleurs libres** — the reader's own two squares | same disclosure |

⚠️ **Never present 4 themes × 6 presets as twenty-four equivalent choices.**
Each theme names its own board; a reader who wants a different one asks for it.
Levels 2 and 3 share **one** disclosure — two collapsed panels side by side is
two decisions again, which is the thing the hierarchy exists to prevent.

**Light/dark is not a fourth axis.** Every theme declares both palettes ("Bois
de jour", "Bois de nuit") and the existing toggle now switches within the
active theme. Eight combinations ship; all eight are audited.

### ⚠️ BOIS IS THE BASE, AND ITS VALUES STAY IN `tokens.css`

The palette this site has always had *is* Bois. It did not move into
`site-themes.css` with the other three, for two reasons about failure modes:

- a reader with no stored preference, **or with no JavaScript**, gets a
  complete theme from the base tokens alone — no class, no cascade, no gap;
- the other three override it, so anything a theme forgets to restate falls
  back to something coherent rather than to nothing.

Consequence: **a token added to `:root` is a token every other theme may need
to override.** The auditor catches the omission; nothing else will.

In practice each theme restates all 34 surface/text/border/accent/level/
selection/ambient tokens, in both modes. Four are deliberately left inherited
everywhere — `--mcc-board-last-move`, `-selected`, `-check`, `-hint` — because
they are alpha washes chosen to read over **any** preset's squares, which is a
property of the overlay rather than of the theme. The square colours themselves
are absent for the opposite reason: they belong to the `.board-<id>` preset,
which is level 2 and outranks the theme.

### ⚠️ The cascade is `:is(:root, .theme-preview)`, and the `:not()` is load-bearing

Writing S for `:is(:root, .theme-preview)`:

```css
S.theme-X:not([data-theme='dark'])   /* X, light  (0,3,0) */
S.theme-X[data-theme='dark']         /* X, dark   (0,3,0) */
S.theme-X                            /* X, either (0,2,0) */
```

`site-themes.css` is imported **after** `tokens.css`, so a bare
`:root.theme-marbre` (0,2,0) would tie with `:root[data-theme='dark']` (0,2,0)
and win on source order — painting Marbre's **light** values over Bois's dark
ones. A dark-mode reader on Marbre would get white text on a white page. The
`:not()` lifts both mode blocks to (0,3,0) and makes them mutually exclusive,
so neither can be decided by source order.

`:is(:root, .theme-preview)` rather than `:root` alone is what lets
`/parametres/` paint a theme it is not wearing: a tile is
`<div class="theme-preview theme-souiri">` and gets the real tokens. `:is()`
takes the specificity of its most specific argument, and both arguments are
(0,1,0), so the arithmetic above is unchanged — which is why it is `:is()` and
not a selector list. The base dark block never competes on a preview element at
all, because `:root[data-theme='dark']` cannot match a div.

### ⚠️ `boardTheme` IS OPTIONAL, AND ABSENCE IS A REAL STATE

Absent ⇒ **follow the theme**. Present ⇒ the reader **pinned** a preset.

**A pin survives a theme change.** Decided this session, and it is the answer
to "does deviating to another preset survive?" — yes. Level 2 exists for a
player with a board preference *independent of the site's mood*; resetting it
whenever they try a theme would destroy the only preference that level is for,
silently. `followThemeBoard()` and the "Suivre le thème" option are the escape
hatch, named and offered first in the list.

A non-optional field plus a `pinned` boolean would let the two contradict each
other. Absence carries the meaning instead.

**The v1 migration is a no-op by construction.** The key stays `mcc:theme:v1`
because the *shape* is unchanged — a field was added, a field became optional —
so nothing stored under v1 is reinterpreted. Every pre-E6 record has a
`boardTheme`, so every returning reader is pinned to exactly the board they
last saw, on Bois, which is the palette that record was written under.

⚠️ That pins readers who never actively chose a preset (everyone who touched
the page at all had `classique` persisted by the old non-optional default).
Accepted deliberately: the alternative is changing what a returning reader sees
without being asked, and "no loss" beats "probably what they'd have wanted".

### Piece sets — one stylesheet each, fetched on board pages only

`vendor/pieces/<set>/*.svg` → `scripts/build-pieces.mjs` → `public/pieces/<set>.css`.

⚠️ **`chessground.cburnett.css` is no longer imported by `BoardSurface.tsx`.**
Four sets in the island chunk measured ~110 KB raw / ~32 KB brotli, of which a
reader uses one. Split, they cost 2.3–12 KB brotli each. `BoardSurface` is
still the only file importing Chessground; the pieces simply stopped being
Chessground's business and became the theme's.

- The head script injects `<link rel="stylesheet" href="/pieces/<set>.css">`
  **only when `<html data-board>` is present**, which BaseLayout's `board` prop
  sets. Appended during head parsing, so it blocks render exactly as a static
  stylesheet does and the pieces paint *with* the board. Injecting from the
  island's mount effect would show empty squares first — worse than a theme
  flash, because it reads as the position having failed to load.
- ⚠️ **A board page that forgets `board` renders squares with no pieces, and
  nothing errors.** `themes.spec.ts` walks every board route and asserts it.
  `LessonPage` computes it (`pairs.some(p => p.board)`) because a lesson may be
  pure prose.
- ⚠️ **Percent-encoded data URIs, not base64.** Base64 inflates by a third AND
  destroys the repetition brotli feeds on, since twelve pieces share most of
  their markup. Measured on merida: 46.0 KB raw / 13.6 KB brotli base64 against
  36.7 KB / 6.7 KB percent-encoded.
- `/pieces/preview.css` is four knights, for the settings tiles. Loading four
  full sets there would be ~32 KB brotli to draw four glyphs.

### ⚠️ MOST LICHESS PIECE SETS ARE UNUSABLE HERE — check before adding one

The repo is **GPL-3.0-or-later**, which forbids added restrictions. Verified
against `lila/COPYING.md` and, where linked, the upstream licence:

| Shipped | Theme | Author | Licence |
|---|---|---|---|
| `merida` | Bois | Armando Hernandez Marroquin | GPLv2+ |
| `kiwen-suwi` | Marbre | neverRare | CC BY 4.0 |
| `chessnut` | Souiri | Alexis Luengas | Apache-2.0 |
| `cburnett` | Terminal | Colin M.L. Burnett | GPLv2+ (also CC BY-SA 3.0 on Wikimedia) |

**Rejected:** every `CC BY-NC-SA` set (the majority), "freeware" (`chess7`,
`companion`, `leipzig`), unlicensed (`reillycraig`, `riohacha`), no-derivatives
(`shahi-ivory-brown`), and **`alpha`** — named in the E6 brief, but "free for
personal non commercial use". Also declined: the **AGPLv3+** sets (`letter`,
`pirouetti`, `pixel`). Not a conflict, but §13 adds an obligation the repo does
not carry, and accepting it is a project-level decision. `pixel` would have
suited Terminal; it is left on the table rather than quietly adopted.

Apache-2.0 is compatible with GPLv3 but **not** GPLv2 — which is why the repo
being GPL-3.0-**or-later** matters here rather than being a formality.

⚠️ `mono` ships **six** SVGs (one shape per role, coloured in CSS), not twelve.
`build-pieces.mjs` fails loudly on that shape rather than emitting half a set.

Every set needs its own entry in `site.legal.attributions`. For three of the
four, attribution is a **condition of use**, not a courtesy.

### ⚠️ A PIECE SET IS ONLY LEGIBLE ON SOME BOARDS — and it is now audited

The first draft of Terminal shipped `kiwen-suwi` on `phosphore` and **lost half
the position**. That set is MONOCHROME — both sides are one flat `#262626`,
distinguished by shape — so against phosphore's `#082a16` dark square it
measures **1.03:1**. Nothing errored, no declared colour was wrong, and every
contrast assertion passed. It was found by looking at a screenshot.

`check-contrast.mjs` now audits **each theme's piece set against the board that
theme uses**. The inks are declared in `src/config/piece-sets.ts` (`body` +
`outline`, read off the SVGs by hand) — a copy, deliberately, because parsing
arbitrary SVG fills fails OPEN: an auditor that quietly finds no colours reports
success.

⚠️ **The rule is "at least one ink clears 3:1", not "the piece contrasts".** A
white piece on a light square is always low-contrast — that is true of every
chess set ever made — and it is the OUTLINE that separates it. A monochrome set
has one ink and no second chance, which is precisely what makes it unsafe on a
dark board and fine on a pale one.

Consequence: **`cburnett` is not interchangeable on Terminal.** It is the only
shipped set whose black pieces carry a light outline (`#ececec`, 13.14:1 on that
square). Verified to fail with the message *"MONOCHROME set, no outline to fall
back on"* if the old assignment is restored.

### ⚠️ `background-size` CYCLES — it broke Souiri's board into a 2×2 checker

The theme texture was stacked as a second `background-image` layer on
`cg-board`, with `background-size: auto, 25% 25%`. That is correct for a
one-gradient texture and silently wrong for a two-gradient one: with three
layers and two sizes the list cycles, the checker lands on `auto`, and the
board renders as **one giant 2×2 checker** instead of 8×8.

Souiri's texture is two gradients. The real board was broken, not only the
preview — and it survived a screenshot review, because a giant checker still
reads as "a chessboard" until you count the squares.

The texture is now a `cg-board::before` layer. That decouples it from the
checker entirely (a theme may use as many gradients as it likes) and paints
below the squares and pieces, so the wash never tints a piece.

**The general lesson: never rely on positional `background-*` lists when one of
the layers comes from a variable a theme controls.** The count is not yours.

### The sixth board preset

`phosphore` — phosphor green on black — exists because Terminal had no honest
default among the five. Both squares are dark, so it carries the tightest
separation on the site (3.81:1 against a 3.0 floor). **Do not darken the light
square to make it "more terminal".**

### ⚠️ The contrast matrix is now 275 assertions, and that growth is the point

4 themes × 2 modes × 27 pairs, plus 6 presets × (separation + 8 theme pages).
Up from 67. Seven of the eight theme/mode combinations are ones nobody on this
project uses day to day, and an eyeball does not scale to that.

- The auditor **discovers themes by parsing the CSS**, so adding one audits it.
- It resolves each theme through the **same merge order as the cascade**
  (`:root` → base dark → theme common → theme mode). Getting that order wrong
  would prove a palette the site never paints, which is worse than not auditing.
- The board-edge check runs each preset against **all eight pages**: a preset is
  independent of the theme, so a pinned `glace` must still read on Terminal.
- Default output is one line per combination; `--verbose` prints the table.
- **A failing combination is fixed or dropped, never excepted.** Terminal's
  light page moved from `#e8eee8` to `#f1f6f1` because `glace` measured a 3.08
  edge against it — passing, and the tightest ratio on the site. The fix was to
  remove the outlier, not to grant it one.

### `.text-brass` now resolves `--mcc-accent-text`

It used to name `brass-700`, with a second rule flipping to `brass-300` in
dark. Two hardcoded steps become **eight** with four themes, and seven would be
wrong the day a page colour moved. `--mcc-accent-text` already means "the
accent, at whichever step clears AA against *this* surface", every theme
declares it, and MUST_PASS proves it in all eight. The unlayered-beats-layered
mechanism is unchanged and still the point.

`::selection` and the level fills became themed tokens for the same reason — a
brass selection was a visible foreign object on a phosphor page.

---

## Typography follows the theme — HEADINGS ONLY (E7)

| Theme | Heading face |
|---|---|
| Bois | Fraunces (warm old-style serif) |
| Marbre | Playfair Display (high-contrast classical) |
| Souiri | Outfit (open, geometric — echoes zellige construction) |
| Terminal | JetBrains Mono (readable, not a pixel face) |

⚠️ **THE BODY FACE NEVER CHANGES.** That is the E7 safety rule and it is
tested: a spec collects the computed body family in all four themes and asserts
there is exactly one. Rhythm may vary; family may not. A beginner learning the
en-passant rule must not have to fight the page.

### ⚠️ A theme loads only its own heading font — and the preload is the trap

Declaring four `@font-face` families costs nothing: a browser fetches a font
file only when something rendered actually uses that family, and each theme
sets `--mcc-font-display` to one.

**A `<link rel="preload">` fetches unconditionally** — that is what preload
means. So the heading preload is **injected by the head script for the active
theme**. The static Fraunces preload that used to sit in `BaseLayout` would now
make three themes out of four download two faces and use one. Inter stays a
static preload: every theme uses it.

⚠️ `--mcc-font-display`, never `--font-display`. The raw `--font-*` entries are
the palette of faces and do not follow the theme — same trap as a component
reading `--color-wood-600` and staying light-mode-only.

Upstream fontsource filenames are the **package** name
(`playfair-display-latin-…`); we serve short names (`/fonts/playfair-latin-…`).
`build-fonts.mjs` derives the source stem from `pkg` so a rename fails loudly at
generation time instead of leaving a stale literal.

### Reading craft — `src/styles/typography.css`

65ch measure, 1.7 leading, subheads with more space above than below, a drop cap
on the **first** prose chunk only, small caps for mentions, French guillemets
with U+202F, and notation set as a badge.

- The drop cap is `::first-letter` on real text — a screen reader reads the word
  normally. **Never split the letter into its own element**: that turns "Une
  pièce" into "U" + "ne pièce" for anyone listening. It disappears below 26rem,
  where it would sit beside two words.
- `.prose` rules moved **out of `LessonPage`'s scoped `<style>`**. Astro scoped
  rules carry `[data-astro-cid-…]` and beat any global rule of the same class
  specificity, so shared styles could only lose to them. `.prose` is used by the
  privacy notice too; there is one definition now.
- ⚠️ **Old-style figures are declared and currently INERT.** Inter ships no
  `onum`. Kept because it is harmless, correct the moment a face that has them
  is used, and documents intent. A spec **reports** whether it took effect
  (rather than asserting) so this note cannot quietly become false.

### ⚠️ `--font-mono` HAS NEVER EXISTED — and it silently killed lesson notation

`LessonPage`'s `<code>` rule read `var(--font-mono)`. An unknown custom property
invalidates the whole `font-family` declaration at computed-value time, so
**every inline notation in every lesson rendered in Inter**, from the commit
that introduced lessons until this session. No warning, no error.

Third occurrence of this exact class (`--mcc-border`, `--font-mono`). The token
is `--font-notation`. The spec asserts the **resolved** family, never that a
rule exists — asserting the rule would have passed throughout the bug.

---

## ⚠️ An `is:inline` script ships VERBATIM, comments and all

Astro does not process `is:inline` — that is the whole point of it. Written the
way the rest of this codebase is commented, the theme head script measured
**8.4 KB per page across 84 documents**, before the first paint it is blocking.

The rationale now lives in **BaseLayout's frontmatter**, which is compiled away;
the script keeps short pointers back to it. 8.4 KB → 5.7 KB, and 251 KiB off the
precache. Anything added to that script follows the same rule.

The *data* it needs is not duplicated at all: `MCC_THEMES` is serialised in from
`@config/site-themes` by `define:vars`, so which board and which pieces each
theme defaults to cannot drift even in principle. **Only the logic is
duplicated, and only because it must be.**

---

## Theming — the layers, one source of truth each

`/parametres/` (+ `/en/parametres/`). Everything is device-local, in `localStorage`, under the same rules as progress.

| Layer | What | Where the values live |
|---|---|---|
| 0 | **Four site themes** (E6) | `.theme-<id>` in `site-themes.css`; Bois is the base in `tokens.css` |
| 1 | Light / dark / system, **within** the active theme | `[data-theme='dark']` blocks in `tokens.css` and `site-themes.css` |
| 2 | Six board presets | `.board-<id>` in `board-themes.css` |
| 3 | The reader's own two square colours | inline properties on `<html>` |

Each layer overrides the one above it by ordinary cascade — theme class beats `:root`, board class beats the theme's board defaults, inline beats class. There is no `!important` anywhere, but layer 0 **does** need the specificity arithmetic set out in the E6 section above; it is the one place where a tie would be decided by source order.

### `src/lib/theme.ts` is the single migration point

`mcc:theme:v1`, version in the key, guarded access, normalised field by field on read, silent on failure — the same file-for-file conventions as `src/lib/progress.ts`, for the same reasons. **Nothing else may touch `localStorage` or know the key.**

A malformed record falls back to the defaults rather than to a half-applied theme: a custom pair with one valid colour is not a board, so it is discarded whole.

### ⚠️ The head script duplicates `applyTheme()`, deliberately

`BaseLayout.astro` carries an `is:inline` script that reads the stored theme and sets `data-theme`, the board class and any custom properties **before first paint**. It cannot import `src/lib/theme.ts` — that would reintroduce the module fetch it exists to avoid, and a dark-mode reader would get a white flash on every navigation.

So the two must be kept in step by hand. `tests/e2e/theme.spec.ts` has a **no-flash test** that records the attribute at the moment `<body>` first appears; if the script is ever moved out of the head, made a module, or made async, that is what fails.

The script also adds `js` to `<html>`, which is how the header toggle is revealed without a frame of visible-but-inert button, and re-applies on `astro:after-swap` so the theme cannot silently break on the commit that adds view transitions.

### System mode is resolved in JS, so `data-theme` is always concrete

`data-theme` only ever holds `light` or `dark` — `system` is resolved before it is written, and a `matchMedia` listener re-resolves it live. That keeps ONE dark block instead of the same thirty declarations duplicated into a `prefers-color-scheme` media query, which is the kind of duplication that drifts.

**The trade: theming needs JavaScript.** Without it the site renders light and is fully usable; the toggle simply never appears. That is a deliberate choice, not an oversight — a no-JS dark mode costs a second copy of the whole palette.

### Only the `--mcc-*` layer flips

The raw `--color-*` scales are the palette and never change. **A component that reaches past the semantic layer for a raw scale step will not follow the theme** — that is exactly why `--mcc-danger-text`, `--mcc-accent-strong` and `--mcc-border-on-inverse` were added: each one replaced a hardcoded `var(--color-wood-600)` or similar that would have stayed light-mode-only at night.

Fills are the exception and are correct as-is: a brass or wood fill is the same colour at night, so its ink label is too. That is why the unlayered `.bg-*` rules have no dark variant — but `.text-brass` does, because brass-700 was chosen to be readable on *cream* and is nearly invisible on a green-black page (2.5:1). The rule is "brass as text takes whichever step clears AA against the surface"; the surface changed.

### Custom colours are board-only. DECIDED, v1.

Two pickers: light square and dark square. **Site-wide custom colours are not offered and are not planned.** A reader choosing their own page and text colours would have to be validated pair by pair across every surface the site has, in both modes — and the failure mode is an unreadable site rather than an unusual board. The board is bounded: two colours, two derived inks, one thing to check.

Coordinate inks are **derived, never chosen**: `bestInkFor()` picks whichever of the two inks clears the higher ratio against each square, exactly as the presets do explicitly. The settings page shows the resulting ratio live and warns below AA — and **lets the reader proceed**. It is their board; an unreadable one should be a choice rather than an accident, so the warning stays visible while the colours are in use.

### The contrast audit parses the real CSS

`scripts/check-contrast.mjs` no longer keeps its own copy of the palette. It reads `tokens.css` and `board-themes.css`, resolves the `var()` chains, and runs the full pair matrix against **both** palettes plus every board preset. Add a preset to the CSS and it is audited on the next build; there is no list to remember to update.

It runs as the **first** step of `npm run build`, so a contrast regression fails the build before anything else is spent.

Two things it does that are worth keeping:

- It reads **all** blocks for a selector, not the first. `:root` is declared several times in `tokens.css`, as the cascade allows; reading only the first reported `--mcc-danger-text` as unresolved.
- The colour maths is a **second, independent implementation** of the one in `theme.ts`. An auditor sharing its formula with the code it audits would agree with its own bugs.

Its first run in this shape found a **real pre-existing bug**: the `ink-950` label on an "avancé" level badge sat at 4.39:1, under AA, because the old script checked the brass fills but never the level fills. `--color-wood-400` was lightened to fix it.

---

---

## The four custom-property bugs — the table (moved from CLAUDE.md, v0.17.0)

**Read when:** a border, colour or font is silently not applying, or you are
about to write a spec that asserts a CSS rule exists.

### ⚠️ AN UNKNOWN CUSTOM PROPERTY FAILS SILENTLY — and it has bitten three times

`var(--does-not-exist)` invalidates the **whole declaration** at computed-value
time. No error, no warning, no visible red — just a border that computes to
`0px` or a font that falls back to Inter.

| Written | Real token | Damage |
|---|---|---|
| `--mcc-border` | `--mcc-border-subtle` / `--mcc-border-strong` | 12 borderless elements across 7 files |
| `--font-mono` | `--font-notation` | every inline notation in every lesson set in Inter |
| `--font-display` | `--mcc-font-display` | a heading that never follows the theme |
| `--mcc-text`, `--mcc-text-muted` | `--mcc-text-primary` / `--mcc-text-secondary` | the child picker's buttons and intro drew no colour at all |

**The rule: assert the RESOLVED value, never that a rule exists.** A spec
asserting the rule would have passed throughout all four bugs.

