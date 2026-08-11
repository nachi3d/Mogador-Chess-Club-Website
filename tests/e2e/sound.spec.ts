import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { movePiece, typeMove } from './helpers/board';

/**
 * E2 — sound.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ PLAYWRIGHT CANNOT HEAR ANYTHING, AND THIS FILE DOES NOT PRETEND TO.
 *
 * What is asserted here is the CONTRACT around the audio, never the audio:
 * that no `AudioContext` exists before a gesture, that sound is off until
 * asked for, that the preference survives a reload, that exactly one context
 * is ever built, that the invitation is offered once and never again, and that
 * broken storage falls back to silence.
 *
 * What NO machine here can check — stated plainly because a suite that looks
 * complete and is not is worse than one that admits its edge:
 *
 *   - whether the sounds are pleasant, or in tune, or at sensible volumes;
 *   - whether the wrong-move note reads as corrective rather than punishing,
 *     which is the single most important property in the whole feature;
 *   - whether anything grates after twenty exercises.
 *
 * Those are in `docs/MANUAL-TESTS.md` and only a person can run them.
 * ═════════════════════════════════════════════════════════════════════════
 */

const SOUND_KEY = 'mcc:sound:v1';
const EXERCISE = '/exercices/mat-du-couloir/';

/**
 * Count `AudioContext` constructions, and record every `resume`/`close`.
 *
 * ⚠️ INSTALLED VIA `addInitScript`, so it is in place before any page script
 * runs. A patch applied after `goto` could not see a context built during
 * hydration, which is precisely the case worth catching.
 */
async function countContexts(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __ctx: number;
      AudioContext?: unknown;
      webkitAudioContext?: unknown;
    };
    w.__ctx = 0;
    for (const name of ['AudioContext', 'webkitAudioContext'] as const) {
      const Original = (w as Record<string, unknown>)[name] as
        | (new (...args: unknown[]) => unknown)
        | undefined;
      if (!Original) continue;
      const Patched = function (this: unknown, ...args: unknown[]) {
        w.__ctx += 1;
        return new Original(...args);
      } as unknown as new (...args: unknown[]) => unknown;
      Patched.prototype = Original.prototype;
      (w as Record<string, unknown>)[name] = Patched;
    }
  });
}

const contexts = (page: Page) => page.evaluate(() => (window as unknown as { __ctx: number }).__ctx);

/**
 * ⚠️ NOT EVERY BROWSER BUILD IN THIS MATRIX HAS WEB AUDIO.
 *
 * Playwright's headless **WebKit** ships with neither `AudioContext` nor
 * `webkitAudioContext` — both are `undefined`, and constructing one reports
 * "no constructor". Verified with a probe, on `webkit` and `iphone-13`.
 *
 * That is a limitation of the test build, NOT of Safari: real Safari has had
 * unprefixed Web Audio since 14.1 and the prefixed form long before. And it is
 * not a product bug either — `audio()` returns null, `play()` gives up quietly,
 * and the exercise carries on, which is exactly the designed behaviour and is
 * asserted below in "a browser with no Web Audio".
 *
 * So the tests that need a context to EXIST skip here, visibly and with the
 * reason attached. A test that cannot run must say so rather than pass
 * vacuously — the same rule the auth specs follow when `.env.test` is absent.
 */
