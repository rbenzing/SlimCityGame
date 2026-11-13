/** Top-down shots of homes with drives on both sides of streets that carry a
 * parking lane, for every road class that can carry one in each parking style
 * (parallel, angled, head-in), and of a two-lane street beside a signalled
 * junction's turn bay. Each frame is one street, 12 tiles long, a two-tile and
 * a one-tile-wide lot on each side, seen from 70 m up at twice the pixels, so
 * a drive, its footway crossing, the kerb stalls and any paving that strays
 * onto the carriageway can be judged. Before any frame it prints, per street,
 * whether the profile fits a tile and which homes stand.
 *
 * Usage: node tools/kerbdrive-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { cleanShot, closeUp, hooksReady, tileCamera, unlimitedMoneyOption } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/shots-kerbdrive';
mkdirSync(out, { recursive: true });

const SEED = 7;
const LEN = 12;
const ROWS_NORTH = 4;
const ROWS_SOUTH = 5;
const TOP_PITCH = 1.5;
/** Road tiers that admit a parking lane, by name. */
const TIERS = [
  { tier: 1, name: 'two-lane' },
  { tier: 2, name: 'avenue' },
  { tier: 4, name: 'gravel' },
  { tier: 5, name: 'alley' },
  { tier: 6, name: 'one-way' },
  { tier: 7, name: 'four-lane' },
];
const STYLES = ['parallel', 'angled', 'headIn'];

const failures = [];
const browser = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', (e) => failures.push(`pageerror ${e.message}`));
await unlimitedMoneyOption(page);
await page.addInitScript(
  ([session]) => {
    sessionStorage.setItem('slimcity.session', JSON.stringify(session));
    const saved = JSON.parse(localStorage.getItem('slimcity.settings') ?? '{}');
    localStorage.setItem(
      'slimcity.settings',
      JSON.stringify({ ...saved, sandboxUnlockAll: true, unlimitedMoney: true }),
    );
  },
  [{ screen: 'playing', seed: SEED, mode: 'new' }],
);

