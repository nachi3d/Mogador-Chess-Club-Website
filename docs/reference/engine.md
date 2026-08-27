# Reference — Stockfish and play mode

**Read when:** touching `/jouer/`, `src/lib/engine/`, the level presets, or anything that could pull the engine into a page load.

> Part of the Mogador Chess Club reference set. The binding rules live in
> [CLAUDE.md](../../CLAUDE.md); this file holds the detail behind them.
>
> ⚠️ This text was split out of CLAUDE.md verbatim, so a phrase like "the rule
> above" or "see the section below" may point at a neighbouring section **here**
> or at the rule it belongs to **in CLAUDE.md**. Nothing was cut; if a reference
> does not resolve on this page, it resolves there.

---

## Play mode — Stockfish in a Worker

`/jouer/` (+ `/en/jouer/`). A full game against the engine, entirely in the browser. Nothing is sent anywhere.

### Why Stockfish 11, and why that is not a compromise to "fix" later

The modern NNUE builds ship their neural network inside the package:

| | unpacked |
|---|---|
| `stockfish@16` | 91 MB |
| `stockfish@17` | 183 MB |
| `stockfish@18` | 251 MB |
| **`stockfish@11`** | **8.8 MB** (of which we ship 3.6 MB) |

Stockfish 11 is the last hand-crafted-evaluation release. Its WASM binary is 1.38 MB. This site teaches beginners on Essaouira mobile data; an engine nobody can afford to download is worth exactly nothing, and nothing in a teaching context needs a 3000-Elo opponent. Revisit only if a ceiling above ~2000 is genuinely wanted.

We ship `stockfish.js` (2.28 MB glue) + `stockfish.wasm` (1.38 MB) and **not** `stockfish.asm.js` (another 4.8 MB), which exists for browsers without WASM — none of which this site supports.

### The engine loads on a CLICK, and the whole design serves that

- `PlayView` hydrates and renders **a form**. It fetches nothing.
- `@lib/engine/stockfish` is reached by `await import()` **inside the start handler**. Never hoist it, and never let `PlayBoard.astro` reference it — Vite would follow the import and pull 3.6 MB into the page's module graph.
- `globIgnores` in `scripts/build-sw.mjs` keeps it out of the precache; a runtime `CacheFirst` rule (`mcc-engine`) caches it after the first game, so game two is instant and first-visit cost is unchanged.
- `tests/e2e/play.spec.ts` asserts against the **network log** that opening `/jouer/` requests neither the worker nor the wasm, and that pressing start requests both.

### ⚠️ The level presets are MEASURED — and `Skill Level` alone does not work

**The vendored build exposes no `UCI_LimitStrength` and no `UCI_Elo`** — verified by reading the `uci` option list out of the running worker. The only strength dials are `Skill Level` (0–20), `Skill Level Maximum Error` and `Skill Level Probability`.

#### The bug this section exists to prevent coming back

Up to v0.5.0 the presets were **hand-set and never measured**, and they were not a ladder at all. Measured over 16 games per pairing against two reference opponents:

```
debutant      vs greedy   97%      vs novice   100%
intermediaire vs greedy  100%      vs novice    97%
avance        vs greedy  100%      vs novice   100%
```

Three names, one opponent. Seàn, who plays chess, had not won a single game against **Débutant**.

#### ⚠️ WHY `Skill Level` CANNOT FIX IT — the load-bearing finding

Two facts, both measured with `scripts/engine-lab`:

1. **`Skill Level` only ever chooses among the engine's OWN top candidates**, and every Stockfish search — at *any* depth — ends in a **quiescence search that resolves all captures**. So no `(skill, depth)` pair will ever hang a piece or miss a free one. **"depth 2" is not "sees one move ahead".**
2. At the old `skill 0, depth 2`, the engine played its top choice in **23 of 24** searches of one position — **more deterministic than either higher level**. Débutant was the *least* random preset on the ladder.

`Skill Level Maximum Error 5000` + `Probability 1000` — both extremes — made it **more** deterministic, not less. Not a usable dial here.

**So weakness has to come from somewhere Stockfish does not provide: a deliberate blunder rate.** `blunderChance` on `EngineLevel` is the probability of playing a **uniformly random legal move** instead of the searched one. A beginner needs an opponent that sometimes gives material away, and that cannot come from a dial that only ever chooses between good moves.

#### ⚠️ The random move comes from the ENGINE, not from chess.js

`#randomLegalMove()` sets `MultiPV 500`, searches `depth 1`, reads every `info … multipv N … pv <move>` line, then **restores `MultiPV 1` in a `finally`**. Stockfish clamps MultiPV to the number of legal moves, so the reported set *is* the legal move list — verified against chess.js: 20 from the start position, 31 in the test position.

