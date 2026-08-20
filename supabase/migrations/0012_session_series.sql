-- ════════════════════════════════════════════════════════════════════════════
-- 0012 — sessions.series_id: a LABEL on rows created together
--
-- A teacher running a weekly workshop must not create thirteen sessions by
-- hand. `/admin/seances` now generates them — and the generated rows are
-- ORDINARY ROWS. This column is the one thing that says they arrived together.
--
-- ═══ ⚠️ THIS IS A LABEL, NEVER A RULE. THE DISTINCTION IS THE WHOLE DESIGN ══
--
-- There is **no RRULE engine and no recurrence table**, and there is not going
-- to be one. The same decision BabyClub took, for the same reason: the moment a
-- rule owns the set, cancelling one week means reasoning about the rule —
-- exceptions, EXDATEs, "the third Wednesday except when it moved" — and the
-- prof's simple act of calling off one session becomes a data-modelling
-- problem. Thirteen independent rows have no such failure mode.
--
-- So the rule that binds every future session:
--
--   ⚠️ NOTHING MAY READ `series_id` TO DECIDE WHAT A SESSION *IS*.
--
-- It may only be used to SELECT rows the prof is already looking at — "publish
-- these twelve", "cancel the rest of the term". A session's date, status,
-- venue, level and title are properties of that row and of nothing else. If a
-- future change wants to ask "what does the series say this week should be",
-- the answer is that the series says nothing; it is a receipt, not a schedule.
--
-- What it buys, and why it is worth a column:
--
--   1. Bulk publish and bulk cancel become ONE statement (`… in (…)`), which is
--      what keeps 0011's statement-level rebuild trigger firing ONCE for a prof
--      action instead of thirteen times. Without the label, "cancel the rest of
--      the term" is twelve taps and twelve Cloudflare builds.
--   2. The list can say "séance 3 sur 13", which is the difference between a
--      wall of near-identical cards and a set a prof can navigate.
--
-- ⚠️ NULLABLE, AND NULL IS THE COMMON CASE. A one-off session carries no
-- series, and nothing may treat "no series" as an error or a lesser state.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.sessions
  add column if not exists series_id uuid;

comment on column public.sessions.series_id is
  'A LABEL marking rows created by one repeat action. Never a rule: nothing may '
  'read it to decide what a session is, only to select rows the prof already '
  'sees. No RRULE, no recurrence table — see migration 0012.';

-- ⚠️ Indexed because every read of it is `where series_id = …`: the bulk
-- publish/cancel statements and the "n sur N" count. Partial, because the
-- overwhelming majority of rows are one-offs with a null here.
create index if not exists sessions_series_id_idx
  on public.sessions (series_id)
  where series_id is not null;

-- ⚠️ NO NEW GRANT AND NO NEW POLICY, AND THAT IS CORRECT, NOT AN OMISSION.
-- 0001's grants on `public.sessions` are TABLE-level (`grant select … to anon,
-- authenticated`, `grant insert, update, delete … to authenticated`), so they
-- cover columns added later; `sessions_staff_all` and `sessions_select_public`
-- are row policies and do not name columns at all.
--
-- ⚠️ ANON CAN READ IT, AND THAT IS FINE. A published session is public already;
-- the label is a random uuid that tells a reader two public sessions were
-- programmed in one action. There is nothing in it about a person.
