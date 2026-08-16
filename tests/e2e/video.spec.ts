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
 * ⚠️ WHICH PAGE. `/pieges/legal/` is the one content entry carrying a
 * `youtube` id (`TODOvideo00`, a placeholder until Michael's video lands). The
 * corpus is asserted before anything is concluded from it — a suite that
 * silently found no facade would report five green tests about nothing, which
 * is the vacuous-pass failure this repository has shipped before.
 */

const WITH_VIDEO = '/pieges/legal/';
const WITH_VIDEO_EN = '/en/pieges/legal/';
/** Same collection, same template, no `youtube` field. The control. */
const WITHOUT_VIDEO = '/pieges/fegatello/';

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

test('the fixture is real — a trap carries a video and another does not', async ({ page }) => {
  await page.goto(WITH_VIDEO);
  await expect(
    facade(page),
    `no facade on ${WITH_VIDEO} — every test in this file would pass vacuously. ` +
      'Has the `youtube` field been removed from src/content/traps/legal.json?',
  ).toHaveCount(1);

  await page.goto(WITHOUT_VIDEO);
  await expect(
    facade(page),
    `${WITHOUT_VIDEO} has grown a video — pick another trap for the control case`,
  ).toHaveCount(0);
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
      'TODOvideo00',
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
       label, which must name the video rather than say "play". */
    expect(name, `the button announces "${name}" — it must name the video`).toContain(
      'Le mat de Légal',
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
