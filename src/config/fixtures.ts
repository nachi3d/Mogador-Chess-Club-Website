/**
 * Content that exists ONLY to give a spec something real to drive.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ WHY THIS EXISTS: A FEATURE NEEDS AN EXERCISED PATH, AND READERS NEED
 * NOT TO PAY FOR IT.
 *
 * The video facade shipped with a placeholder `youtube` id on
 * `/pieges/legal/` — a real trap, on the real index, whose play button handed
 * a reader YouTube's "video unavailable". That bought the specs a page to
 * drive at the cost of a dead video on live content, which is the wrong way
 * round: the test harness's needs must not reach the reader.
 *
 * So a fixture is content that is **routable but never listed**:
 *
 *   - it is emitted as a page ONLY when `PUBLIC_FIXTURES=true`;
 *   - it is NEVER on an index, in a count, or behind a link, in any build.
 *
 * The second half is what makes it safe even in the build where it exists: a
 * reader cannot arrive at a page nothing points to, and `index-cards.spec.ts`
 * cannot trip over a card that is not drawn.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * ── Default OFF, and that is the same discipline as `auth.ts` ────────────
 * ⚠️ THE DEFAULT IS WHAT PRODUCTION SHIPS. `PUBLIC_AUTH_ENABLED` is written
 * that way deliberately (see `src/config/auth.ts`), and the reason is recorded
 * in CLAUDE.md: production's flag lives in a Cloudflare dashboard nothing in
 * this repository can see, so the repo default must be the SAFE shape rather
 * than the convenient one. A fixtures flag that defaulted ON and relied on the
 * dashboard to switch it off would ship a fixture the first time somebody
 * forgot — and nothing here would fail.
 *
 * ⚠️ IT IS THE TEST HARNESS THAT TURNS THEM ON, NOT A RELEASE DECISION.
 * `playwright.config.ts` passes `PUBLIC_FIXTURES: 'true'` to the build it
 * tests, unconditionally and in BOTH auth shapes. So:
 *
 *   - every Playwright run — branch and release matrix — has the fixture page
 *     and gives the facade full cross-browser coverage;
 *   - it adds NO new flag shape to the release gate, because it is constant
 *     across the two shapes that gate already runs;
 *   - `npm run build`, `npm run demo` and the Cloudflare build have it OFF.
 *
 * ⚠️ THE PRODUCTION GUARANTEE IS ASSERTED WHERE IT IS TRUE: `smoke:prod`
 * fails if a fixture route answers anything but 404 on the live site. A local
 * spec cannot prove it, because the local build under test is the one with
 * fixtures ON — asking it would be asking the wrong build.
 *
 * ⚠️ DOT ACCESS, NEVER `import.meta.env['PUBLIC_FIXTURES']`. Vite only
 * statically replaces dot access; a bracket key emits the whole env object,
 * anon key included, into the chunk. Same rule as `auth.ts`, and it shipped
 * wrong once — Critical Feature 19.
 */
export const FIXTURES_ENABLED = import.meta.env.PUBLIC_FIXTURES === 'true';

/** The two flags every gate-able collection entry carries. */
interface Gateable {
  readonly draft: boolean;
  readonly fixture?: boolean;
}

/**
 * Is this entry emitted as a page at all?
 *
 * A draft is never routed — that is what parking an entry means. A fixture is
 * routed only in a fixtures build.
 */
export function isRoutable(data: Gateable): boolean {
  return !data.draft && (!data.fixture || FIXTURES_ENABLED);
}

/**
 * Is this entry drawn on an index, counted, or linked?
 *
 * ⚠️ FIXTURES ARE NEVER LISTED, IN ANY BUILD — the flag is not consulted here,
 * and that is the point rather than an oversight. `isRoutable` decides whether
 * the page exists; this decides whether a reader can find it. Collapsing the
 * two into one predicate would put the fixture on `/pieges/` in every test
 * build, where `index-cards.spec.ts` would then assert a card for it and the
 * trap count on `/apprendre/` would be one too high.
 */
export function isListed(data: Gateable): boolean {
  return !data.draft && !data.fixture;
}
