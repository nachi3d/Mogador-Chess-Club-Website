-- ────────────────────────────────────────────────────────────────────────────
-- 0014 — the 50-point ceiling on a teacher award is removed.
--
-- ⚠️ THIS REVERSES A DELIBERATE DECISION FROM 0004, AND IT IS SEÀN'S CALL.
--
-- 0004 wrote: "The upper bound is what stops a slipped keystroke minting a
-- rank; 50 is a little under the whole tutorial (65), so no single award can
-- outweigh the work." That reasoning was sound when it was written and it is
-- not what is being disputed. What changed is WHO decides: the size of an
-- award is a teaching judgement about a particular student on a particular
-- day, and encoding a ceiling in the schema takes that judgement away from the
-- person standing in the room.
--
-- ⚠️ THE ARGUMENT THE CAP WAS PROTECTING AGAINST HAS NOT GONE AWAY. A single
-- award larger than the whole tutorial really can outweigh the work, and a
-- slipped keystroke really can mint a rank. The answer is now the same one
-- this project uses everywhere else that a number is trusted: it is
-- ATTRIBUTED and AUDITABLE. Every row carries `awarded_by` and a required
-- `reason`, both of which survive this migration untouched, and every award is
-- visible on the student's own page. A prof who awards 5,000 points has not
-- found a hole — they have signed their name to it.
--
-- ⚠️ WHAT DOES NOT CHANGE, AND MUST NOT:
--
--   * POSITIVE ONLY. `points > 0` stays. This site records losses and charges
--     nothing for them (Critical Feature 35); a prof who could award a
--     NEGATIVE number would turn the ledger into a disciplinary instrument,
--     which is a different product and not this one.
--   * A REASON IS STILL REQUIRED, still checked on the trimmed length, still
--     in the database rather than the form. Points that appear with no
--     explanation destroy trust faster than no points at all.
--   * POINTS ARE STILL DERIVED, NEVER BANKED (Critical Feature 33). This
--     changes what a row may contain, not where the total comes from: the
--     total is still recomputed from the rows every time it is read, and the
--     client still may not send one.
--
-- ⚠️ IT IS A WIDENING, SO IT CANNOT BREAK AN EXISTING ROW. Every award already
-- stored satisfies `points > 0` and is <= 50, so it satisfies the new check
-- too. Nothing needs backfilling and nothing can fail on apply.
-- ────────────────────────────────────────────────────────────────────────────

-- ⚠️ FOUND BY NAME AT RUNTIME RATHER THAN HARDCODED. 0004 declared the check
-- inline in `create table`, so Postgres auto-named it — `point_awards_points_check`
-- on every build we have seen, but an auto-generated name is a fact about the
-- server rather than a promise to us. Looking it up means this migration
-- applies cleanly against a project where it was named differently, and does
-- nothing at all where it has already been dropped.
do $$
declare
  target text;
begin
  select con.conname
    into target
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
   where nsp.nspname = 'public'
     and rel.relname = 'point_awards'
     and con.contype = 'c'
     and pg_get_constraintdef(con.oid) ilike '%points%50%'
   limit 1;

  if target is not null then
    execute format('alter table public.point_awards drop constraint %I', target);
  end if;
end
$$;

-- The floor stays, on its own, and is named this time so a future migration
-- does not have to go looking for it.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'point_awards_points_positive'
  ) then
    alter table public.point_awards
      add constraint point_awards_points_positive check (points > 0);
  end if;
end
$$;
