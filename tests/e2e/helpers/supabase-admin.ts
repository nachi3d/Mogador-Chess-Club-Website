/**
 * Admin-API helpers for the e2e suite.
 *
 * ⚠️ Uses the SERVICE ROLE key, which bypasses RLS entirely. Everything here is
 * test scaffolding and must never be imported by anything under `src/`.
 *
 * ⚠️ Credentials come from `loadE2EEnv()` ONLY — never `process.env`. That is
 * what makes the interlock in `env.ts` total: there is no second path to a
 * project, so a developer's exported production credentials cannot leak in.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadE2EEnv } from '../env';

let admin: SupabaseClient | null = null;

export function adminClient(): SupabaseClient {
  if (admin) return admin;
  const env = loadE2EEnv();
  if (!env || !env.serviceRoleKey) {
    throw new Error('supabase-admin: no .env.test credentials — specs must skip, not call this.');
  }
  admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return admin;
}

/** An address inside the purge pattern. Unique per call. */
export function e2eEmail(label: string): string {
  const env = loadE2EEnv();
  const domain = env?.emailDomain ?? 'mcc-e2e.test';
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return `e2e-${label}-${unique}@${domain}`;
}

/**
 * Create a confirmed user directly.
 *
 * ⚠️ THE KNOWN GAP, STATED PLAINLY: this does NOT exercise real email delivery.
 * The magic link is never sent, never received, and never clicked. What is
 * tested is everything after the link resolves — the trigger, the profile, the
 * session, the header, RLS. What is NOT tested is that Supabase's mailer
 * actually delivers, that the template renders, and that the link in a real
 * inbox works.
 *
 * That gap is covered by a MANUAL check in `docs/MANUAL-TESTS.md` (a real magic
 * link to a real inbox before any release), and it is written down here rather
 * than papered over, because a suite that appears to cover email delivery and
 * does not is worse than one that admits it.
 */
export async function createConfirmedUser(opts: {
  email: string;
  displayName?: string;
  locale?: string;
  role?: 'admin' | 'prof' | 'eleve';
}): Promise<{ id: string; email: string }> {
  const sb = adminClient();
  const { data, error } = await sb.auth.admin.createUser({
    email: opts.email,
    email_confirm: true,
    user_metadata: {
      ...(opts.displayName ? { display_name: opts.displayName } : {}),
      ...(opts.locale ? { locale: opts.locale } : {}),
    },
  });
  if (error || !data.user) throw new Error(`createConfirmedUser: ${error?.message ?? 'no user'}`);

  /* Roles are never client-settable; the seed/admin path is SQL. Here we use
     the service role deliberately, which is the same escape hatch documented in
     docs/ADMIN.md. */
  if (opts.role && opts.role !== 'eleve') {
    /* Via the sanctioned RPC: the guard trigger refuses a direct role UPDATE
       even for service_role, because auth.uid() is NULL. See migration 0002. */
    const { error: roleError } = await sb.rpc('admin_set_role', {
      target_id: data.user.id,
      new_role: opts.role,
    });
    if (roleError) throw new Error(`createConfirmedUser role: ${roleError.message}`);
  }

  return { id: data.user.id, email: opts.email };
}

/**
 * Mint a session for a user without email, and hand back the tokens.
 *
 * `generateLink` gives us what the email WOULD have contained. The spec then
 * puts those tokens into the page the same way the implicit flow does — via the
 * URL fragment — so the code path under test is the real one even though the
 * delivery is not.
 */
/**
 * ⚠️ `redirectTo` is NOT optional in practice.
 *
 * Without it, Supabase stamps the link with the project's **Site URL**, which on
 * a fresh project is `http://localhost:3000` — so the browser follows the verify
 * link and lands somewhere that is not the site under test, and the spec times
 * out waiting for `/compte/` with nothing explaining why.
 *
 * Passing it explicitly keeps the test on the real path: the browser follows the
 * genuine `/auth/v1/verify` link, Supabase redirects to our callback, and the
 * tokens arrive in the URL fragment exactly as they would from a real inbox.
 * (The target must be in the project's redirect allow-list; verified honoured
 * for `http://localhost:4321/auth/callback`.)
 */
export async function magicLinkFor(
  email: string,
  redirectTo = 'http://localhost:4321/auth/callback',
): Promise<string> {
  const sb = adminClient();
  const { data, error } = await sb.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo },
  });
  if (error || !data.properties) throw new Error(`magicLinkFor: ${error?.message ?? 'no link'}`);
  return data.properties.action_link;
}

export async function deleteUser(id: string): Promise<void> {
  try {
    await adminClient().auth.admin.deleteUser(id);
  } catch {
    /* Best effort; the purge is the backstop. */
  }
}
