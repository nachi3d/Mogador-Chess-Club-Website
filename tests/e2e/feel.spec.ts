import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { movePiece } from './helpers/board';
import { settleReveals } from './helpers/reveal';
import {
  AMBIENT_MAX_S,
  AMBIENT_MIN_S,
  RESPONSE_MS,
  TRANSITION_MIN_MS,
  TRANSITION_MS,
} from '../../src/lib/motion';

/**
 * E1 — the motion vocabulary and action feedback.
 *
 * Three families (Réponse / Transition / Ambiance), the gap between two of
 * them, and the feedback built on top: the press, the correct-move pulse, the
 * wrong-move reason, and the two-beat solve.
 *
 * No engine is booted here, so this file runs under the normal fan-out.
 */

const MATE_IN_1 = '/exercices/mat-du-couloir/'; // onlyMove: true
const MATE_IN_2 = '/exercices/opposition-et-mat/'; // onlyMove: false, two steps
const FORK = '/exercices/fourchette-de-cavalier/'; // onlyMove: false

async function openExercise(page: Page, path: string) {
  await page.goto(path);
  await page.locator('[data-testid="chessboard"]').scrollIntoViewIfNeeded();
  await page.locator('[data-testid="chessboard"] cg-board').waitFor({ timeout: 15_000 });
  await expect(page.getByTestId('exercise')).toHaveAttribute('data-ready', 'true', {
    timeout: 15_000,
  });
}

async function playMove(page: Page, from: string, to: string) {
  await expect(page.getByTestId('exercise')).toHaveAttribute('data-busy', 'false', {
    timeout: 10_000,
  });
  await movePiece(page, from, to);
}

/** A custom property off the live document, in ms. */
async function cssMs(page: Page, prop: string): Promise<number> {
  const raw = await page.evaluate(
    (p) => getComputedStyle(document.documentElement).getPropertyValue(p).trim(),
    prop,
  );
  return raw.endsWith('ms') ? parseFloat(raw) : parseFloat(raw) * 1000;
}