Done this way because **importing chess.js here would land it in the engine chunk**, and that chunk exists precisely so a reader who never presses "start" never downloads it. The engine already knows the legal moves; asking costs one shallow search and no bytes.

⚠️ Leaving `MultiPV` at 500 would make every later search report 500 lines and run measurably slower — hence the `finally`.

#### The shipped presets, and what they measured

| Preset | Skill | depth | movetime | blunder | vs `greedy` | vs `novice` |
|---|---|---|---|---|---|---|
| Débutant | 0 | 1 | 50 ms | **40%** | 66% | **18%** |
| Intermédiaire | 3 | 4 | 500 ms | **20%** | 97% | **66%** |
| Avancé | **20** | 12 | 1500 ms | 0% | 100% | **100%** |

60 games per pairing, colours alternating. Head-to-head, which is what proves
the **order** (both bots saturate at the top):

```
avance        vs intermediaire   100%
intermediaire vs debutant         95%
avance        vs debutant        100%
```

##### ⚠️ THE RETUNE THAT PRODUCED THOSE NUMBERS (2026-08-21), AND THE TWO THINGS IT GOT WRONG FIRST

Seàn reported Intermédiaire and Avancé making mistakes that should not happen
at those levels. **The two levels turned out to have different faults, and the
first instinct — turn `blunderChance` down on both — was right for one of them
and looking in entirely the wrong place for the other.**

**Intermédiaire: `blunderChance` 0.25 → 0.20.** 0.25 measured **48%** against
`novice`; it was losing more than half its games to an opponent whose only
virtue is not hanging pieces, which is exactly what the complaint looks like as
a number. The curve, `novice` at 120 games per point: `0.25`→48%, `0.20`→66%,
`0.15`→80%, `0.10`→90%, `0.05`→96%.

⚠️ **0.15 WAS MEASURED, LOOKED BETTER, AND WAS REJECTED — ON THE TARGET, NOT ON
THE WIN RATE.** The level exists to be winnable by a student who has finished
course 3 and plays accurately, about **one game in three**. `novice` is the
stand-in for that student, so ~33% for the bot is the goal. 0.20 gives it 34%;
0.15 gives it 20%, one game in five. Seàn's call, and it is the reason the
number is not simply "as low as it can go".

**Avancé: `Skill Level` 14 → 20, and `blunderChance` never moved.** It was
already 0, and `engine-levels.spec.ts` pins it there — so the retune brief
("blunder too often") could not have been describing `blunderChance` at all.
The fault was `Skill Level 14`: Stockfish deliberately picks a worse root move
bounded by `Skill Level Maximum Error`, **default 200 centipawns in this
build**. Measured as best-move agreement against a depth-**matched** reference
(skill 20, depth 12, 4000 ms) over six positions:

| under test | agreed with reference | distinct moves returned |
|---|---|---|
| skill 14, d12 | **46%** | 3 in nearly every position |
| skill 17, d12 | still spread | |
| skill 19, d12 | still spread | |
| **skill 20, d12** | effectively deterministic | `1 3 1 1 1 1` |

⚠️ **THE FIRST RUN OF THAT MEASUREMENT WAS CONFOUNDED AND HAD TO BE THROWN
AWAY** — it used a reference at depth 16 against candidates at depth 12, so
"disagreement" mixed the depth difference into the skill error and could not
attribute either. Match the reference depth to the candidate's.

⚠️ **AND 40 GAMES CANNOT SEPARATE NEIGHBOURING RATES.** Two 40-game samples of
the *same* configuration (skill 3, d4, 0.15, vs `novice`) came out **76% and
86%**. The engine keeps its hash between games and every search is
movetime-bounded, so runs are not reproducible. The shipped figures above are
60 games; the tuning curve was 120. Re-tune at 120 or do not believe the
difference — the 66% in the table replicated at both 60 and 120 games, which is
why it is trusted.

The reference opponents are in `scripts/engine-lab/bots.mjs`:

- **`greedy`** — grabs the biggest capture available, otherwise plays a *random* move. Below a real club beginner: it does not develop, it wanders.
- **`novice`** — 2-ply material minimax. Takes what is free and will not leave a piece hanging to one capture. **This is the yardstick that matters**; it is roughly "a club beginner who plays accurately".

`--bots` validates the yardstick before it is used to judge anything (`random` scores 28% vs `greedy`, `greedy` 1% vs `novice`).

#### ⚠️ 0.4 IS A CEILING, NOT A DIAL TO TURN UP

