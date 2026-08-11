/**
 * Sound policy — the single place that decides what the site sounds like.
 *
 * Direction: `docs/direction/mcc-direction-esthetique.md` § C3. Synthesised via
 * the Web Audio API, **no audio files**, off by default.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THIS MODULE OWNS EVERY SOUND, THE WAY `motion.ts` OWNS EVERY DURATION.
 *
 * No other file may construct an `AudioContext`, an oscillator or a gain node.
 * The reason is the same one motion.ts gives for durations: these numbers only
 * mean anything **relative to each other**. A capture must read heavier than a
 * placement, a wrong move must read softer than either, and an achievement must
 * read as "the solve, but more". Scattered oscillators drift out of that
 * relationship one commit at a time, and nobody notices until the site sounds
 * like six different sites.
 *
 * ⚠️ NO AUDIO FILES, AND THAT IS THREE DECISIONS AT ONCE.
 *   - 0 bytes added to the PWA precache and 0 network requests, which is why a
 *     phone on Essaouira mobile data pays nothing for a feature it may never
 *     switch on;
 *   - no licence question in a GPL repository — a synthesised waveform has no
 *     author to credit;
 *   - every parameter is tunable from this file, so "the capture is too harsh"
 *     is a one-line change rather than a re-recording.
 * ═════════════════════════════════════════════════════════════════════════
 *
 * ── The palette ──────────────────────────────────────────────────────────
 *
 * Six voices, and deliberately no more. Every one answers something the reader
 * DID; nothing answers navigation, hover, scroll or page load. A site that
 * chirps as you scroll is a site you mute, and then the sounds that carry
 * meaning are muted too.
 *
 *   place        a short dry click — a piece meeting the board
 *   capture      lower and heavier, with the edge taken off by a filter
 *   check        a brief tense interval (a tritone), because it is a warning
 *   solved       a rising fifth: satisfying, and deliberately not a fanfare
 *   wrong        a low soft sine — CORRECTIVE, never punishing
 *   achievement  the solve's shape with a third note, since it is rarer
 *
 * ⚠️ THE WRONG-MOVE SOUND IS THE ONE TO GET RIGHT, and it is the one a synth
 * makes it easy to get wrong. This is a teaching tool for children: an error
 * must inform, not scold. So it is a pure sine (no harmonics to bite), low, at
 * the lowest gain in the palette, with the slowest attack — the only voice here
 * that fades in rather than striking. A buzzer would teach a beginner that
 * trying is expensive, which is the same thing the `onlyMove` rule exists to
 * prevent in words.
 */

/* ── Preference storage ──────────────────────────────────────────────────
 *
 * ⚠️ ITS OWN KEY, NOT A FIELD ON `mcc:theme:v1`. Considered and rejected,
 * because the theme record is parsed by the **blocking inline head script**
 * before first paint (see BaseLayout). Sound cannot possibly matter before
 * first paint — it cannot exist before a gesture — so putting it there would
 * grow the parse surface of the one script that runs before anything is on
 * screen, to carry a value that script will never read. Two keys also version
 * independently: a future change to the sound shape must not force a theme
 * migration on readers who never turned sound on.
 *
 * Everything else follows `theme.ts` and `progress.ts` exactly: namespaced and
 * VERSIONED key, every access guarded and failing silent, normalised field by
 * field on read rather than cast. THE SINGLE MIGRATION POINT for this key —
 * nothing else may touch `localStorage` or know the string.
 */

const STORAGE_KEY = 'mcc:sound:v1';

/** Three steps, not a slider — a slider is a decision nobody wants to make. */
export type SoundVolume = 'doux' | 'moyen' | 'fort';

export interface SoundState {
  /** ⚠️ FALSE BY DEFAULT, and every path back to the default returns false. */
  readonly enabled: boolean;
  readonly volume: SoundVolume;
  /**
   * Whether the one-time invitation has been answered — either way.
   *
   * ⚠️ "Answered", not "accepted". Declining sets this too, which is what makes
   * the offer one-time. An invitation that returns after a "no thanks" is not
   * an invitation, it is nagging.
   */
  readonly invited: boolean;
}

const DEFAULT_SOUND: SoundState = { enabled: false, volume: 'moyen', invited: false };

const VOLUMES: readonly SoundVolume[] = ['doux', 'moyen', 'fort'];

