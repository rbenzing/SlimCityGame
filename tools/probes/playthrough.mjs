/** Play a new game through its interface, the way a player does, and check every step.
 *
 * The whole scenario of `tools/shots/lib/playthrough.mjs` runs (the same steps the
 * `town/firstgame` series photographs a part of): dock categories and drawer cards are clicked,
 * roads and zones are dragged with the pointer, buildings are placed with a click, and the grid
 * and stats are read back after each step, so a check fails when the world did not change the way
 * the click promised. Groups: the first street, power and water, zoning, growth (and the gravel
 * road's homes), inspecting a building and a junction, options, services and a landfill, a bus
 * line and a district, bulldoze with undo and redo, the four terrain brushes, a roundabout, every
 * lens, the corner panels and photo mode, the speed controls, and a save loaded back.
 *
 * Writes numbers, not frames. Exits 0 when every check passed and no page error was raised.
 *
 * Usage: node tools/probes/playthrough.mjs [url]
 */
import { logAlerts } from '../shots/lib/camera.mjs';
import { playthrough } from '../shots/lib/playthrough.mjs';
import { openSession } from '../shots/lib/session.mjs';

const SEED = 12345;
const started = performance.now();
const session = await openSession(process.argv[2] ?? 'http://localhost:5173', {
  fresh: true,
  seed: SEED,
});
const { page } = session;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(ok ? 'PASS' : 'FAIL', name, detail);
};

let failed = [];
try {
  await logAlerts(page, 'playthrough');
  const { play } = await playthrough(page, { check });
  await play(false);
  failed = results.filter((r) => !r.ok);
  const errors = [...new Set(session.errors)];
  if (errors.length > 0) failed.push({ name: `page errors: ${errors.join(' | ')}` });
  await logAlerts(page, 'playthrough (end)');
} finally {
  await session.close();
}
console.log(`\n${results.length - failed.length} of ${results.length} checks passed`);
console.log(
  failed.length === 0
    ? 'PASS'
    : 'FAIL:\n - ' + failed.map((f) => `${f.name} ${f.detail ?? ''}`).join('\n - '),
);
console.log(`playthrough: ${Math.round((performance.now() - started) / 1000)}s`);
process.exitCode = failed.length === 0 ? 0 : 1;
