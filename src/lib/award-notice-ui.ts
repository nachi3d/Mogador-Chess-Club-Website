/**
 * The award notice — painting only (0017).
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ SPLIT FROM `award-notice.ts` ON PURPOSE, like `shop-ui.ts` from `shop.ts`:
 * that module is the data layer and touches no DOM; this one touches the DOM
 * and invents no rule. What is unread is `award_notices()`; what "read" means
 * is `mark_awards_seen()`.
 *
 * ⚠️ IT DOES NOTHING AT ALL FOR A SIGNED-OUT READER. `hasStoredSession()` reads
 * `localStorage` and imports nothing, so the Supabase client is never built
 * unless a token exists (the guest zero-request rule). The container is
 * server-rendered `hidden` and stays that way.
 *
 * ⚠️ IT NAMES THE REASON AND THE PROF, NOT JUST THE NUMBER. A teacher award is
 * a judgement, and the point of showing it is that the judgement is visible.
 * Every row carries all three; a row with only "+5" is the silent balance
 * change this exists to replace.
 *
 * ⚠️ EVERY STRING IS TEXT, NEVER HTML. The reason is typed by a prof and the
 * name by an account holder; both reach the page through `textContent` only.
 *
 * ⚠️ ELEMENTS BUILT HERE ARE STYLED FROM `award-notice.css`, a real stylesheet
 * — a scoped `<style>` does not reach an element a script created (CLAUDE.md).
 * ═════════════════════════════════════════════════════════════════════════
 */
import { hasStoredSession } from '@lib/booking';
import {
  groupNotices,
  loadNotices,
  markSeen,
  newestOf,
  type AwardNotice,
  type NoticeGroup,
} from '@lib/award-notice';

interface Data {
  readonly strings: Record<string, string>;
  /** A BCP 47 tag for the date — `fr-FR` or `en-GB`. */
  readonly dateLocale: string;
  /** The club's IANA zone, from `site.timezone`. */
  readonly timezone: string;
}

let data: Data = { strings: {}, dateLocale: 'fr-FR', timezone: 'UTC' };

function s(key: string, vars: Record<string, string | number> = {}): string {
  let out = data.strings[key] ?? '';
  for (const [k, v] of Object.entries(vars)) out = out.replace(`{${k}}`, String(v));
  return out;
}

function setText(el: Element | null, value: string): void {
  if (el && el.textContent !== value) el.textContent = value;
}

function setHidden(el: Element | null, hidden: boolean): void {
  if (el instanceof HTMLElement && el.hidden !== hidden) el.hidden = hidden;
}

function span(className: string, text: string): HTMLSpanElement {
  const el = document.createElement('span');
  el.className = className;
  el.textContent = text;
  return el;
}

function when(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  try {
    return new Intl.DateTimeFormat(data.dateLocale, {
      day: 'numeric',
      month: 'long',
      timeZone: data.timezone,
    }).format(new Date(t));
  } catch {
    return '';
  }
}

function item(award: AwardNotice): HTMLLIElement {
  const row = document.createElement('li');
  row.className = 'award-notice-item';
  row.setAttribute('data-testid', 'award-notice-item');

  const amount = award.jetons === 1 ? s('award.amount.one') : s('award.amount', { n: award.jetons });
  /* ⚠️ "le club" when nobody is named — a prof who left (`on delete set null`)
     or who never set a name. Never an empty "Donné par ". */
  const giver = award.givenBy ? s('award.by', { name: award.givenBy }) : s('award.by.club');
  const date = when(award.awardedAt);

  row.append(
    span('award-notice-amount', amount),
    span('award-notice-reason', s('award.reason', { reason: award.reason })),
    span('award-notice-meta', date ? `${giver} · ${date}` : giver),
  );
  return row;
}

function group(root: HTMLElement, g: NoticeGroup): HTMLElement {
  const box = document.createElement('div');
  box.className = 'award-notice-group';
  box.dataset['child'] = g.childId;
  box.setAttribute('data-testid', 'award-notice-group');

  /* ⚠️ THE CHILD IS ALWAYS NAMED. On a family account the reader must know
     whose jetons these are; on a solo account it is their own name, which the
     shop's balance line already does. Structure, not relationship (CF54). */
  const heading = document.createElement('h3');
  heading.className = 'award-notice-child';
  heading.textContent = s('award.for', { name: g.childName });

  const list = document.createElement('ul');
  list.className = 'award-notice-list';
  list.append(...g.awards.map(item));

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn-ghost award-notice-read';
  button.textContent = s('award.read');
  button.setAttribute('aria-label', s('award.read.aria', { name: g.childName }));
  button.setAttribute('data-testid', 'award-notice-read');
  button.addEventListener('click', async () => {
    if (button.disabled) return;
    const newest = newestOf(g);
    if (!newest) return;
    button.disabled = true;
    setText(button, s('award.saving'));
    const code = await markSeen(g.childId, newest.id);
    if (code !== 'ok') {
      /* ⚠️ A WRITE FAILS LOUDLY. The notice stays, the button comes back, and
         the reader is told — never a notice that vanishes and returns on the
         next visit as though the tap had been ignored. */
      button.disabled = false;
      setText(button, s('award.read'));
      setText(root.querySelector('[data-award-message]'), s('award.failed'));
      return;
    }
    box.remove();
    afterRead(root);
  });

  box.append(heading, list, button);
  return box;
}

/** A group was acknowledged: say so, and move focus somewhere that exists. */
function afterRead(root: HTMLElement): void {
  const left = root.querySelectorAll('[data-testid="award-notice-group"]').length;
  const message = root.querySelector('[data-award-message]');
  if (left > 0) {
    setText(message, '');
    /* The pressed button is gone; the next group's button is the natural
       next stop rather than the top of the document. */
    root.querySelector<HTMLButtonElement>('.award-notice-read')?.focus();
    return;
  }
  setHidden(root.querySelector('[data-award-badge]'), true);
  setHidden(root.querySelector('[data-award-groups]'), true);
  setText(message, s('award.done'));
  root.querySelector<HTMLElement>('[data-award-title]')?.focus();
}

export async function renderAwardNotice(): Promise<void> {
  const root = document.querySelector<HTMLElement>('[data-award-notice]');
  if (!root) return;

  const bag = document.querySelector('[data-award-notice-data]');
  try {
    if (bag?.textContent) data = JSON.parse(bag.textContent) as Data;
  } catch {
    /* Strings missing: render nothing rather than a notice with blank words. */
    return;
  }

  /* ⚠️ THE GUEST GATE. No token, no import, no request. */
  if (!hasStoredSession()) return;

  const notices = await loadNotices();
  /* ⚠️ NULL (could not ask) AND EMPTY (nothing new) BOTH RENDER NOTHING — a
     notice is news, and a failed read is not news. Reads degrade. */
  if (!notices || notices.length === 0) return;

  const groups = groupNotices(notices);
  const container = root.querySelector('[data-award-groups]');
  if (!container) return;
  container.replaceChildren(...groups.map((g) => group(root, g)));
  setHidden(root, false);
  root.dataset['ready'] = 'true';
}
