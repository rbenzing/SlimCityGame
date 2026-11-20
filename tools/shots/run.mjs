/** Runs the shot series against one dev server, a few at a time.
 *
 * Usage: node tools/shots/run.mjs <url> [type|series ...] [--shards N] [--list]
 *
 * A name is a type (a folder under tools/shots/series) or a series (a file in
 * one). With no names every series runs, the one with most frames first,
 * two at a time. A series that runs over three times its budget is killed; one that runs
 * over its budget is `slow`; both fail. One table at the end lists series, type, exit
 * code, seconds, frames and contact sheets; the run exits 1 if any series failed,
 * was slow, or wrote no frame or no sheet.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { framesOf } from './lib/frames.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const SERIES_DIR = join(HERE, 'series');
const OUT_DIR = join(HERE, 'out');
/** Every page redraws the scene continuously, so three at once saturate the GPU and each frame
 * takes three times as long (measured: three shards 384 s and 5 to 7 series over budget, two
 * shards 254 s and none). */
const DEFAULT_SHARDS = 2;
/** A series that runs past this many times its budget is hung: it is killed. One that runs
 * past the budget alone is `slow`, and fails the run. */
const KILL_AT = 3;

const argv = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = argv.indexOf(name);
  if (at < 0) return fallback;
  const [, value] = argv.splice(at, 2);
  return Number(value);
};
const listOnly = argv.includes('--list');
const shards = flag('--shards', DEFAULT_SHARDS);
const positional = argv.filter((a) => !a.startsWith('--'));
const url = positional.find((a) => /^https?:\/\//.test(a));
const names = positional.filter((a) => a !== url);

/** Every series' spec, read by importing its file with running switched off. */
async function readSeries() {
  process.env.SHOTS_NO_RUN = '1';
  const found = [];
  for (const type of readdirSync(SERIES_DIR).sort()) {
    for (const file of readdirSync(join(SERIES_DIR, type)).sort()) {
      if (!file.endsWith('.mjs')) continue;
      const path = join(SERIES_DIR, type, file);
      const spec = (await import(pathToFileURL(path).href)).default;
      found.push({ ...spec, path });
    }
  }
  delete process.env.SHOTS_NO_RUN;
  return found;
}

const all = await readSeries();

if (listOnly) {
  for (const s of all) console.log(`${s.type.padEnd(7)} ${s.name}  (${s.budgetS}s)  ${s.purpose}`);
  process.exit(0);
}
if (!url) {
  console.error('usage: node tools/shots/run.mjs <url> [type|series ...] [--shards N] | --list');
  process.exit(2);
}
const unknown = names.filter((n) => !all.some((s) => s.name === n || s.type === n));
if (unknown.length) {
  console.error(`unknown type or series: ${unknown.join(', ')} (see --list)`);
  process.exit(2);
}
const queue = all
  .filter((s) => names.length === 0 || names.some((n) => s.name === n || s.type === n))
  .map((s) => ({ ...s, expected: framesOf(s) }))
  .sort((a, b) => b.expected - a.expected);

/** PNGs a series wrote since `since`: its frames, or with `sheets` its contact sheets. */
const framesSince = (name, since, sheets = false) => {
  let n = 0;
  try {
    for (const f of readdirSync(join(OUT_DIR, name)))
      if (
        f.endsWith('.png') &&
        /^sheet-\d+\.png$/.test(f) === sheets &&
        statSync(join(OUT_DIR, name, f)).mtimeMs >= since
      )
        n++;
  } catch {
    return 0;
  }
  return n;
};

const killTree = (child) => {
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  else child.kill('SIGKILL');
};

const runOne = (series) =>
  new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [series.path, url], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let tail = '';
    const keep = (chunk) => {
      tail = (tail + chunk.toString()).slice(-800);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    let over = false;
    const timer = setTimeout(
      () => {
        over = true;
        killTree(child);
      },
      series.budgetS * KILL_AT * 1000,
    );
    child.on('close', (code) => {
      clearTimeout(timer);
      const seconds = Math.round((Date.now() - started) / 1000);
      const exit = over ? 'killed' : String(code);
      const result = {
        name: series.name,
        type: series.type,
        exit: exit === '0' && seconds > series.budgetS ? 'slow' : exit,
        seconds,
        frames: framesSince(series.name, started),
        sheets: framesSince(series.name, started, true),
        tail,
      };
      console.log(
        `done ${series.name}: exit ${result.exit}, ${result.seconds}s, ${result.frames} frames, ${result.sheets} sheets`,
      );
      resolve(result);
    });
  });

const results = [];
const worker = async () => {
  for (let s = queue.shift(); s; s = queue.shift()) results.push(await runOne(s));
};
const wallStart = Date.now();
await Promise.all(Array.from({ length: Math.min(shards, queue.length) }, worker));

results.sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
const pad = (s, n) => String(s).padEnd(n);
console.log(
  `\n${pad('series', 18)}${pad('type', 10)}${pad('exit', 8)}${pad('seconds', 9)}${pad('frames', 8)}sheets`,
);
for (const r of results)
  console.log(
    `${pad(r.name, 18)}${pad(r.type, 10)}${pad(r.exit, 8)}${pad(r.seconds, 9)}${pad(r.frames, 8)}${r.sheets}`,
  );
const failed = results.filter((r) => r.exit !== '0' || r.frames === 0 || r.sheets === 0);
const total = results.reduce((n, r) => n + r.frames, 0);
console.log(
  `\nwall ${Math.round((Date.now() - wallStart) / 1000)}s, ${total} frames, ${failed.length} failed`,
);
for (const r of failed)
  console.log(`\n--- ${r.name} (exit ${r.exit}, ${r.frames} frames) tail ---\n${r.tail}`);
process.exit(failed.length ? 1 : 0);
