# Mogador Chess Club — UI structure: containment, forms, rhythm

Seàn compared the site against Mogador Games Club and named what is missing. It is **not** the palette — the four themes, the AA guarantees and the old-chess-club identity all stay. What is missing is **containment**: on Games Club every group of content lives inside a closed card whose surface differs from the page behind it. On Chess, everything floats on one background and nothing tells you where a block begins or ends.

The two screenshots that prompted this: `/compte/` (blocks with no boundaries, 40px and 200px gaps with no reason, three different treatments for three cards) and `/admin/seances/` (a ten-field form stacked with no grouping, tiny labels glued to their inputs, session cards with two same-weight buttons and crushed information).

**Do not import Games Club's colours, roundness or blue.** Import the structure.

---

## 1 — Cards are closed objects

Today: a thick gold left border and nothing else, or nothing at all. The block bleeds into the page.

A card must be:
- a **surface distinct from the page behind it** — the token layer already has `--mcc-surface-raised`; use it, and check it reads as raised in all four themes, light and dark
- **fully bordered**, not edge-marked. A left border closes nothing.
- generous radius, a real shadow, consistent internal padding
- one card component. Audit for duplicates first — this codebase has shipped `--mcc-border` and `--font-mono` as phantom tokens and `.btn-primary` defined seven times, all from copies drifting. Consolidate rather than add another.

The gold left border may survive as an **accent on one card per page** (the primary action), never as the general treatment.

## 2 — Form fields are objects, not lines

Today: thin rectangles, tiny labels glued to them, ten of them stacked identically.

- Taller inputs with a **distinct filled background**, generous radius, real padding
- Label above with air between, at a readable size — not 11px grey
- Help text below the field it belongs to, visually subordinate
- **Group the fields.** `/admin/seances/`'s ten fields are three groups: *quand* (date, durée, répétition), *quoi* (intitulé, lieu, niveau, âge), *combien* (places, marge). Each group in its own card or under its own subheading.
- Selects styled like inputs, not like browser defaults

## 3 — The primary button fills its container

Today it is the width of its text and sits wherever the flow left it.

- Primary action: **full width of its card**, tall, unmistakable
- One primary per card. Secondary actions are visually quieter — outline or text, never the same weight
- Session cards currently show *Modifier* and *Annuler la séance* at identical weight; destructive is never equal to routine
- E1's press feedback applies to cards and form controls, not only buttons

## 4 — Sections have headers, and the page has rhythm

Games Club marks every section with a small icon, a rule, a title and a grey subtitle. Chess runs headings together with nothing between them.

- A section header component: icon, title, one-line subtitle, a rule
- **Constant vertical rhythm** between cards. Pick the spacing scale, put it in tokens, and use it — the current 40px/200px variation is accidental
- Page title block: title, one-line description, then content. Not a paragraph floating above a void.

## 5 — The two worst pages, in order

**`/admin/seances/`** is the priority. It carries the creation form, the attendance register and the session list on one page with no separation. Give each its own section with a header, and consider whether the creation form belongs behind a "Nouvelle séance" affordance rather than always open above the list a prof came to read.

**`/compte/`** second: profiles, settings and danger zone as three properly contained cards with the rhythm above.

Then the rest: `/agenda/`, `/admin/eleves/`, `/parametres/`, `/connexion/`, `/bienvenue/`.

---

## Constraints — none of these move

- **Four themes, light and dark.** Every new surface pair goes through `check-contrast.mjs`. Remember it cannot see an alpha applied over an audited pair — that regression has happened here before.
- **The board stays sober.** This is about the page around it.
- AA contrast, `prefers-reduced-motion`, zero third-party requests, no new dependencies, no GSAP.
- Mobile-first: the admin pages are used on a phone in a room at Dar Souiri. Verify at 360px and 390px, and report the numbers.
- Desktop must not regress.
- Lighthouse ≥ 90 mobile — report before/after.

## Tests

`npm run test:branch`, both flag shapes with a rebuild between. Existing specs assert content and structure; if a spec breaks because markup moved, fix the spec **only** when the assertion still says what it said before — do not weaken a check to fit a redesign.

Axe clean on every touched page, four themes, both locales. Touch targets ≥ 48px on admin surfaces at 360px.

## Finish

CLAUDE.md (the card, form-field and section-header rules, as rules — this is the fourth time a component has drifted into duplicates), BACKLOG, MANUAL-TESTS.md ("on a phone, can a prof create a session and mark a register without hunting?"), CHANGELOG.

`claude/ui-containment` → dev `--no-ff`. No promotion.

**Report:** the components consolidated and how many duplicates were found, the measured mobile widths, Lighthouse before/after, and anything you judged should look different from this brief with your reasoning.
