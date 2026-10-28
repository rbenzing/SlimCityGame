/**
 * Checks the Markdown documentation. A relative link that points at a file
 * that is not there fails the run, and so does a rule id defined twice or
 * cited but never defined. So does a file over its size budget under
 * docs/truths/, docs/specs/ or docs/world-sim/road-model/, and a spec
 * without its card. Two further passes only warn: other files over budget,
 * dates written into a specification, and a sentence repeated in two files.
 *
 * A documentation set rots quietly: a file is renamed, the links to it still
 * read fine, and nothing complains until someone follows one. This is the
 * cheapest possible guard against that.
 *
 * Usage: node tools/check-docs.mjs
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

/** A rule is defined once, as `- [R-<area>-<nnn>]` opening a line of docs/truths/*.md; every citation must name one. */
const RULE_ID = /\[(R-[a-z]+-\d{3})\]/g;
const DEFINITION = /^- \[(R-[a-z]+-\d{3})\]/gm;
const bodies = files.map((file) => ({ file: relative(ROOT, file).split('\\').join('/'), body: readFileSync(file, 'utf8') }));
const defined = new Set();
const badIds = [];
for (const { file, body } of bodies) {
  if (!file.startsWith('docs/truths/')) continue;
  for (const [, id] of body.matchAll(DEFINITION)) {
    if (defined.has(id)) badIds.push({ file, id, why: 'duplicate' });
    defined.add(id);
  }
}
for (const { file, body } of bodies) {
  for (const [, id] of body.matchAll(RULE_ID)) {
    if (!defined.has(id)) badIds.push({ file, id, why: 'undefined' });
  }
}
if (badIds.length > 0) {
  for (const { file, id, why } of badIds) console.error(`bad rule id  ${file}  ${id}  (${why})`);
  console.error(`\n${badIds.length} bad rule id(s); ${defined.size} rules defined.`);
  process.exit(1);
}

console.log(`ok — every relative link resolves, across ${files.length} markdown files.`);
console.log(`ok — ${defined.size} rule ids, each defined once, every citation resolves.`);

const rel = (file) => relative(ROOT, file).split('\\').join('/');
const docs = files.map((file) => ({ path: rel(file), text: readFileSync(file, 'utf8') }));
const startsWithAny = (path, prefixes) => prefixes.some((p) => path.startsWith(p));
let warnings = 0;
const warn = (check, detail) => {
  console.log(`warn ${check}: ${detail}`);
  warnings++;
};

/** Byte budget of a file by its path, or Infinity where it has none. */
function budget(path) {
  if (['CLAUDE.md', 'docs/README.md', 'docs/GROUND-TRUTHS.md'].includes(path)) return 4096;
  if (startsWithAny(path, ['docs/truths/', 'docs/specs/'])) return 24576;
  if (startsWithAny(path, ['docs/history/', 'docs/sources/', 'docs/engineering/adr/', 'docs/Road Guides/'])) {
    return Infinity;
  }
  return 16384;
}

const over = docs
  .map(({ path, text }) => ({ path, bytes: Buffer.byteLength(text), limit: budget(path) }))
  .filter((d) => d.bytes > d.limit)
  .sort((a, b) => b.bytes - b.limit - (a.bytes - a.limit));
let failures = 0;
const STRICT = ['docs/truths/', 'docs/specs/', 'docs/world-sim/road-model/'];
/** Strict paths whose own migration slice has not run yet; they warn until it does. */
const PENDING = ['docs/truths/world.md'];
for (const d of over) {
  if (startsWithAny(d.path, STRICT) && !PENDING.includes(d.path)) {
    console.error(`over budget  ${d.path}  ${d.bytes} > ${d.limit}`);
    failures++;
  } else warn('size', `${d.path} ${d.bytes} bytes, budget ${d.limit}`);
}
console.log(`${over.length} file(s) over budget\n`);

/**
 * A spec opens with a title, then its card: the six labelled lines in order,
 * all before the first `## ` section. A card past 40 lines is a warning, since
 * a long Numbers table is still a card.
 */
const CARD = ['**Owns:**', '**Rules:**', '**Numbers:**', '**Code:**', '**Tests:**', '**Open:**'];
const CARD_LINES = 40;
for (const { path, text } of docs) {
  if (!path.startsWith('docs/specs/') || /\/(_template|README)\.md$/.test(path)) continue;
  const lines = text.split(/\r?\n/);
  const firstSection = lines.findIndex((l) => l.startsWith('## '));
  const head = firstSection < 0 ? lines : lines.slice(0, firstSection);
  let at = -1;
  const problems = [];
  if (!lines[0].startsWith('# ')) problems.push('does not begin with "# "');
  for (const key of CARD) {
    const i = head.findIndex((l) => l.includes(key));
    if (i < 0) problems.push(`${key} missing before the first section`);
    else if (i < at) problems.push(`${key} out of order`);
    else at = i;
  }
  if (problems.length > 0) {
    console.error(`no card  ${path}  ${problems.join('; ')}`);
    failures++;
  } else if (head.length > CARD_LINES) {
    warn('card', `${path} card is ${head.length} lines, aim for ${CARD_LINES}`);
  }
}

const DATED_OK = ['docs/history/', 'docs/ROADMAP.md', 'docs/engineering/adr/', 'docs/DESIGN.md', 'CHANGELOG.md'];
const dated = docs
  .filter(({ path }) => !startsWithAny(path, DATED_OK))
  .map(({ path, text }) => ({ path, count: (text.match(/20\d\d-\d\d-\d\d/g) ?? []).length }))
  .filter((d) => d.count > 0);
for (const d of dated) warn('dated', `${d.path} ${d.count} date(s)`);
console.log(`${dated.length} dated-spec warning(s)\n`);

/** Sentences of 12 or more words, whitespace normalised, by the files that hold them. */
const sentences = new Map();
for (const { path, text } of docs) {
  for (const raw of text.replace(/\s+/g, ' ').split(/(?<=[.?!]) /)) {
    const sentence = raw.trim();
    if (sentence.split(' ').length < 12) continue;
    if (!sentences.has(sentence)) sentences.set(sentence, new Set());
    sentences.get(sentence).add(path);
  }
}
const restated = [...sentences].filter(([, paths]) => paths.size > 1);
for (const [sentence, paths] of restated.slice(0, 40)) {
  warn('restated', `${[...paths].join(' and ')} — "${sentence.slice(0, 80)}"`);
}
console.log(`${restated.length} restated-sentence warning(s)${restated.length > 40 ? ' (first 40 shown)' : ''}\n`);
console.log(`${warnings} warning(s) shown in total; ${failures} failure(s) (budgets and cards under truths, specs and road-model).`);
if (failures > 0) process.exit(1);
