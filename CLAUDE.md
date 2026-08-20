# CLAUDE.md — Mogador Chess Club

This file is the operational reference for working on this codebase with Claude
Code. It holds the rules that bind **every** session: the conventions, the
Critical Features, the content-authoring rules, the testing and promotion
policy, and the architectural decisions that constrain new work.

## ⚠️ THIS FILE HOLDS THE RULES. `docs/reference/` HOLDS THE DETAIL.

CLAUDE.md is loaded into context on every session and has a hard size limit
(150 000 characters — see "The size guard" below). It reached **247 KB** once,
past which the tail was silently no longer being read: rules were present in the
file and absent from the session, which is worse than not having written them.

So the split is by **when you need it**, not by importance:

- a rule that constrains work you might do *without knowing this area exists*
  stays here;
- the reasoning, the measurements and the incident narratives behind it live in
  `docs/reference/`, one file per area, each with a **Read when** line at the top.

**Nothing was deleted.** Every reference file names when it matters; read it
before touching that area, not speculatively.

| Read before touching | File |
|---|---|
| The board island, views, `MoveInput`, board CSS/geometry/coordinates | [`docs/reference/board.md`](./docs/reference/board.md) |
| Content: traps, lessons, exercises, tutorial steps, claims | [`docs/reference/content.md`](./docs/reference/content.md) |
| Deploying, wrangler, the domain, the SW, the manifest, generated assets | [`docs/reference/deployment.md`](./docs/reference/deployment.md) |
| Starting or ending a long-lived process; a test run that smells stale | [`docs/reference/dev-environment.md`](./docs/reference/dev-environment.md) |
| Stockfish, `/jouer/`, the level presets | [`docs/reference/engine.md`](./docs/reference/engine.md) |
| Adding a dependency, piece set, font or any third-party asset | [`docs/reference/licence.md`](./docs/reference/licence.md) |
| Any animation, duration, pacing delay or sound | [`docs/reference/motion-sound.md`](./docs/reference/motion-sound.md) |
| The video facade, a poster, or ANY third-party embed | [`docs/reference/video.md`](./docs/reference/video.md) |
| Points, ranks, achievements, streaks, index cards | [`docs/reference/progression.md`](./docs/reference/progression.md) |
| Auth, migrations, RLS, sync, the child-profile model | [`docs/reference/supabase.md`](./docs/reference/supabase.md) |
| Writing or debugging a spec; explaining a browser-specific failure | [`docs/reference/testing.md`](./docs/reference/testing.md) |
| Tokens, themes, board presets, piece sets, fonts, the head script | [`docs/reference/theming.md`](./docs/reference/theming.md) |
| The header, the mobile bottom bar, the home page, the resume resolver | [`docs/reference/ui-navigation.md`](./docs/reference/ui-navigation.md) |
| Planning a phase, or checking whether something is built | [`docs/reference/roadmap.md`](./docs/reference/roadmap.md) |
| Why a rule exists — the incident behind it | [`docs/reference/incidents.md`](./docs/reference/incidents.md) |
| Bringing the project up on a new machine — toolchain, secrets, what is per-machine | [`docs/SETUP-NEW-MACHINE.md`](./docs/SETUP-NEW-MACHINE.md) |

⚠️ **A rule that belongs here must not be "tidied" into a reference file.** The
test is whether a session could break it *without going looking* — if yes, it
stays here. Conversely, a new incident narrative goes to the reference file, and
only its lesson comes back.

---

## Project context

**Project:** Mogador Chess Club — a chess *teaching* platform: courses, an opening-trap library, interactive exercises, and play against Stockfish.
**Developer:** Nachi3D (Seàn McGannon) — Nachi3D Labs credited in footer
**Location:** Essaouira, Morocco
**Venue:** Dar Souiri — **held in config, never in components** (see the portability rule below)
**Association:** Association Essaouira Mogador (`@associationessaouiramogador`), credited in the footer
**Project root:** `N:\Nachi3D-Labs\Mogador-Chess-Club-Website`
**Domain:** `mogadorchess.nachi3dlabs.com` — a subdomain of the Labs domain, already a Cloudflare zone, so no registrar step. `mogadorchess.ma` is a separate, later option and blocks nothing. See "Deployment".
**Hosting:** Cloudflare Workers static assets, fully static output — see "Deployment"
**Staging:** Cloudflare preview deployments on `dev`
**Languages:** FR (default, at the root) + EN (under `/en/...`)

**Footer credit:** "Site créé par [Nachi3D Labs](https://www.nachi3dlabs.com)" — same pattern as other Labs projects.

### Venue portability — a hard rule

The club currently meets at Dar Souiri. It must remain **portable** to another venue, or to independent classes with no fixed venue at all. Therefore:

- Every venue string lives in `site.venue` in `src/config/site.ts`. **No component may contain a venue name, an address or a map link.**
- Every venue field is nullable. `hasVenue()` and `venueAddress()` return null when there is nothing publishable, and the venue blocks in the footer and on `/contact` disappear rather than rendering an empty heading.
- An agenda entry may carry its own `venue`, which overrides the site default for that session only. A session can move without touching site config, and site config can move without rewriting past sessions.

Changing venue is a one-commit change in one file. Keep it that way.

---

## What this site is

1. **Cours** — progressive lessons, from piece movement to rook endgames.
2. **Pièges** — a library of classic opening traps: how to set them, how not to fall for them.
3. **Exercices** — positions to solve on an interactive board, with hints and solutions.
4. **Jouer** — a game against Stockfish, in the browser. (Phase 2.)
5. **Agenda + contact** — when the club meets, and how to reach it.

## What this site is NOT (v1)

- ❌ **No backend, no Supabase, no accounts.** Progress is stored in `localStorage`. See the stack rationale below.
- ❌ **No online play between humans** in v1. That is v2 — see "Online play (v2)".
- ❌ No CMS. Content lives in the repo as typed content collections.
- ❌ No payments, no memberships.
- ❌ **No in-app communication. Ever.** See the rule below.

### No in-app communication — a permanent rule, not a v1 limitation

The site carries **no chat, no comments, no forum, no reactions, no user-submitted content of any kind**. This is not a "later" item; it is a standing decision and it does not expire with v2's online play (which carries moves between two players in a room, and nothing else — no message channel alongside it).

Why it is written as a hard rule: this is a club that teaches **children**. Any channel where a stranger can send a message to a minor turns a static teaching site into a moderation obligation, a safeguarding obligation, and a GDPR/Law 09-08 data-processing obligation — none of which a volunteer club can staff. There is no version of "just a small comment box" that avoids this.

**Sharing is outbound only.** The WhatsApp share button hands the *reader's own* device a prefilled message and gets out of the way — `wa.me/?text=…` with **no recipient number**. We never post anything, store anything, or receive anything. Any future share follows the same shape.

Anything that looks like an inbox belongs off-site: the club's own WhatsApp number in `src/config/site.ts`, or the association's Instagram.

---

## Stack overview

- **Astro 7** + TypeScript strict — static-first, content collections for traps/courses/exercises
  - `output: 'static'`. There is **no SSR, no adapter and no server-side code at all.** That is why `wrangler` is not a dependency (it is invoked with `npx` at deploy time — see "Deployment") and why Playwright serves the build with `astro preview` rather than a wrangler dev server (Claraloha needs the latter because it has a Function; we deliberately do not).
  - Requires **Node ≥ 22.12** (declared in `package.json` `engines`).
  - Astro 7 runs **Vite 8** and a Rust compiler that rejects invalid/unclosed HTML instead of silently repairing it. Keep `.astro` markup well-formed.
- **Tailwind v4** (`@tailwindcss/postcss`)
  - `src/styles/global.css` imports `tailwindcss/index.css`, **not** the bare `tailwindcss` specifier. Vite resolves CSS `@import` before the Tailwind PostCSS plugin runs and its resolver ignores the package `exports` map, so the bare specifier fails the build. Don't "tidy" it back. (Lesson imported from Claraloha.)
- **chess.js** — rules, legality, SAN/FEN/PGN parsing. The single source of chess truth; never hand-roll move legality.
- **Chessground** (lichess's board) — rendering and input only. It knows nothing about rules.
  **GPL-3.0-or-later** — see "Third-party licences" before assuming this is settled.
- **Preact** (`@astrojs/preact`) — present solely so the board can be a `client:visible` island.
  The board is the ONLY hydrated component on the site; everything else is static `.astro`.
- **Stockfish** — Phase 2, **lazy-loaded, never precached**. See "Service worker".
- **PWA** — generated manifest + Workbox precache.
- **Cloudflare Workers** static-assets hosting (see "Deployment") + **Umami** analytics (env-driven; omitted entirely when unset).
- **Playwright** + **axe-core** tests.

### Why static, and why no Supabase (v1)

The whole v1 product is *content plus a chess engine in the browser*. There is no per-user data worth a server: lesson progress is one visitor's private state, so it lives in `localStorage`. There are no capacity-constrained bookings (Baby Club's reason for Supabase), no transactions, no roles. Adding a database would mean auth, a privacy policy, and a monthly bill in exchange for nothing a visitor can perceive.

Consequence to respect: **progress is device-local and can be cleared by the browser.** Never build a feature whose value depends on progress surviving — no streaks that punish loss, no "resume where you left off" as the only way to reach a lesson.

#### `src/lib/progress.ts` — the single migration point

All of it lives behind that one module. **Nothing else in the codebase may touch `localStorage` or know the key.** If accounts ever arrive, swapping the backing store is a rewrite of that file and nothing else — the same containment trick as `BoardSurface.tsx`.

⚠️ Five properties hold it up, and each was chosen against a specific failure:
the **version is in the key** (`mcc:progress:v1`); **every access is guarded and
fails silent**; records are **normalised field by field on read, never cast**; a
bad stored value is **never deleted**; and `resetAttempts()` clears the counter
and **never the solve**.

⚠️ **The solved ticks on `/exercices/` are a plain `<script>`, not an island.**
The one-board-island rule is about hydrated framework components, and this must
stay on the right side of that line.

**➡️ The key, the shape, and the reason behind each of those five:
[`docs/reference/progression.md`](./docs/reference/progression.md).**

### Online play (v2) — keep game logic transport-agnostic

v2 adds human-vs-human play over **room codes backed by Cloudflare Durable Objects**. It is not built yet, and the point of writing it down now is a constraint on v1 code:

> **The game logic must not know how moves arrive.** A module that applies a move, validates it and computes the resulting position takes a position and a move, and returns a new position. It must not read from the DOM, call Stockfish directly, or assume a local opponent.

Concretely: keep `src/lib/` chess logic pure and synchronous. The board island, the Stockfish worker and (later) the Durable Object socket are all just *callers*. If v1 wires "the opponent" straight into the board component, v2 becomes a rewrite instead of an addition.

---

## Conventions (NEVER deviate)

### Git
- Branches: `claude/<feature>` → `dev` → `main`
- `--no-ff` merges always (preserves branch history)
- Conventional commit format: `feat(scope): description`
- **Commits are authored as `nachi3D` only. NEVER add `Co-Authored-By` lines for Claude or anyone else.**
- Tag releases: `git tag -a vX.Y.Z -m "..."` on main after merge
- **Bump `package.json` `version` to match the tag, in the release commit.** See the promotion routine below.
- Update CHANGELOG.md on every merge to dev
- **Back-merge convention:** after each release, merge `main` → `dev` to keep histories aligned
- Claude Code merges to `dev` only; **`dev` → `main` requires Seàn's explicit approval per release**

#### Session finish routine

Every session that reaches a merge updates all three, in the same commit as the work:

1. **`CHANGELOG.md`** — what changed, and the reasoning behind anything surprising.
2. **`CLAUDE.md`** — any decision, rule or gotcha that the next session would otherwise rediscover. ⚠️ **The RULE lands here; the reasoning, the measurements and the story land in the `docs/reference/` file for that area.** Both, not one — a rule with no recorded reason is re-litigated, and reasoning nobody is pointed at is not read. The size guard fails the build if this file outgrows its limit again; when it warns, **split, do not trim**.
3. **`docs/MANUAL-TESTS.md`** — **whenever the session adds or changes anything a visitor can see.** New feature, new page, new failure mode, new regression worth watching: it goes in the checklist. This is the one most easily skipped and the one whose absence is least visible — a checklist that lags the site makes an incomplete test pass feel complete.

---

#### ⚠️ KILL EVERY LONG-LIVED PROCESS THE SESSION STARTED

A session that starts a server **terminates it when the task that needed it
ends** — `astro preview`, `npm run demo`, a watch, anything holding a port.

This is not tidiness. A stale listener makes Playwright's `reuseExistingServer`
skip its own build and test **whatever is on disk from before**, so a fixed bug
keeps "failing". Orphaned browsers have cost three red gates in a row.

⚠️ **A port list is not the sweep — sweep by repo path**, and sweep the browsers
too, because an orphaned browser holds no port and its command line never
mentions this repo. `scripts/demo.mjs` does all three on startup **and** on
Ctrl+C. ⚠️ **Stopping the npm wrapper does not stop the server**; verify the port
is free and kill by PID.

⚠️ **And the converse: what is on 4321 may not be ours.** Other local projects
use that port too. Confirm the listener's command line carries this repo's path
before killing it, and on a collision run the suite on an alternate port.

**➡️ The exact probes, the counts each incident produced, and the verification
behind them: [`docs/reference/dev-environment.md`](./docs/reference/dev-environment.md).**
Read it before writing or changing any sweep — matching on `chrome.exe` by name
rather than by executable path would kill Seàn's own browser.

---

