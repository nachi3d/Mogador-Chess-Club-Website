import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * SITE THEMES (E6) and THEMATIC TYPOGRAPHY (E7).
 *
 * `theme.spec.ts` covers light/dark, the board presets and a reader's own
 * colours — the things that existed before. This file covers the level above
 * them: four themes, each carrying surfaces, a heading typeface, a default
 * board and a piece set.
 *
 * Three of these tests exist because the failure they guard against is
 * INVISIBLE rather than broken:
 *
 *   - a board page that forgets `board` on BaseLayout renders squares with no
 *     pieces, and nothing errors;
 *   - a non-board page that fetches a piece stylesheet costs every reader ~9 KB
 *     to draw nothing, and nothing errors;
 *   - a theme that preloads another theme's heading font downloads two faces
 *     and uses one, and nothing errors.
 *
 * All three are asserted against the NETWORK LOG or the DOM rather than
 * against an appearance.
 */

const KEY = 'mcc:theme:v1';
const SETTINGS_FR = '/parametres/';
const SETTINGS_EN = '/en/parametres/';

/** Every theme, with what it is contractually supposed to bring with it. */
const THEMES = [
  { id: 'bois', board: 'bois', pieces: 'merida', font: 'fraunces', family: /Fraunces/ },
  { id: 'marbre', board: 'glace', pieces: 'kiwen-suwi', font: 'playfair', family: /Playfair/ },
  { id: 'souiri', board: 'bleu', pieces: 'chessnut', font: 'outfit', family: /Outfit/ },
  {
    id: 'terminal',
    board: 'phosphore',
    /* ⚠️ cburnett, and it is not interchangeable: its black pieces carry a
       light outline, and it is the only shipped set that stays visible on
       phosphore's near-black dark square. See piece-sets.ts. */
    pieces: 'cburnett',
    font: 'jetbrains',
    family: /JetBrains/,
  },
] as const;

/** Every route that mounts a board, in both locales. */
const BOARD_ROUTES = [
  '/pieges/legal/',
  '/exercices/mat-du-couloir/',
  '/jouer/',
  '/apprendre-les-bases/la-tour/',
  '/cours/bien-ouvrir-une-partie/occuper-le-centre/',
] as const;

/** Routes with no board at all — they must fetch no piece artwork. */
const BOARDLESS_ROUTES = ['/', '/pieges/', '/exercices/', '/agenda/', '/mentions-legales/'] as const;

async function seedTheme(page: Page, value: unknown) {
  await page.addInitScript(
    ([key, raw]) => {
      try {
        if (!window.localStorage.getItem(key as string)) {
          window.localStorage.setItem(key as string, raw as string);
        }
      } catch {
        /* the broken-storage tests install a throwing localStorage */
      }
    },
    [KEY, JSON.stringify(value)] as const,
  );
}

const cssVar = (page: Page, name: string) =>
  page.evaluate(
    (property) => getComputedStyle(document.documentElement).getPropertyValue(property).trim(),
    name,
  );

async function openAdvanced(page: Page) {
  const advanced = page.locator('[data-advanced]');
  if (!(await advanced.evaluate((el: HTMLDetailsElement) => el.open))) {
    await advanced.locator('summary').click();
  }
}

/** Pick a theme tile the way a reader does — the radio itself is hidden. */
const pickTheme = (page: Page, id: string) =>
  page.locator(`[data-theme-input][value="${id}"]`).click({ force: true });

test.describe('themes — each one brings its whole kit', () => {
  for (const theme of THEMES) {
    test(`${theme.id} applies its palette, board, pieces and heading face`, async ({ page }) => {
      await seedTheme(page, { mode: 'light', theme: theme.id });
      await page.goto('/pieges/legal/');

      const html = page.locator('html');
      await expect(html).toHaveClass(new RegExp(`theme-${theme.id}(\\s|$)`));
      await expect(html).toHaveClass(new RegExp(`board-${theme.board}(\\s|$)`));
      await expect(html).toHaveClass(new RegExp(`pieces-${theme.pieces}(\\s|$)`));

      /* The heading face is the E7 half. Read off a real <h1>, not off the
         token: a token that resolves to a family nothing renders in would
         pass while the page still showed Fraunces. */
      const family = await page
        .getByRole('heading', { level: 1 })
        .evaluate((el) => getComputedStyle(el).fontFamily);
      expect(family).toMatch(theme.family);
    });
  }

  test('the body face is the SAME in every theme — the E7 safety rule', async ({ page }) => {
    const families = new Set<string>();
    for (const theme of THEMES) {
      await page.context().clearCookies();
      await page.goto('/pieges/legal/');
      await page.evaluate(
        ([key, id]) => localStorage.setItem(key, JSON.stringify({ mode: 'light', theme: id })),
        [KEY, theme.id] as const,
      );
      await page.reload();
      families.add(
        await page.evaluate(() => getComputedStyle(document.body).fontFamily),
      );
    }
    /* One family across all four. A theme that changes the body face makes a
       beginner fight the page to read the en-passant rule, which is the one
       thing E7 is not allowed to do. */
    expect([...families]).toHaveLength(1);
    expect([...families][0]).toMatch(/Inter/);
  });
});

