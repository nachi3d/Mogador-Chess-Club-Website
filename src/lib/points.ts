/**
 * THE POINT LEDGER — policy, and only policy (E3).
 *
 * Direction: `docs/direction/mcc-direction-esthetique.md` § B1–B3 and the
 * addendum § E8. This file holds the numbers and the rules that produce them.
 * It computes no totals and reads no storage — see the split below.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ POINTS ARE DERIVED, NEVER BANKED. THIS IS THE RULE OF THE WHOLE FEATURE.
 *
 * There is no `points` number in `localStorage`, and there must never be one.
 * A total is recomputed from the work behind it — which exercises are solved,
 * which lessons are complete, which games were won — every time it is read.
 *
 * The reason is not tidiness. A stored balance is a number a student can type
 * into a devtools console in three clicks, and once it is stored the site has
 * no way to tell an earned 400 from a typed one. A derived total is exactly as
 * good as the records behind it: to fake it you have to fake the solves, and
 * faking the solves is indistinguishable from doing them as far as this
 * codebase can ever know locally.
 *
 * ⚠️ WHILE POINTS ARE LOCAL THEY ARE DECLARATIVE, AND THAT IS ACCEPTED.
 * See CLAUDE.md → "Anti-cheat". Once accounts land the balance is computed
 * SERVER-SIDE from actually-solved exercises and never accepted from the
 * client. Nothing in this file may become a wire format for a client-supplied
 * total.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * ── WHY THIS FILE IS PURE ────────────────────────────────────────────────
 * `ExerciseView` and `PlayView` are islands. They may import this; they may
 * NOT import anything reaching `astro:content`, which would pull the whole
 * content graph into the client bundle. So:
 *
 *   points.ts      (here)  policy — award values, rank table, achievements
 *   scoreboard.ts          BUILD TIME — turns content into a catalogue
 *   ScoreResolver.astro    serialises the catalogue, sums it in the browser
 *
 * ⚠️ THE RESOLVER SUMS VALUES; IT DOES NOT KNOW THE RULES. Every award below
 * is evaluated at BUILD time and shipped as a plain number per entry, exactly
 * as `MCC_THEMES` ships each theme's board and pieces. The inline script adds
 * up numbers it was handed, so the policy in this file cannot drift from what
 * a reader is shown — there is no second copy of it to drift.
 */

/** The three club levels, as used everywhere else. */
export type Level = 'debutant' | 'intermediaire' | 'avance';

/** Where a point came from. Drives the breakdown on `/progres/`. */
export type PointSource = 'basics' | 'lessons' | 'exercises' | 'games';

/**
 * ⚠️ THE LEDGER CARRIES AN ORIGIN AND A REASON, AND THAT IS FOR v2-S4.
 *
 * Teacher-awarded points need roles, so they are NOT built here. What IS built
 * is the shape that can carry them: an entry already says where it came from
 * and why, so adding a second origin later is a new `PointSource` and a new
 * producer — not a migration of anything already written.
 *
 * `origin: 'derived'` is the only value this session ever produces. A future
 * `'teacher'` entry would carry the awarding prof and a note; it would arrive
 * from the database rather than from the catalogue, and every consumer below
 * already sums a list of entries rather than a single number.
 */
export interface LedgerEntry {
  readonly id: string;
  readonly source: PointSource;
  readonly points: number;
  readonly origin: 'derived';
}

/* ─────────────────────────── the award table ─────────────────────────── */

/**
 * A tutorial step. Flat and small: thirteen of them is the on-ramp, and a
 * beginner should feel the first one land without the sequence being where the
 * points are.
 */
export const AWARD_TUTORIAL_STEP = 5;

/**
 * A course lesson, awarded when EVERY exercise board in it is solved.
 *
 * ⚠️ PER LESSON, NOT PER BOARD. "Course lessons completed" is what the brief
 * asks for, and a lesson with three boards (Récapitulatif) is one unit of
 * teaching rather than three times the reward of a lesson with one.
 */
