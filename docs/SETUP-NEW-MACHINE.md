# Bringing this project up on a fresh Windows machine

**Read when:** moving the project to another PC, or rebuilding this one.

Everything the site *is* lives in git. This document is about the rest: the four
things that are on a developer's machine and not in the repository, and the order
they have to arrive in.

| | What | Where it comes from |
|---|---|---|
| 1 | Toolchain — Node, git, an SSH key | installed, per machine |
| 2 | `node_modules/` | `npm ci` from the committed lockfile |
| 3 | Playwright browsers | `npx playwright install`, ~1.5 GB, machine-wide |
| 4 | `.env.local` and `.env.test` | **gitignored — see §5. This is the only part nothing can regenerate.** |

⚠️ **Nothing else needs regenerating.** The icons, the fonts, `fonts.css`, the
piece sets, the vendored Stockfish build and `agenda.fallback.json` are all
**committed**. Do not run their generator scripts as part of setting up — see §8
for when they are actually needed.

---

## 1. Toolchain

| | Version on the old machine | Minimum |
|---|---|---|
| Node | 24.14.0 | **≥ 22.12** (`package.json` → `engines`) |
| npm | 11.9.0 | whatever ships with Node |
| git | 2.53.0.windows.1 | any recent |

Install Node from nodejs.org (or via `nvm-windows` / `fnm` if you want to hold
several). Git for Windows brings the Bash the scripts assume.

**Verify:**

```sh
node -v      # must print v22.12 or later
npm -v
git --version
```

## 2. Git identity and SSH

The remote is **SSH**, not HTTPS: `git@github.com:nachi3d/Mogador-Chess-Club-Website.git`.

⚠️ **An SSH key is per machine and is not copied.** Generate a new one and add
the public half to GitHub → Settings → SSH keys. Copying `~/.ssh/id_ed25519`
across is possible but means one key on two machines, which is the thing key
rotation exists to avoid.

```sh
ssh-keygen -t ed25519 -C "nachiketas3d@gmail.com"
# then paste ~/.ssh/id_ed25519.pub into GitHub

git config --global user.name  "nachi3d"
git config --global user.email "nachiketas3d@gmail.com"
```

⚠️ **Commits are authored as `nachi3D` only** — no `Co-Authored-By` lines, ever.
See CLAUDE.md → Conventions → Git.

**Verify:**

```sh
ssh -T git@github.com          # "Hi nachi3d! You've successfully authenticated"
```

## 3. Clone

```sh
git clone git@github.com:nachi3d/Mogador-Chess-Club-Website.git
cd Mogador-Chess-Club-Website
git checkout dev
```

Line endings need no configuration: `.gitattributes` pins `* text=auto eol=lf`,
which wins over whatever `core.autocrlf` is set to. Development is on Windows and
Cloudflare builds on Linux; without that pin every diff from the Linux side is a
whole-file rewrite.

**Verify:**

```sh
git status                     # clean
git log --oneline -1           # the tip of dev
```

## 4. Dependencies

```sh
npm ci
```

⚠️ **`npm ci`, not `npm install`** — `package-lock.json` is committed and `ci`
installs exactly it. `install` is free to move versions, which is not what you
want on the first run of a machine you are trying to make identical.

**Verify:**

```sh
npx astro --version
node scripts/check-content.mjs     # replays every PGN and exercise — green
node scripts/check-contrast.mjs    # 275 contrast assertions — green
```

Both of those run without credentials, without browsers, and without a build.
If they pass, the repository half of the machine is correct.

## 5. Secrets — the two env files

**These are the only irreplaceable things.** Neither is in git; neither can be
regenerated from the repo. Each has a committed template beside it.

⚠️ **`.env.local` comes from `.env.example`. `.env.test` comes from
`.env.test.example`.** Using the wrong template has cost `SUPABASE_PRODUCTION_REF`
twice — see CLAUDE.md → the test-environment interlock. The tell that a `.env.test`
came from the wrong template is a commented-out `PUBLIC_UMAMI_WEBSITE_ID` at the
bottom: analytics has nothing to do with testing, and that line only exists in
the other file.

