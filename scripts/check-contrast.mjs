/**
 * Mogador Chess Club — WCAG AA contrast audit for the token palette.
 *
 *   node scripts/check-contrast.mjs
 *
 * The palette in src/styles/tokens.css is the source of record; this file is
 * the proof it clears AA. Re-run it whenever a colour token changes — a hex
 * nudged "just a little warmer" is exactly how a 4.51 becomes a 4.42.
 *
 * Two sections:
 *   MUST_PASS  — every pair the site actually renders. A failure here is a bug.
 *   DEEP_ONLY  — pairs that legitimately fail, proving WHY the deep-variant
 *                rules in tokens.css exist (see "Brass contrast rule").
 *
 * Exits non-zero if any MUST_PASS pair fails, or if any DEEP_ONLY pair
 * unexpectedly starts passing (which would mean the rule is now dead weight
 * and should be revisited rather than silently kept).
 */

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

/** Kept in lockstep with the @theme block in src/styles/tokens.css. */
const C = {
  'cream-50': '#fffdf7',
  'cream-100': '#faf4e6',
  'cream-200': '#f3ead4',
  'cream-300': '#eaddbf',
  'cream-400': '#dccca7',

  'ink-400': '#8b8578',
  'ink-500': '#6d6759',
  'ink-700': '#3b372e',
  'ink-900': '#1e1b15',
  'ink-950': '#14120e',

  'green-300': '#82a98d',
  'green-400': '#558467',
  'green-500': '#37674b',
  'green-600': '#27523a',
  'green-700': '#1d4230',
  'green-800': '#163425',
  'green-900': '#10261b',

  'brass-300': '#d9bd77',
  'brass-500': '#ab8534',
  'brass-600': '#8d6c26',
  'brass-700': '#6e5419',

  'wood-400': '#a17048',
  'wood-600': '#6f4a2c',
  'wood-800': '#422b19',

  'board-light': '#e8dcbe',
  'board-dark': '#4f7053',
};

/** AA thresholds. 4.5 = body text, 3 = large text (≥24px / ≥19px bold) and non-text UI. */
const TEXT = 4.5;
const UI = 3;

const MUST_PASS = [
  ['ink-900', 'cream-100', TEXT, 'body text on page'],
  ['ink-950', 'cream-100', TEXT, 'headings on page'],
  ['ink-500', 'cream-100', TEXT, 'secondary text on page'],
  ['ink-500', 'cream-200', TEXT, 'secondary text on sunken surface'],
  ['ink-900', 'cream-50', TEXT, 'body text on raised surface (cards)'],
  ['ink-400', 'cream-100', UI, 'input / control border on page (non-text)'],

  ['green-700', 'cream-100', TEXT, 'link + accent text on page'],
  ['green-600', 'cream-100', TEXT, 'green-600 as text on page'],
  ['cream-50', 'green-700', TEXT, 'primary CTA label on green fill'],
  ['cream-100', 'green-800', TEXT, 'text on deep-green header / footer'],
  ['cream-300', 'green-800', TEXT, 'secondary text on deep-green surface'],
  ['green-300', 'green-800', TEXT, 'muted text on deep-green surface'],
  ['brass-300', 'green-800', TEXT, 'brass accent text on deep green'],
  ['brass-300', 'green-900', TEXT, 'brass accent text on green-900'],

  ['brass-700', 'cream-100', TEXT, 'brass AS TEXT — the deep variant (see rule)'],
  ['ink-950', 'brass-300', TEXT, 'ink label on brass fill'],
  ['ink-950', 'brass-500', TEXT, 'ink label on brass-500 fill'],
  ['brass-600', 'cream-100', UI, 'focus ring on page (non-text ⇒ 3:1)'],
  ['brass-300', 'green-800', UI, 'focus ring on deep green (non-text ⇒ 3:1)'],

  ['wood-600', 'cream-100', TEXT, 'wood AS TEXT — the deep variant (see rule)'],
  ['cream-100', 'wood-600', TEXT, 'label on wood fill'],
  ['cream-100', 'wood-800', TEXT, 'label on deep wood fill'],

  // Board. Coordinates are real text and are rendered per-square-colour, so
  // each square colour gets the ink that clears AA against it — never one
  // colour for both. The light/dark separation itself is a non-text 3:1.
  ['ink-950', 'board-light', TEXT, 'coordinate on LIGHT square'],
  ['cream-50', 'board-dark', TEXT, 'coordinate on DARK square'],
  ['board-light', 'board-dark', UI, 'light vs dark square separation'],
  ['board-dark', 'cream-100', UI, 'board edge against page background'],
];

/**
 * Pairs that MUST fail — each one is the reason a deep-variant rule exists.
 * Documented here so the rule can never be dismissed as superstition.
 */
const DEEP_ONLY = [
  ['brass-500', 'cream-100', TEXT, 'brass-500 as text — 3.1:1, fill-only'],
  ['brass-600', 'cream-100', TEXT, 'brass-600 as text — 4.45:1, JUST under AA ⇒ use brass-700'],
  ['wood-400', 'cream-100', TEXT, 'wood-400 as text — 3.9:1 ⇒ use wood-600'],
  ['ink-950', 'board-dark', TEXT, 'ink on a DARK square ⇒ dark squares take cream ink'],
];

let failures = 0;
const line = (ok, r, min, label, fg, bg) =>
  `  ${ok ? 'ok  ' : 'FAIL'}  ${r.toFixed(2).padStart(5)} : ${String(min).padEnd(4)}  ${label}` +
  `\n            ${fg} on ${bg}`;

console.log('\nMUST PASS — pairs the site renders\n');
for (const [fg, bg, min, label] of MUST_PASS) {
  const r = contrast(C[fg], C[bg]);
  const ok = r >= min;
  if (!ok) failures++;
  console.log(line(ok, r, min, label, fg, bg));
}

console.log('\nDEEP-VARIANT RULES — these pairs are EXPECTED to fail\n');
for (const [fg, bg, min, label] of DEEP_ONLY) {
  const r = contrast(C[fg], C[bg]);
  const stillFails = r < min;
  if (!stillFails) {
    failures++;
    console.log(
      `  UNEXPECTED PASS  ${r.toFixed(2)} — "${label}" now clears AA;` +
        ' revisit the deep-variant rule in tokens.css rather than leaving it stale.',
    );
  } else {
    console.log(line(true, r, min, `(expected fail) ${label}`, fg, bg));
  }
}

if (failures > 0) {
  console.error(`\n${failures} contrast problem(s). Fix tokens.css before shipping.\n`);
  process.exit(1);
}
console.log('\nAll contrast expectations hold.\n');