export const AWARD_LESSON = 10;

/**
 * A standalone exercise, by level. These are the site's real practice, so they
 * are worth more than a lesson's embedded board.
 */
export const AWARD_EXERCISE: Readonly<Record<Level, number>> = {
  debutant: 15,
  intermediaire: 25,
  avance: 40,
};

/**
 * Added when the position ends in checkmate.
 *
 * A mate is a verifiable, finite skill — the student either delivered it or did
 * not, and `scripts/check-content.mjs` already proves the line really mates. It
 * is the one difficulty signal on an exercise that is not a human judgement.
 */
export const AWARD_MATE_BONUS = 5;

/**
 * A hint keeps 60% of the award, rounded UP.
 *
 * ⚠️ NEVER ZERO. A student who takes a hint and then solves the position has
 * learned the position; a zero would teach them that asking for help erases the
 * work, which is the opposite of what a teaching site should say. Rounding up
 * means the smallest award (a tutorial step, 5) still pays 3 rather than 2.
 */
export const HINT_RETAINED = 0.6;

export function withHint(award: number): number {
  return Math.max(1, Math.ceil(award * HINT_RETAINED));
}

/**
 * A win against the engine, by level.
 *
 * ⚠️ THE SPREAD IS DELIBERATE AND STEEP. Débutant plays a 40% blunder rate
 * (CLAUDE.md → the level presets) and beating it is not evidence of much;
 * Avancé is skill 14 at depth 12 and beating it genuinely is. A flat award
 * would make the easiest opponent the most efficient one to farm, which is
 * exactly backwards.
 */
export const AWARD_WIN: Readonly<Record<Level, number>> = {
  debutant: 5,
  intermediaire: 15,
  avance: 40,
};

/**
 * How many wins per level are counted.
 *
 * ⚠️ A CAP, BECAUSE A GAME IS REPEATABLE AND AN EXERCISE IS NOT. The no-farming
 * rule is trivial for exercises — solving one twice awards nothing, because the
 * record is a boolean. Games are a counter, so the same rule has to be spelled:
 * the first two wins at a level show it was not luck, and the twentieth shows
 * nothing at all. Losses and draws are recorded but never counted, in either
 * direction — see `AWARD_WIN`'s neighbours in `progress.ts`.
 */
export const COUNTED_WINS_PER_LEVEL = 2;

/** Points from games, given a per-level win count. Losses cost nothing. */
export function gamePoints(wins: Readonly<Partial<Record<Level, number>>>): number {
  let total = 0;
  for (const level of ['debutant', 'intermediaire', 'avance'] as const) {
    const counted = Math.min(wins[level] ?? 0, COUNTED_WINS_PER_LEVEL);
    total += counted * AWARD_WIN[level];
  }
  return total;
}

/* ───────────────────────────── the ranks ─────────────────────────────── */

export type RankId = 'pion' | 'cavalier' | 'fou' | 'tour' | 'dame';

export interface Rank {
  readonly id: RankId;
  /** Points at or above which this rank is held. */
  readonly min: number;
}

