/**
 * Checks every relative link in the Markdown documentation and fails if one
 * points at a file that is not there.
 *
 * A documentation set rots quietly: a file is renamed, the links to it still
 * read fine, and nothing complains until someone follows one. This is the
 * cheapest possible guard against that.
 *
 * Usage: node tools/check-doc-links.mjs
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ROOTS = ['docs', '.'];
const SKIP = new Set(['node_modules', 'dist', '.git', 'Road Guides']);

/** Every .md file worth checking: all of docs/, plus the root-level ones. */
function markdownFiles(dir, recurse) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (recurse) out.push(...markdownFiles(path, true));
    } else if (entry.name.endsWith('.md')) {
      out.push(path);
    }
  }
  return out;
}

const files = [
  ...markdownFiles(join(ROOT, 'docs'), true),
  ...markdownFiles(ROOT, false),
];

/** `[text](target)` — captures the target, which may carry a #fragment. */
const LINK = /\[[^\]]*\]\(([^)]+)\)/g;

const broken = [];
for (const file of files) {
  const body = readFileSync(file, 'utf8');
  for (const [, target] of body.matchAll(LINK)) {
    // External links and bare fragments are not ours to check.
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const path = decodeURIComponent(target.split('#')[0]);
    if (!path) continue;
    const resolved = resolve(dirname(file), path);
    if (!existsSync(resolved)) {
      broken.push({ file: relative(ROOT, file), target });
      continue;
    }
    // A link to a directory only works if it has something to render.
    if (statSync(resolved).isDirectory() && !existsSync(join(resolved, 'README.md'))) {
      broken.push({ file: relative(ROOT, file), target: `${target} (directory, no README.md)` });
    }
  }
}

if (broken.length > 0) {
  for (const { file, target } of broken) console.error(`broken link  ${file}  ->  ${target}`);
  console.error(`\n${broken.length} broken link(s) across ${files.length} files.`);
  process.exit(1);
}

console.log(`ok — every relative link resolves, across ${files.length} markdown files.`);
