/**
 * Mogador Chess Club — one command to test the built site by hand.
 *
 *   npm run demo              → build, serve on localhost
 *   npm run demo -- --host    → also expose on the LAN, for testing on a phone
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS. Manual testing here is "build, then preview, then open the
 * checklist" — three steps with one well-documented trap in the middle:
 *
 *   ⚠️ A STALE PREVIEW SERVER WILL SERVE YOU A STALE BUILD.
 *
 * `astro preview` binds 4321, and if something is already there it quietly
 * takes 4322 instead. Playwright is worse: `reuseExistingServer` means it skips
 * its own build entirely and tests whatever that other server is holding. Both
 * have cost real debugging time on this project — a fixed bug that kept
 * "failing" because the old bundle was still being served. So this script
 * clears the port range FIRST, every time, and only then builds.
 *
 * It is deliberately dependency-free: `node:child_process` and `netstat`/`lsof`
 * do the whole job, and a tool whose entire purpose is "make local testing one
 * command" should not itself need an install step to work.
 * ─────────────────────────────────────────────────────────────────────────
 */

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CHECKLIST = join(ROOT, 'docs', 'MANUAL-TESTS.md');

/**
 * `astro preview` wants 4321 and walks upward when it is taken. Clearing the
 * whole walk is the point: freeing only 4321 still lets a forgotten server on
 * 4322 confuse the next run, and it is the SECOND server that is hardest to
 * notice because nothing about it looks wrong.
 *
 * ⚠️ THIS LIST IS NOT THE WHOLE SWEEP, AND CANNOT BE. See `previewsForRepo()`
 * for servers this range cannot see, and `orphanedBrowsers()` for the browsers
 * a killed test run leaves behind — which hold no port at all.
 */
const PORTS = [4321, 4322, 4323, 4324, 4325];

const IS_WINDOWS = process.platform === 'win32';

/* ── Colour ──────────────────────────────────────────────────────────────── */
/* Honour NO_COLOR and non-TTY output so piping this into a file stays readable. */
const COLOUR = process.stdout.isTTY && !process.env['NO_COLOR'];
/* String.fromCharCode(27) rather than a literal escape byte: a raw control
   character in a source file is invisible in review and easily eaten by an
   editor, a formatter or a copy-paste. */
const ESC = String.fromCharCode(27);
const paint = (code, text) => (COLOUR ? ESC + '[' + code + 'm' + text + ESC + '[0m' : text);
const bold = (t) => paint('1', t);
const dim = (t) => paint('2', t);
const red = (t) => paint('31', t);
const green = (t) => paint('32', t);
const yellow = (t) => paint('33', t);
const cyan = (t) => paint('36', t);

const say = (line = '') => process.stdout.write(`${line}\n`);
const step = (n, text) => say(`${dim(`[${n}/4]`)} ${bold(text)}`);

/**
 * Run a real executable and return trimmed stdout, plus whether it worked.
 *
 * ⚠️ NO `shell: true`. It is not just unnecessary here (git, netstat, lsof and
 * taskkill are all real .exe files), it actively breaks things on Windows:
 * Node concatenates the args into a command line rather than escaping them, so
 * `git log -1 --format=%h %s` arrives as two arguments and git exits 128. That
 * is why the commit line printed "(no commits)" on the first run of this
 * script. It also raises DEP0190 on every call.
 *
 * `npm` is the exception and is handled separately — see `runNpm`.
 */
function read(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: 'utf8' });
  return {
    ok: result.status === 0,
    out: String(result.stdout ?? '').trim(),
  };
}

/**
 * Run an npm script.
 *
 * npm is a `.cmd` shim on Windows, and since the CVE-2024-27980 fix Node
 * refuses to spawn `.bat`/`.cmd` without `shell: true`. Passing the whole
 * command as ONE STRING (rather than a command plus an args array) is what
 * keeps that safe and quiet: DEP0190 fires only on the args-array form, and
 * nothing here is interpolated from user input.
 */
const npmCommand = (script, extra = '') => `npm run ${script}${extra ? ` -- ${extra}` : ''}`;

/* ── 1. Branch ───────────────────────────────────────────────────────────── */

