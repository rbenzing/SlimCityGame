/** Construction shots: zones a block each of house, shop, works and a taller
 * kind along one street, holds every construction countdown where it is with
 * the dev hold, lets the lots fill with buildings going up, and photographs one
 * of each kind from the street and from above at each stage of the build (the
 * dev hook sets how far every site has got). Nothing finishes while the hold
 * is on, so every frame shows a building under construction.
 *
 * Usage: node tools/construction-shots.mjs [baseUrl] [outDir]   (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { cleanShot, hooksReady, setClock, tileCamera, unlimitedMoneyOption } from './shotcam.mjs';

const base = process.argv[2] ?? 'http://localhost:5173';
const out = process.argv[3] ?? 'tools/shots-construction';
mkdirSync(out, { recursive: true });

const RT = { TwoLane: 1 };
const ZONE = { ResLow: 1, ResHigh: 2, ComLow: 3, Industrial: 5 };
/** Tiles along the street each block takes, and how deep it runs back from the street. */
const BLOCK_W = 8;
const BLOCK_D = 4;
/** The blocks, left to right along the street. */
const BLOCKS = [
  { name: 'house', zone: ZONE.ResLow },
  { name: 'shop', zone: ZONE.ComLow },
  { name: 'works', zone: ZONE.Industrial },
  { name: 'tall', zone: ZONE.ResHigh },
];
const STREET_LENGTH = BLOCKS.length * BLOCK_W + 4;
const GROW_SECONDS = 150;
/** How far along the build each set of frames is taken: earth and fence, foundation, two heights of frame, enclosed. */
const STAGES = [
  { name: 'earth', progress: 0.05 },
  { name: 'foundation', progress: 0.2 },
  { name: 'frame-high', progress: 0.65 },
  { name: 'enclosed', progress: 0.9 },
];

