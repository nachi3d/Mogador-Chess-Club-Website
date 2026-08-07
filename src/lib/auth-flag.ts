/**
 * The "this browser has signed in before" flag — and NOTHING else.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ THIS MODULE MUST NEVER IMPORT `supabase.ts`, OR ANYTHING THAT DOES.
 *
 * It exists precisely so the header can ask "should I show an account button?"
 * without pulling `@supabase/supabase-js` (~30 KB gzip) into the shared page
 * chunk. One static import from here to there and Vite hoists the whole client
 * into every page on the site — including a lesson page read by a guest who has
 * never signed in, which is the exact thing the guest zero-request rule forbids.
 *
 * If you need a session, ask `supabase.ts`. If you need to know whether it is
 * worth asking, ask here.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * This is the THIRD module allowed to touch `localStorage`, after
 * `progress.ts` and `theme.ts`, and it follows their rules exactly: the version
 * is in the key, every access is guarded, and failure is silent. A reader whose
 * storage is unavailable simply sees the signed-out header — they can still sign
 * in, and there is nothing they could do about it, so we do not tell them.
 *
 * The flag is a HINT, never an authorisation. It says "it is worth loading the
 * client and asking". The session itself is the only thing that decides whether
 * anyone is signed in, and RLS is the only thing that decides what they may see.
 * A hand-edited `true` here buys exactly one wasted module fetch.
 */

/** Version in the key, as with `mcc:progress:v1` and `mcc:theme:v1`. */
export const AUTH_FLAG_KEY = 'mcc:auth:v1';

/**
 * ⚠️ Duplicated verbatim in the header's inline script in `Header.astro`.
 *
 * That duplication is deliberate and follows the precedent set by the theme
 * head script, which duplicates `applyTheme()` for the same reason: importing a
 * module would reintroduce the very request this exists to avoid. The two must
 * be kept in step by hand, and `tests/e2e/auth.spec.ts` asserts the header
 * reacts to this exact key.
 */
export function hasAuthFlag(): boolean {
  try {
    return window.localStorage.getItem(AUTH_FLAG_KEY) === '1';
  } catch {
    /* Safari private mode, a disabled-storage context, an embedded frame. */
    return false;
  }
}

export function setAuthFlag(): void {
  try {
    window.localStorage.setItem(AUTH_FLAG_KEY, '1');
  } catch {
    /* A reader whose storage rejects this still has a working session for the
       lifetime of the tab; they just pay a module fetch on the next page. */
  }
}

export function clearAuthFlag(): void {
  try {
    window.localStorage.removeItem(AUTH_FLAG_KEY);
  } catch {
    /* Nothing to do. The flag is a hint; a stale one costs one fetch. */
  }
}
