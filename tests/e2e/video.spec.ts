import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * THE VIDEO FACADE — no YouTube until the reader asks for it.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THE FIRST TEST IS THE FEATURE. Everything else here is craft; that one
 * is Critical Feature 9, and it is the only reason this component exists in
 * place of four lines of iframe.
 *
 * `pwa.spec.ts` already asserts zero third-party requests on `/`. It cannot
 * cover this, because `/` has no video on it — a guarantee proved only on the
 * pages that cannot break it is not a guarantee. So the sweep is repeated
 * here, on the page that CAN.
 *
 * ⚠️ THE HOSTNAME FILTER IS `!== localhost`, NOT `includes('youtube')`. A
 * facade that hot-linked its still from i.ytimg.com — the single most likely
 * regression, because it removes a build step and looks identical on screen —
 * would sail straight through a youtube-only filter. Every non-local origin
 * is a failure, named in the message.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * ⚠️ WHICH PAGE, AND WHY IT IS NOT REAL CONTENT.
 *
 * The facade first shipped with a placeholder `youtube` id on `/pieges/legal/`
 * — a real trap, on the real index, whose play button handed a reader
 * YouTube's "video unavailable". That bought this file a page to drive at the
 * cost of a dead video on live content, which is the wrong way round: the test
 * harness's needs must not reach the reader.
 *
 * So the page below is a FIXTURE: `src/content/traps/fixture-video-facade.json`
 * carries `fixture: true`, which makes it
 *
 *   - emitted ONLY when `PUBLIC_FIXTURES=true` — set by `playwright.config.ts`
 *     for the build it tests, and by nothing else, so it is in every Playwright
 *     run and in no production build;
 *   - absent from every index and every count in EVERY build, including this
 *     one. Asserted below, because "routable" and "reachable" are different
 *     claims and only the second one is what protects a reader.
 *
 * ⚠️ IT IS A FULL TRAP PAGE, NOT A BARE COMPONENT HARNESS. That is what keeps
 * the integration in scope: the field travelling from the collection through
 * `TrapPage.astro`, and the facade landing BELOW the board rather than above
 * it. A fixture route that mounted `VideoFacade` directly would test the
 * component and quietly stop testing the placement.
 *
 * The corpus is asserted before anything is concluded from it — a suite that
 * silently found no facade would report green tests about nothing, which is the
 * vacuous-pass failure this repository has shipped before.
 */

const WITH_VIDEO = '/pieges/fixture-video-facade/';
const WITH_VIDEO_EN = '/en/pieges/fixture-video-facade/';
/** Same collection, same template, no `youtube` field. The control. */
const WITHOUT_VIDEO = '/pieges/fegatello/';
/** Real, published content — must carry no video and no fixture. */
const REAL_TRAP = '/pieges/legal/';

const NOCOOKIE = 'https://www.youtube-nocookie.com/embed/';

/** Every request that left the machine. Local origins are the site itself. */
function watchExternal(page: Page): string[] {
  const external: string[] = [];
  page.on('request', (request) => {
    const { hostname } = new URL(request.url());
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') external.push(request.url());
  });
  return external;
}

/**
 * ⚠️ THE PLAYER MUST NEVER ACTUALLY LOAD IN A TEST RUN.
 *
 * Two reasons, and the second is the important one. It would make the suite
 * depend on Google being reachable, which is how a green suite starts failing
 * for reasons that have nothing to do with this repository. And the whole
 * point of the assertions below is the SHAPE of the request — that it goes to
 * the nocookie domain, with the right id, only after a click. Letting it
 * complete proves nothing extra and costs a network round trip per test.
 *
 * So youtube-nocookie is aborted at the route layer. The request is still
 * MADE, and still observed by `watchExternal` — which is exactly what the
 * "it happens only after the click" assertions need to see.
 */
async function blockYouTube(page: Page) {
  await page.route('**://*.youtube-nocookie.com/**', (route) => route.abort());
  await page.route('**://*.youtube.com/**', (route) => route.abort());
  await page.route('**://*.ytimg.com/**', (route) => route.abort());
}

const facade = (page: Page) => page.locator('[data-video-facade]');
const playButton = (page: Page) => page.locator('[data-video-play]');

/* ═══ The corpus ════════════════════════════════════════════════════════ */

