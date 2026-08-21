#!/usr/bin/env node
/**
 * Two things this codebase keeps shipping: a component defined in several
 * files, and a custom property that does not exist.
 *
 *   node scripts/check-css-dupes.mjs
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ ADVISORY FOR DUPLICATES, A GATE FOR PHANTOM TOKENS. The difference is
 * whether the finding can be wrong.
 *
 * A class defined in two files is often correct — a page legitimately owns its
 * margins, and `controls.css` deliberately splits structure from a component's
 * own spacing. Only a human can say which. So duplicates are REPORTED, ranked,
 * and never fail.
 *
 * A `var(--x)` where `--x` is declared nowhere is not a judgement call. It is
 * a fact, and it is the worse bug of the two, because CSS invalidates the WHOLE
 * declaration at computed-value time with no error and no warning. The property
 * is simply never applied and the page looks "fine" to whoever wrote it.
 *
 * ── What this has already found ──────────────────────────────────────────
 *   `.btn-primary`          NINE files, three different paddings
 *   `--mcc-surface-card`    a PHANTOM used five times in admin.css, painting
 *                           nothing at all — `.mark-button`, `.session-card`,
 *                           `.series-card`, `.repeat-preview`, `.admin-tile`
 *                           all shipped with no background
 *   `--mcc-border`          a phantom, before that
 *   `--font-mono`           a phantom, before that
 *
 * ⚠️ IT READS SCOPED `<style>` BLOCKS TOO. Half the drift lives in component
 * scoped styles, and a check that only read `src/styles/` would have found
 * one `.btn-primary`, not nine.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

/** Every file that can carry CSS, including a component's scoped block. */
function sources() {
  const out = [];
  (function walk(dir) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (['.css', '.astro', '.tsx'].includes(extname(e.name))) out.push(p);
    }
  })(SRC);
  return out;
}

/** The CSS in a file: the whole thing, or just its `<style>` blocks. */
function cssOf(file) {
  const text = readFileSync(file, 'utf8');
  const css =
    extname(file) === '.css'
      ? text
      : (text.match(/<style[^>]*>([\s\S]*?)<\/style>/g) ?? []).join('\n');
  /* ⚠️ COMMENTS ARE STRIPPED, AND THAT IS NOT COSMETIC. This codebase documents
     its own past bugs in comments — `LessonPage.astro` explains that a rule
     once read `var(--font-mono)`, "not a token this project has ever had".
     Scanning comment text reported that prose as a live phantom. A check that
     flags a file for correctly describing a fixed bug is a check that teaches
     people to ignore it. */
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/* ⚠️ Extensions look exactly like class selectors in a comment (`.mjs`,
   `.astro`). They are not classes and they flooded the first version of this
   report; a name that is only ever a file suffix is skipped. */
const NOT_A_CLASS =
  /^(css|mjs|md|ts|tsx|js|json|astro|html|sql|txt|webmanifest|png|svg|jpe?g|woff2?|ico)$/;

const defs = new Map(); // class → Set(file)
const declared = new Set(); // --custom-property
const used = new Map(); // --custom-property → Set(file)

for (const file of sources()) {
  const css = cssOf(file);
  if (!css.trim()) continue;
  const rel = relative(ROOT, file).replace(/\\/g, '/');

  for (const m of css.matchAll(/(^|[\n};])\s*([^@{};\n][^{};]*?)\s*\{/g)) {
    const selector = m[2];
    if (/^\s*(from|to|\d+%)\s*$/.test(selector)) continue;
    for (const c of selector.matchAll(/\.(-?[a-zA-Z_][\w-]*)/g)) {
      if (NOT_A_CLASS.test(c[1])) continue;
      if (!defs.has(c[1])) defs.set(c[1], new Set());
      defs.get(c[1]).add(rel);
    }
  }

  /* ⚠️ DECLARATIONS ARE SCANNED OVER THE WHOLE FILE, NOT JUST ITS CSS.
     A custom property is legitimately set from markup — `style={`--reveal-i:
     ${i}`}` on an element, which no stylesheet mentions. Reading only the
     `<style>` block reports those as phantoms, and a check that cries wolf on
     correct code is a check nobody runs twice. */
  const whole = readFileSync(file, 'utf8');
  for (const d of whole.matchAll(/(--[\w-]+)\s*:/g)) declared.add(d[1]);
  /* ⚠️ SET FROM SCRIPT COUNTS AS DECLARED. `--fill` and `--reveal-i` are
     written with `element.style.setProperty(…)`, which no stylesheet mentions
     and which is entirely correct. */
  for (const d of whole.matchAll(/setProperty\(\s*['"`](--[\w-]+)/g)) declared.add(d[1]);

  /* ⚠️ A `var()` WITH A FALLBACK IS NEVER A PHANTOM. `var(--reveal-step, 60ms)`
     resolves to 60ms when the property is absent — the declaration stays valid
     and the rule applies. Flagging those is how a useful check becomes noise
     that gets muted. Only a bare `var(--x)` can silently void its rule. */
  for (const u of css.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) {
    if (!used.has(u[1])) used.set(u[1], new Set());
    used.get(u[1]).add(rel);
  }
}

console.log(`\n${bold('▸ check-css-dupes')}\n`);

/* ── 1. Phantom custom properties — this half GATES ────────────────────── */
const phantom = [...used.entries()].filter(([name]) => !declared.has(name));

if (phantom.length === 0) {
  console.log(green('  ✓ every custom property used is declared somewhere.'));
} else {
  console.log(red('  ✗ CUSTOM PROPERTIES USED BUT NEVER DECLARED:'));
  for (const [name, files] of phantom) {
    console.log(red(`      ${name}`));
    for (const f of files) console.log(dim(`        ${f}`));
  }
  console.log(
    dim(
      '\n    An unknown custom property invalidates the WHOLE declaration at\n' +
        '    computed-value time — silently. The property is never applied.\n',
    ),
  );
}

/* ── 2. Duplicate definitions — this half ADVISES ──────────────────────── */
const dupes = [...defs.entries()]
  .filter(([, files]) => files.size > 1)
  .sort((a, b) => b[1].size - a[1].size || a[0].localeCompare(b[0]));

console.log(`\n  ${bold('Classes defined in more than one file')}  ${dim('— advisory')}\n`);
if (dupes.length === 0) {
  console.log(green('    none.'));
} else {
  for (const [name, files] of dupes.slice(0, 15)) {
    const mark = files.size >= 4 ? red(String(files.size)) : yellow(String(files.size));
    console.log(`    ${mark} × .${name}`);
    if (files.size >= 4) for (const f of files) console.log(dim(`        ${f}`));
  }
  if (dupes.length > 15) console.log(dim(`    … and ${dupes.length - 15} more with 2–3`));
  console.log(
    dim(
      '\n    Two files is often correct — a page owns its margins. Four is how\n' +
        '    `.btn-primary` reached nine. Consolidate rather than add another.\n',
    ),
  );
}

process.exit(phantom.length > 0 ? 1 : 0);