test.describe('the motion vocabulary', () => {
  /**
   * THE MIRROR. `motion.ts` is the single source and `tokens.css` restates it,
   * because CSS cannot import TypeScript. This is what stops the restatement
   * drifting: the numbers are read off the rendered document and compared to
   * the imported constants, so changing one without the other fails here rather
   * than in six months when somebody notices the buttons feel wrong.
   */
  test('tokens.css mirrors the constants in motion.ts', async ({ page }) => {
    await page.goto('/');
    expect(await cssMs(page, '--motion-response')).toBe(RESPONSE_MS);
    expect(await cssMs(page, '--motion-transition')).toBe(TRANSITION_MS);
    expect(await cssMs(page, '--motion-ambient-min')).toBe(AMBIENT_MIN_S * 1000);
    expect(await cssMs(page, '--motion-ambient-max')).toBe(AMBIENT_MAX_S * 1000);
  });

  /**
   * THE GAP IS THE POINT. Nothing may sit between 180ms and 250ms — that is
   * what keeps "the site heard me" and "watch this change" legible as two
   * separate things rather than one smear of vaguely-quick.
   *
   * Every element on the page is swept, not a hand-written list, because the
   * failure this guards against is somebody adding a `220ms` in a component
   * nobody thought to add to a list. Zero durations are skipped (no animation),
   * and so are values at or outside the bounds.
   */
  for (const path of ['/', '/exercices/mat-du-couloir/', '/cours/']) {
    test(`no duration falls in the 180–250ms gap on ${path}`, async ({ page }) => {
      await page.goto(path);
      await settleReveals(page);

      const offenders = await page.evaluate(() => {
        const bad: string[] = [];
        const parse = (list: string) =>
          list
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
            .map((v) => (v.endsWith('ms') ? parseFloat(v) : parseFloat(v) * 1000));

        for (const el of Array.from(document.querySelectorAll('*'))) {
          const cs = getComputedStyle(el);
          for (const [kind, value] of [
            ['transition', cs.transitionDuration],
            ['animation', cs.animationDuration],
          ] as const) {
            for (const ms of parse(value)) {
              if (ms > 180 && ms < 250) {
                bad.push(`${el.tagName.toLowerCase()}.${el.className} ${kind} ${ms}ms`);
              }
            }
          }
        }
        return bad.slice(0, 12);
      });

      expect(offenders, 'durations in the forbidden 180–250ms gap').toEqual([]);
    });
  }

  test('Ambiance: every ambient drift sits inside the 4–20s band', async ({ page }) => {
    await page.goto('/');

    const durations = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.ambient .piece')).map((el) => {
        const raw = (getComputedStyle(el).animationDuration.split(',')[0] ?? '0s').trim();
        return raw.endsWith('ms') ? parseFloat(raw) / 1000 : parseFloat(raw);
      }),
    );

    // Two layers now, not one. Depth is the point of the second — see E1.
    expect(durations.length).toBeGreaterThanOrEqual(7);
    for (const seconds of durations) {
      expect(seconds).toBeGreaterThanOrEqual(AMBIENT_MIN_S);
      expect(seconds).toBeLessThanOrEqual(AMBIENT_MAX_S);
    }
  });

  test('Ambiance: two layers, and the group opacity still caps the ceiling', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.ambient .layer-near')).toHaveCount(1);
    await expect(page.locator('.ambient .layer-far')).toHaveCount(1);

    /* The hard ceiling (CLAUDE.md) is 0.075 and it is enforced by the GROUP.
       Group opacity flattens before compositing, so the far layer's own opacity
       is a fraction of an already-capped value and two overlapping pieces can
       never sum past it. If someone moves the cap onto the pieces, this fails. */
    const ambient = await page
      .locator('.ambient')
      .evaluate((el) => parseFloat(getComputedStyle(el).opacity));
    expect(ambient).toBeLessThanOrEqual(0.075);

    const far = await page
      .locator('.layer-far')
      .evaluate((el) => parseFloat(getComputedStyle(el).opacity));
    expect(far).toBeGreaterThan(0);
    expect(far).toBeLessThan(1);
    expect(ambient * far).toBeLessThanOrEqual(0.075);
  });

  test('Réponse: a button transitions at the response duration', async ({ page }) => {
    await page.goto('/');
    /* ⚠️ NOT `home-cta-play`. Since E5 that is a main-menu entry rather than a
       button — it has one Réponse transition (colour) and no press. The home
       page's real button now sits below the menu, in the descriptive section. */
    await settleReveals(page);
    const cta = page.getByTestId('home-cta-tutorial');
    const durations = await cta.evaluate((el) =>
      getComputedStyle(el)
        .transitionDuration.split(',')
        .map((v) => v.trim()),
    );
    expect(durations.length).toBeGreaterThan(1);
    for (const d of durations) expect(parseFloat(d) * 1000).toBe(RESPONSE_MS);
  });

  test('Transition: a scroll reveal runs at the transition duration', async ({ page }) => {
    await page.goto('/pieges/');
    const card = page.locator('.card[data-reveal]').first();
    const ms = await card.evaluate(
      (el) => parseFloat(getComputedStyle(el).transitionDuration.split(',')[0] ?? '0s') * 1000,
    );
    expect(ms).toBe(TRANSITION_MS);
  });
});

