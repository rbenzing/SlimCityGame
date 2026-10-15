/** Frame budget: what a Metropolis costs a frame, by day and by night.
 *
 * Builds a SYNTHETIC city by command, not by growth: a grid of two-lane
 * streets over the dry ground of a generated map, then ~10,000 zoned buildings
 * at their catalog footprints in the catalog's real mix (the table below), and
 * one of every ploppable kit with a few of the biggest. The same four camera
 * views are read over the empty map first, so the city's cost is a difference.
 *
 * Frame time is read from requestAnimationFrame deltas with the browser's
 * frame cap off, and the draw calls and triangles of the last frame from the
 * renderer through the dev hook `renderInfo()`. Results land in the out
 * directory as result.json and result.md beside one PNG per view.
 *
 * Usage: node tools/frame-budget.mjs [baseUrl] [--buildings N] [--out dir]
 *        [--seed N] [--frames N]       (a dev server must be running) */
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hooksReady, tileCamera } from './shotcam.mjs';

// --- the mix ----------------------------------------------------------------

/** Share of all buildings per group, and the weight of each kind within the whole
 * residential or commercial or industrial set: the catalog's own `share` figures. */
const MIX = {
  residential: {
    share: 62,
    kinds: {
      detached: 61.1,
      duplex: 1.6,
      fourplex: 1.2,
      townhouse: 1.6,
      multiplex: 0.63,
      garden: 0.3,
      midrise: 0.11,
      tower: 0.07,
      mixed: 1,
    },
  },
  commercial: {
    share: 25,
    kinds: {
      shop: 350,
      strip: 166,
      supermarket: 46,
      restaurant: 286,
      fuel: 123,
      office: 970,
      hotel: 107,
    },
  },
  industrial: {
    share: 13,
    kinds: {
      workshop: 22,
      warehouse: 55,
      factory: 8,
      flex: 9,
      foodplant: 43,
      chemical: 26,
      metals: 6,
      paper: 6,
    },
  },
};
/** Percent of buildings at level 1, 2 and 3. */
const LEVEL_SHARE = [70, 22, 8];
/** Percent of detached homes per lot size. */
const LOT_SHARE = { half: 30, normal: 40, double: 20, estate: 8, acre: 2 };
/** The residential kinds too big for a two-deep strip stand downtown with the commercial. */
const DOWNTOWN_RESIDENTIAL = ['midrise', 'tower', 'mixed'];
/** Extra copies of the biggest ploppables, on top of the one of every kit. */
const EXTRA_KITS = {
  school: 4,
  'middle-school': 2,
  'high-school': 2,
  college: 2,
  hospital: 2,
  'fire-station': 4,
  'police-station': 4,
  'fire-station-district': 2,
  'police-station-district': 2,
};
/** Rows of buildings either side of a street, per district. */
const STRIP_DEPTH = { residential: 2, downtown: 4, industrial: 4 };
/** Tiles left bare around the map edge, and the band along the south edge held back for the kits. */
const MARGIN = 3;
const KIT_ROWS = 14;

// --- arguments --------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 ? args[at + 1] : fallback;
};
const flagValues = new Set(['--buildings', '--out', '--seed', '--frames']);
const base =
  args.find((a, i) => !a.startsWith('--') && !flagValues.has(args[i - 1] ?? '')) ??
  'http://localhost:5173';
const TARGET = Number(flag('buildings', 10000));
const out = flag('out', 'tools/shots-framebudget');
const SEED = Number(flag('seed', 7));
const FRAMES = Number(flag('frames', 240));
const WARMUP = 30;
mkdirSync(out, { recursive: true });

const catalog = JSON.parse(
  readFileSync(new URL('../src/data/catalog.json', import.meta.url), 'utf8'),
).buildings;
const byId = new Map(catalog.map((e) => [e.id, e]));
const grown = catalog.filter((e) => !e.id.includes('-lot'));

