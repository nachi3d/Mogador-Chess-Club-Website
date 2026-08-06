/**
 * Mogador Chess Club — WCAG AA contrast audit.
 *
 *   node scripts/check-contrast.mjs
 *
 * ─────────────────────────────────────────────────────────────────────────
 * IT PARSES THE REAL STYLESHEETS. It used to keep its own copy of every hex,
 * "in lockstep with tokens.css" — which held right up until there were two
 * palettes and five board presets to keep in lockstep with. Now it reads
 * `src/styles/tokens.css` and `src/styles/board-themes.css`, resolves the
 * `var()` chains, and audits the values the browser will actually paint.
 *
 * Add a board preset to the CSS and it is audited on the next build. There is
 * no list here to remember to update, which is the only version of this that
 * stays true.
 *
 * The colour maths below is a SECOND, independent implementation of the one in
 * `src/lib/theme.ts`. That duplication is deliberate: an auditor that shares
 * its formula with the code it audits would agree with its own bugs.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Three sections:
 *   PALETTES   — every rendered pair, run against BOTH light and dark.
 *   DEEP_ONLY  — pairs that MUST fail, proving why the deep-variant rules
 *                exist. An unexpected pass is also a failure: the rule would
 *                have become dead weight.
 *   BOARDS     — every preset's coordinate legibility and square separation,
 *                plus its edge against the page in each mode.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* ── Colour maths ─────────────────────────────────────────────────────────── */

const channels = (h) => {
  const s = h.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255);
};

/** WCAG 2.1 relative luminance. */
const luminance = (h) => {
  const [r, g, b] = channels(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/* ── Reading the stylesheets ──────────────────────────────────────────────── */

const tokensCss = readFileSync(join(ROOT, 'src/styles/tokens.css'), 'utf8');
const boardsCss = readFileSync(join(ROOT, 'src/styles/board-themes.css'), 'utf8');

/** Strip comments so a hex inside a `/* … *​/` note is never mistaken for a value. */
const decomment = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * Custom properties declared by a selector.
 *
 * Deliberately simple: these files are hand-written, flat, and have no nesting.
 * A real CSS parser would be a dependency for no gain — but the moment this
 * stops finding what it expects it FAILS LOUDLY rather than auditing an empty
 * set and reporting success, which is the only way a parser this naive can hurt.
 */
function declarations(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /**
   * ALL blocks for the selector, merged in source order — not just the first.
   *
   * `:root` is declared more than once in tokens.css (the semantic aliases,
   * the aliases added alongside dark mode, and the responsive/reduced-motion
   * overrides), exactly as the cascade allows. Reading only the first block
   * made `--mcc-danger-text` look undefined and reported it as an unresolved
   * token — the audit failing safe, which is what it is supposed to do.
   */
  const blocks = [...decomment(css).matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))];
  if (blocks.length === 0) {
    throw new Error(`check-contrast: no \`${selector}\` block found — did the CSS move?`);
  }

  const out = {};
  for (const block of blocks) {
    for (const [, name, value] of block[1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      out[name] = value.trim();
    }
  }
  return out;
}

/** Resolve `var(--x)` chains down to a literal hex. */
function resolve(value, ...scopes) {
  let current = value;
  for (let hops = 0; hops < 10; hops++) {
    const reference = /^var\(\s*(--[\w-]+)\s*(?:,[^)]*)?\)$/.exec(current);
    if (!reference) break;
    const name = reference[1];
    const next = scopes.map((scope) => scope[name]).find((v) => v !== undefined);
    if (next === undefined) return null;
    current = next.trim();
  }
  return /^#[0-9a-f]{6}$/i.test(current) ? current.toLowerCase() : null;
}

const scale = declarations(tokensCss, '@theme');
const lightVars = declarations(tokensCss, ':root');
const darkVars = declarations(tokensCss, ":root[data-theme='dark']");

/** A semantic role → its hex, for one mode. */
function palette(mode) {
  const own = mode === 'dark' ? { ...lightVars, ...darkVars } : lightVars;
  const out = {};
  for (const [name, value] of Object.entries(own)) {
    const hex = resolve(value, own, scale);
    if (hex) out[name] = hex;
  }
  // The raw scale is available in both modes — fills do not change.
  for (const [name, value] of Object.entries(scale)) {
    const hex = resolve(value, scale);
    if (hex) out[name] = hex;
  }
  return out;
}

const PALETTES = { light: palette('light'), dark: palette('dark') };