const branch = read('git', ['rev-parse', '--abbrev-ref', 'HEAD']).out || '(unknown)';
const lastCommit = read('git', ['log', '-1', '--format=%h %s']).out || '(no commits)';

say();
say(bold('  Mogador Chess Club — local demo'));
say();

if (branch !== 'dev') {
  /* A WARNING, NOT A BLOCK. Testing a feature branch before merging is the
     normal case; being told which one is the point. */
  say(
    `  ${yellow('!')} On branch ${yellow(bold(branch))}, not ${bold('dev')} — ` +
      dim('check this is what you meant to test.'),
  );
} else {
  say(`  ${green('✓')} Branch ${bold(branch)}`);
}

if (!existsSync(CHECKLIST)) {
  say(`  ${yellow('!')} Checklist missing: ${relative(ROOT, CHECKLIST)}`);
} else {
  say(`  ${dim('Checklist')} ${cyan(relative(ROOT, CHECKLIST))}`);
}
say();

/* ── 2. Clear the ports ──────────────────────────────────────────────────── */

/**
 * PIDs listening on `port`.
 *
 * ⚠️ BY PORT, NEVER BY A PID WE REMEMBERED. On Windows `npm run preview` and
 * `npx astro preview` both leave the real server in a GRANDCHILD process:
 * killing the pid we spawned takes down the wrapper and leaves the port held.
 * Asking the OS who actually owns the socket is the only reliable question.
 */
/** Set when the OS refuses to tell us who owns a port — see `probeFailed`. */
let probeFailed = false;

function listenersOn(port) {
  const pids = new Set();

  if (IS_WINDOWS) {
    /**
     * ⚠️ `netstat -ano`, NOT `netstat -ano -p tcp`.
     *
     * On Windows `-p tcp` means IPv4 TCP only; IPv6 is a separate protocol
     * (`tcpv6`) and is filtered straight out. Node — and therefore
     * `astro preview` — binds `[::1]` by default, so the `-p tcp` form shows
     * NOTHING for a running preview server and the whole port-clearing step
     * silently believes the machine is idle.
     *
     * That is not hypothetical: the first run of this script reported
     * "nothing was running", after which astro announced "Port 4321 is in use,
     * trying another one..." and served the build on 4322 — the exact stale
     * server trap this script exists to prevent, reintroduced by the fix for it.
     *
     * Columns: Proto, Local, Foreign, State, PID.
     */
    const { ok, out } = read('netstat', ['-ano']);
    if (!ok) probeFailed = true;
    for (const line of out.split(/\r?\n/)) {
      const columns = line.trim().split(/\s+/);
      if (columns.length < 5) continue;
      const [, local, , state, pid] = columns;
      // Matches both `127.0.0.1:4321` and `[::1]:4321`.
      if (state === 'LISTENING' && local.endsWith(`:${port}`)) pids.add(pid);
    }
  } else {
    // lsof exits non-zero when nothing matches, which is not a failure here.
    const { out } = read('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN']);
    for (const pid of out.split(/\s+/)) if (pid) pids.add(pid);
  }

  pids.delete(String(process.pid));
  pids.delete('0');
  return [...pids];
}