### `.env.local` — the **production** Supabase project

```sh
cp .env.example .env.local
```

| Variable | Where the value comes from | Read by |
|---|---|---|
| `PUBLIC_SUPABASE_URL` | Supabase dashboard → **production** project → Settings → API | `fetch-agenda.mjs`, `src/lib/supabase.ts` |
| `PUBLIC_SUPABASE_ANON_KEY` | same page. **Public by design** — it ships in every bundle | as above |
| `PUBLIC_UMAMI_WEBSITE_ID` | Umami dashboard. **Optional**; unset omits the snippet entirely | `src/components/Analytics.astro` |

⚠️ **Never put `PUBLIC_AUTH_ENABLED` or `PUBLIC_FIXTURES` in `.env.local`.** The
default build on a developer's machine must stay the shape production ships. Both
are turned on deliberately, per command — `npm run demo:accounts`,
`PUBLIC_FIXTURES=true npm run demo`.

#### ⚠️⚠️ THREE VARIABLES ARE IN THE OLD `.env.local` AND MUST NOT BE COPIED

The old machine's `.env.local` carries `SUPABASE_SERVICE_ROLE`,
`SUPABASE_PASSWORD` and `WEBHOOK_URL` in addition to the two above. **Do not carry
any of them across.** The correct new `.env.local` has the two `PUBLIC_*` keys and
nothing else.

| Variable | Why it must not travel |
|---|---|
| `SUPABASE_SERVICE_ROLE` | ⚠️ **Production, and it bypasses RLS entirely.** Nothing in this repository reads it from `.env.local` — the e2e suite reads `TEST_SUPABASE_SERVICE_ROLE` from `.env.test`, and no build, script or spec ever wants the production one. `.env.example` states the rule in its own header: *"The SERVICE ROLE key is NOT here and must never be."* The file on the old machine contradicts its own template |
| `SUPABASE_PASSWORD` | ⚠️ **Production database password.** Also unread — `scripts/db-push.mjs` takes `TEST_SUPABASE_PASSWORD` from `.env.test`, and `db-push.mjs` refuses production by design |
| `WEBHOOK_URL` | ⚠️ **Nothing in the repository reads it at all.** The Cloudflare deploy hook lives in **Supabase Vault** as `cloudflare_deploy_hook`, read only by `request_site_rebuild()` (Critical Feature 68). A copy in a dotfile is a second home for a credential that is supposed to have exactly one |

**The rule for all three: fetch from the dashboard when a hand-run task needs
them, use them in the shell, and delete them after.** They are not configuration;
they are credentials borrowed for one job.

⚠️ **This matters more than it looks.** A production service-role key sitting in a
file that no build reads is the worst of both worlds: it earns nothing, and it is
one `git add -f` or one screen-share away from being public — in a repository that
**is** public. The reason it went unnoticed for so long is exactly that nothing
depends on it, so nothing ever fails to remind you it is there.

⚠️ **`.env.local` does not reach `scripts/fetch-agenda.mjs`.** That script is a
plain Node process reading `process.env`, run *before* `astro build`, and there is
no `dotenv` dependency — Astro's dotenv loading feeds `import.meta.env` inside the
Astro build and reaches it never. A normal `npm run build` on a developer machine
therefore bakes the **committed fallback agenda** and says so in yellow. That is
correct and expected; see `docs/reference/deployment.md`.

### `.env.test` — the **test** Supabase project

```sh
cp .env.test.example .env.test
```

| Variable | Where the value comes from |
|---|---|
| `TEST_PUBLIC_SUPABASE_URL` | Supabase dashboard → **test** project → Settings → API |
| `TEST_PUBLIC_SUPABASE_ANON_KEY` | same page |
| `TEST_SUPABASE_SERVICE_ROLE` | same page, "service_role". ⚠️ **Bypasses RLS.** Test project only, never production |
| `TEST_SUPABASE_PASSWORD` | Supabase dashboard → test project → Settings → Database. Needed by `npm run db:push` and the seed script; optional for the suite itself |
| `SUPABASE_PRODUCTION_REF` | **Already filled in by the template.** Not a secret — a project ref is the subdomain of a public URL |
| `E2E_EMAIL_DOMAIN` | Optional; defaults to `mcc-e2e.test` |
| `TEST_SUPABASE_DB_HOST` | Optional; short-circuits the pooler-host probe in `db-push.mjs` |