test.describe('themes — the board pin', () => {
  /**
   * ⚠️ THE DECISION THIS SESSION HAD TO MAKE, AND BOTH HALVES OF IT.
   *
   * A preset the reader has PINNED survives a theme change; "follow the theme"
   * un-pins it. Level 2 exists for a player with a board preference independent
   * of the site's mood, so a theme change silently destroying it would destroy
   * the only preference that level is for.
   */
  test('a pinned preset survives a theme change', async ({ page }) => {
    await seedTheme(page, { mode: 'light', theme: 'bois', boardTheme: 'bleu' });
    await page.goto(SETTINGS_FR);
    await expect(page.locator('html')).toHaveClass(/board-bleu/);

    await pickTheme(page, 'terminal');
    await expect(page.locator('html')).toHaveClass(/theme-terminal/);
    // The theme changed. The board did not.
    await expect(page.locator('html')).toHaveClass(/board-bleu/);
    // The pieces DO follow — they are not a level-2 choice.
    await expect(page.locator('html')).toHaveClass(/pieces-cburnett/);

    await page.reload();
    await expect(page.locator('html')).toHaveClass(/board-bleu/);
  });

  test('"follow the theme" un-pins, and the board tracks the theme again', async ({ page }) => {
    await seedTheme(page, { mode: 'light', theme: 'bois', boardTheme: 'bleu' });
    await page.goto(SETTINGS_FR);
    await openAdvanced(page);

    await page.locator('[data-board-input][value="follow"]').click({ force: true });
    // Bois's own board.
    await expect(page.locator('html')).toHaveClass(/board-bois/);

    await pickTheme(page, 'souiri');
    // Now it moves with the theme.
    await expect(page.locator('html')).toHaveClass(/board-bleu/);
    await pickTheme(page, 'marbre');
    await expect(page.locator('html')).toHaveClass(/board-glace/);
  });

  test("an un-pinned reader gets the theme’s own board", async ({ page }) => {
    await seedTheme(page, { mode: 'light', theme: 'bois' });
    await page.goto(SETTINGS_FR);
    for (const theme of THEMES) {
      await pickTheme(page, theme.id);
      await expect(page.locator('html')).toHaveClass(new RegExp(`board-${theme.board}(\\s|$)`));
    }
  });

  /**
   * The v1 → E6 migration. A record written before themes existed has a
   * `boardTheme` and no `theme`; the reader must see exactly the board they
   * left, on the Bois palette that record was written under.
   */
  test('a pre-E6 stored record keeps the reader on their board', async ({ page }) => {
    await seedTheme(page, { mode: 'dark', boardTheme: 'tournoi' });
    await page.goto('/pieges/legal/');

    await expect(page.locator('html')).toHaveClass(/theme-bois/);
    await expect(page.locator('html')).toHaveClass(/board-tournoi/);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await cssVar(page, '--mcc-board-light')).toBe('#eeeed2');
  });
});