try {
  await page.goto(base + '?nobloom', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#viewport canvas', { timeout: 60000 });
  await hooksReady(page);
  const cam = tileCamera(page);
  const send = (label, commands) =>
    page.evaluate(([l, c]) => window.__slimcity.cmd(l, c), [label, commands]);
  await send('Sandbox', [{ kind: 'setSandbox', on: true }]);
  await send('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
  await page.evaluate(() => {
    window.__slimcity.setSpeed(0);
    window.__slimcity.setDayT(0.5);
  });

  // Every profile the matrix names, composed by the game's own composer.
  const combos = await page.evaluate(
    async ([tiers, styles]) => {
      const m = await import('/src/shared/roadprofile.ts');
      const list = [];
      for (const t of tiers) {
        for (const style of styles) {
          const base = m.presetProfileForTier(t.tier);
          const profile = m.composeProfile(base, {
            ...m.NO_EDITS,
            parking: 'both',
            parkingStyle: style,
          });
          const parks = profile.pieces.some((p) => p.kind === 'parking');
          list.push({ ...t, style, profile, parks, fits: m.fitsTile(profile) });
        }
      }
      return list;
    },
    [TIERS, STYLES],
  );
  const usable = combos.filter((c) => c.parks && c.fits);
  console.table(
    combos.map((c) => ({ tier: c.name, style: c.style, parks: c.parks, fits: c.fits })),
  );

  const g = await page.evaluate(() => window.__slimcity.readGrid());
  const N = g.size;
  const idx = (x, z) => z * N + x;
  const used = new Set();
  const flatDry = (x, z, h0) =>
    x >= 0 &&
    z >= 0 &&
    x < N &&
    z < N &&
    !g.water[idx(x, z)] &&
    Math.abs(g.height[idx(x, z)] - h0) <= 6;
  const site = (cols) => {
    for (let z = 20 + ROWS_NORTH; z < N - ROWS_SOUTH - 10; z++) {
      for (let x = 20; x < N - cols - 20; x++) {
        const h0 = g.height[idx(x, z)];
        let ok = true;
        for (let dz = -ROWS_NORTH; dz <= ROWS_SOUTH && ok; dz++)
          for (let dx = -1; dx < cols + 1 && ok; dx++)
            if (!flatDry(x + dx, z + dz, h0) || used.has(idx(x + dx, z + dz))) ok = false;
        if (!ok) continue;
        for (let dz = -ROWS_NORTH - 1; dz <= ROWS_SOUTH + 1; dz++)
          for (let dx = -2; dx < cols + 2; dx++) used.add(idx(x + dx, z + dz));
        return { x, z };
      }
    }
    throw new Error('no flat dry ground');
  };

  const homes = async (s, xs) => {
    const placed = [];
    for (const [id, dx, side] of xs) {
      const south = side === 'south';
      const d = id === 'res-low-1' ? 2 : 1;
      const x = s.x + dx;
      const z = south ? s.z + 1 : s.z - d;
      await send('Home', [{ kind: 'placeBuilding', catalogId: id, x, z, rotation: south ? 2 : 0 }]);
      placed.push(`${id}@${x},${z}`);
    }
    return placed;
  };

  const frames = [];
  let profileId = 40;
  for (const c of usable) {
    const s = site(LEN);
    const id = profileId++;
    await send('Profile', [{ kind: 'defineRoadProfile', id, profile: c.profile }]);
    const road = Array.from({ length: LEN }, (_, i) => ({ x: s.x + i, z: s.z }));
    await send('Street', [{ kind: 'buildRoad', tier: c.tier, tiles: road, profile: id }]);
    const placed = await homes(s, [
      ['res-low-1', 1, 'south'],
      ['res-normal-t-2', 5, 'south'],
      ['res-normal-t-2', 1, 'north'],
      ['res-low-1', 5, 'north'],
      ['res-normal-t-2', 9, 'south'],
      ['res-normal-t-2', 9, 'north'],
    ]);
    frames.push({ name: `${c.name}-${c.style}`, x: s.x + LEN / 2 - 0.5, z: s.z, placed });
  }

  // A signalled junction with a turn bay, homes beside it on all four corners.
  {
    const s = site(LEN);
    const id = profileId++;
    const two = combos.find((c) => c.tier === 1 && c.style === 'parallel');
    await send('Profile', [{ kind: 'defineRoadProfile', id, profile: two.profile }]);
    const road = Array.from({ length: LEN }, (_, i) => ({ x: s.x + i, z: s.z }));
    await send('Street', [{ kind: 'buildRoad', tier: 1, tiles: road, profile: id }]);
    const cross = Array.from({ length: ROWS_NORTH + ROWS_SOUTH }, (_, i) => ({
      x: s.x + 6,
      z: s.z - ROWS_NORTH + i,
    })).filter((t) => t.z !== s.z);
    await send('Cross', [{ kind: 'buildRoad', tier: 1, tiles: cross, profile: id }]);
    await send('Signal', [{ kind: 'setJunctionControl', x: s.x + 6, z: s.z, control: 'signal' }]);
    const placed = await homes(s, [
      ['res-low-1', 1, 'south'],
      ['res-normal-t-2', 4, 'south'],
      ['res-normal-t-2', 7, 'south'],
      ['res-low-1', 9, 'south'],
      ['res-low-1', 1, 'north'],
      ['res-normal-t-2', 4, 'north'],
      ['res-normal-t-2', 7, 'north'],
      ['res-low-1', 9, 'north'],
    ]);
    frames.push({ name: 'junction-bay', x: s.x + 6, z: s.z, placed });
    // The homes either side of it, close in: the drive laid against the street as drawn.
    frames.push({ name: 'junction-bay-west', x: s.x + 3, z: s.z, placed: [] });
    frames.push({ name: 'junction-bay-east', x: s.x + 9, z: s.z, placed: [] });
  }

  await page.waitForTimeout(3000);
  const standing = await page.evaluate(() => window.__slimcity.readBuildings());
  for (const f of frames) {
    const missing = f.placed.filter((p) => {
      const [id, at] = p.split('@');
      const [x, z] = at.split(',').map(Number);
      return !standing.some((b) => b.catalogId === id && b.x === x && b.z === z);
    });
    console.log(f.name, missing.length === 0 ? 'homes stand' : `MISSING ${missing.join(' ')}`);
  }

  const normal = await closeUp(page, 2);
  for (const f of frames) {
    await cam(f.x, f.z, 70, 0, TOP_PITCH);
    await page.waitForTimeout(1500);
    await cleanShot(page, `${out}/${f.name}.png`);
  }
  await normal();
} finally {
  await browser.close();
}
if (failures.length > 0) {
  console.log(failures.join('\n'));
  process.exit(1);
}