⚠️ **`SUPABASE_PRODUCTION_REF` is a safety interlock, not documentation.**
`assertNotProduction()` runs at Playwright config load and aborts the entire run if
the resolved test ref equals it. The suite creates users and **purges by pattern**;
pointed at production it would delete real accounts. It **fails closed** — an
unconfigured checkout cannot accidentally run against anything.

⚠️ **The production ref begins with `vtest` and is nevertheless production.** Read
the ref, never the vibe of the ref.

**Verify:**

```sh
node -e "console.log(require('fs').existsSync('.env.local'), require('fs').existsSync('.env.test'))"
npm run db:push -- --dry-run       # resolves the TEST project, and refuses production
```

### Secrets that are **not** on this machine at all

| Secret | Lives in | Notes |
|---|---|---|
| Cloudflare **deploy hook URL** | **Supabase Vault**, as `cloudflare_deploy_hook` | Read only by `request_site_rebuild()`. ⚠️ **Never a table, never `.env`, never a migration — this repository is public.** No secret means *no dispatch*, not an error |
| Cloudflare **build variables** | Cloudflare dashboard → Workers → Settings | `PUBLIC_SUPABASE_URL`, `PUBLIC_SUPABASE_ANON_KEY`, `PUBLIC_AUTH_ENABLED` (**on in production**), optional `PUBLIC_UMAMI_WEBSITE_ID`. ⚠️ **Never the service role key** |
| Cloudflare **account credentials** | `npx wrangler login`, browser OAuth | Per machine — see §7 |
| Supabase **production** service role / db password | Supabase dashboard | ⚠️ Not needed by any build, script or test. Fetch it when you need it rather than parking it in a file |

⚠️ **`PUBLIC_AUTH_ENABLED` is ON in production and nothing in this repository says
so.** The repo default is `false` and always will be. A session that reasons from
the default will get every conclusion about the live site wrong — ask the
deployment, not the default.

## 6. Playwright browsers

The suite runs five projects: **chromium, firefox, webkit, pixel-5, iphone-13**
(the last two reuse the chromium and webkit builds).

```sh
npx playwright install chromium firefox webkit
```

⚠️ **The browsers are machine-wide, not per project** — ~1.5 GB, shared with every
other Playwright project on the box. Do not copy them across machines; the versions
are pinned to `@playwright/test` and `install` fetches exactly the right ones.

### Optional: moving the browser cache off C:

On the old machine `PLAYWRIGHT_BROWSERS_PATH` was set to `D:\AppData\ms-playwright`
to keep 1.5 GB off the system drive. **This is per-machine preference, not a project
requirement** — everything works with the default cache under `%LOCALAPPDATA%`.

If you do move it, set it **before** installing, as a *user* environment variable so
every shell sees it:

```powershell
[Environment]::SetEnvironmentVariable('PLAYWRIGHT_BROWSERS_PATH','D:\AppData\ms-playwright','User')
# open a new terminal, then: npx playwright install chromium firefox webkit
```

⚠️ **`scripts/demo.mjs` already handles both.** Its orphan sweep reads
`PLAYWRIGHT_BROWSERS_PATH` first, falls back to `%LOCALAPPDATA%\ms-playwright`, and
matches the bare `ms-playwright` path segment as belt-and-braces. A sweep that
assumed the documented default would search an empty directory, find nothing, and
report success — which is the failure mode that file exists to avoid.

**Verify:**

```sh
npx playwright --version
npm run test:branch -- --all       # chromium only, every spec
```

## 7. Deploy and database tooling

Neither is a project dependency. Both are per-machine.

```sh
npx wrangler login          # browser OAuth against the Cloudflare account
```