At `blunderChance 0.5` Débutant fell to **13%** against `novice` — but half its moves were noise and the games stopped resembling chess. **Beatable is the goal; incoherent is not.** `tests/e2e/engine-levels.spec.ts` caps it at 0.5 for that reason.

#### ⚠️ RE-MEASURE, DO NOT RE-REASON

```sh
node scripts/engine-lab/run.mjs --probe        # what the build exposes; is skill applied
node scripts/engine-lab/run.mjs --bots         # validate the yardstick first
node scripts/engine-lab/run.mjs --verify       # play the SHIPPED presets
node scripts/engine-lab/run.mjs --ladder --shipped
```

`--verify` **parses `LEVELS` out of `src/lib/engine/stockfish.ts`** rather than keeping its own copy: a lab that measures its own private numbers proves nothing about what the reader plays against. Budget ~30 minutes for a full pass; it is not part of `npm run build` and nothing calls it automatically.

`tests/e2e/engine-levels.spec.ts` guards the **order and shape** (skill/depth/movetime increasing, blunder rate decreasing, Débutant > 0, Avancé = 0) and deliberately **does not pin the measured values** — those belong to the measurement, and pinning them would make every re-tune a two-file change with a test that only restates the source.

Three environment quirks bit while building the lab, all documented in `scripts/engine-lab/engine.mjs`: Node's global `fetch` makes the Emscripten glue abort (it must stay removed for the *whole* run, not just the constructor); `public/engine/stockfish.js` is CommonJS inside a `"type": "module"` package, so it needs a `.cjs` alias **in the OS temp dir, never in the repo** — a copy under `scripts/` would walk straight into the `astro check` heap death that `public/engine` is excluded to avoid; and `postMessage(cmd, true)` is **synchronous**, so a listener registered after `send()` misses the reply and looks like a hang.

**The UI still names the levels and prints no rating.** These are win rates against two crude bots — evidence of *order* and of *beatability*, not a rating. Claiming an Elo would still be inventing a fact.

The movetime cap is what bounds latency on a slow phone — depth alone would let Avancé think for a long time on a complicated middlegame.

### Memory: a fixed 64 MiB

The build declares `INITIAL_MEMORY = 67108864` and creates its `WebAssembly.Memory` with `initial === maximum`, so the linear memory is **64 MiB, fixed, non-growing** — allocated once the engine starts, not before. `Hash` is pinned at 16 MB (`min = max = 16`) inside it, and `Threads` at 1.

That is the number that matters on a low-end Android, and it is why `PlayView` disposes the worker on unmount: a 64 MiB heap and a possibly-still-searching engine must not survive the reader navigating away. (Note that `performance.memory` will NOT show you this — it is quantised in modern Chromium and does not count WASM linear memory. Read the binary, not the API.)

### Stockfish is just a `MoveProvider` — this is the v2 seam

`src/lib/chess/opponent.ts` defines the interface; `PlayView` talks to that and nothing else:

```ts
interface MoveProvider {
  nextMove(fen: string): Promise<Uci | null>;
  dispose(): void;
}
```

A position goes in, a move comes out, eventually. The view does not know whether it is talking to an engine in a Worker, a scripted list, or — in v2 — another human over a Durable Object socket. **When online play lands it is a new implementation of this interface plus a lobby, not a rewrite of the board.** `scriptedProvider()` exists in that file to keep the interface honest: a second, trivially-correct implementation means `PlayView` depends on the contract rather than on Stockfish's timing.

A search cannot be un-asked, so `PlayView` holds a `generation` counter and drops answers that arrive after a new game, a resign or an unmount. Without it, "New game" mid-think drops the previous game's move onto the new board.

### No third-party requests without an explicit click — a tested rule

The site makes **zero** requests to any third-party origin on load. Fonts are self-hosted, there are no CDN scripts, and Umami is omitted entirely when unconfigured. `tests/e2e/pwa.spec.ts` and `tests/e2e/legal.spec.ts` both assert it — on the home page and on a board page.

This is now a **standing rule, not an accident of not having added anything yet**: any embed that talks to another origin must be a click-to-load facade, and must make no request at all until the reader clicks.

The concrete case is the `youtube` field on `traps` and `cours` (Session 3 decision): when it lands it renders a **facade on `youtube-nocookie.com`** — a static poster plus a play button, with the iframe injected only on click. A plain iframe sets third-party cookies at page load, which would break both the privacy posture stated on `/mentions-legales/` and the specs above.

---

## Play mode — Stockfish in a Worker

**Read when:** touching /jouer/, the Stockfish worker, or ANY level preset — and before re-tuning a level, always.


