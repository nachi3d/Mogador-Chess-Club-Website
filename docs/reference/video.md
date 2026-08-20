# Reference — the YouTube facade

**Read when:** touching `VideoFacade.astro`, `src/styles/video.css`,
`scripts/fetch-video-posters.mjs`, the `youtube` field on `traps` or `cours`, or
the `#video` section of `/mentions-legales/`. Also read it before adding **any**
embed from any third party — the reasoning below is not specific to YouTube.

> Part of the Mogador Chess Club reference set. The binding rules live in
> [CLAUDE.md](../../CLAUDE.md); this file holds the detail behind them.

---

## Why a facade at all

The `youtube` field has existed on `traps` and `cours` since Session 2 and
rendered nothing until v0.16. The decision recorded at the time — click-to-load,
on `youtube-nocookie.com` — was never implemented, and it is worth writing down
what it is protecting, because the four-line alternative is genuinely tempting.

A plain `<iframe src="https://www.youtube.com/embed/…">` contacts Google **on
page load**, not on play. Measured on any page carrying one: requests to
`youtube.com`, `google.com`, `googlevideo.com` and, historically,
`doubleclick.net`, plus cookies, plus a `Referer` naming the exact page. Every
reader pays that, including the ones who never press anything.

That is Critical Feature 9 — no third-party request without an explicit reader
click — and it is not an abstract preference here. This is a site that teaches
**children**, whose privacy notice says the site sets no cookies and contacts
nobody, and whose zero-request posture is asserted by specs on six content
routes. A video that quietly changed that would be worse than no video: it would
make a promise on `/mentions-legales/` false while every page still rendered
perfectly.

---

## ⚠️ THE POSTER IS THE HALF THAT GETS LOST

The click part is obvious once stated. The poster is not, and it is the
regression to expect:

```html
<!-- looks identical on screen, breaks the same rule -->
<img src="https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg">
```

`i.ytimg.com` is a Google origin. That request carries the reader's IP address
and a `Referer`, it fires on page load, and it fires for every visitor. It is
Critical Feature 9 violated by a hostname nobody thinks of as YouTube — and it
is *more* attractive than the iframe, because it removes a build step and a
committed binary.

So: **every poster is a file this site serves**, and three separate things hold
that in place.

1. `scripts/fetch-video-posters.mjs` writes `public/video/<id>.webp` and
   `<id>@2x.webp`, committed.
2. `scripts/check-content.mjs` **fails the build** when a `youtube` id has no
   committed poster, naming the id and the command. Without it the tempting
   repair for a missing file is the hot-link above.
3. `tests/e2e/video.spec.ts` sweeps every request made before the click and
   fails on **any** non-local origin.

⚠️ **The spec's filter is `hostname !== localhost`, never
`url.includes('youtube')`.** A youtube-only filter passes a hot-linked
`i.ytimg.com` poster cleanly, which is precisely the case it exists to catch.

⚠️ **This was verified rather than assumed.** Pointing the poster at
`i.ytimg.com` and rebuilding turned three tests red — the two per-locale
zero-request sweeps and the poster-origin assertion. Same discipline as the
`claims[]` fixtures: write the thing that must fail, watch it fail, delete it.

---

## The poster pipeline, and what it costs

`node scripts/fetch-video-posters.mjs`. **Not part of `npm run build`**, on
purpose and for the same reason as `build-icons.mjs` and `build-fonts.mjs`: a
Cloudflare build must need no image toolchain and no network reach to Google.
`fetch-agenda.mjs` IS in the build, and the difference is staleness — a session
list goes stale in days, a video still does not go stale at all.

Three sources, in order:

| | Source | When it is right |
|---|---|---|
| 1 | `src/assets/video/<id>.(jpg\|jpeg\|png\|webp)` | An author-supplied still. Wins over everything. The only correct source for **anyone else's** video — a thumbnail is a frame of the video, so re-hosting one is a copyright question, and path 2 is for videos the CLUB publishes. |
| 2 | `i.ytimg.com`, fetched once here in Node | The club's own video. The ladder is `maxresdefault` → `sddefault` → `hqdefault`; the first two 404 for some videos, and `hqdefault` is 480×360 with 4:3 letterbox bars, which is why it is last. |
| 3 | The generated **house plate** | Neither of the above is available — a placeholder id, or a video that is private or removed. Printed as a WARNING naming the id. |

