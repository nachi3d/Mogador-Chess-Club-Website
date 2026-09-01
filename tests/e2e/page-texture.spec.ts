import { test, expect, type Page } from '@playwright/test';

/**
 * THE PAGE TEXTURE, MEASURED WHERE IT IS PAINTED.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️⚠️ `check-contrast.mjs` CANNOT SEE THIS, AND THAT IS WHY THIS FILE EXISTS.
 *
 * That script proves `--mcc-text-primary` against `--mcc-surface-page` by
 * reading the two token values. The page also paints `--mcc-page-texture` —
 * a stack of gradients — ON TOP of that surface, so the background a letter
 * actually sits on is the surface darkened wherever a texture line crosses it,
 * and no token holds that colour. An alpha over an audited pair is exactly the
 * blind spot that once dropped a proved pair to 4.42:1 (CLAUDE.md → M1/M2).
 *
 * ⚠️ IT SAMPLES PIXELS, NOT CSS. A first attempt parsed the stylesheets and
 * composited the layers arithmetically; it mis-resolved two themes out of four
 * because every theme block is written `:is(:root, .theme-x)…` and a substring
 * matcher for ":root" matched all of them. Reading the rendered page has no
 * such failure mode — and it measures what a reader is actually looking at,
 * including any layer added later by a route or a component.
 *
 * ⚠️ THE WORST PIXEL IS THE TEST. Average brightness would pass a texture that
 * is invisible in most places and far too dark where it lands. The check takes
 * the DARKEST background pixel in a sampled patch (for a light mode; the
 * lightest for a dark one) and holds the body ink to AA against that.
 *
 * ⚠️ IT ALSO ASSERTS THE TEXTURE IS THERE AT ALL. A texture nobody can see is
 * the state this pass was asked to fix: `--mcc-page-texture` was `none` in the
 * base and ≤0.028 alpha elsewhere, and the page read as a flat fill. A single
 * flat patch fails the range check below.
 * ─────────────────────────────────────────────────────────────────────────
 */

const KEY = 'mcc:theme:v1';

const THEMES = ['bois', 'marbre', 'souiri', 'terminal'] as const;
const MODES = ['light', 'dark'] as const;

/** AA for body text. The lede and secondary copy are body-sized here too. */
const FLOOR = 4.5;

/**
 * How much variation counts as "a texture is present".
 *
 * Measured in 0-255 luminance units across the sampled patch. A perfectly flat
 * fill scores 0. This is deliberately a low bar — the point is to catch a
 * texture that has been switched off or lost to a token rename, not to police
 * how strong it is.
 */
const MIN_RANGE = 1.2;

async function seed(page: Page, theme: string, mode: string) {
  await page.addInitScript(
    ([key, raw]) => {
      try {
        window.localStorage.setItem(key as string, raw as string);
      } catch {
        /* a broken-storage run has its own tests */
      }
    },
    [KEY, JSON.stringify({ theme, mode })] as const,
  );
}

function luminance(r: number, g: number, b: number) {
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: number, b: number) {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

function parseColour(css: string): [number, number, number] {
  const m = css.match(/(\d+(?:\.\d+)?)/g);
  if (!m || m.length < 3) throw new Error(`could not read colour: ${css}`);
  return [Number(m[0]), Number(m[1]), Number(m[2])];
}

for (const theme of THEMES) {
  for (const mode of MODES) {
    test(`${theme}/${mode}: the texture is visible and the ink still clears AA on it`, async ({
      page,
    }) => {
      await seed(page, theme, mode);
      await page.setViewportSize({ width: 1280, height: 900 });
      /* `/mentions-legales/` is prose on the bare page surface, so a patch of
         it is the page background and nothing else. */
      await page.goto('/mentions-legales/');
      await page.waitForLoadState('networkidle');

      const ink = parseColour(
        await page.evaluate(() =>
          getComputedStyle(document.documentElement).getPropertyValue('color').trim() ||
          getComputedStyle(document.body).color,
        ),
      );

      /**
       * ⚠️ EVERYTHING IS HIDDEN BEFORE THE PATCH IS TAKEN, and the first
       * version was not: it clipped a fixed rectangle and caught the header
       * and body text, so the "darkest background pixel" came back as 17/255
       * on a cream page and every theme failed at about 1.1:1.
       *
       * `visibility: hidden` keeps the layout and paints nothing, and the
       * texture lives on `html`, so what remains is exactly the page surface.
       */
      await page.addStyleTag({
        content: 'body > * { visibility: hidden !important; }',
      });
      const shot = await page.screenshot({
        clip: { x: 200, y: 300, width: 160, height: 160 },
      });

      const { min, max } = await page.evaluate(async (bytes) => {
        const blob = new Blob([new Uint8Array(bytes)], { type: 'image/png' });
        const bmp = await createImageBitmap(blob);
        const canvas = document.createElement('canvas');
        canvas.width = bmp.width;
        canvas.height = bmp.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(bmp, 0, 0);
        const { data } = ctx.getImageData(0, 0, bmp.width, bmp.height);
        let lo = 255;
        let hi = 0;
        for (let i = 0; i < data.length; i += 4) {
          /* Plain average is enough to find the extremes of one hue's shading. */
          const v = (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        return { min: lo, max: hi };
      }, [...new Uint8Array(shot)]);

      console.log(`TEX ${theme}/${mode} range=${(max - min).toFixed(2)} min=${min.toFixed(0)} max=${max.toFixed(0)}`);

      /* 1. The texture exists. */
      expect(
        max - min,
        `${theme}/${mode}: the page background is flat (range ${(max - min).toFixed(2)}) — the texture is missing or invisible`,
      ).toBeGreaterThan(MIN_RANGE);

      /* 2. The ink still clears AA on the WORST pixel of it. */
      const inkL = luminance(ink[0], ink[1], ink[2]);
      const worst = mode === 'dark' ? max : min;
      const ratio = contrast(inkL, luminance(worst, worst, worst));
      expect(
        ratio,
        `${theme}/${mode}: body ink is ${ratio.toFixed(2)}:1 on the darkest textured pixel (${worst.toFixed(0)}/255)`,
      ).toBeGreaterThanOrEqual(FLOOR);
    });
  }
}