/**
 * Every preview server running out of THIS repo, whatever port it took.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ A PORT LIST CANNOT BE THE WHOLE SWEEP, AND THIS IS WHY.
 *
 * The list above covers the walk `astro preview` does on its own. It does not
 * cover a server someone started with an explicit `--port`, and nothing stops
 * anyone doing that — a session measuring something, a second window, a script
 * avoiding a collision. **26 orphaned `astro preview --port 4399` processes
 * were found on this machine**, one of them still listening, entirely outside
 * the swept range and therefore invisible to every run of this script.
 *
 * They are the same trap: a stale server for this repo, serving a `dist/` from
 * whenever it started. So the sweep asks the real question — "is anything
 * previewing THIS repo?" — instead of the proxy question "is anything on these
 * five ports?".
 *
 * ⚠️ MATCH ON THE REPO PATH **AND** `preview`. Either alone is wrong:
 *   - repo path alone would kill `astro dev`, a Playwright run, an editor's
 *     TypeScript server, this very script;
 *   - `preview` alone would kill another project's preview server, which is
 *     not ours to touch.
 *
 * ⚠️ THE WRAPPER DOES NOT CARRY THE PATH; THE SERVER DOES. `npx astro preview`
 * shows as `…/npx-cli.js astro preview` with the repo only as its cwd — which
 * Win32_Process does not expose — while the process that actually holds the
 * socket is `node …/<repo>/node_modules/…/astro.mjs preview`.
 *
 * So the path match finds the SERVER, and its PARENT is taken too when that
 * parent's own command line also mentions `preview`. Both conditions together
 * mean the pair belongs to one preview invocation; the parent alone would be
 * a terminal, an editor or a shell, and killing those is not ours to do.
 *
 * ⚠️ WITHOUT THE PARENT RULE THE WRAPPERS PILE UP. They hold no socket, so
 * they are not the stale-server trap — but 13 of them were left behind by one
 * sweep that killed only the servers, and a husk per run is how a machine ends
 * up with dozens of processes nobody can account for.
 *
 * Both probes are best-effort: a shell-less spawn of a real executable, and a
 * failure sets `probeFailed` so "could not look" is never reported as "nothing
 * there".
 * ─────────────────────────────────────────────────────────────────────────
 */
function previewsForRepo() {
  const found = new Map(); // pid → command line, for the message

  /* PowerShell rather than `wmic`: wmic is deprecated and is gone from recent
     Windows 11 builds, so it fails silently exactly where this matters. The
     matching is done in JS, not in the query — a path is far easier to compare
     here than to quote correctly through two layers of shell. */
  const probe = IS_WINDOWS
    ? read('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | " +
          'ForEach-Object { "$($_.ProcessId)|$($_.ParentProcessId)|$($_.CommandLine)" }',
      ])
    : read('ps', ['-eo', 'pid=,ppid=,args=']);

  if (!probe.ok) {
    probeFailed = true;
    return found;
  }

  /* Compared case-insensitively and with both separators: Windows reports a
     mix of `N:\repo\...` and `N:/repo/...` in the same command line. */
  const normalise = (text) => text.replace(/\\/g, '/').toLowerCase();
  const root = normalise(ROOT);

  /** Every node process, so a matched server's parent can be looked up. */
  const processes = new Map(); // pid → { parent, command }

  for (const line of probe.out.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = IS_WINDOWS
      ? [trimmed.slice(0, trimmed.indexOf('|')), trimmed.slice(trimmed.indexOf('|') + 1)]
      : [trimmed.slice(0, trimmed.search(/\s/)), trimmed.slice(trimmed.search(/\s/) + 1).trim()];
    const pid = parts[0]?.trim() ?? '';
    const rest = parts[1] ?? '';
    if (!/^\d+$/.test(pid)) continue;

    const cut = IS_WINDOWS ? rest.indexOf('|') : rest.search(/\s/);
    if (cut < 0) continue;
    const parent = rest.slice(0, cut).trim();
    const command = rest.slice(cut + 1).trim();

    processes.set(pid, { parent, command });
  }

  const ours = (pid) => pid !== String(process.pid) && pid !== String(process.ppid);

  for (const [pid, { parent, command }] of processes) {
    if (!ours(pid)) continue;

    const haystack = normalise(command);
    if (!haystack.includes(root)) continue;
    if (!/\bpreview\b/.test(haystack)) continue;

    found.set(pid, command);

    /* The wrapper that spawned it — only when it is plainly part of the same
       preview invocation. */
    const above = processes.get(parent);
    if (above && ours(parent) && /\bpreview\b/.test(normalise(above.command))) {
      found.set(parent, above.command);
    }
  }

  return found;
}

function killPid(pid, tree = false) {
  // Both are real executables; no shell, so no DEP0190 and no arg mangling.
  if (IS_WINDOWS) {
    /* `/T` for a browser: Chromium is a process TREE — one parent and a
       renderer, a GPU process and a utility process per tab. Killing the top
       alone leaves the children reparented and running, which is how a sweep
       "succeeds" and the count barely moves. */
    const args = tree ? ['/F', '/T', '/PID', pid] : ['/F', '/PID', pid];
    spawnSync('taskkill', args, { stdio: 'ignore' });
  } else spawnSync('kill', ['-9', pid], { stdio: 'ignore' });
}