⚠️ **Path 3 is a real output, not an error path.** A facade around a pending
video must still render correctly, be styled, be measurable and be testable; a
missing file would make the page look broken while the feature is merely
pending.

⚠️ **The house plate's ground is `#101a14` — the dark theme's page colour — and
NOT green-800.** Green-800 (`#163425`) was the obvious first choice: it is what
the PWA icons are flooded with. It is also exactly `--mcc-primary-hover` in the
light themes, so the play badge went one shade darker on hover and on focus and
**landed on its own background** — the control vanished at the moment the reader
was pointing at it. A real photographic still would never collide like that; the
house plate is the one still we control, so it is the one that moves. This
ground is deeper than any theme's primary, so every badge reads against it.

⚠️ **The house plate draws its mark in the LOWER LEFT, not the centre.** The
facade's play badge lands dead centre over whatever the poster is. A centred
mark sat directly behind it with its corners peeking out around the disc, which
reads as a rendering fault rather than as a placeholder. The centre of any
poster belongs to the badge; the house plate is the one still we control, so it
is the one that can be drawn to respect that.

**Widths are 640 and 1280**, mirrored in three files —
`fetch-video-posters.mjs` writes them, `VideoFacade.astro` puts them in a
`srcset`, `check-content.mjs` checks both exist. Each names the other two.
640/1280 rather than one middle size because the facade's box is capped at the
board's own 34rem (544px): 640 is the file a phone at DPR 1 downloads and 1280
is the retina file. A single 960 would be ~2.6× on a 390px phone — paid for by
every reader, seen by none of them.

**The cost, stated:** adding a `youtube` id is no longer a one-field edit. It is
a field plus a script run plus a committed binary (~12 KB + ~26 KB for a real
photographic still; ~1.3 KB + ~2.7 KB for the house plate). A creator who
changes their thumbnail does not change ours, which for a teaching video is a
feature rather than a bug — the still we chose is the still we keep.

---

## Placement — one rule, both pages

**The video sits below the page's primary content and above the way onward.**
After the replayer on `/pieges/<slug>/`; after the lesson list on
`/cours/<slug>/`.

Three reasons, in the order that decided it:

1. **The board is the thing being taught with.** It is interactive, bilingual,
   works offline and costs the reader nothing. A 16:9 facade above it is ~200px
   on a phone before the reader reaches the position the page is named after —
   the same defect M3 measured in the exercise control stack, arriving from the
   other direction. `mobile-fit.spec.ts` pins the board's size at 360px, and
   `video.spec.ts` asserts the ordering at 390px and 360px so this placement
   cannot quietly invert.
2. **The video is a supplement, and only the reader knows if they want it.**
   Whoever came for the line gets the line; whoever wants Michael to walk them
   through it scrolls once and finds it under a heading.
3. **One rule, not two.** A course page is a chooser (Critical Feature 65), so
   its primary content is the lesson list — a video above it puts a video
   between a reader and the lesson they came to start.

---

## Accessibility

- **A real `<button>`.** In the tab order by construction, answers Enter *and*
  Space with no keydown handler, announced as a button rather than as a picture.
- **Named with what the video is about**, via an `.sr-only` span: *"Lire la
  vidéo : Le mat de Légal"*. The schema stores an id and nothing else,
  deliberately — a `youtube_title` field would be a second name for one thing,
  in two languages, that nobody would keep in step with YouTube. The page's own
  title is the honest label and it is already translated.
- **The poster is `alt=""`.** An alt-texted image inside a labelled button is
  announced twice, which reads as a stutter rather than as extra help.
- ⚠️ **Focus moves into the player on activation.** The button the reader was
  standing on has just been removed from the document, so without an explicit
  `iframe.focus()` focus falls back to `<body>` — and a keyboard reader is
  silently returned to the top of the page, having started a video they can no
  longer reach. Asserted by reading `document.activeElement`, not assumed.
- **The iframe carries a `title`.** An unnamed frame is announced as "frame" and
  nothing else, which is useless in a list of landmarks.
