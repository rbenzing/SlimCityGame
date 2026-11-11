/** Power line (SPEC 30, slice 3): string a run out to a lot no road reaches,
 * and check the three things that matter — that the poles went up, that the
 * lot came alive, and that the city is being billed for the wire.
 *
 * Then look at it, because "poles with wire between them" is a claim about
 * the eye and a read-back cannot settle it.
 *
 * Usage: node tools/powerline-shots.mjs [url] [outDir]
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { cleanShot, tileCamera, unlimitedMoneyOption } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const url = base + (base.includes('?') ? '&' : '?') + 'nobloom';
const out = process.argv[3] ?? 'tools/shots-powerline';
mkdirSync(out, { recursive: true });

const b = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await b.newPage({ viewport: { width: 1400, height: 900 } });
const pageErrors = [];
page.on('pageerror', (e) => {
  pageErrors.push(e.message);
  console.log('[pageerror]', e.message);
});
await page.addInitScript(() => {
  try {
    sessionStorage.setItem(
      'slimcity.session',
      JSON.stringify({ screen: 'playing', seed: 12345, mode: 'new' }),
    );
  } catch (e) {
    void e;
  }
});
await unlimitedMoneyOption(page);
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#viewport canvas', { timeout: 20000 });
await page.waitForTimeout(4000);

const call = (fn, ...a) => page.evaluate(fn, ...a);
const cmd = (l, c) => call(([x, y]) => window.__slimcity.cmd(x, y), [l, c]);
const readGrid = () => call(() => window.__slimcity.readGrid());
const poles = () => call(() => window.__slimcity.readPowerPoles());
const cam = tileCamera(page);

const g0 = await readGrid();
const N = g0.size;
const idx = (x, z) => z * N + x;

const SPAN = 30;
let anchor = null;
let flattest = { spread: Infinity, at: null };
for (let z = 40; z < N - SPAN - 40 && !anchor; z++) {
  for (let x = 40; x < N - SPAN - 40; x++) {
    let lo = Infinity;
    let hi = -Infinity;
    let dry = true;
    for (let dz = 0; dz < SPAN && dry; dz += 2) {
      for (let dx = 0; dx < SPAN && dry; dx += 2) {
        const i = idx(x + dx, z + dz);
        if (g0.water[i]) dry = false;
        const h = g0.height[i];
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
    }
    if (!dry) continue;
    const spread = hi - lo;
    if (spread < flattest.spread) flattest = { spread, at: { x, z } };
    if (spread <= 0.4) {
      anchor = { x, z };
      break;
    }
  }
}
if (!anchor) anchor = flattest.at;
const { x: X, z: Z } = anchor;
console.log('anchor', JSON.stringify(anchor));

await cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
await cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
await page.waitForTimeout(300);

const failures = [];
const row = (z, a, c) => Array.from({ length: c - a + 1 }, (_, i) => ({ x: X + a + i, z: Z + z }));

// A generator on a short street of its own (a building off every street is cut
// off), and an island of road far off with nothing joining the two.
await cmd('plant street', [{ kind: 'buildRoad', tier: 1, tiles: row(14, 1, 4) }]);
await cmd('plant', [
  { kind: 'placeBuilding', catalogId: 'coal-plant', x: X + 1, z: Z + 10, rotation: 0 },
]);
await cmd('island', [{ kind: 'buildRoad', tier: 1, tiles: row(10, 20, 26) }]);
await page.waitForTimeout(3000);

const before = await readGrid();
console.log('island powered before the line:', before.power?.[idx(X + 23, Z + 10)]);

await cam(X + 14, Z + 10, 420, 0.55, 0.85);
await page.waitForTimeout(800);
await cleanShot(page, `${out}/before.png`);

// The wire, from beside the plant out to the island's road.
await cmd('Power line', [{ kind: 'stringPowerLine', tiles: row(10, 3, 20), on: true }]);
await page.waitForTimeout(3500);

const after = await readGrid();
const stood = await poles();
console.log('poles standing:', stood.length);
console.log('island powered after the line:', after.power?.[idx(X + 23, Z + 10)]);

// A pole on every tile the line actually took. The run crosses the plant's
// own footprint, which refuses a pole — correctly, the ground is taken — so
// the count is read from the line layer rather than from the tiles asked for.
let strung = 0;
for (let i = 0; i < after.powerLine.length; i++) if (after.powerLine[i] !== 0) strung += 1;
console.log('tiles carrying line:', strung);
// A strung line stands a pole every five tiles on open ground, and one at each end.
if (stood.length === 0) failures.push('the line went up but no poles stand on it');
if (stood.length >= strung)
  failures.push(
    `${strung} tiles carry line but ${stood.length} poles stand: one a tile is the old drawing`,
  );
if (after.power?.[idx(X + 23, Z + 10)] !== 1)
  failures.push('the island road is still unpowered — the line carried nothing');

await cam(X + 14, Z + 10, 420, 0.55, 0.85);
await page.waitForTimeout(800);
await cleanShot(page, `${out}/after.png`);
await cam(X + 8, Z + 10, 45, 0.6, 0.55);
await page.waitForTimeout(800);
await cleanShot(page, `${out}/close.png`);

// SPEC 30 slice 1, in the running game: a gravel lane carries no cable, so
// nothing down it is supplied. The remedy is to run the line ALONG the lane —
// a line shares its ground with a road, being on poles above it.
const col = (x, a, c) => Array.from({ length: c - a + 1 }, (_, i) => ({ x: X + x, z: Z + a + i }));
await cmd('gravel', [{ kind: 'buildRoad', tier: 4, tiles: row(20, 3, 12) }]);
await page.waitForTimeout(3000);
const gravel = await readGrid();
console.log('gravel lane powered:', gravel.power?.[idx(X + 10, Z + 20)]);
if (gravel.power?.[idx(X + 10, Z + 20)] !== 0)
  failures.push('a gravel lane conducted power; only a sealed road has a cable in it');

// Down from the supplied line at z+10, then along the lane itself.
await cmd('Power line', [
  { kind: 'stringPowerLine', tiles: [...col(3, 10, 20), ...row(20, 3, 12)], on: true },
]);
await page.waitForTimeout(3000);
const remedied = await readGrid();
console.log(
  'gravel lane powered once a line runs along it:',
  remedied.power?.[idx(X + 10, Z + 20)],
);
if (remedied.power?.[idx(X + 10, Z + 20)] !== 1)
  failures.push('a line run along the gravel lane did not supply it — the remedy does not work');

await cam(X + 8, Z + 20, 70, 0.6, 0.8);
await page.waitForTimeout(800);
await cleanShot(page, `${out}/gravel-remedied.png`);

// The street's own supply: a spine off the supplied line, a two-lane street and an
// avenue across it. They are powered by the line they touch, and carry their own
// pole line behind the kerb; nothing is strung along them.
await cmd('spine', [{ kind: 'buildRoad', tier: 1, tiles: col(12, 1, 9) }]);
await cmd('two-lane street', [{ kind: 'buildRoad', tier: 1, tiles: row(2, 4, 22) }]);
await cmd('avenue', [{ kind: 'buildRoad', tier: 2, tiles: row(6, 4, 22) }]);
// A line over open ground, and another down a gravel road. Each starts at a
// line already live: the open one at the end of the gravel lane's line, the
// roadside one at the end of the open one.
await cmd('open line', [
  { kind: 'stringPowerLine', tiles: [...col(3, 21, 24), ...row(24, 4, 25)], on: true },
]);
await cmd('gravel road', [{ kind: 'buildRoad', tier: 4, tiles: row(28, 0, 20) }]);
await cmd('roadside line', [
  { kind: 'stringPowerLine', tiles: [...col(3, 25, 28), ...row(28, 4, 20)], on: true },
]);
await page.waitForTimeout(4000);

const streets = await readGrid();
const poweredAvenue = streets.power?.[idx(X + 8, Z + 6)];
console.log(
  'avenue powered:',
  poweredAvenue,
  'two-lane powered:',
  streets.power?.[idx(X + 8, Z + 2)],
);
if (poweredAvenue !== 1 || streets.power?.[idx(X + 8, Z + 2)] !== 1)
  failures.push('the streets off the supplied line carry no power, so there is nothing to show');
const stands = await poles();
console.log('poles standing now:', stands.length);
const world = (t) => (t + 0.5) * 20;
const junctions = [
  [12, 2],
  [12, 6],
];
for (const p of stands) {
  const tx = Math.floor(p.x / 20) - X;
  const tz = Math.floor(p.z / 20) - Z;
  if (junctions.some(([jx, jz]) => jx === tx && jz === tz))
    failures.push(`a pole stands on the junction at ${tx},${tz}`);
  // Along the two-lane street and the avenue no pole may stand in the carriageway.
  for (const [row0, half] of [
    [2, 5.5],
    [6, 8],
  ]) {
    if (tx >= 4 && tx <= 22 && tz === row0 && Math.abs(p.z - world(Z + row0)) < half)
      failures.push(`a pole stands in the carriageway of row ${row0} at ${p.x},${p.z}`);
  }
}

// Oblique from about 60 m, straight above, and the junction between them.
for (const [name, tz] of [
  ['two-lane', 2],
  ['avenue', 6],
]) {
  await cam(X + 8, Z + tz, 60, 0.6, 0.55);
  await page.waitForTimeout(800);
  await cleanShot(page, `${out}/${name}-oblique.png`);
  await cam(X + 8, Z + tz, 60, 0, 1.45);
  await page.waitForTimeout(800);
  await cleanShot(page, `${out}/${name}-above.png`);
  await cam(X + 12, Z + tz, 60, 0.9, 0.5);
  await page.waitForTimeout(800);
  await cleanShot(page, `${out}/${name}-junction.png`);
}
await cam(X + 14, Z + 14, 400, 0.55, 0.85);
await page.waitForTimeout(800);
await cleanShot(page, `${out}/wide-400m.png`);
// The line over open ground and the roadside line down the gravel road.
await cam(X + 12, Z + 24, 110, 0.4, 0.45);
await page.waitForTimeout(800);
await cleanShot(page, `${out}/open-line.png`);
await cam(X + 10, Z + 28, 90, 0.5, 0.4);
await page.waitForTimeout(800);
await cleanShot(page, `${out}/gravel-line.png`);

// A substation beside the two-lane street, its front to the street. It takes the
// street's supply and feeds a line that leaves it over open ground.
await cmd('Substation', [
  { kind: 'placeBuilding', catalogId: 'substation', x: X + 16, z: Z, rotation: 0 },
]);
await cmd('Line from the substation', [
  { kind: 'stringPowerLine', tiles: row(0, 18, 29), on: true },
]);
await page.waitForTimeout(4000);
const subGrid = await readGrid();
if (subGrid.buildingId[idx(X + 16, Z)] === 0) failures.push('the substation was not placed');
if (subGrid.power?.[idx(X + 27, Z)] !== 1)
  failures.push('the line leaving the substation carries no power');
await cam(X + 17, Z + 1, 60, 0.6, 0.55);
await page.waitForTimeout(800);
await cleanShot(page, `${out}/substation-60m.png`);
await cam(X + 17, Z + 1, 60, 0, 1.45);
await page.waitForTimeout(800);
await cleanShot(page, `${out}/substation-above.png`);
await cam(X + 22, Z + 1, 300, 0.6, 0.6);
await page.waitForTimeout(800);
await cleanShot(page, `${out}/substation-300m.png`);
await cam(X + 24, Z + 1, 110, 0.9, 0.4);
await page.waitForTimeout(800);
await cleanShot(page, `${out}/substation-line.png`);
await call(() => window.__slimcity.setDayT(0.96));
await page.waitForTimeout(2500);
await cam(X + 17, Z + 1, 60, 0.6, 0.55);
await page.waitForTimeout(800);
await cleanShot(page, `${out}/substation-night.png`);
await call(() => window.__slimcity.setDayT(0.5));

// The buried cable. A new street with its supply buried along the middle of it:
// the overhead pole line ends on a riser at each end of the buried stretch, no pole
// and no wire shows over it, and a pad transformer stands every fourth tile.
// A connector off the live line at z+10 powers it.
const CABLE = 3;
const cableRow = (z, a, c) => row(z, a, c);
await cmd('Buried street', [
  { kind: 'buildRoad', tier: 1, tiles: row(15, 6, 28) },
  { kind: 'buildRoad', tier: 1, tiles: col(12, 11, 14) },
]);
await page.waitForTimeout(3000);
const preBury = await poles();
await cmd('Buried cable under the street', [
  { kind: 'stringPowerLine', tiles: cableRow(15, 15, 22), on: true, lineKind: CABLE },
]);
// A substation on the overhead half, a cable from it over open ground into a gravel
// lane, boxes at both ends; a gravel lane for it to run under.
await cmd('Gravel lane', [{ kind: 'buildRoad', tier: 4, tiles: col(14, 17, 22) }]);
await cmd('Substation for the cable', [
  { kind: 'placeBuilding', catalogId: 'substation', x: X + 8, z: Z + 16, rotation: 2 },
]);
await page.waitForTimeout(3000);
await cmd('Cable to the lane', [
  {
    kind: 'stringPowerLine',
    tiles: [...row(17, 10, 14), ...col(14, 18, 22)],
    on: true,
    lineKind: CABLE,
  },
]);
// A cable continuing the open line past its end: the line's last pole is a riser.
await cmd('Cable from the line', [
  { kind: 'stringPowerLine', tiles: row(24, 26, 29), on: true, lineKind: CABLE },
]);
await page.waitForTimeout(4500);
const buried = await readGrid();
const cables = await call(() => window.__slimcity.readPowerCables());
const nowPoles = await poles();
console.log('cable tiles:', buried.powerLine.filter((v) => v === CABLE).length);
console.log('boxes:', cables.boxes.length, 'riser guards:', cables.guards);
console.log(
  'box tiles:',
  JSON.stringify(cables.boxes.map((bx) => [Math.floor(bx.x / 20) - X, Math.floor(bx.z / 20) - Z])),
);
if (buried.powerLine[idx(X + 18, Z + 15)] !== CABLE) failures.push('the street cable was not laid');
if (buried.powerLine[idx(X + 14, Z + 20)] !== CABLE) failures.push('the lane cable was not laid');
if (buried.power?.[idx(X + 14, Z + 20)] !== 1)
  failures.push('the cable under the gravel lane does not power it');
for (const p of nowPoles) {
  const tx = Math.floor(p.x / 20) - X;
  const tz = Math.floor(p.z / 20) - Z;
  if (tz === 15 && tx >= 15 && tx <= 22)
    failures.push(`a pole stands on the buried street at ${tx},${tz}`);
}
// Risers at both ends of the buried stretch, boxes at the cable ends, transformers every fourth tile.
if (cables.guards < 3)
  failures.push(`${cables.guards} riser guards: wanted 2 on the street and 1 on the line`);
if (cables.boxes.length < 5)
  failures.push(`${cables.boxes.length} boxes: wanted 2 transformers and 3 ends`);
void preBury;
for (const bx of cables.boxes) {
  const tx = Math.floor(bx.x / 20) - X;
  const tz = Math.floor(bx.z / 20) - Z;
  // A box never stands in a carriageway: on the street row its centre is off the centre line.
  if (tz === 15 && Math.abs(bx.z - world(Z + 15)) < 5.5)
    failures.push(`a box stands in the carriageway at ${tx},${tz}`);
}

await cam(X + 19, Z + 15, 60, 0.6, 0.55);
await page.waitForTimeout(800);
await cleanShot(page, `${out}/buried-street-oblique.png`);
await cam(X + 19, Z + 15, 60, 0, 1.45);
await page.waitForTimeout(800);
await cleanShot(page, `${out}/buried-street-above.png`);
await cam(X + 14, Z + 15, 40, 0.9, 0.5);
await page.waitForTimeout(800);
await cleanShot(page, `${out}/buried-street-riser.png`);
await cam(X + 12, Z + 19, 60, 0.6, 0.55);
await page.waitForTimeout(800);
await cleanShot(page, `${out}/cable-substation-lane.png`);
await cam(X + 14, Z + 21, 40, 0.4, 0.55);
await page.waitForTimeout(800);
await cleanShot(page, `${out}/cable-lane-end.png`);
await cam(X + 11, Z + 17, 35, 0.6, 0.5);
await page.waitForTimeout(800);
await cleanShot(page, `${out}/cable-substation-end.png`);
await cam(X + 27, Z + 24, 80, 0.4, 0.5);
await page.waitForTimeout(800);
await cleanShot(page, `${out}/cable-meets-line.png`);
await cam(X + 26, Z + 24, 30, 0.4, 0.6);
await page.waitForTimeout(800);
await cleanShot(page, `${out}/cable-meets-line-close.png`);

// The refusal: with the Power Line tool in hand, the cursor over open ground that
// touches no source and no line says why the run would not stand.
await cam(X + 14, Z - 12, 200, 0, 1.45);
await call(() => window.__slimcity.setTool('power.line'));
await page.waitForTimeout(800);
const view = page.viewportSize();
const open = await call(
  ([w, h, size, grid]) => {
    for (let sy = 140; sy < h - 140; sy += 16)
      for (let sx = 80; sx < w - 80; sx += 16) {
        const t = window.__slimcity.screenToTile(sx, sy);
        if (!t) continue;
        let clear = true;
        for (let dz = -2; dz <= 2 && clear; dz++)
          for (let dx = -2; dx <= 2 && clear; dx++) {
            const x = t.x + dx;
            const z = t.z + dz;
            if (x < 0 || z < 0 || x >= size || z >= size) {
              clear = false;
              break;
            }
            const i = z * size + x;
            if (grid.water[i] || grid.roadTier[i] || grid.buildingId[i] || grid.powerLine[i])
              clear = false;
          }
        if (clear) return { sx, sy, t };
      }
    return null;
  },
  [view.width, view.height, N, await readGrid()],
);
if (!open) failures.push('no open ground to hover the refusal on');
else {
  await page.mouse.move(open.sx - 4, open.sy - 4);
  await page.mouse.move(open.sx, open.sy);
  await page.waitForTimeout(800);
  await cleanShot(page, `${out}/refusal-chip.png`);
  const chip = await page.locator('body').innerText();
  if (!chip.includes('A line must start at a power station, a substation or a live line.'))
    failures.push('the cursor chip does not say where a line must start');
}
await call(() => window.__slimcity.setTool('select'));

await b.close();
for (const e of pageErrors) failures.push(`page error: ${e}`);
if (failures.length > 0) {
  console.log('FAIL');
  for (const f of failures) console.log(' -', f);
  process.exitCode = 1;
} else {
  console.log('PASS');
}