/** Master gain per step. `fort` stays under 1 — headroom against clipping. */
const VOLUME_GAIN: Record<SoundVolume, number> = { doux: 0.45, moyen: 0.8, fort: 1 };

export const isSoundVolume = (value: unknown): value is SoundVolume =>
  typeof value === 'string' && (VOLUMES as readonly string[]).includes(value);

/** Guarded: an embedded context can throw on `localStorage` itself. */
function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Field by field, never cast. The value came off disk and may have been written
 * by an older build or by someone with devtools open.
 *
 * ⚠️ ANY DOUBT RESOLVES TO OFF. A corrupt record must not make a silent site
 * start making noise — that is the one failure mode this whole feature has to
 * avoid, so it is the one the parser is biased towards.
 */
export function normaliseSound(value: unknown): SoundState {
  if (typeof value !== 'object' || value === null) return DEFAULT_SOUND;
  const raw = value as Record<string, unknown>;
  return {
    enabled: raw['enabled'] === true,
    volume: isSoundVolume(raw['volume']) ? raw['volume'] : DEFAULT_SOUND.volume,
    invited: raw['invited'] === true,
  };
}

export function readSound(): SoundState {
  const store = storage();
  if (!store) return DEFAULT_SOUND;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SOUND;
    return normaliseSound(JSON.parse(raw));
  } catch {
    /* Unparseable. Leave it on disk — a future version may salvage it — and
       carry on silently, which for this feature means silently. */
    return DEFAULT_SOUND;
  }
}

/** Returns the NEW value even when the write failed, so the UI stays honest. */
export function writeSound(patch: Partial<SoundState>): SoundState {
  const next = normaliseSound({ ...readSound(), ...patch });
  const store = storage();
  if (store) {
    try {
      store.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* Private mode, quota, storage disabled. The preference still applies for
         this session; only remembering it is lost. Nothing to tell the reader. */
    }
  }
  cached = next;
  return next;
}

/**
 * The live preference. Cached because `play()` runs on every move and reading
 * `localStorage` per move is a synchronous disk hit on the interaction path.
 * `writeSound` refreshes it; `refreshSound` exists for the settings page, which
 * is the only place that can change it from outside this module.
 */
let cached: SoundState | null = null;
const current = (): SoundState => (cached ??= readSound());
export const refreshSound = (): SoundState => (cached = readSound());

/* ── The voices ──────────────────────────────────────────────────────────── */

interface Tone {
  /** Hz at the start of the tone. */
  readonly from: number;
  /** Hz at the end — equal to `from` for a steady note. */
  readonly to: number;
  readonly type: OscillatorType;
  /** Milliseconds. */
  readonly ms: number;
  /** Peak gain before the master/volume multiplier. */
  readonly gain: number;
  /** Attack in ms. A longer attack is what makes a note feel soft. */
  readonly attack: number;
  /** Lowpass corner in Hz, when the raw waveform is too bright. */
  readonly lowpass?: number;
  /** Milliseconds after the voice starts. Sequences only. */
  readonly at?: number;
}

export type SoundEvent = 'place' | 'capture' | 'check' | 'solved' | 'wrong' | 'achievement';

/**
 * ⚠️ EVERY TONE IS 20–80ms, per the direction doc. The two SEQUENCES (`solved`,
 * `achievement`) are longer in total because they are several short tones in a
 * row — the same distinction motion.ts draws between a family duration and a
 * composite built out of one. A single 240ms drone would be a fourth kind of
 * sound; three 70ms notes are three notes.
 *
 * `wrong` is the deliberate exception at 150ms, and the reason is the point of
 * the voice: softness is an ENVELOPE, and an envelope needs time. A 60ms sine
 * is a blip, and a blip reads as a buzzer however quiet it is.
 */