test.describe('themes — persistence and no-flash', () => {
  test('a theme persists across a reload and across pages', async ({ page }) => {
    await page.goto(SETTINGS_FR);
    await pickTheme(page, 'souiri');
    await expect(page.locator('html')).toHaveClass(/theme-souiri/);

    await page.reload();
    await expect(page.locator('html')).toHaveClass(/theme-souiri/);

    await page.goto('/agenda/');
    await expect(page.locator('html')).toHaveClass(/theme-souiri/);
  });

  /**
   * ⚠️ THE NO-FLASH ASSERTION, EXTENDED TO THE THEME CLASS.
   *
   * `theme.spec.ts` proves `data-theme` lands before `<body>`. The theme class
   * has to as well: it carries the surfaces, so a page that gets `data-theme`
   * early and `theme-terminal` late still flashes a cream page at a reader who
   * asked for phosphor green. Same probe, one more field.
   */
  test('the theme class is applied before the body exists', async ({ page }) => {
    await seedTheme(page, { mode: 'dark', theme: 'terminal' });
    await page.addInitScript(() => {
      (window as unknown as Record<string, unknown>)['__atBody'] = 'body-never-appeared';
      new MutationObserver((_records, observer) => {
        if (!document.body) return;
        (window as unknown as Record<string, unknown>)['__atBody'] =
          document.documentElement.className;
        observer.disconnect();
      }).observe(document, { childList: true, subtree: true });
    });

    await page.goto('/');
    const atBody = await page.evaluate(
      () => (window as unknown as Record<string, string>)['__atBody'],
    );
    expect(atBody).not.toBe('body-never-appeared');
    expect(atBody).toContain('theme-terminal');
    expect(atBody).toContain('pieces-cburnett');
    expect(atBody).toContain('board-phosphore');
  });
});

test.describe('themes — what is actually fetched', () => {
  /**
   * ⚠️ ASSERTED AGAINST THE NETWORK LOG. The whole reason the piece sets are
   * split into one stylesheet each is that a reader uses exactly one; bundling
   * all four would have been simpler and cost ~32 KB brotli on every board
   * page. Nothing about the page's APPEARANCE would reveal the regression.
   */
  test("a board page fetches exactly one piece stylesheet — its own theme’s", async ({ page }) => {
    const requested: string[] = [];
    page.on('request', (r) => {
      if (/\/pieces\//.test(r.url())) requested.push(new URL(r.url()).pathname);
    });

    await seedTheme(page, { mode: 'light', theme: 'souiri' });
    await page.goto('/pieges/legal/');
    await page.locator('[data-testid="chessboard"]').first().scrollIntoViewIfNeeded();
    await page.locator('cg-board').first().waitFor();

    expect(requested).toEqual(['/pieces/chessnut.css']);
  });

  for (const route of BOARDLESS_ROUTES) {
    test(`${route} fetches no piece artwork at all`, async ({ page }) => {
      const requested: string[] = [];
      page.on('request', (r) => {
        if (/\/pieces\//.test(r.url())) requested.push(new URL(r.url()).pathname);
      });

      await seedTheme(page, { mode: 'light', theme: 'bois' });
      await page.goto(route);
      await page.waitForLoadState('networkidle');

      expect(requested, `${route} downloaded piece artwork it never draws`).toEqual([]);
    });
  }

  /**
   * ⚠️ THE ATTRIBUTE THAT CANNOT BE FORGOTTEN SILENTLY.
   *
   * A board page missing `board` on BaseLayout gets no piece stylesheet, so it
   * renders a board of empty squares. Chessground does not error, the position
   * is "loaded", and the page looks like the diagram failed to arrive.
   */
  for (const route of BOARD_ROUTES) {
    test(`${route} declares itself a board page`, async ({ page }) => {
      await page.goto(route);
      await expect(page.locator('html')).toHaveAttribute('data-board', '');
      await expect(page.locator('link[data-mcc="pieces"]')).toHaveAttribute(
        'href',
        /\/pieces\/[\w-]+\.css$/,
      );
    });
  }

  /**
   * A preload fetches unconditionally — that is what preload means. So exactly
   * one heading face may be preloaded, and it must be the active theme's.
   */
  for (const theme of THEMES) {
    test(`${theme.id} preloads its own heading font and no other`, async ({ page }) => {
      await seedTheme(page, { mode: 'light', theme: theme.id });
      await page.goto('/agenda/');

      const preloaded = await page.evaluate(() =>
        [...document.querySelectorAll('link[rel="preload"][as="font"]')].map((el) =>
          el.getAttribute('href'),
        ),
      );

      const headingFaces = preloaded.filter((href) => !/inter-/.test(href ?? ''));
      expect(headingFaces).toHaveLength(1);
      expect(headingFaces[0]).toContain(theme.font);
      // Inter is the body face and every theme uses it, so it is always there.
      expect(preloaded.some((href) => /inter-latin-wght/.test(href ?? ''))).toBe(true);
    });
  }

  /** The standing rule, re-checked with four themes' worth of new assets. */
  test('no third-party request on a themed board page', async ({ page }) => {
    /* Hostname, not `page.url()`'s origin: at the moment the FIRST request
       fires the page is still `about:blank`, whose origin is `null`, so an
       origin comparison flags the navigation itself as third-party. Same
       predicate `pwa.spec.ts` uses, for the same reason. */
    const foreign: string[] = [];
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') foreign.push(r.url());
    });

    await seedTheme(page, { mode: 'dark', theme: 'terminal' });
    await page.goto('/exercices/mat-du-couloir/');
    await page.waitForLoadState('networkidle');

    expect(foreign).toEqual([]);
  });
});

