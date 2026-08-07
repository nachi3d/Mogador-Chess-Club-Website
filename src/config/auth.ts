/**
 * The account feature flag — build time, not runtime.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ OFF MEANS **NOT BUILT**, NOT "HIDDEN".
 *
 * When this is false, `/connexion/`, `/compte/` (both locales) and
 * `/auth/callback/` are not emitted into `dist/` at all: they 404 the way any
 * other unwritten URL does. There is no hidden page, no `display: none` link,
 * and — the part that matters — **no Supabase project ref anywhere in the
 * bundle**. A reader cannot find a door that was never built, and a curious
 * reader cannot grep one out of the JavaScript either.
 *
 * That is a deliberately stronger guarantee than hiding the nav entry would
 * give. v2-S1 shipped a complete, tested auth stack; what it does not yet have
 * is anything to sync (v2-S3), so an account is a door into an empty room.
 * Shipping it in that state would ask parents to hand over a child's email
 * address in exchange for nothing.
 *
 * ⚠️ NOTHING IS DELETED. Every page, spec, migration and RLS policy stays
 * exactly where it is. v2-S3 sets the variable to `true` and the feature is
 * back, unchanged — this is a switch, not a rollback. The e2e suite proves the
 * ON path still works by building with it on.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ── Why a string comparison, and why that is load-bearing ────────────────
 * Vite replaces `import.meta.env.PUBLIC_AUTH_ENABLED` with a literal at build
 * time, so `=== 'true'` folds to a constant `false` in the default build. That
 * lets Rollup drop the branches behind it — including the
 * `import.meta.env.PUBLIC_SUPABASE_URL` read in `src/lib/supabase.ts`, which is
 * how the project ref stays out of the bundle rather than merely out of sight.
 * Do not turn this into a runtime lookup or a function call that Rollup cannot
 * see through.
 *
 * ⚠️ DOT ACCESS, NEVER `import.meta.env['PUBLIC_AUTH_ENABLED']`. Vite only
 * statically replaces dot access; a bracket key makes it emit the whole env
 * object — anon key and all — into the chunk, which is precisely the leak this
 * flag exists to prevent. It shipped that way once. See `src/env.d.ts`.
 *
 * Default is OFF. An unset variable, an empty one, `1`, `yes` and `TRUE` are
 * all off: the only string that enables accounts is exactly `true`, because a
 * flag that guards personal data should require someone to have meant it.
 */
export const AUTH_ENABLED = import.meta.env.PUBLIC_AUTH_ENABLED === 'true';