const VOICES: Record<SoundEvent, readonly Tone[]> = {
  /* A piece meeting wood: a fast fall, almost no sustain. */
  place: [{ from: 240, to: 170, type: 'triangle', ms: 45, gain: 0.16, attack: 2, lowpass: 2200 }],

  /* Heavier and lower, and a sawtooth for the grain a capture wants — with a
     low corner frequency so it lands as a thud rather than a rasp. */
  capture: [{ from: 150, to: 90, type: 'sawtooth', ms: 75, gain: 0.2, attack: 2, lowpass: 900 }],

  /* A tritone, the most unstable interval available. Brief, and not loud: this
     is a warning, not an alarm. */
  check: [
    { from: 440, to: 440, type: 'triangle', ms: 70, gain: 0.1, attack: 3, lowpass: 3000 },
    { from: 622, to: 622, type: 'triangle', ms: 70, gain: 0.1, attack: 3, lowpass: 3000 },
  ],

  /* A rising fifth, D5 → A5. Open and resolved without being a fanfare — a
     major third stacked into a chord would be triumphal, and this happens
     often enough that triumphal would wear out within one sitting. */
  solved: [
    { from: 587, to: 587, type: 'sine', ms: 70, gain: 0.15, attack: 4 },
    { from: 880, to: 880, type: 'sine', ms: 80, gain: 0.15, attack: 4, at: 70 },
  ],

  /* See the note above: pure sine, lowest gain, slowest attack, no bite. */
  wrong: [{ from: 175, to: 150, type: 'sine', ms: 150, gain: 0.11, attack: 18 }],

  /* The solve's own shape with a third note on top, so it is recognisable as
     "that, but more" rather than as a different event. The faint second
     oscillator an octave up on the last note is the whole of the extra
     richness — rarer deserves fuller, not louder. */
  achievement: [
    { from: 587, to: 587, type: 'sine', ms: 70, gain: 0.14, attack: 4 },
    { from: 880, to: 880, type: 'sine', ms: 70, gain: 0.14, attack: 4, at: 70 },
    { from: 1175, to: 1175, type: 'sine', ms: 90, gain: 0.13, attack: 4, at: 140 },
    { from: 2349, to: 2349, type: 'sine', ms: 90, gain: 0.04, attack: 6, at: 140 },
  ],
};

/* ── The context ─────────────────────────────────────────────────────────── */

let context: AudioContext | null = null;
/** Set by the first real user gesture. See `armOnFirstGesture`. */
let gestured = false;

/**
 * ⚠️ THE CONTEXT IS CREATED ON THE FIRST GESTURE AND NEVER BEFORE.
 *
 * Two reasons, and they agree. Browsers refuse to start an `AudioContext`
 * without user activation and leave it `suspended`, so building one earlier
 * buys a broken object. And it is the project's standing "nothing before a
 * click" rule — the same rule that keeps Stockfish's 3.6 MB behind a button.
 *
 * `hasBeenActive` is the honest test where it exists; the listeners are the
 * fallback for browsers without it. Both are passive and one-shot.
 */
export function armOnFirstGesture(): void {
  if (typeof window === 'undefined' || gestured) return;
  const arm = () => {
    gestured = true;
    window.removeEventListener('pointerdown', arm);
    window.removeEventListener('keydown', arm);
  };
  window.addEventListener('pointerdown', arm, { once: true, passive: true });
  window.addEventListener('keydown', arm, { once: true, passive: true });
}

function hasGesture(): boolean {
  if (gestured) return true;
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } })
    .userActivation;
  if (activation?.hasBeenActive) {
    gestured = true;
    return true;
  }
  return false;
}

/**
 * One context for the life of the page, created lazily.
 *
 * ⚠️ ONE, not one per sound. An `AudioContext` is an expensive object backed by
 * a real audio device; creating one per move exhausts the browser's limit
 * within a single exercise and then every later sound fails silently. There is
 * a spec for exactly this.
 */
function audio(): AudioContext | null {
  if (context) return context;
  if (!hasGesture()) return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    context = new Ctor();
  } catch {
    /* Refused, or no audio device. Sound is decoration on top of a visual
       signal that already fired; there is nothing to report. */
    return null;
  }
  return context;
}

/**
 * ⚠️ SOUND IS NEVER THE ONLY SIGNAL, so every early return here is safe.
 *
 * Each of the six events already has a visible counterpart that fires
 * independently — the piece moves, the piece disappears, Chessground paints the
 * check highlight, the verdict text changes, the board shakes, the toast
 * appears. Nothing below can cause a reader to miss anything, which is what
 * makes it acceptable for this function to give up quietly on a phone with no
 * audio device, a hidden tab, or a browser that refuses the context. It is also
 * why a reader on silent loses nothing.
 */