⚠️ **`wrangler` stays out of `package.json` on purpose** — invoked with `npx`, to
keep its transitive advisories out of every install. `wrangler.jsonc` must exist:
with no config present wrangler detects an Astro project and runs
`astro add cloudflare`, installing an adapter incompatible with Astro 7 — and it
fails during *deploy* rather than during *build*, where nobody is looking.

The **Supabase CLI** is installed globally (2.95.4 on the old machine). It is only
needed for `supabase db push`; `scripts/db-push.mjs` wraps it and **refuses
production by design**.

**Verify:**

```sh
npx wrangler whoami
npx wrangler deployments status     # names the live deployment
supabase --version
```

## 8. Generated assets — check, do **not** regenerate

All of these are **committed**. They are listed here so that if one is ever
*missing*, you know what makes it — not as a setup step.

| Asset | Committed? | Regenerated by | Needs |
|---|---|---|---|
| `public/icons/` (6 files) | ✅ | `node scripts/build-icons.mjs` | `sharp` (a devDependency) |
| `public/fonts/` (10 files) + `src/styles/fonts.css` | ✅ | `node scripts/build-fonts.mjs` | the five `@fontsource-variable/*` packages (dependencies) |
| `public/pieces/` (5 files) | ✅ | `node scripts/build-pieces.mjs` | `vendor/pieces/`, also committed |
| `public/engine/stockfish.{js,wasm}` (3.7 MB) | ✅ | `node scripts/build-engine.mjs` | ⚠️ **`npm install --no-save stockfish@11.0.0` first** — transient, never a dependency |
| `public/video/` posters | ✅ | `node scripts/fetch-video-posters.mjs` | `sharp`, and it reaches YouTube |
| `src/data/agenda.fallback.json` | ✅ | by hand | — |
| `src/data/agenda.json` | ❌ **gitignored** | `npm run agenda`, and every `npm run build` | falls back to the committed snapshot without credentials |

⚠️ **None of these is part of `npm run build`** (except `fetch-agenda.mjs`). Their
outputs are committed precisely so a Cloudflare build needs no image toolchain, no
font packages at build time, and no reach to Google. Ignoring them would ship a site
with no icons and no typography.

⚠️ **`src/data/agenda.json` being absent is normal on a fresh clone.** The first
build writes it. It is gitignored because a test run bakes the *test* project into
it, and `git add -A` would then ship test sessions as the production fallback.

**Verify:**

```sh
git status --porcelain     # empty. If a generator "regenerated" something into a
                           # diff, you have a byte-level difference to explain,
                           # not a fix to commit.
```

## 9. The full local gate

Now prove the machine end to end, in this order:

```sh
npm run demo               # sweeps stale servers, builds, serves, prints the checklist
```

⚠️ It **stops dead if the build fails** and prints the branch, the last commit, the
URL and the path to `docs/MANUAL-TESTS.md`. Do not hand-run `build && preview`.

⚠️ **Kill it when you are done.** A stale listener makes Playwright's
`reuseExistingServer` skip its own build and test whatever is on disk from before,
so a fixed bug keeps "failing". One preview ran for 4h28m before anyone noticed.

Then:

```sh
node scripts/check-claude-md.mjs   # CLAUDE.md under its size limit
npm run test:branch -- --all       # chromium, every spec
```

**Verify:** `test:branch` green. That is the per-session bar, and it is enough to
merge to `dev`. The full matrix (`npm run test:release`, ~65–70 min **per flag
shape**) is **promotion only** — do not run it on a feature branch to be safe.

## 9a. ⚠️ Before a matrix run — quiet the machine first

**Read when:** about to run `npm run test:release` on this Dell laptop.

`test-release.mjs` runs each project at `--workers=3` and samples free RAM
throughout, printing the trough per project. Its own threshold is explicit:
**under ~2 GB, believe the browser was starved**; comfortably above it, a
failure needs a real diagnosis. That threshold is only useful if the machine
starts quiet — and this one does not.

### What it cost, measured (2026-08-20, both shapes, 10 project-runs)

