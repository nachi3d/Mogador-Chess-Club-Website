#!/usr/bin/env node
/**
 * Seed the TEST project: 1 admin, 1 prof, 2 élèves, a few sessions.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ THIS REFUSES TO RUN AGAINST ANYTHING BUT THE TEST PROJECT.
 *
 * It creates users and writes rows. Pointed at production it would inject fake
 * accounts into a real club's roster. The guard is the same interlock the e2e
 * suite uses (`tests/e2e/env.ts`), reading the same `.env.test`, and it FAILS
 * CLOSED: no config, no production ref, an unparseable URL, or a match against
 * production all abort before a single request is made.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Usage:  node supabase/seed/seed-test.mjs
 */

import { createClient } from '@supabase/supabase-js';
import { loadE2EEnv, assertNotProduction } from '../../tests/e2e/env.ts';

/* Aborts the process on anything ambiguous. Nothing below runs otherwise. */
assertNotProduction();

const env = loadE2EEnv();
if (!env || !env.serviceRoleKey) {
  console.error('seed: .env.test is missing SUPABASE_SERVICE_ROLE_KEY. Refusing.');
  process.exit(1);
}

/* A second, explicit refusal. The interlock above already covers this; a seed
   script that writes real rows deserves belt and braces. */
if (env.testRef === env.productionRef) {
  console.error('seed: resolved project IS production. Refusing.');
  process.exit(1);
}

const sb = createClient(env.supabaseUrl, env.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * ⚠️ SEED ACCOUNTS USE THEIR OWN DOMAIN, DELIBERATELY OUTSIDE THE PURGE PATTERN.
 *
 * The e2e purge deletes every user matching E2E_EMAIL_DOMAIN, before AND after
 * the suite. Seeding into that domain means the first test run silently destroys
 * the sample data — which is exactly what happened the first time: seed, run the
 * suite, and the project comes back with zero users.
 *
 * Ephemeral test users and persistent sample data have different lifecycles, so
 * they get different domains. These are re-created by re-running this script;
 * nothing else touches them.
 */
const SEED_DOMAIN = 'mcc-seed.test';
const at = (local) => `${local}@${SEED_DOMAIN}`;

const PEOPLE = [
  { email: at('seed-admin'), name: 'Amina', role: 'admin', locale: 'fr' },
  { email: at('seed-prof'), name: 'Youssef', role: 'prof', locale: 'fr' },
  { email: at('seed-eleve-1'), name: 'Sara', role: 'eleve', locale: 'fr' },
  { email: at('seed-eleve-2'), name: 'Omar', role: 'eleve', locale: 'en' },
];

/**
 * ⚠️ THE CHILDREN ARE SEEDED, NOT LEFT TO THE MIGRATION.
 *
 * `child_profiles` got its first rows from the section-4 backfill in migration
 * 0005, which is a ONE-OFF: it ran once, over the accounts that existed at that
 * moment. A seed account created afterwards has no child until somebody signs in
 * as them and `resolveChild()` adopts one. So a freshly re-seeded project — or a
 * new test project — comes up with an EMPTY CLASS LIST at `/admin/eleves/`, and
 * the surface looks broken when it is merely unpopulated.
 *
 * ⚠️ AND ONE FAMILY DELIBERATELY HAS TWO CHILDREN. "Qui joue ?" only renders
 * when an account holds MORE THAN ONE — `resolveChild()` adopts a lone child
 * silently, which is the autonomous-teenager path (see `src/lib/child.ts`). With
 * one child per account the picker is unreachable and cannot be tested at all.
 * Sara's account therefore holds two, Omar's holds one, and the two code paths
 * are both walkable on a seeded project.
 *
 * Keyed by the account's seed address; matched by display_name so a re-run adds
 * only what is missing. Never deletes: a child carries progress, and a seed
 * script that dropped them would take attendance and awards with it by cascade.
 */
const CHILDREN = {
  [at('seed-eleve-1')]: ['Sara', 'Yassine'],
  [at('seed-eleve-2')]: ['Omar'],
};

async function upsertPerson(person) {
  const { data, error } = await sb.auth.admin.createUser({
    email: person.email,
    email_confirm: true,
    user_metadata: { display_name: person.name, locale: person.locale },
  });
  if (error) {
    if (/already/i.test(error.message)) {
      /* Re-apply the role rather than skipping it. A previous run that created
         the user but failed before the role was set would otherwise leave a
         "seed-admin" who is an élève — silently, and for good. */
      const { data: list } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
      const found = (list?.users ?? []).find((u) => u.email === person.email);
      if (found && person.role !== 'eleve') {
        const { error: roleError } = await sb.rpc('admin_set_role', {
          target_id: found.id,
          new_role: person.role,
        });
        if (roleError) throw new Error(`${person.email} role: ${roleError.message}`);
      }
      console.log(`  = ${person.email} (exists, role re-applied: ${person.role})`);
      return found?.id ?? null;
    }
    throw new Error(`${person.email}: ${error.message}`);
  }

  /* The trigger has already made the profile. Role is service-role-only — the
     client can never do this (see docs/ADMIN.md). */
  if (person.role !== 'eleve') {
    /* The guard trigger refuses a direct role UPDATE even for service_role —
       auth.uid() is NULL there. admin_set_role() is the sanctioned path (0002). */
    const { error: roleError } = await sb.rpc('admin_set_role', {
      target_id: data.user.id,
      new_role: person.role,
    });
    if (roleError) throw new Error(`${person.email} role: ${roleError.message}`);
  }
  console.log(`  + ${person.email} (${person.role})`);
  return data.user.id;
}

/**
 * One learner per name in CHILDREN, under the account that holds them.
 *
 * Idempotent by (account, display_name): a re-run inserts only what is absent.
 * `child_profiles` has no unique constraint and must never gain one — a parent
 * legitimately holds several children (see migration 0005 §4) — so the check is
 * a read, not an `on conflict`.
 */
async function seedChildren(idByEmail) {
  for (const [email, names] of Object.entries(CHILDREN)) {
    const accountId = idByEmail.get(email);
    if (!accountId) {
      console.log(`  ! ${email} has no account id — skipping its children`);
      continue;
    }
    const locale = PEOPLE.find((p) => p.email === email)?.locale ?? 'fr';

    const { data: existing, error: readError } = await sb
      .from('child_profiles')
      .select('display_name')
      .eq('account_id', accountId);
    if (readError) throw new Error(`children of ${email}: ${readError.message}`);
    const have = new Set((existing ?? []).map((row) => row.display_name));

    const missing = names.filter((name) => !have.has(name));
    if (missing.length === 0) {
      console.log(`  = ${email}: ${names.length} child profile(s) already present`);
      continue;
    }
    const { error } = await sb
      .from('child_profiles')
      .insert(missing.map((display_name) => ({ account_id: accountId, display_name, locale })));
    if (error) throw new Error(`children of ${email}: ${error.message}`);
    console.log(`  + ${email}: ${missing.join(', ')}`);
  }
}

function isoDaysFromNow(days, hour) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d.toISOString();
}