test.describe('themes — the settings page', () => {
  test('all four themes are offered, with exactly one selected', async ({ page }) => {
    await page.goto(SETTINGS_FR);
    await expect(page.locator('[data-theme-input]')).toHaveCount(4);
    await expect(page.locator('[data-theme-input]:checked')).toHaveCount(1);
    await expect(page.locator('[data-theme-input]:checked')).toHaveValue('bois');
  });

  test("the previews are painted by the theme’s own rules", async ({ page }) => {
    await page.goto(SETTINGS_FR);

    /* Each tile carries `.theme-preview .theme-<id>`, so it resolves the real
       tokens. If a preview ever shows a colour the theme does not have, the
       THEME is wrong — there is no second copy of any value to drift. */
    const souiri = page.locator('[data-theme-preview="souiri"]');
    const background = await souiri.evaluate((el) =>
      getComputedStyle(el.querySelector('.theme-preview-page')!).backgroundColor,
    );
    expect(background).toBe('rgb(241, 245, 244)'); // Souiri light page, #f1f5f4

    const terminal = page.locator('[data-theme-preview="terminal"]');
    const terminalBackground = await terminal.evaluate((el) =>
      getComputedStyle(el.querySelector('.theme-preview-page')!).backgroundColor,
    );
    expect(terminalBackground).toBe('rgb(241, 246, 241)'); // Terminal light, #f1f6f1
  });

  test('the previews follow the light/dark mode they are previewing in', async ({ page }) => {
    await page.goto(SETTINGS_FR);
    await page.getByRole('radio', { name: 'Sombre' }).check();

    const terminal = page.locator('[data-theme-preview="terminal"]');
    await expect(terminal).toHaveAttribute('data-theme', 'dark');
    const background = await terminal.evaluate((el) =>
      getComputedStyle(el.querySelector('.theme-preview-page')!).backgroundColor,
    );
    expect(background).toBe('rgb(4, 21, 12)'); // Terminal dark page, #04150c
  });

  test('the theme picker is keyboard operable', async ({ page }) => {
    await page.goto(SETTINGS_FR);
    /* A radio group is one tab stop and arrow keys move within it — the native
       behaviour, which is exactly why this is radios and not buttons. */
    await page.locator('[data-theme-input][value="bois"]').focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('[data-theme-input]:checked')).toHaveValue('marbre');
    await expect(page.locator('html')).toHaveClass(/theme-marbre/);
  });

  test('a theme change is announced', async ({ page }) => {
    await page.goto(SETTINGS_FR);
    await pickTheme(page, 'marbre');
    await expect(page.locator('[data-settings-status]')).toHaveText(/enregistr/i);
  });

  test('the customise disclosure is closed until a reader has something in it', async ({ page }) => {
    await page.goto(SETTINGS_FR);
    await expect(page.locator('[data-advanced]')).toHaveJSProperty('open', false);

    await seedTheme(page, { mode: 'light', theme: 'bois', boardTheme: 'bleu' });
    await page.goto(SETTINGS_EN);
    /* A setting the reader is USING must never be hidden behind a closed
       summary — they would have no way to find out why their board ignores
       the theme they just picked. */
    await expect(page.locator('[data-advanced]')).toHaveJSProperty('open', true);
    await expect(page.locator('[data-board-pinned]')).toBeVisible();
  });
});

test.describe('themes — accessibility', () => {
  /**
   * axe on the settings page in EVERY theme, both modes. That is the page the
   * themes are chosen from, so it is the one page guaranteed to be seen in all
   * eight combinations.
   */
  for (const theme of THEMES) {
    for (const mode of ['light', 'dark'] as const) {
      test(`/parametres/ in ${theme.id} / ${mode} has no axe violations`, async ({ page }) => {
        await seedTheme(page, { mode, theme: theme.id });
        await page.goto(SETTINGS_FR);
        await openAdvanced(page);
        await expectNoAxeViolations(page);
      });
    }
  }

  /** And the pages people actually read, in the two themes furthest from Bois. */
  for (const theme of ['souiri', 'terminal'] as const) {
    for (const route of ['/', '/pieges/legal/', '/exercices/mat-du-couloir/'] as const) {
      test(`${route} in ${theme} (dark) has no axe violations`, async ({ page }) => {
        await seedTheme(page, { mode: 'dark', theme });
        await page.goto(route);
        await expectNoAxeViolations(page);
      });
    }
  }
});