const hasWebAudio = (page: Page) =>
  page.evaluate(
    () =>
      typeof (window as unknown as { AudioContext?: unknown }).AudioContext !== 'undefined' ||
      typeof (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext !==
        'undefined',
  );

async function seedSound(page: Page, value: unknown) {
  await page.addInitScript(
    ([key, raw]) => {
      try {
        window.localStorage.setItem(key as string, raw as string);
      } catch {
        /* the broken-storage test installs a throwing localStorage */
      }
    },
    [SOUND_KEY, JSON.stringify(value)],
  );
}

async function openExercise(page: Page, path = EXERCISE) {
  await page.goto(path);
  const board = page.locator('[data-testid="chessboard"]').first();
  await board.locator('cg-board').waitFor({ timeout: 20_000 });
  await board.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await expect(page.locator('.mcc-exercise').first()).toHaveAttribute('data-ready', 'true', {
    timeout: 20_000,
  });
}

/* ═══ Nothing before a gesture ═══════════════════════════════════════════ */

test.describe('no AudioContext exists before a user gesture', () => {
  for (const [name, path] of [
    ['an exercise page', EXERCISE],
    ['the play page', '/jouer/'],
    ['the home page', '/'],
  ] as const) {
    test(`${name} builds none on load`, async ({ page }) => {
      await countContexts(page);
      /* Sound ON, so this is not passing merely because the feature is off —
         the gate under test is the GESTURE, not the preference. */
      await seedSound(page, { enabled: true, volume: 'moyen', invited: true });
      await page.goto(path);
      await page.waitForLoadState('load');
      expect(await contexts(page)).toBe(0);
    });
  }

  test('hydrating the board island builds none either', async ({ page }) => {
    await countContexts(page);
    await seedSound(page, { enabled: true, volume: 'moyen', invited: true });
    await openExercise(page);
    /* The island is live — `data-ready` is true — and still no context. */
    expect(await contexts(page)).toBe(0);
  });
});

/* ═══ Off by default ═════════════════════════════════════════════════════ */

test.describe('sound is off until it is asked for', () => {
  test('a fresh reader has nothing stored and the toggle is unchecked', async ({ page }) => {
    await page.goto('/parametres/');
    const toggle = page.locator('[data-sound-toggle]');
    await expect(toggle).not.toBeChecked();
    expect(await page.evaluate((k) => window.localStorage.getItem(k), SOUND_KEY)).toBeNull();
  });

  test('the volume steps are inert while sound is off', async ({ page }) => {
    await page.goto('/parametres/');
    const steps = page.locator('[data-volume-input]');
    await expect(steps).toHaveCount(3);
    for (let i = 0; i < 3; i++) await expect(steps.nth(i)).toBeDisabled();
  });

  test('a fresh reader solving a move builds no context', async ({ page }) => {
    await countContexts(page);
    await openExercise(page);
    await movePiece(page, 'a1', 'a8');
    await expect(page.locator('.mcc-exercise').first()).toHaveAttribute('data-state', 'solved', {
      timeout: 15_000,
    });
    /* A gesture HAS happened. Still nothing, because sound is off. */
    expect(await contexts(page)).toBe(0);
  });
});

/* ═══ The toggle, and persistence ════════════════════════════════════════ */

test.describe('the toggle persists', () => {
  test('switching on survives a reload, and switching off again survives too', async ({ page }) => {
    await page.goto('/parametres/');
    const toggle = page.locator('[data-sound-toggle]');
    await toggle.check();
    await expect(toggle).toBeChecked();

    await page.reload();
    await expect(page.locator('[data-sound-toggle]')).toBeChecked();
    /* And the volume steps came alive with it. */
    await expect(page.locator('[data-volume-input]').first()).toBeEnabled();

    await page.locator('[data-sound-toggle]').uncheck();
    await page.reload();
    await expect(page.locator('[data-sound-toggle]')).not.toBeChecked();
  });

  test('a volume choice persists', async ({ page }) => {
    await page.goto('/parametres/');
    await page.locator('[data-sound-toggle]').check();
    await page.locator('[data-volume-input][value="fort"]').check();
    await page.reload();
    await expect(page.locator('[data-volume-input][value="fort"]')).toBeChecked();
  });

  test('the stored record is exactly the documented shape', async ({ page }) => {
    await page.goto('/parametres/');
    await page.locator('[data-sound-toggle]').check();
    const raw = await page.evaluate((k) => window.localStorage.getItem(k), SOUND_KEY);
    expect(JSON.parse(raw ?? '{}')).toEqual({ enabled: true, volume: 'moyen', invited: false });
  });
});

/* ═══ One context, not one per move ══════════════════════════════════════ */

test.describe('exactly one AudioContext is ever built', () => {
  test('four moves on a live board build one context in total', async ({ page }) => {
    await countContexts(page);
    await page.goto('/');
    test.skip(!(await hasWebAudio(page)), 'this browser build ships no Web Audio at all');
    await seedSound(page, { enabled: true, volume: 'moyen', invited: true });
    /* Two player moves and a scripted reply between them. */
    await openExercise(page, '/exercices/opposition-et-mat/');

    await typeMove(page, 'Kg6');
    await expect(page.locator('.mcc-exercise').first()).toHaveAttribute('data-busy', 'false', {
      timeout: 15_000,
    });
    expect(await contexts(page), 'the first sound should build the context').toBe(1);

    await typeMove(page, 'Ra8');
    await expect(page.locator('.mcc-exercise').first()).toHaveAttribute('data-state', 'solved', {
      timeout: 15_000,
    });

    expect(
      await contexts(page),
      'a second context means one is being built per sound, which exhausts the browser limit',
    ).toBe(1);
  });
});

/* ═══ Something is actually synthesised ══════════════════════════════════ */

/**
 * ⚠️ THE CLOSEST A MACHINE GETS TO "DID IT MAKE A NOISE".
 *
 * Counting contexts proves the plumbing exists; counting OSCILLATORS proves the
 * synthesis path ran end to end — a voice was looked up, a graph was built and
 * started. It still says nothing about what it sounded like, which is the part
 * only Seàn can judge.
 */
async function countOscillators(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __osc: number };
    w.__osc = 0;
    const Ctor = window.AudioContext;
    if (!Ctor) return;
    const original = Ctor.prototype.createOscillator;
    Ctor.prototype.createOscillator = function (this: AudioContext) {
      w.__osc += 1;
      return original.call(this);
    };
  });
}