async function main() {
  console.log(`seed → project "${env.testRef}" (production is "${env.productionRef}")`);

  const ids = [];
  const idByEmail = new Map();
  for (const person of PEOPLE) {
    const id = await upsertPerson(person);
    ids.push(id);
    if (id) idByEmail.set(person.email, id);
  }

  await seedChildren(idByEmail);

  const createdBy = ids[0] ?? null;
  const sessions = [
    {
      starts_at: isoDaysFromNow(7, 16),
      title_fr: 'Séance découverte',
      title_en: 'Discovery session',
      level: 'debutant',
      status: 'published',
      created_by: createdBy,
    },
    {
      starts_at: isoDaysFromNow(14, 16),
      title_fr: 'Tactiques : la fourchette',
      title_en: 'Tactics: the fork',
      level: 'intermediaire',
      status: 'published',
      created_by: createdBy,
    },
    {
      starts_at: isoDaysFromNow(21, 16),
      title_fr: 'Finales de tours',
      title_en: 'Rook endgames',
      level: 'avance',
      status: 'draft',
      created_by: createdBy,
    },
    /**
     * ⚠️ A CANCELLED SESSION, SEEDED ON PURPOSE — and it is in the FUTURE.
     *
     * `/agenda/` must show it with its state (Critical Feature 46's public
     * half), and `agenda.spec.ts` asserts that against the built page. Without
     * a seeded one the spec could only skip, and "no cancelled session was
     * found, so the cancelled-session rendering is fine" is the vacuous pass
     * this project has been bitten by before.
     *
     * A past one would not do: the bake drops sessions a day after they end, so
     * it would silently stop being covered.
     */
    {
      starts_at: isoDaysFromNow(10, 16),
      title_fr: 'Séance annulée (jour férié)',
      title_en: 'Session cancelled (public holiday)',
      level: 'debutant',
      status: 'cancelled',
      created_by: createdBy,
    },
  ];

  /**
   * Idempotent: clear previous seed sessions so re-running does not stack up
   * duplicates. Test project only — the interlock above guarantees that.
   *
   * ⚠️ EXCEPT THE ROW MIGRATION 0006 INSERTED, WHICH THIS USED TO DESTROY.
   *
   * 0006 migrated the club's one git-collection session into `sessions` with a
   * FIXED uuid, and this delete took `.not('id','is',null)` — every row. So on
   * a freshly migrated project the seed silently removed real migrated content
   * a moment after the migration created it, and `/agenda/` then rendered
   * without it. Caught because `agenda.spec.ts` asserts that session is on the
   * page; nothing else would have noticed.
   *
   * Seed data is the seed's to delete. Migrated data is not.
   */
  const MIGRATED_SESSION = '5e5e0912-0000-4000-8000-000000000912';
  await sb.from('sessions').delete().not('id', 'is', null).neq('id', MIGRATED_SESSION);
  const { error } = await sb.from('sessions').insert(sessions);
  if (error) throw new Error(`sessions: ${error.message}`);
  const tally = sessions.reduce((acc, s) => ({ ...acc, [s.status]: (acc[s.status] ?? 0) + 1 }), {});
  console.log(
    `  + ${sessions.length} sessions (${Object.entries(tally)
      .map(([k, v]) => `${v} ${k}`)
      .join(', ')}), migrated session preserved`,
  );

  console.log('seed: done.');
}

main().catch((e) => {
  console.error('seed failed:', e.message);
  process.exit(1);
});
