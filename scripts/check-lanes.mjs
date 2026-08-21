#!/usr/bin/env node
/**
 * Which specs LOOK engine-sensitive and are in no cross-browser lane.
 *
 *   node scripts/check-lanes.mjs
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️⚠️ THIS IS ADVISORY. IT ALWAYS EXITS 0, AND IT MUST NEVER BECOME A GATE.
 *
 * That is not timidity, and it is not a "we'll tighten it later". The heuristic
 * below is provably blind in the one direction that matters, and the proof is
 * in this repository:
 *
 *   `recurring-sessions.spec.ts` SCORES ZERO on every signal here — no layout
 *   query, no touch, no board, no media query, no animation timing, no axe —
 *   and it is the spec that caught the "Créer" bug (956b05a), where the admin
 *   submit button did nothing at all on WebKit and on every iPhone for a whole
 *   release.
 *
 * The reason it scores zero is structural: this script can see what a spec
 * ASSERTS, and the WebKit defect lived in how the spec DRIVES the page — a
 * plain `fill()` followed by a plain `click()`. No amount of tuning fixes that,
 * because the signal simply is not in the file.
 *
 * ⚠️ SO A PASSING RUN HERE MEANS NOTHING, AND A GATE WOULD SELL IT AS SOMETHING.
 * A green tick on "no unclassified engine-sensitive specs" would read as "the
 * lanes are complete" to every future session, which is exactly the false
 * confidence that lets the next Créer-class bug through. An advisory that a
 * human reads and argues with is worth more than a check that is wrong
 * silently.
 *
 * ⚠️ IT IS NOT A BUILD STEP EITHER, for the same reason. Run it when adding a
 * spec, or when reviewing the lanes — never automatically.
 *
 * The lanes themselves, and the defect each one was earned by, are in
 * `scripts/lanes.mjs`. The audit that produced them is in
 * `docs/reference/testing.md`.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { LANES, inAnyLane } from './lanes.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'tests', 'e2e');

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;

/**
 * What a different ENGINE could plausibly answer differently.
 *
 * ⚠️ EVERY ENTRY IS SOMETHING THE SPEC ASSERTS, never something it does. See
 * the header for why that ceiling cannot be raised by adding patterns.
 */
const SIGNALS = {
  layout: /getComputedStyle|boundingBox|setViewportSize|offsetWidth|clientHeight|scrollHeight/g,
  touch: /\.tap\(|touchscreen|hasTouch|pointerdown|pointerup/g,
  board: /cg-board|movePiece|data-ready|chessground/g,
  media: /AudioContext|prefers-reduced-motion|prefers-color-scheme|matchMedia/g,
  anim: /transitionDuration|animationDuration|getAnimations/g,
  axe: /AxeBuilder/g,
  font: /fontFamily|document\.fonts|FontFace/g,
};

/** A spec that never takes the `page` fixture cannot be engine-sensitive. */
const usesPage = (src) => /async \(\{[^}]*page[^}]*\}/.test(src);

const specs = readdirSync(DIR)
  .filter((f) => f.endsWith('.spec.ts'))
  .map((f) => {
    const src = readFileSync(join(DIR, f), 'utf8');
    const name = f.replace('.spec.ts', '');
    const hits = Object.fromEntries(
      Object.entries(SIGNALS).map(([k, re]) => [k, (src.match(re) ?? []).length]),
    );
    return {
      name,
      page: usesPage(src),
      score: Object.values(hits).reduce((a, b) => a + b, 0),
      hits,
    };
  });

const lanes = inAnyLane();
const laneOf = (name) =>
  Object.entries(LANES)
    .filter(([, names]) => names.includes(name))
    .map(([project]) => project);

console.log(`\n${bold('▸ check-lanes')}  ${dim('— ADVISORY. Always exits 0. Never make it a gate.')}\n`);

/* ── 1. Unclassified specs that look engine-sensitive ───────────────────── */
const unclassified = specs
  .filter((s) => !lanes.has(s.name) && s.page && s.score > 0)
  .sort((a, b) => b.score - a.score);

if (unclassified.length === 0) {
  console.log(green('  No unclassified spec shows an engine signal.'));
} else {
  console.log(`  ${bold('Chromium-only, but they assert something engine-sensitive:')}\n`);
  for (const s of unclassified.slice(0, 12)) {
    const why = Object.entries(s.hits)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k}×${n}`)
      .join(' ');
    console.log(`    ${yellow(String(s.score).padStart(3))}  ${s.name.padEnd(20)} ${dim(why)}`);
  }
  if (unclassified.length > 12) {
    console.log(dim(`    … and ${unclassified.length - 12} more with a lower signal`));
  }
  console.log(
    dim(
      '\n    A high number is a QUESTION, not a verdict: most of these assert\n' +
        '    structure or text that no engine renders differently. Add one to a\n' +
        "    lane only with a reason you can write down beside it.",
    ),
  );
}

/* ── 2. Specs that never open a browser ─────────────────────────────────── */
const headless = specs.filter((s) => !s.page);
if (headless.length) {
  console.log(`\n  ${bold('Never take the `page` fixture — one project is already one too many:')}`);
  for (const s of headless) console.log(`    ${cyan('·')}  ${s.name}`);
  console.log(
    dim(
      '    These assert `rpc()` calls, arithmetic or build artefacts. They run on\n' +
        '    chromium only today, which is correct; they would ideally not need a\n' +
        '    browser project at all.',
    ),
  );
}

/* ── 3. Lane members the heuristic cannot justify — EXPECTED ────────────── */
const blind = specs.filter((s) => lanes.has(s.name) && s.score === 0);
if (blind.length) {
  console.log(`\n  ${bold('In a lane, and INVISIBLE to this heuristic — this is expected:')}`);
  for (const s of blind) {
    console.log(`    ${cyan('·')}  ${s.name.padEnd(20)} ${dim(laneOf(s.name).join(', '))}`);
  }
  console.log(
    dim(
      '    They are in a lane because of how they DRIVE the page, which nothing\n' +
        '    here can see. `recurring-sessions` is the canonical case: it scores 0\n' +
        '    and it caught the WebKit "Créer" bug. Do not "clean these up".',
    ),
  );
}

console.log(
  `\n${dim('  Advisory only — nothing above fails anything. Lanes: scripts/lanes.mjs')}\n`,
);
process.exit(0);
