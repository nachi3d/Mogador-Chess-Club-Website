/**
 * Which specs get a SECOND browser engine — the ONE definition.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ IT LIVES HERE BECAUSE TWO CONSUMERS NEED IT, AND TWO COPIES WOULD DRIFT.
 * `playwright.config.ts` turns these into `testMatch` for each project, and
 * `scripts/check-lanes.mjs` reads them to ADVISE about a spec that looks
 * engine-sensitive and is in no lane. Same reasoning as `spec-map.mjs`.
 *
 * ⚠️ THE RULE: CHROMIUM PROVES EVERY SPEC. A SECOND ENGINE IS ADDED ONLY WHERE
 * A DIFFERENT ENGINE COULD PLAUSIBLY GIVE A DIFFERENT ANSWER.
 *
 * Until the gate audit all 41 spec files ran on all five projects in both flag
 * shapes: ~6,700 test executions and a MEASURED 4.8 hours, for a static
 * teaching site. Three measurements decided the change, and they are in
 * `docs/reference/testing.md` in full:
 *
 *   - 29 of the 41 files run IDENTICALLY in both flag shapes, proved by
 *     run/skip status. The second shape re-ran ~3,000 tests that could not
 *     answer anything new.
 *   - four files (`booking`, `child-profiles`, `engine-levels`,
 *     `role-separation`) never open a browser at all — 255 browser contexts
 *     per release for `rpc()` calls and arithmetic.
 *   - chromium runs the WHOLE suite in 7.1 minutes and proves every spec once.
 *
 * ⚠️ THE MATRIX HAS EARNED ITS KEEP, AND THAT IS WHAT THE LANES PRESERVE.
 * Every lane exists because an engine caught a real, user-facing defect:
 *
 *   webkit     the "Créer" click-synthesis bug (956b05a, ONE RELEASE BEFORE
 *              this change): a `change` handler rewrote the submit button
 *              between mousedown and mouseup, and WebKit then declined to
 *              synthesise the click. The button silently did nothing on Safari
 *              and on every iPhone. Invisible in Blink and in Gecko.
 *   firefox    the agenda axe violation Gecko's accessibility tree produced.
 *   iphone-13  the tap-versus-bottom-bar collision.
 *
 * ⚠️ A SPEC JOINS A LANE FOR A NAMED REASON, NEVER "TO BE SAFE". The default
 * is chromium-only, so a new spec costs one run until somebody argues
 * otherwise. Write the reason in the comment beside it.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Board surface, geometry and pointer synthesis — WebKit is the divergent one. */
export const BOARD = ['board-pointer', 'board-frame', 'board-affordance', 'nav-coords'];

/**
 * ⚠️ SCRIPT-PAINTED CONTROLS — THE "CRÉER" CLASS, AND THE ONE TO GET RIGHT.
 *
 * Every spec here fills a field and then presses a control WITHOUT blurring
 * first, or presses a control that a repaint may have rebuilt underneath it.
 * That is the exact shape the WebKit defect exploited.
 *
 * ⚠️ `auth` IS THE HIGHEST-STAKES MEMBER. If the sign-in button stops
 * synthesising its click, every Safari and iPhone reader is locked out of the
 * site, and no other spec would notice.
 *
 * ⚠️ `booking-ui` WAS ADDED WITH THE LANES, NOT BEFORE THEM. v0.18.0 shipped
 * the booking controls with no browser test at all, on any engine —
 * `booking.spec.ts` never opens a page. The gate-reduction audit found it, and
 * a session that shrinks a gate does not get to leave a known untested surface
 * behind.
 */
export const SCRIPTED_FORMS = [
  'recurring-sessions',
  'family',
  'onboarding',
  'account-deletion',
  'auth',
  'booking-ui',
];

/** Touch, viewport, and the fixed bottom bar. */
export const TOUCH = ['mobile-app', 'mobile-fit', 'touch-focus'];

/**
 * project → the spec base names it runs.
 *
 * ⚠️ `chromium` IS DELIBERATELY ABSENT. It has no `testMatch` at all, so it
 * runs every spec in the directory including one nobody has classified. The
 * lanes are the opt-IN; chromium is the floor.
 */
export const LANES = {
  /* Headless WebKit ships NO Web Audio at all, so `sound`'s degradation path
     exists only here. `video` is facade layout plus third-party blocking. */
  webkit: [...BOARD, ...SCRIPTED_FORMS, 'sound', 'video'],

  /* Gecko: the cascade, per-theme font loading, transition timing, and the
     accessibility tree that produced the agenda violation. */
  firefox: ['themes', 'theme', 'feel', 'motion', 'agenda', 'main-menu'],

  /* WebKit mobile — the tap-versus-bar collision, plus the board at phone
     width, where the geometry and the touch surface meet. */
  'iphone-13': [...TOUCH, 'board-pointer', 'board-frame'],

  /* Blink mobile — the same touch surface on the other engine. */
  'pixel-5': [...TOUCH],
};

