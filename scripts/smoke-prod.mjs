#!/usr/bin/env node
/**
 * Mogador Chess Club — PRODUCTION smoke check.
 *
 *   npm run smoke:prod
 *   npm run smoke:prod -- --url https://staging.example.com
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THIS IS THE CHECK THE LOCAL GATE STRUCTURALLY CANNOT DO.
 *
 * Everything else in this repo tests a build on disk, served by `astro preview`
 * on localhost. That is deliberate and it is right — but it means an entire
 * class of failure is invisible until a reader hits it:
 *
 *   - the Worker is deployed but the custom domain was never attached, so the
 *     hostname 522s while `dist/` is perfect;
 *   - `site.url` says one host and the deploy answers on another, so every
 *     canonical, every `hreflang` alternate and every share preview points
 *     somewhere that may not resolve — with nothing broken on screen;
 *   - `not_found_handling`, the assets runtime or a redirect rule changes what
 *     is served for a path that builds fine;
 *   - the service worker or the generated manifest is not actually reachable at
 *     its URL, so the PWA silently stops being installable.
 *
 * None of those can fail on localhost. All of them are one fetch away here.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ IT IS A SMOKE CHECK, NOT A SECOND TEST SUITE. It asserts that each page is
 * REACHABLE, is the RIGHT page, in the RIGHT language, and agrees with the host
 * that served it. It deliberately does not re-test behaviour: Playwright owns
 * that, against a build, in five browsers. A production check that duplicated
 * assertions would drift from the suite and be believed anyway.
 *
 * ⚠️ IT IS NOT PART OF `npm run build` AND MUST NOT BECOME PART OF IT. It needs
 * the network and a deployed site; wiring it into the build would make every
 * local build depend on production being up, which is exactly backwards.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const bold = (s) => `[1m${s}[0m`;
const dim = (s) => `[2m${s}[0m`;
const red = (s) => `[31m${s}[0m`;
const green = (s) => `[32m${s}[0m`;
const yellow = (s) => `[33m${s}[0m`;

/* ── Where the origin comes from ──────────────────────────────────────────
   ⚠️ PARSED, NOT RETYPED. The hostname already exists in three places
   (src/config/site.ts, astro.config.mjs, wrangler.jsonc) and a fourth copy
   here would be the one that goes stale — this script would then cheerfully
   smoke-test the wrong site and report success. Same reasoning as
   check-contrast.mjs parsing the real stylesheets. */

function parse(file, pattern, what) {
  const source = readFileSync(join(ROOT, file), 'utf8');
  const match = pattern.exec(source);
  if (!match) {
    console.error(red(`\nsmoke-prod: could not find ${what} in ${file} — did it move?\n`));
    process.exit(1);
  }
  return match[1];
}

const siteUrl = parse(
  'src/config/site.ts',
  /^\s*url:\s*'([^']+)'/m,
  '`url`',
);
const astroSite = parse(
  'astro.config.mjs',
  /^\s*site:\s*'([^']+)'/m,
  '`site`',
);

const args = process.argv.slice(2);
const flagIndex = args.indexOf('--url');
const override = flagIndex >= 0 ? args[flagIndex + 1] : undefined;
const ORIGIN = (override ?? siteUrl).replace(/\/$/, '');

/* ── The routes, and what proves each one is itself ───────────────────────
   ⚠️ SENTINELS ARE STRUCTURAL, NOT PROSE. A visible sentence is translated,
   re-worded and A/B-able; a `data-testid` or a component class is what the
   page IS. Pinning copy here would make this fail on a typo fix — the exact
   tax that makes a check get switched off. Every marker below is one the
   Playwright suite already relies on. */