/* ── The pairs ────────────────────────────────────────────────────────────── */

/** AA thresholds. 4.5 = body text, 3 = large text and non-text UI. */
const TEXT = 4.5;
const UI = 3;

/**
 * Every pair the site renders, by SEMANTIC ROLE — so the same list runs
 * against both palettes and a dark-mode regression is caught by the same
 * assertion as a light-mode one.
 */
const MUST_PASS = [
  ['--mcc-text-primary', '--mcc-surface-page', TEXT, 'body text on page'],
  ['--mcc-text-heading', '--mcc-surface-page', TEXT, 'headings on page'],
  ['--mcc-text-secondary', '--mcc-surface-page', TEXT, 'secondary text on page'],
  ['--mcc-text-secondary', '--mcc-surface-sunken', TEXT, 'secondary text on sunken surface'],
  ['--mcc-text-primary', '--mcc-surface-raised', TEXT, 'body text on raised surface (cards)'],
  ['--mcc-border-strong', '--mcc-surface-page', UI, 'control border on page (non-text)'],

  ['--mcc-link', '--mcc-surface-page', TEXT, 'link on page'],
  ['--mcc-accent-text', '--mcc-surface-page', TEXT, 'accent AS TEXT — the deep variant'],
  ['--mcc-primary-contrast', '--mcc-primary', TEXT, 'primary CTA label on its fill'],
  ['--mcc-primary', '--mcc-surface-page', UI, 'CTA shape against the page (non-text)'],
  ['--mcc-danger-text', '--mcc-surface-page', TEXT, 'error text on page'],
  ['--mcc-danger-text', '--mcc-surface-sunken', TEXT, 'error text on sunken surface'],

  ['--mcc-text-inverse', '--mcc-surface-inverse', TEXT, 'text on header / footer'],
  ['--mcc-text-on-inverse-muted', '--mcc-surface-inverse', TEXT, 'muted text on header / footer'],
  ['--mcc-accent-on-inverse', '--mcc-surface-inverse', TEXT, 'accent text on header / footer'],

  ['--mcc-focus-ring', '--mcc-surface-page', UI, 'focus ring on page (non-text ⇒ 3:1)'],
  ['--mcc-focus-ring-inverse', '--mcc-surface-inverse', UI, 'focus ring on header (non-text)'],

  // Fills carry their own labels and are identical in both palettes — see the
  // unlayered rules in tokens.css.
  ['--color-ink-950', '--color-brass-300', TEXT, 'ink label on brass fill'],
  ['--color-ink-950', '--color-brass-500', TEXT, 'ink label on brass-500 fill'],
  ['--color-ink-950', '--mcc-level-debutant', TEXT, 'level badge label (débutant)'],
  ['--color-ink-950', '--mcc-level-intermediaire', TEXT, 'level badge label (intermédiaire)'],
  ['--color-ink-950', '--mcc-level-avance', TEXT, 'level badge label (avancé)'],
  ['--color-cream-100', '--color-wood-600', TEXT, 'label on wood fill'],
  ['--color-cream-100', '--color-wood-800', TEXT, 'label on deep wood fill'],
];

/**
 * Pairs that MUST fail, per mode. Each is the reason a deep-variant rule
 * exists; an unexpected pass means the rule is now dead weight.
 */
const DEEP_ONLY = {
  light: [
    ['--color-brass-500', '--mcc-surface-page', TEXT, 'brass-500 as text — fill-only'],
    ['--color-brass-600', '--mcc-surface-page', TEXT, 'brass-600 as text — JUST under AA'],
    ['--color-wood-400', '--mcc-surface-page', TEXT, 'wood-400 as text ⇒ use wood-600'],
  ],
  dark: [
    // The mirror image: the deep variants chosen FOR CREAM are unreadable at
    // night, which is why `.text-brass` flips to brass-300 under [data-theme].
    ['--color-brass-700', '--mcc-surface-page', TEXT, 'brass-700 as text at night ⇒ use brass-300'],
    ['--color-wood-600', '--mcc-surface-page', TEXT, 'wood-600 as text at night ⇒ use danger-text'],
  ],
};

/* ── Board presets ────────────────────────────────────────────────────────── */