const browser = await chromium.launch({ headless: true, args: ['--use-angle=default'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
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
try {
  await page.goto(base + '?nobloom', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#viewport canvas', { timeout: 30000 });
  await hooksReady(page);
  const hook = (fn, arg) => page.evaluate(fn, arg);
  const cmd = (label, commands) => hook(([l, c]) => window.__slimcity.cmd(l, c), [label, commands]);
  const camera = tileCamera(page);

  // Dry ground within a few metres of flat, for the street, its blocks and the utilities.
  const g = await hook(() => window.__slimcity.readGrid());
  const N = g.size;
  const idx = (x, z) => z * N + x;
  let anchor = null;
  for (const slope of [4, 8]) {
    for (let z = 25; z < N - 35 && !anchor; z++) {
      for (let x = 25; x < N - STREET_LENGTH - 25 && !anchor; x++) {
        const h0 = g.height[idx(x, z)];
        let ok = true;
        for (let dz = -BLOCK_D - 3; dz < 8 && ok; dz++) {
          for (let dx = -2; dx < STREET_LENGTH + 2 && ok; dx++) {
            const i = idx(x + dx, z + dz);
            if (g.water[i] || Math.abs(g.height[i] - h0) > slope) ok = false;
          }
        }
        if (ok) anchor = { x, z };
      }
    }
    if (anchor) break;
  }
  if (!anchor) throw new Error('no flat dry ground for the street');
  const { x: X, z: Z } = anchor;
  console.log('street at', X, Z);

  await cmd('Sandbox', [
    { kind: 'setSandbox', on: true },
    { kind: 'setUnlimitedMoney', on: true },
  ]);
  await page.waitForTimeout(300);
  await cmd('Street', [
    {
      kind: 'buildRoad',
      tier: RT.TwoLane,
      tiles: Array.from({ length: STREET_LENGTH }, (_, i) => ({ x: X + i, z: Z })),
    },
  ]);
  // A plant and a tower south of the street, which the street carries to the blocks.
  // A lot's front is its south edge unturned, so these are turned half round to face the street.
  await cmd('Plant', [
    { kind: 'placeBuilding', catalogId: 'coal-plant', x: X + 2, z: Z + 1, rotation: 2 },
  ]);
  await cmd('Tower', [
    { kind: 'placeBuilding', catalogId: 'water-tower', x: X + 8, z: Z + 1, rotation: 2 },
  ]);
  const zoneBlock = (block) => {
    const i = BLOCKS.indexOf(block);
    const tiles = [];
    for (let dz = 1; dz <= BLOCK_D; dz++) {
      for (let dx = 0; dx < BLOCK_W; dx++) tiles.push({ x: X + 2 + i * BLOCK_W + dx, z: Z - dz });
    }
    return cmd('Zone', [{ kind: 'paintZone', zone: block.zone, tiles }]);
  };
  const blockOf = (b) => {
    const i = Math.floor((b.x - (X + 2)) / BLOCK_W);
    return b.z < Z && b.z >= Z - BLOCK_D ? BLOCKS[i] : undefined;
  };
  /** The buildings still going up in a block, by the block's name. */
  const goingUp = async () => {
    const standing = {};
    for (const b of await hook(() => window.__slimcity.readBuildings())) {
      const block = blockOf(b);
      if (block && b.state === 0) standing[block.name] = (standing[block.name] ?? []).concat(b);
    }
    return standing;
  };
  /** Runs held until every named block has a building going up, then pauses and shoots each. */
  const growHeldAndShoot = async (names) => {
    await hook(() => window.__slimcity.holdConstruction(true));
    await hook(() => window.__slimcity.setSpeed(4));
    let standing = {};
    for (let s = 0; s < GROW_SECONDS; s++) {
      await page.waitForTimeout(1000);
      standing = await goingUp();
      if (names.every((n) => (standing[n]?.length ?? 0) >= 2) && s > 15) break;
    }
    // Noon by the game's own clock (construction stays held while it runs on), so the strip
    // and the light agree.
    await setClock(page, 12);
    // A paused sim posts a snapshot only when a command lands: this one carries the phase to the lighting.
    await cmd('Phase', [{ kind: 'setUnlimitedMoney', on: true }]);
    for (const name of names) {
      const b = standing[name]?.[0];
      if (b) console.log(name, b.catalogId, 'at', b.x, b.z);
      else throw new Error(`construction-shots: no building began going up in the ${name} block`);
    }
    for (const stage of STAGES) {
      await hook((p) => window.__slimcity.constructionProgress(p), stage.progress);
      // A paused sim posts a snapshot only when a command lands: this one carries the new progress.
      await cmd('Progress', [{ kind: 'setUnlimitedMoney', on: true }]);
      await page.waitForTimeout(500);
      for (const name of names) {
        const b = standing[name]?.[0];
        if (!b) continue;
        await camera(b.x + 1, b.z + 1, 150, 0.3, 0.45);
        await page.waitForTimeout(1000);
        await cleanShot(page, `${out}/${name}-${stage.name}-street.png`);
        // From above only the groundworks show something the street view does not.
        if (stage.name === 'earth' || stage.name === 'foundation') {
          // A works' lot is 100 m by 60 m: stand back far enough to see all of it.
          await camera(b.x + 1, b.z + 1, name === 'works' ? 300 : 150, 0.3, 1.3);
          await page.waitForTimeout(1000);
          await cleanShot(page, `${out}/${name}-${stage.name}-above.png`);
        }
        // A near frame of the closed-in building from the street.
        if (stage.name === 'enclosed' && (name === 'tall' || name === 'shop')) {
          await camera(b.x + 1, b.z + 1, 70, 0.3, 0.45);
          await page.waitForTimeout(1000);
          await cleanShot(page, `${out}/${name}-enclosed-close.png`);
        }
      }
    }
  };

  // Homes first, held from their first tick: nothing else grows until people live somewhere.
  const named = (...names) => BLOCKS.filter((b) => names.includes(b.name));
  for (const block of named('house', 'tall')) await zoneBlock(block);
  await growHeldAndShoot(['house', 'tall']);

  // Then the hold is let go and the homes finish. Works are zoned first and held the moment
  // one is going up; a block fills and finishes within seconds, so zoning both at once lets
  // the other kind's window pass between polls. Shops open against open industry's jobs, so
  // they are zoned after the works have finished, one block at a time, each held the same way.
  for (const name of ['works', 'shop']) {
    await zoneBlock(named(name)[0]);
    await hook(() => window.__slimcity.holdConstruction(false));
    await hook(() => window.__slimcity.setSpeed(2));
    let begun = false;
    for (let s = 0; s < GROW_SECONDS * 4 && !begun; s++) {
      await page.waitForTimeout(250);
      begun = ((await goingUp())[name]?.length ?? 0) > 0;
      if (!begun && s % 120 === 0) console.log('waiting for the', name, 'block,', s / 4, 's');
    }
    if (!begun)
      throw new Error(`construction-shots: no building began going up in the ${name} block`);
    await growHeldAndShoot([name]);
  }
  await hook(() => window.__slimcity.holdConstruction(false));
  console.log(errors.length === 0 ? 'no page errors' : `page errors: ${errors.join(' | ')}`);
} finally {
  await browser.close();
}
