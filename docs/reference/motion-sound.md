# Reference — motion and sound

**Read when:** adding or changing any animation, transition, duration, pacing delay, or sound.

> Part of the Mogador Chess Club reference set. The binding rules live in
> [CLAUDE.md](../../CLAUDE.md); this file holds the detail behind them.
>
> ⚠️ This text was split out of CLAUDE.md verbatim, so a phrase like "the rule
> above" or "see the section below" may point at a neighbouring section **here**
> or at the rule it belongs to **in CLAUDE.md**. Nothing was cut; if a reference
> does not resolve on this page, it resolves there.

---

## Motion — THE THREE FAMILIES (E1)

`src/lib/motion.ts` is the single source for every duration on the site. It was already the home of the board and pacing numbers; E1 made it the whole vocabulary.

Direction, approved by Seàn and recorded in `docs/direction/mcc-direction-esthetique.md`: **the site should feel like a game because it RESPONDS, not because it is dressed up.** An animation that is not the answer to something the reader did is decoration, and decoration goes last or not at all.

| Family | Band | Curve | What belongs in it |
|---|---|---|---|
| **Réponse** | 120–180ms | `--ease-response`, fast-out | What follows a **click**. Button press, card grab, tab switch, replay step, the chevron on a nav group, the move counter's hop. |
| **Transition** | 250–350ms | `--ease-transition`, gentle | A visible **state change** the reader should watch land. Hint reveal, panel open, verdict text, a piece moving, a scroll reveal, the solve's two beats, the correct-move pulse. |
| **Ambiance** | 4–20s | linear, looping | Background drift **only**. Never tied to an action, never carrying information. |

### ⚠️ NOTHING SITS BETWEEN 180ms AND 250ms

The gap is the point. It is what keeps *"the site heard me"* and *"watch this change"* legible as two different things rather than one smear of vaguely-quick. A duration that wants to live in the gap is a **design question, not a tuning question**: decide which family it is and take that family's number.

`tests/e2e/feel.spec.ts` sweeps **every element** on three routes and fails on any computed transition or animation duration inside the gap. It is a sweep rather than a list because the failure it guards against is a `220ms` appearing in a component nobody thought to add to a list.

### What is NOT a family — and must not be forced into one

Three things came out of the audit that legitimately fit no family. They are documented as exceptions rather than given a fourth band:

- **Pacing.** `THINK_FLOOR_MIN_MS`/`MAX_MS` (500–800ms) and the scripted opponent's reply delay. Nothing *moves* for these — they are a wait before motion starts, they have no curve, so they have no family.
- **Offsets.** `REVEAL_STEP_MS` (60ms stagger) and the ambient layer's negative `animation-delay`s. A delay is *when* a duration starts, not how long it runs; the family governs the duration it offsets.
- **Composites.** A shake is four Réponse beats, not a 600ms animation. A solve is two Transitions with a gap. Both are spelled as **arithmetic on a family constant** (`SHAKE_MS = RESPONSE_MS * 4 + 20`, `calc(var(--motion-response) * 4)` in CSS) so they cannot drift into being a fourth family.

### The CSS mirror, and how it is kept honest

CSS cannot import TypeScript, so `tokens.css` restates the numbers as `--motion-response` / `--motion-transition` / `--motion-ambient-min|max`. That is a mirror, and mirrors drift — so **`feel.spec.ts` reads the custom properties off the live document and asserts they equal the imported constants.** Change a number in one place and the spec says so. Same trick as the `BRUSHES` mirror in `BoardSurface.tsx`, but checked rather than trusted.

`--duration-fast` / `--duration-base` / `--duration-slow` and `--ease-soft` are **gone**. `--duration-slow` (600ms) fitted no family at all; the other two were renamed to say which family they are.

### `src/styles/controls.css` — the press, in one place

A button that only changes colour on `:active` reads as a link doing something, not as a control being pushed. The press is a **translate plus a shadow tightening**: the control moves toward the page and the gap beneath it closes. Both together.

⚠️ **`.btn-primary` and `.btn-ghost` were defined seven times**, once per page component's scoped `<style>`, with drifts between them. Astro scoped styles carry an attribute selector, so they beat any global rule of the same class specificity — a press defined globally would have been **silently ignored** on whichever properties a scoped block happened to also set. So the *structure* moved to `controls.css` and the scoped blocks keep only colours and page-specific margins.

