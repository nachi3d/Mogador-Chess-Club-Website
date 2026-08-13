#!/usr/bin/env node
/**
 * Mint a magic link for a TEST-project account, without sending any email.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ THIS REFUSES TO RUN AGAINST ANYTHING BUT THE TEST PROJECT.
 *
 * Same interlock as `seed-test.mjs` and the e2e suite, reading the same
 * `.env.test`, and it FAILS CLOSED. A link minted against production would be a
 * working session for a real person's account, handed out on a terminal.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHY THIS EXISTS. The seeded accounts live on `@mcc-seed.test`, a domain with
 * no inbox anywhere, so the normal `/connexion/` form can never sign you in as
 * one of them. `generateLink` hands back exactly what the email WOULD have
 * carried, so the browser then walks the REAL path — Supabase `/auth/v1/verify`,
 * redirect to `/auth/callback`, tokens in the fragment, the client exchanging
 * them. Only the delivery is skipped, never the flow. Same trick as
 * `tests/e2e/helpers/supabase-admin.ts`.
 *
 * ⚠️ THE LINK IS SINGLE-USE AND SHORT-LIVED. Following it consumes the token;
 * re-run this for the next sign-in rather than reusing a link from scrollback.
 *
 * ⚠️ `redirectTo` MUST BE IN THE PROJECT'S REDIRECT ALLOW-LIST, or Supabase
 * quietly substitutes the project's Site URL and the browser lands somewhere
 * that is not the site you are testing, with nothing explaining why.
 * `http://localhost:4321/auth/callback` is already allowed on the test project.
 *
 * Usage:
 *   node supabase/seed/magic-link.mjs seed-prof@mcc-seed.test
 *   node supabase/seed/magic-link.mjs seed-prof@mcc-seed.test http://192.168.1.20:4321/auth/callback
 */

import { createClient } from '@supabase/supabase-js';
import { loadE2EEnv, assertNotProduction } from '../../tests/e2e/env.ts';

/* Aborts the process on anything ambiguous. Nothing below runs otherwise. */
assertNotProduction();

const env = loadE2EEnv();
if (!env || !env.serviceRoleKey) {
  console.error('magic-link: .env.test is missing the service role key. Refusing.');
  process.exit(1);
}

/* A second, explicit refusal, exactly as the seed script carries one: a script
   that mints a session deserves belt and braces. */
if (env.testRef === env.productionRef) {
  console.error('magic-link: resolved project IS production. Refusing.');
  process.exit(1);
}

const email = process.argv[2];
const redirectTo = process.argv[3] ?? 'http://localhost:4321/auth/callback';

if (!email) {
  console.error('usage: node supabase/seed/magic-link.mjs <email> [redirectTo]');
  console.error('');
  console.error('  seeded accounts (node supabase/seed/seed-test.mjs):');
  console.error('    seed-admin@mcc-seed.test     admin');
  console.error('    seed-prof@mcc-seed.test      prof');
  console.error('    seed-eleve-1@mcc-seed.test   parent — holds TWO children (Sara, Yassine)');
  console.error('    seed-eleve-2@mcc-seed.test   parent — holds ONE child (Omar)');
  process.exit(1);
}

const sb = createClient(env.supabaseUrl, env.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await sb.auth.admin.generateLink({
  type: 'magiclink',
  email,
  options: { redirectTo },
});

if (error || !data?.properties) {
  console.error(`magic-link: ${error?.message ?? 'no link returned'}`);
  process.exit(1);
}

console.log(`project  ${env.testRef}  (production is ${env.productionRef})`);
console.log(`account  ${email}`);
console.log(`lands on ${redirectTo}`);
console.log('');
console.log(data.properties.action_link);
