# Backlog

Everything decided but not built, in one place. CLAUDE.md points here rather
than keeping a second copy — a list that exists twice is a list that disagrees
with itself.

**Status vocabulary**

| Status | Meaning |
|---|---|
| `backlog` | Agreed, unscheduled, no blocker |
| `blocked` | Cannot start until something external exists |
| `conditional` | Only happens if a specific judgement goes a particular way |
| `dormant` | Partly built already — schema or field exists, nothing renders it |
| `v3` | Explicitly beyond v2 |
| `seàn` | Waiting on a decision only Seàn can make |

---

## v2 sessions

| Item | Status | Note |
|---|---|---|
| **v2-S2** — Google OAuth, prof-created student accounts, Resend SMTP | `blocked` | SMTP needs the domain. OAuth and prof-created accounts could ship without it, but all three are one coherent "getting people in" session. `handle_new_user()` already clamps the locale for the Google claim. |
| **Turn accounts back on** | `blocked` | Set `PUBLIC_AUTH_ENABLED=true` in the Cloudflare build variables. **Blocked on v2-S3**, deliberately: v0.3.0 shipped with accounts switched off because there is nothing to sync yet, and an account that does nothing is a child's email address collected for no reason. One variable, no code. See CLAUDE.md → "Accounts are switched off in production". |
| **v2-S3** — progress sync + `localStorage` import | `backlog` | The critical path of v2. Schema is already in place (`exercise_progress`, `lesson_progress`), and the tutorial writes under `tutorial:<slug>` in the same store, so it syncs with no special-casing. |
| **v2-S4** — sessions, attendance, admin dashboard | `backlog` | Tables and RLS exist from migration 0001; nothing renders them. |
| **v2-S5** — progress charts | `backlog` | Needs S3's data before it can show anything true. |
| **Student groups** (all profs currently see all students) | `backlog` | Deferred to v2.1 by decision, not oversight. |

## Accounts and privacy

| Item | Status | Note |
|---|---|---|
| **Self-service account deletion** | `backlog` | The privacy policy promises erasure on request and the cascade works; `docs/ADMIN.md` has the SQL. What is missing is a button, and a confirmation flow a child cannot trip over. |
| **Two-year inactive-account rule** | `backlog` | Stated as policy, enforced by nothing. Needs a scheduled job — most likely a Supabase cron, since this architecture has nowhere else to put one. |
| **Custom SMTP (Resend)** | `blocked` | Needs `mogadorchess.ma`. Supabase's built-in mailer is rate-limited, sends from an unfamiliar domain, and its template is untranslated — all three matter when the recipient is a parent being asked to click a sign-in link. Verify SPF/DKIM/DMARC when it lands. |

## Design direction

| Item | Status | Note |
|---|---|---|
| **Refonte esthétique majeure** — make it feel like a GAME | `in progress` | Direction written and approved: `docs/direction/mcc-direction-esthetique.md`. Sequenced E1 → E4; see below. |
| **E1 — motion vocabulary + action feedback** | **done** | Three families, the press, the correct-move pulse, the wrong-move reason, the two-beat solve, a second ambient layer. |
| **E2 — sound** | `backlog` | Synthesised via Web Audio, **off by default**. No audio files, so no new licence and no new request. |
| **E3 — progression** | `backlog` | Ranks Pion → Cavalier → Fou → Tour → Dame. **Session streaks only — never a daily streak**: the club meets weekly, so a daily streak would punish the normal rhythm of the people it is for. Wants v2-S3's synced progress to mean anything across devices. |
| **E5 — retro main menu on the home page** | **done** | Six entries, roving tabindex, "Reprendre" resolving to the furthest incomplete step. |
| **E6 — complete themes** (background + board + pieces) | `backlog` | Heavy — a dedicated session. Extra piece sets each need their own licence attribution on `/mentions-legales/`, verified set by set. Texture in CSS only, never images, so the zero-request rule and the precache budget hold. Every theme must clear `check-contrast.mjs` on all its pairs in both palettes **at design time**, not at the end. |
| **E7 — thematic typography** | `backlog` | Depends on E6 (both touch the tokens). Headings follow the theme; **the body family never changes**. One theme loads one display font, never four. |
| **E8 — the shop** | `blocked` | Catalogue display needs nothing; **the points exchange cannot open before v2-S3**. Points live in `localStorage` while accounts are off, so changing phone loses them — and that is a lost *reward*, not lost progress. Once accounts exist the balance must be computed in the database from exercises actually solved, never accepted from the client. **Points are never sold.** |
| **E4 — vocabulary and atmosphere** | `backlog` | Evocative names on **page titles only**; nav labels stay functional (Cours, Exercices, Jouer). ⚠️ Now constrained by E5 as well: the home menu takes its labels from the same `nav.*` keys, so renaming a nav label renames a menu entry too. May be absorbed by E5 + E7 — see the addendum. |

### Refonte esthétique majeure — a direction session, not a patch

The site should read as a **game first and a learning site second**: more motion
around buttons, boards and backgrounds — playful, alive, arcade-adjacent.

What it must NOT cost:

- **The "old chess club" identity.** Wood, baize, brass, yellowing score sheets.
  Arcade energy inside that world, not instead of it.
- **The AA contrast guarantees.** `check-contrast.mjs` runs first in the build,
  both palettes, every board preset. A livelier palette still has to clear it.
- **`prefers-reduced-motion`.** Every added motion needs its off switch, and
  "off" means off, not faster.
