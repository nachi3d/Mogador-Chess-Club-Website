#!/usr/bin/env node
/**
 * Does a Google sign-in LINK to an existing magic-link account, or fork a
 * second one?
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THE QUESTION THIS ANSWERS CANNOT BE ANSWERED BY READING DOCUMENTATION,
 * WHICH IS WHY IT IS A SCRIPT.
 *
 * Supabase links a new provider identity onto an EXISTING user when the
 * provider returns an email that matches and the account's address is
 * confirmed. There is no dashboard toggle for it — the behaviour hangs off
 * "Confirm email", which is a different setting in a different place. So the
 * only honest way to know what a project does is to make it happen and look.
 *
 * ⚠️ IT INSPECTS; IT DOES NOT SIMULATE. Nothing here can complete a real
 * Google consent screen, so the Google half is done by a HUMAN in a browser
 * and this reports what the database ended up holding. A script that faked the
 * OAuth half would be testing its own fake.
 *
 * ⚠️ TEST PROJECT ONLY. It reads `auth.users` with the service role and can
 * DELETE users by address, so it goes through the same interlock as the e2e
 * suite and FAILS CLOSED. See `tests/e2e/env.ts`.
 * ═════════════════════════════════════════════════════════════════════════
 *
 *   node scripts/check-identity-linking.mjs <email>            inspect
 *   node scripts/check-identity-linking.mjs <email> --seed     create the
 *                                                             email account
 *   node scripts/check-identity-linking.mjs <email> --cleanup  remove it
 *
 * The intended run, end to end:
 *
 *   1. --seed     creates a confirmed EMAIL account for the address
 *   2. (browser)  sign in with Google, using THE SAME address
 *   3. (no flag)  reports LINKED or FORKED
 *   4. --cleanup  removes whatever was created
 */
import { loadE2EEnv, assertNotProduction } from '../tests/e2e/env.ts';

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

/* ⚠️ BEFORE ANYTHING ELSE, AND IT FAILS CLOSED. This script deletes users by
   address; pointed at production that is somebody's real account. */
assertNotProduction();

