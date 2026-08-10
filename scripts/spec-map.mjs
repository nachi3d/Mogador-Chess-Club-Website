/**
 * Which chromium specs cover which source paths — the ONE mapping.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ IT LIVES HERE BECAUSE TWO SCRIPTS NEED IT, AND TWO COPIES WOULD DRIFT.
 *
 * `scripts/quick.mjs` (the fast path for a typo) and `scripts/test-branch.mjs`
 * (the per-session command) both answer "what covers what just moved". They
 * answered it identically until the mapping was extracted, which is exactly
 * the shape that produced three `.chip` definitions and two card presses.
 *
 * A spec that is mapped from nothing is a spec that runs only at the release
 * gate. That is a real cost, so when a new spec file lands, map it.
 * ─────────────────────────────────────────────────────────────────────────
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * `smoke.spec.ts` is always added by `specsFor()`: it is the "both locales
 * still render and the switcher still works" net, and it is cheap.
 */
export const SPEC_MAP = [
  /* Content that an index draws a card for maps to `index-cards.spec.ts` as
     well as to its own spec: adding or removing an entry is exactly when a
     card can end up on a page with nowhere to go. */
  [/^src\/content\/traps\//, ['replayer.spec.ts', 'index-cards.spec.ts']],
  [/^src\/content\/exercices\//, ['exercise.spec.ts', 'index-cards.spec.ts']],
  [/^src\/content\/(cours|lessons)\//, ['lessons.spec.ts', 'index-cards.spec.ts']],
  [/^src\/content\/tutoriel\//, ['tutorial.spec.ts']],
  [/^src\/content\/agenda\//, ['smoke.spec.ts']],
  [/^src\/i18n\/ui\./, ['smoke.spec.ts', 'nav-coords.spec.ts', 'main-menu.spec.ts']],
  [/^src\/config\/site\./, ['legal.spec.ts', 'smoke.spec.ts']],
  [/^src\/config\/(board-themes|site-themes|piece-sets)\./, ['themes.spec.ts', 'theme.spec.ts']],

  /* The board and its libs. These used to be the "critical path" that
     triggered the whole matrix on any branch; they now get PRECISE chromium
     coverage instead, and their cross-browser pass at the release gate like
     everything else. Listing the specs is what makes that trade honest. */
  [
    /^src\/components\/board\/BoardSurface\./,
    [
      'exercise.spec.ts',
      'replayer.spec.ts',
      'board-pointer.spec.ts',
      'board-frame.spec.ts',
      'board-affordance.spec.ts',
      'nav-coords.spec.ts',
      'play.spec.ts',
    ],
  ],
  [
    /^src\/components\/board\//,
    [
      'exercise.spec.ts',
      'replayer.spec.ts',
      'board-pointer.spec.ts',
      'board-affordance.spec.ts',
      /* M3: the exercise chrome is what the phone-fit budget is spent on, so
         any change under here can move it. */
      'mobile-fit.spec.ts',
    ],
  ],
  [/^src\/lib\/chess\/exercise\./, ['exercise.spec.ts', 'board-pointer.spec.ts']],
  [/^src\/lib\/chess\/replay\./, ['replayer.spec.ts']],
  [/^src\/lib\/chess\//, ['exercise.spec.ts', 'replayer.spec.ts']],
  [/^src\/lib\/engine\//, ['play.spec.ts', 'engine-levels.spec.ts']],
  [/^src\/lib\/progress\./, ['exercise.spec.ts', 'tutorial.spec.ts', 'main-menu.spec.ts', 'mobile-app.spec.ts', 'resume.spec.ts', 'progression.spec.ts']],
  /* The journey table and the shared resolver (M3). Everything that reads
     `mcc:progress:v1` on a page now goes through these two. */
  [/^src\/lib\/journey\./, ['resume.spec.ts', 'main-menu.spec.ts', 'mobile-app.spec.ts']],
  /* E3 — the ledger, the ranks, the streak and the achievements. The policy
     and the catalogue builder are one feature with one spec; the surfaces that
     display them are mapped alongside their own specs below. */
  [/^src\/lib\/(points|scoreboard|score)\./, ['progression.spec.ts']],
  [/^src\/components\/progress\/ScoreResolver\./, ['progression.spec.ts', 'resume.spec.ts']],
  [/^src\/styles\/score\./, ['progression.spec.ts', 'themes.spec.ts']],
  [/^src\/components\/progress\//, ['resume.spec.ts', 'main-menu.spec.ts', 'mobile-app.spec.ts']],
  [/^src\/lib\/theme\./, ['theme.spec.ts', 'themes.spec.ts']],
  [/^src\/lib\/motion\./, ['feel.spec.ts', 'motion.spec.ts']],
  [/^src\/lib\/(auth-flag|supabase)/, ['auth.spec.ts', 'auth-disabled.spec.ts']],

  /* i18n ROUTING, as distinct from the string tables above. */
  [/^src\/i18n\/paths\./, ['smoke.spec.ts', 'legal.spec.ts']],
  [/^src\/pages\//, ['smoke.spec.ts']],

  [/^src\/styles\/cards\./, ['exercise.spec.ts', 'tutorial.spec.ts', 'lessons.spec.ts', 'feel.spec.ts']],
  [/^src\/styles\//, ['themes.spec.ts', 'theme.spec.ts', 'feel.spec.ts']],

  [/^src\/layouts\//, ['smoke.spec.ts', 'mobile-app.spec.ts', 'pwa.spec.ts', 'mobile-fit.spec.ts']],
  [/^src\/components\/MobileNav\./, ['mobile-app.spec.ts']],
  [/^src\/components\/(CardGrid|NumberedCard|ProgressStates|LevelBadge)\./, ['exercise.spec.ts', 'tutorial.spec.ts', 'lessons.spec.ts', 'index-cards.spec.ts']],
  [/^src\/components\/home\//, ['main-menu.spec.ts', 'mobile-app.spec.ts', 'progression.spec.ts']],
  [/^src\/components\/pages\/HomePage\./, ['main-menu.spec.ts', 'mobile-app.spec.ts', 'resume.spec.ts']],
  [/^src\/components\/pages\/(Trap|Exercice)Page\./, ['mobile-fit.spec.ts']],
  [/^src\/components\/pages\/SettingsPage\./, ['theme.spec.ts', 'themes.spec.ts']],
  [/^src\/components\/pages\/LegalPage\./, ['legal.spec.ts']],
  [/^src\/components\/pages\/ProgressPage\./, ['mobile-app.spec.ts', 'resume.spec.ts', 'progression.spec.ts']],
  [/^src\/components\/pages\/(Cours|Exercices|Pieges|TutorialIndex)Page\./, ['exercise.spec.ts', 'tutorial.spec.ts', 'lessons.spec.ts', 'resume.spec.ts', 'index-cards.spec.ts']],
  [/^src\/components\/pages\/(Lesson|CourseDetail|TutorialStep)Page\./, ['lessons.spec.ts', 'tutorial.spec.ts', 'board-pointer.spec.ts']],
  [/^src\/components\//, ['smoke.spec.ts']],

  [/^scripts\/build-sw\./, ['pwa.spec.ts']],
  [/^astro\.config\./, ['smoke.spec.ts', 'pwa.spec.ts', 'auth-disabled.spec.ts']],
];

/**
 * The spec files covering a set of changed repo-relative paths.
 *
 * Returns only specs that exist on disk, sorted — a mapping entry for a spec
 * that has been renamed must not fail the run it is meant to protect.
 */
export function specsFor(files, root) {
  const specs = new Set(['smoke.spec.ts']);
  for (const file of files) {
    for (const [pattern, list] of SPEC_MAP) {
      if (pattern.test(file)) for (const spec of list) specs.add(spec);
    }
  }
  return [...specs].filter((spec) => existsSync(join(root, 'tests/e2e', spec))).sort();
}