// --- a seeded stream --------------------------------------------------------

const lcg = (seed) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};
const pickWeighted = (rng, pairs) => {
  const total = pairs.reduce((a, [, w]) => a + w, 0);
  let r = rng() * total;
  for (const [item, w] of pairs) {
    r -= w;
    if (r < 0) return item;
  }
  return pairs[pairs.length - 1][0];
};

// --- choosing what stands in a strip ---------------------------------------

/** Every kind in the mix with its weight in percent of ALL buildings, by district. */
function districtKinds(district) {
  const out = [];
  const residentialTotal = Object.values(MIX.residential.kinds).reduce((a, b) => a + b, 0);
  const resWeight = (kind) =>
    (MIX.residential.share * MIX.residential.kinds[kind]) / residentialTotal;
  const groupOf = (group) => {
    const total = Object.values(MIX[group].kinds).reduce((a, b) => a + b, 0);
    return Object.entries(MIX[group].kinds).map(([kind, w]) => ({
      category: group === 'residential' ? 'res' : group === 'commercial' ? 'com' : 'ind',
      kind,
      weight: (MIX[group].share * w) / total,
    }));
  };
  if (district === 'residential') {
    for (const k of Object.keys(MIX.residential.kinds)) {
      if (!DOWNTOWN_RESIDENTIAL.includes(k))
        out.push({ category: 'res', kind: k, weight: resWeight(k) });
    }
  } else if (district === 'downtown') {
    out.push(...groupOf('commercial'));
    for (const k of DOWNTOWN_RESIDENTIAL)
      out.push({ category: 'res', kind: k, weight: resWeight(k) });
  } else {
    out.push(...groupOf('industrial'));
  }
  return out;
}

const districtShare = (district) => districtKinds(district).reduce((a, k) => a + k.weight, 0) / 100;

/** The catalog entry for one building: kind, level and, for a detached home, lot size, that fits a strip `depth` rows deep. */
function chooseEntry(rng, kinds, depth) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const k = pickWeighted(
      rng,
      kinds.map((x) => [x, x.weight]),
    );
    const level = pickWeighted(rng, [
      [1, LEVEL_SHARE[0]],
      [2, LEVEL_SHARE[1]],
      [3, LEVEL_SHARE[2]],
    ]);
    const fits = grown.filter(
      (e) =>
        e.category === k.category &&
        e.kind === k.kind &&
        e.level === level &&
        e.footprint.d <= depth,
    );
    if (fits.length === 0) continue;
    if (k.kind !== 'detached') return fits[Math.floor(rng() * fits.length)];
    const lots = Object.entries(LOT_SHARE).filter(([lot]) => fits.some((e) => e.lot === lot));
    const lot = pickWeighted(rng, lots);
    const ofLot = fits.filter((e) => e.lot === lot);
    return ofLot[Math.floor(rng() * ofLot.length)];
  }
  return null;
}

// --- planning the city ------------------------------------------------------

/**
 * Packs one district's strips with buildings until `target` stand or the strips
 * run out. Streets run east-west every `2 * depth + 1` rows from `zTop`; a strip
 * is the `depth` rows beside one street, so every building touches a street.
 * `free(x, z)` is whether a tile is dry and unclaimed; the packer claims what it uses.
 */
