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

/** Every seeded address sits inside the purge pattern so cleanup finds them. */
const at = (local) => `${local}@${env.emailDomain}`;

const PEOPLE = [
  { email: at('seed-admin'), name: 'Amina', role: 'admin', locale: 'fr' },
  { email: at('seed-prof'), name: 'Youssef', role: 'prof', locale: 'fr' },
  { email: at('seed-eleve-1'), name: 'Sara', role: 'eleve', locale: 'fr' },
  { email: at('seed-eleve-2'), name: 'Omar', role: 'eleve', locale: 'en' },
];

async function upsertPerson(person) {
  const { data, error } = await sb.auth.admin.createUser({
    email: person.email,
    email_confirm: true,
    user_metadata: { display_name: person.name, locale: person.locale },
  });
  if (error) {
    if (/already/i.test(error.message)) {
      console.log(`  = ${person.email} (exists)`);
      return null;
    }
    throw new Error(`${person.email}: ${error.message}`);
  }

  /* The trigger has already made the profile. Role is service-role-only — the
     client can never do this (see docs/ADMIN.md). */
  if (person.role !== 'eleve') {
    const { error: roleError } = await sb
      .from('profiles')
      .update({ role: person.role })
      .eq('id', data.user.id);
    if (roleError) throw new Error(`${person.email} role: ${roleError.message}`);
  }
  console.log(`  + ${person.email} (${person.role})`);
  return data.user.id;
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
  for (const person of PEOPLE) ids.push(await upsertPerson(person));

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
  ];

  const { error } = await sb.from('sessions').insert(sessions);
  if (error) throw new Error(`sessions: ${error.message}`);
  console.log(`  + ${sessions.length} sessions (2 published, 1 draft)`);

  console.log('seed: done.');
}

main().catch((e) => {
  console.error('seed failed:', e.message);
  process.exit(1);
});
