/**
 * The Supabase client — the ONLY file that imports `@supabase/supabase-js`.
 *
 * Same containment trick as `BoardSurface.tsx` for Chessground and
 * `progress.ts` for `localStorage`: everything else talks to the functions
 * below, so swapping the backend is a rewrite of this file and nothing else.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ THE GUEST ZERO-REQUEST RULE WINS EVERY CONFLICT.
 *
 * A visitor reading a lesson, a trap or an exercise must cause **zero**
 * requests to any Supabase origin, and must not even download this module.
 * That is why:
 *
 *   1. The client is a LAZY SINGLETON. Importing this file creates nothing;
 *      the client is constructed on first `getSupabase()`.
 *   2. Every caller reaches this module through `await import()`, never a
 *      static import, so Vite splits it into its own chunk that only an auth
 *      page or a signed-in header ever fetches.
 *   3. The header decides whether to load it by reading `auth-flag.ts`, which
 *      deliberately knows nothing about Supabase.
 *
 * `tests/e2e/auth.spec.ts` asserts this against the network log on content
 * pages. If a static import ever creeps in, that spec is what says so.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ⚠️ ALL SECURITY IS RLS. This is a static site: the anon key ships to every
 * browser and is *meant* to. Nothing here is a security boundary — the client
 * is an untrusted caller by design, and every rule that matters lives in
 * Postgres policies (see `supabase/migrations/`). Never add a check here and
 * treat it as protection; it is UI convenience at best.
 */

import type { Session, SupabaseClient, User } from '@supabase/supabase-js';
/* A plain build-time constant with no imports of its own — it cannot drag
   anything into a bundle, which is why the flag lives in its own module rather
   than being read inline here. */
import { AUTH_ENABLED } from '@config/auth';
import { clearAuthFlag, setAuthFlag } from './auth-flag';

/** Roles, mirrored from the CHECK constraint in migration 0001. */
export type Role = 'admin' | 'prof' | 'eleve';

export interface Profile {
  readonly id: string;
  readonly role: Role;
  readonly display_name: string | null;
  readonly locale: string;
  readonly guardian_phone: string | null;
  /**
   * When the first-run onboarding was completed OR dismissed; null means the
   * parent has never been guided.
   *
   * ⚠️ SERVER-SIDE, NOT `localStorage`, AND THAT IS THE POINT. "Shown once" is a
   * claim about a person, not a browser: kept on the device, a parent who signs
   * up on a phone would be walked through naming an already-named child the
   * first time they open the family tablet. See migration 0009.
   */
  readonly onboarded_at: string | null;
  /**
   * What the holder answered at first sign-in: `self` | `children` | `both`.
   * Null means never answered — a skipped welcome screen — and it must not be
   * guessed at. See `src/lib/account-shape.ts` and migration 0010.
   */
  readonly account_shape: string | null;
}

let client: SupabaseClient | null = null;

/**
 * The project ref, or empty strings when accounts are disabled at build time.
 *
 * ⚠️ THIS IS WHAT KEEPS THE PROJECT REF OUT OF THE BUNDLE, and it is not
 * belt-and-braces over the route gating — it is the second half of the same
 * guarantee. Gating the routes stops the PAGES being emitted; this stops the
 * URL being emitted, in case a chunk survives as an orphan for a reason nobody
 * predicted (a stray import, a future integration, an Astro change).
 *
 * `AUTH_ENABLED` folds to a literal `false` at build time, so Rollup drops the
 * whole branch and with it every `import.meta.env.PUBLIC_SUPABASE_*` read.
 * `tests/e2e/auth-disabled.spec.ts` greps the built output to prove it. Do not
 * "simplify" this back into a direct read.
 */
function env(): { url: string; anonKey: string } {
  if (!AUTH_ENABLED) return { url: '', anonKey: '' };
  return {
    url: import.meta.env.PUBLIC_SUPABASE_URL ?? '',
    anonKey: import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? '',
  };
}

/** Env, read at build time by Astro. Missing values are a configuration error. */
function config(): { url: string; anonKey: string } {
  const { url, anonKey } = env();
  if (!url || !anonKey) {
    throw new Error(
      'Supabase is not configured: PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY ' +
        'must be set at build time. See CLAUDE.md → Deployment.',
    );
  }
  return { url, anonKey };
}

