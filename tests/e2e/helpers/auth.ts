/**
 * Small auth test helpers.
 *
 * ⚠️ `AUTH_FLAG` is duplicated from `src/lib/auth-flag.ts` and from the inline
 * script in `AccountButton.astro`. That is three copies of one string, and it is
 * deliberate: the production copies must not import each other (doing so would
 * pull the Supabase client into every page), so the spec pins the contract
 * instead. If someone changes the key in one place, the header spec fails.
 */
export const AUTH_FLAG = 'mcc:auth:v1';

/**
 * An anon-key client signed in AS a given user — i.e. exactly the untrusted
 * caller a browser is.
 *
 * This is the right shape for testing RLS: the service-role client bypasses
 * every policy, so proving something with it proves nothing. Here the only
 * credentials are the public anon key plus a real user session, which is what
 * anyone with devtools has.
 */
export async function anonClientAsUser(email: string) {
  const { createClient } = await import('@supabase/supabase-js');
  const { adminClient } = await import('./supabase-admin');
  const { loadE2EEnv } = await import('../env');

  const env = loadE2EEnv();
  if (!env) throw new Error('anonClientAsUser: no .env.test');

  /* generateLink hands back the token_hash the email would have carried;
     verifyOtp turns it into a real session without any mail delivery. */
  const { data, error } = await adminClient().auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (error || !data.properties) {
    throw new Error(`anonClientAsUser: ${error?.message ?? 'no link properties'}`);
  }

  const sb = createClient(env.supabaseUrl, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: verifyError } = await sb.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: 'magiclink',
  });
  if (verifyError) throw new Error(`anonClientAsUser verify: ${verifyError.message}`);

  return sb;
}
