# Mogador Chess Club

Chess teaching platform for the Mogador Chess Club, Essaouira — courses, an
opening-trap library, interactive exercises and (later) play against Stockfish.
Bilingual FR/EN, static-first, installable as a PWA.

Built by [Nachi3D Labs](https://www.nachi3dlabs.com), in partnership with
Association Essaouira Mogador.

## Stack

Astro 7 (static) · TypeScript strict · Tailwind v4 · chess.js · Chessground ·
Workbox · Playwright + axe-core · Cloudflare Pages

Requires **Node ≥ 22.12**.

## Getting started

```bash
npm install
npm run dev          # http://localhost:4321
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | `astro check` → `astro build` → generate the service worker |
| `npm run preview` | Serve the built site (what the tests run against) |
| `npm run test:e2e` | Full Playwright matrix |
| `npm run test:e2e:chromium` | Chromium only — the feature-branch default |
| `node scripts/check-contrast.mjs` | WCAG AA audit of the token palette |
| `node scripts/check-content.mjs` | Replay every PGN / exercise through chess.js |
| `node scripts/build-icons.mjs` | Regenerate PWA icons from the brand mark |
| `node scripts/build-fonts.mjs` | Regenerate the self-hosted font subsets |
| `node scripts/build-engine.mjs` | Re-vendor Stockfish into `public/engine/` |

The last three are **not** part of `npm run build` — their outputs are committed.
See CLAUDE.md → "Generated assets". `build-engine.mjs` needs the engine installed
transiently first: `npm install --no-save stockfish@11.0.0`.

## Documentation

**[CLAUDE.md](./CLAUDE.md)** is the operational reference: conventions,
architecture rules, the content model, and the decisions behind them. Read it
before changing anything structural.

## Licence — two of them, on purpose

**The code and the teaching content are licensed separately.** They are two works
that happen to live in one repository.

### Code — GPL-3.0-or-later

See [LICENSE](./LICENSE). The site uses
[Chessground](https://github.com/lichess-org/chessground) and
[Stockfish](https://github.com/nmrugg/stockfish.js), both GPL, so the combined work
may only be distributed under the GPL and its source must be available to the site's
users — which is what this public repository, and the source link in the site's
footer, are for.

This covers everything that makes the content *work*, including the shape of the
content itself: `src/content.config.ts`, the Zod schemas, every field name, the
ply-numbering scheme, the UCI encoding, the validation in `scripts/check-content.mjs`,
and every component that renders any of it.

### Content — CC BY-NC-ND 4.0

See [LICENSE-CONTENT](./LICENSE-CONTENT).
© Seàn McGannon / Mogador Chess Club.

This covers the **pedagogical substance** of everything under `src/content/`: the
French and English prose, the move commentary, the lines chosen for each trap, and
the design of the exercises. Share it as it is, non-commercially, with credit.

**In short: you may deploy this engine; you may not republish the teaching content
commercially.** Take the software, write your own lessons against the same schemas,
and publish them — commercially if you wish. Just not ours. For anything the licence
does not allow, ask; for a school or a community club the answer is very likely yes.

### Third-party credits

The pieces are the **cburnett** set by **Colin M. L. Burnett**, used unmodified
under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). Full credits
live on `/mentions-legales/`.
