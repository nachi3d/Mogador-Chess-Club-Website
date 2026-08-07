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

## Teaching and content

| Item | Status | Note |
|---|---|---|
| ~~**Beginner tutorial** (`/apprendre-les-bases/`)~~ | **done** | 13 steps, both locales, shipped this session. |
| ~~**Course detail pages**~~ | **done** | Per-locale Markdown pairs shipped with course 1. A `lessons` collection keyed by `course` + `slug` + `lang`; routes are `/cours/<course>/<lesson>/`. |
| **Courses 2+** | `backlog` | Course 1 ("Bien ouvrir une partie") is the only one written. The structure is proven; the remaining work is authoring. |
| **MDX for lesson bodies** | `backlog` | Boards are currently placed with a `<!--board-->` marker split out of the rendered HTML. It works and costs nothing, but MDX would allow real components inline. Only worth it when a lesson needs something a marker cannot express. |
| **Engine-backed validator for `onlyMove: false`** | `backlog` | The remaining half of the exercise-validation rule. Stockfish is here now; this is what finally lets a winning alternative be accepted instead of "not the line we had in mind". |
| **YouTube facade rendering** | `dormant` | The `youtube` field exists on `traps` and `cours` and validates an 11-character ID. Nothing renders it. When it lands it MUST be a click-to-load facade on `youtube-nocookie.com` — a plain iframe would break the zero-third-party-request rule the specs assert. |
| **Printable handouts from the PGN** | `backlog` | — |

## Board and interaction

| Item | Status | Note |
|---|---|---|
| **Promotion picker on the pointer path** | `backlog` | Currently backwards: the typed path honours `e8=D`, the pointer path auto-queens. A keyboard user therefore has strictly *more* control than a mouse user, which is the wrong way round. No shipped exercise promotes, and a queen is right ~99% of the time against the engine — so it is real but not urgent. |
| **Pass-and-play** (two players, one device) | `backlog` | Not free from `PlayView`: no engine, no thinking state, a board that flips or does not, and a second result vocabulary ("White wins" rather than "you win"). A small separate mode, not a flag. |
| **"Nocturne" board preset** | `conditional` | Only if Seàn judges Classique too bright in a dark room on a real phone. The board deliberately does not follow light/dark, and a sixth preset is the cheap answer if it turns out to need one. |

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