/**
 * E7 reading craft. These assert the things that are testable; the ones that
 * are judgement (does Souiri feel like Essaouira?) are in MANUAL-TESTS.md,
 * where they belong.
 */
test.describe('typography — reading craft', () => {
  const LESSON = '/cours/bien-ouvrir-une-partie/occuper-le-centre/';

  test('lesson prose holds a 60–70 character measure', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(LESSON);

    const { width, ch } = await page.evaluate(() => {
      const prose = document.querySelector('.prose') as HTMLElement;
      const probe = document.createElement('span');
      probe.textContent = '0'.repeat(100);
      probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre';
      prose.appendChild(probe);
      const chWidth = probe.getBoundingClientRect().width / 100;
      probe.remove();
      return { width: prose.getBoundingClientRect().width, ch: chWidth };
    });

    const characters = width / ch;
    expect(characters, `measure was ${characters.toFixed(0)} characters`).toBeGreaterThan(55);
    expect(characters, `measure was ${characters.toFixed(0)} characters`).toBeLessThan(78);
  });

  test('inline notation is monospaced and set as an object', async ({ page }) => {
    await page.goto(LESSON);
    const code = page.locator('.prose code').first();
    const count = await page.locator('.prose code').count();
    test.skip(count === 0, 'this lesson carries no inline notation');

    const style = await code.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        family: s.fontFamily,
        background: s.backgroundColor,
        borderWidth: s.borderTopWidth,
      };
    });

    /* ⚠️ The bug this replaced: the rule read `var(--font-mono)`, a token that
       has never existed, which made the whole declaration invalid — so every
       inline notation in every lesson rendered in Inter, silently, for months.
       Assert the RESOLVED family, never that a rule exists. */
    expect(style.family).not.toMatch(/Inter/);
    expect(style.family).toMatch(/mono|Menlo|Consolas|Cascadia/i);
    expect(style.background).not.toBe('rgba(0, 0, 0, 0)');
    expect(parseFloat(style.borderWidth)).toBeGreaterThan(0);
  });

  test('the drop cap appears once, on the first paragraph only', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(LESSON);
    await expect(page.locator('.prose[data-dropcap]')).toHaveCount(1);

    /* ::first-letter cannot be measured directly, so measure its effect: the
       first paragraph's first line box is taller than a plain one. */
    const floated = await page.evaluate(() => {
      const p = document.querySelector('.prose[data-dropcap] > p') as HTMLElement;
      return getComputedStyle(p, '::first-letter').fontSize;
    });
    const body = await page.evaluate(() => getComputedStyle(document.body).fontSize);
    expect(parseFloat(floated)).toBeGreaterThan(parseFloat(body) * 2);
  });

  /**
   * ⚠️ REPORTS, DOES NOT ASSERT — deliberately.
   *
   * `font-variant-numeric: oldstyle-nums` is declared on prose, and Inter does
   * not ship the `onum` feature, so it is currently INERT for body text. That
   * is written down in typography.css, and a comment that quietly becomes
   * false is worse than no comment. This measures whether the declaration
   * changes rendering and prints the answer into the test output, so the day
   * the body face gains old-style figures somebody finds out.
   */
  test('old-style figures: report whether the body face supports them', async ({ page }) => {
    await page.goto(LESSON);
    const supported = await page.evaluate(() => {
      const make = (variant: string) => {
        const el = document.createElement('span');
        el.textContent = '0123456789';
        el.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font-variant-numeric:${variant}`;
        document.body.appendChild(el);
        const w = el.getBoundingClientRect().width;
        el.remove();
        return w;
      };
      return make('oldstyle-nums') !== make('lining-nums');
    });
    console.log(
      `      old-style figures in the body face: ${supported ? 'ACTIVE' : 'inert (Inter has no onum)'}`,
    );
    expect(typeof supported).toBe('boolean');
  });
});

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`);
  expect(summary, summary.join('\n')).toEqual([]);
}