| | Previous machine | This machine |
|---|---|---|
| Total RAM | 15.85 GB | 15.69 GB |
| Trough range across projects | **3.85 – 6.43 GB free** | **0.39 – 2.14 GB free** |
| Projects tripping the under-3 GB warning | none | **all ten** |
| firefox, accounts OFF | — | 23.2 min |
| firefox, accounts ON | — | **2.1 hours** |
| Matrix wall-clock | ~65–70 min/shape | **115.6 min OFF, 172.1 min ON** |

⚠️ **Total RAM is comparable; AVAILABLE RAM is not.** At the trough, **15.05 of
15.69 GB was committed**. Free RAM never exceeded ~4.5 GB in any sample of any
project, so the machine began each run roughly 11 GB down.

⚠️ **THE TELL THAT IT IS THRASHING RATHER THAN MERELY BUSY:** the memory sampler
is a 2-second `setInterval` doing one `os.freemem()` and one `appendFileSync`.
During the accounts-ON firefox project it produced ~288 samples in 110 minutes —
**one every ~23 seconds**. When a timer that trivial misses its deadline by 10×,
the scheduler is not keeping up, and every Playwright timeout in the run is
being measured against a clock the browser cannot meet.

⚠️ **WHAT STARVATION LOOKS LIKE IN THE RESULTS, AND WHY IT IS EXPENSIVE:** it
does not fail with an assertion. It fails with `Test timeout of 30000ms
exceeded`, `Tearing down "context" exceeded…`, or a `browserContext.close`
protocol error — **bare timeouts naming no value**. Each one has to be cleared
by a serial `--workers=1` re-run before promotion, because a genuine failure and
a starved one are indistinguishable from the summary alone. On 2026-08-20 that
cost two extra arbiter runs in the OFF shape to establish that one webkit
failure and four flakes were all the machine, not the site.

### The list — what to close, and what each returns

Working-set figures are a single sample taken **during** the accounts-ON matrix,
via `Get-CimInstance Win32_Process`. Treat each as **approximately** what
closing it returns: some pages are shared, and Windows reclaims lazily.

| Close / pause | Processes | Working set | Notes |
|---|---|---|---|
| **OneDrive — pause syncing** | `OneDrive.exe`, `OneDrive.Sync.Service.exe` | **723 MB** | ⚠️ **The repo lives under `OneDrive\Documents`**, so a build writing thousands of files into `dist/` and `test-results/` is also a sync workload. Pause for the duration; do not sign out |
| **Dell TechHub** | 6 processes (`Instrumentation.SubAgent`, `Diagnostics`, `Analytics`, `DataManager`, `Instrumentation.UserProcess`, `TechHub`) | **1044 MB** | The largest single family, and none of it is needed to run a test suite |
| **Dell SupportAssist** | `SupportAssistAgent.exe`, `DellSupportAssistRemedationService.exe` | **513 MB** | Scheduled scans can start mid-run, which is worse than the resident cost |
| **Waves audio** | `WavesSysSvc64.exe`, `WavesSvc64.exe`, `WavesAudioService.exe` | **433 MB** | Audio enhancement. ⚠️ Headless WebKit has no Web Audio anyway — see `docs/reference/motion-sound.md` |
| **Defender** — exclude the repo + `%LOCALAPPDATA%\ms-playwright` | `MsMpEng.exe` | 412 MB | ⚠️ **Add a path exclusion; do not disable Defender.** The cost is mostly scanning every file a build writes, not the resident size |
| **`ServiceShell.exe`** | 1 process | **973 MB** | ⚠️ **UNIDENTIFIED — the largest single consumer, and its path was unreadable without elevation.** Identify it (`Get-CimInstance Win32_Process` from an elevated shell) **before** deciding anything. Do not kill a 973 MB process you cannot name |

**Together the identified entries are ~3.1 GB**, and ~4.1 GB including
`ServiceShell`. That is the difference between troughs of 0.39 GB and troughs in
the range the previous machine sustained.

⚠️ **THIS IS A LIST FOR THIS LAPTOP, NOT A PROJECT REQUIREMENT.** Nothing here
is needed on a machine that already has headroom. The reason it is written down
with numbers is so a future session can *argue* with it — re-measure, and if the
troughs are healthy, skip the whole section.