That refactor also fixed a **pre-existing miss**: the old definitions came out at ~40px tall, under the 44px touch target, and nothing was measuring it. `min-height: 2.75rem` is now in one place and `feel.spec.ts` measures every button on three routes.

Island CSS (`exercise.css`, `play.css`, `replayer.css`) spells the same declarations locally, because those are separate chunks whose cascade order against the global sheet is not guaranteed. One vocabulary, two places it is written, with a comment in each pointing at the other.

### ⚠️ THE BOARD STAYS SOBER

Motion lives **around** the board — buttons, cards, transitions, background. A shimmering board is a board that reads badly, and the audience does not yet know where f7 is.

The single exception is the **correct-move pulse**: one Transition, one square, no loop, and only in exercise mode. It uses Chessground's own `highlight.custom` (a `Map<Key, string>` of extra square classes) rather than an overlay of our own, because Chessground already knows where a square is — including after a flip. `pulseSquare` on `BoardSurface` always passes a Map, never `undefined`: an empty Map is unambiguous in both directions, where `undefined` would depend on the same config-merge behaviour that `lastMove: undefined` already gets wrong.

**Play mode deliberately does not use it.** There is no "correct" there, and a board that flashes on every engine reply is a board that is hard to read.

### The ambient layer is TWO layers, and the ceiling is enforced by the group

`HeroAmbient.astro` has a near layer (4 pieces) and a far layer (3). Depth comes from the **rate**, not the period: the far pieces travel about a third as far over a longer cycle, so they move roughly four times slower in px/s — which is what the eye reads as distance. A longer period alone would just have made them lazier.

The drift periods were **47–71s before E1**, which is slow enough that a reader sees no motion at all in their first five seconds; the layer was paying its full cost and delivering nothing. They are now 13–20s, inside the Ambiance band and mutually non-multiple.

⚠️ **The 0.075 opacity ceiling is enforced by the GROUP, not by each piece.** `.ambient` carries `--mcc-ambient-opacity`, and group opacity is applied to the *flattened* group — so two overlapping pieces composite to the group's alpha and **not** to the sum of their own. That is the only reason a second layer could be added without re-auditing the hero text against a new worst case. **Do not move the opacity down onto the pieces.** `--mcc-ambient-far` is the far layer's share of that already-capped budget, and light mode takes the larger share (0.7 vs 0.55) because it starts flatter.

⚠️ **The reduced-motion off-switch needs BOTH selectors.** The `@supports (animation-timeline: scroll())` block sets `animation-name` via `.layer-far .piece` — two classes — so the single-class `.piece { animation: none }` lost the specificity fight and **the far layer kept drifting for a reader who had asked for stillness.** The near layer was unaffected, which is exactly why this needed a spec rather than an eyeball. Anything added to that `@supports` block needs a matching selector in the reduced-motion block.

### Reduced motion: off for decoration, instant for feedback

- **Ambiance is switched OFF**, not shortened. There is no version of decorative drift that a reader who asked for stillness wants at a different speed. It is the one family with no reduced-motion value at all.
- **Réponse and Transition collapse to 1ms** (not 0 — a transition that can never complete is a trap to leave lying around).
- **Feedback is never removed.** The press still reports itself through its shadow; the correct-move pulse still marks the square as a static ring; the verdict still changes the frame's colour. Only the travel goes.
- **The solve's two beats collapse.** A reader who asked for reduced motion asked for the outcome, not a choreographed arrival of it — staging a delay they did not ask to wait through would be treating "reduced motion" as "the same show, slower".

### Decisions taken in E1 (recorded, not re-litigated)

- **Nav labels stay functional** — Cours, Exercices, Jouer. Evocative names go on **page titles only**, in E4.
- **Ranks are Pion → Cavalier → Fou → Tour → Dame.** ✅ Built in E3 — see the progression section for the thresholds and the reasoning.
- **NO daily or consecutive-day streak.** The club meets *weekly*, so a daily streak would punish the normal rhythm of the people it is for. Session streaks only. ✅ Built in E3, and the rule is now Critical Feature 34.
- **Sound is synthesised via Web Audio and off by default.** E2, not built.
- **No confetti on a solve.** Precision is the reward, not visual noise.

---

---

## Animation policy (Session 6)

Every duration on the site is a constant in **`src/lib/motion.ts`**, and nothing
else may invent one. The numbers only mean anything relative to each other, so
scattering them is how they drift apart.

