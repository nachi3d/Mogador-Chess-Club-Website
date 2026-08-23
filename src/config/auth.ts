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

/**
 * Whether `/connexion/` offers "Continue with Google".
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ A SECOND FLAG, NOT A REUSE OF `AUTH_ENABLED`, AND THE REASON IS THE ONE
 * THIS RELEASE SPENT ITSELF ON.
 *
 * Google sign-in needs two things that do NOT live in this repository: the
 * Google provider switched on in the Supabase dashboard, and an OAuth client
 * in Google Cloud with this origin in its redirect list. Nothing here can
 * verify either. Ship the button without them and a reader presses a control
 * that looks live, and gets an error from Supabase — a live-looking control
 * that does not work is Critical Feature 76 wearing a different hat, and the
 * whole point of that feature is that the reader is not the one who should
 * discover the gap.
 *
 * So the code lands first and the button waits for the configuration. Flip
 * this only once a real sign-in has been completed against the project.
 *
 * ⚠️ IT IS SUBORDINATE TO `AUTH_ENABLED`. With accounts off there is no
 * `/connexion/` to put a button on, so the two are ANDed at the point of use
 * rather than here — keeping this one a plain literal keeps it foldable.
 *
 * ⚠️ DOT ACCESS, NEVER A BRACKET KEY. Same rule, same reason, same leak as
 * `AUTH_ENABLED` above — see `src/env.d.ts`.
 *
 * Default is OFF, on the same principle: the only string that enables it is
 * exactly `true`.
 */
export const GOOGLE_AUTH_ENABLED = import.meta.env.PUBLIC_GOOGLE_AUTH_ENABLED === 'true';