function packDistrict(name, x0, x1, zTop, zBottom, target, seedSalt, free, claim) {
  const depth = STRIP_DEPTH[name];
  const rng = lcg(0x9e3779b9 + seedSalt);
  const kinds = districtKinds(name);
  const placements = [];
  const streets = [];
  const spacing = 2 * depth + 1;
  for (
    let street = zTop;
    street + spacing <= zBottom && placements.length < target;
    street += spacing
  ) {
    streets.push(street);
    const next = street + spacing;
    for (const north of [true, false]) {
      let x = x0 + 1;
      while (x < x1 - 1 && placements.length < target) {
        const entry = chooseEntry(rng, kinds, depth);
        if (!entry) break;
        const { w, d } = entry.footprint;
        if (x + w > x1 - 1) break;
        const z = north ? street + 1 : next - d;
        let open = true;
        for (let dz = 0; dz < d && open; dz++)
          for (let dx = 0; dx < w && open; dx++) if (!free(x + dx, z + dz)) open = false;
        if (!open) {
          x += 1;
          continue;
        }
        for (let dz = 0; dz < d; dz++) for (let dx = 0; dx < w; dx++) claim(x + dx, z + dz);
        placements.push({ catalogId: entry.id, x, z, rotation: 0, district: name });
        x += w;
      }
    }
    if (street + spacing > zBottom - 1) break;
  }
  return { placements, streets, spacing };
}

/** Which tiles are dry, in bounds and unclaimed, starting from the tiles `taken` already holds. */
function occupancy(water, N, taken) {
  const used = taken ? Uint8Array.from(taken) : new Uint8Array(N * N);
  return {
    free: (x, z) =>
      x >= MARGIN &&
      z >= MARGIN &&
      x < N - MARGIN &&
      z < N - MARGIN &&
      !water[z * N + x] &&
      !used[z * N + x],
    claim: (x, z) => {
      used[z * N + x] = 1;
    },
    used,
  };
}

/** Sites every kit before the districts claim the ground: shore kits on the first shore that fits, the rest in a band along the south edge, biggest first. */
function planKits(water, N, ids) {
  const occ = occupancy(water, N);
  const area = (id) => byId.get(id).footprint.w * byId.get(id).footprint.d;
  const wetKit = (id) => byId.get(id).requiresAdjacent === 'water';
  const sorted = [...ids].sort(
    (a, b) => Number(wetKit(b)) - Number(wetKit(a)) || area(b) - area(a),
  );
  const placements = [];
  const misses = [];
  for (const id of sorted) {
    const { w, d } = byId.get(id).footprint;
    const shore = wetKit(id);
    const site = siteFor(occ, water, N, w, d, shore, shore ? MARGIN + 1 : N - MARGIN - KIT_ROWS);
    if (!site) {
      misses.push(id);
      continue;
    }
    for (let dz = 0; dz < d; dz++)
      for (let dx = 0; dx < w; dx++) occ.claim(site.x + dx, site.z + dz);
    placements.push({ catalogId: id, x: site.x, z: site.z, rotation: 0, district: 'kit' });
  }
  return { placements, misses, used: occ.used };
}

/** Lays out all three districts side by side, each as narrow as it can be and still hold its share. */
function planCity(water, N, total, kitSites) {
  const zTop = MARGIN;
  const zBottom = N - MARGIN - KIT_ROWS;
  const make = () => occupancy(water, N, kitSites.used);
  const districts = [];
  const margin = MARGIN;
  let x0 = margin;
  const order = ['residential', 'downtown', 'industrial'];
  for (const [i, name] of order.entries()) {
    const target = Math.round(total * districtShare(name));
    const last = i === order.length - 1;
    const room = N - margin - x0;
    const remaining = order.slice(i).reduce((a, n) => a + districtShare(n), 0);
    let lo = 8;
    let hi = Math.min(room, Math.ceil((room * districtShare(name)) / remaining));
    if (!last) {
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        const probe = make();
        const got = packDistrict(
          name,
          x0,
          x0 + mid,
          zTop,
          zBottom,
          target,
          i,
          probe.free,
          probe.claim,
        );
        if (got.placements.length >= target) hi = mid;
        else lo = mid + 1;
      }
    } else lo = room;
    const x1 = x0 + lo;
    districts.push({ name, x0, x1, target });
    x0 = x1;
  }
  // Pack for real with the final widths, sharing one claim map so the kits can see what is left.
  const shared = make();
  const plan = { districts: [], placements: [], streets: [], shared, N, margin };
  for (const [i, d] of districts.entries()) {
    const got = packDistrict(
      d.name,
      d.x0,
      d.x1,
      zTop,
      zBottom,
      d.target,
      i,
      shared.free,
      shared.claim,
    );
    plan.districts.push({
      ...d,
      placed: got.placements.length,
      streets: got.streets,
      spacing: got.spacing,
    });
    plan.placements.push(...got.placements);
    for (const z of got.streets) plan.streets.push({ x0: d.x0, x1: d.x1, z });
  }
  return plan;
}