const oscillators = (page: Page) =>
  page.evaluate(() => (window as unknown as { __osc: number }).__osc);

test.describe('sound is synthesised, not merely wired up', () => {
  test('with sound ON a solve builds oscillators; with it OFF it builds none', async ({ page }) => {
    await countOscillators(page);
    await page.goto('/');
    test.skip(!(await hasWebAudio(page)), 'this browser build ships no Web Audio at all');
    await seedSound(page, { enabled: true, volume: 'moyen', invited: true });
    await openExercise(page);
    await movePiece(page, 'a1', 'a8');
    await expect(page.locator('.mcc-exercise').first()).toHaveAttribute('data-state', 'solved', {
      timeout: 15_000,
    });
    /* The move voice and the solve voice — several tones between them. */
    expect(await oscillators(page)).toBeGreaterThan(0);

    /* ⚠️ A new page in the SAME context shares `localStorage`, so it would
       inherit the `enabled: true` seeded above and play. Seed it off
       explicitly — the contrast is the whole point of this test. */
    const silent = await page.context().newPage();
    await countOscillators(silent);
    await seedSound(silent, { enabled: false, volume: 'moyen', invited: true });
    await silent.goto(EXERCISE);
    await silent.locator('cg-board').waitFor({ timeout: 20_000 });
    await silent
      .locator('cg-board')
      .evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await expect(silent.locator('.mcc-exercise').first()).toHaveAttribute('data-ready', 'true', {
      timeout: 20_000,
    });
    await movePiece(silent, 'a1', 'a8');
    await expect(silent.locator('.mcc-exercise').first()).toHaveAttribute('data-state', 'solved', {
      timeout: 15_000,
    });
    expect(await oscillators(silent)).toBe(0);
    await silent.close();
  });

  test('a hidden tab makes no sound', async ({ page }) => {
    await countOscillators(page);
    await page.goto('/');
    /* Skipped rather than passed vacuously: with no Web Audio the count is
       zero for a reason that has nothing to do with visibility. */
    test.skip(!(await hasWebAudio(page)), 'this browser build ships no Web Audio at all');
    await seedSound(page, { enabled: true, volume: 'moyen', invited: true });
    /* Pin `visibilityState` before any script runs — a sound from a tab the
       reader is not looking at is unattributable noise. */
    await page.addInitScript(() => {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => 'hidden',
      });
    });
    await openExercise(page);
    await movePiece(page, 'a1', 'a8');
    await expect(page.locator('.mcc-exercise').first()).toHaveAttribute('data-state', 'solved', {
      timeout: 15_000,
    });
    expect(await oscillators(page), 'a hidden tab played something').toBe(0);
  });
});