const env = loadE2EEnv();
if (!env?.supabaseUrl || !env?.serviceRoleKey) {
  console.error(
    red('\n  check-identity-linking: .env.test has no TEST project URL or service role.\n') +
      '  ⚠️ Copy .env.test.example (NOT .env.example) to .env.test.\n',
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith('--'));
const flags = args.filter((a) => a.startsWith('--'));

/* ⚠️ AN UNRECOGNISED FLAG FAILS CLOSED — the rule `db-push.mjs` learned the
   hard way, where a silently-discarded argument made `--dry-run` apply. */
for (const f of flags) {
  if (f !== '--seed' && f !== '--cleanup') {
    console.error(red(`\n  unknown flag ${f}\n`));
    process.exit(1);
  }
}

if (!email) {
  console.error(
    red('\n  usage: node scripts/check-identity-linking.mjs <email> [--seed|--cleanup]\n'),
  );
  process.exit(1);
}

const base = env.supabaseUrl.replace(/\/$/, '');
const headers = {
  apikey: env.serviceRoleKey,
  Authorization: `Bearer ${env.serviceRoleKey}`,
  'Content-Type': 'application/json',
};

/**
 * Every auth user carrying this address, with the identities behind each.
 *
 * ⚠️⚠️ THE LIST ENDPOINT RETURNS `identities: []` FOR EVERY USER, ALWAYS, AND
 * THAT SILENTLY BROKE THE FIRST VERSION OF THIS SCRIPT.
 *
 * Measured against the test project, for one user created WITH a password —
 * which unambiguously has an `email` identity:
 *
 *     POST /admin/users      (create response)  -> ["email"]
 *     GET  /admin/users/{id} (one user)         -> ["email"]
 *     GET  /admin/users      (the LIST)         -> []
 *
 * So a verdict computed from the list could never have said LINKED, and would
 * have called a correctly-linked account FORKED — the exact wrong answer, on
 * the one question this script exists to answer, while looking like it worked.
 *
 * The list is therefore used only to FIND candidates by address; every one is
 * then hydrated by id, which is the only response that carries identities.
 */
async function usersFor(address) {
  const candidates = [];
  /* Paginated deliberately rather than trusting a filter parameter: the admin
     list endpoint's filtering has changed shape between GoTrue versions, and a
     filter that silently matched nothing would report "no account" — which is
     the same answer as "not linked", and those two must never be confused. */
  for (let page = 1; page <= 20; page += 1) {
    const r = await fetch(`${base}/auth/v1/admin/users?page=${page}&per_page=200`, { headers });
    if (!r.ok) throw new Error(`admin/users ${r.status}: ${await r.text()}`);
    const body = await r.json();
    const users = body.users ?? [];
    candidates.push(...users.filter((u) => (u.email ?? '').toLowerCase() === address.toLowerCase()));
    if (users.length < 200) break;
  }

  const hydrated = [];
  for (const c of candidates) {
    const r = await fetch(`${base}/auth/v1/admin/users/${c.id}`, { headers });
    if (!r.ok) throw new Error(`admin/users/${c.id} ${r.status}: ${await r.text()}`);
    hydrated.push(await r.json());
  }
  return hydrated;
}

console.log(`\n${bold('▸ check-identity-linking')} ${dim(`— ${email} on TEST "${env.testRef}"`)}\n`);

if (flags.includes('--cleanup')) {
  const users = await usersFor(email);
  for (const u of users) {
    const r = await fetch(`${base}/auth/v1/admin/users/${u.id}`, { method: 'DELETE', headers });
    console.log(r.ok ? `  removed ${u.id}` : red(`  could not remove ${u.id}: ${r.status}`));
  }
  console.log(dim(`\n  ${users.length} user(s) removed.\n`));
  process.exit(0);
}

if (flags.includes('--seed')) {
  const existing = await usersFor(email);
  if (existing.length > 0) {
    console.log(yellow(`  ! ${existing.length} user(s) already hold it — not seeding again.`));
  } else {
    /* email_confirm: true, because the WHOLE mechanism under test hangs off a
       confirmed address. Seeding an unconfirmed one would test the wrong thing
       and would look like "linking is broken". */
    const r = await fetch(`${base}/auth/v1/admin/users`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ email, email_confirm: true }),
    });
    if (!r.ok) {
      console.error(red(`\n  could not seed: ${r.status} ${await r.text()}\n`));
      process.exit(1);
    }
    console.log(green('  ✓ seeded a confirmed EMAIL account for this address.'));
  }
  console.log(
    yellow(
      '\n  ⚠️ A SEEDED USER HAS NO `email` IDENTITY UNTIL IT ACTUALLY SIGNS IN.\n' +
        '     Measured: admin-create with only an address yields identities [].\n' +
        '     That is NOT the same starting state as a real magic-link account,\n' +
        '     so --seed is a convenience for checking the plumbing, not the\n' +
        '     faithful test.',
    ),
  );
  console.log(
    dim(
      '\n  THE FAITHFUL RUN, in a browser against the test project:\n' +
        '    1. sign in with the MAGIC LINK at /connexion/, using this address\n' +
        '    2. sign out\n' +
        '    3. sign in with GOOGLE, using the same address\n' +
        '    4. run this again with no flag\n',
    ),
  );
  process.exit(0);
}

/* ── Report ─────────────────────────────────────────────────────────────── */
const users = await usersFor(email);

if (users.length === 0) {
  console.log(yellow('  no auth user holds this address.'));
  console.log(dim('  Run with --seed first, or check the address.\n'));
  process.exit(0);
}

for (const u of users) {
  const providers = (u.identities ?? []).map((i) => i.provider);
  console.log(`  user ${u.id}`);
  console.log(`    created    ${u.created_at}`);
  console.log(`    confirmed  ${u.email_confirmed_at ?? '(not confirmed)'}`);
  console.log(`    identities ${providers.length > 0 ? providers.join(' + ') : '(none)'}`);
  console.log('');
}

const providersAcross = users.flatMap((u) => (u.identities ?? []).map((i) => i.provider));
const hasEmail = providersAcross.includes('email');
const hasGoogle = providersAcross.includes('google');

if (users.length === 1 && hasEmail && hasGoogle) {
  console.log(green(bold('  ✓ LINKED — one auth user carrying both identities.')));
  console.log(dim('    Magic link then Google keeps ONE account.\n'));
  process.exit(0);
}

if (users.length > 1) {
  console.log(red(bold(`  ✗ FORKED — ${users.length} separate auth users hold this address.`)));
  console.log(
    '    Google did NOT link onto the existing account. The reader now has two,\n' +
      '    and the progress on the first is invisible from the second.\n' +
      '    ⚠️ Check "Confirm email" is ON: automatic linking hangs off it, and\n' +
      '       there is no separate toggle for linking itself.\n',
  );
  process.exit(1);
}

console.log(
  yellow(
    `  … only one identity so far (${providersAcross.join(' + ') || 'none'}).\n` +
      '    Do the other half of the sign-in, then run this again.\n',
  ),
);
