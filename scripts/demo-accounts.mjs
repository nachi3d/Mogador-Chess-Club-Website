/**
 * Mogador Chess Club — one command to test the built site WITH ACCOUNTS ON.
 *
 *   npm run demo:accounts              → build with accounts on, serve on localhost
 *   npm run demo:accounts -- --host    → also expose on the LAN, for a real phone
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ WHY THIS IS A SCRIPT AND NOT A LINE OF SHELL YOU TYPE.
 *
 * Accounts are OFF by default (`PUBLIC_AUTH_ENABLED`, see `src/config/auth.ts`),
 * so testing them by hand means building with three variables set. Typed by
 * hand, that is:
 *
 *     PUBLIC_AUTH_ENABLED=true PUBLIC_SUPABASE_URL=… PUBLIC_SUPABASE_ANON_KEY=… npm run demo
 *
 * and the failure mode of getting it wrong is not a broken build — it is a
 * LOCAL BUILD WIRED TO THE PRODUCTION DATABASE. `.env.local` holds the
 * production project, because that is what a real deploy build needs; omit the
 * override, or fat-finger it, and signing in on localhost creates a real account
 * in the live club's project. Nothing would announce it, and the site would look
 * completely normal.
 *
 * So the values are not typed at all. They are read from `.env.test` through the
 * same interlock the e2e suite and the seed script use, and it FAILS CLOSED: no
 * config, no production ref, an unparseable URL, or a match against production
 * all abort before anything is built. The safe thing is the easy thing.
 *
 * ⚠️ THE OVERRIDE MECHANISM IS LOAD-BEARING. Vite gives an existing `process.env`
 * entry precedence over a `.env` file for the same prefixed key, which is what
 * lets these win over `.env.local`. `playwright.config.ts` relies on exactly the
 * same behaviour for exactly the same reason, and `tests/e2e/auth.spec.ts`
 * asserts the built bundle carries the TEST ref — so the mechanism is verified
 * rather than assumed.
 *
 * This script adds nothing else: it hands off to `scripts/demo.mjs`, which keeps
 * the port sweep, the orphan sweep and the Ctrl+C cleanup in ONE place.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadE2EEnv, assertNotProduction } from '../tests/e2e/env.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Aborts the process on anything ambiguous. Nothing below runs otherwise. */
assertNotProduction();

const env = loadE2EEnv();
if (!env?.supabaseUrl || !env?.anonKey) {
  console.error(
    'demo:accounts — .env.test is missing TEST_PUBLIC_SUPABASE_URL or ' +
      'TEST_PUBLIC_SUPABASE_ANON_KEY. Refusing to build.\n' +
      '⚠️ Copy .env.test.example (NOT .env.example) to .env.test.',
  );
  process.exit(1);
}

/* A second, explicit refusal. The interlock above already covers this; a build
   that could be wired to the live database deserves belt and braces. */
if (env.testRef === env.productionRef) {
  console.error('demo:accounts — resolved project IS production. Refusing to build.');
  process.exit(1);
}

console.log(
  `\n  accounts ON — building against TEST project "${env.testRef}" ` +
    `(production is "${env.productionRef}")\n`,
);

const demo = spawn(
  process.execPath,
  [join(ROOT, 'scripts', 'demo.mjs'), ...process.argv.slice(2)],
  {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      PUBLIC_AUTH_ENABLED: 'true',
      PUBLIC_SUPABASE_URL: env.supabaseUrl,
      PUBLIC_SUPABASE_ANON_KEY: env.anonKey,
    },
  },
);

/* ⚠️ Ctrl+C must reach the child, which owns the preview server and its own
   cleanup. Without this the wrapper exits and leaves the server holding 4321 —
   the exact stale-preview trap `demo.mjs` exists to prevent. */
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => demo.kill(signal));
}

demo.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
