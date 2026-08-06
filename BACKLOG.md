# Backlog

Things decided but not built, with the reason they are waiting. Anything here is
a real intention, not a wish — speculative ideas belong in CLAUDE.md's open
questions instead.

---

## Custom SMTP for auth emails (Resend)

**Blocked on:** the domain. `mogadorchess.ma` is not registered.

Magic-link emails currently go through **Supabase's built-in mailer**, which is
fine for development and thin for production:

- It is rate-limited (a few emails per hour on the free tier). A club signing up
  a class of children in one session will hit that ceiling.
- The sender is a Supabase address, not the club's. An email from an unfamiliar
  domain asking a parent to click a sign-in link is exactly what people are
  taught not to trust.
- The default template is untranslated and unbranded, while the rest of the site
  is bilingual.

**When the domain exists:**

1. Verify it with Resend (SPF, DKIM, DMARC — a magic-link sender that fails DMARC
   lands in spam, which reads to the reader as "the site is broken").
2. Point Supabase Auth at Resend's SMTP credentials.
3. Replace the default template with an FR/EN pair. The template language should
   follow the locale the account was created in — `profiles.locale` already holds
   it and `handle_new_user()` already clamps it.
4. Add a real-inbox check to `docs/MANUAL-TESTS.md` for both languages.

Until then the e2e suite does not test delivery at all, and says so plainly —
see the gap note at the top of `tests/e2e/auth.spec.ts`.

---

## Deferred to later v2 sessions

Listed so nobody rebuilds them early:

| Item | Session |
|---|---|
| Progress sync + `localStorage` import | v2-S3 (critical path) |
| Google OAuth | v2-S2 |
| Prof-created student accounts (parent email) | v2-S2 |
| Sessions + attendance UI, admin screens | v2-S4 |
| Charts / progress visualisation | v2-S5 |
| Student groups (all profs currently see all students) | v2.1 |

---

## Known gaps carried deliberately

- **Email delivery is untested by automation.** Covered manually before release;
  see the note in `tests/e2e/auth.spec.ts` and the checklist entry.
- **Account deletion has no self-service UI.** The privacy policy promises
  erasure on request, and `docs/ADMIN.md` has the SQL. A button belongs in a
  later session, with a confirmation flow that a child cannot trip over.
- **Inactive-account cleanup is a stated policy, not a job.** The privacy policy
  says two years; nothing enforces it yet. It needs a scheduled task, which this
  architecture has nowhere to put — most likely a Supabase cron.