`/jouer/`. A full game against the engine, entirely in the browser. Nothing is
sent anywhere. The rules that bind other work:

- ⚠️ **The engine loads on a CLICK.** `@lib/engine/stockfish` is reached by
  `await import()` **inside the start handler**. Never hoist it, and never let
  `PlayBoard.astro` reference it — Vite would pull 3.6 MB into the page's module
  graph. `tests/e2e/play.spec.ts` asserts it against the network log.
- ⚠️ **Stockfish is NEVER precached** (Critical Feature 6). `globIgnores` keeps it
  out; a runtime `CacheFirst` rule caches it after the first game.
- ⚠️ **The level presets are MEASURED, not reasoned.** Current, and every number
  here is an output of `scripts/engine-lab`, **60 games per pairing**, colours
  alternating:

  | | skill | depth | movetime | blunder | vs `greedy` | vs `novice` |
  |---|---|---|---|---|---|---|
  | Débutant | 0 | 1 | 50ms | **0.4** | 66% | **18%** |
  | Intermédiaire | 3 | 4 | 500ms | **0.20** | 97% | **66%** |
  | Avancé | **20** | 12 | 1500ms | **0** | 100% | **100%** |

  Ladder, head to head, 60 games: **Avancé 100% over Intermédiaire, Intermédiaire
  95% over Débutant, Avancé 100% over Débutant.** Strictly ordered is the
  property that matters — the bots saturate at the top, so this is what proves it.

- ⚠️⚠️ **WHAT EACH LEVEL IS FOR, WHICH A WIN RATE CANNOT TELL YOU — READ THIS
  BEFORE RE-TUNING ONE.** A number with no target behind it gets moved by
  whoever last found the engine annoying.
  - **Intermédiaire is the level with a stated target: a student who has
    finished course 3 and plays accurately should win about ONE GAME IN THREE.**
    Not one in ten — a wall teaches nothing. Not one in two — that is not a step
    up from Débutant. `novice` (a 2-ply material bot that takes what is free and
    will not hang a piece to a single capture) is the stand-in for that student,
    so the target is **`novice` scoring ~33%**, and 0.20 hits it at **34%**.
    ⚠️ **0.15 was measured and rejected at the target, not at the win rate** —
    it scores 80%, leaving the student one game in five.
  - **Avancé's job is to PUNISH REAL MISTAKES, not to make its own.** It is not
    meant to be beatable by an accurate club player, and 100% against both bots
    is the intended reading, not a tuning failure.
  - **Débutant is the one that may look absurd, and it is correct.** It loses to
    `novice` — it plays a random legal move 40% of the time, which is what a
    beginner needs to be able to win against.

- ⚠️ **THE TWO LEVERS ARE DIFFERENT AND ARE NOT INTERCHANGEABLE. Getting this
  wrong is what sent a retune looking in the wrong place.**
  - **`blunderChance` makes a level WEAK.** It plays a random legal move that
    often. `Skill Level` alone cannot: every Stockfish search ends in a
    quiescence search, so no `(skill, depth)` pair will ever hang a piece.
    **0.4 is a ceiling, not a dial to turn up** — at 0.5 the games stop
    resembling chess.
  - ⚠️ **`skill` below 20 makes a level INACCURATE, and that is a separate
    fault.** Stockfish deliberately picks a worse root move, bounded by
    `Skill Level Maximum Error` — **default 200 centipawns in this build**.
    Measured as best-move agreement at matched depth; the table is in
    [`docs/reference/engine.md`](./docs/reference/engine.md).
  - **So a level that blunders wants `blunderChance` changed, and a level that
    plays second-best moves wants `skill` changed.** Avancé's `blunderChance`
    has always been 0 and a spec pins it there; its old mistakes were skill 14.

  Re-measure with `scripts/engine-lab` — `--verify`, `--ladder --shipped`,
  `--sweep` for a blunder rate and `--accuracy` for move quality. Do not
  re-reason.
- ⚠️ **The engine is just a `MoveProvider`** (`src/lib/chess/opponent.ts`) — a
  position goes in, a move comes out. That interface is the v2 online-play seam,
  and `PlayView` must talk to nothing else.
- `stockfish` is **not** a project dependency; the engine is vendored under
  `public/engine`, which must stay **out of the TypeScript project** (it kills
  `astro check` with a V8 heap OOM naming no file).

**➡️ [`docs/reference/engine.md`](./docs/reference/engine.md)** — why Stockfish 11,
the measured preset table and the reference bots, the fixed 64 MiB memory, and
the random-move implementation. **Read it before re-tuning a level.**

---