/* ═══ Graceful degradation ══════════════════════════════════════════════ */

/**
 * ⚠️ THE CASE PLAYWRIGHT'S WEBKIT FOUND FOR US, MADE DELIBERATE.
 *
 * Some browsers have no Web Audio, and some devices have no audio output at
 * all. `play()` must give up quietly — never throw, never block the move, never
 * leave the board half-judged. That is safe precisely because sound is never
 * the only signal.
 *
 * Simulated rather than left to one project, so it runs on all five and cannot
 * silently stop being covered when a browser build changes.
 */
test('a browser with no Web Audio still solves, silently and without errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>)['AudioContext'];
    delete (window as unknown as Record<string, unknown>)['webkitAudioContext'];
  });
  /* Sound ON, so the code really does try to play and really does have to cope. */
  await seedSound(page, { enabled: true, volume: 'fort', invited: true });

  await openExercise(page);
  await movePiece(page, 'a1', 'a8');
  await expect(page.locator('.mcc-exercise').first()).toHaveAttribute('data-state', 'solved', {
    timeout: 15_000,
  });
  expect(errors, 'a missing AudioContext threw instead of degrading').toEqual([]);
});

/* ═══ The one-time invitation ════════════════════════════════════════════ */

test.describe('the invitation is offered once', () => {
  test('it appears on the first solve, and declining retires it for good', async ({ page }) => {
    await openExercise(page);
    await expect(page.getByTestId('sound-invite')).toHaveCount(0);

    await movePiece(page, 'a1', 'a8');
    await expect(page.getByTestId('sound-invite')).toBeVisible({ timeout: 15_000 });

    await page.getByTestId('sound-invite-decline').click();
    await expect(page.getByTestId('sound-invite')).toHaveCount(0);
    /* Declining records that it was ASKED — that is what makes it one-time. */
    const stored = await page.evaluate((k) => window.localStorage.getItem(k), SOUND_KEY);
    expect(JSON.parse(stored ?? '{}')).toMatchObject({ enabled: false, invited: true });

    /* Solve it again, in a fresh page: no second offer, ever. */
    await page.reload();
    await openExercise(page);
    await movePiece(page, 'a1', 'a8');
    await expect(page.locator('.mcc-exercise').first()).toHaveAttribute('data-state', 'solved', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('sound-invite')).toHaveCount(0);
  });

  test('accepting turns sound on and says so', async ({ page }) => {
    await openExercise(page);
    await movePiece(page, 'a1', 'a8');
    await page.getByTestId('sound-invite-accept').click();

    await expect(page.getByTestId('sound-invite-accepted')).toBeVisible();
    const stored = await page.evaluate((k) => window.localStorage.getItem(k), SOUND_KEY);
    expect(JSON.parse(stored ?? '{}')).toMatchObject({ enabled: true, invited: true });

    /* And the settings page agrees — one store, one answer. */
    await page.goto('/parametres/');
    await expect(page.locator('[data-sound-toggle]')).toBeChecked();
  });

  test('it is never offered to a reader who has already enabled sound', async ({ page }) => {
    await seedSound(page, { enabled: true, volume: 'moyen', invited: false });
    await openExercise(page);
    await movePiece(page, 'a1', 'a8');
    await expect(page.locator('.mcc-exercise').first()).toHaveAttribute('data-state', 'solved', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('sound-invite')).toHaveCount(0);
  });

  /**
   * ⚠️ REDUCED MOTION DOES NOT SILENCE THE SITE — it suppresses the OFFER.
   *
   * The two are different senses and coupling them is a category error; the
   * preference is about vestibular discomfort, not hearing. But a reader who
   * has asked for calm should not be interrupted with an unprompted question,
   * and `/parametres/` is exactly as reachable for them as for anyone.
   */
  test('a reader who asked for reduced motion is not invited', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openExercise(page);
    await movePiece(page, 'a1', 'a8');
    await expect(page.locator('.mcc-exercise').first()).toHaveAttribute('data-state', 'solved', {
      timeout: 15_000,
    });
    await expect(page.getByTestId('sound-invite')).toHaveCount(0);
  });

  test('but they can still switch sound on themselves', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/parametres/');
    const toggle = page.locator('[data-sound-toggle]');
    await toggle.check();
    await expect(toggle).toBeChecked();
    await page.reload();
    await expect(page.locator('[data-sound-toggle]')).toBeChecked();
  });
});

