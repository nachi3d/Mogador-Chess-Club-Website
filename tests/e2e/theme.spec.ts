import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Theming — dark mode, board presets, and a reader's own colours.
 *
 * The theme is applied by an inline head script so it lands before first paint.
 * That makes two things worth testing that normally are not: WHEN the theme is
 * applied (not just whether), and that a broken stored value degrades to the
 * default rather than to an unstyled page.
 */

const KEY = 'mcc:theme:v1';
const SETTINGS_FR = '/parametres/';
const SETTINGS_EN = '/en/parametres/';

/** Seed the stored theme before any page script runs. */
async function seedTheme(page: Page, value: unknown) {
  await page.addInitScript(
    ([key, raw]) => {
      try {
        /* ONLY IF ABSENT. `addInitScript` runs on every navigation, so writing
           unconditionally would re-seed the starting state after a reload and
           quietly undo whatever the test just did — which is exactly how the
           "reset returns to the preset" test first "failed". */
        if (!window.localStorage.getItem(key as string)) {
          window.localStorage.setItem(key as string, raw as string);
        }
      } catch {
        /* the broken-storage test installs a throwing localStorage */
      }
    },
    [KEY, typeof value === 'string' ? value : JSON.stringify(value)] as const,
  );
}

/**
 * Open the "Personnaliser" disclosure.
 *
 * ⚠️ EVERY BOARD AND CUSTOM-COLOUR CONTROL LIVES INSIDE IT NOW (E6). That is
 * the hierarchy working, not an obstacle: the theme is level 1 and picks a
 * board for you, so the presets and the colour pickers are deliberately one
 * gesture away. A test that reaches straight for `[data-custom-light]` fails
 * with "element is not visible", which is the correct behaviour.
 */
async function openAdvanced(page: Page) {
  const advanced = page.locator('[data-advanced]');
  if (!(await advanced.evaluate((el: HTMLDetailsElement) => el.open))) {
    await advanced.locator('summary').click();
  }
  await expect(advanced).toHaveJSProperty('open', true);
}

/** Click a preset tile the way a reader does — the radio itself is hidden. */
async function pickBoard(page: Page, id: string) {
  await openAdvanced(page);
  await page.locator(`[data-board-label="${id}"]`).click();
}

/** A CSS custom property as the browser actually resolves it on <html>. */
const cssVar = (page: Page, name: string) =>
  page.evaluate(
    (property) => getComputedStyle(document.documentElement).getPropertyValue(property).trim(),
    name,
  );