/**
 * ⚠️ RE-SPACED AGAINST THE CONTENT THAT EXISTS TODAY. The E3 numbers were set
 * against a 350-point ceiling and the site had grown to 965 — every threshold
 * had silently become about a quarter as hard.
 *
 * ⚠️⚠️ AND THEN RE-SPACED AGAIN, IN THE SAME RELEASE, WHEN THREE DUPLICATE
 * EXERCISES WERE CUT. That is not churn; it is the liability at the bottom of
 * this block firing immediately, in the SHRINK direction nobody thinks about.
 * Removing 65 points of content pushed Dame (then 800) ABOVE the learning
 * ceiling (then 780) — quietly making the top rank unreachable without games,
 * which is the one property this table is not allowed to lose. **Cutting
 * content moves these numbers exactly as adding it does.**
 *
 * ⚠️ MEASURED, NOT ESTIMATED. Read off the built catalogue, not counted by
 * hand:
 *
 *   13 tutorial steps      × 5   =  65
 *   19 lessons with boards × 10  = 190
 *   24 standalone exercises      = 525   (incl. the +5 mate bonuses)
 *   ─────────────────────────────────
 *   everything there is to learn   780
 *   games, both wins at all three  120   (2×5 + 2×15 + 2×40)
 *   ─────────────────────────────────
 *   FULL MARKS TODAY               900
 *
 * | Rank     | Points | % of 900 | What it actually takes |
 * |----------|--------|----------|------------------------|
 * | Pion     |      0 |       0% | arriving |
 * | Cavalier |     75 |       8% | the whole tutorial, or most of it plus an exercise |
 * | Fou      |    200 |      22% | the basics, a full course, and a handful of exercises |
 * | Tour     |    450 |      50% | half of everything — realistically the teaching plus some play |
 * | Dame     |    740 |      82% | very nearly all the teaching, or most of it plus real games |
 *
 * ⚠️ WHAT EACH RANK IS *FOR* — the part a number cannot say, and the reason the
 * next person to re-tune these has something to argue with:
 *
 * - **Pion — you turned up.** It exists so nobody is rankless. It is not
 *   earned and must never require anything.
 *
 * - **Cavalier — you have the rules.** The "achievable in one sitting" rank,
 *   aimed at a child who had never played before today. 75 is the finished
 *   tutorial (65) plus a little, so it lands *just after* the basics rather
 *   than during them: finishing should feel like completing something and then
 *   being given something, in that order. ⚠️ **Unmoved by the cuts**, because
 *   the tutorial did not change — a threshold pinned to a specific body of work
 *   should not drift when unrelated content moves.
 *
 * - **Fou — you have started properly.** The basics plus a whole course plus a
 *   few exercises. The first rank that cannot be reached in one sitting, which
 *   is the point: it marks the difference between having seen the site and
 *   having used it.
 *
 * - **Tour — you are a serious student.** Half of everything. By here hints
 *   have usually cost some points, so Tour is where PLAY starts carrying part
 *   of the load — which is what "more play" means: never required, but the
 *   natural way to cover the gap.
 *
 * - **Dame — you have done very nearly all of it.** 740 against a learning
 *   ceiling of 780. This is the direction doc's non-negotiable — *un rang gagné
 *   en cliquant ne dure pas deux minutes face à un ado*. ⚠️ **Dame still does
 *   NOT require games**: 780 > 740, so a student who only ever studies reaches
 *   it. The 40-point gap is the slack for four hinted exercises, and games can
 *   cover it instead.
 *
 * ⚠️⚠️ RAISING THESE DEMOTES EXISTING READERS, AND THAT IS A KNOWN, ACCEPTED
 * COST — SEÀN'S CALL, NOT AN OVERSIGHT.
 *
 * The rule that stood here said thresholds "may only ever move in the direction
 * that does NOT demote a reader who already holds a rank... in practice raising
 * them only alongside a `v2` progress key, or not at all." That rule was right
 * about the harm and wrong about the remedy: bumping the key to `v2` would
 * DELETE every reader's records to protect their rank badge, trading a visible
 * demotion for actual data loss. Demotion is the lesser harm and it is the one
 * taken.
 *
 * Concretely: a reader on 250 points was Tour and is now Fou. Nothing they did
 * is lost — points are DERIVED (Critical Feature 33), every record is intact,
 * and the same work now measures against a site three times the size.
 *
 * ⚠️ THE NEXT PERSON TO CHANGE THE CONTENT INHERITS THIS AGAIN, IN EITHER
 * DIRECTION. These are absolute numbers against a moving ceiling. **Recompute
 * against `ceilingOf()` and check Dame is still below the LEARNING ceiling** —
 * that single comparison is what the second re-spacing above existed to
 * restore. The durable fix is to express thresholds as a FRACTION of the
 * ceiling, deliberately not done here: it changes what a rank means from "this
 * much work" to "this much of what exists", and a reader whose rank falls
 * because somebody else published an exercise is a worse surprise than this
 * one.
 */