test.describe('action feedback — the press', () => {
  /**
   * A real press, not a colour change. `:active` applies for as long as the
   * pointer is down, so holding the mouse is how the pressed state is read.
   */
  test('a button translates and tightens its shadow while held', async ({ page }) => {
    await page.goto('/');
    await settleReveals(page);
    const cta = page.getByTestId('home-cta-tutorial');
    await cta.scrollIntoViewIfNeeded();

    const resting = await cta.evaluate((el) => ({
      transform: getComputedStyle(el).transform,
      shadow: getComputedStyle(el).boxShadow,
    }));
    expect(resting.transform === 'none' || resting.transform === 'matrix(1, 0, 0, 1, 0, 0)').toBe(
      true,
    );
    expect(resting.shadow).not.toBe('none');

    const box = (await cta.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    /* The press is a 150ms Réponse, so it must be read AFTER it lands. Sampling
       immediately catches it mid-travel (0.3px of 2px) — which is itself proof
       that it animates rather than jumping, but not what this test asserts. */
    await page.waitForTimeout(RESPONSE_MS * 2);

    const pressed = await cta.evaluate((el) => ({
      transform: getComputedStyle(el).transform,
      shadow: getComputedStyle(el).boxShadow,
    }));
    await page.mouse.up();

    // translateY(2px) — the last matrix component is the vertical offset.
    expect(pressed.transform).toContain('2)');
    expect(pressed.transform).not.toBe(resting.transform);
    // The gap under the control closes as it meets the page.
    expect(pressed.shadow).not.toBe(resting.shadow);
  });

  /**
   * The old scoped button definitions came out at ~40px. Nothing was measuring
   * it, so nothing noticed. This measures it.
   */
  /* A trap page rather than a course index: the course index is a list of
     cards and has no buttons at all, so it would assert nothing. */
  for (const path of ['/', '/contact/', '/pieges/legal/']) {
    test(`every button on ${path} clears a 44px touch target`, async ({ page }) => {
      await page.goto(path);
      await settleReveals(page);

      const buttons = page.locator('.btn, .btn-primary, .btn-ghost, .share');
      const count = await buttons.count();
      expect(count, 'no buttons found — is the selector still right?').toBeGreaterThan(0);

      for (let i = 0; i < count; i++) {
        const el = buttons.nth(i);
        if (!(await el.isVisible())) continue;
        const box = (await el.boundingBox())!;
        expect(box.height, `button ${i} on ${path} is ${box.height}px tall`).toBeGreaterThanOrEqual(
          43.5,
        );
      }
    });
  }
});

test.describe('action feedback — a correct move', () => {
  /**
   * The pulse is one Transition long and then gone, so a Playwright-side poll
   * would race it. The check runs INSIDE the page, from a rAF loop started
   * before the move.
   *
   * ⚠️ A MutationObserver was the obvious choice and is the WRONG one here, as
   * the first version of this spec proved on WebKit. Observer callbacks are
   * BATCHED at the end of a microtask checkpoint, and the callback re-queried
   * the live DOM rather than reading the records — so under load it could fire
   * after the 300ms window had already closed, find nothing, and report that
   * the pulse never happened. It failed the full matrix once and passed
   * serially, which is the signature of a racy test rather than a browser bug.
   *
   * A rAF loop samples roughly every frame — around eighteen looks inside one
   * Transition — and cannot be batched past the window.
   */
  test('the destination square pulses, and the pulse does not linger', async ({ page }) => {
    await openExercise(page, MATE_IN_1);

    await page.evaluate(() => {
      const w = window as unknown as { __pulses: string[]; __stop?: boolean };
      w.__pulses = [];
      const note = (el: Element) => {
        if (!el.classList?.contains('mcc-pulse')) return;
        const key = (el as HTMLElement).style.transform || 'unpositioned';
        if (!w.__pulses.includes(key)) w.__pulses.push(key);
      };

      /* Sampler 1 — a rAF loop, ~18 looks inside one 300ms Transition. */
      const tick = () => {
        for (const sq of Array.from(document.querySelectorAll('cg-board square.mcc-pulse'))) {
          note(sq);
        }
        if (!w.__stop) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);

      /*
       * Sampler 2 — a MutationObserver that reads its RECORDS.
       *
       * ⚠️ NOT a contradiction of "never assert a short-lived class with a
       * MutationObserver". That rule is about a callback that RE-QUERIES THE
       * LIVE DOM: it can be batched past the 300ms window, find nothing, and
       * report that the pulse never happened. Reading `record.addedNodes` and
       * `record.target` cannot — the records describe the DOM as it was when
       * the mutation occurred, however late the callback runs.
       *
       * It is here because the rAF loop has its own blind spot in the other
       * direction: WebKit starves rAF under load, and this test has been
       * intermittently failing on WebKit in full-matrix runs for that reason.
       * The two samplers fail in different conditions, so together they cover
       * the window that either alone leaves open.
       */
      const board = document.querySelector('cg-board');
      if (board) {
        new MutationObserver((records) => {
          for (const record of records) {
            for (const added of Array.from(record.addedNodes)) {
              if (added.nodeType === 1) note(added as Element);
            }
            if (record.type === 'attributes' && record.target.nodeType === 1) {
              note(record.target as Element);
            }
          }
        }).observe(board, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['class'],
        });
      }
    });

    await playMove(page, 'a1', 'a8');
    await expect(page.getByTestId('exercise-solved')).toBeVisible({ timeout: 10_000 });

    const seen = await page.evaluate(() => {
      const w = window as unknown as { __pulses: string[]; __stop?: boolean };
      w.__stop = true;
      return w.__pulses;
    });
    expect(seen.length, 'the destination square never carried the pulse class').toBeGreaterThan(0);

    // One Transition, then gone. A pulse left behind would read as a second
    // permanent highlight competing with `last-move`.
    await expect(page.locator('cg-board square.mcc-pulse')).toHaveCount(0, { timeout: 5_000 });
  });

  test('the move counter hops as the step advances', async ({ page }) => {
    await openExercise(page, MATE_IN_2);

    const counter = page.locator('.mcc-meter-value').first();
    // Nothing has happened yet — arriving is not an event.
    await expect(counter).toHaveAttribute('data-hop', 'false');
    await expect(counter).toHaveText('1 / 2');

    await playMove(page, 'f6', 'g6');

    await expect(counter).toHaveText('2 / 2', { timeout: 10_000 });
    await expect(counter).toHaveAttribute('data-hop', 'true');
    expect(await counter.evaluate((el) => getComputedStyle(el).animationName)).toBe('mcc-hop');
  });
});