- **No GSAP.** Its licence is not OSI and conflicts with this project's
  GPL-3.0-or-later (see the note in CLAUDE.md). CSS and small vanilla JS have
  carried the ambient motion so far at ~1.3 KB; a new library must clear the
  same licence bar before it is even evaluated on merit.

~~⚠️ **This wants a written direction and Seàn's sign-off before any
implementation.**~~ RESOLVED — the direction is written, approved, and lives at
`docs/direction/mcc-direction-esthetique.md`. Its guiding line: *un site donne
l'impression d'un jeu quand il **répond**, pas quand il est déguisé.* Order of
work is **feel (E1) → sound (E2) → progression (E3) → dressing (E4)**, and the
board stays sober throughout.

---

## Teaching and content

| Item | Status | Note |
|---|---|---|
| **Lessons built around a YouTube video** | `dormant` | Seàn supplies a URL; a lesson is authored around it. The `youtube` field already exists on `traps` and `cours` and validates an 11-character ID — **nothing renders it**. Requires the click-to-load facade on `youtube-nocookie.com` (decided in Session 3, never built) so the zero-third-party-request posture holds: a plain iframe sets cookies at page load and would break the specs that assert it. Dormant until the first video exists. |
| ~~**Beginner tutorial** (`/apprendre-les-bases/`)~~ | **done** | 13 steps, both locales, shipped this session. |
| ~~**Course detail pages**~~ | **done** | Per-locale Markdown pairs shipped with course 1. A `lessons` collection keyed by `course` + `slug` + `lang`; routes are `/cours/<course>/<lesson>/`. |
| **Courses 3+** | `backlog` | Courses 1 and 2 are written. The structure is proven; the remaining work is authoring. Course 3 (tactical motifs) is referenced by course 2 lesson 6. |
| **MDX for lesson bodies** | `backlog` | Boards are currently placed with a `<!--board-->` marker split out of the rendered HTML. It works and costs nothing, but MDX would allow real components inline. Only worth it when a lesson needs something a marker cannot express. |
| **Engine-backed validator for `onlyMove: false`** | `backlog` | The remaining half of the exercise-validation rule. Stockfish is here now; this is what finally lets a winning alternative be accepted instead of "not the line we had in mind". |
| **Printable handouts from the PGN** | `backlog` | — |

## Board and interaction

| Item | Status | Note |
|---|---|---|
| **Promotion picker on the pointer path** | `backlog` | Currently backwards: the typed path honours `e8=D`, the pointer path auto-queens. A keyboard user therefore has strictly *more* control than a mouse user, which is the wrong way round. No shipped exercise promotes, and a queen is right ~99% of the time against the engine — so it is real but not urgent. |
| **Pass-and-play** (two players, one device) | `backlog` | Not free from `PlayView`: no engine, no thinking state, a board that flips or does not, and a second result vocabulary ("White wins" rather than "you win"). A small separate mode, not a flag. |
| **"Nocturne" board preset** | `resolved` | Superseded by E6. `phosphore` is the sixth preset, and every theme now names its own board — so "too bright in a dark room" is answered by choosing Terminal or Marbre rather than by another preset. Reopen only if a reader wants a dark board *inside* a light theme. |
| **AGPL piece sets** (`pixel`, `letter`, `pirouetti`) | `conditional` | Free software, and NOT a licence conflict — but AGPLv3 §13 adds a network-use obligation the repo does not currently carry, so adopting one changes the licence statement on `/mentions-legales/`. `pixel` would suit Terminal well. Needs Seàn's decision, not a session's. |
| **Old-style figures in body text** | `blocked` | Declared in `typography.css` and inert: Inter ships no `onum`. Only unblocked by changing the body face, which the E7 safety rule forbids doing per-theme. A spec reports whether it ever starts working. |

## Beyond v2

| Item | Status | Note |
|---|---|---|
| **Online play** — room codes + Durable Objects | `v3` | `MoveProvider` in `src/lib/chess/opponent.ts` is already the seam: a new implementation plus a lobby, not a board rewrite. |
| **Spectate a room** | `v3` | Follows online play. |
| **Decorative 3D hero** | `v3` | Would have to clear the same bar the ambient motion did: no new dependency with a licence that conflicts with GPL-3.0, and Lighthouse ≥ 90 on home mobile. |

## Waiting on Seàn

| Item | Status | Note |
|---|---|---|
| **`mogadorchess.ma` domain** | `seàn` | Blocks custom SMTP, and the site still has no real address. `.ma` needs a Moroccan registrar and can require paperwork. |
| **Club Instagram handle** | `seàn` | Does the club post through the association's account or its own? `site.socials` has the entry, unpublished. |
| **Brand mark** | `seàn` | The current one is an explicit placeholder — a board in a brass frame. |
| **Dar Souiri street line** | `seàn` | Which exact address may be published. |
| **Arabic / Darija locale** | `seàn` | A real question in Essaouira. The i18n layer supports a third locale structurally; RTL would need design work. |
| **FR pedagogy review of the tutorial** | `seàn` | Written this session — see the note in CHANGELOG. The chess is machine-verified; the *teaching* is not. |
| **Does Souiri feel like Essaouira?** | `seàn` | The identity theme, and the only part of E6 no machine can judge. `docs/MANUAL-TESTS.md` § Q3 has the questions; the last one is "show it to someone from Essaouira". |
| **Is Terminal readable or a gimmick?** | `seàn` | § Q4. The test is reading a whole lesson in it, on a phone, without switching away. If it fails, it is softened or dropped — it is the one theme that exists for fun rather than for legibility. |