test('the fixture is real — it renders a facade, and the control does not', async ({ page }) => {
  await page.goto(WITH_VIDEO);
  await expect(
    facade(page),
    `no facade on ${WITH_VIDEO} — every test in this file would pass vacuously.\n` +
      'Either src/content/traps/fixture-video-facade.json lost its `youtube` field, ' +
      'or this build was made without PUBLIC_FIXTURES=true (playwright.config.ts ' +
      'sets it for the build it tests — see src/config/fixtures.ts).',
  ).toHaveCount(1);

  await page.goto(WITHOUT_VIDEO);
  await expect(
    facade(page),
    `${WITHOUT_VIDEO} has grown a video — pick another trap for the control case`,
  ).toHaveCount(0);
});

/* ═══ The fixture is routable, and NOT reachable ════════════════════════ */

/**
 * ⚠️ "IT EXISTS" AND "A READER CAN GET TO IT" ARE DIFFERENT CLAIMS, and only
 * the second one protects anybody. The fixture page is deliberately present in
 * this build; what must hold even here is that nothing points at it.
 *
 * This is the same shape of defect as the one that made "Ajouter un élève"
 * unreachable for two releases with its RLS spec fully green — asserted from
 * the other direction.
 */
test.describe('the fixture is invisible to readers even where it exists', () => {
  /**
   * ⚠️ COUNT THE CARDS, NOT EVERY `/pieges/` LINK ON THE PAGE. The header, the
   * bottom bar, the trail and the canonical/hreflang tags all point at
   * `/pieges/` too — an early draft of this test counted nine on an index of
   * seven traps and failed for a reason that had nothing to do with fixtures.
   * A trap CARD is the only link with a slug segment after it.
   */
  const TRAP_CARD = /^\/(en\/)?pieges\/[a-z0-9-]+\/$/;

  async function trapCardHrefs(page: Page, index: string): Promise<string[]> {
    await page.goto(index);
    const all = await page
      .locator('a[href]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''));
    return all.filter((h) => TRAP_CARD.test(h));
  }

  test('it is not a card on the traps index, in either locale', async ({ page }) => {
    for (const index of ['/pieges/', '/en/pieges/']) {
      const hrefs = await trapCardHrefs(page, index);
      expect(
        hrefs.filter((h) => h.includes('fixture')),
        `the fixture is linked from ${index} — a reader can reach a test page`,
      ).toEqual([]);
      /* Non-empty corpus: an index that drew no cards would pass the above
         for entirely the wrong reason. */
      expect(hrefs.length, `${index} drew no trap cards at all`).toBeGreaterThan(3);
    }
  });

  test('nothing anywhere on the reader-facing site links it', async ({ page }) => {
    for (const path of ['/', '/apprendre/', '/pieges/', '/cours/', '/exercices/']) {
      await page.goto(path);
      const linked = await page
        .locator('a[href]')
        .evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''));
      expect(
        linked.filter((h) => h.includes('fixture')),
        `${path} links the fixture page`,
      ).toEqual([]);
    }
  });

  test('the trap count on /apprendre/ does not include it', async ({ page }) => {
    /* ⚠️ `LearnHubPage` prints "N pièges à découvrir" from its own
       `getCollection` call, which is a SECOND place the fixture could leak —
       and one where it would make the number exactly one too high while
       nothing on the page looked wrong. So the two are compared rather than
       either being trusted. */
    const cards = (await trapCardHrefs(page, '/pieges/')).length;
    expect(cards, 'no trap cards to count').toBeGreaterThan(3);

    await page.goto('/apprendre/');
    /* ⚠️ SCOPED TO THE TRAPS CARD, not the whole page. An earlier draft read
       `main` and asserted the page did not contain the string "8" — which is a
       digit, and appears in step counts and elsewhere. A negative assertion on
       a bare numeral is noise, not a check. */
    const card = page.locator('.hub-card', { has: page.locator('a[href="/pieges/"]') });
    await expect(card, 'no hub card links /pieges/ — has the hub changed shape?').toHaveCount(1);

    const state = (await card.innerText()).trim();
    expect(
      state,
      `the traps hub card does not print ${cards} — is the fixture counted? Card reads: ${state}`,
    ).toContain(String(cards));
    expect(
      state,
      `the traps hub card prints ${cards + 1} — one too many, which is the fixture`,
    ).not.toContain(String(cards + 1));
  });

  test('real published content carries no video and no fixture flag', async ({ page }) => {
    /* ⚠️ THE REGRESSION THIS EXISTS FOR: the placeholder id going back onto
       `/pieges/legal/` because it is convenient. If a real video legitimately
       lands there one day, this assertion is what makes that a deliberate
       edit rather than a silent one. */
    await page.goto(REAL_TRAP);
    await expect(
      facade(page),
      `${REAL_TRAP} carries a video. If that is Michael's real video, update ` +
        'this test deliberately; if it is a placeholder, take it off live content.',
    ).toHaveCount(0);
  });
});