export function play(event: SoundEvent): void {
  if (typeof window === 'undefined') return;
  if (!current().enabled) return;
  /* ⚠️ Suppressed when the tab is hidden: a sound from a tab the reader is not
     looking at is unattributable noise. */
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

  const ctx = audio();
  if (!ctx) return;
  /* Autoplay policy can leave a context suspended even after a gesture. */
  if (ctx.state === 'suspended') void ctx.resume().catch(() => {});

  const master = VOLUME_GAIN[current().volume];
  const now = ctx.currentTime;

  for (const tone of VOICES[event]) {
    try {
      const start = now + (tone.at ?? 0) / 1000;
      const end = start + tone.ms / 1000;
      const osc = ctx.createOscillator();
      osc.type = tone.type;
      osc.frequency.setValueAtTime(tone.from, start);
      if (tone.to !== tone.from) osc.frequency.exponentialRampToValueAtTime(tone.to, end);

      const gain = ctx.createGain();
      const peak = Math.max(0.0001, tone.gain * master);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(peak, start + tone.attack / 1000);
      /* Exponential, because loudness is perceived logarithmically — a linear
         fade sounds like it stops rather than decays. It cannot reach zero, so
         it lands just above and the node is stopped. */
      gain.gain.exponentialRampToValueAtTime(0.0001, end);

      let node: AudioNode = osc;
      if (tone.lowpass) {
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(tone.lowpass, start);
        osc.connect(filter);
        node = filter;
      }
      node.connect(gain);
      gain.connect(ctx.destination);

      osc.start(start);
      osc.stop(end + 0.02);
      /* Let the graph go as soon as it has finished; nothing is reused. */
      osc.onended = () => {
        try {
          gain.disconnect();
        } catch {
          /* already gone */
        }
      };
    } catch {
      /* One tone failing must not take the rest of the chord with it. */
    }
  }
}

/**
 * Which voice a board move should use. Exported so the two islands cannot
 * disagree about it — the priority order is a policy, not a detail.
 *
 * ⚠️ ONE SOUND PER MOVE. A capture that gives check is a check: it is the more
 * urgent fact, and stacking both reads as a mistake rather than as emphasis.
 */
export function voiceForMove(move: { san?: string; isCheck?: boolean }): SoundEvent {
  if (move.isCheck) return 'check';
  if (move.san?.includes('x')) return 'capture';
  return 'place';
}

/** Whether the reader has asked for less motion. Read fresh — it can change. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Whether to offer the one-time invitation.
 *
 * ⚠️ `prefers-reduced-motion` DOES NOT SILENCE THE SITE — the two are different
 * senses and coupling them is a category error: the preference exists for
 * vestibular discomfort, not for hearing. A reader who has asked for less
 * motion may still want sound, and switching it off for them would be deciding
 * something they did not ask about.
 *
 * ⚠️ But it does suppress the OFFER, and that is a different judgement. A
 * reader who has told their operating system they want things calmer has said
 * something about being interrupted, and an unprompted invitation is an
 * interruption. They can still turn sound on in `/parametres`, where the
 * control is exactly as discoverable as every other preference.
 *
 * ⚠️ THIS DEPARTS FROM THE DIRECTION DOC, which lists "aucun son" under
 * `prefers-reduced-motion` (§ Contraintes 2). The E2 brief overrules it and
 * gives the reason above; recorded here so the next session finds the conflict
 * already resolved rather than re-deciding it.
 */
export function shouldInvite(): boolean {
  const state = current();
  if (state.enabled || state.invited) return false;
  return !prefersReducedMotion();
}

/** Accepting the offer. One call so the two writes cannot come apart. */
export const acceptInvitation = (): SoundState => writeSound({ enabled: true, invited: true });

/** Declining. Records that it was ASKED, which is what makes it one-time. */
export const declineInvitation = (): SoundState => writeSound({ invited: true });

/**
 * The achievement toast is painted by `ScoreResolver`'s `is:inline` script,
 * which cannot import a bare specifier (the documented rule — importing would
 * reintroduce the module fetch that script exists to avoid). So it dispatches
 * this event and anything that cares listens. The name is duplicated there, in
 * one string, for the same reason the storage keys are.
 */
export const ACHIEVEMENT_EVENT = 'mcc:achievement';

let listening = false;

/**
 * Start listening for achievements, and arm the gesture latch. Idempotent —
 * called from every island that can produce a sound, and safe to call again.
 */
export function initSound(): void {
  if (typeof window === 'undefined') return;
  armOnFirstGesture();
  if (listening) return;
  listening = true;
  window.addEventListener(ACHIEVEMENT_EVENT, () => play('achievement'));
}
