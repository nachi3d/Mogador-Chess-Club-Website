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
     every target must carry the class, AND its transition must have run out. */

  /**
   * ⚠️ THE CLASS LANDING IS NOT THE TRANSITION ENDING, AND A FIXED WAIT CANNOT
   * COVER THE STAGGER.
   *
   * This was `waitForTimeout(450)`, described as "the transition itself" — and
   * it forgot `[data-reveal-stagger]`, which adds `transition-delay:
   * --reveal-step × --reveal-i` (60ms per card, capped at six). The sixth card
   * onwards therefore finishes at **300ms of delay plus the transition**, past
   * 450ms, while the first card finished long before it.
   *
   * That is not theoretical: it turned the v0.12.0 release matrix red on four
   * projects. `agenda.spec.ts` compares a cancelled card's opacity against a
   * published one to prove a cancelled session is labelled rather than dimmed;
   * the published card is first in the list and the cancelled one was 23rd, so
   * one had settled to `1` and the other was sampled at **0.999974** — a
   * "dimmed card" that was nothing of the sort.
   *
   * So wait for the RESOLVED VALUE rather than for a duration.
   *
   * ⚠️ AND NOT FOR STILLNESS EITHER, WHICH IS THE TRAP THIS WALKED INTO ONCE.
   * The first attempt at this waited until no opacity had changed for three
   * consecutive frames — and read `0`, confidently, on a card whose transition
   * had not STARTED. An element sitting at `opacity: 0` waiting for its
   * stagger delay is perfectly stable; stability and settledness are different
   * questions, and only one of them is the one being asked. Reveals are
   * one-shot (`io.unobserve` in BaseLayout), so the end state is unambiguous:
   * every target carries `is-revealed` and every opacity has reached 1.
   *
   * ⚠️⚠️ AND THE WAIT IS BOUNDED BY PLAYWRIGHT, NOT BY THE PAGE. This started
   * as a `page.evaluate` counting 240 `requestAnimationFrame`s, which looked
   * bounded and was not: **WebKit stalls rAF**, the loop then never advanced,
   * and a raw `evaluate` has no timeout of its own — so it hung until the 30s
   * TEST timeout. That took the home page's specs down on webkit and
   * iphone-13, 13 failures, in a spec file that had nothing to do with it. A
   * fixed `waitForTimeout` was immune only because it waits OUTSIDE the page.
   *
   * `waitForFunction` fixes both halves: `polling` on a timer rather than on
   * rAF, and a deadline Playwright enforces however dead the page's animation
   * clock is. Nothing inside a browser may be trusted to end a wait.
   */
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll('[data-reveal]')).every(
          (el) =>
            el.classList.contains('is-revealed') &&
            /* Not `=== '1'`: the comparison is against a value a compositor
               produced, and 0.9999 is settled for every purpose this helper
               serves. A card that is actually dimmed sits far below it. */
            Number(getComputedStyle(el).opacity) >= 0.9999,
        ),
      undefined,
      /* The longest legitimate settle is the stagger cap (5 × 60ms) plus one
         transition, comfortably under a second. 5s is a ceiling, not a target. */
      { timeout: 5_000, polling: 100 },
    )
    .catch(() => {
      /* A page whose reveals never complete is a real problem, but it is not
         THIS helper's problem to report — the assertion that follows will fail
         on the still-transparent text, which is the honest signal. */
    });
}