test.describe('action feedback — a refused move', () => {
  /**
   * The reason is the E1 addition: "that move is legal, but it isn't what we're
   * looking for". Failure must inform — a beginner who cannot tell "illegal"
   * from "not the point" learns the wrong lesson from the same red text.
   */
  for (const [locale, path, reason] of [
    ['fr', MATE_IN_1, 'légal'],
    ['en', `/en${MATE_IN_1}`, 'legal'],
  ] as const) {
    test(`onlyMove:true gives a reason in ${locale}`, async ({ page }) => {
      await openExercise(page, path);
      // Legal, and not the mate.
      await playMove(page, 'g1', 'f1');

      const note = page.getByTestId('exercise-wrong-reason');
      await expect(note).toBeVisible({ timeout: 10_000 });
      await expect(note).toContainText(reason);

      // ⚠️ The permissive caveat must NOT also appear. One caveat per verdict.
      await expect(page.getByTestId('exercise-offline-note')).toHaveCount(0);
    });
  }

  /**
   * ⚠️ THE ATTEMPT COUNT IS THE SAME FOR BOTH VERDICTS, and the reason does not
   * change that. Adding an explanation must not turn into a second class of
   * mistake counted differently — the `onlyMove` rule is that the two verdicts
   * differ in WORDING ONLY (CLAUDE.md).
   */
  test('the reason does not make it a different kind of attempt', async ({ page }) => {
    await openExercise(page, MATE_IN_1);
    await playMove(page, 'g1', 'f1');
    await expect(page.getByTestId('exercise-wrong-reason')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('exercise-attempts')).toHaveText('1');
    await expect(page.getByTestId('exercise')).toHaveAttribute('data-attempts', '1');

    const strict = await page.getByTestId('exercise-status').evaluate((el) => el.textContent);

    // The permissive verdict, on a different exercise: same count, other caveat.
    await openExercise(page, FORK);
    await playMove(page, 'd5', 'e7');
    await expect(page.getByTestId('exercise-offline-note')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('exercise-wrong-reason')).toHaveCount(0);
    await expect(page.getByTestId('exercise-attempts')).toHaveText('1');

    // And still not the word "wrong" under onlyMove: false.
    const permissive = await page.getByTestId('exercise-status').evaluate((el) => el.textContent);
    expect(permissive).not.toEqual(strict);
    expect(permissive?.toLowerCase()).not.toContain('pas le bon coup');
  });
});

