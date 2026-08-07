/**
 * Content collections.
 *
 * ⚠️ Astro 7 location: `src/content.config.ts` — NOT `src/content/config.ts`.
 * Each collection declares an explicit `loader`; the old "a folder under
 * src/content/ is automatically a collection" behaviour is gone.
 *
 * Zod is imported from `astro/zod` (Zod v4). The `z` re-exported by
 * `astro:content` still works but is deprecated in Astro 7.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * TWO RULES ARE ENCODED HERE — see CLAUDE.md for the full statements.
 *
 * 1. PGN LANGUAGE RULE. `pgn` is STANDARD notation and stays language-neutral.
 *    Commentary NEVER goes inside the PGN as `{...}` comments, because a PGN
 *    can hold only one language and we ship two. All prose lives in the
 *    frontmatter `*_fr` / `*_en` fields, keyed to a move index. This also keeps
 *    the PGN paste-able into Lichess or SCID unchanged.
 *
 * 2. EXERCISE VALIDATION RULE (`onlyMove`).
 *      onlyMove: true  — the stored `solution` is the ONLY accepted line.
 *                        Anything else is wrong, even if it also wins. Use for
 *                        forced mates and single-tactic puzzles.
 *      onlyMove: false — (the default) the stored `solution` is the model line,
 *                        but any move that also wins should be accepted once
 *                        the engine-backed validator lands. Until then the
 *                        validator accepts the stored line only, and MUST NOT
 *                        tell the player a non-matching move is "wrong" — it
 *                        says "not the line we had in mind". Getting this
 *                        backwards teaches beginners that correct moves are
 *                        errors, which is worse than no validation at all.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

/** The three club levels. Shared by every collection so filters compose. */
const level = z.enum(['debutant', 'intermediaire', 'avance']);

/** URL slug — lowercase, digits and hyphens. Kept strict so routes stay clean. */
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase-with-hyphens');

/**
 * A single UCI move: from-square, to-square, optional promotion piece.
 * e.g. "e2e4", "e7e8q". UCI (not SAN) is the storage format for exercises
 * because it is unambiguous without a board and maps 1:1 onto what Chessground
 * emits and chess.js accepts.
 */
const uciMove = z
  .string()
  .regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/, 'expected a UCI move such as "e2e4" or "e7e8q"');

/**
 * A board square, e.g. "e4". Used by the arrow/circle overlays.
 */
const square = z.string().regex(/^[a-h][1-8]$/, 'expected a square such as "e4"');

/**
 * PLY NUMBERING — shared by `moveComments` and `shapes`, and matched exactly by
 * `src/lib/chess/replay.ts`:
 *   ply 0 = the FIRST half-move (1. e4)
 *   ply 1 = the reply          (1... e5)
 * `scripts/check-content.mjs` fails the check if a ply points past the end of
 * its PGN, so a comment can never silently attach to nothing.
 */
const ply = z.number().int().nonnegative();

/**
 * Bilingual commentary attached to one half-move.
 *
 * RULE (see CLAUDE.md → PGN language rule): this is the ONLY place trap prose
 * lives. The PGN itself stays standard, language-neutral notation with no
 * `{...}` comments, because a PGN carries one language and this site ships two.
 */
const moveComment = z.object({
  ply,
  fr: z.string(),
  en: z.string(),
});

/**
 * Arrows and circles drawn on the board at a given ply, via Chessground's
 * drawable API. Language-neutral by construction — a diagram needs no
 * translation, which is exactly why the visual emphasis lives here rather than
 * being described in prose twice.
 */
const plyShapes = z.object({
  ply,
  /** [from, to] pairs, e.g. [["f3","e5"]]. */
  arrows: z.array(z.tuple([square, square])).optional(),
  circles: z.array(square).optional(),
});

/**
 * A YouTube video ID (not a URL) — e.g. "dQw4w9WgXcQ".
 * Stored as an ID so the embed/privacy decision (nocookie domain, lazy
 * facade, consent) is made once at render time and not baked into content.
 * FIELD ONLY in this session; nothing renders it yet.
 */
const youtubeId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{11}$/, 'expected an 11-character YouTube video ID, not a URL')
  .optional();

/* ────────────────────────────── traps ────────────────────────────── */

const traps = defineCollection({
  loader: glob({ base: './src/content/traps', pattern: '**/*.{md,mdx,json}' }),
  schema: z.object({
    title_fr: z.string(),
    title_en: z.string(),
    slug,
    /** ECO code, e.g. "C57". Optional — not every trap has a tidy one. */
    eco: z
      .string()
      .regex(/^[A-E][0-9]{2}$/, 'expected an ECO code such as "C57"')
      .optional(),
    level,
    /** Free tags: "fourchette", "mat-du-berger", "sacrifice"... */
    themes: z.array(z.string()).default([]),
    /**
     * RULE 1 — standard PGN, language-neutral, no `{...}` commentary.
     * Paste-able into Lichess/SCID as-is.
     */
    pgn: z.string(),
    /** RULE 1 — the bilingual commentary, keyed to plies of the PGN above. */
    moveComments: z.array(moveComment).default([]),
    /** Optional board annotations, keyed to the same plies. */
    shapes: z.array(plyShapes).default([]),
    summary_fr: z.string(),
    summary_en: z.string(),
    youtube: youtubeId,
    /** Hidden from the index without deleting the file. */
    draft: z.boolean().default(false),
  }),
});

/* ────────────────────────────── cours ────────────────────────────── */

