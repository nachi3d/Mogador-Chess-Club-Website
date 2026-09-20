/**
 * Small auth test helpers.
 *
 * ⚠️ `AUTH_FLAG` is duplicated from `src/lib/auth-flag.ts` and from the inline
 * script in `AccountButton.astro`. That is three copies of one string, and it is
 * deliberate: the production copies must not import each other (doing so would
 * pull the Supabase client into every page), so the spec pins the contract
 * instead. If someone changes the key in one place, the header spec fails.
 */
import { test } from '@playwright/test';

export const AUTH_FLAG = 'mcc:auth:v1';

/**
 * "The reader has landed back on the home page" — as a PATH test, not a regex.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ `/\/(en\/)?$/` MATCHES EVERY URL ON THIS SITE, AND THAT IS NOT A NITPICK.
 *
 * Every route here is emitted with a trailing slash (`build.format:
 * 'directory'`), so `…$` is satisfied by `/compte/`, `/progres/`, everything.
 * Five specs used that regex to wait for a sign-out or a deletion to land, and
 * every one of them resolved **instantly, on the page they were already on**.
 *
 * Mostly that was invisible: the assertion after it retries until the real
 * navigation happens. In `progress-sync.spec.ts` it was not — the next line is
 * a `page.goto()`, which started while the sign-out handler was still awaiting
 * `signOut()`, and then the handler's own `window.location.assign('/')` cut it
 * off mid-flight:
 *
 *     Navigation to ".../progres/" is interrupted by another navigation to ".../"
 *     NS_BINDING_ABORTED                                    (the same thing, Firefox)
 *
 * Chromium tolerates the interruption and the other two do not, so this only
 * surfaced when the accounts-ON matrix ran for the first time in v0.14.0.
 *
 * ⚠️ A PREDICATE, NOT A TIGHTER REGEX. `/^https?:\/\/[^/]+\/(en\/)?$/` would
 * work today and breaks the moment a port, a query string or a hash appears.
 * Comparing `url.pathname` says what is actually meant.
 * ═════════════════════════════════════════════════════════════════════════
 */
export const atSiteRoot = (url: URL): boolean =>
  url.pathname === '/' || url.pathname === '/en/';

/** Home, or the sign-in page — the two places signing out can legitimately land. */
export const atSignedOutLanding = (url: URL): boolean =>
  atSiteRoot(url) || url.pathname.includes('/connexion');

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

  /**
   * ⚠️ `verifyOtp` IS THE SAME RATE-LIMITED ENDPOINT A MAGIC LINK NAVIGATES TO,
   * and this path had no protection at all — so a run that survived
   * `followMagicLink()`'s backoff still died here with
   * `anonClientAsUser verify: Request rate limit reached`, in a spec whose
   * subject is RLS and has nothing to do with sign-in.
   *
   * Same instrument, same reasoning: retry only on a positively identified rate
   * limit, backing off 10s then 30s with a fresh token each time. Anything else throws on the
   * first attempt — a blanket retry here would hide a genuine auth failure in
   * the specs that exist to prove the boundary.
   */
  let verifyError: { message: string } | null = null;
  for (const wait of [0, 10_000, 30_000]) {
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    const fresh = await adminClient().auth.admin.generateLink({ type: 'magiclink', email });
    const hash = fresh.data?.properties?.hashed_token ?? data.properties.hashed_token;
    const { error } = await sb.auth.verifyOtp({ token_hash: hash, type: 'magiclink' });
    if (!error) return sb;
    verifyError = error;
    if (!/rate limit/i.test(error.message)) break;
  }
  throw new Error(`anonClientAsUser verify: ${verifyError?.message ?? 'unknown'}`);
}

/**
 * Follow a magic link all the way to `/compte/`, passing THROUGH the first-run
 * welcome screen when it appears.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ EVERY FRESH ACCOUNT NOW LANDS ON `/bienvenue/`, NOT `/compte/`.
 *
 * The callback reads `profiles.onboarded_at` and sends a never-guided account to
 * the welcome screen (migration 0009). Five specs minted a user, followed the
 * link and waited for `/compte/`; all five would now time out on a URL that is
 * simply no longer the destination. This is the one place that knows about the
 * detour, so a future change to the landing rule is one edit rather than five.
 *
 * ⚠️ IT SKIPS RATHER THAN COMPLETES. Skipping is the outcome that must leave a
 * fully working account, so routing every other spec through it means they all
 * quietly assert that too — a spec that signs in and then finds a broken family
 * section is telling us the skip path is broken, in whichever file notices
 * first. `onboarding.spec.ts` is what drives the completing path deliberately.
 *
 * ⚠️ THE BRANCH IS ON THE URL, NOT ON A GUESS ABOUT THE ACCOUNT. An account that
 * has already been guided goes straight to `/compte/` and there is no welcome
 * screen to skip; both paths end in the same place, which is what the caller is
 * waiting for.
 * ═════════════════════════════════════════════════════════════════════════
 */