| Constant | Value | What it paces |
|---|---|---|
| `BOARD_ANIMATION_MS` | 250ms | a move played on a board — exercise, play |
| `REPLAY_ANIMATION_MS` | 200ms | a step through a replay |
| `THINK_FLOOR_MIN_MS` / `MAX` | 500–800ms | the opponent's apparent thinking time |
| `REDUCED_MOTION_FLOOR_MS` | 150ms | the floor under `prefers-reduced-motion` |

### Gameplay vs navigation — why two board durations

A move **played** is an event: something happened and the reader must see which
piece went where. A **step** through a replay is navigation — the reader is
scrubbing a game they are reading, and every extra millisecond is latency between
them and the next position. Jumping (Home/End, clicking a move) animates not at
all; that is the existing `instant` prop.

They are close together because they are the same gesture at different intents,
not because the difference is a rounding error.

### ⚠️ The thinking delay is a FLOOR, not a fixed wait

`thinkingFloorMs()` is the **minimum** time before the engine's move appears. If
the search takes longer — and at Avancé it legitimately will — nothing is added
on top. The floor exists because Stockfish is usually far *faster* than a human
reads: at Débutant (depth 2) a reply returns in single-digit milliseconds, and a
move landing in the same frame as your own reads as a glitch, not an opponent.

Implemented in `PlayView.opponentMove()` as: stamp the time, take a floor, run
the search, then wait out whatever remains. **The `generation` check runs again
after that wait** — the floor introduces a second `await`, so a new game, a
resign or an unmount during it could otherwise drop the previous game's move onto
the new board. That is the same class of bug `generation` already existed for,
reachable through a new door.

`ExerciseView` draws from the same range for its scripted `opponentReplies`, so a
student cannot feel which page has a real engine behind it. There the reply is
known at build time, so the floor *is* the whole delay.

**The test asserts a lower bound only.** An upper bound would turn "the engine
thought hard about a sharp position" into a failing test.

### `prefers-reduced-motion` reduces motion, not pacing

Board moves become instant and all ambient motion stops. The opponent delay drops
to **150ms rather than 0** — a reader on a screen reader has their own move
announced and then the opponent's, and collapsing the gap makes the two
announcements overlap so the reply is heard as part of their own move. Reduced
motion means "do not animate", not "do not pace".

The preference is read **at call time, never cached**: it can change mid-session,
and `BoardSurface` re-reads it on every update as well as at mount, which is what
lets a spec emulate it after the island has already mounted.

### ⚠️ Scroll reveals break axe unless the page is settled first

Found in v2-S1, caused by Session 6. A `[data-reveal]` element sits at
`opacity: 0` until the observer sees it, so **every card below the fold is fully
transparent text that axe can still find** — and it reports `color-contrast` for
each one. On `/exercices/` under Firefox that was `color-contrast (19×)`.

It presents as **flakiness, not breakage**, because it depends on viewport
height (worse on the phone projects, where more cards start below the fold) and
on transition timing. It flaked on iPhone 13 for two matrix runs before a serial
Firefox run finally failed hard enough to show the real violation — which is why
"a flaky axe test" on an index page should be investigated rather than retried.

**Every axe check on a reveal-bearing page must call `settleReveals(page)`**
(`tests/e2e/helpers/reveal.ts`) first. That is not weakening the assertion: a
card nobody has scrolled to is a card nobody is reading, and the helper measures
the page in the state a reader actually experiences.

### Where ambient motion is allowed

- **Yes:** home hero (drifting silhouettes + scroll parallax), and section
  reveals on home and the four index pages.
- **No:** board detail pages — `/pieges/[slug]/`, `/exercices/[slug]/`, `/jouer/`.
  The board is the content there; fading it in delays the one thing the reader
  came for. `tests/e2e/motion.spec.ts` asserts those three carry neither.

Reveals are **opt-in per page** via BaseLayout's `reveals` prop, and the CSS gate
is `html.js body[data-reveals] [data-reveal]` — three conditions, all of which
must hold before anything is transparent. Miss any one and content renders
normally. **The failure mode of a decorative effect must never be an invisible
page.**

### ⚠️ GSAP was evaluated and REJECTED — do not add it

The Session 6 brief called for GSAP. It is not here, and the reason is not taste:

> `npm view gsap license` → **"Standard 'no charge' license"** — GreenSock's own
> licence, not an OSI one.