/** Every `.board-<id>` block in board-themes.css, parsed from the CSS itself. */
function boardPresets() {
  const source = decomment(boardsCss);
  const presets = [];
  for (const [, id, body] of source.matchAll(/\.board-([\w-]+)\s*\{([^}]*)\}/g)) {
    const props = {};
    for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      props[name] = value.trim();
    }
    presets.push({
      id,
      light: resolve(props['--mcc-board-light'] ?? '', props, scale),
      dark: resolve(props['--mcc-board-dark'] ?? '', props, scale),
      lightInk: resolve(props['--mcc-board-light-ink'] ?? '', props, scale),
      darkInk: resolve(props['--mcc-board-dark-ink'] ?? '', props, scale),
    });
  }
  return presets;
}

const PRESETS = boardPresets();
if (PRESETS.length === 0) {
  console.error('\ncheck-contrast: no `.board-*` presets found — did board-themes.css move?\n');
  process.exit(1);
}

/* ── Run ──────────────────────────────────────────────────────────────────── */

let failures = 0;

const row = (ok, ratio, min, label, detail) =>
  `  ${ok ? 'ok  ' : 'FAIL'}  ${ratio.toFixed(2).padStart(5)} : ${String(min).padEnd(4)}  ${label}` +
  `\n            ${detail}`;

for (const mode of ['light', 'dark']) {
  const P = PALETTES[mode];
  console.log(`\n${'='.repeat(58)}\n  ${mode.toUpperCase()} — pairs the site renders\n`);

  for (const [fg, bg, min, label] of MUST_PASS) {
    const a = P[fg];
    const b = P[bg];
    if (!a || !b) {
      failures++;
      console.log(`  FAIL  unresolved token: ${!a ? fg : bg} (${mode})`);
      continue;
    }
    const ratio = contrast(a, b);
    const ok = ratio >= min;
    if (!ok) failures++;
    console.log(row(ok, ratio, min, label, `${fg} ${a} on ${bg} ${b}`));
  }

  console.log(`\n  ${mode.toUpperCase()} — deep-variant rules, EXPECTED to fail\n`);
  for (const [fg, bg, min, label] of DEEP_ONLY[mode]) {
    const a = P[fg];
    const b = P[bg];
    if (!a || !b) {
      failures++;
      console.log(`  FAIL  unresolved token: ${!a ? fg : bg} (${mode})`);
      continue;
    }
    const ratio = contrast(a, b);
    if (ratio >= min) {
      failures++;
      console.log(
        `  UNEXPECTED PASS  ${ratio.toFixed(2)} — "${label}" now clears AA; revisit the` +
          ' deep-variant rule in tokens.css rather than leaving it stale.',
      );
    } else {
      console.log(row(true, ratio, min, `(expected fail) ${label}`, `${fg} ${a} on ${bg} ${b}`));
    }
  }
}

console.log(`\n${'='.repeat(58)}\n  BOARD PRESETS — coordinates and square separation\n`);
for (const preset of PRESETS) {
  if (!preset.light || !preset.dark || !preset.lightInk || !preset.darkInk) {
    failures++;
    console.log(`  FAIL  .board-${preset.id} is missing one of the four board properties`);
    continue;
  }

  const checks = [
    [contrast(preset.lightInk, preset.light), TEXT, 'coordinate on the LIGHT square'],
    [contrast(preset.darkInk, preset.dark), TEXT, 'coordinate on the DARK square'],
    [contrast(preset.light, preset.dark), UI, 'light vs dark square separation'],
    // The board sits on the page in BOTH palettes; its edge must read in each.
    [contrast(preset.dark, PALETTES.light['--mcc-surface-page']), UI, 'board edge on the LIGHT page'],
    [contrast(preset.light, PALETTES.dark['--mcc-surface-page']), UI, 'board edge on the DARK page'],
  ];

  console.log(`  .board-${preset.id}  ${preset.light} / ${preset.dark}`);
  for (const [ratio, min, label] of checks) {
    const ok = ratio >= min;
    if (!ok) failures++;
    console.log(`     ${ok ? 'ok  ' : 'FAIL'}  ${ratio.toFixed(2).padStart(5)} : ${min}  ${label}`);
  }
}

/*
 * A reader's OWN colours are not checked here — they do not exist at build
 * time. `bestInkFor()` derives the better ink for whatever they pick, and the
 * settings page shows the resulting ratio live and warns below AA. They are
 * allowed to proceed: it is their board. See CLAUDE.md → Theming.
 */

if (failures > 0) {
  console.error(`\n${failures} contrast problem(s). Fix the tokens before shipping.\n`);
  process.exit(1);
}
console.log(`\nAll contrast expectations hold — ${PRESETS.length} board presets, 2 palettes.\n`);