test.describe('theme — dark mode', () => {
  test('an explicit choice persists across a reload', async ({ page }) => {
    await page.goto(SETTINGS_FR);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.getByRole('radio', { name: 'Sombre' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // And on a different page — the preference is the site's, not the page's.
    await page.goto('/pieges/legal/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('the header toggle cycles light → dark → system', async ({ page }) => {
    await page.goto('/');
    const toggle = page.getByRole('button', { name: /apparence/i });
    await expect(toggle).toBeVisible();

    // Starts on `system`, which resolves to light under the default emulation.
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); // → light
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark'); // → dark
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light'); // → system

    // The accessible name states WHERE YOU ARE, not just what the button does.
    await expect(toggle).toHaveAttribute('aria-label', /système|system/i);
  });

  test('system mode follows the OS setting', async ({ page }) => {
    await seedTheme(page, { mode: 'system', boardTheme: 'classique' });

    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    // Live, without a reload — the matchMedia listener in the head script.
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('an explicit choice overrides the OS setting', async ({ page }) => {
    await seedTheme(page, { mode: 'light', boardTheme: 'classique' });
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('dark mode actually repaints the page, not just the attribute', async ({ page }) => {
    await seedTheme(page, { mode: 'dark', boardTheme: 'classique' });
    await page.goto('/');

    const background = await page.evaluate(
      () => getComputedStyle(document.documentElement).backgroundColor,
    );
    // The dark page surface is #101a14.
    expect(background).toBe('rgb(16, 26, 20)');
  });
});

/**
 * ⚠️ THE NO-FLASH TEST.
 *
 * The theme has to be on `<html>` BEFORE the body exists, or a dark-mode
 * reader gets a white flash on every navigation. Asserting the attribute after
 * load would pass even if the script ran last.
 *
 * So: a MutationObserver installed at document-start records the attribute at
 * the moment `<body>` first appears. If the theme script is ever moved out of
 * the head, made a module, or made async, this is what fails.
 */
test('the theme is applied before the body exists', async ({ page }) => {
  await seedTheme(page, { mode: 'dark', boardTheme: 'bleu' });
  await page.addInitScript(() => {
    (window as unknown as Record<string, unknown>)['__themeAtBody'] = 'body-never-appeared';
    /* Observe `document`, not `document.documentElement`: at document-start
       the <html> element does not exist yet, so observing it throws and the
       whole probe silently records nothing. */
    new MutationObserver((_records, observer) => {
      if (!document.body) return;
      (window as unknown as Record<string, unknown>)['__themeAtBody'] = JSON.stringify({
        theme: document.documentElement.getAttribute('data-theme'),
        board: document.documentElement.className,
      });
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });

  await page.goto('/');
  const atBody = await page.evaluate(
    () => (window as unknown as Record<string, string>)['__themeAtBody'],
  );

  expect(atBody, 'the theme script did not run before <body>').not.toBe('body-never-appeared');
  expect(atBody).toBeTruthy();
  const state = JSON.parse(atBody!) as { theme: string; board: string };
  expect(state.theme).toBe('dark');
  expect(state.board).toContain('board-bleu');
});

test.describe('theme — board presets', () => {
  test('a preset applies on a trap page, where the real board is', async ({ page }) => {
    await seedTheme(page, { mode: 'light', boardTheme: 'bleu' });
    await page.goto('/pieges/legal/');

    await expect(page.locator('html')).toHaveClass(/board-bleu/);
    expect(await cssVar(page, '--mcc-board-light')).toBe('#dbe4ec');
    expect(await cssVar(page, '--mcc-board-dark')).toBe('#456a8c');
    // The two-ink rule: this preset's dark square takes the cream ink.
    expect(await cssVar(page, '--mcc-board-dark-ink')).toBe('#fffdf7');
  });

  test('choosing a preset applies it and persists', async ({ page }) => {
    await page.goto(SETTINGS_FR);
    await pickBoard(page, 'bois');
    await expect(page.locator('html')).toHaveClass(/board-bois/);

    await page.goto('/exercices/mat-du-couloir/');
    await expect(page.locator('html')).toHaveClass(/board-bois/);
    expect(await cssVar(page, '--mcc-board-light')).toBe('#e6cfa8');
  });

  test('every preset is offered, plus "follow the theme", and exactly one is selected', async ({
    page,
  }) => {
    await page.goto(SETTINGS_FR);
    await openAdvanced(page);
    /* Six presets since E6 added `phosphore` for the Terminal theme, plus the
       "Suivre le thème" option that un-pins. Seven radios, one group. */
    const boards = page.locator('[data-board-input]');
    await expect(boards).toHaveCount(7);
    await expect(page.locator('[data-board-input]:checked')).toHaveCount(1);
    /* With nothing stored, the checked one is "follow" — not a preset. The
       reader has expressed no board preference and the theme decides. */
    await expect(page.locator('[data-board-input]:checked')).toHaveValue('follow');
  });
});

test.describe('theme — custom colours', () => {
  test('custom colours apply, and override the preset', async ({ page }) => {
    await page.goto(SETTINGS_FR);
    await openAdvanced(page);

    await page.locator('[data-custom-light]').fill('#ffcc00');
    await page.locator('[data-custom-dark]').fill('#333366');
    await page.locator('[data-custom-apply]').click();

    expect(await cssVar(page, '--mcc-board-light')).toBe('#ffcc00');
    expect(await cssVar(page, '--mcc-board-dark')).toBe('#333366');
    // Inks are DERIVED, never chosen: dark ink on the light square, cream on
    // the dark one. Same rule the presets state explicitly.
    expect(await cssVar(page, '--mcc-board-light-ink')).toBe('#14120e');
    expect(await cssVar(page, '--mcc-board-dark-ink')).toBe('#fffdf7');

    // And they survive onto a real board.
    await page.goto('/pieges/legal/');
    expect(await cssVar(page, '--mcc-board-light')).toBe('#ffcc00');
  });

  /**
   * The reader is warned, NOT blocked. It is their board — but an unreadable
   * one should be a choice rather than an accident, so the warning appears
   * immediately and stays while the colours are in use.
   */
  test('a pair that fails AA warns without refusing', async ({ page }) => {
    await page.goto(SETTINGS_FR);
    await openAdvanced(page);

    // ~4.36:1 for whichever ink is better — below the 4.5 needed for text.
    await page.locator('[data-custom-light]').fill('#7a7a7a');
    await expect(page.locator('[data-contrast-warning]')).toBeVisible();
    await expect(page.locator('[data-contrast-warning]')).toContainText('Lisibilité réduite');

    // The numbers are shown too, so a reader nudging a colour can see which
    // direction helps rather than guessing at a pass/fail.
    await expect(page.locator('[data-ratio-light]')).toHaveText(/^\d\.\d:1$/);

    // Still applies — the site does not overrule them.
    await page.locator('[data-custom-apply]').click();
    expect(await cssVar(page, '--mcc-board-light')).toBe('#7a7a7a');
    await expect(page.locator('[data-contrast-warning]')).toBeVisible();
  });

  test('a good pair shows no warning', async ({ page }) => {
    await page.goto(SETTINGS_FR);
    await openAdvanced(page);
    await page.locator('[data-custom-light]').fill('#f0e6cc');
    await page.locator('[data-custom-dark]').fill('#3d5c46');
    await expect(page.locator('[data-contrast-warning]')).toBeHidden();
  });

  test('reset returns to the chosen preset', async ({ page }) => {
    await seedTheme(page, {
      mode: 'light',
      boardTheme: 'tournoi',
      custom: { light: '#ffcc00', dark: '#333366' },
    });
    await page.goto(SETTINGS_FR);
    /* Already open on arrival: the script opens the disclosure when a pinned
       board or custom colours are in force, so a setting the reader is USING is
       never hidden behind a closed summary. */
    await expect(page.locator('[data-advanced]')).toHaveJSProperty('open', true);
    expect(await cssVar(page, '--mcc-board-light')).toBe('#ffcc00');

    await page.locator('[data-custom-reset]').click();
    // Back to the preset that was underneath, not to Classique.
    expect(await cssVar(page, '--mcc-board-light')).toBe('#eeeed2');

    await page.reload();
    expect(await cssVar(page, '--mcc-board-light')).toBe('#eeeed2');
  });

  test('choosing a preset drops the custom colours', async ({ page }) => {
    await seedTheme(page, {
      mode: 'light',
      boardTheme: 'classique',
      custom: { light: '#ffcc00', dark: '#333366' },
    });
    await page.goto(SETTINGS_FR);
    await pickBoard(page, 'glace');

    // Otherwise the grid would show Glace selected while the board stayed gold.
    expect(await cssVar(page, '--mcc-board-light')).toBe('#eef3f7');
  });
});

test.describe('theme — surviving bad input', () => {
  /*
   * ⚠️ THE EXPECTED BOARD IS PER-FIXTURE, NOT ONE CONSTANT — a distinction E6
   * introduced and it is worth stating, because the obvious blanket assertion
   * is wrong in both directions.
   *
   * `boardTheme` is now a PIN, and a pin is honoured whenever it is valid, even
   * if the rest of the record is rubbish. So a fixture whose damage is in
   * `mode` or in `custom` still has a perfectly good `classique` pin and must
   * keep it — throwing away a valid preference because a neighbouring field was
   * corrupt would be exactly the "normalise field by field, never cast" rule
   * being broken. Only a fixture with no usable pin falls through to the
   * theme's own board, which for Bois is `bois`.
   */
  const BAD = [
    ['not json at all', 'nonsense{', 'bois'],
    ['a JSON string, not an object', '"dark"', 'bois'],
    ['an unknown mode', '{"mode":"neon","boardTheme":"classique"}', 'classique'],
    ['an unknown board', '{"mode":"light","boardTheme":"../evil"}', 'bois'],
    [
      'half a custom pair',
      '{"mode":"light","boardTheme":"classique","custom":{"light":"#fff"}}',
      'classique',
    ],
    [
      'a non-colour custom',
      '{"mode":"light","boardTheme":"classique","custom":{"light":"red","dark":"blue"}}',
      'classique',
    ],
  ] as const;

  /** The light square of each preset a fixture can land on. */
  const SQUARE: Record<string, string> = { bois: '#e6cfa8', classique: '#e8dcbe' };

  for (const [name, raw, expectedBoard] of BAD) {
    test(`${name} degrades to a coherent theme`, async ({ page }) => {
      await seedTheme(page, raw);
      await page.goto('/pieges/legal/');

      /* The theme itself never survives a damaged record, so it is always the
         default — and a default theme is a COMPLETE one: surfaces, board and
         pieces all from Bois. Never unstyled, never half-applied. */
      await expect(page.locator('html')).toHaveClass(/theme-bois/);
      await expect(page.locator('html')).toHaveClass(/pieces-merida/);
      await expect(page.locator('html')).toHaveClass(
        new RegExp(`board-${expectedBoard}(\\s|$)`),
      );
      expect(await cssVar(page, '--mcc-board-light')).toBe(SQUARE[expectedBoard]);
      await expect(page.locator('html')).toHaveAttribute('data-theme', /^(light|dark)$/);
    });
  }

  /**
   * Safari private mode throws on `setItem`; a full quota throws; an embedded
   * context can throw on `localStorage` itself. The theme must degrade to the
   * default and the page must still work — including the settings page, whose
   * whole job is writing to the thing that is broken.
   */
  test('a broken localStorage does not break the page', async ({ page }) => {
    await page.addInitScript(() => {
      const boom = () => {
        throw new DOMException('QuotaExceededError');
      };
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        get: () => ({ getItem: boom, setItem: boom, removeItem: boom, clear: boom }),
      });
    });

    await page.goto(SETTINGS_FR);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    // The controls still work for this session; only remembering is lost.
    await page.getByRole('radio', { name: 'Sombre' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });
});

test.describe('theme — accessibility', () => {
  for (const [name, path] of [
    ['settings FR', SETTINGS_FR],
    ['settings EN', SETTINGS_EN],
  ] as const) {
    test(`${name} has no axe violations`, async ({ page }) => {
      await page.goto(path);
      await expectNoAxeViolations(page);
    });

    test(`${name} has no axe violations in dark mode`, async ({ page }) => {
      await seedTheme(page, { mode: 'dark', boardTheme: 'classique' });
      await page.goto(path);
      await expectNoAxeViolations(page);
    });
  }

  /** Dark mode has to clear AA on the pages people actually read, not just
      on the settings page that switches it. */
  for (const path of ['/', '/pieges/legal/', '/exercices/mat-du-couloir/', '/jouer/'] as const) {
    test(`${path} has no axe violations in dark mode`, async ({ page }) => {
      await seedTheme(page, { mode: 'dark', boardTheme: 'classique' });
      await page.goto(path);
      await expectNoAxeViolations(page);
    });
  }
});

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`);
  expect(summary, summary.join('\n')).toEqual([]);
}
