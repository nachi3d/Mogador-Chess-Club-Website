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

/**
 * ⚠️ CLAIMS — what the PROSE beside a board says the position does.
 *
 * A legal position is not a correct position. `check-content.mjs` proves a FEN
 * is possible and a solution is legal; it cannot read the sentence next to the
 * diagram, and that is exactly where authored content goes wrong. Content
 * batch 3 shipped four boards that passed every mechanical check and each
 * described a mechanism the position did not contain — a "pin" blocked by an
 * intervening pawn, a "discovery" whose bishop was not on the line, a "fork"
 * the defender could simply capture, and a "mate" that could be blocked.
 *
 * So the claim is written down as DATA and asserted at build time. Every kind
 * below is machine-checkable from the position alone:
 *
 *   pin        the named piece cannot move, AND removing it exposes its own
 *              king — which is what distinguishes a pin from a piece that is
 *              merely blocked in
 *   fork       the piece on `from` attacks every one of `targets`
 *   discovery  `by` does NOT attack `target` now, and DOES once `screen` is
 *              removed — the screen is load-bearing, which is the whole motif
 *   line       the given moves are legal in sequence and the final position is
 *              the stated outcome (mate / check / quiet), optionally capturing
 *              a stated piece type
 *
 * `after` replays moves before asserting, because a caption usually describes
 * the position the diagram is ABOUT to reach ("the knight jumps to c7 …").
 *
 * ⚠️ `manual` is the honest escape, NOT a way to silence the check. A claim
 * that needs a forcing-line search — "the king must step aside and then the
 * queen falls", "if she recaptures it is mate in two" — is not a property of a
 * position and cannot be stated here. Those take `kind: 'manual'` with a
 * `note` saying what a human must verify, and they are PRINTED as a review
 * queue rather than passing silently. A board with no claims at all is printed
 * too, for the same reason.
 */
const claim = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('pin'),
    /** TRAPS ONLY: the ply whose position this is about. See `trapClaim`. */
    ply: z.number().int().min(-1).optional(),
    /** Moves to play before asserting, UCI. */
    after: z.array(uciMove).default([]),
    /** The square of the pinned piece. */
    piece: square,
  }),
  z.object({
    kind: z.literal('fork'),
    ply: z.number().int().min(-1).optional(),
    after: z.array(uciMove).default([]),
    /** The square the forking piece stands on. */
    from: square,
    /** Every square it must attack. Two or more, or it is not a fork. */
    targets: z.array(square).min(2),
  }),
  z.object({
    kind: z.literal('discovery'),
    ply: z.number().int().min(-1).optional(),
    after: z.array(uciMove).default([]),
    /** The piece that steps aside. */
    screen: square,
    /** The piece that attacks once the screen leaves. */
    by: square,
    /** What it then attacks. */
    target: square,
  }),
  z.object({
    kind: z.literal('line'),
    ply: z.number().int().min(-1).optional(),
    after: z.array(uciMove).default([]),
    /** The sequence, both sides, UCI. */
    moves: z.array(uciMove).min(1),
    ends: z.enum(['mate', 'check', 'quiet', 'stalemate']),
    /** Piece type the LAST move must capture, e.g. "q". */
    captures: z.enum(['p', 'n', 'b', 'r', 'q']).optional(),
  }),
  z.object({
    kind: z.literal('manual'),
    ply: z.number().int().min(-1).optional(),
    /** What a human has to check, and why no machine can. Required. */
    note: z.string().min(1),
  }),
]);

/**
 * A claim on a TRAP, which has a PGN rather than a FEN.
 *
 * `ply` names the position the claim is about, on the SAME 0-based scheme as
 * `moveComments` and `shapes`: the position AFTER that half-move, with `-1`
 * meaning the start. `after`/`moves` then continue from there — which is what
 * lets a claim prove a REFUTATION that is not in the PGN at all ("at this
 * point 3...Qe7 holds, and 4.Qxe5 loses the queen").
 *
 * ⚠️ `ply` is REQUIRED here and forbidden on a lesson board. A lesson board
 * carries its own FEN, so a ply would have nothing to index; a trap has no FEN,
 * so a claim without a ply would silently pick some default position and prove
 * something about the wrong move. `check-content.mjs` rejects both mistakes.
 */
const trapClaim = claim;

