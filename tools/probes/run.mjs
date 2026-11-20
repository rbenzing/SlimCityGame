/** Runs the probes one at a time against one dev server.
 *
 * Usage: node tools/probes/run.mjs <url> [name ...] | --list
 *
 * A probe writes numbers (or a few smoke frames), not a shot series, and exits non-zero when a
 * check fails. Each runs in its own process; its output is passed through. The table at the end
 * lists name, exit code and seconds, and the run exits 1 if any probe exited non-zero.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));

/** Every probe: its file, what it answers and the seconds it is expected to take. */
export const PROBES = [
  {
    name: 'road-audit',
    seconds: 120,
    what: 'every laying tier in every topology lays one section; lamps; corridor crosswalk',
  },
  {
    name: 'corner-map',
    seconds: 60,
    what: 'a junction corner as text; footway joins round corners and past alleys',
  },
  { name: 'stall', seconds: 180, what: 'longest page read-back while a grown town runs at 4x' },
  { name: 'frame-budget', seconds: 300, what: 'what a Metropolis costs a frame, by day and night' },
  { name: 'memory-probe', seconds: 270, what: 'heap and geometry counts while a town grows' },
  { name: 'growth-probe', seconds: 90, what: 'why zones do or do not develop in a minimal town' },
  { name: 'audio-check', seconds: 30, what: 'real audio playback in a real browser' },
  {
    name: 'visual-smoke',
    seconds: 60,
    what: 'the boot and the first tools driven by keyboard and mouse',
  },
];

const argv = process.argv.slice(2);
if (argv.includes('--list')) {
  for (const p of PROBES) console.log(`${p.name.padEnd(13)} (${p.seconds}s)  ${p.what}`);
  process.exit(0);
}
const url = argv.find((a) => /^https?:\/\//.test(a));
const names = argv.filter((a) => a !== url);
if (!url) {
  console.error('usage: node tools/probes/run.mjs <url> [name ...] | --list');
  process.exit(2);
}
const unknown = names.filter((n) => !PROBES.some((p) => p.name === n));
if (unknown.length > 0) {
  console.error(`unknown probe: ${unknown.join(', ')} (see --list)`);
  process.exit(2);
}

const rows = [];
for (const p of PROBES.filter((q) => names.length === 0 || names.includes(q.name))) {
  console.log(`\n--- ${p.name}`);
  const started = performance.now();
  const run = spawnSync(process.execPath, [`${HERE}${p.name}.mjs`, url], {
    stdio: 'inherit',
    timeout: p.seconds * 1000 * 3,
  });
  rows.push({
    name: p.name,
    exit: run.status ?? `killed (${run.signal})`,
    seconds: ((performance.now() - started) / 1000).toFixed(0),
    over: (performance.now() - started) / 1000 > p.seconds,
  });
}

console.log('\nprobe          exit  seconds');
for (const r of rows)
  console.log(
    `${r.name.padEnd(14)} ${String(r.exit).padEnd(5)} ${r.seconds}${r.over ? '  slow' : ''}`,
  );
process.exitCode = rows.some((r) => r.exit !== 0) ? 1 : 0;
