# Vendored chess piece sets — provenance and licences

These SVGs are **third-party artwork**, vendored here rather than installed,
and they are the input to `scripts/build-pieces.mjs` (which emits
`public/pieces/<set>.css`). Nothing else in the repo reads them.

They are vendored for the same reason Stockfish is: an npm dependency that
exists only to be copied once is a dependency the CI install pays for on every
run. Committing the twelve files per set keeps `npm ci` unchanged and keeps the
artwork under review like any other asset.

## ⚠️ Every set here was licence-checked individually, and most were rejected

Lichess publishes ~40 piece sets. **The great majority are NOT usable by this
project** — `CC BY-NC-SA` (non-commercial), "freeware", "free for personal non
commercial use", or no stated licence at all. This repo is
**GPL-3.0-or-later**, and the GPL forbids adding restrictions beyond its own,
so a non-commercial or no-derivatives clause makes a set undistributable here
regardless of how good it looks.

`AGPLv3+` sets (`letter`, `pirouetti`, `pixel`) were also rejected. They are
free software and not a licensing *conflict*, but §13 adds an obligation the
repo does not currently carry, and taking it on would change the licence
statement on `/mentions-legales/`. That is a project-level decision, not a
session-level one. `pixel` in particular would have suited the Terminal theme;
it is left on the table deliberately rather than quietly adopted.

**If you add a set: check its licence at source, record it below verbatim, and
add it to `site.legal.attributions`. If the licence is unclear, drop the set.**

## The four sets shipped

Source for all four: the [lila](https://github.com/lichess-org/lila) repository,
`public/piece/<set>/`. The licence column is quoted verbatim from
[`lila/COPYING.md`](https://github.com/lichess-org/lila/blob/master/COPYING.md).

| Set | Author | Licence (verbatim from lila `COPYING.md`) | Used by theme |
|---|---|---|---|
| `cburnett` | Colin M.L. Burnett | `GPLv2+` | Terminal |
| `merida` | Armando Hernandez Marroquin | `GPLv2+` | Bois |
| `chessnut` | Alexis Luengas | `Apache 2.0` | Souiri |
| `kiwen-suwi` | neverRare | `CC BY 4.0` | Marbre |

All four are compatible with GPL-3.0-or-later distribution:

- **GPLv2+** — the `+` is what matters. GPLv2-only would conflict; "or later"
  lets the work be taken under GPLv3.
- **Apache 2.0** — one-way compatible with GPLv3 (not with GPLv2, which is why
  the repo being GPL-3.0-**or-later** rather than GPLv2 matters here).
  Verified independently at
  <https://github.com/LexLuengas/chessnut-pieces/blob/master/LICENSE.txt>.
- **CC BY 4.0** — one-way compatible with GPLv3. Attribution is the whole
  obligation, and it is met on `/mentions-legales/`.

`cburnett` is additionally published by its author on Wikimedia Commons under
CC BY-SA 3.0 / GFDL / BSD. Both statements are true — it is multi-licensed —
and `/mentions-legales/` has always credited the Wikimedia terms because the
set arrived through `chessground.cburnett.css`. That prose is unchanged.

## Re-vendoring

    curl -s -o vendor/pieces/<set>/<piece>.svg \
      https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/<set>/<piece>.svg

Twelve pieces per set: `wP wN wB wR wQ wK bP bN bB bR bQ bK`.
Then re-run `node scripts/build-pieces.mjs` and commit both.

⚠️ A set whose directory holds only six files (`mono`, for instance) colours
one shared SVG per side in CSS. `build-pieces.mjs` does not support that shape
and fails loudly rather than emitting six broken rules — see the script.