/* ═══ Failing silent ═════════════════════════════════════════════════════ */

test.describe('a broken store falls back to silence', () => {
  test('a throwing localStorage leaves a working, silent page', async ({ page }) => {
    await countContexts(page);
    await page.addInitScript(() => {
      const boom = () => {
        throw new Error('storage disabled');
      };
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get: boom,
      });
    });
    await openExercise(page);
    await movePiece(page, 'a1', 'a8');
    await expect(page.locator('.mcc-exercise').first()).toHaveAttribute('data-state', 'solved', {
      timeout: 15_000,
    });
    /* The exercise works. Sound stayed off, because unknown resolves to off. */
    expect(await contexts(page)).toBe(0);
  });

  test('a garbage record resolves to off rather than to noise', async ({ page }) => {
    await countContexts(page);
    await page.addInitScript(
      ([key]) => {
        try {
          window.localStorage.setItem(key as string, '{"enabled":"yes please","volume":42}');
        } catch {
          /* nothing to do */
        }
      },
      [SOUND_KEY],
    );
    await page.goto('/parametres/');
    /* `"yes please"` is not `true`. Anything but a real `true` is off. */
    await expect(page.locator('[data-sound-toggle]')).not.toBeChecked();

    await openExercise(page);
    await movePiece(page, 'a1', 'a8');
    await expect(page.locator('.mcc-exercise').first()).toHaveAttribute('data-state', 'solved', {
      timeout: 15_000,
    });
    expect(await contexts(page)).toBe(0);
  });
});

/* ═══ The event name the inline script duplicates ════════════════════════ */

test('the achievement event name matches the one sound.ts listens for', async ({ page }) => {
  /**
   * `ScoreResolver`'s script is `is:inline` and cannot import, so it hard-codes
   * the event name. This is the pin on that duplication — the same trick the
   * storage keys get.
   */
  await page.goto('/progres/');
  const inlineUsesIt = await page.evaluate(() =>
    [...document.querySelectorAll('script')].some((s) => s.textContent?.includes('mcc:achievement')),
  );
  expect(inlineUsesIt, 'ScoreResolver no longer dispatches mcc:achievement').toBe(true);
});

/* ═══ Accessibility ══════════════════════════════════════════════════════ */

test.describe('accessibility', () => {
  for (const [name, setup] of [
    ['sound off', async (_page: Page) => {}],
    [
      'sound on',
      async (page: Page) => {
        await seedSound(page, { enabled: true, volume: 'fort', invited: true });
      },
    ],
  ] as const) {
    test(`/parametres/ has no axe violations with ${name}`, async ({ page }) => {
      await setup(page);
      await page.goto('/parametres/');
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
    });
  }

  test('the invitation panel has no axe violations', async ({ page }) => {
    await openExercise(page);
    await movePiece(page, 'a1', 'a8');
    await expect(page.getByTestId('sound-invite')).toBeVisible({ timeout: 15_000 });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