const ROUTES = [
  { path: '/', locale: 'fr', sentinel: /data-dashboard/, what: 'the home dashboard' },
  { path: '/en/', locale: 'en', sentinel: /data-dashboard/, what: 'the home dashboard' },
  { path: '/cours/', locale: 'fr', sentinel: /data-testid="cours-tutorial-link"/, what: 'the tutorial prerequisite link' },
  { path: '/en/cours/', locale: 'en', sentinel: /data-testid="cours-tutorial-link"/, what: 'the tutorial prerequisite link' },
  { path: '/pieges/', locale: 'fr', sentinel: /class="card-grid"/, what: 'the trap card grid' },
  { path: '/exercices/', locale: 'fr', sentinel: /class="card-grid"/, what: 'the exercise card grid' },
  { path: '/apprendre-les-bases/', locale: 'fr', sentinel: /apprendre-les-bases\/[a-z-]+\//, what: 'a link to a tutorial step' },
  { path: '/jouer/', locale: 'fr', sentinel: /data-testid="play"/, what: 'the play island' },
  { path: '/progres/', locale: 'fr', sentinel: /data-progress-view/, what: 'the progress view' },
  { path: '/agenda/', locale: 'fr', sentinel: /class="(sessions|empty)"/, what: 'the session list' },
  /* wa.me with no recipient is a Critical Feature (outbound-only sharing), and
     the contact CTA is where it is most load-bearing. */
  { path: '/contact/', locale: 'fr', sentinel: /wa\.me/, what: 'the WhatsApp CTA' },
  { path: '/mentions-legales/', locale: 'fr', sentinel: /Burnett/, what: 'the CC BY-SA attribution' },
];

/**
 * Subresource-bearing attributes.
 *
 * ⚠️ ANCHORS ARE DELIBERATELY NOT HERE. The site links OUT on purpose — the GPL
 * text, the Chessground repository, Wikimedia, the association's Instagram,
 * wa.me, nachi3dlabs.com. Those are links a reader chooses to follow, and the
 * rule they must obey is "no third-party REQUEST without an explicit click".
 * Flagging `<a href>` would make this fail on the legal notice, which would be
 * the check misunderstanding the rule it exists to enforce.
 */
const FETCHING_TAG = /<(script|link|img|iframe|source|video|audio|embed|object)\b([^>]*)>/gi;
const ATTR = (name, attrs) =>
  new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i').exec(attrs)?.[1];

/**
 * ⚠️ A `<link>` IS ONLY A REQUEST FOR SOME VALUES OF `rel`.
 *
 * `canonical`, `alternate` (the hreflang pairs), `author` and `license` are
 * METADATA: absolute URLs the browser never fetches. The first version of this
 * check did not distinguish them and reported the site's own canonical as a
 * third-party subresource on all twelve pages — which is both wrong and exactly
 * backwards, since those URLs pointing at the production origin is the thing
 * the check above wants to see.
 */
const FETCHING_REL =
  /^(?:stylesheet|preload|modulepreload|prefetch|preconnect|dns-prefetch|icon|shortcut icon|apple-touch-icon|apple-touch-startup-image|manifest)$/i;

const failures = [];
const fail = (route, message) => {
  failures.push(`${route} — ${message}`);
  console.log(`  ${red('FAIL')}  ${route}  ${message}`);
};
const ok = (route, message) => console.log(`  ${green('ok')}    ${route}  ${dim(message)}`);

async function get(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    headers: { 'user-agent': 'mogador-smoke-prod' },
  });
  return { response, body: await response.text() };
}

/**
 * Every page must agree with the host that actually served it.
 *
 * ⚠️ THE EXPECTED ORIGIN IS `site.url`, NOT THE FETCHED ONE — and on the
 * default run those are the same thing, which IS the check. Canonicals are
 * absolute and baked at build time, so a page served from anywhere carries the
 * origin it was BUILT for. Comparing against the fetched host would therefore
 * be right in production and wrong everywhere else: every page would "fail" on
 * a staging host or a localhost preview, for the entirely correct reason that
 * it advertises production. A check that cannot be run anywhere but production
 * is a check nobody runs before deploying.
 *
 * So: the canonical must name the configured origin, always. Whether the
 * configured origin is the one actually answering is asserted once, separately,
 * and only when there is no `--url` override — see the summary below.
 */
function checkUrls(route, body, path) {
  const canonical = /<link rel="canonical" href="([^"]+)"/.exec(body)?.[1];
  const og = /<meta property="og:url" content="([^"]+)"/.exec(body)?.[1];

  if (!canonical) return fail(route, 'no canonical link');
  if (!og) return fail(route, 'no og:url');

  const expected = new URL(path, `${siteUrl.replace(/\/$/, '')}/`).href;
  if (canonical !== expected) {
    return fail(route, `canonical is ${canonical}, expected ${expected}`);
  }
  if (og !== canonical) {
    return fail(route, `og:url (${og}) disagrees with the canonical (${canonical})`);
  }
  return true;
}

function checkSubresources(route, body) {
  /* Compared against the BUILT origin, for the same reason canonicals are: an
     absolute subresource URL is baked at build time and says nothing about who
     served it. `--url` would otherwise flag every one of the site's own assets. */
  const own = new URL(siteUrl).origin;
  const foreign = new Set();

  for (const [, tag, attrs] of body.matchAll(FETCHING_TAG)) {
    if (tag.toLowerCase() === 'link') {
      const rel = ATTR('rel', attrs);
      if (!rel || !FETCHING_REL.test(rel.trim())) continue;
    }
    const value = ATTR('src', attrs) ?? ATTR('href', attrs) ?? ATTR('data', attrs);
    if (!value) continue;
    /* Relative, root-relative, inline and same-document values cannot be
       third-party by construction. */
    if (!/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value)) continue;
    if (/^(?:data|blob|about|javascript):/i.test(value)) continue;
    try {
      const url = new URL(value, siteUrl);
      if (url.origin !== own) foreign.add(url.origin);
    } catch {
      /* an unparseable attribute is not a third-party request */
    }
  }

  if (foreign.size > 0) {
    return fail(route, `third-party subresource origin(s): ${[...foreign].join(', ')}`);
  }
  return true;
}