- ⚠️ **No text sits on the poster.** `check-contrast.mjs` proves token *pairs*;
  it cannot see a caption laid over a photograph, so a title band across the
  still would be exactly the unauditable contrast this codebase has been bitten
  by before (`opacity: 0.9` on an audited fill, Lighthouse 100 → 96). The title
  and the privacy line render **below** the frame, on the page surface, in pairs
  the auditor already proves in all eight theme/mode combinations. The one thing
  over the image is the play badge, and it is a **solid** fill —
  `--mcc-primary-contrast` on `--mcc-primary` is proved whatever the still
  behind it looks like — with a page-coloured ring so it reads as a control on a
  busy still as well as on a plain one.

**Nothing new was added to the contrast auditor**, and that is the point: the
facade consumes only pairs it already covers.

---

## The stylesheet lives in two unusual places at once

⚠️ **`src/styles/video.css` is imported by `global.css`, NOT by the component**,
and it is **not** a scoped `<style>`. Two independent reasons, and losing either
one breaks something different.

1. **Not scoped**, because the player iframe is created by script at click time.
   Astro stamps `data-astro-cid-*` at *build* time onto the elements a component
   declares, so `.mcc-video-frame iframe` compiles to
   `.mcc-video-frame iframe[data-astro-cid-…]` and misses a runtime element
   entirely — the player would render as an unstyled 300×150 box inside a 16:9
   frame. Same trap as `admin.css` and `family.css`, and every rule is prefixed
   with `.mcc-video` for the same reason those are: the cascade is settled by
   specificity, not by the order a component-imported sheet happens to land in.
2. **Not component-imported**, because `VideoFacade` is imported by every trap
   and every course page — twenty documents — and Astro collects a component's
   CSS from the module *graph*, not from what renders. Imported by the component
   it inlined 1.4 KB into all twenty, including the eighteen carrying no video.
   The precache manifest fell **6363 → 6322 KiB** when it moved to `global.css`.
   Exactly the argument recorded on `score.css`.

⚠️ **The `<script>` still ships to all twenty**, because hoisted scripts are
collected from the module graph too — ~700 B minified, inlined. Measured and
accepted: the alternative is `is:inline`, which ships the block verbatim
including its comments (the 8.4 KB head-script lesson) and loses type checking.
The facade renders nothing without the field, which is the part that matters.

---

## What the reader is told, and where

`/mentions-legales/#video`, four paragraphs, both locales, linked from **every
facade before the click** rather than only from the footer.

⚠️ **It deliberately undersells `youtube-nocookie.com`.** The domain name
invites the reader to conclude "no data at all", which is false: Google records
the view, may store technical data in the browser for that domain, and may
attach the view to a Google account signed in elsewhere in the same browser.
Saying so ourselves is worth more than the sentence it costs. **If that
paragraph ever reads like reassurance rather than disclosure, it is wrong.**

What is actually sent, and what the copy therefore names: IP address, device and
browser information, which video was requested, and the site's address. The last
one is origin-only — the iframe carries
`referrerpolicy="strict-origin-when-cross-origin"`, so YouTube learns which site
sent the reader and not which lesson they were reading.

⚠️ **`id="video"` is linked from every facade.** Renaming the section breaks a
link on every page carrying a video and nothing else would notice, so
`video.spec.ts` follows the href and asserts the anchor resolves.

---

## The embed URL

Built in JavaScript at click time. Until that handler runs, the only thing the
document carries is an eleven-character id in a data attribute — no hostname, no
`<link rel="preconnect">`, no `dns-prefetch`. ⚠️ **A preconnect is not a free
performance win here**: it resolves DNS and completes a TLS handshake with
Google before the reader has decided anything, which is the whole thing this
component exists not to do. `video.spec.ts` asserts there are none.

```
https://www.youtube-nocookie.com/embed/<id>?autoplay=1&rel=0&modestbranding=1
```

⚠️ **`autoplay=1` is not a flourish — it is what makes the click one click.**
Without it the reader presses our play button and is handed YouTube's, which
they must press again. The gesture that loaded the frame is the gesture that
satisfies the browser's autoplay policy, so it only ever plays because a reader
asked it to.

