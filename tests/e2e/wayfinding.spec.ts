import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * KNOWING WHERE YOU ARE — the trail, and the two section landings (M4).
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THE BUG THIS FILE EXISTS FOR WAS REPORTED BY THE PERSON WHO BUILT THE
 * SITE: he repeatedly could not tell where he was, or get back to a page he
 * had just seen, without the browser's own back button.
 *
 * Nothing was broken. Every page rendered, every link worked, and every spec
 * passed — which is exactly why it survived: the defect was ABSENCE. The bar's
 * active tab said "Apprendre" from the courses index, from a course, from a
 * lesson three levels down and from a trap, so it located you to within a
 * quarter of the site; and the way back up was whatever that page happened to
 * have, which for eleven routes was nothing at all.
 *
 * ⚠️ SO THE ASSERTIONS HERE ARE ABOUT COVERAGE, NOT ABOUT ONE COMPONENT
 * BEHAVING. "Every route below a section landing has a named way up" is the
 * claim; a test that checked the trail renders on the one page somebody
 * remembered would have passed throughout the bug.
 * ═════════════════════════════════════════════════════════════════════════
 */

const PHONE = { width: 390, height: 844 };

/**
 * Every public FR route, with the parent its trail must name.
 *
 * ⚠️ THE EXPECTED LABEL IS THE PARENT'S OWN NAME, and for a lesson that is the
 * COURSE — "Bien ouvrir une partie", not "Toutes les leçons". Naming the
 * collection is what the old links did, and it is the failure mode that reads
 * as fine until you are three levels deep and want to know which course you
 * are about to land in.
 */
const BELOW_A_LANDING = [
  ['/cours/', 'Apprendre'],
  ['/cours/bien-ouvrir-une-partie/', 'Cours'],
  ['/cours/bien-ouvrir-une-partie/occuper-le-centre/', 'Bien ouvrir une partie'],
  ['/pieges/', 'Apprendre'],
  ['/pieges/legal/', 'Pièges'],
  ['/exercices/', 'Apprendre'],
  ['/exercices/mat-du-couloir/', 'Exercices'],
  ['/apprendre-les-bases/', 'Apprendre'],
  ['/apprendre-les-bases/la-tour/', 'Les bases'],
  ['/progres/', 'Moi'],
  /* ⚠️ RÉGLAGES IS BELOW A LANDING NOW, not one of them. It left the bar in the
     second revision and lives inside Moi, so it gained a trail — a landing has
     none, and a page that is no longer a landing must not keep behaving like
     one. */
  ['/parametres/', 'Moi'],
  /* ⚠️ THESE THREE USED TO NAME 'Accueil' BECAUSE THEY HAD NO SECTION. The
     club now has a landing, so the honest parent is the club — naming home
     from a page two levels down is the 'bare Retour' failure wearing a
     different word. */
  ['/agenda/', 'Le club'],
  ['/contact/', 'Le club'],
  ['/a-propos/', 'Le club'],
  ['/mentions-legales/', 'Accueil'],
  ['/politique-confidentialite/', 'Accueil'],
] as const;

/** The five section landings plus home — these are the TOP, and have no trail. */
const LANDINGS = ['/', '/apprendre/', '/jouer/', '/club/', '/moi/'] as const;

test.describe('the trail — a way up that says where it goes', () => {
  for (const [path, parent] of BELOW_A_LANDING) {
    test(`${path} names its parent: ${parent}`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await page.goto(path);

      const trail = page.getByTestId('trail');
      await expect(trail, `${path} has no way up at all`).toBeVisible();
      await expect(trail).toContainText(parent);

      /* ⚠️ A LINK, NEVER `history.back()`. A reader who arrived from a shared
         link or a bookmark has no history, and a back control that does
         nothing is worse than none. It must also be a real destination. */
      const link = trail.locator('a');
      const href = await link.getAttribute('href');
      expect(href, `${path}'s trail is not a link`).toBeTruthy();
      const res = await page.request.get(href!);
      expect(res.status(), `${path}'s trail points at a ${res.status()}`).toBe(200);

      /* The accessible name says what the chevron means. "‹ Exercices" read
         aloud is a punctuation mark and a noun. */
      await expect(link).toHaveAttribute('aria-label', new RegExp(parent.slice(0, 12)));
    });
  }

  /**
   * ⚠️ 44px, BECAUSE IT IS THE FIRST THING A THUMB REACHES FOR ON A PHONE.
   * The text is ~17px tall; the padding is what makes it a target, and a
   * refactor that removes the padding leaves something that looks identical
   * and cannot be hit.
   */
  test('the trail is a 44px target on every level', async ({ page }) => {
    await page.setViewportSize(PHONE);
    for (const [path] of BELOW_A_LANDING) {
      await page.goto(path);
      const box = (await page.getByTestId('trail').locator('a').boundingBox())!;
      expect(box.height, `${path}: the way up is ${box.height}px tall`).toBeGreaterThanOrEqual(44);
    }
  });

  /**
   * ⚠️ THE LANDINGS MUST NOT HAVE ONE. A section landing's way out is the bar,
   * which is on screen; a back link above it would be a second way to leave the
   * screen that exists to be scanned, pointing somewhere the reader can already
   * see. This is the half that stops "add a trail everywhere" being the fix.
   */
  for (const path of LANDINGS) {
    test(`${path} is a top level and has no trail`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await page.goto(path);
      await expect(page.getByTestId('trail')).toHaveCount(0);
    });
  }

  /**
   * ⚠️ GOING UP IS NOT GOING BACK IN A SEQUENCE, and both must survive. A
   * lesson has prev/next through the course AND a way up to the course; if a
   * refactor ever collapses them into one control, the reader loses the ability
   * to leave a sequence without walking it to the end.
   */
  test('prev/next and the way up coexist on a lesson', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('/cours/bien-ouvrir-une-partie/occuper-le-centre/');

    await expect(page.getByTestId('trail')).toBeVisible();
    await expect(page.getByTestId('lesson-index')).toBeVisible();
    const sequence = page.locator('[data-testid="lesson-next"], [data-testid="lesson-prev"]');
    expect(await sequence.count(), 'the sequence links vanished').toBeGreaterThan(0);
  });
});