/** Runs of consecutive dry tiles along a row or column, cut to chunks short enough that one refusal costs little. */
function roadRuns(plan, water) {
  const { N } = plan;
  const runs = [];
  const CHUNK = 24;
  const dry = (x, z) => !water[z * N + x];
  const cut = (tiles) => {
    for (let i = 0; i < tiles.length; i += CHUNK) {
      const slice = tiles.slice(i, i + CHUNK + 1);
      if (slice.length >= 2) runs.push(slice);
    }
  };
  for (const s of plan.streets) {
    let run = [];
    for (let x = s.x0; x < s.x1; x++) {
      if (dry(x, s.z)) run.push({ x, z: s.z });
      else {
        cut(run);
        run = [];
      }
    }
    cut(run);
  }
  // A street down each district's west edge ties its rows together.
  for (const d of plan.districts) {
    if (d.streets.length === 0) continue;
    const zEnd = d.streets[d.streets.length - 1];
    let run = [];
    for (let z = d.streets[0]; z <= zEnd; z++) {
      if (dry(d.x0, z)) run.push({ x: d.x0, z });
      else {
        cut(run);
        run = [];
      }
    }
    cut(run);
  }
  return runs;
}

/** The first free rectangle with a one-tile apron, scanning rows from `zFrom`; a shore kit wants water orthogonally beside it and needs no apron. */
function siteFor(occ, water, N, w, d, shore, zFrom) {
  const clear = (x, z) => occ.free(x, z);
  const wet = (x, z) => x >= 0 && z >= 0 && x < N && z < N && water[z * N + x] === 1;
  for (let z = zFrom; z < N - MARGIN - d - 1; z++) {
    for (let x = MARGIN + 1; x < N - MARGIN - w - 1; x++) {
      let ok = true;
      for (let dz = -1; dz <= d && ok; dz++)
        for (let dx = -1; dx <= w && ok; dx++) {
          const inside = dx >= 0 && dz >= 0 && dx < w && dz < d;
          if ((inside || !shore) && !clear(x + dx, z + dz)) ok = false;
        }
      if (!ok) continue;
      if (shore) {
        let touches = false;
        for (let k = 0; k < w; k++) touches ||= wet(x + k, z - 1) || wet(x + k, z + d);
        for (let k = 0; k < d; k++) touches ||= wet(x - 1, z + k) || wet(x + w, z + k);
        if (!touches) continue;
      }
      return { x, z };
    }
  }
  return null;
}

// --- the page ---------------------------------------------------------------

