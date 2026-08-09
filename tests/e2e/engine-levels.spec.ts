import { test, expect } from '@playwright/test';
import { LEVELS, type LevelId } from '../../src/lib/engine/stockfish';

/**
 * The difficulty ladder, guarded as a SHAPE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS FILE EXISTS. Before v0.6.0 all three presets were within a few
 * percent of each other: measured against a 2-ply reference opponent,
 * Débutant scored 100%, Intermédiaire 97% and Avancé 100%. Three names, one
 * opponent — and a beginner who could not win a single game.
 *
 * The numbers themselves are MEASURED, not reasoned about, and re-measuring
 * them costs half an hour of games (`node scripts/engine-lab/run.mjs`). What
 * this spec does instead is cheap and catches the failure that actually
 * happened: the ladder silently flattening.
 *
 * ⚠️ It asserts ORDER and SHAPE, never the specific values — those belong to
 * the measurement, and pinning them here would make every re-tune a two-file
 * change with a test that only ever restates the source. If you change a
 * number, re-run the lab; if you change the ORDER, this says no.
 *
 * ⚠️ It imports the module in NODE, not in a browser. Nothing at the top level
 * of `stockfish.ts` touches a browser API — the `Worker` is constructed inside
 * `createStockfish()` — so the table can be read directly. That is the whole
 * point: no engine boot, no 3.6 MB, so this runs in milliseconds and is not
 * subject to the engine contention that makes `play.spec.ts` run serially.
 * ─────────────────────────────────────────────────────────────────────────
 */

const ORDER: readonly LevelId[] = ['debutant', 'intermediaire', 'avance'];

test.describe('the difficulty ladder', () => {
  test('every level is present and complete', () => {
    for (const id of ORDER) {
      const level = LEVELS[id];
      expect(level, `${id} is missing`).toBeTruthy();
      expect(typeof level.skill, `${id}.skill`).toBe('number');
      expect(typeof level.depth, `${id}.depth`).toBe('number');
      expect(typeof level.movetimeMs, `${id}.movetimeMs`).toBe('number');
      expect(typeof level.blunderChance, `${id}.blunderChance`).toBe('number');
    }
  });

  test('skill, depth and thinking time all increase up the ladder', () => {
    for (let i = 1; i < ORDER.length; i++) {
      const lower = LEVELS[ORDER[i - 1] as LevelId];
      const upper = LEVELS[ORDER[i] as LevelId];
      expect(upper.skill, `${ORDER[i]} skill must exceed ${ORDER[i - 1]}`).toBeGreaterThan(lower.skill);
      expect(upper.depth, `${ORDER[i]} depth must exceed ${ORDER[i - 1]}`).toBeGreaterThan(lower.depth);
      expect(
        upper.movetimeMs,
        `${ORDER[i]} movetime must exceed ${ORDER[i - 1]}`,
      ).toBeGreaterThan(lower.movetimeMs);
    }
  });

  /**
   * ⚠️ THE ONE THAT MATTERS. `Skill Level` picks among the engine's own top
   * candidates and every search ends in a quiescence pass, so no combination
   * of skill and depth will ever hang a piece. Without a blunder rate,
   * Débutant is a bot that never errs — which teaches a beginner nothing and
   * beats them every time. See CLAUDE.md → "Play mode".
   */
  test('the weaker the level, the more often it blunders — and Avancé never does', () => {
    for (let i = 1; i < ORDER.length; i++) {
      const lower = LEVELS[ORDER[i - 1] as LevelId];
      const upper = LEVELS[ORDER[i] as LevelId];
      expect(
        upper.blunderChance,
        `${ORDER[i]} must blunder less often than ${ORDER[i - 1]}`,
      ).toBeLessThan(lower.blunderChance);
    }
    expect(LEVELS.debutant.blunderChance, 'Débutant must sometimes give material away').toBeGreaterThan(0);
    expect(LEVELS.avance.blunderChance, 'Avancé must never blunder deliberately').toBe(0);
  });

  test('every blunder chance is a probability, and Débutant is not a coin toss', () => {
    for (const id of ORDER) {
      expect(LEVELS[id].blunderChance).toBeGreaterThanOrEqual(0);
      expect(LEVELS[id].blunderChance).toBeLessThanOrEqual(1);
    }
    /* Above ~0.5 the engine plays more noise than chess: measured at blunder
       50% it scored 13% against the 2-ply reference, and the games stop
       resembling a game. Beatable is the goal; incoherent is not. */
    expect(LEVELS.debutant.blunderChance).toBeLessThanOrEqual(0.5);
  });

  /**
   * The latency budget, which is a phone constraint rather than a chess one.
   * `movetimeMs` is what stops Avancé thinking for a long time on a sharp
   * middlegame position on a low-end Android.
   */
  test('no level may think for longer than the move timeout allows', () => {
    for (const id of ORDER) {
      expect(LEVELS[id].movetimeMs, `${id} movetime`).toBeLessThanOrEqual(3_000);
      expect(LEVELS[id].depth, `${id} depth`).toBeLessThanOrEqual(20);
    }
  });
});
