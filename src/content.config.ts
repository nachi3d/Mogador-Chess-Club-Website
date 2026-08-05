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

/** Bilingual commentary attached to a half-move index within the PGN. */
const moveNote = z.object({
  /** 0-based index into the game's half-move (ply) list. */
  ply: z.number().int().nonnegative(),
  text_fr: z.string(),
  text_en: z.string(),
});

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
    notes: z.array(moveNote).default([]),
    summary_fr: z.string(),
    summary_en: z.string(),
    /** Hidden from the index without deleting the file. */
    draft: z.boolean().default(false),
  }),
});

/* ────────────────────────────── cours ────────────────────────────── */

/**
 * Deliberately minimal: lesson ordering WITHIN a course is still an open
 * question (see CLAUDE.md → Open questions). Today a course is a single
 * ordered entry; when lessons become their own documents this grows a
 * `lessons` collection with a `reference('cours')` back-link rather than
 * being reshaped.
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

export const collections = { traps, cours, exercices, agenda };