export const RANKS: readonly Rank[] = [
  { id: 'pion', min: 0 },
  { id: 'cavalier', min: 75 },
  { id: 'fou', min: 200 },
  { id: 'tour', min: 450 },
  { id: 'dame', min: 740 },
];

/** The rank held at a given total, and how far the next one is. */
export function rankAt(points: number): {
  readonly rank: Rank;
  readonly next: Rank | null;
  /** 0–1 through the current band. 1 when there is no next rank. */
  readonly progress: number;
} {
  let index = 0;
  for (let i = 0; i < RANKS.length; i += 1) {
    if (points >= RANKS[i]!.min) index = i;
  }
  const rank = RANKS[index]!;
  const next = RANKS[index + 1] ?? null;
  if (!next) return { rank, next: null, progress: 1 };
  const span = next.min - rank.min;
  return {
    rank,
    next,
    progress: span > 0 ? Math.min(1, Math.max(0, (points - rank.min) / span)) : 1,
  };
}

/* ────────────────────────── the achievements ─────────────────────────── */

/**
 * Achievements are COMPUTED FROM PROGRESS. There is no table of earned badges
 * and nothing to sync — the same decision the rest of the local progress makes.
 *
 * ⚠️ THE ONE THING THAT IS STORED IS WHICH ONES HAVE BEEN ANNOUNCED, and that
 * is a UI bookmark rather than the achievement itself. Without it the toast
 * fires again on every page load for ever. Deleting it re-announces; it can
 * never grant anything, because the earning is still derived.
 *
 * Five condition kinds, and that is the whole vocabulary — each is a shape the
 * inline resolver can evaluate against data it was handed, so no achievement
 * needs logic shipped for it.
 *
 * ⚠️ A CONDITION NAMES CATALOGUE ENTRIES BY INDEX, NEVER BY KEY OR BY ID. Both
 * of the alternatives were tried and both cost real bytes on the site's
 * most-visited page: repeating the progress keys inside conditions doubled the
 * payload, and giving each entry a string id repeated the very keys sitting
 * beside it. An index is a number and the array is already ordered.
 *
 *   solved  — at least `n` catalogue entries are complete
 *   mate    — any entry flagged as ending in checkmate is complete
 *   entries — every one of these entry indexes is complete
 *   streak  — the session streak reached `n`
 *   wins    — at least one win at `level`
 */
export type AchievementCondition =
  | { readonly kind: 'solved'; readonly n: number }
  | { readonly kind: 'mate' }
  | { readonly kind: 'entries'; readonly ids: readonly number[] }
  | { readonly kind: 'streak'; readonly n: number }
  | { readonly kind: 'wins'; readonly level: Level };

export interface Achievement {
  readonly id: string;
  readonly condition: AchievementCondition;
}

/** The streak length that earns `streak-five`. */
export const STREAK_ACHIEVEMENT = 5;

/** Exercises solved that earns `ten-exercises`. */
export const TEN_EXERCISES = 10;

/**
 * ⚠️ "A TRAP MASTERED" IS DELIBERATELY NOT HERE. See CLAUDE.md → E3.
 *
 * A trap page is a REPLAYER. Nothing on it records anything, because stepping
 * through a game someone else played is reading, not competence — and the
 * resolver's own rule is that opening a page leaves no trace. The only way to
 * ship this achievement today would be to award it for scrubbing a replay to
 * the end, which is precisely the "rank earned by clicking" the direction
 * forbids. It lands when a trap carries an exercise; it is in BACKLOG.md.
 */