/**
 * Where Playwright keeps its browsers, as lowercase path prefixes.
 *
 * ⚠️ `PLAYWRIGHT_BROWSERS_PATH` FIRST, BECAUSE THE DEFAULT IS OFTEN WRONG.
 * On this machine it is `D:\AppData\ms-playwright` — not under `%LOCALAPPDATA%`
 * at all — so a sweep that assumed the documented default would look in an
 * empty directory, find nothing, and report success. That is the failure mode
 * this whole file exists to avoid.
 *
 * `PLAYWRIGHT_BROWSERS_PATH=0` means "inside node_modules", which lives under
 * ROOT and is therefore already covered by the repo-path prefix.
 *
 * The bare `ms-playwright` segment is the belt-and-braces case: it is
 * Playwright's own directory name wherever the cache is put, so it still
 * matches if the sweep runs in a shell where the variable is not exported.
 * ⚠️ It is a PATH segment, never a process name — see `orphanedBrowsers()`.
 */
function playwrightRoots() {
  const normalise = (text) => text.replace(/\\/g, '/').toLowerCase();
  const roots = new Set([normalise(join(ROOT, 'node_modules'))]);

  const configured = process.env['PLAYWRIGHT_BROWSERS_PATH'];
  if (configured && configured !== '0') roots.add(normalise(configured));

  const home = process.env['USERPROFILE'] ?? process.env['HOME'] ?? '';
  if (IS_WINDOWS) {
    const local = process.env['LOCALAPPDATA'];
    if (local) roots.add(normalise(join(local, 'ms-playwright')));
  } else if (home) {
    roots.add(normalise(join(home, 'Library', 'Caches', 'ms-playwright')));
    roots.add(normalise(join(home, '.cache', 'ms-playwright')));
  }
  return [...roots];
}

/**
 * Playwright browser processes that have been ORPHANED — their launcher is gone.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ⚠️ WHY THIS EXISTS. A killed `test:release` leaves its browsers running.
 * **~60 of them were found on this machine** during the v0.10.0 promotion,
 * alongside a stray preview server, and the next full matrix then failed on
 * five unrelated specs across four projects — every one of which passed when
 * re-run serially on a clear machine. `demo.mjs` swept previews for this repo
 * and nothing swept browsers, so each killed run left the next one slower.
 *
 * ⚠️ MATCH ON THE EXECUTABLE PATH, NEVER ON THE PROCESS NAME.
 * `chrome.exe` is also the name of Seàn's own browser, and killing that would
 * be a far worse bug than the one this fixes. On Windows the filter is
 * `ExecutablePath` — the real image path, which `Name` and `CommandLine` are
 * not — and it must sit under a directory Playwright itself installs into. A
 * Chrome from Program Files can never match; a browser from the
 * `ms-playwright` cache always does.
 *
 * ⚠️ ORPHANS ONLY. A browser whose launcher is still alive belongs to a test
 * run IN PROGRESS — possibly this repo's own matrix in another terminal,
 * possibly another project's, since the browser cache is shared machine-wide
 * and nothing about it is per-repo. Killing those would turn a tidy-up into
 * the thing it is meant to prevent. So a candidate is swept only when its
 * parent pid is no longer in the process table.
 *
 * ⚠️ Only TREE ROOTS are killed — a candidate whose parent is itself a
 * candidate is a renderer, and `taskkill /T` takes it with its parent. Listing
 * renderers separately would report sixty kills for six browsers.
 *
 * Known limit, and it errs the safe way: Windows reuses pids, so a dead
 * launcher's pid can belong to something live by the time this runs. The
 * orphan then looks parented and is LEFT ALONE. Under-killing is the right
 * direction for a routine that runs unattended.
 * ─────────────────────────────────────────────────────────────────────────
 */