/* ═══ Critical Feature 9 ════════════════════════════════════════════════ */

test.describe('zero third-party requests before the click', () => {
  for (const path of [WITH_VIDEO, WITH_VIDEO_EN]) {
    test(`${path} contacts nobody on load`, async ({ page }) => {
      await blockYouTube(page);
      const external = watchExternal(page);

      await page.goto(path);
      /* The facade is below the board and `loading="lazy"`, so scroll it into
         view: a poster that only stays local because it was never requested
         would be a false pass. */
      await facade(page).scrollIntoViewIfNeeded();
      await page.waitForLoadState('networkidle');

      expect(
        external,
        'a page with a video on it made third-party requests BEFORE any click:\n' +
          external.join('\n'),
      ).toEqual([]);
    });
  }

  test('the poster is served by this site, not by i.ytimg.com', async ({ page }) => {
    await page.goto(WITH_VIDEO);
    const src = await page.locator('.mcc-video-poster').getAttribute('src');
    expect(src, 'the poster has no src').toBeTruthy();
    expect(
      src!,
      'the poster is hot-linked — that is the same third-party request by another hostname',
    ).toMatch(/^\/video\//);

    /* And it genuinely resolves. A 404 poster renders as a broken image on an
       otherwise perfect page, which nothing else would report. */
    const response = await page.request.get(new URL(src!, page.url()).href);
    expect(response.status(), `the poster 404s: ${src}`).toBe(200);
  });

  test('nothing in the document mentions a YouTube host before the click', async ({ page }) => {
    await page.goto(WITH_VIDEO);
    /* ⚠️ NO `<link rel="preconnect">` / `dns-prefetch` EITHER. Both look like
       free performance and both resolve DNS and open TLS to Google before the
       reader has decided anything. */
    await expect(page.locator('link[rel="preconnect"], link[rel="dns-prefetch"]')).toHaveCount(0);
    await expect(page.locator('iframe')).toHaveCount(0);
  });
});

/* ═══ The click ═════════════════════════════════════════════════════════ */

test.describe('after the click', () => {
  test('an iframe appears, on the nocookie domain, with the right video', async ({ page }) => {
    await blockYouTube(page);
    await page.goto(WITH_VIDEO);

    await expect(page.locator('iframe')).toHaveCount(0);
    await playButton(page).click();

    const iframe = page.locator('.mcc-video-frame iframe');
    await expect(iframe).toHaveCount(1);

    const src = (await iframe.getAttribute('src'))!;
    expect(src, 'the player is not on the no-cookie domain').toContain(NOCOOKIE);
    expect(src, 'the player is on youtube.com — it must be youtube-nocookie.com').not.toContain(
      'www.youtube.com',
    );
    expect(src, 'the embed does not name the video from the content collection').toContain(
      'FIXTUREvid0',
    );

    /* The frame carries its own accessible name — an unnamed iframe is
       announced as "frame" and nothing else. */
    await expect(iframe).toHaveAttribute('title', /.+/);
  });

  test('the request that follows goes to youtube-nocookie and nowhere else', async ({ page }) => {
    await blockYouTube(page);
    const external = watchExternal(page);

    await page.goto(WITH_VIDEO);
    await page.waitForLoadState('networkidle');
    expect(external, 'requests were made before the click').toEqual([]);

    await playButton(page).click();
    await expect(page.locator('.mcc-video-frame iframe')).toHaveCount(1);
    await page.waitForTimeout(500);

    expect(external.length, 'the click made no third-party request at all').toBeGreaterThan(0);
    /* ⚠️ EVERY one of them, not just the first. */
    for (const url of external) {
      expect(url, `the click reached ${url} — only youtube-nocookie.com is expected`).toContain(
        'youtube-nocookie.com',
      );
    }
  });

  test('the button is replaced, never stacked behind the player', async ({ page }) => {
    await blockYouTube(page);
    await page.goto(WITH_VIDEO);
    await playButton(page).click();
    await expect(page.locator('.mcc-video-frame iframe')).toHaveCount(1);

    /* A button left in the DOM stays in the tab order and would load a second
       iframe on top of the first. */
    await expect(playButton(page)).toHaveCount(0);
  });

  test('the frame does not change height — pressing play shifts nothing', async ({ page }) => {
    await blockYouTube(page);
    await page.goto(WITH_VIDEO);

    const frame = page.locator('.mcc-video-frame');
    await frame.scrollIntoViewIfNeeded();
    const before = (await frame.boundingBox())!;

    await playButton(page).click();
    await expect(page.locator('.mcc-video-frame iframe')).toHaveCount(1);
    const after = (await frame.boundingBox())!;

    expect(
      Math.abs(after.height - before.height),
      'the frame resized when the player replaced the facade — that is a layout shift',
    ).toBeLessThan(2);
  });
});

/* ═══ The keyboard path ═════════════════════════════════════════════════ */

test.describe('keyboard', () => {
  test('the button is reachable and named with what the video is about', async ({ page }) => {
    await page.goto(WITH_VIDEO);
    const button = playButton(page);

    /* A real <button>, so it is focusable without a tabindex. */
    await button.focus();
    await expect(button).toBeFocused();

    const name = await button.evaluate((el) => (el as HTMLElement).innerText.trim());
    /* `innerText` skips the aria-hidden badge; what is left is the sr-only
       label, which must name the video rather than say "play". Compared
       against the page's own <h1> so the assertion cannot drift when the
       fixture's title changes — and so it keeps testing the rule (the button
       is named after what the video is about) rather than one string. */
    const heading = (await page.locator('h1').first().innerText()).trim();
    expect(name, `the button announces "${name}" — it must name the video`).toContain(heading);
    expect(name, 'the button says only "play" — it does not name the video').not.toBe(
      name.replace(heading, ''),
    );
  });

  test('Enter starts the video and focus lands in the player', async ({ page }) => {
    await blockYouTube(page);
    await page.goto(WITH_VIDEO);

    await playButton(page).focus();
    await page.keyboard.press('Enter');

    const iframe = page.locator('.mcc-video-frame iframe');
    await expect(iframe).toHaveCount(1);

    /**
     * ⚠️ FOCUS MUST MOVE INTO THE PLAYER. The button the reader was standing
     * on has just been removed from the document, so without this focus falls
     * back to <body> — and a keyboard reader is silently returned to the top
     * of the page, having started a video they can no longer reach.
     */
    const focused = await page.evaluate(() => document.activeElement?.tagName.toLowerCase());
    expect(focused, `focus went to <${focused}> instead of the player`).toBe('iframe');
  });

  test('Space works too — it is a button, not a link', async ({ page }) => {
    await blockYouTube(page);
    await page.goto(WITH_VIDEO);
    await playButton(page).focus();
    await page.keyboard.press('Space');
    await expect(page.locator('.mcc-video-frame iframe')).toHaveCount(1);
  });
});

/* ═══ Absent field, absent component ════════════════════════════════════ */

test.describe('a page with no video', () => {
  for (const path of [WITHOUT_VIDEO, '/cours/bien-ouvrir-une-partie/', '/pieges/', '/']) {
    test(`${path} renders no facade and no empty box`, async ({ page }) => {
      await page.goto(path);
      await expect(facade(page)).toHaveCount(0);
      await expect(page.locator('.mcc-video-frame')).toHaveCount(0);
      /* Not merely hidden — absent. A reserved 16:9 hole on a page with no
         video is worse than the video being missing. */
      await expect(page.locator('.mcc-video-heading')).toHaveCount(0);
    });
  }
});

/* ═══ Mobile fit — the board is what must not move ══════════════════════ */

test.describe('the facade does not push the board off screen', () => {
  /* The sizes M3 measured the exercise against. Same numbers, same reason. */
  for (const size of [
    { name: '390x844', width: 390, height: 844 },
    { name: '360x640', width: 360, height: 640 },
  ]) {
    test(`the board still fills the column at ${size.name}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(WITH_VIDEO);

      /* ⚠️ THE PLACEMENT DECISION, ASSERTED. The video sits BELOW the board.
         A facade above it would cost ~200px before the reader reaches the
         position the page is named after — the same defect M3 measured in the
         control stack, arriving from the other direction. */
      const board = (await page.locator('.mcc-board').boundingBox())!;
      const video = (await page.locator('.mcc-video').boundingBox())!;
      expect(video.y, 'the video is above the board').toBeGreaterThan(board.y + board.height);

      /* And the board is the size mobile-fit.spec.ts pins it at elsewhere. */
      expect(
        board.height,
        `the board is only ${board.height}px with a video on the page`,
      ).toBeGreaterThan(size.width * 0.8);
    });

    test(`the facade fits the column at ${size.name}`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.goto(WITH_VIDEO);

      const video = (await page.locator('.mcc-video-frame').boundingBox())!;
      expect(video.width, 'the facade overflows the viewport').toBeLessThanOrEqual(size.width);
      /* 16:9, so it can never be the tall block a 4:3 or 1:1 still would be. */
      expect(
        Math.abs(video.width / video.height - 16 / 9),
        `the frame is ${video.width}x${video.height}, not 16:9`,
      ).toBeLessThan(0.05);
    });
  }
});

/* ═══ Motion ════════════════════════════════════════════════════════════ */

test.describe('motion', () => {
  test('the badge answers in the Réponse band, never in the 180–250ms gap', async ({ page }) => {
    await page.goto(WITH_VIDEO);
    const durations = await page.locator('.mcc-video-badge').evaluate((el) =>
      getComputedStyle(el)
        .transitionDuration.split(',')
        .map((v) => parseFloat(v.trim()) * (v.includes('ms') ? 1 : 1000)),
    );
    expect(durations.length).toBeGreaterThan(0);
    for (const ms of durations) {
      expect(ms, `${ms}ms sits in the forbidden 180–250ms gap`).not.toBeGreaterThan(180);
    }
  });

  test('reduced motion switches the scale OFF, not merely slow', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(WITH_VIDEO);

    const button = playButton(page);
    await button.focus();
    const transform = await page
      .locator('.mcc-video-badge')
      .evaluate((el) => getComputedStyle(el).transform);

    /* ⚠️ OFF FOR DECORATION. The badge's growth carries nothing the colour
       change and the focus ring do not already say, so it does not happen at
       all — it is not the same show at 1ms. */
    expect(transform, 'the badge still scales under reduced motion').toMatch(/none|matrix\(1, 0/);
  });
});

/* ═══ The legal notice says what a click sends ══════════════════════════ */

test.describe('the privacy claim is on the site, not only in a commit message', () => {
  for (const [locale, path, anchorText] of [
    ['fr', '/mentions-legales/', 'youtube-nocookie.com'],
    ['en', '/en/mentions-legales/', 'youtube-nocookie.com'],
  ] as const) {
    test(`${path} (${locale}) explains the exchange`, async ({ page }) => {
      await page.goto(path);
      const section = page.locator('#video');
      await expect(section, 'the legal notice has no #video section').toHaveCount(1);

      const text = (await section.innerText()).toLowerCase();
      /* ⚠️ THE SPECIFICS, NOT A GESTURE AT PRIVACY. Each of these is something
         a reader hands over and would want named. A section that stopped
         saying "IP address" would still read reassuringly, which is the
         failure mode. */
      for (const claim of ['youtube', anchorText.toLowerCase(), 'google']) {
        expect(text, `the #video section no longer mentions "${claim}"`).toContain(claim);
      }
      expect(text, 'the section no longer names the IP address').toMatch(/ip address|adresse ip/);
    });
  }

  test('every facade links to that section', async ({ page }) => {
    await page.goto(WITH_VIDEO);
    const href = await page.locator('.mcc-video-note a').getAttribute('href');
    expect(href, 'the facade does not point at the notice').toBe('/mentions-legales/#video');

    /* ⚠️ AND THE ANCHOR RESOLVES. A `#video` that names nothing scrolls
       nowhere and is indistinguishable from a working link. */
    await page.goto(href!);
    await expect(page.locator('#video')).toHaveCount(1);
  });

  test('the English facade links to the English notice', async ({ page }) => {
    await page.goto(WITH_VIDEO_EN);
    const href = await page.locator('.mcc-video-note a').getAttribute('href');
    expect(href).toBe('/en/mentions-legales/#video');
  });
});

/* ═══ Accessibility ═════════════════════════════════════════════════════ */

test.describe('accessibility', () => {
  for (const path of [WITH_VIDEO, WITH_VIDEO_EN]) {
    test(`${path} has no axe violations with a facade on it`, async ({ page }) => {
      await page.goto(path);
      await facade(page).scrollIntoViewIfNeeded();

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`);
      expect(summary, summary.join('\n')).toEqual([]);
    });
  }

  test('the poster is decorative — the button already carries the name', async ({ page }) => {
    await page.goto(WITH_VIDEO);
    /* An alt-texted image inside a labelled button is announced twice, which
       reads as a stutter rather than as extra help. */
    await expect(page.locator('.mcc-video-poster')).toHaveAttribute('alt', '');
  });
});