/**
 * ⚠️ THE ACCOUNTS-OFF SLIVER IS NOT A SECOND MATRIX.
 *
 * Exactly two specs can only be proved by an accounts-OFF BUILD, because they
 * are claims about the artefact that shape produces:
 *
 *   auth-disabled   Critical Feature 18 — no route emitted, and no Supabase
 *                   ref, host or anon key anywhere in the bundle.
 *   admin           its "accounts off — the admin surfaces are NOT BUILT"
 *                   describe (3 tests; the other 12 need the ON shape).
 *
 * Both are engine-independent, so they run on chromium alone and cost about
 * fifteen seconds. The expense is the second BUILD, and it is irreducible: you
 * cannot inspect an artefact you did not produce.
 */
export const OFF_SLIVER = ['auth-disabled', 'admin'];

/**
 * Specs that DO NOTHING unless the build has accounts ON.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THIS CLOSES A HOLE IN THE DAILY LOOP, NOT THE RELEASE LOOP — WHICH IS
 * WHY IT MATTERS MORE THAN ITS SIZE SUGGESTS.
 *
 * The release gate runs accounts-ON because that is what production serves.
 * `test-branch.mjs` set no flag at all, so every branch build was OFF and every
 * spec below SKIPPED. A session touching the booking UI therefore got no
 * coverage until promotion — the branch gate silently answering a question
 * nobody asked, on the loop where defects are cheapest to catch.
 *
 * ⚠️ MEASURED, NOT GUESSED: this is the ON-only and partly-ON set from the gate
 * audit, taken from run/skip status across two recorded matrix JSONs. Eight run
 * nothing at all in the OFF shape; `admin` runs 3 of 15, `auth` 6 of 26 and
 * `recurring-sessions` 6 of 9.
 *
 * ⚠️ `booking`, `booking-ui` AND `recurring-sessions` WERE MISSING from the
 * older copy of this list in `test-branch.mjs`, which is exactly the drift that
 * putting it here prevents.
 *
 * ⚠️ `auth-disabled` IS NOT HERE AND MUST NOT BE. It is the mirror image — it
 * only means anything in an OFF build, and the release gate's sliver is what
 * proves it. A branch selecting it runs OFF; see `test-branch.mjs` for what
 * happens when a selection wants both shapes at once.
 * ═════════════════════════════════════════════════════════════════════════
 */
export const NEEDS_ACCOUNTS_ON = [
  'account-deletion',
  'admin',
  'attendance-timing',
  'auth',
  'booking',
  'booking-ui',
  'child-profiles',
  'family',
  'onboarding',
  'progress-sync',
  'recurring-sessions',
  'role-separation',
];

/** Specs that only mean anything in an accounts-OFF build. */
export const NEEDS_ACCOUNTS_OFF = ['auth-disabled'];

/**
 * Base names → the glob list `testMatch` wants: `a` becomes a recursive-match
 * pattern ending in `a.spec.ts`.
 *
 * ⚠️ THE PATTERN IS NOT WRITTEN OUT IN THIS COMMENT ON PURPOSE — a literal
 * star-star-slash closes the block comment and turns the rest of the file into
 * a syntax error. It did exactly that once.
 */
export const globs = (names) => names.map((n) => `**/${n}.spec.ts`);

/** Every spec base name that any lane names. */
export const inAnyLane = () => new Set(Object.values(LANES).flat());

/**
 * Lane names that match no spec file on disk.
 *
 * ⚠️ THIS ONE IS A GATE, UNLIKE `check-lanes.mjs`, AND THE DIFFERENCE IS THE
 * WHOLE POINT. A misspelt lane entry is not a matter of judgement: `testMatch`
 * silently matches NOTHING, the project runs zero tests, and the gate goes
 * green having proved less than it claims. That is a fact about the filesystem,
 * so it can be checked exactly — and it is the failure mode the lane design
 * introduced, so it is the one thing here that must refuse.
 */
export function missingLaneSpecs(root) {
  const missing = [];
  for (const [project, names] of Object.entries(LANES)) {
    for (const name of names) {
      if (!existsSync(join(root, 'tests', 'e2e', `${name}.spec.ts`))) {
        missing.push({ project, name });
      }
    }
  }
  return missing;
}