/**
 * Deliberately minimal, and staying that way for now.
 *
 * DECIDED (Session 2), NOT YET IMPLEMENTED: course long-form bodies will move
 * to **per-locale Markdown pairs** — `les-bases.fr.md` / `les-bases.en.md` —
 * rather than growing more `*_fr` / `*_en` frontmatter fields. A lesson is
 * prose with headings, diagrams and lists; that is what Markdown is for, and
 * one file per language keeps a body in exactly one language (the reason the
 * rest of the content is JSON). This metadata block stays as the course index
 * record. Do not add body fields here in the meantime.
 */
const cours = defineCollection({
  loader: glob({ base: './src/content/cours', pattern: '**/*.{md,mdx,json}' }),
  schema: z.object({
    title_fr: z.string(),
    title_en: z.string(),
    slug,
    level,
    /** Position in the course list. Lower first. */
    order: z.number().int().nonnegative(),
    summary_fr: z.string(),
    summary_en: z.string(),
    youtube: youtubeId,
    draft: z.boolean().default(false),
  }),
});

/* ──────────────────────────── exercices ──────────────────────────── */

const exercices = defineCollection({
  loader: glob({ base: './src/content/exercices', pattern: '**/*.{md,mdx,json}' }),
  schema: z
    .object({
      title_fr: z.string(),
      title_en: z.string(),
      slug,
      /** Starting position. Full FEN, six fields — side to move matters. */
      fen: z.string().min(1),
      /** The player's moves, in order. UCI. */
      solution: z.array(uciMove).min(1),
      /**
       * The opponent's replies, aligned index-for-index with `solution`:
       * opponentReplies[i] is played after solution[i]. The final player move
       * usually ends the exercise, so this array is normally
       * `solution.length - 1` long — or the same length if the line continues.
       */
      opponentReplies: z.array(uciMove).default([]),
      /** RULE 2 — see the header. Defaults to the permissive reading. */
      onlyMove: z.boolean().default(false),
      hint_fr: z.string(),
      hint_en: z.string(),
      level,
      themes: z.array(z.string()).default([]),
      draft: z.boolean().default(false),
    })
    .refine((e) => e.opponentReplies.length <= e.solution.length, {
      message:
        'opponentReplies must align with solution: at most one reply per player move ' +
        '(normally solution.length - 1, since the last player move ends the exercise).',
      path: ['opponentReplies'],
    }),
});

/* ──────────────────────────── tutoriel ───────────────────────────── */

/**
 * The beginner tutorial — `/apprendre-les-bases/`.
 *
 * Written for someone who has never played, so it sits BELOW `debutant`: the
 * `level` field is deliberately absent rather than set, because "pre-débutant"
 * is not one of the three levels the rest of the site uses and inventing a
 * fourth would ripple into every badge and filter.
 *
 * Each step carries its prose AND one micro-exercise. That pairing is the whole
 * design: the board that demonstrates a rule is the same board that checks the
 * reader understood it, judged through the same `judgeMove` path as every other
 * exercise on the site. There is no second board component and no new mode —
 * exercise mode already highlights every legal destination when a piece is
 * picked up, which is exactly the "sandbox" behaviour a beginner needs.
 */
const tutoriel = defineCollection({
  loader: glob({ base: './src/content/tutoriel', pattern: '**/*.{md,mdx,json}' }),
  schema: z
    .object({
      title_fr: z.string(),
      title_en: z.string(),
      slug,
      /** Position in the guided sequence. Ascending; gaps are allowed. */
      order: z.number().int().positive(),
      /** One-line summary, shown on the index card. */
      summary_fr: z.string(),
      summary_en: z.string(),
      /** The teaching itself: one string per paragraph. */
      body_fr: z.array(z.string()).min(1),
      body_en: z.array(z.string()).min(1),
      /** What the reader is asked to do on the board, in plain language. */
      task_fr: z.string(),
      task_en: z.string(),
      /** Starting position. Full FEN, six fields. */
      fen: z.string().min(1),
      solution: z.array(uciMove).min(1),
      opponentReplies: z.array(uciMove).default([]),
      /**
       * Tutorial tasks name a destination ("bring the rook to h8"), so a
       * different move genuinely is not the task — `onlyMove: true` is honest
       * here in a way it would not be for a tactics puzzle, where another
       * winning move exists. See CLAUDE.md → Exercise validation rule.
       */
      onlyMove: z.boolean().default(true),
      hint_fr: z.string(),
      hint_en: z.string(),
      orientation: z.enum(['white', 'black']).optional(),
      draft: z.boolean().default(false),
    })
    .refine((e) => e.opponentReplies.length <= e.solution.length, {
      message: 'opponentReplies must align with solution: at most one reply per player move.',
      path: ['opponentReplies'],
    }),
});

/* ────────────────────────────── agenda ───────────────────────────── */

const agenda = defineCollection({
  loader: glob({ base: './src/content/agenda', pattern: '**/*.{md,mdx,json}' }),
  schema: z.object({
    /** Session date. Coerced from an ISO `YYYY-MM-DD` string in frontmatter. */
    date: z.coerce.date(),
    /** Local start time, 24h `HH:MM`. Kept separate from `date` so the site
        never has to reason about time zones for a walk-in club session. */
    time: z.string().regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'expected HH:MM'),
    /**
     * Venue name for THIS session. Defaults to `site.venue.name` at render
     * time when omitted — a session can move without touching site config,
     * and site config can move without rewriting past sessions.
     */
    venue: z.string().optional(),
    level,
    note_fr: z.string().optional(),
    note_en: z.string().optional(),
    draft: z.boolean().default(false),
  }),
});

export const collections = { traps, cours, exercices, tutoriel, agenda };