This project is **GPL-3.0-or-later** (forced by Chessground). The GPL forbids
adding restrictions beyond its own, and GSAP's licence restricts redistribution
and fields of use. Bundling it would make the combined work undistributable under
the licence the repo claims, contradict the dependency table on
`/mentions-legales/`, and undercut the README's invitation to take this engine and
run your own club with it.

The visual result was the requirement, so it is delivered in **CSS + ~20 lines of
vanilla JS**: keyframe drift, `animation-timeline: scroll()` parallax behind
`@supports`, and an IntersectionObserver for reveals. Cost **≈1.3 KB gzip** and
zero new requests, against ~36 KB gzip for GSAP core + ScrollTrigger.

If a future session genuinely needs a timeline library, it must clear the licence
question first. A permissive one (MIT/BSD) is fine; GSAP is not.

### The ambient layer has an opacity ceiling

`--mcc-ambient` / `--mcc-ambient-opacity` in `tokens.css`, per palette:
green-800 at **0.055** (light), brass-300 at **0.07** (dark).

`check-contrast.mjs` **cannot see this** — it audits token pairs, not decorative
SVG sitting behind text. Computed by hand, worst case being text over a fully
covered silhouette:

| | clean | over a silhouette |
|---|---|---|
| light `h1` | 17.06 | 15.45 |
| light lede | 5.13 | **4.65** |
| dark `h1` | 17.50 | 15.40 |
| dark lede | 7.79 | 6.85 |

**The light lede is the constraint, and it drops below AA at ambient opacity
~0.075.** We ship 0.055. If anyone raises it "just a little", that is the number
that breaks, and no automated check will catch it — re-run the arithmetic.

---

---

## Sound — SYNTHESISED, OFF BY DEFAULT (E2)

Direction: `docs/direction/mcc-direction-esthetique.md` § C3. **`src/lib/sound.ts`
is the single source**, exactly as `motion.ts` is for durations and for the same
reason: these numbers only mean anything relative to each other. A capture must
read heavier than a placement and a wrong move softer than either, and scattered
oscillators drift out of that relationship one commit at a time.

⚠️ **NO OTHER FILE MAY BUILD AN `AudioContext`, AN OSCILLATOR OR A GAIN NODE.**
Islands call `play(event)`; the settings page calls it for a preview. That is
the whole public surface.

### No audio files — three decisions at once

0 bytes in the precache and 0 requests, so a phone on Essaouira mobile data pays
nothing for a feature it may never switch on; no licence question in a GPL repo,
because a synthesised waveform has no author to credit; and every parameter is
tunable from one file, so "the capture is too harsh" is a one-line change rather
than a re-recording.

### The palette — six voices, and deliberately no more

| voice | shape | why |
|---|---|---|
| `place` | triangle 240→170 Hz, 45ms, lowpass 2.2k | a piece meeting wood: fast fall, no sustain |
| `capture` | sawtooth 150→90 Hz, 75ms, lowpass 900 | heavier and lower; the low corner makes it a thud, not a rasp |
| `check` | triangle 440 + 622 Hz, 70ms | a tritone — the most unstable interval there is. A warning, not an alarm |
| `solved` | sine 587 → 880 Hz, 70+80ms | a rising fifth. Open and resolved **without** being a fanfare |
| `wrong` | sine 175→150 Hz, 150ms, 18ms attack | see below |
| `achievement` | the solve plus a third note (1175 Hz) and a faint octave | "that, but more" — recognisably the solve, since it is rarer |

⚠️ **THE WRONG-MOVE VOICE IS THE ONE TO GET RIGHT.** A synth makes a buzzer
trivially easy and that would be the wrong instrument entirely: this is a
teaching tool for children, and an error must inform rather than scold. So it is
a pure sine (no harmonics to bite), the lowest gain in the palette, and the only
voice that fades **in** rather than striking. Both refused verdicts share it —
under `onlyMove: false` we do not know the reader was wrong, so we must not
sound as though we do, which is the `onlyMove` rule applied to a second sense.

⚠️ **Nothing sounds for navigation, hover, scroll or page load.** A site that
chirps as you scroll is a site you mute — and then the sounds that carry meaning
are muted too.

⚠️ **Every tone is 20–80ms except `wrong`.** The two SEQUENCES are longer only
because they are several short tones in a row — the same distinction motion.ts
draws between a family duration and a composite built from one. `wrong` is the
deliberate exception at 150ms because softness is an **envelope**, and an
envelope needs time; a 60ms sine is a blip, and a blip reads as a buzzer however
quiet it is.

