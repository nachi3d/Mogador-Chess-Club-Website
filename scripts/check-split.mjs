#!/usr/bin/env node
/**
 * Prove a CLAUDE.md split lost nothing — line by line.
 *
 * ═════════════════════════════════════════════════════════════════════════
 * ⚠️ THE FAILURE THIS EXISTS TO CATCH IS SILENT, AND IT IS THE SAME ONE THE
 * SIZE GUARD EXISTS FOR.
 *
 * CLAUDE.md reached 247 KB once, past which its tail simply stopped being read:
 * the rules were in the repository and absent from the session, and nothing
 * anywhere reported it. Splitting the file is the remedy — and splitting is
 * itself a chance to make exactly that failure permanent, because a line
 * dropped during a move is indistinguishable from a line that was moved.
 *
 * So: every non-trivial line that leaves CLAUDE.md must be findable, verbatim,
 * somewhere under `docs/`. Anything that is not is either an accident or a
 * DELIBERATE deletion, and a deliberate deletion has to be declared here by
 * hand — which is the point. "Nothing was deleted silently" stops being a claim
 * and becomes a check.
 *
 *   node scripts/check-split.mjs <before.md>
 *
 * ⚠️ IT COMPARES NORMALISED TEXT, NOT BYTES. Leading indentation and internal
 * whitespace change when a block is re-wrapped inside a reference file; the
 * WORDS are what must survive. Blank lines, rules and pure punctuation are
 * skipped because they carry nothing.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const bold = (s) => `\x1b[1m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;

const before = process.argv[2];
if (!before || !existsSync(before)) {
  console.error(red('\ncheck-split: pass the path to the pre-split CLAUDE.md\n'));
  process.exit(1);
}

/**
 * Lines that may vanish without being moved, because they carry no rule.
 *
 * ⚠️ THIS LIST IS DELIBERATELY TINY. Every entry is a licence to lose
 * something, so it holds only structural noise — never prose.
 */
const TRIVIAL = [
  /^\s*$/,
  /^[-=─═|+*#>`\s.:]*$/u, // rules, table separators, fence markers, bare punctuation
  /^\s*\|[-\s|:]*\|\s*$/, // markdown table separator rows
];

const isTrivial = (line) => TRIVIAL.some((re) => re.test(line));

/** Whitespace-insensitive, so a re-wrapped block still matches. */
const norm = (s) => s.replace(/\s+/gu, ' ').trim();

/**
 * Declared, deliberate removals.
 *
 * ⚠️ ANYTHING ADDED HERE MUST BE REPORTED TO THE READER, not just silenced. A
 * line is listed here only when it is genuinely obsolete — it describes a state
 * of the world that no longer exists — and the reason belongs in the CHANGELOG
 * beside it.
 */
const OBSOLETE = readObsolete();

function readObsolete() {
  const p = join(ROOT, 'docs', 'reference', '.split-obsolete.txt');
  if (!existsSync(p)) return [];
  return readFileSync(p, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.trimStart().startsWith('#'))
    .map(norm);
}

/** Every markdown file under docs/, plus the new CLAUDE.md. */
function corpus() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (entry.name.endsWith('.md')) out.push(readFileSync(p, 'utf8'));
    }
  };
  walk(join(ROOT, 'docs'));
  out.push(readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8'));
  return out.join('\n');
}

const beforeLines = readFileSync(before, 'utf8').split('\n');
const afterClaude = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
const haystack = new Set(corpus().split('\n').map(norm));
const afterClaudeSet = new Set(afterClaude.split('\n').map(norm));

const missing = [];
let moved = 0;
let kept = 0;

for (const [i, line] of beforeLines.entries()) {
  if (isTrivial(line)) continue;
  const n = norm(line);
  if (afterClaudeSet.has(n)) {
    kept += 1;
    continue;
  }
  if (haystack.has(n)) {
    moved += 1;
    continue;
  }
  if (OBSOLETE.includes(n)) continue;
  missing.push({ line: i + 1, text: line.trim() });
}

const beforeChars = readFileSync(before, 'utf8').length;
const afterChars = afterClaude.length;

console.log(`\n${bold('▸ check-split')}  ${dim('— did the split lose anything?')}\n`);
console.log(
  dim(
    `  CLAUDE.md ${beforeChars.toLocaleString()} → ${afterChars.toLocaleString()} chars ` +
      `(${Math.round((1 - afterChars / beforeChars) * 100)}% smaller)`,
  ),
);
console.log(dim(`  ${kept} line(s) stayed · ${moved} moved into docs/ · ${OBSOLETE.length} declared obsolete\n`));

if (missing.length > 0) {
  console.error(red(`  ✗ ${missing.length} line(s) are in NEITHER CLAUDE.md nor docs/:\n`));
  for (const m of missing.slice(0, 40)) {
    console.error(red(`    ${String(m.line).padStart(5)}  ${m.text.slice(0, 108)}`));
  }
  if (missing.length > 40) console.error(dim(`    … and ${missing.length - 40} more`));
  console.error(
    yellow(
      '\n  Either move them, or declare them in docs/reference/.split-obsolete.txt\n' +
        '  AND say so in the CHANGELOG. Silence is the one option that is not available.\n',
    ),
  );
  process.exit(1);
}

console.log(green('  ✓ Nothing was lost — every line is in CLAUDE.md or under docs/.\n'));