/**
 * ⚠️ `ply` IS STRUCTURALLY OPTIONAL AND SEMANTICALLY REQUIRED ON A TRAP.
 *
 * Zod cannot express "required here, forbidden there" across two collections
 * sharing one union without duplicating the union, so the rule is enforced in
 * `check-content.mjs`, which fails the build both ways:
 *
 *   trap claim with no `ply`      → it would silently pick a base position and
 *                                   prove something true about the wrong move
 *   lesson claim WITH a `ply`     → the board carries its own FEN; a ply there
 *                                   indexes nothing and means the author
 *                                   believed something that is not happening
 *
 * Both were verified to fail before this shipped.
 */

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
    /**
     * What the prose beside this trap CLAIMS the line does — proved at build
     * time. See the `claim` block above; a trap's claims carry a `ply`.
     */
    claims: z.array(trapClaim).default([]),
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
 * to **per-locale Markdown pairs** — `roquer-tot.fr.md` / `roquer-tot.en.md` —
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

/* ──────────────────────────── lessons ────────────────────────────── */

/**
 * Long-form course bodies — DECIDED in Session 2, implemented here.
 *
 * `src/content/lessons/<course-slug>/<lesson-slug>.<locale>.md`
 *
 * One file per language, because a lesson is prose: headings, lists, worked
 * examples. A `body_fr` / `body_en` pair of frontmatter strings is the wrong
 * shape for three screens of teaching, and Markdown is exactly the right one.
 * The one-language-per-file constraint is the same rule the JSON content obeys,
 * just enforced at file granularity instead of field granularity.
 *
 * ⚠️ Language-NEUTRAL board data (`fen`, `pgn`, `solution`, `onlyMove`) is
 * duplicated across the pair, and `scripts/check-content.mjs` asserts the two
 * files agree. Duplication is the price of one-language-per-file; an unchecked
 * duplication would be a bug waiting to happen, so it is checked.
 *
 * Boards are placed inline with a `<!--board-->` marker in the body — see
 * `LessonPage.astro`.
 */

const lessonBoard = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('position'),
    fen: z.string().min(1),
    caption: z.string(),
    orientation: z.enum(['white', 'black']).optional(),
    claims: z.array(claim).default([]),
  }),
  z.object({
    kind: z.literal('replay'),
    /** Standard PGN, language-neutral, no `{...}` commentary. Rule 1. */
    pgn: z.string().min(1),
    caption: z.string().optional(),
    orientation: z.enum(['white', 'black']).optional(),
    /** ⚠️ Ply 0 is the FIRST half-move. See CLAUDE.md → PGN language rule. */
    comments: z.array(z.object({ ply, text: z.string() })).default([]),
  }),
  z.object({
    kind: z.literal('exercise'),
    fen: z.string().min(1),
    solution: z.array(uciMove).min(1),
    opponentReplies: z.array(uciMove).default([]),
    onlyMove: z.boolean().default(false),
    task: z.string(),
    hint: z.string(),
    orientation: z.enum(['white', 'black']).optional(),
    claims: z.array(claim).default([]),
  }),
]);

const lessons = defineCollection({
  loader: glob({
    base: './src/content/lessons',
    pattern: '**/*.{md,mdx}',
    /**
     * ⚠️ WITHOUT THIS, THE PAIR COLLIDES AND ONE LANGUAGE VANISHES.
     *
     * The default id generator treats `.fr` / `.en` as part of the extension, so
     * `occuper-le-centre.fr.md` and `occuper-le-centre.en.md` both reduce to the
     * id `occuper-le-centre` — the second silently overwrites the first, and the
     * site ships one language with no error beyond a build WARNING that is easy
     * to scroll past.
     *
     * Keeping the full relative path (minus the `.md`) makes the locale part of
     * the id, which is the whole point of the naming convention.
     */
    generateId: ({ entry }) => entry.replace(/\.mdx?$/, ''),
  }),
  schema: z.object({
    /** The course this belongs to — matches a `cours` slug. */
    course: slug,
    /** Lesson slug, shared by the `.fr.md` / `.en.md` pair. */
    slug,
    /** Position within the course. Contiguous from 1; the checker enforces it. */
    order: z.number().int().positive(),
    lang: z.enum(['fr', 'en']),
    title: z.string(),
    summary: z.string(),
    boards: z.array(lessonBoard).default([]),
    draft: z.boolean().default(false),
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

/* ────────────────────────────── agenda ─────────────────────────────

   ⚠️ RETIRED, AND NOT BY ACCIDENT — DO NOT RE-ADD IT.

   The club's sessions live in the `sessions` table and reach the site through
   `scripts/fetch-agenda.mjs` → `src/data/agenda.json` → `src/lib/agenda.ts`.
   A git collection alongside that would be a second source of truth for one
   list, which is the exact defect this replaced: `/admin/seances` wrote to the
   database and `/agenda/` read from git, so a session a prof published
   appeared nowhere and nothing said so.

   Content still lives in git. A SESSION IS NOT CONTENT — it is operational
   data a prof edits from a phone, and the one thing on this site that a person
   other than Seàn is expected to change. */

export const collections = { traps, cours, exercices, lessons, tutoriel };