#### Promotion routine — `dev` → `main`

Every promotion does all four, and the version bump is **part of the release
commit, not a follow-up**:

1. **Bump `package.json` `version` to the release version** — `0.5.0` ships as
   `"version": "0.5.0"`. It is the one machine-readable statement of what this
   tree *is*, and it is what `npm version`, tooling and a future consumer read.
2. **Stamp `CHANGELOG.md`** — move `[Unreleased]` to `[X.Y.Z] — <date>` and add
   the compare-link pair at the bottom.
3. **Merge `--no-ff`, then `git tag -a vX.Y.Z`** on main.
4. **Back-merge `main` → `dev`.**

⚠️ **The bump belongs in the release commit because a promotion already runs
the full gate.** Doing it afterwards means either a second gate for a one-line
change or an untested tree — and `package.json` is deliberately on
`scripts/quick.mjs`'s FORBIDDEN list, so it cannot take the fast path on its
own. That exclusion is correct and stays: its pattern cannot tell a `version`
string from a dependency edit, and guessing wrong in that direction is how a
dependency change reaches production on a shortened gate.

⚠️ **This drifted for three releases.** v0.3.0, v0.4.0 and v0.5.0 all shipped
with `"version": "0.2.0"`, because nothing named the file and nothing checked
it. Tags said one thing and the manifest said another.

### Shell
- NO chained `&&` commands — git and cd run as separate steps
- No PowerShell
- One task per prompt OR large batched prompts for related changes
- All prompts in a single copyable block
- No confirmation questions for standard commands

