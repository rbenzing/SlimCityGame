/** Runs the shot tools against one dev server, in parallel shards.
 *
 * Usage: node tools/shots.mjs <url> [tool ...] [--shards N] [--timeout SECONDS]
 *        node tools/shots.mjs --list
 *
 * A tool is named by its file, without `-shots.mjs` (`roadmatrix`, `civic-access`).
 * With no names, every tool runs. Tools are handed out longest first, so the
 * shards finish together. The table at the end lists each tool's exit code,
 * seconds and the frames it wrote; the run exits 1 if any tool failed, timed
 * out or wrote no frame.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const TOOLS_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SHARDS = 3;
const DEFAULT_TIMEOUT_S = 600;
const FALLBACK_SECONDS = 120;

/** Last known duration in seconds (the order tools are started in), and a timeout
 * in seconds where a tool needs longer than the default. */
const KNOWN = {
  roadclip: { seconds: 900, timeout: 1400 },
  deadend: { seconds: 900, timeout: 1400 },
  tramway: { seconds: 680, timeout: 1000 },
  roadmatrix: { seconds: 613, timeout: 950 },
  playthrough: { seconds: 576, timeout: 900 },
  roadconformity: { seconds: 288 },
  curve: { seconds: 287 },
  construction: { seconds: 287 },
  airport: { seconds: 274 },
  bend: { seconds: 273 },
  nightlook: { seconds: 267 },
  town: { seconds: 258 },
  services: { seconds: 203 },
};

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(name);
  if (at < 0) return fallback;
  const [, value] = argv.splice(at, 2);
  return Number(value);
};
const listOnly = argv.includes('--list');
const shards = flag('--shards', DEFAULT_SHARDS);
const defaultTimeoutS = flag('--timeout', DEFAULT_TIMEOUT_S);

const allTools = readdirSync(TOOLS_DIR)
  .filter((f) => f.endsWith('-shots.mjs'))
  .map((f) => f.slice(0, -'-shots.mjs'.length))
  .sort();

if (listOnly) {
  for (const t of allTools) console.log(t);
  process.exit(0);
}

const positional = argv.filter((a) => !a.startsWith('--'));
const url = positional.find((a) => /^https?:\/\//.test(a));
if (!url) {
  console.error(
    'usage: node tools/shots.mjs <url> [tool ...] [--shards N] [--timeout SECONDS] | --list',
  );
  process.exit(2);
}
const named = positional.filter((a) => a !== url);
const unknown = named.filter((t) => !allTools.includes(t));
if (unknown.length) {
  console.error(`unknown tool: ${unknown.join(', ')} (see --list)`);
  process.exit(2);
}
const queue = (named.length ? named : allTools).sort(
  (a, b) => (KNOWN[b]?.seconds ?? FALLBACK_SECONDS) - (KNOWN[a]?.seconds ?? FALLBACK_SECONDS),
);

/** Folders a tool writes frames into: every `shots-xxx` name in its source. */
const outputDirs = (tool) => {
  const src = readFileSync(join(TOOLS_DIR, `${tool}-shots.mjs`), 'utf8');
  return [...new Set(src.match(/shots-[a-z0-9-]+/g) ?? [])].map((d) => join(TOOLS_DIR, d));
};

const framesSince = (dirs, since) => {
  let n = 0;
  for (const dir of dirs) {
    let names;
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const f of names) {
      if (f.endsWith('.png') && statSync(join(dir, f)).mtimeMs >= since) n++;
    }
  }
  return n;
};

const killTree = (child) => {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  else child.kill('SIGKILL');
};

const runOne = (tool) =>
  new Promise((resolve) => {
    const started = Date.now();
    const timeoutS = KNOWN[tool]?.timeout ?? defaultTimeoutS;
    const child = spawn(process.execPath, [join(TOOLS_DIR, `${tool}-shots.mjs`), url], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let tail = '';
    const keep = (chunk) => {
      tail = (tail + chunk.toString()).slice(-800);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutS * 1000);
    child.on('close', (code) => {
      clearTimeout(timer);
      const result = {
        tool,
        exit: timedOut ? 'timeout' : String(code),
        seconds: Math.round((Date.now() - started) / 1000),
        frames: framesSince(outputDirs(tool), started),
        tail,
      };
      console.log(`done ${tool}: exit ${result.exit}, ${result.seconds}s, ${result.frames} frames`);
      resolve(result);
    });
  });

const results = [];
const worker = async () => {
  for (let tool = queue.shift(); tool; tool = queue.shift()) results.push(await runOne(tool));
};
const wallStart = Date.now();
await Promise.all(Array.from({ length: Math.min(shards, queue.length) }, worker));

results.sort((a, b) => a.tool.localeCompare(b.tool));
const pad = (s, n) => String(s).padEnd(n);
console.log(`\n${pad('tool', 18)}${pad('exit', 9)}${pad('seconds', 9)}frames`);
for (const r of results)
  console.log(`${pad(r.tool, 18)}${pad(r.exit, 9)}${pad(r.seconds, 9)}${r.frames}`);
const failed = results.filter((r) => r.exit !== '0' || r.frames === 0);
const total = results.reduce((n, r) => n + r.frames, 0);
console.log(
  `\nwall ${Math.round((Date.now() - wallStart) / 1000)}s, ${total} frames, ${failed.length} failed`,
);
for (const r of failed)
  console.log(`\n--- ${r.tool} (exit ${r.exit}, ${r.frames} frames) tail ---\n${r.tail}`);
process.exit(failed.length ? 1 : 0);
