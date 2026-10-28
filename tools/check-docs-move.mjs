/**
 * Checks that moving or merging documentation lost nothing that matters: every
 * number, source URL, `src/` pointer and backticked identifier found in the old
 * files appears somewhere in the new ones. Prose may be rewritten; facts may
 * not vanish.
 *
 * Usage: node tools/check-docs-move.mjs --old <files…> --new <files…>
 * Old files may be given as `git:<ref>:<path>` to read a committed version.
 * Exits 1 when anything is missing, listing each item with the old file it came
 * from.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const split = args.indexOf('--new');
if (args[0] !== '--old' || split < 0) {
  console.error('usage: node tools/check-docs-move.mjs --old <files…> --new <files…>');
  process.exit(2);
}
const oldFiles = args.slice(1, split);
const newFiles = args.slice(split + 1);

function read(spec) {
  const git = spec.match(/^git:([^:]+):(.+)$/);
  if (git) return execFileSync('git', ['show', `${git[1]}:${git[2]}`], { encoding: 'utf8' });
  return readFileSync(spec, 'utf8');
}

/** The facts a documentation file carries, by kind. */
const KINDS = {
  number: /\b\d+(?:[.,]\d+)*\b/g,
  url: /https?:\/\/[^\s)>\]]+/g,
  pointer: /\bsrc\/[\w./-]+/g,
  identifier: /`([A-Za-z_][\w.]*)`/g,
};

function facts(text) {
  const out = {};
  for (const [kind, re] of Object.entries(KINDS)) {
    out[kind] = new Set();
    for (const m of text.matchAll(re)) out[kind].add(m[1] ?? m[0]);
  }
  return out;
}

const haystack = newFiles.map(read).join('\n');
const present = facts(haystack);
let missing = 0;
let total = 0;
for (const file of oldFiles) {
  const found = facts(read(file));
  for (const [kind, items] of Object.entries(found)) {
    for (const item of items) {
      total++;
      if (present[kind].has(item)) continue;
      // A name still named anywhere, such as inside a `src/` pointer, is kept.
      if (kind === 'identifier' && haystack.includes(item)) continue;
      missing++;
      console.log(`missing ${kind}  ${file}  ${item}`);
    }
  }
}
console.log(`${total - missing} of ${total} facts carried over from ${oldFiles.length} old file(s) to ${newFiles.length} new file(s).`);
process.exit(missing > 0 ? 1 : 0);
