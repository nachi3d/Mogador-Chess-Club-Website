# Reference — dev environment and process hygiene

**Read when:** a session starts or ends a long-lived process (`astro preview`, `npm run demo`, a watch), or when a test run behaves as though it is testing something other than what you just built.

> Part of the Mogador Chess Club reference set. The binding rules live in
> [CLAUDE.md](../../CLAUDE.md); this file holds the detail behind them.
>
> ⚠️ This text was split out of CLAUDE.md verbatim, so a phrase like "the rule
> above" or "see the section below" may point at a neighbouring section **here**
> or at the rule it belongs to **in CLAUDE.md**. Nothing was cut; if a reference
> does not resolve on this page, it resolves there.

---

#### ⚠️ KILL EVERY LONG-LIVED PROCESS THE SESSION STARTED

A session that starts a server **terminates it when the task that needed it
ends** — `astro preview`, `npm run demo`, a watch, anything holding a port.

**This is not tidiness.** A stale listener on 4321 is the documented trap that
has already cost real debugging time twice: Playwright's `reuseExistingServer`
silently skips its own build and tests **whatever is on disk from before**, and
`astro preview` quietly moves to 4322 and serves the old build to anyone who
opens the URL they expected. A fixed bug then keeps "failing".

One ran for **4h28m** during the M3 session before anyone noticed.

⚠️ **Stopping the npm wrapper does NOT stop the server.** `npm run preview`
spawns `astro preview` as a child; killing the parent leaves the child holding
the port. Verify the port is actually free, and kill by PID if it is not:

```sh
netstat -ano | grep -E ':432[1-5]'    # NOT `-p tcp` — that is IPv4 only, and
                                      # node binds [::1]. See the note below.
```

```powershell
Stop-Process -Id <pid> -Force
```

#### ⚠️ A PORT LIST IS NOT THE SWEEP. SWEEP BY REPO PATH.

`netstat` on 4321-4325 only answers "is anything on the ports astro walks to
on its own". It says nothing about a server someone started with an explicit
`--port`, and nothing stops anyone doing that.

**Found at the end of the M3-suite session: 26 orphaned
`astro preview --port 4399` processes for this repo, one still listening** —
entirely outside the swept range, and therefore invisible to every previous
run of `npm run demo` and to every session that "checked the ports".

So the real question is *"is anything previewing THIS repo?"*:

```powershell
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -like '*Mogador-Chess-Club-Website*' -and
                 $_.CommandLine -like '*preview*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
```

`scripts/demo.mjs` now does both on startup **and on Ctrl+C** — the port walk,
then `previewsForRepo()`. Three details in that function are load-bearing:

- **Match the repo path AND `preview`.** The path alone kills `astro dev`, a
  Playwright run and the editor's TypeScript server; `preview` alone kills
  another project's server, which is not ours to touch.
- **The wrapper does not carry the path; the server does.** `npx astro preview`
  shows as `…/npx-cli.js astro preview` with the repo only as its cwd, which
  `Win32_Process` does not expose. The path match finds the process that owns
  the socket — which is the one that matters.
- **Its PARENT is taken too, when the parent's own command line also mentions
  `preview`.** Both conditions together mean the pair is one invocation. Without
  this the wrappers pile up: one sweep that killed only the servers left **13**
  husks behind, and a husk per run is how a machine reaches dozens of processes
  nobody can account for.

**PowerShell, not `wmic`** — wmic is deprecated and absent from recent Windows
11 builds, so it fails silently exactly where this matters. And the matching is
done in JS rather than in the query: a path is far easier to compare there than
to quote correctly through two layers of shell.

`npm run demo` doing this on startup is a safety net rather than a substitute:
it protects the next session, not this one.

#### ⚠️ AND THE BROWSERS. A KILLED MATRIX LEAVES ITS BROWSERS RUNNING.

Neither probe above can see them: an orphaned Playwright browser holds no port
and its command line says nothing about this repo. **~60 of them were found on
this machine** during the v0.10.0 promotion, left by a killed `test:release`,
and the next full matrix then failed on five unrelated specs across four
projects — every one of which passed when re-run serially on a clear machine.
Three red gates in a row, and none of them a defect.

`orphanedBrowsers()` in `scripts/demo.mjs` sweeps them, in the same `sweep()`
the previews use — so it runs on startup and on Ctrl+C, with no second routine
to remember.

- ⚠️ **MATCH ON THE EXECUTABLE PATH, NEVER ON THE PROCESS NAME.** `chrome.exe`
  is also the name of Seàn's own browser; killing that would be a far worse bug
  than the one this fixes. On Windows the filter is `ExecutablePath` — the real
  image path, which `Name` and `CommandLine` are not — and it must sit under a
  directory Playwright itself installs into. Verified against a live machine:
  **25 browser-named processes outside the cache were spared** while the
  orphan was taken.
- ⚠️ **`PLAYWRIGHT_BROWSERS_PATH` FIRST — the documented default is often
  wrong.** On this machine it is `D:\AppData\ms-playwright`, nowhere near
  `%LOCALAPPDATA%`. A sweep that assumed the default would search an empty
  directory, find nothing and report success. The bare `ms-playwright` path
  segment is the fallback for a shell where the variable is not exported.
- ⚠️ **ORPHANS ONLY.** A browser whose launcher is still alive belongs to a run
  IN PROGRESS — possibly this repo's own matrix in another terminal, possibly
  another project's, since the browser cache is machine-wide and nothing about
  it is per-repo. Verified: with the launcher alive, **3 browsers were spared**;
  once it was gone, the same shape was swept.
- ⚠️ **Tree roots only, killed with `taskkill /T`.** Chromium is a process tree
  — a renderer, a GPU process and a utility process per browser. Killing the
  top alone leaves the children reparented and running, and listing them
  separately would report sixty kills for six browsers. Verified: one orphan
  reported, **four processes gone**.

Known limit, and it errs the safe way: Windows reuses pids, so a dead
launcher's pid may belong to something live by the time this runs. The orphan
then looks parented and is **left alone**. Under-killing is the right direction
for a routine that runs unattended.
