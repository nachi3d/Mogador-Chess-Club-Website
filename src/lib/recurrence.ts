/**
 * Repeating a session — the pure half.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THERE IS NO RECURRENCE ENGINE HERE, AND THERE MUST NOT BE ONE.
 *
 * This file expands "every week until the 5th of December" into a plain list of
 * instants, ONCE, at the moment a prof presses the button. What comes out is
 * thrown away; what is stored is thirteen ordinary rows. Nothing on this site
 * ever asks "what does the rule say about next Wednesday" — because there is no
 * rule stored, only rows.
 *
 * That is the same decision BabyClub took, for the same reason: one cancelled
 * week must not require reasoning about a rule. See migration 0012, which
 * carries the argument in full, and `sessions.series_id`, which is a LABEL on
 * the rows and never a rule about them.
 *
 * ⚠️ PURE, AND IT STAYS PURE. No DOM, no Supabase, no `localStorage`, no
 * `Intl` formatting. `recurring-sessions.spec.ts` imports it straight into Node
 * and runs it against a fixed clock; the moment it reaches for a browser API
 * that stops being possible, and the arithmetic below is exactly the part that
 * has to be checkable without a browser.
 * ═════════════════════════════════════════════════════════════════════════
 */

/**
 * ⚠️ TWO CADENCES, AND THAT IS DELIBERATELY ALL OF THEM.
 *
 * "Every week" and "every two weeks" are what a chess club at Dar Souiri
 * actually runs. Monthly ("the third Wednesday") is where a date list stops
 * being obvious and a rule starts being tempting, and it has never been asked
 * for. Adding it later is a new entry in `STEP_DAYS` plus a label — adding it
 * now would be inventing a requirement.
 */
export type Cadence = 'none' | 'weekly' | 'fortnightly';

const STEP_DAYS: Readonly<Record<Exclude<Cadence, 'none'>, number>> = {
  weekly: 7,
  fortnightly: 14,
};

/**
 * ⚠️ THE CAP IS A TYPO GUARD, NOT A POLICY.
 *
 * 52 is one year of weekly sessions, or two of fortnightly — more than the
 * club's September-to-June year, so no legitimate use meets it. What it stops
 * is `2036-09-03` typed where `2026-09-03` was meant, which would otherwise
 * insert five hundred rows into the public agenda in one statement.
 *
 * ⚠️ IT REFUSES, IT DOES NOT TRUNCATE. Creating the first 52 of 520 and saying
 * nothing would leave a prof believing the rest exist — the same defect as a
 * card with no destination, at a scale nobody would check.
 */
export const SERIES_MAX = 52;

export type RecurrenceProblem =
  | 'no-start'
  | 'bad-start'
  | 'no-until'
  | 'bad-until'
  | 'until-before-start'
  | 'too-many';

export interface RecurrenceInput {
  /** The `datetime-local` value: `YYYY-MM-DDTHH:mm`, no zone. */
  readonly startLocal: string;
  readonly cadence: Cadence;
  /** The `date` value: `YYYY-MM-DD`, no zone. Ignored when cadence is 'none'. */
  readonly untilLocal: string;
}

export type RecurrenceResult =
  | { readonly ok: true; readonly dates: readonly Date[] }
  | { readonly ok: false; readonly problem: RecurrenceProblem; readonly wanted?: number };

/**
 * ⚠️ PARSED BY HAND, BECAUSE `new Date(string)` DISAGREES WITH ITSELF.
 *
 * ECMAScript reads a date-TIME string with no offset (`2026-09-03T16:00`) as
 * LOCAL, and a date-ONLY string (`2026-12-05`) as UTC. Feeding both to
 * `new Date()` would put the end of the range an hour into the previous day in
 * Morocco — and would silently drop the last occurrence of a term, which is the
 * one a prof would notice last.
 */
function parseLocalDateTime(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d, hh, mm] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** The last moment of a local calendar day. Same parsing rule as above. */
function parseLocalEndOfDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Expand a repeat into the instants it means.
 *
 * ⚠️ THE STEP IS IN LOCAL CALENDAR DAYS, NOT IN MILLISECONDS, AND MOROCCO IS
 * WHY. The country drops from UTC+1 to UTC+0 for Ramadan and back again, so
 * `+7 × 86 400 000` moves a 16:00 session to 15:00 for part of the spring and
 * back afterwards. `setDate(getDate() + 7)` re-derives the instant from the
 * local calendar fields, so 16:00 stays 16:00 in the room — which is the only
 * thing a parent standing outside Dar Souiri cares about.
 *
 * This is the same reasoning as `site.timezone` being an IANA name and never
 * `+01:00`; getting it wrong here would move a session by an hour with nothing
 * on any screen looking wrong.
 */
export function expandSeries(input: RecurrenceInput): RecurrenceResult {
  if (!input.startLocal.trim()) return { ok: false, problem: 'no-start' };
  const start = parseLocalDateTime(input.startLocal);
  if (!start) return { ok: false, problem: 'bad-start' };

  if (input.cadence === 'none') return { ok: true, dates: [start] };

  if (!input.untilLocal.trim()) return { ok: false, problem: 'no-until' };
  const until = parseLocalEndOfDay(input.untilLocal);
  if (!until) return { ok: false, problem: 'bad-until' };
  if (until.getTime() < start.getTime()) return { ok: false, problem: 'until-before-start' };

  const step = STEP_DAYS[input.cadence];
  const dates: Date[] = [];
  /* Counted independently of the cap so the refusal can say how many were
     actually asked for — "520 séances" is what makes the typo obvious. A hard
     ceiling stops the loop being unbounded on absurd input. */
  let wanted = 0;
  const cursor = new Date(start.getTime());
  const HARD_STOP = 5000;

  while (cursor.getTime() <= until.getTime() && wanted < HARD_STOP) {
    wanted += 1;
    if (wanted <= SERIES_MAX) dates.push(new Date(cursor.getTime()));
    cursor.setDate(cursor.getDate() + step);
  }

  if (wanted > SERIES_MAX) return { ok: false, problem: 'too-many', wanted };
  return { ok: true, dates };
}