⚠️ **`--workers=3` IS NOT THE KNOB TO TURN.** See MEASUREMENTS in
`scripts/test-release.mjs`: the alternatives were measured, and lowering it
trades one slow run for a slower one without fixing the baseline. Quiet the
machine instead.

**Verify, before starting the gate:**

```powershell
# free RAM right now — want comfortably more than 3 GB
[math]::Round((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1MB,2)

# and after the run, read the trough the gate printed for each project
```

## 10. Accounts-ON local testing

```sh
npm run demo:accounts              # + `-- --host` to reach it from a real phone
```

⚠️ **Never reconstruct this as `PUBLIC_SUPABASE_URL=… npm run demo`.**
`.env.local` holds the **production** project, because that is what a deploy build
needs. The dangerous mistake is not a build that fails — it is one that *succeeds*
while wired to the live database, where signing in on localhost creates a real
account and nothing announces it. `demo:accounts` reads the **test** credentials
through the same interlock as the e2e suite, and fails closed.

See `docs/LOCAL-ACCOUNTS.md` for seeding, the no-email magic link and becoming a
prof — and its §7 for what is deliberately not built.

**Verify:** `/connexion/` renders, and the magic-link flow lands on `/bienvenue/`.

## 11. Before you decommission the old machine

- [ ] `git push origin dev` — **`dev` was 5 commits ahead of origin** at the time
      this was written. Check again.
- [ ] `git stash list` — empty is what you want.
- [ ] Copy `.env.local` and `.env.test` across **by hand, out of band** — not
      through the repo, not through a chat log. Or re-fetch every value from the
      two Supabase dashboards, which is cleaner.
- [ ] ⚠️ **Copy only the keys §5 lists.** `SUPABASE_SERVICE_ROLE`,
      `SUPABASE_PASSWORD` and `WEBHOOK_URL` are in the old `.env.local` and must
      **not** be carried across — nothing reads them, and two of the three are
      production credentials that bypass RLS. Consider deleting them from the old
      file before it goes anywhere.
- [ ] Confirm `~/.ssh/id_ed25519` is either copied or replaced by a new key
      registered with GitHub.
- [ ] Nothing else. `dist/`, `.astro/`, `node_modules/`, `test-results/`,
      `.wrangler/`, `supabase/.temp/` and `src/data/agenda.json` are all
      reproducible and should **not** be copied.

## 12. What is per-machine and what is copied

| | Per machine — recreate | Copied or re-fetched |
|---|---|---|
| SSH key | ✅ generate a new one | (copying works, but don't) |
| `PLAYWRIGHT_BROWSERS_PATH` | ✅ preference, optional | — |
| Playwright browsers | ✅ `npx playwright install` | ❌ never copy |
| `node_modules/` | ✅ `npm ci` | ❌ never copy |
| `wrangler` login | ✅ `npx wrangler login` | — |
| Supabase CLI | ✅ install globally | — |
| `.env.local` | — | ✅ **from the Supabase + Umami dashboards** |
| `.env.test` | — | ✅ **from the Supabase test project dashboard** |
| Cloudflare build variables | — | ❌ they live in the dashboard, not on any machine |
| Deploy hook URL | — | ❌ it lives in Supabase Vault |

---

## Appendix — the first promotion from the new machine

The promotion gate itself is unchanged and lives in CLAUDE.md. Two of its items are
**claims about the outside world that expire**, and neither lives in this
repository, so nothing here can fail when one drifts:

1. **Production's schema is not behind the repo.** Ask the catalog, per migration
   — ⚠️ **never `supabase_migrations.schema_migrations`**, which listed 0001–0002
   while the schema held everything through 0007. Current as of 2026-08-18:
   **through 0012**.
2. **Cloudflare Workers Builds deploys `main` only**; every other branch runs
   `npx wrangler versions upload`. Verify by output: after a `dev` push,
   `npx wrangler deployments status` has not moved.

⚠️ And `npm run verify:deploy` needs a `dist/` built **from the tree you are asking
about, with the same build variables Cloudflare uses**. The `dist/` left on a
developer machine after a test run is an accounts-ON, fixtures-ON build and is not
that — rebuild before verifying.
