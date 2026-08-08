/**
 * Theme preference — device-local, by design.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * Same shape and same rules as `src/lib/progress.ts`, deliberately:
 *
 *   - namespaced, VERSIONED key (`mcc:theme:v1`);
 *   - every access guarded, failing silent — Safari private mode throws on
 *     `setItem`, a full quota throws, and a hand-edited value can be anything;
 *   - normalised field by field on read, never cast. A malformed record must
 *     fall back to the defaults, not render a broken board;
 *   - THE SINGLE MIGRATION POINT. Nothing else may touch `localStorage` or
 *     know the key. If accounts ever arrive, this file is the whole change.
 *
 * A visitor whose storage is unavailable gets the default theme and a fully
 * working site. There is nothing they could do about it, so we do not tell them.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { BOARD_THEMES, type BoardThemeId } from '@config/board-themes';
import { PIECE_SETS } from '@config/piece-sets';
import {
  DEFAULT_SITE_THEME,
  SITE_THEMES,
  isSiteThemeId,
  resolveBoard,
  resolvePieces,
  type SiteThemeId,
} from '@config/site-themes';

const STORAGE_KEY = 'mcc:theme:v1';

/** `system` follows the OS; the other two override it. */
export type ThemeMode = 'light' | 'dark' | 'system';
/** What `system` resolves to, and the only two values `data-theme` ever holds. */
export type ResolvedMode = 'light' | 'dark';

/** A custom board: the two square colours. Inks are DERIVED, never stored. */
export interface CustomBoard {
  readonly light: string;
  readonly dark: string;
}

export interface ThemeState {
  readonly mode: ThemeMode;
  /**
   * The site theme — level 1 of the hierarchy. Sets surfaces, heading face,
   * default board preset and piece set. See `src/config/site-themes.ts`.
   */
  readonly theme: SiteThemeId;
  /**
   * The reader's PINNED board preset — level 2 — or absent to follow the
   * theme's own default.
   *
   * ⚠️ ABSENT IS A REAL STATE, NOT A MISSING VALUE, AND THAT IS THE WHOLE
   * DESIGN. "Follow the theme" and "I want Bleu whatever the theme" are
   * genuinely different intentions, and a non-optional field with a default
   * cannot tell them apart — it would have to carry a second `pinned` boolean
   * that could disagree with it. Absence carries the meaning instead, so the
   * two can never contradict each other.
   *
   * It is also what makes the v1 migration lossless: every record written
   * before E6 has a `boardTheme`, so every returning reader is pinned to
   * exactly the board they last saw. See `normaliseTheme`.
   */
  readonly boardTheme?: BoardThemeId | undefined;
  /** Present only while the reader is using custom squares. */
  readonly custom?: CustomBoard | undefined;
}

export const DEFAULT_THEME: ThemeState = {
  mode: 'system',
  theme: DEFAULT_SITE_THEME,
};

/* ── Colour maths ─────────────────────────────────────────────────────────
   Also implemented, independently, in `scripts/check-contrast.mjs`. That is
   not an oversight: the build-time auditor proving the palette should not
   share an implementation with the runtime code it audits, or a bug in the
   formula would agree with itself and pass. */

const HEX = /^#[0-9a-f]{6}$/i;

/** `#abc` → `#aabbcc`; anything unusable → null. */
export function normaliseHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim().toLowerCase();
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(text);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  return HEX.test(text) ? text : null;
}

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
}

/** WCAG contrast ratio, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

/** The two coordinate inks. Board coordinates are real text on a real colour. */
export const INK_DARK = '#14120e'; // ink-950
export const INK_LIGHT = '#fffdf7'; // cream-50

/** AA for body-size text. Coordinates are small, so this is the bar that applies. */
export const AA_TEXT = 4.5;

/**
 * THE TWO-INK RULE, as a function.
 *
 * Chessground alternates coordinate colour by square, so each square colour
 * takes whichever ink clears the higher ratio against IT. One ink for both
 * always fails on one of them — which is exactly why two ink tokens exist.
 * Presets state their inks explicitly in CSS (and `check-contrast.mjs` proves
 * them); this is what derives them for a reader's own colours.
 */
export function bestInkFor(square: string): { readonly ink: string; readonly ratio: number } {
  const dark = contrastRatio(INK_DARK, square);
  const light = contrastRatio(INK_LIGHT, square);
  return dark >= light ? { ink: INK_DARK, ratio: dark } : { ink: INK_LIGHT, ratio: light };
}