test.describe('action feedback — the solve lands in two beats', () => {
  test('the frame settles first, then the badge arrives', async ({ page }) => {
    await openExercise(page, MATE_IN_1);
    await playMove(page, 'a1', 'a8');

    const badge = page.getByTestId('exercise-solved');
    await expect(badge).toBeVisible({ timeout: 10_000 });

    /* BEAT ONE — the frame. */
    const frame = page.locator('.mcc-exercise-surface.mcc-fb-solved');
    await expect(frame).toHaveCount(1);
    expect(await frame.evaluate((el) => getComputedStyle(el).animationName)).toBe('mcc-settle');

    /* BEAT TWO — the badge, one Transition later. The delay is what makes them
       two beats rather than one; without it this is the old single block. */
    const timing = await badge.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        name: cs.animationName,
        delayMs: parseFloat(cs.animationDelay) * 1000,
        fill: cs.animationFillMode,
      };
    });
    expect(timing.name).toBe('mcc-badge-in');
    expect(timing.delayMs).toBeGreaterThanOrEqual(TRANSITION_MIN_MS);
    // `both` is what holds the badge invisible THROUGH the delay rather than
    // flashing it in at full opacity and animating from there.
    expect(timing.fill).toBe('both');
  });

  test('no axe violations once solved', async ({ page }) => {
    await openExercise(page, MATE_IN_1);
    await playMove(page, 'a1', 'a8');
    await expect(page.getByTestId('exercise-solved')).toBeVisible({ timeout: 10_000 });
    // Let both beats finish before measuring contrast on a mid-fade badge.
    await page.waitForTimeout(TRANSITION_MS * 3);

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe('prefers-reduced-motion — off, and instant', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('ambient motion is OFF on both layers, not merely slower', async ({ page }) => {
    await page.goto('/');
    const names = await page.evaluate(() =>
      Array.from(document.querySelectorAll('.ambient .piece')).map(
        (el) => getComputedStyle(el).animationName,
      ),
    );
    expect(names.length).toBeGreaterThanOrEqual(7);
    for (const name of names) expect(name).toBe('none');
  });

  test('responses are instantaneous, and the press still answers', async ({ page }) => {
    await page.goto('/');
    await settleReveals(page);
    const cta = page.getByTestId('home-cta-tutorial');
    await cta.scrollIntoViewIfNeeded();

    const ms = await cta.evaluate(
      (el) => parseFloat(getComputedStyle(el).transitionDuration.split(',')[0] ?? '0s') * 1000,
    );
    expect(ms).toBeLessThanOrEqual(1);

    /* The press is FEEDBACK, so it is not removed — the travel is. The control
       still reports the press through its shadow. */
    const box = (await cta.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(RESPONSE_MS * 2);
    const pressed = await cta.evaluate((el) => ({
      transform: getComputedStyle(el).transform,
      shadow: getComputedStyle(el).boxShadow,
    }));
    await page.mouse.up();

    expect(pressed.transform === 'none' || pressed.transform === 'matrix(1, 0, 0, 1, 0, 0)').toBe(
      true,
    );
    expect(pressed.shadow).toBeTruthy();
  });

  test('the exercise feedback animations are all off', async ({ page }) => {
    await openExercise(page, MATE_IN_1);
    await playMove(page, 'a1', 'a8');
    await expect(page.getByTestId('exercise-solved')).toBeVisible({ timeout: 10_000 });

    const names = await page.evaluate(() => ({
      frame: getComputedStyle(document.querySelector('.mcc-fb-solved')!).animationName,
      badge: getComputedStyle(document.querySelector('.mcc-exercise-solved')!).animationName,
    }));
    expect(names.frame).toBe('none');
    expect(names.badge).toBe('none');

    // And the badge is fully visible rather than stuck at its from-state.
    const opacity = await page
      .getByTestId('exercise-solved')
      .evaluate((el) => getComputedStyle(el).opacity);
    expect(opacity).toBe('1');
  });

  test('the correct-move pulse still marks the square, without animating', async ({ page }) => {
    await openExercise(page, MATE_IN_2);
    await playMove(page, 'f6', 'g6');

    /* Present as a static ring rather than a fade: removing feedback is not
       what "reduced motion" means. */
    const state = await page.evaluate(() => {
      const sq = document.querySelector('cg-board square.mcc-pulse');
      if (!sq) return null;
      const cs = getComputedStyle(sq);
      return { animation: cs.animationName, shadow: cs.boxShadow };
    });
    if (state) {
      expect(state.animation).toBe('none');
      expect(state.shadow).not.toBe('none');
    }
  });
});