const browser = await chromium.launch({
  headless: true,
  args: ['--use-angle=default', '--disable-gpu-vsync', '--disable-frame-rate-limit'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
await page.addInitScript(
  ([session]) => {
    try {
      sessionStorage.setItem('slimcity.session', JSON.stringify(session));
      localStorage.setItem(
        'slimcity.settings',
        JSON.stringify({ sandboxUnlockAll: true, unlimitedMoney: true }),
      );
    } catch (e) {
      void e;
    }
  },
  [{ screen: 'playing', seed: SEED, mode: 'new' }],
);

const result = { seed: SEED, target: TARGET, frames: FRAMES };
try {
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#viewport canvas', { timeout: 60000 });
  await hooksReady(page);
  await page.evaluate(() => {
    window.__slimcity.cmd('Sandbox', [{ kind: 'setSandbox', on: true }]);
    window.__slimcity.cmd('Money', [{ kind: 'setUnlimitedMoney', on: true }]);
    window.__slimcity.setSpeed(0);
    window.__slimcity.setDayT(0.5);
  });
  await page.waitForTimeout(1500);

  result.machine = await page.evaluate(async () => {
    const info = { userAgent: navigator.userAgent, cores: navigator.hardwareConcurrency };
    try {
      const adapter = await navigator.gpu?.requestAdapter();
      const a = adapter?.info;
      info.webgpuAdapter = a
        ? {
            vendor: a.vendor,
            architecture: a.architecture,
            device: a.device,
            description: a.description,
          }
        : null;
    } catch (e) {
      info.webgpuAdapter = `unavailable: ${String(e)}`;
    }
    const gl = document.createElement('canvas').getContext('webgl2');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    info.webglRenderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
    info.webglVendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : null;
    info.devicePixelRatio = window.devicePixelRatio;
    return info;
  });
  console.log('machine', JSON.stringify(result.machine));

  const grid = await page.evaluate(() => window.__slimcity.readGrid());
  const N = grid.size;
  const water = Uint8Array.from(grid.water);
  const tier = await page.evaluate(
    async () => (await import('/src/shared/types.ts')).RoadTier.TwoLane,
  );
  const kitIds = await page.evaluate(
    async () => (await import('/src/render/utilitykits.ts')).UTILITY_KIT_CATALOG_IDS,
  );

  // --- plan, before anything is built, so the views can be fixed on it ---
  const kitOrder = [...kitIds];
  for (const [id, copies] of Object.entries(EXTRA_KITS))
    for (let i = 0; i < copies; i++) kitOrder.push(id);
  const kits = planKits(water, N, kitOrder);
  const kitPlacements = kits.placements;
  const kitMisses = kits.misses;
  const plan = planCity(water, N, TARGET, kits);
  const runs = roadRuns(plan, water);
  console.log(
    'plan',
    JSON.stringify(plan.districts.map((d) => [d.name, d.x0, d.x1, d.target, d.placed])),
    'road runs',
    runs.length,
    'kits',
    kitPlacements.length,
    'kit misses',
    JSON.stringify(kitMisses),
  );

  // --- the four views, fixed on the plan ---
  const res = plan.districts[0];
  const down = plan.districts[1];
  const zMid = Math.round(N / 2);
  const resStreet = res.streets.reduce((best, z) =>
    Math.abs(z - zMid) < Math.abs(best - zMid) ? z : best,
  );
  const bounds = plan.districts.reduce(
    (b, d) => ({ x0: Math.min(b.x0, d.x0), x1: Math.max(b.x1, d.x1) }),
    { x0: N, x1: 0 },
  );
  const usedRows = plan.districts.flatMap((d) => d.streets);
  const centre = {
    x: Math.round((bounds.x0 + bounds.x1) / 2),
    z: Math.round((Math.min(...usedRows) + Math.max(...usedRows)) / 2),
  };
  const VIEWS = [
    {
      name: '1-street',
      label: 'street level, residential grid',
      tx: Math.round((res.x0 + res.x1) / 2),
      tz: resStreet,
      distance: 40,
      yaw: Math.PI / 2,
      pitch: 0.12,
      night: false,
    },
    {
      name: '2-oblique',
      label: 'default oblique, mixed block',
      tx: down.x0,
      tz: zMid,
      distance: 380,
      yaw: 0,
      pitch: 0.7,
      night: false,
    },
    {
      name: '3-overview',
      label: 'high overview, whole city',
      tx: centre.x,
      tz: centre.z,
      distance: 3000,
      yaw: 0,
      pitch: 1.1,
      night: false,
    },
    {
      name: '4-oblique-night',
      label: 'default oblique at night',
      tx: down.x0,
      tz: zMid,
      distance: 380,
      yaw: 0,
      pitch: 0.7,
      night: true,
    },
  ];
  result.views = VIEWS.map(({ name, label, tx, tz, distance }) => ({
    name,
    label,
    tx,
    tz,
    distance,
  }));

  const camera = tileCamera(page);
  const measure = () =>
    page.evaluate(
      ([frames, warm]) =>
        new Promise((resolve) => {
          const dts = [];
          let last = performance.now();
          const tick = (now) => {
            dts.push(now - last);
            last = now;
            if (dts.length < frames + warm) requestAnimationFrame(tick);
            else {
              const s = dts.slice(warm).sort((a, b) => a - b);
              const mean = s.reduce((a, b) => a + b, 0) / s.length;
              const info = window.__slimcity.renderInfo();
              resolve({
                meanMs: mean,
                p50Ms: s[Math.floor(s.length * 0.5)],
                p95Ms: s[Math.floor(s.length * 0.95)],
                frames: s.length,
                drawCalls: info.drawCalls,
                triangles: info.triangles,
              });
            }
          };
          requestAnimationFrame(tick);
        }),
      [FRAMES, WARMUP],
    );

  // Every refused placement raises a toast, which would cover the shot.
  const dismissToasts = () =>
    page.evaluate(() => {
      for (let i = 0; i < 100; i++) {
        const buttons = document.querySelectorAll('[aria-label="Dismiss notification"]');
        if (buttons.length === 0) return;
        buttons.forEach((b) => b.click());
      }
    });

  // The pinned phase reaches the lighting with the next sim snapshot, and a paused sim
  // posts one only when a command lands. The sim itself never runs: over a city with no
  // power, water or zones it abandons and clears the buildings within a minute.
  let phase = null;
  const setPhase = async (t) => {
    if (phase === t) return;
    await page.evaluate((day) => {
      window.__slimcity.setDayT(day);
      window.__slimcity.cmd('Phase', [{ kind: 'setUnlimitedMoney', on: true }]);
    }, t);
    await page.waitForTimeout(2000);
    phase = t;
  };

  const readViews = async (tag) => {
    const rows = [];
    for (const v of VIEWS) {
      await setPhase(v.night ? 0.96 : 0.5);
      await camera(v.tx, v.tz, v.distance, v.yaw, v.pitch);
      await page.waitForTimeout(2500);
      await dismissToasts();
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${out}/${tag}-${v.name}.png` });
      const m = await measure();
      rows.push({ view: v.name, label: v.label, ...m });
      console.log(tag, v.name, JSON.stringify(m));
    }
    return rows;
  };

  result.baseline = await readViews('baseline');

  // --- build ---
  const started = Date.now();
  const send = async (label, commands) => {
    const CHUNK = 200;
    for (let i = 0; i < commands.length; i += CHUNK) {
      await page.evaluate(
        ([l, list]) => {
          for (const c of list) window.__slimcity.cmd(l, [c]);
        },
        [label, commands.slice(i, i + CHUNK)],
      );
      await page.waitForTimeout(60);
    }
  };
  const settle = async (what, count) => {
    let last = -1;
    let stable = 0;
    const deadline = Date.now() + 15 * 60 * 1000;
    while (stable < 4 && Date.now() < deadline) {
      await page.waitForTimeout(500);
      const now = await count();
      stable = now === last ? stable + 1 : 0;
      last = now;
    }
    console.log('settled', what, last);
    return last;
  };
  const roadTiles = () =>
    page.evaluate(() => window.__slimcity.readGrid().roadTier.filter((t) => t > 0).length);
  const buildingCount = () => page.evaluate(() => window.__slimcity.readBuildings().length);

  await send(
    'Street',
    runs.map((tiles) => ({ kind: 'buildRoad', tier, tiles })),
  );
  const roadCount = await settle('roads', roadTiles);
  const wanted = new Set();
  for (const run of runs) for (const t of run) wanted.add(`${t.x},${t.z}`);
  result.roads = { tilesPlanned: wanted.size, tilesBuilt: roadCount };

  const all = [...plan.placements, ...kitPlacements];
  await send(
    'Place',
    all.map((p) => ({
      kind: 'placeBuilding',
      catalogId: p.catalogId,
      x: p.x,
      z: p.z,
      rotation: p.rotation,
    })),
  );
  await settle('buildings', buildingCount);
  result.buildMs = Date.now() - started;

  const standing = await page.evaluate(() => window.__slimcity.readBuildings());
  const at = new Set(standing.map((b) => `${b.catalogId}@${b.x},${b.z}`));
  const missing = all.filter((p) => !at.has(`${p.catalogId}@${p.x},${p.z}`));
  const tally = (list) => {
    const t = {};
    for (const p of list) t[p.district] = (t[p.district] ?? 0) + 1;
    return t;
  };
  result.buildings = {
    planned: all.length,
    standing: standing.length,
    refused: missing.length,
    plannedByDistrict: tally(all),
    refusedByDistrict: tally(missing),
    refusedExamples: missing.slice(0, 8).map((p) => `${p.catalogId}@${p.x},${p.z}`),
    kitMisses,
    standingByCatalogId: standing.reduce(
      (m, b) => ((m[b.catalogId] = (m[b.catalogId] ?? 0) + 1), m),
      {},
    ),
  };

  // Whether a placed home got a lot plan (drive, yard, front door): proof the lots draw.
  result.lots = await page.evaluate(() => {
    const homes = window.__slimcity
      .readBuildings()
      .filter((b) => /^res-(half|normal|low|estate|acre)/.test(b.catalogId));
    const sample = homes.filter((_, i) => i % Math.max(1, Math.floor(homes.length / 300)) === 0);
    const planned = sample.filter((b) => window.__slimcity.readHousePlan(b.id) !== null).length;
    return { sampled: sample.length, withLotPlan: planned };
  });
  console.log('buildings', JSON.stringify({ ...result.buildings, standingByCatalogId: undefined }));
  console.log('lots', JSON.stringify(result.lots), 'build ms', result.buildMs);

  await page.waitForTimeout(3000);
  result.city = await readViews('city');
  result.errors = errors.slice(0, 20);
  result.errorCount = errors.length;

  // --- report ---
  const f = (n) => n.toFixed(1);
  const lines = [
    `# Frame budget (seed ${SEED}, ${standing.length} buildings standing of ${all.length} planned)`,
    '',
    `Machine: ${result.machine.webglRenderer ?? 'unknown GPU'} / ${result.machine.userAgent}`,
    '',
    '| View | Case | mean ms | p50 ms | p95 ms | draw calls | triangles |',
    '| ---- | ---- | ------- | ------ | ------ | ---------- | --------- |',
  ];
  for (const [i, v] of VIEWS.entries()) {
    const b = result.baseline[i];
    const c = result.city[i];
    const row = (tag, r) =>
      `| ${v.name} | ${tag} | ${f(r.meanMs)} | ${f(r.p50Ms)} | ${f(r.p95Ms)} | ${r.drawCalls} | ${r.triangles} |`;
    lines.push(row('empty map', b), row('city', c));
    lines.push(
      `| ${v.name} | difference | ${f(c.meanMs - b.meanMs)} | ${f(c.p50Ms - b.p50Ms)} | ${f(c.p95Ms - b.p95Ms)} | ${c.drawCalls - b.drawCalls} | ${c.triangles - b.triangles} |`,
    );
  }
  const markdown = lines.join('\n');
  writeFileSync(`${out}/result.md`, `${markdown}\n`);
  writeFileSync(`${out}/result.json`, `${JSON.stringify(result, null, 2)}\n`);
  console.log(markdown);
  console.log('page errors', errors.length ? errors.slice(0, 5) : 'none');
} finally {
  await browser.close();
}
