/**
 * Who is playing on this device.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THE CHILD ID IS CONTEXT, NOT A PARAMETER.
 *
 * `progress.ts` is still the single reader and its public API is unchanged —
 * `recordSolved(slug)` takes a slug and nothing else, exactly as it did for a
 * guest. Threading a child id through every caller would put the account model
 * into `ExerciseView`, `PlayView`, four page components and every spec, for a
 * value none of them has any business knowing. It is resolved HERE, once, and
 * read by the sync layer.
 *
 * ⚠️ A GUEST NEVER REACHES THIS FILE. Every entry point is gated on
 * `hasAuthFlag()`, and with `PUBLIC_AUTH_ENABLED` off nothing calls it at all.
 * Device-local progress is untouched by any of this.
 *
 * ⚠️ NO STATIC `@lib/supabase` IMPORT. Same rule as `progress-sync.ts`: one
 * would pull 207 KB of client into every page with a board.
 * ═════════════════════════════════════════════════════════════════════════
 */

import { hasAuthFlag } from '@lib/auth-flag';

/**
 * Version in the key, like every other store on the site. Holds the CHOICE this
 * device has made, not an identity — see the picker rule below.
 */
const CHILD_KEY = 'mcc:child:v1';

/** Fired when the active child changes, so a surface can re-render. */
export const CHILD_EVENT = 'mcc:child';

export interface Child {
  readonly id: string;
  readonly name: string;
}

interface ChildRecord {
  /** Keyed by account id: one device may be shared by two parents. */
  readonly chosen: Readonly<Record<string, Child>>;
}

const EMPTY: ChildRecord = { chosen: {} };

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(): ChildRecord {
  const store = storage();
  if (!store) return EMPTY;
  try {
    const raw = store.getItem(CHILD_KEY);
    if (!raw) return EMPTY;
    const value = JSON.parse(raw) as Record<string, unknown>;
    const chosen = value['chosen'];
    if (!chosen || typeof chosen !== 'object') return EMPTY;
    /* Normalised field by field, never cast: this came off disk and may have
       been written by an older build or by a person with devtools open. */
    const out: Record<string, Child> = {};
    for (const [account, entry] of Object.entries(chosen as Record<string, unknown>)) {
      const e = entry as Record<string, unknown>;
      if (typeof e?.['id'] === 'string' && e['id']) {
        out[account] = { id: e['id'], name: typeof e['name'] === 'string' ? e['name'] : '' };
      }
    }
    return { chosen: out };
  } catch {
    return EMPTY;
  }
}

function write(next: ChildRecord): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(CHILD_KEY, JSON.stringify(next));
  } catch {
    /* Full or unavailable. The picker simply asks again next time, which is a
       mild annoyance rather than a broken site. Never throw from a write. */
  }
}

/* ── The remembered choice ───────────────────────────────────────────────── */

/**
 * ⚠️ REMEMBERED PER DEVICE, WHICH IS THE WHOLE POINT. A child's own phone asks
 * once and never again; the family tablet asks every time it is picked up by
 * someone else, because that is the case the picker exists for.
 */
export function rememberedChild(accountId: string): Child | null {
  return read().chosen[accountId] ?? null;
}

export function chooseChild(accountId: string, child: Child): void {
  const current = read();
  write({ chosen: { ...current.chosen, [accountId]: child } });
  active = child;
  try {
    window.dispatchEvent(new CustomEvent(CHILD_EVENT, { detail: { child } }));
  } catch {
    /* No CustomEvent: `activeChild()` still answers. */
  }
}

/** Signing out forgets nothing — the next sign-in on this device resumes. */
export function forgetChild(accountId: string): void {
  const current = read();
  const chosen = { ...current.chosen };
  delete chosen[accountId];
  write({ chosen });
  active = null;
}

/* ── Resolution ──────────────────────────────────────────────────────────── */

let active: Child | null = null;
let resolving: Promise<Child | null> | null = null;

/** The synchronous answer, for a caller that must not await. */
export function activeChild(): Child | null {
  return active;
}

/**
 * ⚠️ ONE CODE PATH, NOT TWO — this is the client half of the migration's rule.
 *
 * An autonomous teenager is an account holding exactly ONE child profile, so
 * they resolve silently and never see a picker; a parent with three children
 * sees one. There is no "is this a family account" branch anywhere, because
 * there is no such thing: the count decides, and a family that shrinks to one
 * child stops being asked without any code knowing it happened.
 *
 * A brand-new account has none, so one is created from the profile name. That
 * keeps "every learner is a child_profiles row" true from the first second of
 * the first session — the alternative is progress with nowhere to go, which is
 * exactly the state this migration exists to make impossible.
 */
export async function resolveChild(): Promise<Child | null> {
  if (!hasAuthFlag()) return null;
  if (active) return active;
  if (resolving) return resolving;

  resolving = (async () => {
    try {
      const { getSupabase, getUser } = await import('@lib/supabase');
      const user = await getUser();
      if (!user) return null;

      const remembered = rememberedChild(user.id);
      const supabase = await getSupabase();
      const { data, error } = await supabase
        .from('child_profiles')
        .select('id,display_name')
        .eq('account_id', user.id)
        .order('created_at');
      if (error) return null;

      const children: Child[] = (data ?? []).map((row) => ({
        id: String(row['id']),
        name: String(row['display_name'] ?? ''),
      }));

      /* ⚠️ The remembered choice is re-validated against what the account
         actually holds. A child that was graduated away, or deleted, must not
         keep receiving this device's progress — it would write rows RLS then
         refuses, and the queue would never drain. */
      const still = remembered && children.find((c) => c.id === remembered.id);
      if (still) {
        active = still;
        return active;
      }

      if (children.length === 1) {
        chooseChild(user.id, children[0]!);
        return active;
      }
      if (children.length === 0) {
        const name = await defaultName(supabase, user.id);
        const { data: made, error: mkErr } = await supabase
          .from('child_profiles')
          .insert([{ account_id: user.id, display_name: name }])
          .select('id,display_name');
        if (mkErr || !made?.[0]) return null;
        chooseChild(user.id, { id: String(made[0]['id']), name: String(made[0]['display_name']) });
        return active;
      }

      /* Several, and none remembered: the picker has to ask. Nothing syncs
         until it does — writing to the wrong sibling is worse than waiting. */
      pending = children;
      try {
        window.dispatchEvent(new CustomEvent(CHILD_EVENT, { detail: { choices: children } }));
      } catch {
        /* The picker also reads `pendingChoices()` on mount. */
      }
      return null;
    } catch {
      return null;
    } finally {
      resolving = null;
    }
  })();
  return resolving;
}

let pending: readonly Child[] = [];

/** The children the picker must offer, when resolution could not decide. */
export function pendingChoices(): readonly Child[] {
  return pending;
}

async function defaultName(
  supabase: { from: (t: string) => any },
  userId: string,
): Promise<string> {
  try {
    const { data } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle();
    const name = String(data?.['display_name'] ?? '').trim();
    return name || 'Élève';
  } catch {
    return 'Élève';
  }
}