/* ── Storage ──────────────────────────────────────────────────────────────── */

function storage(): Storage | null {
  try {
    // SSR has no `window`; some embedded contexts THROW on property access
    // rather than returning undefined, which is why this is inside the try.
    if (typeof globalThis.localStorage === 'undefined') return null;
    return globalThis.localStorage;
  } catch {
    return null;
  }
}

const isMode = (value: unknown): value is ThemeMode =>
  value === 'light' || value === 'dark' || value === 'system';

const isBoardTheme = (value: unknown): value is BoardThemeId =>
  typeof value === 'string' && BOARD_THEMES.some((theme) => theme.id === value);

/**
 * Coerce a stored record into a valid state, field by field.
 *
 * Never a cast. The value came off disk and may have been written by an older
 * build, another tab, or someone with devtools open. A bad field falls back to
 * its default rather than poisoning the whole theme — a malformed custom colour
 * must land the reader on Classique, not on an unstyled board.
 */
export function normaliseTheme(value: unknown): ThemeState {
  if (typeof value !== 'object' || value === null) return DEFAULT_THEME;
  const raw = value as Record<string, unknown>;

  const mode = isMode(raw['mode']) ? raw['mode'] : DEFAULT_THEME.mode;
  const theme = isSiteThemeId(raw['theme']) ? raw['theme'] : DEFAULT_THEME.theme;

  /*
   * ── THE v1 → E6 MIGRATION, AND WHY IT IS A NO-OP BY CONSTRUCTION ───────
   *
   * The key is unchanged (`mcc:theme:v1`) because the SHAPE is unchanged: a
   * field was added and a field became optional. Nothing stored under v1 is
   * reinterpreted, so there is nothing that could be half-migrated — which is
   * the whole reason the version sits in the key in the first place.
   *
   * A pre-E6 record has `{mode, boardTheme}` and no `theme`:
   *   • `theme` falls back to Bois, which IS the palette that record was
   *     written under. The reader sees the site they left.
   *   • `boardTheme` survives verbatim and is therefore PINNED, so their board
   *     is the board they last chose, on whatever theme they later pick.
   *
   * ⚠️ That pins readers who never actively chose a preset — everyone who
   * touched this page at all had `classique` persisted as a side effect of the
   * old non-optional default. Accepted deliberately: the alternative is
   * changing what a returning reader sees without being asked, and "no loss"
   * has to beat "probably what they'd have wanted". Un-pinning is one click,
   * and the settings page names the option.
   */
  const boardTheme = isBoardTheme(raw['boardTheme']) ? raw['boardTheme'] : undefined;

  const customRaw = raw['custom'];
  let custom: CustomBoard | undefined;
  if (typeof customRaw === 'object' && customRaw !== null) {
    const record = customRaw as Record<string, unknown>;
    const light = normaliseHex(record['light']);
    const dark = normaliseHex(record['dark']);
    // BOTH or neither. One valid colour and one broken one is not a board.
    if (light && dark) custom = { light, dark };
  }

  const base: ThemeState = boardTheme ? { mode, theme, boardTheme } : { mode, theme };
  return custom ? { ...base, custom } : base;
}

/** The stored theme, defaulted. Never throws, never returns undefined. */
export function readTheme(): ThemeState {
  const store = storage();
  if (!store) return DEFAULT_THEME;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_THEME;
    return normaliseTheme(JSON.parse(raw));
  } catch {
    // Unparseable JSON or a thrown getItem. We do NOT delete the bad value:
    // a future version may salvage it, and destroying a reader's data to tidy
    // up is the wrong trade.
    return DEFAULT_THEME;
  }
}

/**
 * Merge a change into the stored theme and return the result.
 *
 * Returns the NEW value even when the write failed, so the UI stays consistent
 * within the session on a device that cannot persist anything.
 */
export function writeTheme(patch: Partial<ThemeState>): ThemeState {
  const next = normaliseTheme({ ...readTheme(), ...patch });
  const store = storage();
  if (store) {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* private mode, quota, storage disabled — the theme still applies for
         this session; only remembering it is lost. Nothing to tell the reader. */
    }
  }
  return next;
}

