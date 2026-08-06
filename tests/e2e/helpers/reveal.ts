import type { Page } from '@playwright/test';

/**
 * Settle scroll reveals before measuring anything visual.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ WHY EVERY AXE CHECK ON A REVEAL PAGE NEEDS THIS.
 *
 * Session 6 added opt-in scroll reveals (`src/styles/motion.css`): a
 * `[data-reveal]` element sits at `opacity: 0` until the IntersectionObserver
 * sees it. Cards below the fold therefore stay fully transparent until the
 * reader scrolls — which is the intended behaviour for a reader, and a trap for
 * axe, which measures the contrast of text it can still find in the DOM and
 * reports `color-contrast` violations for every hidden card.
 *
 * That made the index-page axe checks **flaky rather than broken**: it depends
 * on viewport height (worse on the phone projects, where more cards are below
 * the fold) and on how fast the transition completes. It surfaced as
 * `color-contrast (19×)` on `/exercices/` under Firefox, and as intermittent
 * flakes on iPhone 13.
 *
 * Scrolling to the bottom and back is not weakening the assertion — it is
 * measuring the page in the state a reader actually experiences. A card nobody
 * has scrolled to is a card nobody is reading.
 * ─────────────────────────────────────────────────────────────────────────
 */
export async function settleReveals(page: Page): Promise<void> {
  // Nothing to do on a page that never opted in.
  const hasReveals = await page.locator('body[data-reveals]').count();
  if (hasReveals === 0) return;

  await page.evaluate(async () => {
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const step = Math.max(200, Math.floor(window.innerHeight * 0.8));
    for (let y = 0; y <= document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await sleep(30);
    }
    window.scrollTo(0, 0);
  });

  /* Wait for the mechanism to have finished rather than for a fixed duration:
     every target must carry the class, and the transition must have run out. */
  await page
    .waitForFunction(
      () => {
        const targets = Array.from(document.querySelectorAll('[data-reveal]'));
        return targets.every((el) => el.classList.contains('is-revealed'));
      },
      undefined,
      { timeout: 5_000 },
    )
    .catch(() => {
      /* A page whose reveals never complete is a real problem, but it is not
         THIS helper's problem to report — the axe assertion that follows will
         fail on the still-transparent text, which is the honest signal. */
    });

  await page.waitForTimeout(450); // the transition itself (--duration-slow)
}
