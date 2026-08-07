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