/**
 * Drop the custom board and go back to whichever preset applies.
 *
 * ⚠️ It does NOT go back to a *named* preset — it drops the custom colours and
 * leaves the pin exactly as it was. A reader who was following their theme
 * still follows it; a reader who had pinned Bleu gets Bleu back. Writing a
 * concrete preset here would silently pin everyone who ever tried a custom
 * pair, which is the kind of state change nobody can see happening.
 */
export function clearCustomBoard(): ThemeState {
  const current = readTheme();
  const next: ThemeState = current.boardTheme
    ? { mode: current.mode, theme: current.theme, boardTheme: current.boardTheme }
    : { mode: current.mode, theme: current.theme };
  const store = storage();
  if (store) {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* see writeTheme */
    }
  }
  return next;
}

/**
 * Un-pin the board so it follows the active theme again.
 *
 * The escape hatch for the "a pinned preset survives a theme change" rule —
 * see `resolveBoard` in `src/config/site-themes.ts`. Custom colours are
 * dropped with it: they are a pin too, just a hand-mixed one.
 */
export function followThemeBoard(): ThemeState {
  const current = readTheme();
  const next: ThemeState = { mode: current.mode, theme: current.theme };
  const store = storage();
  if (store) {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* see writeTheme */
    }
  }
  return next;
}

/* ── Applying ─────────────────────────────────────────────────────────────── */

/** What `system` currently means. Safe to call before the DOM exists. */
export function resolveMode(mode: ThemeMode): ResolvedMode {
  if (mode !== 'system') return mode;
  try {
    return globalThis.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/** Every class the theme owns, so applying one can remove the rest. */
const BOARD_CLASSES = BOARD_THEMES.map((theme) => `board-${theme.id}`);
const THEME_CLASSES = SITE_THEMES.map((theme) => `theme-${theme.id}`);
const PIECE_CLASSES = PIECE_SETS.map((set) => `pieces-${set.id}`);

/** The board preset in force: the pin if there is one, else the theme's own. */
export function activeBoard(state: ThemeState): BoardThemeId {
  return resolveBoard(state.theme, state.boardTheme);
}

/**
 * Put a theme on the document.
 *
 * ⚠️ This is the SAME sequence the inline head script performs, and the two
 * must not drift. The head script exists because this module cannot run before
 * first paint without blocking on a module fetch; it is a deliberate, minimal
 * duplicate and it says so. If you change what an applied theme looks like,
 * change it in both — `tests/e2e/theme.spec.ts` asserts the no-flash path.
 */
export function applyTheme(state: ThemeState, root: HTMLElement): void {
  const resolved = resolveMode(state.mode);
  root.dataset['theme'] = resolved;
  // Tells the browser which way its own widgets go — form controls, scrollbars,
  // and the colour picker on the settings page itself.
  root.style.colorScheme = resolved;

  root.classList.remove(...THEME_CLASSES);
  root.classList.add(`theme-${state.theme}`);

  root.classList.remove(...BOARD_CLASSES);
  root.classList.add(`board-${activeBoard(state)}`);

  /* The piece set follows the theme and is never chosen separately — four
     coherent moods, not four themes times four sets. The class is what
     `public/pieces/<id>.css` is scoped by; the stylesheet itself is fetched by
     the head script, and only on pages that carry a board. */
  root.classList.remove(...PIECE_CLASSES);
  root.classList.add(`pieces-${resolvePieces(state.theme)}`);

  if (state.custom) {
    // Inline properties beat the class, which is what makes "custom overrides
    // the preset" true without a separate class or a specificity fight.
    root.style.setProperty('--mcc-board-light', state.custom.light);
    root.style.setProperty('--mcc-board-dark', state.custom.dark);
    root.style.setProperty('--mcc-board-light-ink', bestInkFor(state.custom.light).ink);
    root.style.setProperty('--mcc-board-dark-ink', bestInkFor(state.custom.dark).ink);
  } else {
    for (const property of [
      '--mcc-board-light',
      '--mcc-board-dark',
      '--mcc-board-light-ink',
      '--mcc-board-dark-ink',
    ]) {
      root.style.removeProperty(property);
    }
  }
}

/**
 * True when the reader's own colours fall below AA for coordinates.
 *
 * They are still allowed to use them — it is their board. The UI shows a
 * warning that persists while the colours are active, rather than refusing.
 */
export function customBoardWarning(custom: CustomBoard): boolean {
  return bestInkFor(custom.light).ratio < AA_TEXT || bestInkFor(custom.dark).ratio < AA_TEXT;
}