export async function reachAccountPage(page: import('@playwright/test').Page): Promise<void> {
  await waitForSignedInUrl(page, /\/(en\/)?(compte|bienvenue)\//);
  if (/\/bienvenue\//.test(page.url())) {
    await page.getByTestId('welcome-skip').click();
    await waitForSignedInUrl(page, /\/(en\/)?compte\//);
  }
}

/**
 * Follow a magic link, surviving Supabase's BURST rate limit on verification.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ WHAT IS MEASURED, AND WHAT IS NOT. READ BOTH LISTS BEFORE TUNING ANY WAIT.
 *
 * Navigating a magic link hits `/auth/v1/verify`. MEASURED against the test
 * project:
 *
 *   - ONSET: ~22 verifications in ~7s returns 429. That is where a BURST trips
 *     the limit. ⚠️ IT IS NOT THE WINDOW AND IT IS NOT THE BUDGET, and it was
 *     recorded as though it were both for one release.
 *   - RECOVERY IS LONGER THAN 40s UNDER REAL LOAD: the 0/10s/30s backoff below
 *     exhausts with the project STILL limited (gate run #5, and reproduced
 *     locally twice on 2026-08-25). An isolated probe cleared in ~2 minutes;
 *     a full suite does not.
 *   - SUSTAINED: chromium carries 168 auth tests and webkit 89. Run together
 *     that is ~257 verifications in ~14 minutes (~18/min), which crossed the
 *     limit at gate run #5 and did NOT at runs #3 and #4 — a threshold seen
 *     from underneath.
 *
 * ⚠️⚠️ THE SCOPE IS PER IP ADDRESS, PER 5 MINUTES — the Supabase dashboard
 * says so on the setting ("Rate limit for token verifications", default 30;
 * the TEST project is now 300). This comment previously guessed "per IP and
 * per project" and a fix was designed against the guess: chromium and webkit
 * were merged into one CI job to stop them "contending", when two runners are
 * two IPs and never shared a bucket at all. Each was simply over 30 on its
 * own. WATCH ONE JOB'S RATE, NOT HOW MANY JOBS RUN.
 *
 * Still unmeasured: the highest sustained rate that is actually safe.
 *
 * There is no `Retry-After` header — the body is a bare
 *
 *     {"code":429,"error_code":"over_request_rate_limit","msg":"Request rate limit reached"}
 *
 * which the browser simply sits on, so every waiting spec dies of a plain
 * navigation timeout with nothing naming the cause.
 *
 * ⚠️ IT IS A BURST BECAUSE THE SUITE IS PARALLEL, and that is why a retry is the
 * right instrument rather than a cover-up. Every signed-in spec mints its own
 * account and follows its own link; when the spec map selects several auth files
 * at once, the workers verify simultaneously and the whole gate goes red on a
 * DIFFERENT set of tests each run. The backoff walks 10s then 30s, which
 * clears a burst and costs NOTHING on a run that never hits the limit.
 *
 * ⚠️ IT IS DELIBERATELY NOT LONGER. A 60s rung was tried and made the gate
 * WORSE, not better: when the project quota is genuinely exhausted — which a
 * developer re-running the suite repeatedly can do — every test waits out the
 * full ladder before failing anyway, and a 2-minute gate became a 10-minute
 * one that still went red. A backoff recovers a burst; it cannot buy quota.
 *
 * ⚠️ THE FIRST LINE OF DEFENCE IS `test-branch.mjs` CAPPING WORKERS AT TWO when
 * the selection is auth-heavy. This is the second: a backoff recovers a burst,
 * it cannot recover a sustained overload, and every second it waits is a second
 * on the gate. Not creating the burst is cheaper than surviving it.
 *
 * ⚠️ IT RETRIES ONLY ON A POSITIVELY IDENTIFIED 429. Anything
 * else — a broken callback, a bad token, a dead page — is re-thrown untouched on
 * the first attempt. A blanket "try again" here would hide exactly the class of
 * bug this file exists to catch, so the rate-limit body is matched explicitly
 * and everything else fails fast.
 *
 * ⚠️ A FRESH LINK EACH TIME. `generateLink` is an admin-API call and is not
 * subject to this limit, and re-using a token that may have been half-consumed
 * is a second failure mode nobody needs.
 * ═════════════════════════════════════════════════════════════════════════
 */
export async function followMagicLink(
  page: import('@playwright/test').Page,
  email: string,
): Promise<void> {
  const { magicLinkFor } = await import('./supabase-admin');
  const waits = [0, 10_000, 30_000];

  for (let attempt = 0; attempt < waits.length; attempt += 1) {
    if (waits[attempt]! > 0) {
      /* ⚠️ THE TEST'S OWN BUDGET HAS TO GROW, OR THE WAIT IS THE FAILURE.
         Backing off inside a 30s test simply moves the death from "429" to
         "timeout in waitForTimeout" — which is worse, because it no longer
         names the cause. Extended only when a 429 has actually been seen, so a
         healthy run keeps its normal, tight timeout. */
      test.setTimeout(test.info().timeout + waits[attempt]! + 15_000);
      await page.waitForTimeout(waits[attempt]!);
    }
    await page.goto(await magicLinkFor(email));
    if (!(await isRateLimited(page))) return;
  }

  throw new Error(
    'Supabase AUTH RATE LIMIT (429 over_request_rate_limit) — still limited after ' +
      `${waits.length} attempts over ${waits.reduce((a, b) => a + b, 0) / 1000}s.\n` +
      'This is the ENVIRONMENT, not the application: the suite verified more magic\n' +
      'links than the project allows. ~22 in 7s trips it from cold; a full run\n' +
      'is ~257 verifications and the window is longer than this backoff.\n' +
      'Re-run the auth specs on their own, or with fewer workers. Do NOT debug the\n' +
      'callback — see CLAUDE.md → "Symptoms that are the ENVIRONMENT".',
  );
}

/** Is the browser sitting on Supabase's bare 429 JSON body? */
async function isRateLimited(page: import('@playwright/test').Page): Promise<boolean> {
  const body = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
  return /over_request_rate_limit|Request rate limit reached/i.test(body);
}

/**
 * Wait for a post-sign-in URL, and say something USEFUL when it never comes.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THE SUITE CAN EXHAUST SUPABASE'S AUTH RATE LIMIT, AND UNTIL THIS EXISTED
 * THAT LOOKED EXACTLY LIKE A BROKEN CALLBACK.
 *
 * Following a magic link navigates the browser to `/auth/v1/verify`, which is
 * rate limited per IP over a rolling window. Every signed-in spec in this suite
 * mints its own account and follows its own link, so a `test:branch` run whose
 * spec map happens to select several auth files at once can go over — and when
 * it does, Supabase serves
 *
 *     {"code":429,"error_code":"over_request_rate_limit","msg":"Request rate limit reached"}
 *
 * as a plain JSON body. The browser sits on it, `waitForURL` times out with
 * "waiting for navigation until load", and the report shows a bare timeout on a
 * DIFFERENT set of tests every run — which is the exact signature CLAUDE.md
 * lists for environment failures, and which cost this session two full gate runs
 * before anybody screenshotted the page.
 *
 * ⚠️ IT DOES NOT RETRY, AND IT MUST NOT. The window is minutes long; a retry
 * loop would turn a three-minute gate into a twenty-minute one and would still
 * fail. The fix is to run fewer accounts or to spread them out, and that is a
 * decision for whoever is reading the failure — so this reports the cause
 * precisely and stops.
 * ═════════════════════════════════════════════════════════════════════════
 */
export async function waitForSignedInUrl(
  page: import('@playwright/test').Page,
  pattern: RegExp,
  timeout = 30_000,
): Promise<void> {
  try {
    await page.waitForURL(pattern, { timeout });
  } catch (error) {
    const body = await page.evaluate(() => document.body?.innerText ?? '').catch(() => '');
    if (/over_request_rate_limit|Request rate limit reached/i.test(body)) {
      throw new Error(
        'Supabase AUTH RATE LIMIT (429 over_request_rate_limit) while following a magic link.\n' +
          'This is the ENVIRONMENT, not the application: the suite minted more link\n' +
          'verifications than the project allows in its rolling window.\n' +
          'Re-run the auth specs on their own, or wait a few minutes. Do NOT debug\n' +
          'the callback — see CLAUDE.md → "Symptoms that are the ENVIRONMENT".\n' +
          `URL at failure: ${page.url()}`,
      );
    }
    throw error;
  }
}

/**
 * Open one of `/compte/`'s two disclosures.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THE COLLAPSED BLOCKS ARE THE FEATURE, SO THE SPECS OPEN THEM RATHER THAN
 * THE PAGE LEAVING THEM OPEN.
 *
 * `/compte/` used to be one flat column in which permanent account deletion sat
 * in the flow with the same weight as the interface language. It is now behind
 * "Options avancées", collapsed — which means every spec that presses the delete
 * button has to get there the way a reader does.
 *
 * ⚠️ THIS IS THE ONLY PLACE THAT KNOWS THE BLOCKS ARE `<details>`. If they ever
 * become something else, that is one edit here rather than a dozen across four
 * files — the same reasoning as `reachAccountPage()` above.
 *
 * ⚠️ IT CLICKS THE SUMMARY RATHER THAN SETTING `open`. Forcing the attribute
 * would pass on a disclosure whose summary is unreachable, unlabelled or
 * covered — and "the control is reachable" is exactly the class of bug this
 * site has already shipped once (Critical Feature 48).
 * ═════════════════════════════════════════════════════════════════════════
 */
export async function openAccountBlock(
  page: import('@playwright/test').Page,
  which: 'settings' | 'advanced',
): Promise<void> {
  const block = page.getByTestId(`account-${which}`);
  if (await block.evaluate((el) => (el as HTMLDetailsElement).open)) return;
  await block.locator('summary').click();
  await page
    .getByTestId(`account-${which}`)
    .evaluate((el) => (el as HTMLDetailsElement).open || Promise.reject(new Error('did not open')));
}
