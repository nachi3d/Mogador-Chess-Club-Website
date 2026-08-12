# Reference — roadmap and phases

**Read when:** planning a phase, or checking whether something is already built.

> Part of the Mogador Chess Club reference set. The binding rules live in
> [CLAUDE.md](../../CLAUDE.md); this file holds the detail behind them.
>
> ⚠️ This text was split out of CLAUDE.md verbatim, so a phrase like "the rule
> above" or "see the section below" may point at a neighbouring section **here**
> or at the rule it belongs to **in CLAUDE.md**. Nothing was cut; if a reference
> does not resolve on this page, it resolves there.

---

## Roadmap — Phases

### Phase 1 — Foundation
- ✅ Scaffold Astro 7 + Tailwind v4, design tokens (AA-audited), i18n plumbing
- ✅ Content collections + Zod schemas, one placeholder entry each, chess-validity checker
- ✅ PWA plumbing (generated manifest, Workbox precache, icons)
- ✅ Playwright + axe-core foundation
- ✅ First real trap (Légal's mate); courses still to write

### Phase 2 — The board
- ✅ Preact island framework (`@astrojs/preact`), `client:visible`
- ✅ The one Chessground island + our token-driven board theme
- ✅ Replay mode: controls, keyboard, move list, per-ply commentary and arrows/circles
- ✅ Trap detail pages + outbound WhatsApp share; first real trap (Légal's mate)
- ✅ Exercise mode: interactive board, `onlyMove`-respecting validation, hints, attempts, replayable solution; three real exercises
- ✅ `localStorage` progress (`src/lib/progress.ts`), solved ticks on the index
- ✅ GPL-3.0-or-later, `/mentions-legales/`, sitewide source link
- ✅ Stockfish, lazy-loaded on a click, runtime-cached; `/jouer/` with colour + three levels
- ✅ Keyboard move entry on every board — the pointer-only exclusion is closed
- ✅ Content licensed separately from the code (CC BY-NC-ND 4.0)
- Course detail pages (per-locale Markdown bodies — see the content model)
- **The engine-backed validator that finally lets `onlyMove: false` accept a winning alternative.** The engine is now here; this is the remaining half of the exercise-validation rule.

**Theming** (Session 5)
- ✅ Dark mode, board presets, custom board colours, `/parametres/`
- ✅ The contrast audit parses the real CSS and covers both palettes

**Themes and typography** (E6 + E7)
- ✅ Four site themes (Bois, Marbre, Souiri, Terminal), each with a full light and dark palette
- ✅ Four licence-checked piece sets, fetched per theme on board pages only
- ✅ Heading typeface per theme; the body face never changes
- ✅ The contrast audit covers 4 themes × 2 modes × 6 presets — 275 assertions

### Phase 3 — Growth
- Online play via room codes + Durable Objects (v2)
- OG images per trap/exercise, sitemap/SEO
- Printable handouts from the PGN

---