function orphanedBrowsers() {
  const found = new Map(); // pid → executable path, for the message

  /* ⚠️ ExecutablePath, not Name and not CommandLine. See the note above. */
  const probe = IS_WINDOWS
    ? read('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        'Get-CimInstance Win32_Process | ' +
          'ForEach-Object { "$($_.ProcessId)|$($_.ParentProcessId)|$($_.ExecutablePath)" }',
      ])
    : read('ps', ['-eo', 'pid=,ppid=,args=']);

  if (!probe.ok) {
    probeFailed = true;
    return found;
  }

  const normalise = (text) => text.replace(/\\/g, '/').toLowerCase();
  const roots = playwrightRoots();
  const isBrowserPath = (path) => {
    if (!path) return false;
    const p = normalise(path);
    /* Under a directory Playwright installs into, and inside the browsers
       cache rather than merely under node_modules — `node.exe` itself lives
       under node_modules on some setups. */
    if (!roots.some((root) => p.startsWith(root)) && !p.includes('/ms-playwright/')) return false;
    return /\/(chrome|chromium|headless_shell|firefox|webkit|playwright|pw_run|node)[^/]*$/.test(p)
      ? !/\/node(\.exe)?$/.test(p)
      : false;
  };

  const live = new Set();
  const rows = new Map(); // pid → { parent, path }

  for (const line of probe.out.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let pid, parent, path;
    if (IS_WINDOWS) {
      const parts = trimmed.split('|');
      [pid, parent] = [parts[0]?.trim() ?? '', parts[1]?.trim() ?? ''];
      path = parts.slice(2).join('|').trim();
    } else {
      const m = /^(\d+)\s+(\d+)\s+(.*)$/.exec(trimmed);
      if (!m) continue;
      [, pid, parent, path] = m;
      /* argv[0] is the executable; a Playwright cache path has no spaces. */
      path = path.split(/\s/)[0] ?? '';
    }
    if (!/^\d+$/.test(pid)) continue;
    live.add(pid);
    rows.set(pid, { parent, path });
  }

  const candidates = new Set(
    [...rows].filter(([, { path }]) => isBrowserPath(path)).map(([pid]) => pid),
  );

  for (const pid of candidates) {
    const { parent, path } = rows.get(pid);
    if (pid === String(process.pid) || pid === String(process.ppid)) continue;
    /* A renderer — its parent is the browser, which is handled on its own. */
    if (candidates.has(parent)) continue;
    /* The launcher is still alive: a run is in progress. Not ours to touch. */
    if (live.has(parent)) continue;
    found.set(pid, path);
  }

  return found;
}

/** The whole sweep: the port walk, then anything previewing this repo. */
function sweep(report = () => {}) {
  let killed = 0;

  for (const port of PORTS) {
    for (const pid of listenersOn(port)) {
      killPid(pid);
      killed += 1;
      report(pid, `holding ${port}`);
    }
  }

  for (const [pid, command] of previewsForRepo()) {
    killPid(pid);
    killed += 1;
    /* The port is the useful half of the line and it is usually right there. */
    const port = command.match(/--port[= ](\d+)/)?.[1];
    report(pid, port ? `previewing this repo on ${port}` : 'previewing this repo');
  }

  /* ⚠️ AND THE BROWSERS. A killed matrix leaves its browsers running, and they
     are invisible to both probes above — they hold no port and their command
     line says nothing about this repo. Sixty of them corrupted a release gate.
     Tree-killed, and only when orphaned; see `orphanedBrowsers()`. */
  for (const [pid, path] of orphanedBrowsers()) {
    killPid(pid, true);
    killed += 1;
    report(pid, `orphaned ${path.split(/[\\/]/).pop()} left by a killed test run`);
  }

  return killed;
}

step(1, 'Clearing stale preview servers and orphaned test browsers');
const cleared = sweep((pid, why) => say(`      ${dim(`killed pid ${pid} ${why}`)}`));
// Windows frees the socket a moment after taskkill returns; binding too soon
// makes astro silently move to the next port, which is the exact trap.
if (cleared > 0) spawnSync(process.execPath, ['-e', 'setTimeout(()=>{},600)']);

