/**
 * WHO IS THIS ACCOUNT FOR — the one place that decides.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THE ANSWER AND THE TRUTH ARE TWO DIFFERENT THINGS, AND THIS FILE IS WHERE
 * THEY MEET.
 *
 * `/bienvenue/` asks « Qui va utiliser ce compte ? » and stores the reply in
 * `profiles.account_shape`. That is the ANSWER. What the account actually holds
 * — whether one of its player profiles is flagged `is_self` — is the TRUTH, and
 * it moves afterwards: a reader who said "moi, je joue" and later adds a child
 * is a "both" account from that moment, and nobody should have to remember to
 * rewrite a column for the page to say so.
 *
 * So the roster is load-bearing and the stored answer is the tie-breaker. It
 * exists to separate exactly one pair of states that the roster alone cannot:
 * "they told us the players are their children" from "they never told us".
 *
 * ⚠️ `unknown` IS A FIRST-CLASS OUTCOME, NOT A FAILURE. Skipping the welcome
 * screen is supported (Critical Feature 52), and a skipped account must read
 * correctly rather than be guessed at. Critical Feature 54 is what it falls back
 * to: name the STRUCTURE, never the relationship, because an account with one
 * profile is the same object for a parent and for a teenager who signed up
 * alone. Guessing "children" from a lone unflagged profile is precisely the
 * failure that rule was written about.
 *
 * ⚠️ PURE, AND IT MUST STAY PURE. No DOM, no `localStorage`, no Supabase. A spec
 * imports it in Node; `/compte/` and `/bienvenue/` import it in a page script.
 * Neither may drag a backend in behind it.
 * ═════════════════════════════════════════════════════════════════════════
 */

/** What a reader can answer at first sign-in. Mirrors 0010's CHECK constraint. */
export type AccountShape = 'self' | 'children' | 'both';

/**
 * What the interface should actually say. `unknown` is the neutral,
 * structure-naming register — never a guess dressed as one of the three.
 */
export type EffectiveShape = AccountShape | 'unknown';

/** Only the two fields the decision turns on. Deliberately not `Child`. */
export interface ShapeChild {
  readonly isSelf: boolean;
}

/** Every value that must be true before a shape is claimed. */
export interface ShapeInput {
  /** `profiles.account_shape`, verbatim. Anything unrecognised reads as null. */
  readonly answer: string | null | undefined;
  /** The account's player profiles, in any order. */
  readonly children: readonly ShapeChild[];
}

/** The stored answer, normalised. Anything else — old data, a hand edit — is null. */
export function readAnswer(value: string | null | undefined): AccountShape | null {
  return value === 'self' || value === 'children' || value === 'both' ? value : null;
}

/**
 * Resolve the register the copy should use.
 *
 * ⚠️ THE ROSTER WINS WHENEVER IT CAN SPEAK. A flagged profile is a fact about
 * what exists; the stored answer is a sentence somebody typed once. Where they
 * disagree — a "self" account that has grown a sibling, a "both" account whose
 * holder removed their own profile — the roster is the one that is still true.
 */
export function effectiveShape(input: ShapeInput): EffectiveShape {
  const answer = readAnswer(input.answer);
  const holderPlays = input.children.some((child) => child.isSelf);
  const others = input.children.filter((child) => !child.isSelf).length;

  if (holderPlays) return others > 0 ? 'both' : 'self';

  /* ⚠️ ONLY "children" SURVIVES WITHOUT A FLAGGED ROW, and only when it was
     actually said. A stored "both" with no `is_self` profile left is an account
     whose holder removed their own — the children really are the players now.
     A stored "self" with no flagged row is a write that went missing, and the
     neutral copy is the only thing certain to still be true. */
  if (answer === 'children' || answer === 'both') return 'children';
  return 'unknown';
}

/**
 * The holder's own profile id, if they have one.
 *
 * Returns null rather than throwing on the (index-prevented) case of two
 * flagged rows: a page that names the wrong person is worse than one that
 * names nobody, and `child_profiles_one_self_idx` is what actually stops it.
 */
export function holderProfileId(
  children: readonly (ShapeChild & { readonly id: string })[],
): string | null {
  const flagged = children.filter((child) => child.isSelf);
  return flagged.length === 1 ? flagged[0]!.id : null;
}
