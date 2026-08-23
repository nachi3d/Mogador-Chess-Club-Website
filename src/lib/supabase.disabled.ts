/**
 * The stand-in for `src/lib/supabase.ts` when accounts are disabled.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ THIS FILE IS NEVER IMPORTED BY NAME. `astro.config.mjs` aliases
 * `@lib/supabase` onto it when `PUBLIC_AUTH_ENABLED` is not `true`.
 *
 * Why an alias and not just dead-code elimination: Astro compiles a page's
 * `<script>` blocks into client entrypoints from the MODULE GRAPH, not from
 * what actually renders. So `getStaticPaths()` returning `[]` correctly stops
 * the PAGES being emitted, and the scripts inside them are bundled anyway — in
 * the v0.3.0 build that left **216 KB of unreachable `@supabase/supabase-js`
 * in `dist/`, precached by the service worker**, so every first visit on
 * Essaouira mobile data paid for a feature that was switched off.
 *
 * Aliasing the module cuts the graph at the root: no client, no chunk, nothing
 * to precache. The three tiny page scripts remain as orphans of a few hundred
 * bytes each, importing this instead.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The shape mirrors the real module exactly, so the pages that import it still
 * type-check. Every function reports "not configured" rather than throwing:
 * these are unreachable in a disabled build, and a stub that throws would turn
 * a hypothetical routing mistake into a broken page instead of a quiet one.
 */
import type { Session, User } from '@supabase/supabase-js';

export type Role = 'admin' | 'prof' | 'eleve';

export interface Profile {
  readonly id: string;
  readonly role: Role;
  readonly display_name: string | null;
  readonly locale: string;
  readonly guardian_phone: string | null;
  readonly onboarded_at: string | null;
  readonly account_shape: string | null;
}

/** Always false: there is no configuration in a disabled build, by design. */
export function isConfigured(): boolean {
  return false;
}

export async function getSupabase(): Promise<never> {
  return Promise.reject(new Error('Accounts are disabled in this build.'));
}

export async function signInWithMagicLink(_email: string): Promise<void> {
  return Promise.reject(new Error('Accounts are disabled in this build.'));
}

export async function completeSignIn(): Promise<Session | null> {
  return null;
}

export async function getSession(): Promise<Session | null> {
  return null;
}

export async function getUser(): Promise<User | null> {
  return null;
}

export async function getProfile(): Promise<Profile | null> {
  return null;
}

export async function updateProfile(_patch: Partial<Profile>): Promise<Profile | null> {
  return null;
}

export async function signOut(): Promise<void> {
  return;
}

/**
 * ⚠️ THE STUB'S SHAPE IS NOT COSMETIC — A MISSING EXPORT FAILS THE BUILD.
 *
 * Adding `deleteOwnAccount()` to the real module and not to this one broke the
 * accounts-OFF build outright (`[MISSING_EXPORT] "deleteOwnAccount" is not
 * exported by "src/lib/supabase.disabled.ts"`), because the alias replaces the
 * module for every importer including `/compte/`'s script — which is still
 * BUILT in a disabled build even though the page is never emitted. Anything
 * exported from `supabase.ts` and imported by a page script belongs here too.
 *
 * ⚠️ AND IT REPORTS FAILURE RATHER THAN SUCCESS. Every other stub here returns
 * an empty answer, because "no session" is the truth in a disabled build. This
 * one must not: `{ ok: true }` would mean "your account was deleted" to a
 * caller that reached it, and the caller would then sign the reader out and
 * send them home believing their data was gone.
 */
export async function deleteOwnAccount(): Promise<{ ok: false; message: string }> {
  return { ok: false, message: 'Accounts are disabled in this build.' };
}

/**
 * ⚠️ HERE FOR THE SAME REASON AS `deleteOwnAccount()` ABOVE — `/bienvenue/`'s
 * script imports it, and that script is still BUILT in a disabled build even
 * though the route emits nothing. A missing export fails the whole build with
 * `[MISSING_EXPORT]`.
 *
 * Unlike the deletion stub this one may safely report failure without misleading
 * anybody: nothing is claimed to have happened, and the only consequence of
 * `ok: false` is a screen that is never reachable in this build anyway.
 */
export async function markOnboarded(_shape?: string | null): Promise<{ ok: boolean }> {
  return { ok: false };
}

/**
 * ⚠️ PRESENT BECAUSE THE ALIAS REPLACES THE WHOLE MODULE. `LoginPage`'s script
 * imports this name, so its absence fails the accounts-OFF build outright —
 * see the note above `deleteOwnAccount`. It reports failure rather than
 * pretending to redirect: a stub that resolved as if sign-in had started would
 * leave the reader on a page waiting for a navigation that never comes.
 */
export async function signInWithGoogle(
  _redirectTo: string,
): Promise<{ ok: false; message: string }> {
  return { ok: false, message: 'accounts are disabled in this build' };
}