⚠️ **One sound per move.** `voiceForMove()` owns the priority — check beats
capture beats place — so the two islands cannot disagree. A capture that gives
check is a check: the more urgent fact, and stacking both reads as a bug.

### `mcc:sound:v1` — its own key, and why not the theme record

Considered and rejected. The theme record is parsed by the **blocking inline
head script** before first paint; sound cannot possibly matter before first
paint, because it cannot exist before a gesture. Putting it there would grow the
parse surface of the one script that runs before anything is on screen, to carry
a value it will never read. Two keys also version independently — a change to
the sound shape must not force a theme migration on readers who never turned it
on.

Everything else follows `theme.ts` and `progress.ts`: versioned key, guarded
access, normalised field by field, single migration point. ⚠️ **Any doubt
resolves to OFF** — a corrupt record must never make a silent site start making
noise, so the parser is biased towards silence rather than towards preserving
intent.

### The context: one, and never before a gesture

Browsers refuse to start an `AudioContext` without user activation and leave it
`suspended`, so building one earlier buys a broken object — and it is the
project's standing "nothing before a click" rule, the same one that keeps
Stockfish's 3.6 MB behind a button. `initSound()` only arms two one-shot passive
listeners.

⚠️ **ONE context for the life of the page, not one per sound.** An
`AudioContext` is backed by a real audio device; creating one per move exhausts
the browser's limit inside a single exercise and then every later sound fails
silently. `sound.spec.ts` patches the constructor and counts.

### `prefers-reduced-motion` DOES NOT SILENCE THE SITE

⚠️ **This departs from the direction doc**, which lists *"aucun son"* under
`prefers-reduced-motion` (§ Contraintes 2). The E2 brief overrules it, and the
reason is that the two are different senses: the preference exists for
vestibular discomfort, not for hearing, and switching sound off for those
readers decides something they did not ask about.

⚠️ **But it does suppress the OFFER**, which is a different judgement. A reader
who has told their OS they want things calmer has said something about being
interrupted, and an unprompted invitation is an interruption. `/parametres/`
stays exactly as reachable for them as for anyone. Both halves have specs.

### The one-time invitation

Offered once, at the first solve, and retired by **either** answer — declining
writes `invited: true` too. An invitation that returns after a "no thanks" is
not an invitation, it is nagging.

⚠️ It renders **outside** the verdict's `aria-live` region. Buttons inside a
live region are re-announced on every update and make the panel a moving target
for anyone tabbing; the offer follows the verdict, it is not part of it.

### Sound is never the only signal

Every voice accompanies a visual that fires independently — the piece moves, the
piece disappears, Chessground paints the check highlight, the verdict text
changes, the board shakes, the toast appears. That is what makes it safe for
`play()` to give up quietly on a hidden tab, a missing audio device or a refused
context, and it is why a reader on silent loses nothing.

⚠️ **Suppressed when the tab is hidden** — a sound from a tab nobody is looking
at is unattributable noise.

### ⚠️ PLAYWRIGHT'S HEADLESS WEBKIT HAS NO WEB AUDIO AT ALL

Not a Safari fact and not a product bug — a fact about the **test build**.
Probed on `webkit` and `iphone-13`:

```
typeof window.AudioContext        → "undefined"
typeof window.webkitAudioContext  → "undefined"
new (AudioContext || webkit…)     → "no constructor"
```

Real Safari has had unprefixed Web Audio since 14.1 and the prefixed form for
years before that. The site degrades exactly as designed: `audio()` returns
null, `play()` gives up quietly, the exercise carries on.

⚠️ **The three tests that need a context to EXIST therefore skip on those two
projects, visibly and with the reason attached** — a test that cannot run must
say so rather than pass vacuously, the same rule the auth specs follow when
`.env.test` is absent. The zero-assertion tests still run everywhere.

⚠️ **And the limitation was turned into coverage:** "a browser with no Web Audio
still solves, silently and without errors" deletes both constructors via
`addInitScript` and asserts the solve completes with no `pageerror`. That runs
on **all five** projects, so the degradation path cannot quietly stop being
covered when a browser build changes.

### The achievement event

`ScoreResolver`'s script is `is:inline` and cannot import a bare specifier, so it
**dispatches** `mcc:achievement` and the sound module listens. The name is
duplicated there in one string — the same trade the storage keys get — and
`sound.spec.ts` pins the pair.