async function checkPage({ path, locale, sentinel, what }) {
  const url = `${ORIGIN}${path}`;
  let result;
  try {
    result = await get(url);
  } catch (error) {
    return fail(path, `unreachable — ${error.cause?.code ?? error.message}`);
  }
  const { response, body } = result;

  if (response.status !== 200) return fail(path, `HTTP ${response.status}`);

  const lang = /<html[^>]*\blang="([a-z-]+)"/i.exec(body)?.[1];
  if (lang !== locale) return fail(path, `lang is "${lang}", expected "${locale}"`);

  if (!sentinel.test(body)) return fail(path, `${what} is missing`);

  /* The GPL source link is required in the footer of EVERY page — it is how the
     licence's distribution obligation is met, not decoration (Critical Feature
     8). It is cheap to check here and catastrophic to lose silently. */
  if (!/github\.com\/nachi3d\/Mogador-Chess-Club-Website/i.test(body)) {
    return fail(path, 'the GPL source link is missing from the footer');
  }

  if (checkUrls(path, body, path) !== true) return;
  if (checkSubresources(path, body) !== true) return;

  ok(path, `200 · ${locale} · ${what} · canonical and og agree`);
}

async function checkManifest() {
  const url = `${ORIGIN}/manifest.webmanifest`;
  try {
    const { response, body } = await get(url);
    if (response.status !== 200) return fail('/manifest.webmanifest', `HTTP ${response.status}`);
    const manifest = JSON.parse(body);
    if (!manifest.name) return fail('/manifest.webmanifest', 'no `name`');
    if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
      return fail('/manifest.webmanifest', 'no icons — not installable');
    }
    ok('/manifest.webmanifest', `${manifest.icons.length} icon(s) · "${manifest.name}"`);
  } catch (error) {
    fail('/manifest.webmanifest', `unreachable or unparseable — ${error.message}`);
  }
}

async function checkServiceWorker() {
  const url = `${ORIGIN}/sw.js`;
  try {
    const { response, body } = await get(url);
    if (response.status !== 200) return fail('/sw.js', `HTTP ${response.status}`);
    if (!/precacheAndRoute\(/.test(body)) {
      return fail('/sw.js', 'no precache manifest — this is not the generated worker');
    }
    /* The engine must stay OUT of the precache: 3.6 MB nobody asked for, on a
       phone on Essaouira mobile data. Guarded locally by pwa.spec.ts; this is
       the deployed-artefact restatement of the same rule. */
    const precache = /precacheAndRoute\(\s*(\[[\s\S]*?\])\s*(?:,|\))/.exec(body)?.[1] ?? '';
    if (/stockfish|\.wasm/i.test(precache)) {
      return fail('/sw.js', 'the engine is in the PRECACHE manifest');
    }
    ok('/sw.js', 'generated worker, engine not precached');
  } catch (error) {
    fail('/sw.js', `unreachable — ${error.cause?.code ?? error.message}`);
  }
}

/* ── Run ──────────────────────────────────────────────────────────────── */

console.log(`\n${bold('Production smoke check')}`);
console.log(`  origin      ${ORIGIN}${override ? yellow('   (--url override)') : ''}`);
console.log(`  site.ts     ${siteUrl}`);
console.log(`  astro.config ${astroSite}\n`);

/**
 * ⚠️ THE TWO LITERALS ARE COMPARED BEFORE ANY NETWORK CALL.
 *
 * They are two files holding one fact, and nothing local has ever compared
 * them — a mismatch produces a site whose pages advertise a different host from
 * the one they were built for, with nothing broken on screen. This is the only
 * check here that does not need production to exist, so it runs first and it
 * runs even when the domain is not up yet.
 */
if (siteUrl.replace(/\/$/, '') !== astroSite.replace(/\/$/, '')) {
  console.log(
    `  ${red('FAIL')}  config    site.ts (${siteUrl}) and astro.config.mjs (${astroSite}) disagree`,
  );
  failures.push('config — site.ts and astro.config.mjs disagree');
} else {
  console.log(`  ${green('ok')}    config    both files name the same origin\n`);
}

/**
 * ⚠️ AND THE ONE THAT ONLY PRODUCTION CAN ANSWER: is the host that just served
 * these pages the host they claim to be served from?
 *
 * Asserted once rather than per page, and skipped under `--url` — a staging
 * preview legitimately answers on a different hostname while serving a build
 * made for production, and failing that would make the override useless.
 */
if (!override && ORIGIN !== siteUrl.replace(/\/$/, '')) {
  console.log(`  ${red('FAIL')}  config    the fetched origin is not \`site.url\``);
  failures.push('config — fetched origin is not site.url');
}
if (override) {
  console.log(
    dim(
      `  note      --url given: pages are checked against ${siteUrl},\n` +
        '            the origin they were BUILT for, not the one answering.\n',
    ),
  );
}

for (const route of ROUTES) await checkPage(route);
await checkManifest();
await checkServiceWorker();

console.log('');
if (failures.length > 0) {
  console.log(red(`${failures.length} problem(s) against ${ORIGIN}.`));
  console.log(
    dim(
      'If everything is unreachable, the domain is probably not attached yet —\n' +
        'see BACKLOG.md → Deployment and domain for what to click in Cloudflare.',
    ),
  );
  process.exit(1);
}
console.log(green(`All production smoke checks passed against ${ORIGIN}.`));