⚠️ **The button is removed, never hidden behind the player.** A button left in
the DOM stays in the tab order and would load a second iframe on top of the
first.

---

## The exercised path is a FIXTURE, not live content

⚠️ **No published trap or course carries a `youtube` id today.**

The facade first shipped with a placeholder id (`TODOvideo00`) on
`/pieges/legal/` — a real trap, on the real index, whose play button handed a
reader YouTube's *"video unavailable"*. That bought the specs a page to drive at
the cost of a dead video on live content, which is the wrong way round: **the
test harness's needs must not reach the reader.** It was reverted before the
feature ever shipped to `main`.

What replaced it is `src/content/traps/fixture-video-facade.json`, carrying
`fixture: true`:

| | |
|---|---|
| **Routable** | only when `PUBLIC_FIXTURES=true` |
| **Listed** | **never, in any build** |

⚠️ **THE TWO PREDICATES IN `src/config/fixtures.ts` ARE TWO ON PURPOSE.**
`isRoutable()` decides whether the page exists; `isListed()` decides whether a
reader can find it, and it does not consult the flag at all. Collapsing them
into one would put the fixture on `/pieges/` in every test build — where
`index-cards.spec.ts` would assert a card for it and `/apprendre/`'s trap count
would be one too high, neither of which looks wrong on the page.

⚠️ **`fixture` IS A SEPARATE FIELD FROM `draft`.** A draft is content being
written that will one day be published, and unparking it is meant to be a
one-character edit. A fixture must *never* be published. Overloading `draft`
would make "unpublish this trap for a week" and "this is not real content" the
same edit, and only one of them should be easy to undo.

### Why the flag defaults OFF and the harness turns it on

Default OFF, because **the default must be the shape production ships** — the
discipline `src/config/auth.ts` is written to, for the reason recorded in
CLAUDE.md: production's flags live in a Cloudflare dashboard nothing in this
repository can see. A fixtures flag defaulting ON and relying on the dashboard
to switch it off would ship a fixture the first time somebody forgot, and
nothing here would fail.

`playwright.config.ts` passes `PUBLIC_FIXTURES: 'true'` to the build it tests —
**hardcoded, not read from the environment**, and the difference from
`PUBLIC_AUTH_ENABLED` beside it is deliberate. The auth flag selects between two
real product shapes, so the release gate runs the matrix once for each. Fixtures
are a property of the *harness*: constant across both shapes, so they give the
facade full cross-browser coverage and **add no third matrix run**.

### ⚠️ The OFF shape can only be proved in production

No local spec can assert the fixture is absent, because the build under test is
by construction the one where it is present — asking it would be asking the
wrong build. Same limitation as `auth-disabled.spec.ts`, which can only speak
about the shape it was built in.

So `scripts/smoke-prod.mjs` checks it where it is true: both fixture routes must
**404** on the live site, and a 200 fails the smoke run naming the variable.
It is on the promotion checklist.

⚠️ **404 is the pass, and that depends on `not_found_handling: "none"`.** If a
404 page ever lands, this check changes in the same commit.

### Seeing a fixture by hand

```sh
PUBLIC_FIXTURES=true npm run demo
```

⚠️ **Never put `PUBLIC_FIXTURES` in `.env.local`** — same rule as
`PUBLIC_AUTH_ENABLED`. The default build on this machine must stay the shape
production ships.

### When Michael's first video lands

1. Add the `youtube` id to the real trap or course.
2. `node scripts/fetch-video-posters.mjs` — it will fetch the real thumbnail
   rather than the house plate.
3. Commit `public/video/`.
4. ⚠️ **`video.spec.ts`'s "real published content carries no video" test will
   fail, by design.** Update it deliberately in the same commit; that assertion
   exists so a placeholder cannot creep back onto live content unnoticed.
5. The id, the poster run and the release go together — a video id merged
   without a deploy is a poster nobody has.

⚠️ **If the fixture's `youtube` field is ever blanked, `video.spec.ts`'s first
test fails by design** — the corpus assertion exists so the rest cannot pass
vacuously. That failure is the honest signal that the feature has no exercised
path, not a bug to route around.

---

## Testing notes

