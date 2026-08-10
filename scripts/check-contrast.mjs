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
 *   PALETTES   — every rendered pair, run against EVERY THEME in BOTH modes.
 *   DEEP_ONLY  — pairs that MUST fail, proving why the deep-variant rules
 *                exist. An unexpected pass is also a failure: the rule would
 *                have become dead weight.
 *   BOARDS     — every preset's square separation, plus its edge against
 *                every theme's page in each mode.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * E6 GREW THE MATRIX, AND THAT GROWTH IS THE POINT
 *
 * Before: 2 palettes × 26 pairs + 5 presets × 3 = 67 assertions.
 * After:  4 themes × 2 modes × 28 pairs + 6 presets × (1 + 8) = 278.
 *
 * The reason it is worth the runtime is that a theme is a palette someone
 * will look at for the first time in production. Four of them, in two modes
 * each, is thirty-two ways to ship an unreadable page — and seven of the
 * eight combinations are ones nobody on this project uses day to day. An
 * eyeball does not scale to that; arithmetic does.
 *
 * It is still the FIRST step of `npm run build`, so a theme regression stops
 * the build before astro check, the site build or the service worker have
 * been paid for.
 * ─────────────────────────────────────────────────────────────────────────
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
const themesCss = readFileSync(join(ROOT, 'src/styles/site-themes.css'), 'utf8');

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
function declarations(css, selector, { required = true } = {}) {
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
    // `required: false` is for a block a theme is ALLOWED to omit — a theme
    // with no mode-specific overrides at all. A missing REQUIRED block still
    // throws, because auditing an empty set and reporting success is the one
    // way a parser this naive can do real harm.
    if (!required) return {};
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

/**
 * The themes, discovered from the CSS rather than listed here.
 *
 * `src/config/site-themes.ts` is the runtime list; parsing the stylesheet
 * instead means the auditor cannot be out of step with the file it audits.
 * Add a `.theme-<id>` block and it is audited on the next build.
 */
/**
 * The selector prefix every theme block carries.
 *
 * ⚠️ IT IS `:is(:root, .theme-preview)`, NOT `:root` — see the header of
 * site-themes.css. The settings page paints its theme tiles with the very
 * rules that paint the site, so a tile cannot show a palette the theme does
 * not have. Stated once here because the parser matches on it literally.
 */
const THEME_SCOPE = ':is(:root, .theme-preview)';

function themeIds() {
  const found = new Set();
  const pattern = new RegExp(
    `${THEME_SCOPE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.theme-([\\w-]+)`,
    'g',
  );
  for (const [, id] of decomment(themesCss).matchAll(pattern)) found.add(id);
  return [...found].sort();
}

const THEMES = themeIds();
if (THEMES.length === 0) {
  console.error('\ncheck-contrast: no `.theme-*` blocks found — did site-themes.css move?\n');
  process.exit(1);
}

/**
 * A semantic role → its hex, for one theme in one mode.
 *
 * ⚠️ THE MERGE ORDER BELOW IS THE CASCADE, NOT A CONVENIENCE. It mirrors
 * exactly what the browser does, and the header of `site-themes.css` explains
 * the specificity that produces it:
 *
 *   1. `:root`                                 — the base (= the Bois theme)
 *   2. `:root[data-theme='dark']`              — the base dark palette
 *   3. `:root.theme-X`                         — the theme, both modes
 *   4. `:root.theme-X:not([data-theme='dark'])`
 *      or `:root.theme-X[data-theme='dark']`   — the theme, this mode
 *
 * Get this order wrong and the auditor proves a palette the site never
 * paints, which is worse than not auditing at all — it would report green on
 * a combination that is broken in production.
 */
function palette(themeId, mode) {
  const scoped = `${THEME_SCOPE}.theme-${themeId}`;
  const common = declarations(themesCss, scoped, { required: false });
  const modeSelector =
    mode === 'dark' ? `${scoped}[data-theme='dark']` : `${scoped}:not([data-theme='dark'])`;
  const own = declarations(themesCss, modeSelector, { required: false });

  const merged = {
    ...lightVars,
    ...(mode === 'dark' ? darkVars : {}),
    ...common,
    ...own,
  };

  const out = {};
  for (const [name, value] of Object.entries(merged)) {
    const hex = resolve(value, merged, scale);
    if (hex) out[name] = hex;
  }
  // The raw scale is available everywhere — it is the palette of materials,
  // and it never follows a theme. That is why a component reaching past the
  // `--mcc-*` layer for a `--color-*` step is stuck in one theme for ever.
  for (const [name, value] of Object.entries(scale)) {
    const hex = resolve(value, scale);
    if (hex) out[name] = hex;
  }
  return out;
}

/** Every theme in every mode: `PALETTES['souiri']['dark']`. */
const PALETTES = Object.fromEntries(
  THEMES.map((id) => [id, { light: palette(id, 'light'), dark: palette(id, 'dark') }]),
);

/** Flat list of the eight (theme, mode) pages, for the board-edge checks. */
const PAGES = THEMES.flatMap((id) =>
  ['light', 'dark'].map((mode) => ({
    id,
    mode,
    page: PALETTES[id][mode]['--mcc-surface-page'],
  })),
);

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

  /* Coordinates now sit in a gutter on the PAGE, not on a square, so this is
     the pair that matters — one colour per palette, checked in both. The old
     per-preset on-square pairs are gone with the design that needed them. */
  ['--mcc-board-coord', '--mcc-surface-page', TEXT, 'board coordinate in its gutter'],

  ['--mcc-focus-ring', '--mcc-surface-page', UI, 'focus ring on page (non-text ⇒ 3:1)'],
  ['--mcc-focus-ring-inverse', '--mcc-surface-inverse', UI, 'focus ring on header (non-text)'],

  /* Selection was raw brass-on-ink until E6 — a fixed pair that looked like a
     foreign object on a phosphor page. Now themed, so now audited. Selected
     text has to stay readable, so this is the TEXT bar, not the UI one. */
  ['--mcc-selection-ink', '--mcc-selection-bg', TEXT, 'selected text on its highlight'],

  /* The exercise board's accent bar and its filled dot (board.css). Non-text
     marks, so 3:1 — but they are the signal that says "this board is yours",
     and a theme where they vanish loses a real affordance. */
  ['--mcc-accent-strong', '--mcc-surface-page', UI, 'active-board accent mark (non-text)'],

  /* ── E3: the progression surfaces ──────────────────────────────────────
     Rank, points, the session run and the achievement rows all sit on the
     SUNKEN surface — pills, rows and a track — and only `--mcc-text-secondary`
     had ever been audited against it. Each of these is a real new
     relationship rather than a restatement:

       - the points figure and the streak pill are the ACCENT as text, and the
         accent is the one token whose readable step differs per surface (that
         is the whole reason `--mcc-accent-text` exists);
       - an EARNED achievement is primary text where a locked one is secondary,
         so the row has two text colours on one background and both must clear;
       - the rank bar's fill is primary INSIDE a sunken track, which is a
         different pair from the CTA-on-page one already listed above.

     ⚠️ `--mcc-border-strong` ON `--mcc-surface-sunken` IS DELIBERATELY ABSENT,
     AND THE REASON IS WORTH KEEPING. The locked achievement star was that pair
     on its first draft, and Marbre in light mode measured it at exactly
     **3.00 against a 3.0 floor** — the tightest thing this script has ever
     been asked to judge, and a rounding hair from failing. The fix is the one
     the E6 rule prescribes: remove the outlier rather than grant it an
     exception. The star is `--mcc-text-secondary` now, which is already proved
     on that surface at the stricter TEXT bar.

     So: nothing on this site draws a strong border on a sunken surface, and
     anything that starts to must re-add this pair and expect Marbre to argue.

     ⚠️ NONE OF THESE MAY EVER CARRY AN `opacity`. Every one is a pair this
     script proves, and an alpha applied on top of a proved pair is invisible
     to it — the M1 regression, which the whole Playwright suite passed. */
  ['--mcc-text-primary', '--mcc-surface-sunken', TEXT, 'earned achievement on sunken row'],
  ['--mcc-accent-text', '--mcc-surface-sunken', TEXT, 'points / streak pill on sunken'],
  ['--mcc-primary', '--mcc-surface-sunken', UI, 'rank bar fill in its track (non-text)'],

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
 *
 * ⚠️ DELIBERATELY SCOPED TO BOIS, AND ONLY BOIS. These pairs are about the raw
 * `--color-brass-*` / `--color-wood-*` scale, which is the *material palette*
 * and does not follow a theme — so running them against Marbre's page or
 * Terminal's would be asserting something about a relationship that theme does
 * not have. Bois is the theme those steps were mixed for; it is the theme they
 * are checked in.
 *
 * The rule they justify (`.text-brass`) is now theme-agnostic — it resolves
 * `--mcc-accent-text`, which every theme declares and MUST_PASS proves in all
 * eight combinations. These assertions survive to explain why brass-700 and
 * brass-300 exist at all.
 */
const DEEP_ONLY_THEME = 'bois';
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

/**
 * `--quiet` prints only failures and the per-combination summary.
 *
 * 278 assertions is a great deal of green to scroll past on every build, and
 * a wall of text nobody reads is a check nobody reads. The full table is one
 * flag away when a ratio actually needs inspecting.
 */
const VERBOSE = process.argv.includes('--verbose');

let assertions = 0;

for (const themeId of THEMES) {
  for (const mode of ['light', 'dark']) {
    const P = PALETTES[themeId][mode];
    const combination = `${themeId} / ${mode}`;
    let localFailures = 0;

    if (VERBOSE) {
      console.log(`\n${'='.repeat(58)}\n  ${combination.toUpperCase()} — pairs the site renders\n`);
    }

    for (const [fg, bg, min, label] of MUST_PASS) {
      assertions++;
      const a = P[fg];
      const b = P[bg];
      if (!a || !b) {
        failures++;
        localFailures++;
        /* An unresolved token is almost always a theme that forgot to restate
           something its dark block inherits — the exact failure the header of
           site-themes.css warns about. Say which theme, or the message sends
           the reader hunting through eight blocks. */
        console.log(`  FAIL  [${combination}] unresolved token: ${!a ? fg : bg}`);
        continue;
      }
      const ratio = contrast(a, b);
      const ok = ratio >= min;
      if (!ok) {
        failures++;
        localFailures++;
      }
      if (VERBOSE || !ok) {
        console.log(row(ok, ratio, min, `[${combination}] ${label}`, `${fg} ${a} on ${bg} ${b}`));
      }
    }

    if (themeId === DEEP_ONLY_THEME) {
      if (VERBOSE) {
        console.log(`\n  ${combination.toUpperCase()} — deep-variant rules, EXPECTED to fail\n`);
      }
      for (const [fg, bg, min, label] of DEEP_ONLY[mode]) {
        assertions++;
        const a = P[fg];
        const b = P[bg];
        if (!a || !b) {
          failures++;
          localFailures++;
          console.log(`  FAIL  [${combination}] unresolved token: ${!a ? fg : bg}`);
          continue;
        }
        const ratio = contrast(a, b);
        if (ratio >= min) {
          failures++;
          localFailures++;
          console.log(
            `  UNEXPECTED PASS  [${combination}] ${ratio.toFixed(2)} — "${label}" now clears AA;` +
              ' revisit the deep-variant rule in tokens.css rather than leaving it stale.',
          );
        } else if (VERBOSE) {
          console.log(row(true, ratio, min, `(expected fail) ${label}`, `${fg} ${a} on ${bg} ${b}`));
        }
      }
    }

    if (!VERBOSE) {
      const count = MUST_PASS.length + (themeId === DEEP_ONLY_THEME ? DEEP_ONLY[mode].length : 0);
      console.log(
        `  ${localFailures === 0 ? 'ok  ' : 'FAIL'}  ${combination.padEnd(20)} ` +
          `${String(count).padStart(3)} pairs` +
          (localFailures ? `  — ${localFailures} problem(s)` : ''),
      );
    }
  }
}

console.log(`\n${'='.repeat(58)}\n  BOARD PRESETS — square separation, and the edge on every theme\n`);
for (const preset of PRESETS) {
  if (!preset.light || !preset.dark) {
    failures++;
    console.log(`  FAIL  .board-${preset.id} is missing its light or dark square colour`);
    continue;
  }

  /* ⚠️ The two on-square coordinate checks are GONE, deliberately.
     Coordinates moved out of the squares into a gutter on the page
     background, so square parity no longer decides their colour — there is
     one `--mcc-board-coord` per theme, checked against that theme's page
     surface in MUST_PASS. Leaving the old pairs here would audit a
     relationship the site no longer has. */
  const separation = contrast(preset.light, preset.dark);
  assertions++;
  const sepOk = separation >= UI;
  if (!sepOk) failures++;

  /*
   * ⚠️ THE BOARD NOW SITS ON EIGHT DIFFERENT PAGES, NOT TWO.
   *
   * A preset is independent of the theme — a reader may pin `glace` and then
   * switch to Terminal — so every preset must keep an edge against every
   * theme's page in both modes. That is 6 × 8 = 48 assertions, and they are
   * the ones most likely to catch a new theme: a page colour that happens to
   * sit between a preset's two squares makes the board dissolve into it.
   *
   * Which square carries the edge depends on the page: on a light page the
   * DARK square is what separates, on a dark page the LIGHT one. Checking the
   * other of each pair would fail everywhere for no reason.
   */
  const edges = PAGES.map(({ id, mode, page }) => {
    const square = mode === 'dark' ? preset.light : preset.dark;
    return { id, mode, ratio: contrast(square, page), ok: contrast(square, page) >= UI };
  });
  assertions += edges.length;
  const badEdges = edges.filter((edge) => !edge.ok);
  failures += badEdges.length;

  const worst = edges.reduce((a, b) => (a.ratio <= b.ratio ? a : b));
  console.log(
    `  ${sepOk && badEdges.length === 0 ? 'ok  ' : 'FAIL'}  .board-${preset.id.padEnd(11)}` +
      ` ${preset.light} / ${preset.dark}` +
      `   separation ${separation.toFixed(2)}:${UI}` +
      `   tightest edge ${worst.ratio.toFixed(2)} (${worst.id}/${worst.mode})`,
  );
  if (!sepOk) {
    console.log(
      `        FAIL  ${separation.toFixed(2)} : ${UI}  light vs dark square separation` +
        ` — the two squares of .board-${preset.id} no longer read as two squares`,
    );
  }
  for (const edge of badEdges) {
    console.log(
      `        FAIL  ${edge.ratio.toFixed(2)} : ${UI}  board edge on the ${edge.id}/${edge.mode} page`,
    );
  }
}

/* ── Pieces on squares ────────────────────────────────────────────────────
 *
 * ⚠️ THE CHECK THAT WOULD HAVE CAUGHT AN INVISIBLE BOARD.
 *
 * Every pair above is about colours the site DECLARES. A piece is artwork: it
 * has its own inks, and it stands on a square this file already audits — but
 * nothing related the two, so the first draft of the Terminal theme shipped a
 * MONOCHROME piece set on a near-black board. Both sides of the position
 * measured 1.03:1 against the dark square. Nothing errored, no ratio moved,
 * and it was found by looking at a screenshot.
 *
 * ⚠️ THE RULE IS "AT LEAST ONE INK", NOT "THE PIECE CONTRASTS".
 *
 * A white piece on a light square is ALWAYS low contrast — that is true of
 * every chess set ever made, and it is the OUTLINE that separates it. So for
 * each square, a piece passes if either its body or its outline clears 3:1.
 * A monochrome set has one ink and no second chance, which is exactly the
 * property that makes it unsafe on a dark board.
 *
 * The inks are declared in `src/config/piece-sets.ts`, read off the vendored
 * SVGs by hand. That is a copy, and a deliberate one: parsing arbitrary SVG
 * fills would be fragile in a way that fails OPEN — an auditor that quietly
 * finds no colours reports success. Declared values fail closed.
 */
const themeConfig = readFileSync(join(ROOT, 'src/config/site-themes.ts'), 'utf8');
const pieceConfig = readFileSync(join(ROOT, 'src/config/piece-sets.ts'), 'utf8');

/** `id → { defaultBoard, pieceSet }`, parsed from the theme config. */
function themeAssignments() {
  const out = [];
  const source = decomment(themeConfig);
  const pattern =
    /id:\s*'([\w-]+)'[\s\S]*?defaultBoard:\s*'([\w-]+)'[\s\S]*?pieceSet:\s*'([\w-]+)'/g;
  for (const [, id, board, pieces] of source.matchAll(pattern)) {
    out.push({ id, board, pieces });
  }
  return out;
}

/** `setId → { white: {body, outline}, black: {…} }`, parsed from the piece config. */
function pieceInks() {
  const out = {};
  const source = decomment(pieceConfig);
  const pattern =
    /id:\s*'([\w-]+)',[\s\S]*?white:\s*\{\s*body:\s*'(#[0-9a-f]{6})',\s*outline:\s*(null|'#[0-9a-f]{6}')\s*\}[\s\S]*?black:\s*\{\s*body:\s*'(#[0-9a-f]{6})',\s*outline:\s*(null|'#[0-9a-f]{6}')\s*\}/gi;
  for (const [, id, wBody, wOutline, bBody, bOutline] of source.matchAll(pattern)) {
    const ink = (value) => (value === 'null' ? null : value.replace(/'/g, '').toLowerCase());
    out[id] = {
      white: { body: wBody.toLowerCase(), outline: ink(wOutline) },
      black: { body: bBody.toLowerCase(), outline: ink(bOutline) },
    };
  }
  return out;
}

const ASSIGNMENTS = themeAssignments();
const INKS = pieceInks();
const PRESET_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

if (ASSIGNMENTS.length === 0 || Object.keys(INKS).length === 0) {
  console.error('\ncheck-contrast: could not read the theme→piece assignments — did the config move?\n');
  process.exit(1);
}

console.log(`\n${'='.repeat(58)}\n  PIECES ON SQUARES — each theme's set on the board it uses\n`);
for (const { id, board, pieces } of ASSIGNMENTS) {
  const preset = PRESET_BY_ID[board];
  const ink = INKS[pieces];
  if (!preset || !ink) {
    failures++;
    console.log(`  FAIL  theme ${id}: unknown board "${board}" or piece set "${pieces}"`);
    continue;
  }

  let worst = { ratio: Infinity, label: '' };
  let bad = 0;
  for (const side of ['white', 'black']) {
    for (const [squareName, square] of [
      ['light square', preset.light],
      ['dark square', preset.dark],
    ]) {
      assertions++;
      const candidates = [ink[side].body, ink[side].outline].filter(Boolean);
      const best = Math.max(...candidates.map((c) => contrast(c, square)));
      if (best < UI) {
        failures++;
        bad++;
        console.log(
          `        FAIL  ${best.toFixed(2)} : ${UI}  ${pieces} ${side} piece on ${board}'s ` +
            `${squareName} (${square})` +
            (ink[side].outline === null ? ' — MONOCHROME set, no outline to fall back on' : ''),
        );
      }
      if (best < worst.ratio) worst = { ratio: best, label: `${side} on ${squareName}` };
    }
  }
  console.log(
    `  ${bad === 0 ? 'ok  ' : 'FAIL'}  ${id.padEnd(9)} ${pieces.padEnd(11)} on .board-${board.padEnd(11)}` +
      ` tightest ${worst.ratio.toFixed(2)} (${worst.label})`,
  );
}

/*
 * A reader's OWN colours are not checked here — they do not exist at build
 * time. `bestInkFor()` derives the better ink for whatever they pick, and the
 * settings page shows the resulting ratio live and warns below AA. They are
 * allowed to proceed: it is their board. See CLAUDE.md → Theming.
 */

if (failures > 0) {
  console.error(
    `\n${failures} contrast problem(s) out of ${assertions} assertions.` +
      '\nFix the tokens before shipping — a combination that fails is corrected or' +
      '\ndropped, never published with an exception. Re-run with --verbose for the' +
      '\nfull table.\n',
  );
  process.exit(1);
}
console.log(
  `\nAll contrast expectations hold — ${assertions} assertions:` +
    ` ${THEMES.length} themes × 2 modes, ${PRESETS.length} board presets.\n`,
);
