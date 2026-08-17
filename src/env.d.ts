/**
 * Build-time environment variables, declared so they can be read with DOT
 * ACCESS.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THIS FILE EXISTS BECAUSE `import.meta.env['X']` LEAKS THE WHOLE ENV.
 *
 * Vite replaces `import.meta.env.FOO` — **dot access only** — with a literal at
 * build time. It cannot do that for `import.meta.env['FOO']`, because a
 * computed key is not statically known. Its fallback is to emit the ENTIRE env
 * object into the chunk, every `PUBLIC_*` variable included.
 *
 * That is not a style nit. Found in the v0.3.0 build, in the chunk that was
 * supposed to prove accounts were disabled:
 *
 *   r={ASSETS_PREFIX:void 0,…,PUBLIC_SUPABASE_ANON_KEY:`eyJhbGciOi…`}
 *
 * The anon key is a JWT whose payload carries the project ref, so a single
 * bracket access in `src/config/auth.ts` put the production Supabase ref into a
 * shipped file — while the flag it implemented was meant to keep it out. It
 * also meant `AUTH_ENABLED` was never folded to a constant, so none of the
 * dead-branch elimination it was written for actually happened.
 *
 * The anon key is public by design and RLS is the real boundary, so nothing was
 * exploitable. The point is that the guarantee was false while looking true.
 *
 * **Rule: always `import.meta.env.NAME`. Never `import.meta.env['NAME']`.**
 * `tests/e2e/auth-disabled.spec.ts` greps the built output for the ref, which is
 * what turns this from a convention into something enforced.
 * ═════════════════════════════════════════════════════════════════════════
 */

interface ImportMetaEnv {
  /**
   * `'true'` enables the account routes. Anything else — unset, empty, `1`,
   * `TRUE` — disables them. See `src/config/auth.ts` for what "disabled" means.
   */
  readonly PUBLIC_AUTH_ENABLED?: string;
  /**
   * `'true'` emits the test-fixture routes. Anything else omits them, which is
   * what production ships. Set by `playwright.config.ts` for the build it
   * tests, and by nothing else. See `src/config/fixtures.ts`.
   */
  readonly PUBLIC_FIXTURES?: string;
  /** Public by design; RLS is the security boundary. See CLAUDE.md → v2. */
  readonly PUBLIC_SUPABASE_URL?: string;
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
  /** Analytics. When unset the snippet is omitted entirely — no empty script. */
  readonly PUBLIC_UMAMI_WEBSITE_ID?: string;
  readonly PUBLIC_UMAMI_SCRIPT_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