- **The player must never actually load in a test run.** `blockYouTube()` aborts
  `youtube-nocookie.com`, `youtube.com` and `ytimg.com` at the route layer. The
  request is still *made* and still observed, which is exactly what the
  "only after the click" assertions need — letting it complete would make the
  suite depend on Google being reachable and prove nothing extra.
- **Scroll the facade into view before sweeping requests.** The poster is
  `loading="lazy"` and below the board; a poster that only stayed local because
  it was never requested would be a false pass.
- The measured Lighthouse numbers, before and after, are in the CHANGELOG entry
  for this feature. The row that matters is the **real photographic still**, not
  the house plate: the plate is flat and compresses to 3 KB, which would
  understate the real cost by an order of magnitude.
- ⚠️ **Posters are NOT precached.** `build-sw.mjs`'s `globPatterns` lists
  `html,css,js,woff2,svg,png,webmanifest,json` — **no `webp`** — so a poster is
  served but never swept into the precache manifest. That is the right answer
  and is worth stating rather than discovering: precaching them would charge
  every first visit ~26 KB per video on the site, for a below-the-fold lazy
  image most readers never scroll to. Same argument as the piece sets and the
  engine. A poster therefore does not appear on a cold offline load; the facade
  still renders its frame, its button and its title.

---

## ⚠️ Test fixtures — routable, never listed, never in production

**Read when:** adding a fixture, changing `src/config/fixtures.ts`, or wondering
why a spec has real content to drive. Moved out of CLAUDE.md at v0.17.1; the two
predicates and the `.env.local` ban stay there.

⚠️ **The block below is a VERBATIM move** — `check-split.mjs` compares normalised
lines, so nothing inside it may be reworded, including its relative links. Paths
like `./docs/reference/…` are written from the repository root (CLAUDE.md's
position), and a `➡️` pointer back to this same file is the move showing its
seam, not a mistake.

### ⚠️ TEST FIXTURES — ROUTABLE, NEVER LISTED, NEVER IN PRODUCTION

`src/config/fixtures.ts`. A fixture is content that exists **only** so a spec
has something real to drive. Today that is
`src/content/traps/fixture-video-facade.json`, and the mechanism generalises.

- ⚠️ **TWO PREDICATES, AND THE SPLIT IS THE WHOLE DESIGN.** `isRoutable()`
  decides whether a page is emitted (fixtures: only when `PUBLIC_FIXTURES=true`);
  `isListed()` decides whether a reader can find it (fixtures: **never, in any
  build** — the flag is not even consulted). Collapsing them puts the fixture on
  `/pieges/` in every test build, where `index-cards.spec.ts` draws a card for it
  and `/apprendre/`'s trap count goes one too high.
- ⚠️ **`fixture` IS A SEPARATE FIELD FROM `draft`.** A draft is content being
  written that will one day be published; a fixture must never be. Overloading
  `draft` makes those two the same edit.
- ⚠️ **THE DEFAULT IS OFF, BECAUSE THE DEFAULT MUST BE WHAT PRODUCTION SHIPS** —
  the same discipline as `PUBLIC_AUTH_ENABLED`, for the same recorded reason.
  **`playwright.config.ts` sets `PUBLIC_FIXTURES: 'true'` for the build it
  tests**, hardcoded and in both auth shapes, so every run — branch and matrix —
  covers the facade and **no third matrix shape is added**.
- ⚠️ **NO LOCAL SPEC CAN PROVE THE OFF SHAPE**, because the build under test is
  by construction the ON one. **`npm run smoke:prod` fails if a fixture route
  answers anything but 404 on the live site**, and that is on the promotion
  checklist. A 200 there means a production build ran with the variable set.
- ⚠️ **`PUBLIC_FIXTURES` MUST NEVER GO IN `.env.local`** — same rule as
  `PUBLIC_AUTH_ENABLED`. To see a fixture by hand:
  `PUBLIC_FIXTURES=true npm run demo`.

**➡️ [`docs/reference/video.md`](./docs/reference/video.md)** — the poster
pipeline and its three sources, the measured Lighthouse before/after, the
accessibility decisions, the house plate, and the fixture that was watched to
fail. **Read it before touching the facade or adding any third-party embed.**