### Code
- TypeScript strict mode, no `as any` to bypass types
- All public user-facing strings through the i18n layer — no hardcoded FR/EN in components. The layer lives in `src/i18n/`: `ui.ts` (string tables — **FR is the reference table and EN is typed against it, so a missing translation is a compile error**) and `paths.ts` (locale-aware path building + the switcher's path-preserving counterpart lookup). Paths are emitted with a trailing slash to match `build.format: 'directory'`.
- Astro content collections with Zod schemas — content is typed data, not loose markdown
- Components never hardcode a colour or a font: they consume the tokens in `src/styles/tokens.css`

### Approach
- Recon-first for complex features (audit before changing)
- Two-step diagnosis + fix for bugs
- CLAUDE.md maintained across sessions — update it when decisions land

---

## Critical Features — NEVER BREAK

1. **Venue portability.** No venue string outside `src/config/site.ts`. See the rule above.
2. **i18n FR/EN.** Every public page in both languages; the switcher preserves the path; FR default at root with no `/fr/` prefix.
3. **One board island, lazily hydrated.** See the architecture rule below.
4. **Exercise validation never calls a correct move wrong.** See the `onlyMove` rule below.
5. **PGN stays language-neutral.** See the PGN rule below.
6. **Stockfish is never precached.** See "Service worker".
7. **WhatsApp number correctness** — always via `whatsappUrl()` from `src/config/site.ts`, never hardcoded per page.
8. **The GPL source link is in the footer of every page.** It is how the licence's distribution requirement is met, not decoration. See "Licence".
9. **No third-party request without an explicit reader click.** See the rule below. The engine obeys the same rule for its own 3.6 MB.
10. **`localStorage` never breaks the page.** Every access goes through `src/lib/progress.ts` or `src/lib/theme.ts` and fails silent.
11. **Every board is playable without a pointer.** `MoveInput` feeds the same path as a drag; see "Both inputs, one path".
12. **Code and content are licensed separately.** Substance vs structure — see "Licence".
13. **Both palettes clear AA.** `check-contrast.mjs` runs light AND dark, plus every board preset, as the first step of the build.
14. **No flash of the wrong theme.** The head script applies it before `<body>` exists; a spec proves it.
15. **Every animation belongs to one of three motion families, and nothing sits between 180ms and 250ms.** `src/lib/motion.ts` is the single source; a spec sweeps every element for violations. See "Motion".
16. **The board stays sober.** Motion lives around it. The one exception is the correct-move pulse — one Transition, one square, exercise mode only.
17. **Reduced motion means OFF for decoration and INSTANT for feedback** — never "the same show, slower". Both halves are tested.
18. **Accounts are OFF in production, and OFF means NOT BUILT.** No auth route in `dist/`, no Supabase ref in any bundle. See the account-flag section.
19. **`import.meta.env.NAME`, never `import.meta.env['NAME']`.** Bracket access ships the whole env object, anon key included.
20. **The home menu's labels ARE the nav's labels**, from the same `nav.*` keys. Never a second string for the same destination.
21. **The home menu works with no JavaScript**, and fits one screen on a phone. Both are tested.
22. **Every theme clears AA in BOTH its modes, against every board preset.** 275 assertions, and a failing combination is fixed or dropped — never shipped with an exception.
23. **The body typeface never changes with the theme.** Headings do; body does not. Tested by comparing the computed family across all four.
24. **A theme loads only its own heading font and its own piece set.** Asserted against the network log, not against appearance.
25. **Every piece set is licence-checked individually and credited on `/mentions-legales/`.** For three of the four it is a condition of use, not a courtesy.
26. **Mobile and desktop diverge at 768px, deliberately.** Bottom bar + one-line header + dashboard below; grouped header + retro menu above. Both sides are pinned by specs.
27. **The bottom bar has exactly five entries, every one of them a SECTION WITH A LANDING SCREEN**, and it never hides on scroll; no page may hide content behind it. ⚠️ **"Section" is the load-bearing word** — five shortcuts to leaf pages would not be defensible, and that is what "Progrès" was. A new entry needs a landing, not just a slot.
28. **Below 768px the exercise controls compact; the board never does.** See the M3 section — the board is the thing being taught with.
29. **There is ONE resume rule, in `ResumeResolver.astro`, and ONE key scheme, in `src/lib/journey.ts`.** Four surfaces read them. A second copy of either is how two pages come to disagree about what a reader has done.
30. **The progress page never prints a number nothing computed.** Since E3 something computes rank and points, so it prints them — derived, never banked. See the progression section.
31. **Every long route ends with a way onward**, clear of the bottom bar.
32. **A card that renders has a destination.** `CardItem.href` is required and every card's link resolves 200. See the index rule below.
33. **Points are DERIVED, never banked.** No total is ever stored. See the progression section.
34. **No daily or consecutive-day streak. Ever.** The club meets weekly; a daily streak would punish the normal rhythm of these students.
35. **A loss costs nothing.** Losses and draws are recorded and read by no scoring rule at all.
36. **No route may exist on one layout only.** Every destination the mobile bottom bar reaches is reachable from the desktop header, and the spec reads the list off the bar rather than hard-coding it. See the section below.
37. **Sound is OFF by default, and `src/lib/sound.ts` is the only file that may make one.** No other module constructs an `AudioContext`, an oscillator or a gain node. See "Sound".
38. **No `AudioContext` before a user gesture**, and exactly one for the life of the page. Asserted against a patched constructor, not assumed.
39. **Sound is never the only signal.** Every voice accompanies a visual that fires independently — a reader on silent, or with no audio device, loses nothing.
40. **The LEARNER is a child profile, never the account.** Progress, points, attendance and game results reference `child_profiles.id`. An autonomous teenager is an account holding exactly one child — one code path, not two. See "The parent/child model".
41. **Graduation is one FK update.** Moving a learner between accounts must never copy rows between tables. `graduate_child()` is the proof, and it is `service_role` only.
42. **"Qui joue ?" is a choice, not a password.** No PIN, no lock on a child profile. The account is the security boundary; which child is playing is a preference.
43. **The admin UI is FRENCH ONLY, and that is a decision.** No `t()`, no `/en/admin/`, no i18n scaffolding under `/admin*`. A future session must not "fix" it — see the admin section.
44. **RLS is the security; the admin UI's role check is UX.** Every boundary is asserted through PostgREST with the user's own token, never by driving the pages.
45. **The register is one tap per child, no modal, no save button.** Marking twenty teenagers in a room is the constraint the whole surface is shaped by, and it is measured rather than claimed.
46. **A cancelled session is a STATE, never a deletion.** Deleting one cascades its register away; students who were told it was happening are left wondering.
47. **There is ONE ledger summation** — `computeLedger()` — and the inline resolver's copy is pinned equal to it by a spec. A prof and a student must never read different totals.
48. **A control a signed-in reader is entitled to use is REACHABLE, and a spec drives it.** The family section renders for every signed-in account; only the picker inside it is conditional. RLS saying yes is not the same as the reader being able to get there — see the family-section rule below.
49. **The public agenda is BAKED at build time, never fetched at runtime.** Static output plus Critical Features 9 and 18 leave no other answer; the staleness that follows is made loud on `/admin/seances`, not hidden. See the agenda rule.
50. **A cancelled session stays publicly visible with its state, and a draft never leaks.** CF46 is only half kept if the student who was told it was happening cannot see the cancellation.
51. **`delete_own_account()` takes no target, and nothing is retained.** The parameter list is the security design; erasure leaves no statistics, no archive and no anonymised copy.
52. **The first-run screen is shown once PER ACCOUNT, and skipping it is a first-class outcome.** `profiles.onboarded_at`, never `localStorage`. A skipped onboarding leaves a fully usable account — it is guidance, not a gate.
53. **The auto-created child's name is a PLACEHOLDER and must never be pre-filled as if it were a name.** It is the email local part, and it ends up on the attendance sheet.
54. **Where the reader has not told us, copy names the STRUCTURE, never the relationship.** An account with one child is the same object for a parent and for an autonomous teenager; "your child" is false for the second and there is nothing to branch on. ⚠️ **Since v0.14.0 there IS something to branch on when they answered `/bienvenue/`'s question** — and only then. `account_shape` null means never answered, and that is when this rule binds.
55. **`admin_delete_account()` is a different function from `delete_own_account()`, and refuses `auth.uid()`.** Admin only, reason required, audited — and the audit names nobody.
56. **Anti-bot measures on the sign-up form are NOISE REDUCTION, never security.** The anon key is public; the endpoint is reachable without the form. Visibility and removal in `/admin/comptes/` are the actual answer.
57. **"Les deux" is the TYPICAL case, and the account holder may be a learner.** A parent who plays alongside their children gets their own profile (`child_profiles.is_self`) and their own points. Any copy, layout or query that assumes the holder is not a player is wrong.
58. **The onboarding ANSWER and the ROSTER are two different things, and `effectiveShape()` is the only place they meet.** The roster wins wherever it can speak; the stored answer only separates "they said children" from "they never said". No second copy of that decision.
59. **`/compte/` is three blocks, in this order: profiles, settings, danger — and only the first is open.** Deletion competing with a child's progress is the defect the shape exists to fix; an `open` attribute on the advanced block restores it silently.
60. **"élève" is STAFF vocabulary and must not appear in parent-facing copy.** `/admin*` keeps it — that audience really is looking at a class. Everywhere a parent reads, it is "enfant" or "profil".
61. **Every profile card's rank and total are DERIVED by `computeLedger()`, and an absent one says so.** No card prints a zero it has not computed (the same rule as Critical Feature 30).
62. **Every page below a section landing carries a trail that NAMES ITS PARENT.** "‹ Exercices", "‹ Bien ouvrir une partie" — never a bare "Retour", never a collection name where a specific parent exists, and never `history.back()`. The five landings and `/` deliberately have none.
63. **The bar's active section is correct at every depth**, including a lesson inside a course inside Apprendre. A leaf that lights nothing is the defect the trail exists beside.
64. **Going UP and going BACK IN A SEQUENCE are different controls and both survive.** Prev/next inside a course or the tutorial is not a way out of it.
65. **A section landing is a chooser, not a menu.** Every card carries a name, one line of what is behind it, and the reader's own state where any exists — otherwise it is a second menu after the bar and does not earn the tap it costs.
66. **A video is a FACADE, and its POSTER IS SELF-HOSTED.** No iframe before a click; the still is a committed file in `public/video/`, never `i.ytimg.com`. ⚠️ **The poster is the half that gets lost** — hot-linking it removes a build step, looks identical on screen, and breaks Critical Feature 9 by a hostname nobody thinks of as YouTube. See the section below.
67. **A write to `sessions` reaches Postgres as ONE STATEMENT.** 0011 hangs an `AFTER … FOR EACH STATEMENT` trigger on it that pokes the Cloudflare deploy hook, so a loop of thirteen inserts is thirteen production builds. ⚠️ **`createSession()` singular no longer exists** — its only misuse was a `for` loop. Bulk changes are `.in('id', ids)`, never N `.eq()`, and `rebuild_requests` makes the firings COUNTABLE.
68. **The deploy hook URL is a VAULT SECRET, and this repository is public.** It is the credential. `vault.create_secret(…, 'cloudflare_deploy_hook')`, read only by `request_site_rebuild()` — never a table, never `.env`, never a migration. ⚠️ **No secret means NO DISPATCH, not an error**, which is what lets a test project count firings safely.
69. **`sessions.series_id` is a LABEL, never a rule — NO RRULE engine, NO recurrence table.** The expansion happens once, in the browser; what is stored is thirteen ordinary rows. Nothing may read it to decide what a session IS, only to select rows the prof already sees. One cancelled week must not require reasoning about a rule.
70. **The rebuild trigger may NEVER fail a write.** Every failure path logs and returns. A trigger that can raise makes `/admin/seances` unable to save — somebody else's outage becoming a database outage in front of a room of children.

---

## Architecture rule — ONE board island

There is **exactly one** Chessground component in the codebase. Courses, traps, exercises and play-vs-engine all mount that same component with different props. Never a second board implementation, never a copy "just for exercises".

**It hydrates with `client:visible`, never `client:load`.** Chessground plus chess.js is the heaviest thing on any page that has a board; hydrating eagerly makes a lesson page block on JS the reader may never scroll to.

Corollaries:
- **Index/list pages never mount a board.** `/exercices/` is a list of cards; the board lives on the detail route.
- If a page needs several diagrams, they are static images or a single board the reader steps through — not N live boards.
- Chessground renders and takes input. **chess.js owns legality.** Never let the board decide whether a move is legal.

**Preact is the island framework** (decided Session 2, approved by Seàn). Astro's `client:*` directives only apply to framework components — a plain `.astro` component cannot take `client:visible` at all, which is the entire reason `@astrojs/preact` is installed. It is **not** a licence to write the site in Preact: everything that can be static HTML stays `.astro`, and the board is the only hydrated component on the site.

### The files, and what each is allowed to know

| File | Role | Must NOT |
|---|---|---|
| `src/lib/chess/replay.ts` | Pure PGN → plies. No DOM, no Preact, no Chessground. | reach for a board or a network |
| `src/lib/chess/exercise.ts` | Pure position + verdict logic. The **client-side chess.js boundary**. | be imported statically from anything a replay page reaches |
| `src/lib/progress.ts` | The **only** file that touches `localStorage` | be read during render (see below) |
| `src/components/board/BoardSurface.tsx` | The **only** file importing Chessground | know about PGN, commentary, modes or progress |
| `src/components/board/ChessBoard.tsx` | THE island. Dispatches on `mode`, nothing else. | import the i18n layer, chess.js, or fetch anything |
| `src/lib/chess/notation.ts` | Pure. Typed text → a move on a position. | know about a field or a component |
| `src/lib/chess/opponent.ts` | Pure. The `MoveProvider` interface — the v2 seam. | import an implementation |
| `src/lib/engine/stockfish.ts` | The Worker + UCI. The **only** non-pure lib file. | be imported anywhere but a click handler |
| `src/components/board/ReplayView.tsx` | `mode="replay"` — the viewer | import chess.js, even for a type |
| `src/components/board/ExerciseView.tsx` | `mode="exercise"` — the solver | import chess.js **statically** |
| `src/components/board/PlayView.tsx` | `mode="play"` — a game vs the engine | import the engine module statically, or know it is an engine |
| `src/components/board/MoveInput.tsx` | Keyboard move entry, shared by exercise and play | judge or apply anything itself |
| `src/components/board/ReplayBoard.astro` | Server side: parses the PGN, resolves labels, mounts `client:visible` | render a board itself |
| `src/components/board/ExerciseBoard.astro` | Server side: resolves labels, mounts `client:visible` | precompute the position (it can't — see below) |

The views are **views, not islands**: one hydration entry point (`ChessBoard`), one Chessground adapter (`BoardSurface`). Splitting them keeps neither mode's state machine growing into the other's.

**The PGN is parsed at BUILD time**, and the island receives a plain array of positions. chess.js therefore never enters the client bundle for replay mode, and a malformed PGN fails `npm run build` instead of rendering an empty board in production.

---

### Both inputs, one path — the board is not the only way to move

Chessground takes **pointer input only**. `MoveInput.tsx` is the second door:
SAN, French SAN (`Fc4`, `Cxe5`, `e8=D`), and coordinates. Two rules hold it
together, and both are Critical Features:

1. **The typed path and the dragged path converge on the same `onMove(from, to)`.**
   There is no accessible *variant* of the game logic to drift out of sync.
2. **"I could not read that" and "that move is not available" are different
   messages.** An unreadable or illegal entry never reaches the judge and is
   **not** counted as an attempt.

⚠️ `R` is the rook in English and the king in French. The reader's own locale is
tried first, the other reading only if the first is not legal here.

⚠️ **Focus follows the modality of the last move, not the device** — typing
returns focus to the field, tapping does not. `useMoveSource.ts` owns it. A
device test gets this backwards in both directions; see
[`docs/reference/testing.md`](./docs/reference/testing.md).

### ⚠️ AN UNKNOWN CUSTOM PROPERTY FAILS SILENTLY — and it has bitten three times

`var(--does-not-exist)` invalidates the **whole declaration** at computed-value
time — no error, no warning, just a border that computes to `0px` or a font
that falls back to Inter. It has bitten four times.

**The rule: assert the RESOLVED value, never that a rule exists.** A spec
asserting the rule would have passed throughout all four bugs.

**➡️ The four, with the token each one meant and the damage it did:
[`docs/reference/theming.md`](./docs/reference/theming.md).**

### ⚠️ A SCOPED `<style>` DOES NOT REACH AN ELEMENT THE SCRIPT CREATED

Astro stamps `data-astro-cid-*` at **build** time onto the elements a component
declares, and compiles `.child-choice` to `.child-choice[data-astro-cid-…]`. An
element built at runtime carries the class and not the attribute, so **every
rule silently misses it.** Nothing errors; the tell is a control that looks like
it belongs to a different website.

**Anything painted by script is styled from a real stylesheet** — `admin.css`,
`family.css` — imported by the component, and structure still comes from
`controls.css`. ⚠️ Prefix those rules with the section class (`.family .child-…`)
so the cascade is settled by **specificity, not by stylesheet order**, which is
not guaranteed for a component-imported sheet.

### ⚠️ AN UNCONDITIONAL DOM WRITE FROM A `change` HANDLER KILLS THE BUTTON ON WEBKIT

Third member of the family above, equally silent. Pressing a button while the
caret is still in a field blurs it → `change` fires → the handler runs **between
`mousedown` and `mouseup`** → if it rewrites anything under the pointer, **WebKit
does not synthesise the `click`.** No click, no `submit`, no error.

⚠️ **A PAINT FUNCTION IS IDEMPOTENT** — write only when the value differs.
⚠️ **A DESKTOP CHECK CANNOT FIND IT.** Diagnosis:
[`docs/reference/testing.md`](./docs/reference/testing.md).

### The rest of the board

Board geometry is unforgiving and every part of it was measured rather than
guessed — the frame belongs on the component box and not the playing surface,
Chessground leaves up to 8px of the host unused, the coordinates live in an
outer gutter, and a demonstration board must be visibly distinguishable from a
board you play on.

**➡️ [`docs/reference/board.md`](./docs/reference/board.md)** — the Preact
gotchas that have already cost sessions (hydration, stale closures, `viewOnly`
being bind-time only, rejected moves needing a `revision` bump), the Chessground
import paths and theme selectors, the frame/gutter geometry with its
measurements, and the board-affordance tags. **Read it before touching any board
component or board CSS.**

---

## Licence — TWO of them. DECIDED (Sessions 3 and 4, by Seàn).

**The code is GPL-3.0-or-later. The teaching content is CC BY-NC-ND 4.0.** Two
works aggregated in one public repository, which the GPL expressly permits.

**The line is SUBSTANCE vs STRUCTURE.** The prose, the commentary, which lines a
trap shows, what an arrow says and the design of each exercise are CC. Everything
else — including content *structure*: `content.config.ts`, the Zod schemas, every
field name, the ply-numbering scheme, the UCI encoding, and every component that
renders any of it — is GPL. Someone may take this engine and write their own
content against the same schemas; they may not republish *these* lessons.

The GPL is forced by **Chessground** (GPL-3.0-or-later). Three consequences that
are Critical Features, not decoration:

1. `LICENSE` holds the **verbatim** GPL text. Do not edit or "modernise" it.
2. **The source link renders in the footer of EVERY page** — the requirement is
   that the source reach the *users of the website*, and a reader who never opens
   the legal notice is still a user. Four routes assert it.
3. `/mentions-legales/` carries the credits table and the CC BY-SA attribution to
   **Colin M.L. Burnett**. Every name and URL behind it is **data** in
   `site.legal`; every sentence is a string in `src/i18n/ui.ts`.

⚠️ **Check the licence BEFORE adding any dependency or asset.** GSAP was rejected
on these grounds ("no charge" licence, not OSI — see
[`docs/reference/motion-sound.md`](./docs/reference/motion-sound.md)), and most
lichess piece sets are unusable here.

**➡️ [`docs/reference/licence.md`](./docs/reference/licence.md)** — the full
dependency table and what each licence obliges.

---

## Play mode — Stockfish in a Worker

`/jouer/`. A full game against the engine, entirely in the browser. Nothing is
sent anywhere. The rules that bind other work:

- ⚠️ **The engine loads on a CLICK.** `@lib/engine/stockfish` is reached by
  `await import()` **inside the start handler**. Never hoist it, and never let
  `PlayBoard.astro` reference it — Vite would pull 3.6 MB into the page's module
  graph. `tests/e2e/play.spec.ts` asserts it against the network log.
- ⚠️ **Stockfish is NEVER precached** (Critical Feature 6). `globIgnores` keeps it
  out; a runtime `CacheFirst` rule caches it after the first game.
- ⚠️ **The level presets are MEASURED, not reasoned.** `Skill Level` alone cannot
  make a beatable opponent — every Stockfish search ends in a quiescence search,
  so no `(skill, depth)` pair will ever hang a piece. Weakness comes from
  `blunderChance`, and **0.4 is a ceiling, not a dial to turn up**. Re-measure
  with `scripts/engine-lab`; do not re-reason.
- ⚠️ **The engine is just a `MoveProvider`** (`src/lib/chess/opponent.ts`) — a
  position goes in, a move comes out. That interface is the v2 online-play seam,
  and `PlayView` must talk to nothing else.
- `stockfish` is **not** a project dependency; the engine is vendored under
  `public/engine`, which must stay **out of the TypeScript project** (it kills
  `astro check` with a V8 heap OOM naming no file).

**➡️ [`docs/reference/engine.md`](./docs/reference/engine.md)** — why Stockfish 11,
the measured preset table and the reference bots, the fixed 64 MiB memory, and
the random-move implementation. **Read it before re-tuning a level.**

---

## Exercise validation rule — `onlyMove` semantics

`onlyMove` is a boolean on every exercise, defaulting to **false**.

| Value | Meaning |
|---|---|
| `true` | The stored `solution` is the **only** accepted line. Anything else is wrong, even if it also wins. Forced mates, single-tactic puzzles. |
| `false` *(default)* | The stored `solution` is the **model** line. Any move that also wins **should** be accepted once the engine-backed validator lands. |

**Until that validator exists, `onlyMove: false` must not tell the player they are wrong.** It accepts the stored line and, for anything else, says *"not the line we had in mind"* — not *"incorrect"*.

This is not pedantry. A beginner who plays a different winning move and is told it is an error learns that correct moves are mistakes, which is worse than shipping no validation at all. If you are ever unsure which behaviour to implement, implement the one that cannot lie to the student.

#### How this is implemented, and how it is policed

⚠️ **Both verdicts count an attempt, both shake, both reset the board, and both
look identical on the board.** The only difference is which sentence renders, and
the two message classes **share a colour on purpose** — under `onlyMove: false` we
do not know the reader was wrong, so we must not paint them as wrong either.

⚠️ **Winning-alternative acceptance is DEFERRED, not faked.** No heuristic, no
"close enough", no material count pretending to be judgement — a validator that is
wrong 5% of the time is worse than one that admits it does not know. Only
Stockfish will change this.

⚠️ **`scripts/check-content.mjs` polices `onlyMove: true`** by brute force, and
**fails the build** when a second first move mates just as fast.

⚠️ **`opponentReplies` is aligned index-for-index with `solution`**, and moves are
stored as **UCI**, never SAN.

**➡️ The `opposition-et-mat` incident that fired this, the spec that pins it, and
the schema rule: [`docs/reference/content.md`](./docs/reference/content.md).**

---

## PGN language rule

`pgn` fields hold **standard, language-neutral notation.** No `{...}` commentary inside the PGN, ever.

Two reasons:
1. A PGN can carry only one language of commentary and this site ships two.
2. A clean PGN stays paste-able into Lichess, SCID or a printed handout, unchanged.

All prose lives in the frontmatter `moveComments` array, keyed to a **ply index** with `fr` / `en`. **Ply 0 is the first half-move** (`1. e4`); `-1` is the starting position. `src/lib/chess/replay.ts`, the schemas and `scripts/check-content.mjs` all use that one scheme.

`scripts/check-content.mjs` fails the check if a PGN contains braces, if a comment or shape points past the end of the game, if either language of a comment is empty, or if an arrow starts from an empty square. That last one is not theoretical — it caught an arrow drawn `f3→e5` on the ply where the knight had *already left* f3 (shapes are drawn on the position **after** the ply, and the move highlight shows the move itself anyway). Circles **may** sit on empty squares: marking a weak square is normal teaching.

Piece letters in the notation stay English (`N`, `B`, `Q`) — that is what "standard" means. If French piece letters are ever wanted for display (`C`, `F`, `D`), that is a **rendering** transform applied from the parsed move list, never a second stored PGN.

---

## Content model (Astro content collections)

> ### ⚠️ PLY 0 IS THE FIRST HALF-MOVE. READ THIS BEFORE WRITING ANY COMMENTARY.
>
> Every `ply` in this repo — `moveComments`, `shapes`, lesson board `comments` —
> is **0-based**:
>
> | ply | move |
> |---|---|
> | `0` | `1. e4` — White's first |
> | `1` | `1... e5` — Black's reply |
> | `2` | `2. Nf3` |
> | `-1` | the starting position, before any move |
>
> **A comment on White's *n*-th move is at ply `2(n-1)`; on Black's, `2(n-1)+1`.**
>
> This is the single most repeated authoring error in the project. A batch
> written elsewhere used 1-based numbering throughout: two comments overflowed
> the PGN and failed the build, and **eleven attached silently to the wrong
> move** — "the knight comes out and attacks e5" rendered on Black's reply
> instead. It looks completely normal on the page.
>
> `scripts/check-content.mjs` catches an overflow. **It cannot catch an
> off-by-one that still lands inside the game** — only reading the replayer can.
> So: count from zero, and step through the board once before merging.

```
src/content.config.ts   # ⚠️ Astro 7 location — NOT src/content/config.ts
src/content/
  traps/        legal.json
  cours/        bien-ouvrir-une-partie.json
  exercices/    mat-de-l-escalier.json
```

**All content is `.json`, not `.md`.** A Markdown body can only be in one language; this site has two. Keeping every field in typed frontmatter means the FR/EN pair is visible to the schema, and a missing translation is a validation error rather than a page that silently renders French to an English reader.

Astro 7 deltas to remember: config lives at `src/content.config.ts`, each collection declares an explicit `loader: glob({...})` from `astro/loaders`, and Zod is imported from `astro/zod` (v4) rather than the deprecated re-export from `astro:content`.

| Collection | Key fields |
|---|---|
| `traps` | `title_fr/_en`, `slug`, `eco?`, `level`, `themes[]`, `pgn`, `notes[]{ply,text_fr,text_en}`, `summary_fr/_en` |
| `cours` | `title_fr/_en`, `slug`, `level`, `order`, `summary_fr/_en` |
| `exercices` | `title_fr/_en`, `slug`, `fen`, `solution[]` (UCI), `opponentReplies[]` (UCI), `onlyMove`, `hint_fr/_en`, `level`, `themes[]` |

⚠️ **An exercise's `claims[]` and `forcedReplies` are PROVED BY THE BUILD.**
`claims[]` is the same union the lesson boards use — a `ply` is forbidden,
because an exercise carries its own FEN. `forcedReplies: true` asserts each
stored reply is Black's **only** legal move; without it a mate-in-2 whose first
move is not forcing "works" against the reply we stored and nothing on screen
ever looks wrong. ⚠️ **Build every position against chess.js, never by hand** —
batch 5's workbench caught three positions where the side NOT to move was
already in check and three "mate in 2"s that were mate in 1.

`level` is `debutant | intermediaire | avance` everywhere. Every collection has `draft: boolean` (default false) so an entry can be parked without deleting it.

---

### Content validity is checked, not assumed

`node scripts/check-content.mjs` replays every line through chess.js. A Zod
schema proves an entry is well-*shaped*; it cannot prove it is legal chess —
`"e2e5"` is a valid UCI string and an illegal move. It checks PGNs parse, plies
exist, solutions and opponent replies interleave legally, `onlyMove: true` is not
a lie, the student always plays the same colour, the FEN has all six fields, and
that nothing is half-translated.

#### ⚠️ A LEGAL POSITION IS NOT A CORRECT ONE — verify the CLAIM, not the chess

`check-content.mjs` proves a position is *possible*. It cannot read the sentence
next to the board, and that is where content actually goes wrong. Content batch 3
shipped **four** positions that passed every check and each described a mechanism
the position did not contain — including a "pin" blocked by the d7 pawn, which is
the single most common wrong idea about the Ruy Lopez and would have shipped as
fact.

**THE RULE — every diagram is replayed and its claim asserted BEFORE merge.** No
board merges on "it parses". Since batch 3 that is **data, not discipline**: a
board carries a `claims[]` array (`pin`, `fork`, `discovery`, `line`) and
`check-content.mjs` proves each one on every build.

- ⚠️ **A trap's claims carry a `ply`; a lesson board's must not.** Both mistakes
  fail the build.
- ⚠️ **`kind: 'manual'` is the honest escape and REQUIRES a `note`.** Manual
  claims and boards with no claims at all print as a **review queue**, which
  deliberately does not fail the build.
- ⚠️ Anything added to `assertClaim` gets the same treatment as the originals:
  **write the fixture that must fail, watch it fail, then delete it.**

**➡️ [`docs/reference/content.md`](./docs/reference/content.md)** — the four
positions that shipped wrong, the claim kinds in full, the deferred per-locale
Markdown decision for course bodies, and the beginner tutorial
(`/apprendre-les-bases/`, which adds no new board and no new mode, and namespaces
its progress under `tutorial:<slug>`). **Read it before writing any content.**

---

## Routes

FR at the root, EN under `/en/...`. **Route segments are not translated** (`/en/pieges/`, not `/en/traps/`) — one segment vocabulary means the language switcher is a pure prefix swap that can never fail to find its counterpart. Visible nav labels are translated; URLs are structural.

| Route | EN | Notes |
|---|---|---|
| `/` | `/en/` | Home — the **main menu** (E5) above 768px, the **dashboard** below; descriptive content under the fold |
| `/apprendre/` | `/en/apprendre/` | **Section landing (M4)** — the Apprendre chooser: Les bases, Leçons, Exercices, Pièges. ⚠️ Distinct from `/apprendre-les-bases/` only by the trailing slash |
| `/moi/` | `/en/moi/` | **Section landing (M4)** — the personal chooser: Ma progression, Mon compte (accounts on only), Réglages |
| `/cours/` | `/en/cours/` | Course index (cards) |
| `/pieges/` | `/en/pieges/` | Trap index (cards, ECO + theme chips) — **no board mounted here** |
| `/pieges/[slug]/` | `/en/pieges/[slug]/` | Trap detail — the replayer, commentary, outbound WhatsApp share |
| `/exercices/` | `/en/exercices/` | Exercise index — **no board mounted here**; solved ticks from `localStorage` |
| `/exercices/niveau/[niveau]/`<br>`/exercices/theme/[theme]/` | same, `/en/` prefixed | ⚠️ **The exercise filters are ROUTES, not `?niveau=`.** Static output leaves no server to read a query string, and a browser-side filter would leave the chips dead with JS off — a spec runs them with JavaScript disabled. ⚠️ **The values are DERIVED from the content**, so an empty filter page cannot exist and there is no empty state; an unknown value 404s. Segments are **not** translated. See `src/lib/exercise-filters.ts` |
| `/exercices/[slug]/` | `/en/exercices/[slug]/` | Exercise detail — the interactive board, hint, attempts, outbound WhatsApp share |
| `/jouer/` | `/en/jouer/` | Play the computer. Engine loaded on a click, never before. |
| `/agenda/` | `/en/agenda/` | Sessions, **from the `sessions` table, baked at build**. Venue falls back to site config. See the agenda rule below |
| `/contact/` | `/en/contact/` | WhatsApp CTA, venue, socials |
| `/mentions-legales/` | `/en/mentions-legales/` | Legal notice + credits. **Footer only, not in the nav.** |
| `/parametres/` | `/en/parametres/` | Appearance settings. Reachable from the **desktop header** (gear, beside the theme toggle) and the footer. |
| `/progres/` | `/en/progres/` | Local progress: three group bars, exercises by level and by theme, what is left, and a resume card. Read from `localStorage`, no account. **Rank and points are DERIVED and printed** — the "bientôt" placeholder went with E3, and Critical Feature 30 is the rule that replaced it. Inside the **Moi** section since M4 |
| `/connexion/` | `/en/connexion/` | **NOT EMITTED by default** — see the account flag below |
| `/compte/` | `/en/compte/` | **NOT EMITTED by default** — see the account flag below |
| `/bienvenue/` | `/en/bienvenue/` | **NOT EMITTED by default.** The first-run screen, once per account. ⚠️ The segment is NOT translated |
| `/auth/callback/` | — | **NOT EMITTED by default.** The only unlocalised route |
| `/admin/` | — | **NOT EMITTED by default.** Staff dashboard. **FR only** — see Critical Feature 43 |
| `/admin/eleves/` | — | **NOT EMITTED by default.** The class list — **children, not accounts** |
| `/admin/eleve/` | — | **NOT EMITTED by default.** One learner, by `?id=` — a query param, not a segment, and forced by the static build |
| `/admin/seances/` | — | **NOT EMITTED by default.** Sessions + the attendance register |
| `/admin/comptes/` | — | **NOT EMITTED by default.** Sign-ups + account removal. ⚠️ **ADMIN only**, not prof |
| `/manifest.webmanifest` | — | Generated from `src/config/site.ts` |

⚠️ **`/auth/callback/` is no longer the only unlocalised route** — the four
`/admin*` routes are unlocalised too, for a different reason. The callback is
machinery a reader never navigates to; `/admin*` is French **content** for a
single-operator audience. Neither is a precedent for a public page.

Each route file is a two-line shell that renders a shared component from `src/components/pages/` with a `locale` prop, so the two locales cannot drift apart structurally.

Detail routes take their URL from the content's **`slug` field, not the filename**, so renaming a file can never silently move a published URL. `/cours/[slug]/` is still to come.

⚠️ **The EN legal notice is `/en/mentions-legales/`, not `/en/legal-notice/`** — the Session 3 brief asked for the translated segment and it is deliberately not built that way. A translated segment needs a lookup map, and a missing entry 404s a reader mid-visit. The visible link label **is** translated; the URL is structural. **➡️ The full reasoning, and the open question for Seàn: [`docs/reference/ui-navigation.md`](./docs/reference/ui-navigation.md).**

---

## Progression — ranks, points, streaks, achievements (E3)

Everything is LOCAL: `localStorage`, guest-first, no account anywhere in it.
Ranks are **Pion → Cavalier → Fou → Tour → Dame**.

- ⚠️ **POINTS ARE DERIVED, NEVER BANKED** (Critical Feature 33). There is no
  `points` number in `localStorage` and there must never be one. A stored balance
  is a number a student types into a console in three clicks; a derived total is
  exactly as good as the records behind it. Two things fall out for free: **no
  farming, with no anti-farming code**, and a multi-board lesson awarding on its
  last board.
- ⚠️ **NO POLICY LIVES IN THE INLINE SCRIPT.** Every award value, threshold and
  condition arrives as **data**, computed at build time by `scoreboard.ts` from
  `points.ts`.
- ⚠️ **NO DAILY OR CONSECUTIVE-DAY STREAK. EVER** (Critical Feature 34). The club
  meets weekly; a daily streak would punish the normal rhythm of the people it is
  for. The session streak (`sessionStorage`) is the honest version, and it is
  **never presented as a loss**.
- ⚠️ **A loss costs nothing** (Critical Feature 35). Losses and draws are recorded
  and read by no scoring rule at all.
- ⚠️ Thresholds are absolute numbers and the content will grow, so re-tuning is
  expected — but it may only move in the direction that does **not demote**
  anyone who already holds a rank.
- ⚠️ **When accounts land, the balance must be computed SERVER-SIDE.** No endpoint
  may take a total, a rank or an achievement list as input. The client may send
  *what it solved*; the server decides what that is worth. Nothing in `points.ts`
  may become a wire format for a client-supplied total.

### ⚠️ A CARD THAT RENDERS HAS A DESTINATION

`CardItem.href` is **required**. There is no unlinked card state on `/cours/`,
`/pieges/` or `/exercices/`, and there is not going to be one. `/cours/` shipped
one: a full card that did nothing when clicked. **That is worse than the card
being absent** — an absent card tells a reader nothing is there; a present, inert
one tells them the site is broken, and nothing is *missing* from the page for a
test to notice.

Two halves hold it: the type (`href: string`), and `index-cards.spec.ts`, which
asserts every card's link **resolves 200** and that the index is non-empty first.

**A course with no lessons FAILS THE BUILD**, naming the slug and both ways out.
`draft: true` is how you park a course that is genuinely being written.

**➡️ [`docs/reference/progression.md`](./docs/reference/progression.md)** — the
thresholds and why those numbers, the achievement bookmark, the inline-script
size decision, and why the `les-bases` record was removed rather than linked.

---

## ⚠️ MOBILE AND DESKTOP DIVERGE AT 768px — ON PURPOSE (M1 + M2)

| | below 768px | 768px and above |
|---|---|---|
| Navigation | fixed **bottom bar**, five sections | grouped header, unchanged |
| Header | **one line**: name + theme + language | logo, nav groups, settings, theme, language |
| Home | **dashboard** | the E5 retro menu |

⚠️ **DO NOT "UNIFY" THESE. THE DIVERGENCE IS THE FEATURE.** The retro menu was
designed for a large screen; at 390px it was two stacked menus before any useful
content. That is not an execution defect — the design was wrong for the format.
`mobile-app.spec.ts` pins **both sides** of the breakpoint, 767px and 768px
explicitly.

The rules that bind work elsewhere:

- **The bottom bar has exactly FIVE SECTIONS and never hides on scroll** —
  Accueil, Apprendre, Jouer, Moi, Réglages. No page may hide content behind the
  bar; `env(safe-area-inset-bottom)` is needed in **two** places.
  ⚠️ **EVERY ENTRY HAS A LANDING SCREEN** (Critical Feature 27). M1 capped this
  at four on the grounds that five labels truncate at 390px; that was a guess
  and it is now measured — **78×52px per cell at 390px, 72×52 at 360px, longest
  label 56.6px**, nothing clipped in either locale. Settings earned its slot by
  becoming a section rather than a link to one page, and "Progrès" lost its slot
  by being a leaf with nothing underneath.
- ⚠️ **A LABEL THAT STOPS FITTING IS A COPY PROBLEM, NOT A LAYOUT ONE.** Shorten
  the word; never shrink the target and never ellipsise. The spec measures the
  rendered text against its own cell so this arrives as a failure.
- ⚠️ **NO ROUTE MAY EXIST ON ONE LAYOUT ONLY** (Critical Feature 36). Every
  destination the bar reaches must be reachable from the desktop header, and the
  spec **reads the list off the bar** rather than hard-coding it. `/progres/`
  shipped reachable from the bar and from nothing at all on desktop: the page
  built, rendered and passed every one of its own specs.
- **Below 768px the exercise controls compact; the board never does.** The board
  is the thing being taught with. It is **CSS only** — the dense row is built with
  flex `order`, so the DOM (and the screen-reader reading order, and the ≥768px
  layout) is untouched.
- ⚠️ **KNOWING WHERE YOU ARE IS TWO SIGNALS, AND THE SITE ONLY HAD ONE (M4).**
  The bar's active tab locates you to within a *quarter of the site*; it says
  "Apprendre" from the courses index, from a course, from a lesson three levels
  down and from a trap. The second signal is the **trail**: every page below a
  section landing carries a back affordance that **NAMES ITS PARENT**
  (Critical Feature 62) — « ‹ Bien ouvrir une partie », not « Retour » and not
  « Toutes les leçons ». `src/components/nav/Trail.astro` is the only one.
  ⚠️ **A LINK, NEVER `history.back()`** — a reader who arrived from a shared
  link has no history, and a control that does nothing is worse than none.
  ⚠️ **THE FIVE LANDINGS AND `/` HAVE NO TRAIL**, deliberately: the bar is
  already their way out. "Add one everywhere" is not the fix.
  ⚠️ **PREV/NEXT IS NOT THE WAY UP** (Critical Feature 64). Both survive on a
  lesson, and collapsing them traps a reader inside a sequence.
- **Every long route ends with a way onward**, clear of the fixed bar, from the
  **same i18n key** as the link at the top.
- **The home menu's labels ARE the nav's labels**, from the same `nav.*` keys
  (Critical Feature 20). Never a second string for one destination. The spec reads
  the header's own labels off the page rather than hard-coding words.
- **The home menu works with no JavaScript** (five entries, not six — "Reprendre"
  is a claim about stored progress) and fits one screen on a phone.
- ⚠️ **There is ONE resume rule** (`ResumeResolver.astro`) **and ONE key scheme**
  (`src/lib/journey.ts`). Four surfaces read them; a second copy of either is how
  two pages come to disagree about what a reader has done.
- ⚠️ **NEVER PUT `opacity` ON TEXT OVER AN AUDITED FILL.** `check-contrast.mjs`
  proves the token pair and cannot see an alpha applied on top of it: 0.9 dropped
  a proved pair to 4.42:1 and cost a Lighthouse regression the whole Playwright
  suite passed. Differentiate by size, weight and letter-spacing.
- Navigation is **disclosure semantics, not `role="menu"`**; panels open on
  **click, never hover**; the `html.js` gate means no layout shift and no no-JS
  trap.

**➡️ [`docs/reference/ui-navigation.md`](./docs/reference/ui-navigation.md)** —
the measurements behind the M3 compaction, how the two home pages coexist, the
"Reprendre" resolution rule in full, where `/progres/` went and why, and the
disclosure-nav details. **Read it before touching the header, the bar or home.**

---

## Motion — THE THREE FAMILIES (E1)

`src/lib/motion.ts` is the single source for every duration on the site. The
site should feel like a game because it **responds**, not because it is dressed
up: an animation that is not the answer to something the reader did is
decoration, and decoration goes last or not at all.

| Family | Band | What belongs in it |
|---|---|---|
| **Réponse** | 120–180ms | what follows a **click** |
| **Transition** | 250–350ms | a **state change** the reader should watch land |
| **Ambiance** | 4–20s | background drift **only**, never carrying information |

- ⚠️ **NOTHING SITS BETWEEN 180ms AND 250ms.** The gap keeps "the site heard me"
  and "watch this change" legible as two different things. A duration that wants
  to live in the gap is a **design question, not a tuning question**.
  `feel.spec.ts` **sweeps every element** on three routes — a list would miss the
  `220ms` that appears in a component nobody thought to add to it.
- **Pacing, offsets and composites are not families** and must not be forced into
  one. A shake is four Réponse beats, spelled as arithmetic on the constant.
- **CSS mirrors the numbers and the spec reads them off the live document** and
  asserts they equal the imported constants. Mirrors drift; this one is checked.
- ⚠️ **THE BOARD STAYS SOBER** (Critical Feature 16). Motion lives *around* it.
  The one exception is the correct-move pulse — one Transition, one square,
  exercise mode only.
- ⚠️ **Reduced motion means OFF for decoration and INSTANT for feedback** — never
  "the same show, slower". Ambiance is switched off entirely; Réponse and
  Transition collapse to 1ms (not 0 — a transition that can never complete is a
  trap). **Feedback is never removed.**
- **The thinking delay is a FLOOR, not a fixed wait**, and reduced motion drops it
  to 150ms rather than 0: collapsing it makes a screen reader announce the
  opponent's reply as part of the reader's own move.
- ⚠️ **GSAP was evaluated and REJECTED — do not add it.** Its licence is not OSI
  and this repo is GPL. The visual result was delivered in CSS + ~20 lines of
  vanilla JS at ≈1.3 KB gzip.
- ⚠️ **The ambient opacity ceiling is enforced by the GROUP, not by each piece**,
  and `check-contrast.mjs` cannot see it. The light lede drops below AA at ~0.075;
  we ship 0.055. Raising it means re-running the arithmetic by hand.

## Sound — SYNTHESISED, OFF BY DEFAULT (E2)

- ⚠️ **`src/lib/sound.ts` is the ONLY file that may make a sound** (Critical
  Feature 37). No other module constructs an `AudioContext`, an oscillator or a
  gain node. Islands call `play(event)`.
- ⚠️ **No `AudioContext` before a user gesture, and exactly one for the life of
  the page** (Critical Feature 38). One per sound exhausts the browser's limit
  inside a single exercise, after which every later sound fails silently.
- ⚠️ **Sound is never the only signal** (Critical Feature 39). Every voice
  accompanies a visual that fires independently, which is what makes it safe for
  `play()` to give up quietly.
- **No audio files** — 0 bytes precached, no licence question, one file to tune.
- ⚠️ **The wrong-move voice is the one to get right.** A buzzer is trivially easy
  and would be the wrong instrument for a teaching tool used by children: an error
  must inform, not scold.
- **Nothing sounds for navigation, hover, scroll or page load.**
- `prefers-reduced-motion` does **not** silence the site — different sense — but
  it does suppress the one-time *offer*.

**➡️ [`docs/reference/motion-sound.md`](./docs/reference/motion-sound.md)** — the
six voices with their waveforms, the E1 audit decisions, the ambient layer's two
layers, `controls.css`, and the note that **Playwright's headless WebKit has no
Web Audio at all** (so three specs skip visibly, and the degradation path is
itself covered on all five projects).

---

## Design tokens, themes and typography

`src/styles/tokens.css` is the source of record. Direction: **"old chess club"**
— wood panelling, green baize, brass lamps, yellowing score sheets. Components
never hardcode a colour or a font; they consume tokens.

- ⚠️ **Contrast is proved, not eyeballed.** `scripts/check-contrast.mjs` parses
  the real CSS (it keeps no copy of the hexes), runs **275 assertions** — 4 themes
  × 2 modes × 27 pairs, plus every board preset — and is the **first step of
  `npm run build`**, so a regression stops the build before anything else is
  spent. Its colour maths is a deliberate **second implementation**: an auditor
  sharing a formula with the code it audits agrees with its own bugs.
- ⚠️ **A failing combination is fixed or dropped, never excepted.**
- ⚠️ **Brass as text fails on cream.** `.text-brass` resolves `--mcc-accent-text`;
  brass **fills** carry ink labels, never white. This is an **unlayered** override,
  and unlayered CSS beats Tailwind's layered utilities regardless of specificity —
  so `text-white` on `.bg-brass-500` **silently does nothing**. That is intentional
  (it enforces AA app-wide); opt out with `text-cream-50!`, never with a second
  unlayered rule.
- ⚠️ **Only the `--mcc-*` layer flips with the theme.** A component reaching past
  it for a raw `--color-*` step will stay light-mode-only.
- **Four themes** (Bois, Marbre, Souiri, Terminal), each declaring both light and
  dark. **Light/dark is not a fourth axis.** Bois is the base and its values stay
  in `tokens.css`, so a reader with no stored preference — **or no JavaScript** —
  gets a complete theme.
- ⚠️ **Every theme clears AA in BOTH modes against every board preset** (Critical
  Feature 22). **The body typeface never changes with the theme** (23) — headings
  do. **A theme loads only its own heading font and piece set** (24), asserted
  against the network log. **Every piece set is licence-checked individually and
  credited** (25) — for three of the four that is a condition of use.
- ⚠️ **A piece set is only legible on SOME boards**, and that is audited too: a
  monochrome set on a dark board measured **1.03:1** with nothing erroring and
  every contrast assertion passing.
- ⚠️ **`boardTheme` is optional and absence is a real state** — absent means
  "follow the theme", present means the reader **pinned** a preset, and a pin
  survives a theme change.
- ⚠️ **`src/lib/theme.ts` is the single migration point**, on the same rules as
  `src/lib/progress.ts`. The head script duplicates `applyTheme()` **deliberately**
  — it must run before first paint, so it cannot import — and a no-flash spec
  fails if it is ever moved out of the head, made a module, or made async.
- ⚠️ **An `is:inline` script ships VERBATIM, comments and all.** Written in this
  codebase's usual commented style the head script measured 8.4 KB × 84 documents.
  Rationale goes in the frontmatter, which compiles away. Anything added to an
  inline script follows the same rule.

**➡️ [`docs/reference/theming.md`](./docs/reference/theming.md)** — the theme
cascade arithmetic (where a tie decided by source order paints white on white),
the piece-set licence table and which sets are unusable here, the
`background-size` cycling bug, the typography rules, and the four theming layers.
**Read it before adding a theme, a preset, a piece set or a font.**

---

## ⚠️ ACCOUNTS ARE OFF BY DEFAULT — AND **ON** IN PRODUCTION SINCE ~2026-08-14

`PUBLIC_AUTH_ENABLED`, read once in `src/config/auth.ts`. **Default `false`**,
which is still the shape every local build, every `npm run demo` and the default
Playwright run produces. Turning it on is a release decision and **Seàn's call**,
not a side effect of a session.

⚠️⚠️ **IT IS NOW ON IN PRODUCTION, AND NOTHING IN THIS REPOSITORY SAYS SO.** The
flag is a **Cloudflare dashboard build variable**; the repo default is unchanged
and always will be. Verified 2026-08-15 by probing the live site: `/connexion/`,
`/compte/` and `/admin/` all answer **200**. A session that reads "accounts are
switched off in production" and reasons from it will get every conclusion about
the live site wrong — **ask the deployment, not the default.**

✅ **PRODUCTION'S SCHEMA IS CURRENT THROUGH 0012** — verified 2026-08-18 against
the catalog: `account_shape` 200 (0010), `rebuild_requests` `42501` rather than
`PGRST205` (0011), `series_id` 200 (0012). ⚠️ **Re-ask rather than trusting this
line** — it is a claim about the outside world and it expires.

✅ **AND THE VAULT ENTRY IS LIVE** — production's `rebuild_requests` carries
firings with `dispatched = true`. A schema query cannot show that half; a log
row can.

⚠️ **STILL OUTSTANDING, AND IT DOES NOT BLOCK A DEPLOY:** production's
`schema_migrations` still lists `0001, 0002`, so a future `db push` would replay
everything between — including 0005's unguarded `drop constraint`. **Registering
is bookkeeping, not proof.** Backfill SQL in
[`docs/reference/deployment.md`](./docs/reference/deployment.md). See BACKLOG.

**OFF means NOT BUILT** (Critical Feature 18): the routes are not in `dist/`,
there is **no Supabase ref, host or anon key anywhere in the bundle**,
`@supabase/supabase-js` is not bundled at all, and `AccountButton` renders
nothing. Nothing is deleted — v2-S3 sets the variable and the feature returns.

- ⚠️ **`getStaticPaths()` returning `[]` is not enough on its own.** Astro
  collects a page's `<script>` blocks from the **module graph**, not from what
  renders, so the first disabled build shipped 216 KB of unreachable Supabase and
  precached it. The fix is an **alias** in `astro.config.mjs` cutting the graph at
  the module.
- ⚠️⚠️ **`import.meta.env.NAME`, NEVER `import.meta.env['NAME']`** (Critical
  Feature 19). Vite statically replaces dot access only; given a computed key it
  emits **the whole env object**, anon key included. The build meant to prove
  accounts were disabled contained the production JWT — the guarantee was false
  while looking true, and only reading `dist/` showed it.

### v2 — the locked decisions

**Still static** (no adapter, no SSR, non-negotiable). Supabase is **client-side
only**; **all** security is RLS. **Guests are first-class forever** — accounts add
sync and teacher oversight, and **gate nothing**. Content **stays in git**. Auth is
magic-link + Google, **no passwords**; **SMS is rejected**, do not reintroduce it.

- ⚠️ **The guest zero-request rule wins every conflict.** A visitor reading a
  lesson causes **zero** requests to any Supabase origin and does not download the
  client at all. `supabase.ts` is the only file importing it, every caller uses
  `await import()`, and **`auth-flag.ts`, `progress-sync.ts` and `child.ts` must
  never statically import it** — one static import puts 207 KB into every page
  with a board. Asserted against the network log on six content routes.
- ⚠️ **The learner is a child profile, never the account** (Critical Feature 40),
  **graduation is one FK update** (41), and **"Qui joue ?" is a choice, not a
  password** (42).
- ⚠️ **`progress.ts` is still the single reader**, and ⚠️ **canonicalise
  timestamps through `Date.parse` → `toISOString` before comparing** — a
  lexicographic compare of `+00:00` against `Z` is *wrong*, not merely untidy.

**➡️ The implicit-vs-PKCE decision, the offline queue and the reasoning behind
each: [`docs/reference/supabase.md`](./docs/reference/supabase.md).**
### The admin surfaces (v2-S4 part 2) — BUILT, and behind the flag

`/admin/`, `/admin/eleves/`, `/admin/eleve/?id=…`, `/admin/seances/`,
`/admin/comptes/`. Reached from `/compte/`, which is the only entry point.

The rules that bind work elsewhere — the rest is reference:

- ⚠️ **FRENCH ONLY** (Critical Feature 43). No `t()`, no `/en/admin/`, no i18n
  scaffolding. **A future session must not "fix" this; the missing English is
  the decision.**
- ⚠️ **`singleLocale` on BaseLayout suppresses the hreflang alternates AND the
  language switcher**, and both halves are needed. It is **not** an escape hatch
  for public pages.
- ⚠️ **RLS is the security; the role check is UX** (Critical Feature 44), and the
  gate **fails closed**. ⚠️ **An assertion about who may see what belongs in
  `role-separation.spec.ts`, never in `admin.spec.ts`.**
- ⚠️ **The class list is CHILDREN, not accounts**, and the child id is a **query
  parameter, not a route segment** — a static build would otherwise have to
  publish the class list in `dist/`.
- ⚠️ **Teacher awards are ROWS mirrored into the local store, never a balance**,
  pulled on sign-in and **never pushed**.
- ⚠️ **`computeLedger()` is the ONE summation** (Critical Feature 47), and
  `ScoreResolver`'s inline copy is pinned equal to it by a spec.
- ⚠️ **Admin button colours live in `admin.css`, not a scoped `<style>`** — the
  session cards are built with `innerHTML` at runtime.
- ⚠️ **`src/lib/admin.ts` may be imported ONLY from `/admin*`.** It imports
  `@lib/supabase` statically, which would break the guest zero-request rule
  anywhere else. A spec greps the built public pages for an admin chunk.
- ⚠️ **`role-separation.spec.ts` runs ONE AT A TIME.** Its tests share a student,
  a session and awards.

**Not built, deliberately:** creating a student from the admin UI.

**➡️ What each surface does, the measured 59 ms register, the sign-up hygiene
and the two delete functions:
[`docs/reference/supabase.md`](./docs/reference/supabase.md).**

### ⚠️ THE PUBLIC AGENDA IS BAKED AT BUILD TIME — AND THAT IS FORCED

`/agenda/` reads the `sessions` table at BUILD time via
`scripts/fetch-agenda.mjs` → `src/data/agenda.json` → `src/lib/agenda.ts`. **The
git collection is retired and must not come back.** A runtime read is not
available to this site: static output with no adapter, Critical Feature 9 (no
third-party request from a public page) and Critical Feature 18 (accounts OFF
ships no Supabase ref at all) each rule it out on their own.

- ⚠️ **THE FAILURE MODE IS STALENESS, AND IT IS MADE LOUD RATHER THAN SOLVED.**
  `/admin/seances` compares what the deployed build baked against the live table
  by fingerprint. ⚠️ **Anything added to the public agenda card must be added to
  `sessionFingerprint()` in the same commit**, or a prof edits that field,
  publishes, and is told the site is up to date.
- ⚠️⚠️ **THERE ARE TWO DEPLOY PATHS AND THEY OVERWRITE EACH OTHER**, last writer
  wins — a Cloudflare Workers Build from a push to `main`, and `npx wrangler
  deploy` uploading a local `dist/`. They bake **different agendas**.
  ⚠️ **`Source: Unknown (deployment)` does NOT tell them apart.**
- ⚠️⚠️ **A CREDENTIALED BUILD EMPTIES THE PUBLIC AGENDA WHENEVER PRODUCTION IS
  BEHIND ON MIGRATIONS.** The order is **migrations FIRST, credentials SECOND, a
  build THIRD**, and the third step is the one that looks optional and is not.
- ⚠️ **`npm run smoke:prod` asserts a session is listed; an empty agenda is a
  FAILURE**, not a scheduling fact.
- ⚠️ **`src/data/agenda.json` is GENERATED and gitignored**; the committed source
  is `agenda.fallback.json`. **No credentials is a dev build; broken credentials
  is a fatal build.**
- ⚠️ **`site.timezone` is an IANA name, never `+01:00`** — Morocco drops to UTC+0
  for Ramadan and back, and the build fails if the snapshot disagrees.
- ⚠️ **A cancelled session stays PUBLICLY visible with its state** (Critical
  Feature 50). **A draft never leaks.** **The seed must not delete migrated rows.**
- ⚠️⚠️ **SINCE 0011 A SESSION CHANGE ASKS CLOUDFLARE TO REBUILD** — a
  statement-level trigger poking a deploy hook whose URL lives in **Supabase
  Vault**, never in this repository (Critical Features 67, 68, 70). The
  staleness banner is still the backstop; the trigger just makes the window
  short. ⚠️ **The Database Webhooks UI CANNOT be used on this project** and the
  hour spent proving it is recorded rather than repeatable — see the reference.
- ⚠️ **A recurring set is thirteen ORDINARY ROWS, one statement, one rebuild**
  (67, 69). `src/lib/recurrence.ts` expands once and the cap **refuses rather
  than truncating**. ⚠️ **The step is in local calendar days, not
  milliseconds** — same reason `site.timezone` is an IANA name.

**➡️ The fourteen-hour blank agenda, why the card's text cannot tell the two
deploy paths apart, the recurring-session decision and the series label:
[`docs/reference/supabase.md`](./docs/reference/supabase.md). The rebuild
trigger, the vault secret, the webhook-UI dead end, the measured firing counts
and the suppression seam:
[`docs/reference/deployment.md`](./docs/reference/deployment.md).**
### ⚠️ AN ACCOUNT DELETES ITSELF, AND THE FUNCTION TAKES NO TARGET

`delete_own_account()` (migration 0007), reached from `/compte/`. Two rules here bind work that has nothing to do with deletion, so they stay:

- ⚠️ **NO ARGUMENT, AND IT MUST NEVER GAIN ONE.** The id can only come from
  `auth.uid()`. A `delete_account(target uuid)` with an ownership check inside
  is one refactor away from deleting anybody — **the parameter list is the
  guarantee, not the body.** `authenticated` only; not `service_role`.
- ⚠️ **Anything exported from `supabase.ts` and imported by a page script must
  also be exported by `supabase.disabled.ts`**, or the accounts-OFF build fails
  outright — the alias replaces the module for scripts that are still *built*
  behind unemitted routes. The stub returns `{ ok: false }`: a stubbed success
  would tell a reader their data was erased.

**➡️ The typed-word confirmation, what the confirmation names, why nothing is
retained and why local state is cleared only after the server confirms:
[`docs/reference/supabase.md`](./docs/reference/supabase.md).**

### ⚠️ THE CHECKLIST FOR A MIGRATION THAT ADDS A TABLE

Five lines, and the last two have each been forgotten:

```sql
revoke all on public.<t> from anon, authenticated;   -- ⚠️ 0. FIRST, see below
create table public.<t> (...);                       -- 1. the table
alter table public.<t> enable row level security;    -- 2. RLS ON
create policy ... on public.<t> ...;                 -- 3. the policies
grant select, insert, update, delete on public.<t> to authenticated;
grant select, insert, update, delete on public.<t> to service_role;  -- ⚠️ 4
```

⚠️ **EVERY NEW TABLE MUST GRANT `service_role` DML EXPLICITLY.** Migration 0002
exists solely to repair that across every existing table, and **0003 reproduced
the bug anyway**.

⚠️ **RLS BEING CORRECT DOES NOT MEAN THE TABLE IS REACHABLE.** `GRANT` decides
whether a role may touch the table at all; RLS decides which rows. **The tell is
a `42501` from a caller that bypasses RLS entirely** — always a missing grant,
never a policy bug.

⚠️⚠️ **STEP 0 IS NOT BELT-AND-BRACES:** a Supabase project ships
`alter default privileges … grant all on tables to anon, authenticated`, so
**every `create table` hands `anon` the full set before any migration says a
word**. Seven tables shipped that way.

⚠️ **Audit by exercising the table with a real trusted client after pushing**,
not by re-reading the migration — reading the file is what produced the bug both
times.

Also binding: migrations are **never edited after merge**; **slugs are free text,
not foreign keys**; **`is_staff()` must be `SECURITY DEFINER` with a pinned
`search_path`**; ordering is **tables → functions → policies**; **`role` is never
client-updatable** (column-level privileges, not RLS); **dropping a column drops
its PK and indexes silently**; **deletion cascades from `auth.users`**.

**➡️ The reasoning behind each line, the live catalog audit and the seven
tables: [`docs/reference/supabase.md`](./docs/reference/supabase.md).**
### ⚠️ The test-environment interlock

`assertNotProduction()` runs at **Playwright config load** and aborts the whole
run. The suite creates users and **purges by pattern**; pointed at production it
would delete real accounts. It **fails closed**.

⚠️ **Never widen `tests/e2e/env.ts` to fall back to `.env` or `.env.local`.** That
single edit is what would let production credentials into a suite that deletes by
pattern.

⚠️ **`.env.test` comes from `.env.test.example`, never from `.env.example`** — the
wrong template has cost `SUPABASE_PRODUCTION_REF` twice. And ⚠️ **the production
ref begins with `vtest`** (`vtestpaufxmrvdhgrrsy`) — it reads like the test
project and is the **live database**. Read the ref, never the vibe of the ref.

**➡️ [`docs/reference/supabase.md`](./docs/reference/supabase.md)** — the schema
decisions and their reasoning, the offline queue, the anti-cheat position and what
a real fix would need, the parent/child model in full, the RLS/GRANT audit, the
env-var table and both `.env.test` traps. **Read it before any migration or auth
work.**

---

## ⚠️ VIDEO — A FACADE, AND A SELF-HOSTED POSTER (Critical Feature 66)

The `youtube` field on `traps` and `cours` renders `VideoFacade.astro`: a still,
a play button and the title. Nothing is requested until the reader presses it;
then an iframe is built pointing at **`youtube-nocookie.com`**.

- ⚠️ **A PLAIN IFRAME CONTACTS GOOGLE ON PAGE LOAD, NOT ON PLAY** — youtube.com,
  google.com, googlevideo.com, plus cookies, for every reader including the ones
  who never press anything. That is Critical Feature 9, on a site for children,
  against a privacy notice that says the site contacts nobody.
- ⚠️⚠️ **AND SO DOES `<img src="https://i.ytimg.com/…">`.** It is a Google
  origin carrying the reader's IP and Referer on page load — **the same
  violation wearing a hostname nobody thinks of as YouTube**, and *more*
  tempting than the iframe because it deletes a build step. Every poster is a
  committed file in `public/video/`, written by
  `scripts/fetch-video-posters.mjs`. ⚠️ **`check-content.mjs` FAILS THE BUILD**
  when an id has no poster, because the obvious repair for a missing file is the
  hot-link.
- ⚠️ **The zero-request spec filters on `hostname !== localhost`, NEVER on
  `includes('youtube')`.** A youtube-only filter passes a hot-linked poster
  cleanly — which is the exact case it exists to catch.
- ⚠️ **NO `preconnect` OR `dns-prefetch` FOR YOUTUBE, EVER.** It looks like a
  free performance win and it resolves DNS and completes a TLS handshake with
  Google before the reader has decided anything.
- ⚠️ **THE POSTER SCRIPT IS RUN BY HAND, LIKE `build-icons.mjs`** — never part
  of `npm run build`. A Cloudflare build must need no image toolchain and no
  reach to Google. ⚠️ **A thumbnail is a frame of the video**, so fetching one
  from YouTube is for the club's OWN videos; anybody else's takes an
  author-supplied still under `src/assets/video/`.
- ⚠️ **PLACEMENT IS ONE RULE, BOTH PAGES: BELOW the page's primary content,
  above the way onward.** After the replayer on a trap, after the lesson list on
  a course. A 16:9 facade above the board costs ~200px on a phone before the
  reader reaches the position the page is named after — the same defect M3
  measured in the control stack, from the other direction. Asserted at 390px and
  360px, not trusted.
- ⚠️ **`src/styles/video.css` IS IMPORTED BY `global.css`, AND IS NOT SCOPED.**
  Two independent reasons: a scoped rule cannot reach the script-created iframe
  (no `data-astro-cid`), and the component is on twenty pages so a scoped block
  inlines into all of them. Same two lessons as `admin.css` and `score.css`.
- ⚠️ **`/mentions-legales/#video` STATES WHAT A CLICK SENDS, and deliberately
  UNDERSELLS `youtube-nocookie.com`** — the domain name invites "no data", which
  is false. Every facade links to it **before** the click. If that section ever
  reads like reassurance rather than disclosure, it is wrong.
- ⚠️⚠️ **NO PUBLISHED CONTENT CARRIES A `youtube` ID TODAY.** The facade's
  exercised path is a **FIXTURE**, not live content — see the rule below. The
  first version shipped a placeholder id on `/pieges/legal/`, which handed a
  reader "video unavailable" on a real trap; **do not put a placeholder back on
  published content to give a spec something to drive.**

### ⚠️ TEST FIXTURES — ROUTABLE, NEVER LISTED, NEVER IN PRODUCTION

`src/config/fixtures.ts`. A fixture is content that exists **only** so a spec has
something real to drive.

- ⚠️ **TWO PREDICATES, AND THE SPLIT IS THE WHOLE DESIGN.** `isRoutable()` decides
  whether a page is emitted (fixtures: only when `PUBLIC_FIXTURES=true`);
  `isListed()` decides whether a reader can find it (fixtures: **never, in any
  build**). Collapsing them puts the fixture on `/pieges/` in every test build.
- ⚠️ **`fixture` IS A SEPARATE FIELD FROM `draft`.** A draft will one day be
  published; a fixture must never be.
- ⚠️ **THE DEFAULT IS OFF, BECAUSE THE DEFAULT MUST BE WHAT PRODUCTION SHIPS**, and
  ⚠️ **`PUBLIC_FIXTURES` MUST NEVER GO IN `.env.local`** — same rule as
  `PUBLIC_AUTH_ENABLED`. By hand: `PUBLIC_FIXTURES=true npm run demo`.
- ⚠️ **NO LOCAL SPEC CAN PROVE THE OFF SHAPE**, because the build under test is by
  construction the ON one. `npm run smoke:prod` fails if a fixture route answers
  anything but 404 on the live site, and that is on the promotion checklist.

**➡️ [`docs/reference/video.md`](./docs/reference/video.md)** — the poster
pipeline and its three sources, the measured Lighthouse before/after, the
accessibility decisions, the house plate, and the fixture that was watched to
fail. **Read it before touching the facade or adding any third-party embed.**

---

## Analytics

Umami, env-driven. `PUBLIC_UMAMI_WEBSITE_ID` is read at build time from the Cloudflare **build** variables. When unset the snippet is **omitted entirely** — no empty `<script>`, no request to umami.is. That is also why dev, CI and the Playwright run make no third-party network calls at all, which `tests/e2e/pwa.spec.ts` asserts.

---

## Testing

Playwright + axe-core. Specs live in `tests/e2e/` and run against the **built** site served by `astro preview` — not the dev server. The service worker, the generated manifest and the self-hosted fonts only exist after `astro build` plus the post-build step, so testing the dev server would be testing a different application.

**Scripts — use these two, not the raw playwright commands:**

| | |
|---|---|
| `npm run test:branch` | chromium, specs mapped from what changed. **The per-session command.** |
| `npm run test:release` | the full matrix. **Promotion only** — see the verification policy. |

`test:e2e` and `test:e2e:chromium` still exist as thin escape hatches for
debugging a single project by hand. They are **not** the session commands: they
do no spec mapping, and `test:e2e` in particular is the raw matrix with none of
the exit-code and arithmetic checking `test:release` does for you.

---

### Manual testing — `npm run demo`, and nothing else

```sh
npm run demo              # build + serve the production build on localhost
npm run demo -- --host    # also expose it on the LAN, for a real phone
```

It clears the ports and sweeps orphaned previews and browsers first, **stops dead
if the build fails**, and prints the branch, the last commit, the URL and the path
to `docs/MANUAL-TESTS.md`. Do not hand-run `build && preview` any more.

#### Accounts ON — `npm run demo:accounts`, and never a hand-typed env line

```sh
npm run demo:accounts     # + `-- --host` for a real phone
```

⚠️ **`.env.local` HOLDS THE PRODUCTION PROJECT**, because that is what a deploy
build needs. So the dangerous mistake is not a build that fails — it is one that
**succeeds** while wired to the live database, where signing in on localhost
creates a real account and nothing announces it. `demo:accounts` reads the test
credentials through the same interlock as the e2e suite and **fails closed**;
never reconstruct it as `PUBLIC_SUPABASE_URL=… npm run demo`.

⚠️ **Never put `PUBLIC_AUTH_ENABLED` in `.env.local`.** The default build on this
machine must stay the shape production ships.

**➡️ [`docs/LOCAL-ACCOUNTS.md`](./docs/LOCAL-ACCOUNTS.md)** — seeding, the
no-email magic link, becoming a prof, and the walkthrough of the picker,
`/compte/` and the admin surfaces. **Read it before testing anything behind the
flag** — and its §7, which is what is *not* built.

### ⚠️ THE ACCOUNT SURFACES — `/bienvenue/`, `/compte/`, `/connexion/`

The rules that bind work elsewhere. **Everything below has a full counterpart in
[`docs/reference/supabase.md`](./docs/reference/supabase.md)** — read it before
touching any of these three pages.

- ⚠️ **"ONCE" IS RECORDED ON THE ACCOUNT** (`profiles.onboarded_at`), **not on
  the device** (Critical Feature 52). Set by **both** outcomes.
- ⚠️ **GUIDANCE, NOT A GATE** — a skipped onboarding must leave a fully working
  account, and **THE PLACEHOLDER IS NEVER PRE-FILLED** (Critical Feature 53):
  detection is an **exact match against the email local part**, never a guess.
- ⚠️ **THE EXTRA NAME FIELDS ARE SERVER-RENDERED AND HIDDEN**, not built by
  script — Astro stamps its scoping attribute at build time.
- ⚠️⚠️ **AN EXPLICIT SELECT IS A LIABILITY, AND `PROFILE_COLUMNS` IS WHY.**
  `getProfile()` naming a column production lacks gets a `42703`, which becomes
  `null`, which is indistinguishable from "not signed in" — **one unapplied
  migration silently sends every first sign-in past the welcome screen.**
  ⚠️ **Anything added to that select gets a new rung in the same commit.**
  ⚠️ **`SESSION_COLUMNS` (`src/lib/admin.ts`) IS THE SECOND LADDER**, since
  0012: without it one unapplied migration EMPTIES `/admin/seances` rather than
  degrading it. ⚠️ **Reads degrade; WRITES fail loudly** — `createSessions()`
  omits `series_id` when there is none rather than sending null.
- ⚠️ **"LES DEUX" IS THE TYPICAL CASE** (Critical Feature 57), **THE ANSWER IS
  NOT THE TRUTH** (58) — `effectiveShape()` is the only place the stored answer
  and the roster meet, and **the roster wins wherever it can speak** — and
  **SKIPPING RECORDS NO SHAPE**.
- ⚠️ **`/compte/` IS THREE BLOCKS** (Critical Feature 59), built on **NATIVE
  `<details>`, NOT A SCRIPTED ACCORDION**; signing out and the staff link stay
  outside both; the settings block **opens itself when the name is still the
  email fragment**.
- ⚠️ **THE CARDS' NUMBERS ARE DERIVED BY `computeLedger()`** (47, 61) and a card
  whose rows have not arrived **never prints a zero**.
- ⚠️ **`FamilySection.astro` MUST NOT IMPORT `@lib/admin`**, and **"élève" IS
  STAFF VOCABULARY** (Critical Feature 60).
- ⚠️ **THE FAMILY SECTION AND THE PICKER ARE TWO RULES, NOT ONE** — the section
  renders for every signed-in account, only the picker is conditional. Coupling
  them made "Ajouter un élève" unreachable for two releases.
- ⚠️ **TWO LOADS ARE ROUTINELY IN FLIGHT AND CAN LAND OUT OF ORDER** — a
  generation counter drops the older answer. **Any surface that loads twice
  copies the counter** (the admin register did not, and lost a prof's taps).
- ⚠️ **The honeypot is NOISE REDUCTION, NOT SECURITY** (56); it **FAILS VISIBLY
  AND CLEARS ITSELF**; **a CAPTCHA is not a drop-in** (Critical Feature 9).
- ⚠️ **`admin_delete_account()` IS NOT A SECOND ROUTE TO `delete_own_account()`**
  (55), and **THE AUDIT RECORDS THE ACT, NOT THE PERSON.**

**➡️ Every one of these in full, with the incidents behind them:
[`docs/reference/supabase.md`](./docs/reference/supabase.md).**
### ⚠️ Symptoms that are the ENVIRONMENT, not the application

Each of these has cost real debugging time. **Recognise the signature before
touching application code.** These are the tells:

- a fixed bug still "fails" and the fix is missing from `dist/` → **a stale
  preview server** (Playwright's `reuseExistingServer` skipped its own build);
- **every project fails identically** on a Critical Feature → **a stale `dist/`**;
- WebKit "target page… closed", or Firefox `RenderCompositorSWGL failed` on a
  **different test each run** → **the Windows browser dying under fan-out**;
- auth specs timing out on a **different set each run** → **Supabase's auth rate
  limit**, measured at ~22 verifications in 7s;
- `ERR_CONNECTION_REFUSED` → **read the HOST in the error**: `localhost:4321`
  is a dead preview server, `*.supabase.co` is sustained rate-limit abuse.

**A genuine failure is deterministic and fails A SERIAL RE-RUN too, and it fails
with an assertion naming a value.** ⚠️ **THE LOCAL RETRY IS NOT THE ARBITER —
`--workers=1` IS**; when the compositor has died the retry runs inside the same
broken process. ⚠️ **Never pipe the test run into `tail`** — it reports tail's
exit code, so 14 failures read as "196 passed, exit 0". ⚠️ **A browser-crash row
is a FINDING when it comes from `test:release`.**

**➡️ The full symptom table and the diagnoses behind it:
[`docs/reference/testing.md`](./docs/reference/testing.md).**

### ⚠️ Driving a board from a spec — the four gates

**Scroll it into view** (`block: 'center'`, never `scrollIntoViewIfNeeded`),
**wait on `<cg-board>`** (not `[data-testid]`, which Astro server-renders),
**wait on `data-ready="true"` and `data-busy="false"`**, and **press for a
DURATION** — measured **1/8 solved at 0ms against 8/8 at 60ms**. Use
`movePiece()` from `tests/e2e/helpers/board.ts`.

⚠️ **Test the pointer path BY POINTER.** Every exercise spec that solved by
typing into `MoveInput` bypassed Chessground entirely and would stay green if
the board refused every tap.

⚠️ **Never assert a short-lived class with a MutationObserver alone**, and
⚠️ **every axe check on a reveal-bearing page must call `settleReveals(page)`**
— a `[data-reveal]` element is transparent text axe can still find, so it
presents as flakiness rather than breakage.

⚠️ **`play.spec.ts` runs ONE AT A TIME** — every test boots a real engine with
64 MiB of linear memory.

**➡️ Each gate in full, with the measurements and the false positives it
produced: [`docs/reference/testing.md`](./docs/reference/testing.md).**

## Quick change — a SHORTER GATE, NOT A SHORTER RULE

```sh
npm run quick
```

Fixing a typo used to cost the full release gate: five browser projects, half
an hour. That is not caution, it is a tax that discourages fixing small
things — and unfixed small things are what a visitor actually sees.

⚠️ **It shortens VERIFICATION ONLY.** `dev` → `main` still needs Seàn's
explicit approval, exactly as before. Nothing about the fast path touches the
promotion rule.

### What qualifies — EXHAUSTIVE. Anything not on this list takes the normal path.

- A typo or wording fix in existing content or UI strings, **both locales**
- A value change with no structural effect: a duration, a colour **already in
  the token set**, a link URL, a contact detail
- **ONE** entry added to an **existing** collection using an **existing** shape
  (one trap or one exercise). ⚠️ **An agenda entry is no longer content** — it
  is a row a prof creates in `/admin/seances`, and it never touches this repo
- Reverting a single previous commit

### What NEVER qualifies

- The board components, the exercise validator, auth, i18n routing, the service
  worker, or the build
- New routes, new schema, new dependencies
- Anything a **Critical Feature** above covers
- ⚠️ **Anything where "I'll just check quickly" is the reason it seems small.**
  That sentence is the tell, not the reassurance.

### The path

1. Branch `quick/<what>` off `dev`
2. Make the change
3. **`npm run quick`** — content check, then the build (which runs
   `check-contrast` as its own first step, then types, then the service
   worker), then **only the chromium specs covering what changed**. Not the
   whole suite. Not the matrix.
4. Merge to `dev` with `--no-ff`, plus a CHANGELOG entry under Unreleased
5. Promotion to `main` still requires Seàn
6. Patch bump (`0.x.Y`) on release, **batched** — several quick changes can
   share one patch release

### ⚠️ THE RULE THAT KEEPS IT HONEST

**If a quick change breaks anything in `npm run quick`, it stops being a quick
change.** Revert, open a normal branch, run the full gate. **No fixing forward
on the fast path** — a change that needed debugging was never a quick change,
and the second attempt is exactly where a fast path starts hiding real
breakage.

### ⚠️ The script REFUSES, it does not advise

`scripts/quick.mjs` diffs the branch against `dev` and **exits non-zero naming any
file that is out of bounds**, with the reason. The exclusion list is enforced in
code rather than in a document nobody re-reads under time pressure — which is the
only version of this that survives a Friday afternoon. It also picks the specs
from what changed.

**➡️ The mapping and the `QUICK_BASE` override:
[`docs/reference/testing.md`](./docs/reference/testing.md).**

---

### ⚠️ VERIFICATION POLICY — TWO COMMANDS, AND THE MATRIX RUNS ONCE PER SHAPE

| | Command | When | Cost |
|---|---|---|---|
| **Every feature branch** | `npm run test:branch` | every session, before merging to `dev` | ~1-3 min |
| **Promotion** | `npm run test:release` | once, promoting `dev` → `main` | ~65-70 min |
| **Promotion, accounts ON** | `PUBLIC_AUTH_ENABLED=true npm run test:release` | ⚠️ **also**, while production runs with accounts on | ~65-70 min |

`npm run test:branch` is **chromium only** and runs the specs mapped from what
actually changed (`scripts/spec-map.mjs`). `--all` runs every chromium spec for
a sweeping refactor — still one browser.

#### ⚠️⚠️ THE GATE RUNS TWICE — ONCE PER FLAG SHAPE (v0.14.0)

The old policy ran the matrix once, on the default build, because that was "what
production ships". **That premise is false**: production serves the accounts-**ON**
build, and the default matrix skips every auth spec — so the whole account stack
was reaching production with **chromium coverage only**.

Neither shape subsumes the other. **OFF** is the only shape that can prove
Critical Feature 18 (`auth-disabled.spec.ts`: no route emitted, no Supabase ref
in the bundle); **ON** is the only shape that exercises `/connexion/`,
`/auth/callback/`, `/bienvenue/`, `/compte/` and `/admin*` at all.

⚠️ **THE ON MATRIX HAMMERS SUPABASE'S AUTH RATE LIMIT** — five projects at ~40
magic-link verifications each. A project the limit takes out is **re-run on its
own**, never waved through.

⚠️ **IF THE FLAG EVER GOES BACK OFF IN PRODUCTION, THE SECOND RUN GOES WITH IT**
— recorded so a future session can remove it honestly rather than deleting a
cost whose reason nobody remembers.

#### ⚠️ THE MATRIX RUNS ONE PROJECT AT A TIME, UNDER A WORKER CAP

`test:release` runs each project on its own, sequentially, at **three** workers.
That is slower than one pooled run and it is the reason the gate is green: the red
gates were **memory exhaustion**, not browser bugs and not test bugs.

- ⚠️ **`--workers=3` IS NOT A TUNING KNOB**, and ⚠️ **DO NOT "FIX" A RED MATRIX BY
  RAISING TIMEOUTS** — tried, and the failure count went **up**.
- ⚠️ **EVERY RUN KEEPS ITS OWN LOG** — `matrix-<shape>-<stamp>.log`, never a shared
  `matrix.log`, and the memory traces are namespaced the same way. The gate runs
  TWICE and the second run must not erase the first's evidence.
  ⚠️ **AND THEY LIVE IN `gate-logs/`, NEVER UNDER `node_modules/`** — gitignored
  but real. They were in `node_modules/.cache`, which `npm ci` deletes outright:
  three failures awaiting adjudication went with the old machine's
  `node_modules/` and cost a ~4.8-hour re-run of both shapes to replace.
- ⚠️ **A TROUGH UNDER ~2 GB MEANS THE BROWSER WAS STARVED, AND THE FAILURES WILL
  BE BARE TIMEOUTS NAMING NO VALUE.** On a machine with a heavy background
  baseline this manufactures failures that cost an arbiter pass each. Quiet the
  machine first — **[`docs/SETUP-NEW-MACHINE.md`](./docs/SETUP-NEW-MACHINE.md)
  §9a** measures what to close. `--workers=3` is not the knob.
- ⚠️ **A GATE THAT IS EXPECTED TO BE RED IS WORTH NOTHING.** A red matrix is a
  finding to chase, never a known flake to wave through.
- **It proves every project actually ran**, comparing counts project against
  project.
- ⚠️ **The alternatives were MEASURED** — `scripts/test-release.mjs` →
  MEASUREMENTS. Re-measure before re-arguing.

#### ⚠️ DO NOT RUN THE MATRIX ON A FEATURE BRANCH. EVER. NOT "TO BE SAFE".

The reasoning is already done, so it is not re-litigated. The matrix answers
exactly one question — does this work in Firefox and WebKit — and asking it every
session does not make the answer truer, it just moves the cost from one run per
release to one per session. **A chromium failure is a failure; a chromium pass is
enough to merge to `dev`**, and nothing reaches a reader without passing
`test:release` first.

#### ⚠️ THE "CRITICAL PATH" TRIGGER IS GONE

The old policy forced the matrix on any branch touching the board island, the
exercise validator, i18n routing or the service worker. It read as prudence and
**functioned as a loophole** — almost everything here touches one of those four.
`scripts/spec-map.mjs` gained precision instead.

**If you believe you have found the exception:** change this policy in CLAUDE.md
in the same commit, with the reason. Do not make a one-off exception no future
session will know about — that is precisely how the last policy eroded.

**➡️ The measured memory numbers, the four-red-gate diagnosis, the per-session
cost the removal bought back and the rejected alternatives:
[`docs/reference/testing.md`](./docs/reference/testing.md).**
### Critical-path tests (never skip)

⚠️ **A FAILURE IN ANY OF THESE IS A REGRESSION, NOT A TEST TO UPDATE.** They are
the claims the suite exists to keep — the one-board rule, `onlyMove: false`
never calling a correct move wrong, the GPL link on every page, the engine
loading only on a click, no cookies, no third-party request, a broken
`localStorage` not breaking the page, and the theme/board/piece kit rules.
Several were written the day the site got them wrong.

⚠️ **THE LIST IS ~30 LINES AND IT IS EXHAUSTIVE**, so it lives beside the specs
rather than here — but nothing may leave it without a reason in the same
commit.

**➡️ The list in full:
[`docs/reference/testing.md`](./docs/reference/testing.md).**
### Manual checklist before PR to `main`

**The checklist lives in [`docs/MANUAL-TESTS.md`](./docs/MANUAL-TESTS.md)** — grouped by feature, with expected results, including the regressions that have bitten before (the `1..` move number, the rapid-arrow mash, the `onlyMove: false` wording, the engine's no-fetch-before-click rule).

Run `npm run demo`, which prints its path, and work down it.

⚠️ **THE RELEASE GATE ITSELF — fourteen lines — LIVES IN
[`docs/reference/deployment.md`](./docs/reference/deployment.md).** It is the one
checklist in this repository that must be executed rather than remembered, and it
is not optional reading at a promotion. Its four most-skipped items, named here so
that skipping one is a decision rather than an oversight:

- ⚠️ **the gate runs TWICE** — `npm run test:release` and
  `PUBLIC_AUTH_ENABLED=true npm run test:release`, both green, for as long as
  production runs with accounts ON;
- ⚠️ **migrations reach production BEFORE the deploy**, asked of the catalog per
  migration, never of `schema_migrations`;
- ⚠️ **`npm run verify:deploy` AFTER deploying**, then `npm run smoke:prod` — one
  says it is THE build, the other says the build is good;
- ⚠️ **`package.json` `version` matches the tag**, in the release commit.

It is a **living document**: keep it in step with the site, in the same commit as the feature. See the session finish routine under Conventions.

---

## Deployment — Cloudflare Workers static assets

`dist/` is uploaded and served directly. Build `npm run build`, deploy
`npx wrangler deploy`, config `wrangler.jsonc`. Production domain:
**`mogadorchess.nachi3dlabs.com`**.

- ⚠️ **`wrangler.jsonc` exists to stop wrangler helping.** With no config present
  wrangler detects an Astro project and runs `astro add cloudflare`, installing an
  adapter that is incompatible with Astro 7 — and it fails during *deploy* rather
  than during *build*, where nobody is looking. **Deleting or emptying that file
  reintroduces the trap.** If a deploy fails mentioning the Cloudflare adapter,
  check the file exists before debugging anything else.
- ⚠️ **Adding a domain must NOT add a `main`.** A Worker with `assets` and no
  entry script is served entirely by the assets runtime.
- ⚠️ **The hostname lives in three files** (`src/config/site.ts`,
  `astro.config.mjs`, `wrangler.jsonc`) and cannot be imported between them. A
  mismatch produces a site that works perfectly while telling Google and every
  share preview to use a hostname that may not resolve. `npm run smoke:prod`
  compares them **before it touches the network**.
- **`npm run smoke:prod` is the one check the local gate structurally cannot do** —
  it asserts, per route, 200 + `lang` + a **structural** sentinel + the GPL footer
  link + canonical agreement + no third-party subresource, plus the manifest and
  `sw.js`. ⚠️ It is **not** part of `npm run build` and must not become part of it.
- ⚠️⚠️ **`npm run verify:deploy` ANSWERS THE QUESTION NOTHING ELSE DOES: is the
  live site running the tree I just cut?** It compares the **rendered HTML** of
  three live documents against `dist/`, **with the `/_astro/*` fingerprints
  normalised away**. **This is the check v0.13.0 did not have**, and it needs a
  `dist/` built from the tree you are asking about, **with the same build
  variables Cloudflare uses**. It asserts the build is THE ONE; `smoke:prod`
  asserts the build is GOOD. Run both, in that order, after every deploy.
- ⚠️⚠️ **DO NOT "IMPROVE" IT BY COMPARING THE HASHES — THAT WAS THE FIRST
  VERSION AND IT FAILED ON EVERY CORRECT DEPLOY.** Cloudflare builds on Linux
  and this repo is developed on Windows; Rollup emits a chunk's imports in
  filesystem order, so identical source yields different minified identifiers
  and a different hash — **while the chunks either side of it hash
  identically**. Fingerprints are not reproducible across build environments.
  ⚠️ The residual gap is stated rather than hidden: a release changing **only
  island JS**, with every byte of HTML identical, is invisible here — verify a
  behaviour for those.
  **➡️ The measured evidence and why the other signals cannot answer it:
  [`docs/reference/deployment.md`](./docs/reference/deployment.md).**
- **`wrangler` stays out of `package.json`** — invoked with `npx`, to keep its
  transitive advisories out of every install.
- `not_found_handling` is `"none"` because there is no `404.astro`. When one
  lands, change it in the same commit.
- ⚠️ **The fix must reach `main` before the next production deploy** — production
  deploys run from `main`, whatever `dev` holds.

### ⚠️ TWO CONFIGURATION INVARIANTS — VERIFY THEM AT EVERY PROMOTION

Both were **once correct and silently stopped being so**, and neither lives in
this repository, so nothing here can fail when one drifts. They are **claims
about the outside world that expire**, and the promotion gate is where they are
re-asked.

1. ⚠️ **PRODUCTION'S SCHEMA IS NOT AHEAD OF ITSELF, AND `dev` DOES NOT MOVE IT.**
   **Verify the schema, not the push:** ask the catalog what production holds,
   per migration. ⚠️ **`supabase_migrations.schema_migrations` IS NOT THE
   ANSWER** — it listed 0001–0002 while the schema held everything through 0007,
   the **wrong answer in the dangerous direction**. `scripts/db-push.mjs` refuses
   production by design and must keep refusing.
2. ⚠️ **THE BRANCH CLOUDFLARE DEPLOYS IS A DASHBOARD SETTING, AND IT HAS BEEN
   WRONG.** The non-production branch command must be **`npx wrangler versions
   upload`**, never `deploy`. **Verify by output:** after a `dev` push,
   `npx wrangler deployments status` is **unchanged**.

**➡️ The three-migrations-behind incident, the `dev` push that took 100% of
production traffic, the fourteen-hour blank agenda and the ledger backfill Seàn
must run: [`docs/reference/deployment.md`](./docs/reference/deployment.md) and
[`docs/reference/supabase.md`](./docs/reference/supabase.md).**

## The size guard — this file has a hard limit

`node scripts/check-claude-md.mjs` fails at **150 000 characters** and warns from
**120 000**. It runs as a step of `npm run build` and of `npm run quick`, so the
limit is enforced where it will actually be seen rather than remembered.

⚠️ **The failure mode it exists to prevent is silent.** Past the limit the tail of
this file simply stops being read: the rules are in the repository and absent from
the session, and nothing anywhere reports it. That is how it reached **247 KB**.

**When it warns, split — do not trim.** Move the reasoning to the reference file
for that area and leave the rule here with a pointer saying when the detail
matters. A rule deleted to save bytes is a rule that comes back as a bug.

### ⚠️ AND PROVE THE SPLIT LOST NOTHING — `scripts/check-split.mjs`

```sh
cp CLAUDE.md /tmp/CLAUDE.before.md     # before touching anything
# … move blocks into docs/reference/, leave the rules and a pointer …
node scripts/check-split.mjs /tmp/CLAUDE.before.md
```

Every non-trivial line that leaves this file must be findable, **verbatim**,
somewhere under `docs/`. Anything that is not is either an accident or a
deliberate deletion — and a deliberate deletion has to be declared by hand in
`docs/reference/.split-obsolete.txt`, **with its reason**, and reported in the
CHANGELOG.

⚠️ **THAT IS THE WHOLE VALUE: "nothing was deleted silently" stops being a claim
and becomes a check.** A line dropped mid-move is indistinguishable from a line
that was moved, which is exactly the silent failure the size guard exists for —
splitting is the remedy for it and also the best opportunity to cause it.

⚠️ **MOVE BLOCKS VERBATIM.** Rewording while moving defeats the check: the
verifier compares normalised text, so a re-worded line reads as a lost one. Add
a heading and a **Read when** line above the block; change nothing inside it.

⚠️ **IT IS NOT PART OF THE BUILD**, because it needs a "before" file that only
exists during a split.

---

## Open questions and everything not yet built

**➡️ [`BACKLOG.md`](./BACKLOG.md) is the single list.** Every deferred item,
conditional decision, dormant field and open question for Seàn lives there with a
status, and this section deliberately keeps no second copy — a list that exists
twice is a list that disagrees with itself.

Add new items there, not here.

## Key Contacts

| Role | Name | Contact |
|---|---|---|
| Developer / IT | Nachi3D (Seàn McGannon) | nachiketas3d@gmail.com |
| Association | Association Essaouira Mogador | `@associationessaouiramogador` |