test.describe('the section landings are choosers, not menus', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(PHONE);
  });

  /**
   * ⚠️ A CHOOSER THAT ONLY LISTS NAMES WASTES THE TAP IT COSTS. Every card
   * carries a name, a line of what is behind it, and the reader's own state
   * where any exists — that last part is what makes the extra screen worth it.
   */
  test('/apprendre/ offers four cards, each with a description', async ({ page }) => {
    await page.goto('/apprendre/');
    const cards = page.locator('[data-testid="learn-hub"] .hub-card');
    await expect(cards).toHaveCount(4);

    for (const id of ['hub-basics', 'hub-lessons', 'hub-exercises', 'hub-traps']) {
      const card = page.getByTestId(id);
      await expect(card, `${id} is missing`).toBeVisible();
      await expect(card.locator('.hub-card-body')).not.toBeEmpty();
      /* ⚠️ A CARD THAT RENDERS HAS A DESTINATION (Critical Feature 32). */
      const href = await card.locator('a').getAttribute('href');
      expect(href, `${id} has no destination`).toBeTruthy();
      expect((await page.request.get(href!)).status(), `${id} → ${href}`).toBe(200);
    }
  });

  /**
   * The state line is the part that earns the tap. Seeded rather than solved,
   * because this asserts the wiring to `ResumeResolver` — the ONE reader of
   * `mcc:progress:v1` — not the arithmetic, which `progression.spec.ts` owns.
   */
  test('a card shows the reader their own progress', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'mcc:progress:v1',
        JSON.stringify({
          exercises: {
            'mat-du-couloir': { solved: true, attempts: 1, hintUsed: false, solvedAt: '2026-01-01T10:00:00.000Z' },
          },
        }),
      );
    });
    await page.goto('/apprendre/');
    await expect(page.getByTestId('hub-exercises').locator('[data-resume-count]')).toContainText(
      /\d+\s+sur\s+\d+/,
    );
  });

  test('/moi/ offers progress and settings, and both resolve', async ({ page }) => {
    await page.goto('/moi/');
    await expect(page.getByTestId('hub-progress')).toBeVisible();
    await expect(page.getByTestId('hub-settings')).toBeVisible();

    for (const id of ['hub-progress', 'hub-settings']) {
      const href = await page.getByTestId(id).locator('a').getAttribute('href');
      expect((await page.request.get(href!)).status(), `${id} → ${href}`).toBe(200);
    }
  });

  /**
   * ⚠️ THE CLUB LANDING EXISTS BECAUSE A PHONE COULD NOT REACH THE CLUB AT ALL.
   *
   * The agenda, contact and about pages sat under "Le club" in the desktop
   * header and under nothing below 768px. This is the mirror of the /progres/
   * defect Critical Feature 36 was written for — not one page missing from
   * desktop, but a whole section missing from mobile.
   */
  test('/club/ offers agenda, contact and about, and all three resolve', async ({ page }) => {
    await page.goto('/club/');

    for (const id of ['hub-agenda', 'hub-contact', 'hub-about']) {
      const card = page.getByTestId(id);
      await expect(card).toBeVisible();
      /* ⚠️ A CHOOSER, NOT A MENU (Critical Feature 65): a name AND a line
         saying what is behind it. A stack of bare links is the menu the bar
         already was, and would not earn the tap this screen costs. */
      await expect(card.locator('.hub-card-body')).not.toBeEmpty();

      const href = await card.locator('a').getAttribute('href');
      expect((await page.request.get(href!)).status(), `${id} → ${href}`).toBe(200);
    }
  });

  /**
   * ⚠️ A FACT, NOT A ZERO IT HAS NOT COMPUTED (Critical Features 30 and 61).
   * The agenda card states how many sessions are ANNOUNCED, because nothing
   * records which a guest attended and inventing a counter to fill the slot is
   * how a surface starts lying.
   */
  test('the agenda card states what is announced rather than a bare zero', async ({ page }) => {
    await page.goto('/club/');
    const fact = page.getByTestId('hub-agenda');
    await expect(fact).not.toContainText(/^0 /);
    await expect(fact).toContainText(/séances annoncées|Aucune séance/);
  });

  test('both landings have no axe violations, FR and EN', async ({ page }) => {
    for (const path of ['/apprendre/', '/moi/', '/club/', '/en/apprendre/', '/en/moi/', '/en/club/']) {
      await page.goto(path);
      const results = await new AxeBuilder({ page }).analyze();
      const summary = results.violations.map((v) => `${v.id} (${v.nodes.length}×): ${v.help}`);
      expect(summary, `${path}\n${summary.join('\n')}`).toEqual([]);
    }
  });
});