/** True when the build carries Supabase config at all. Callers degrade quietly. */
export function isConfigured(): boolean {
  const { url, anonKey } = env();
  return Boolean(url && anonKey);
}

/**
 * The lazy singleton. Constructing a client makes no network request — it only
 * reads persisted session state — so this is safe to call as soon as a page
 * genuinely has an auth concern.
 */
export async function getSupabase(): Promise<SupabaseClient> {
  if (client) return client;
  const { createClient } = await import('@supabase/supabase-js');
  const { url, anonKey } = config();

  client = createClient(url, anonKey, {
    auth: {
      /**
       * ⚠️ IMPLICIT, NOT PKCE — and this is a deliberate choice for a magic
       * link on a static host, not a leftover default.
       *
       * PKCE keeps a `code_verifier` in the localStorage of the browser that
       * REQUESTED the link. Email is routinely opened somewhere else: a phone
       * while the request came from a laptop, or a mail app's in-app browser.
       * With PKCE every one of those fails with "invalid request" and the
       * reader has no idea why.
       *
       * Implicit puts the tokens in the URL **fragment**. The fragment is never
       * sent to a server, which is exactly why this works with no backend at
       * all — `detectSessionInUrl` parses it entirely in the browser.
       *
       * The cost is that tokens briefly exist in the address bar, so
       * `completeSignIn()` scrubs the fragment as soon as it is consumed.
       */
      flowType: 'implicit',
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return client;
}

/** The current session, or null. Never throws. */
export async function getSession(): Promise<Session | null> {
  try {
    const sb = await getSupabase();
    const { data } = await sb.auth.getSession();
    return data.session ?? null;
  } catch {
    return null;
  }
}

export async function getUser(): Promise<User | null> {
  return (await getSession())?.user ?? null;
}

/**
 * Send a magic link. `redirectTo` must be an absolute URL that is listed in the
 * project's allowed redirect URLs, or Supabase silently falls back to SITE_URL.
 */
export async function signInWithMagicLink(
  email: string,
  redirectTo: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const sb = await getSupabase();
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Start a Google sign-in.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ IT REDIRECTS THE WHOLE TAB AND DOES NOT RETURN. Everything after the
 * call is unreachable on the success path, which is why this resolves only to
 * report a FAILURE — a caller that awaits it expecting a session will wait
 * forever, because the session arrives on the next page load through
 * `completeSignIn()`.
 *
 * ⚠️ SAME IMPLICIT FLOW AS THE MAGIC LINK, AND FOR A DIFFERENT REASON.
 * The magic link is implicit because email is routinely opened in another
 * browser, so a PKCE verifier stranded in the requesting one would break it.
 * OAuth comes back to the same browser, so PKCE would work here — but the
 * client is configured once, for both, and `detectSessionInUrl` already
 * parses the fragment on `/auth/callback/`. Two flows in one client is a
 * second code path to keep correct for no gain a reader can perceive.
 *
 * ⚠️ THE PROVIDER MUST BE CONFIGURED IN SUPABASE **AND** IN GOOGLE CLOUD, and
 * nothing in this repository can check either. See `GOOGLE_AUTH_ENABLED` in
 * `src/config/auth.ts` for why the button is behind its own flag.
 *
 * `redirectTo` must be an absolute URL listed in the project's allowed
 * redirect URLs, exactly as for the magic link, or Supabase silently falls
 * back to SITE_URL and the reader lands on the wrong locale.
 * ═════════════════════════════════════════════════════════════════════════
 */
export async function signInWithGoogle(
  redirectTo: string,
): Promise<{ ok: false; message: string }> {
  try {
    const sb = await getSupabase();
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    /* Reached only when the redirect could not be started at all. */
    return { ok: false, message: error?.message ?? 'redirect did not start' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Finish a magic-link landing. Supabase has already parsed the fragment by the
 * time this resolves (`detectSessionInUrl`); this records the flag and removes
 * the tokens from the address bar.
 */
export async function completeSignIn(): Promise<Session | null> {
  const session = await getSession();
  if (session) setAuthFlag();

  /* Scrub the fragment either way. On failure it holds an error description
     that is no more useful in the URL than in the page. */
  try {
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  } catch {
    /* replaceState can throw in exotic embedding. Not worth failing sign-in. */
  }
  return session;
}

/**
 * Sign out and leave nothing behind.
 *
 * The flag is cleared FIRST and unconditionally: if `signOut()` fails (offline,
 * an already-expired session), the reader still asked to be signed out, and a
 * header that keeps showing an account button after that is a lie. Supabase's
 * own storage is cleared by `signOut()`; the flag is ours.
 */
export async function signOut(): Promise<void> {
  clearAuthFlag();
  try {
    const sb = await getSupabase();
    await sb.auth.signOut();
  } catch {
    /* Nothing recoverable, and the flag is already gone. */
  }
}

/**
 * Erase the signed-in account and everything hanging off it.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THE FUNCTION TAKES NO TARGET, AND THAT IS THE WHOLE SECURITY DESIGN.
 * `delete_own_account()` reads `auth.uid()` and deletes that row; there is no
 * id to pass and no id to get wrong. See migration 0007 — nothing here is a
 * boundary, exactly as nothing else in this file is.
 *
 * ⚠️ THE LOCAL SIDE IS CLEARED EVEN IF THE CALL FAILS IS **WRONG** HERE, and
 * it is the opposite of `signOut()` above. Sign-out clears the flag first
 * because the reader asked to be signed out either way. Deletion must not
 * touch local state until the server has confirmed: wiping a device's progress
 * for a delete that did not happen destroys data the account still holds.
 *
 * The order is therefore: delete server-side → confirm → then sign out, which
 * clears the session and the flag. Anything device-local (progress, the child
 * choice, the theme) is deliberately left alone — it is the reader's own copy
 * on their own machine, it is what a guest would have, and erasing it is not
 * what "delete my account" asks for. The notice says so in those words.
 * ═════════════════════════════════════════════════════════════════════════
 */
export async function deleteOwnAccount(): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const sb = await getSupabase();
    /* Re-read the user rather than trusting a cached session: this is the one
       call on the site that cannot be retried into existence afterwards. */
    const { data: userData } = await sb.auth.getUser();
    if (!userData.user?.id) return { ok: false, message: 'not signed in' };

    const { error } = await sb.rpc('delete_own_account');
    if (error) return { ok: false, message: error.message };

    /* The session now points at a row that no longer exists. Signing out is
       housekeeping, not the deletion — so a failure here is not reported as a
       failed deletion, which would be a lie in the direction that matters. */
    await signOut();
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * The column list this build wants, newest first, then each earlier schema it
 * still knows how to read.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THIS LADDER EXISTS BECAUSE AN EXPLICIT SELECT MAKES EVERY PROFILE READ
 * DEPEND ON A MIGRATION HAVING REACHED PRODUCTION, AND THAT HAS ALREADY BEEN
 * WRITTEN DOWN AS A HAZARD ONCE.
 *
 * PostgREST answers a select naming a column the database does not have with a
 * `42703`, which `getProfile()` turns into `null`. Null is indistinguishable
 * from "not signed in" to every caller, so a single unapplied migration does not
 * degrade the account — it silently empties it: no name, no role, no staff link,
 * and `/auth/callback/` reading `onboarded_at === null ? … : false` sends every
 * first sign-in past the welcome screen. CLAUDE.md warns about exactly this for
 * 0009 under "Turn accounts back on"; 0010 adds a second column to the same
 * fragile line, so the line stops being fragile instead.
 *
 * ⚠️ IT DEGRADES, IT DOES NOT REPAIR. A column that is not there comes back as
 * `null`, which is the same value a fresh account carries — so an older database
 * reads as "never answered", the neutral state, and every rule downstream
 * already handles it. Nothing here writes, nothing infers, and a genuinely
 * absent row still returns null on the last rung.
 *
 * ⚠️ THE COST IS ONE EXTRA ROUND TRIP ON A MISCONFIGURED DEPLOYMENT ONLY. A
 * correct database answers the first rung and never reaches the rest.
 * ═════════════════════════════════════════════════════════════════════════
 */
const PROFILE_COLUMNS: readonly string[] = [
  'id, role, display_name, locale, guardian_phone, onboarded_at, account_shape',
  /* Pre-0010 — before the welcome screen asked who the account is for. */
  'id, role, display_name, locale, guardian_phone, onboarded_at',
  /* Pre-0009 — before onboarding existed at all. */
  'id, role, display_name, locale, guardian_phone',
] as const;

/** The signed-in reader's own profile row, or null. RLS does the deciding. */
export async function getProfile(): Promise<Profile | null> {
  try {
    const sb = await getSupabase();
    const { data: userData } = await sb.auth.getUser();
    const id = userData.user?.id;
    if (!id) return null;

    for (const columns of PROFILE_COLUMNS) {
      const { data, error } = await sb.from('profiles').select(columns).eq('id', id).single();
      if (!error && data) {
        /* Missing columns come back absent, not null, so they are defaulted
           here rather than left `undefined` for a caller to trip over. */
        const row = data as unknown as Record<string, unknown>;
        return {
          ...(row as unknown as Profile),
          onboarded_at: (row['onboarded_at'] as string | null | undefined) ?? null,
          account_shape: (row['account_shape'] as string | null | undefined) ?? null,
        };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Record that the parent has been guided — completed or dismissed, the same
 * write either way.
 *
 * ⚠️ IT DOES NOT RECORD WHICH, DELIBERATELY. Storing "they skipped" invites a
 * later session to re-ask them, which is the exact behaviour the column exists
 * to prevent. A parent who dismissed the screen made a choice; the family
 * section on `/compte/` does the whole job without it.
 *
 * ⚠️ FAILURE IS NOT SURFACED TO THE READER, AND MUST NOT BE. The worst outcome
 * of a lost write is being offered the welcome screen once more; telling a
 * parent their onboarding "failed" would be alarming about nothing. The caller
 * navigates on regardless.
 */
export async function markOnboarded(shape?: string | null): Promise<{ ok: boolean }> {
  try {
    const sb = await getSupabase();
    const { data: userData } = await sb.auth.getUser();
    const id = userData.user?.id;
    if (!id) return { ok: false };

    const patch: Record<string, unknown> = { onboarded_at: new Date().toISOString() };
    /* ⚠️ ONLY WRITTEN WHEN THERE IS AN ANSWER. Skipping records the visit and
       leaves `account_shape` null, which is the honest "never told us" state
       every downstream rule already handles — see `account-shape.ts`. Writing a
       default here would manufacture a claim the reader never made. */
    if (shape) patch['account_shape'] = shape;

    const { error } = await sb.from('profiles').update(patch).eq('id', id);
    if (!error) return { ok: true };

    /* ⚠️ A DATABASE WITHOUT 0010 REJECTS THE WHOLE STATEMENT, INCLUDING THE
       COLUMN IT DOES HAVE. Retrying without the shape keeps "shown once" true
       on an older schema rather than re-offering the welcome screen forever —
       the same degrade-do-not-repair posture as `PROFILE_COLUMNS`. */
    if (shape) {
      const { error: retry } = await sb
        .from('profiles')
        .update({ onboarded_at: patch['onboarded_at'] })
        .eq('id', id);
      return { ok: !retry };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

/**
 * Update the two fields a reader owns.
 *
 * ⚠️ `role` is deliberately absent, and leaving it out here is NOT what makes
 * it safe — a hand-written fetch could send it regardless. It is safe because
 * `authenticated` holds column-level UPDATE privileges on `display_name` and
 * `locale` only, with a trigger behind that as a second line. See migration
 * 0001 and `docs/ADMIN.md`.
 */
export async function updateProfile(patch: {
  display_name?: string;
  locale?: string;
}): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const sb = await getSupabase();
    const { data: userData } = await sb.auth.getUser();
    const id = userData.user?.id;
    if (!id) return { ok: false, message: 'not signed in' };

    const { error } = await sb.from('profiles').update(patch).eq('id', id);
    if (error) return { ok: false, message: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
