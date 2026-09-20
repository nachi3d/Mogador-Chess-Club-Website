/**
 * The pseudo — what a student signs in with, and the address it becomes.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ PURE, AND IT MUST STAY PURE. No imports, no DOM, no Supabase. Both the
 * sign-in form and the sign-up form need these rules before there is a session
 * to call a function with, and `/connexion/` must not drag the Supabase client
 * into its chunk merely to decide that "ab" is too short.
 *
 * ⚠️ EVERY RULE HERE IS A MIRROR. The database is what refuses — the regex is a
 * CHECK constraint, the uniqueness is an index, the password floor is a `raise`
 * inside `register_with_pseudo()` (migration 0015). What is here exists so the
 * form can say "trop court" without a round trip, exactly like `admin.ts`
 * mirroring the award constraints. `pseudo-auth.spec.ts` asserts the two agree
 * by asking the database to build the same address this file builds; if they
 * ever drift, the spec says so rather than a fourteen-year-old discovering it.
 * ═════════════════════════════════════════════════════════════════════════
 */

/**
 * ⚠️ RESERVED BY RFC 6761 §6.4 — `.invalid` IS GUARANTEED NEVER TO RESOLVE.
 *
 * Supabase Auth keys every email/password user by an address, so a pseudo has
 * to become one. This domain has the three properties that matter: mail can
 * never be delivered to it (no MX, ever, anywhere), nobody can own a mailbox
 * under it so a pseudo can never collide with a real person's address, and it
 * is obviously synthetic to anyone who sees it in a dashboard.
 *
 * ⚠️ THE READER MUST NEVER SEE IT. It is plumbing: `/compte/` shows the pseudo,
 * the admin list shows the pseudo, and `admin_list_accounts()` NULLs the
 * address in SQL so no surface can leak what it never received.
 *
 * ⚠️ IT IS DUPLICATED IN `public.pseudo_email_domain()` and that duplication is
 * deliberate — the browser cannot call a function before it has a session. See
 * the header note about the spec that pins them equal.
 */
export const PSEUDO_EMAIL_DOMAIN = 'pseudo.mogadorchess.invalid';

/**
 * The password floor, and the whole of it.
 *
 * ⚠️ NO COMPLEXITY RULES, DELIBERATELY. These are minors on shared phones. A
 * rule that guarantees a forgotten password guarantees a WhatsApp message to
 * Seàn and a hand reset; a short password the student actually remembers beats
 * a strong one that is reset every week. Six is GoTrue's own default, so
 * anything that ever goes through Supabase's endpoints agrees with us.
 */
export const PASSWORD_MIN = 6;

/** Lowercase, trimmed. The only spelling that exists anywhere. */
export function normalizePseudo(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * ⚠️ NARROW ON PURPOSE: this string becomes the local part of an email address.
 * ASCII, 3–20, opening on a letter or a digit. An address that would need
 * quoting is an address that gets typed wrong at a table in Dar Souiri.
 *
 * Mirrors `profiles_pseudo_check` in migration 0015, character for character.
 */
const PSEUDO_RE = /^[a-z0-9][a-z0-9._-]{2,19}$/;

export function isValidPseudo(raw: string): boolean {
  return PSEUDO_RE.test(normalizePseudo(raw));
}

/** The synthetic address for a pseudo. Never rendered, never shown, never sent to. */
export function pseudoEmail(raw: string): string {
  return `${normalizePseudo(raw)}@${PSEUDO_EMAIL_DOMAIN}`;
}

/**
 * ⚠️ THERE IS DELIBERATELY NO `isSyntheticEmail()` HERE, AND IT SHOULD NOT BE
 * ADDED BACK.
 *
 * It existed for one draft and nothing ever called it: `/compte/` and
 * `/bienvenue/` both branch on `profile.pseudo`, which is the DATABASE's own
 * answer to "does this account sign in with a password". Sniffing the address
 * instead would be a second, weaker answer to a question already answered —
 * and one that silently says "no" on a build whose `getProfile()` degraded.
 * The address is plumbing; `pseudo` is the fact.
 */
