/**
 * Mogador Chess Club — the CLAUDE.md size guard.
 *
 *   node scripts/check-claude-md.mjs
 *
 * CLAUDE.md is loaded into context on every session and there is a hard limit
 * past which it is TRUNCATED. That failure is silent in the worst possible way:
 * the rules are still in the repository, still correct, still reviewed — and
 * simply not in the session that needed them. Nothing reports it, no test goes
 * red, and the first symptom is a session breaking a rule it never saw.
 *
 * It is not hypothetical. This file reached 247 KB before anyone noticed, which
 * is 1.6x the limit — so roughly the last third of the rules had stopped being
 * read, including the whole deployment and testing policy.
 *
 * So: FAIL at the limit, and WARN well before it, because the fix (splitting a
 * section out to docs/reference/) is cheap at 120 KB and a large refactor at
 * 240 KB.
 *
 * ⚠️ When this warns, SPLIT — do not trim. Move the reasoning to the reference
 * file for that area and leave the rule behind with a pointer saying when the
 * detail matters. A rule deleted to save bytes comes back as a bug.
 *
 * It also checks that every docs/reference/*.md is linked from CLAUDE.md, and
 * that CLAUDE.md links nothing that does not exist — a pointer is the whole
 * mechanism holding the split together, so a broken one is the same class of
 * failure as the truncation it exists to prevent.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/** The hard limit. Past this, the file is silently truncated in session. */
const LIMIT = 150_000;
/** Warn from here, so a split happens while it is still a small change. */
const WARN = 120_000;

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const DIM = '\x1b[2m';
const OFF = '\x1b[0m';

const file = join(ROOT, 'CLAUDE.md');
if (!existsSync(file)) {
  console.error(`${RED}CLAUDE.md is missing.${OFF}`);
  process.exit(1);
}

const text = readFileSync(file, 'utf8');
const size = text.length; // characters, which is what the context limit counts
const pct = Math.round((size / LIMIT) * 100);

// ── the pointers must resolve, both ways ─────────────────────────────────────
const problems = [];

const refDir = join(ROOT, 'docs', 'reference');
const refFiles = existsSync(refDir)
  ? readdirSync(refDir).filter((f) => f.endsWith('.md'))
  : [];

for (const ref of refFiles) {
  if (!text.includes(`docs/reference/${ref}`)) {
    problems.push(
      `docs/reference/${ref} is not linked from CLAUDE.md — a reference file ` +
        `nobody is pointed at is a reference file nobody reads.`,
    );
  }
}

for (const [, link] of text.matchAll(/\]\(\.\/(docs\/[^)#]+)\)/g)) {
  if (!existsSync(join(ROOT, link))) {
    problems.push(`CLAUDE.md links ./${link}, which does not exist.`);
  }
}

// ── report ───────────────────────────────────────────────────────────────────
const human = `${size.toLocaleString('en-US')} characters (${pct}% of ${LIMIT.toLocaleString('en-US')})`;

if (problems.length) {
  console.error(`${RED}✗ CLAUDE.md pointer check failed${OFF}`);
  for (const p of problems) console.error(`  ${p}`);
}

if (size > LIMIT) {
  console.error(`${RED}✗ CLAUDE.md is over the limit — ${human}${OFF}`);
  console.error(
    `\n  Past ${LIMIT.toLocaleString('en-US')} characters the tail of this file is no longer read.\n` +
      `  The rules are in the repo and absent from the session, and nothing else reports it.\n\n` +
      `  ${DIM}Split, do not trim:${OFF} move the reasoning behind a rule into the reference\n` +
      `  file for its area under docs/reference/, and leave the rule in CLAUDE.md with a\n` +
      `  pointer saying when the detail matters.\n`,
  );
  process.exit(1);
}

if (problems.length) process.exit(1);

if (size > WARN) {
  console.warn(`${YELLOW}⚠ CLAUDE.md is approaching the limit — ${human}${OFF}`);
  console.warn(
    `  ${DIM}Split a section out to docs/reference/ now, while it is a small change.${OFF}`,
  );
  process.exit(0);
}

console.log(`${GREEN}✓${OFF} CLAUDE.md ${human}, ${refFiles.length} reference files linked`);
