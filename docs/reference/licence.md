# Reference — the two licences

**Read when:** adding a dependency, a piece set, a font or any third-party asset; or when touching the footer source link or `/mentions-legales/`.

> Part of the Mogador Chess Club reference set. The binding rules live in
> [CLAUDE.md](../../CLAUDE.md); this file holds the detail behind them.
>
> ⚠️ This text was split out of CLAUDE.md verbatim, so a phrase like "the rule
> above" or "see the section below" may point at a neighbouring section **here**
> or at the rule it belongs to **in CLAUDE.md**. Nothing was cut; if a reference
> does not resolve on this page, it resolves there.

---

### Licence — TWO of them. DECIDED (Sessions 3 and 4, by Seàn).

**The code is GPL-3.0-or-later. The teaching content is CC BY-NC-ND 4.0.** They are two works aggregated in one repository, which the GPL expressly permits. The repository is public.

#### The line is SUBSTANCE vs STRUCTURE — get this right

| | Licence | What |
|---|---|---|
| **Content substance** | CC BY-NC-ND 4.0 (`LICENSE-CONTENT`) | The prose (FR + EN), the move commentary, which lines a trap shows, where an arrow goes and what it says, the design of each exercise — position, solution, scripted replies, and what it is meant to teach |
| **Everything else, including content STRUCTURE** | GPL-3.0-or-later (`LICENSE`) | `content.config.ts`, the Zod schemas, every field name, the JSON format, the ply-numbering scheme, the UCI encoding, `check-content.mjs`, and every component that renders any of it |

Why it is drawn there: copyleft on code invites the reuse we want; copyleft on lessons would let anyone repackage a volunteer club's teaching commercially. So **someone may take this engine, write their own content against the same schemas, and sell it** — that is fine and intended. What they may not do is republish *these* lessons.

Standard notation is nobody's property. A PGN of a historical game and the fact that Légal's mate exists are facts; what is licensed is the selection, arrangement and explanation of them.

`site.legal.content` in `src/config/site.ts` holds the data, `/mentions-legales/` states it in both languages, and `README.md` gives the one-line version ("you may deploy this engine; you may not republish the teaching content commercially"). If you add a content field that is *structure* rather than substance, it is GPL — say so in `LICENSE-CONTENT` rather than leaving it to be argued.

#### The GPL side

**This project is published under the GNU GPL v3 or later, and the repository is public.**

| Dependency | Licence | Consequence |
|---|---|---|
| **Chessground** | **GPL-3.0-or-later** | ⇒ the whole site is GPL. See below. |
| **Stockfish 11** (`stockfish.js`) | **GPL-3.0** | same copyleft, no conflict — but it must be credited |
| cburnett piece set | CC BY-SA 3.0 — by **Colin M.L. Burnett**, via Wikimedia Commons | attribution + share-alike |
| chess.js | BSD-2-Clause | permissive |
| Preact, Astro | MIT | permissive |
| Fraunces, Inter | SIL OFL 1.1 | permissive, attribution kept |

Chessground's README states it plainly: *"When you use Chessground for your website, your combined work may be distributed only under the GPL. You must release your source code to the users of your website."* Shipping it means the combined work is GPL — accepted, because this is a free community club project and copyleft is the right fit for it.

**What that obligation actually requires of the code:**

1. `LICENSE` at the repo root holds the **verbatim** GPL-3.0 text. Do not edit it, reflow it, or "modernise" the FSF address.
2. `package.json` declares `"license": "GPL-3.0-or-later"`.
3. **The source link renders in the footer of EVERY page** — not only on `/mentions-legales/`. The requirement is that the source reach *the users of the website*, and a reader who never opens the legal notice is still a user. `tests/e2e/legal.spec.ts` asserts this on four different routes; if someone tidies it away to clean up the footer, that suite says no.
4. `/mentions-legales/` carries the full credits table, plus the CC BY-SA attribution to **Colin M.L. Burnett** in prose with a link to the licence (the piece set arrives inside `chessground.cburnett.css`, so it ships on every page with a board).

Every name and URL behind that page is **data** in `site.legal` in `src/config/site.ts`; every sentence is a string in `src/i18n/ui.ts`. Nothing legal is hardcoded in a component, so the notice cannot drift from the config it describes.

The containment is still deliberate and still worth keeping: `BoardSurface.tsx` is the only file that imports Chessground, and everything else talks to its `BoardProps`. If the board is ever swapped for a permissively-licensed one, that is a rewrite of **that one file** — and only then do the `chessground` and `cburnett` entries in `site.legal.attributions` come out. Do not prune them to tidy the page up.

---
