/**
 * Which build the suite is running against — accounts ON or OFF.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * The production build has accounts OFF (v0.3.0): the routes are not emitted
 * and no Supabase client is bundled. The suite must therefore be able to run
 * in both shapes, and — the part that matters — must never PASS VACUOUSLY in
 * either.
 *
 * So every auth spec is gated on this and skips with a REASON that names the
 * flag. A skipped test reads as "not applicable to this build" in the report;
 * a silently-passing one reads as "auth works", which would be a lie in a build
 * that has no auth in it.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Read from `process.env` because that is what `playwright.config.ts` passes to
 * the webServer build — the spec process and the build under test therefore
 * agree by construction rather than by convention.
 */
export const AUTH_ENABLED = process.env['PUBLIC_AUTH_ENABLED'] === 'true';

/** The reason string shown in the report. Names the flag and how to flip it. */
export const AUTH_OFF_REASON =
  'accounts are disabled in this build (PUBLIC_AUTH_ENABLED is not "true") — ' +
  'run with PUBLIC_AUTH_ENABLED=true to exercise the account flows';

export const AUTH_ON_REASON =
  'this build has accounts ENABLED (PUBLIC_AUTH_ENABLED=true) — ' +
  'the disabled-build guarantees only apply to the default build';
