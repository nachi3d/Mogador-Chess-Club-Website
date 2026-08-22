/**
 * ⚠️ NO CONTROL INSIDE A HYDRATING ISLAND MAY LOOK USABLE BEFORE IT IS.
 *
 * Astro server-renders every `client:*` island, so a control inside one exists
 * in the HTML with its handler attached to nothing until the island's chunk
 * lands and Preact attaches. A press in that window does NOTHING AT ALL — no
 * action, no error, no acknowledgement — and `client:visible` puts the window
 * exactly where a reader arrives, because hydration is not even requested
 * until the island scrolls into view.
 *
 * This has now been found THREE TIMES, each time by accident:
 *
 *   - `/jouer/`'s start button, after `play.spec.ts` flaked at three
 *     consecutive gates and was written off as machine contention all three;
 *   - the replayer's launch button, its transport controls and all thirteen
 *     move-list buttons — SIXTEEN inert controls on every trap and lesson page;
 *   - the exercise hint button, the one a student presses precisely when they
 *     are stuck.
 *
 * ⚠️ THE TESTS CANNOT FIND IT ON THEIR OWN. A spec waits on `<cg-board>` or on
 * `data-ready`; a child does not. Two of the three were found only because a
 * test flaked for an unrelated-looking reason, and the replayer's was found by
 * reading `dist/` on purpose. So it is checked here, against the artefact,
 * rather than left to the next accident.
 *
 * THE RULE: every `<button>`, `<input>`, `<select>` and `<textarea>` rendered
 * inside an `<astro-island>` ships `disabled` — directly, or via an enclosing
 * `<fieldset disabled>` — and the island enables it when it reports ready.
 * `<a>` is exempt: a link works with no JavaScript at all.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';
const CONTROLS = new Set(['button', 'input', 'select', 'textarea']);

/** Every .html file under dist/. */
function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...htmlFiles(full));
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}

/**
 * The inner HTML of each island in a document.
 *
 * The opening tag is skipped deliberately: its `props` attribute carries the
 * whole serialised component tree, and scanning it would match content strings
 * rather than markup. Islands do not nest in this codebase (there is exactly
 * one board island per board), so a flat scan is honest here.
 */
function islands(html) {
  const out = [];
  const open = /<astro-island\b/g;
  let m;
  while ((m = open.exec(html))) {
    const tagEnd = html.indexOf('>', m.index);
    const close = html.indexOf('</astro-island>', tagEnd);
    if (tagEnd === -1 || close === -1) continue;
    out.push({ start: tagEnd + 1, inner: html.slice(tagEnd + 1, close) });
  }
  return out;
}

/** Tag name + raw attributes for every element in a fragment, in order. */
function* tags(fragment) {
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
  let m;
  while ((m = re.exec(fragment))) {
    yield { closing: m[1] === '/', name: m[2].toLowerCase(), attrs: m[3] ?? '', at: m.index };
  }
}

const hasDisabled = (attrs) => /(^|\s)disabled(\s|=|$)/i.test(attrs);

const violations = [];

for (const file of htmlFiles(DIST)) {
  const html = readFileSync(file, 'utf8');
  for (const island of islands(html)) {
    /* A `<fieldset disabled>` disables every control it contains, so the
       controls themselves carry no attribute — see `/jouer/`'s radios, which
       are correctly guarded and would read as violations without this. */
    let fieldsetDepth = 0;
    let disabledFieldsetAt = null;

    for (const tag of tags(island.inner)) {
      if (tag.name === 'fieldset') {
        if (tag.closing) {
          fieldsetDepth = Math.max(0, fieldsetDepth - 1);
          if (disabledFieldsetAt !== null && fieldsetDepth < disabledFieldsetAt) {
            disabledFieldsetAt = null;
          }
        } else {
          if (hasDisabled(tag.attrs) && disabledFieldsetAt === null) {
            disabledFieldsetAt = fieldsetDepth;
          }
          fieldsetDepth += 1;
        }
        continue;
      }
      if (tag.closing || !CONTROLS.has(tag.name)) continue;
      if (disabledFieldsetAt !== null || hasDisabled(tag.attrs)) continue;

      /* Grouped by WHAT the control is, not by what it says. Keying on the
         raw markup put every move-list button on its own line — one per SAN,
         seventy lines of the same defect — and buried the two that differed. */
      const testid = /data-testid="([^"]*)"/.exec(tag.attrs)?.[1];
      const cls = /class="([^"]*)"/.exec(tag.attrs)?.[1]?.split(/\s+/)[0];
      const label = testid ?? cls ?? tag.name;
      violations.push({ file: relative(DIST, file).split(sep).join('/'), label, tag: tag.name });
    }
  }
}

if (violations.length > 0) {
  console.error('');
  console.error('  A control inside a hydrating island ships ENABLED.');
  console.error('');
  console.error('  Until the island hydrates it has no handler behind it, so a press does');
  console.error('  nothing at all — no action, no error, no acknowledgement. Disable it and');
  console.error("  enable it when the island reports ready (`data-ready`), the way PlayView,");
  console.error('  ReplayView and ExerciseView do. See CLAUDE.md → "Island readiness".');
  console.error('');

  /* One line per distinct control, with the pages carrying it: the same defect
     lands on every trap and every lesson, and hundreds of identical lines
     would bury the one that differs. */
  const byLabel = new Map();
  for (const v of violations) {
    const seen = byLabel.get(v.label) ?? { tag: v.tag, count: 0, pages: new Set(), first: v.file };
    seen.count += 1;
    seen.pages.add(v.file);
    byLabel.set(v.label, seen);
  }
  for (const [label, { tag, count, pages, first }] of [...byLabel].sort(
    (a, b) => b[1].count - a[1].count,
  )) {
    console.error(`  <${tag}> ${label}`);
    console.error(`      ${count} control(s) on ${pages.size} page(s), e.g. ${first}`);
  }
  console.error('');
  console.error(`  ${violations.length} control(s) across ${new Set(violations.map((v) => v.file)).size} page(s).`);
  console.error('');
  process.exit(1);
}

const pages = new Set();
let islandCount = 0;
for (const file of htmlFiles(DIST)) {
  const found = islands(readFileSync(file, 'utf8'));
  if (found.length > 0) pages.add(file);
  islandCount += found.length;
}
console.log(
  `Island controls: every control in ${islandCount} island(s) across ${pages.size} page(s) ships disabled.`,
);