const stillHeld = PORTS.filter((port) => listenersOn(port).length > 0);
const stillPreviewing = previewsForRepo();
if (stillPreviewing.size > 0) {
  say(
    `      ${yellow(`! ${stillPreviewing.size} preview process(es) for this repo survived`)} — ` +
      dim(`pids ${[...stillPreviewing.keys()].join(', ')}; check the URL below.`),
  );
}
if (stillHeld.length > 0) {
  say(
    `      ${yellow(`! still in use: ${stillHeld.join(', ')}`)} — ` +
      dim('preview may land on another port; check the URL below.'),
  );
} else if (probeFailed) {
  /* "Could not look" must never be reported as "nothing there". A silent
     probe failure is how a stale server survives this step unnoticed. */
  say(
    `      ${yellow('! could not read the port table')} — ` +
      dim('a stale server may still be running; check the URL below.'),
  );
} else {
  say(`      ${green('✓')} ${dim(cleared === 0 ? 'nothing was running' : 'ports free')}`);
}
say();

/* ── 3. Build ────────────────────────────────────────────────────────────── */

step(2, 'Building');
say(dim('      astro check → astro build → service worker'));
say();

const build = spawnSync(npmCommand('build'), { cwd: ROOT, stdio: 'inherit', shell: true });

if (build.status !== 0) {
  say();
  say(`  ${red(bold('BUILD FAILED'))} — not starting the preview server.`);
  say(
    dim(
      '  Nothing is served, so you cannot accidentally test the previous build.\n' +
        '  Fix the errors above and run `npm run demo` again.',
    ),
  );
  say();
  process.exit(build.status ?? 1);
}

/* ── 4. Serve ────────────────────────────────────────────────────────────── */

/** `npm run demo -- --host` exposes the server on the LAN, for a real phone. */
const wantsHost = process.argv.slice(2).includes('--host');

say();
step(3, 'Starting the preview server');
say();

const preview = spawn(npmCommand('preview', wantsHost ? '--host' : ''), {
  cwd: ROOT,
  shell: true,
  stdio: ['inherit', 'pipe', 'inherit'],
});

let localUrl = '';
let networkUrl = '';
let summaryPrinted = false;

/** Strip ANSI so the URLs can be matched in astro's coloured output. */
/* Anchored on the escape byte, deliberately. A looser pattern like
   `[[0-9;]*m` also matches a bare "m" and would quietly eat the one in a URL
   such as `http://example.com/`. */
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, 'g');
const plain = (text) => text.replace(ANSI, '');

function printSummary() {
  if (summaryPrinted) return;
  summaryPrinted = true;

  const line = '─'.repeat(66);
  say();
  say(dim(`  ${line}`));
  step(4, 'Ready');
  say();
  say(`  ${bold('Open')}       ${cyan(localUrl || 'http://localhost:4321/')}`);

  if (networkUrl) {
    say(`  ${bold('On a phone')} ${cyan(networkUrl)}`);
    say(dim('             (same Wi-Fi; the board must be usable one-handed)'));
  } else {
    say(
      `  ${bold('On a phone')} ${dim('run')} ${cyan('npm run demo -- --host')} ` +
        dim('to expose it on your Wi-Fi'),
    );
  }

  say();
  say(`  ${bold('Branch')}     ${branch === 'dev' ? branch : yellow(branch)}`);
  say(`  ${bold('Commit')}     ${dim(lastCommit)}`);
  say();
  say(`  ${bold('Checklist')}  ${cyan(relative(ROOT, CHECKLIST))}`);
  say(dim('             work through it top to bottom; it is grouped by feature'));
  say();
  say(dim(`  Ctrl+C to stop.`));
  say(dim(`  ${line}`));
  say();
}

preview.stdout.on('data', (chunk) => {
  const text = String(chunk);
  process.stdout.write(text); // let astro's own banner through unchanged

  for (const line of plain(text).split(/\r?\n/)) {
    const url = line.match(/https?:\/\/[^\s]+/)?.[0];
    if (!url) continue;
    if (/local/i.test(line) && !localUrl) localUrl = url;
    else if (/network/i.test(line) && !networkUrl) networkUrl = url;
  }

  // astro prints Local (and Network) together once it is listening.
  if (localUrl) printSummary();
});

/* Ctrl+C must stop the SERVER, not just this script — otherwise the next run
   finds the port held and the whole point of step 1 is undone. */
const stop = () => {
  preview.kill();
  /* The real server can be a grandchild on Windows, and it may not be on a
     swept port at all — the same full sweep as step 1. */
  sweep();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

preview.on('exit', (code) => process.exit(code ?? 0));
