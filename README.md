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

The last two are **not** part of `npm run build` — their outputs are committed.
See CLAUDE.md → "Generated assets".

## Documentation

**[CLAUDE.md](./CLAUDE.md)** is the operational reference: conventions,
architecture rules, the content model, and the decisions behind them. Read it
before changing anything structural.
