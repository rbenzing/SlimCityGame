/** Frame budget: what a Metropolis costs a frame, by day and by night.
 *
 * Builds a SYNTHETIC city by command, not by growth: a grid of two-lane
 * streets over the dry ground of a generated map, then ~10,000 zoned buildings
 * at their catalog footprints in the catalog's real mix (the table below), and
 * one of every ploppable kit with a few of the biggest. The same camera views
 * are read over the empty map first, so the city's cost is a difference. Views
 * 1 to 4 look at the dry ground; 5-water is the default oblique centred on the
 * deepest tile of the largest body of water (found from the tile water mask),
 * so the water surface fills the frame.
 *
 * Frame time is read from requestAnimationFrame deltas with the browser's
 * frame cap off, and the draw calls and triangles of the last frame from the
 * renderer through the dev hook `renderInfo()`. Results land in the out
 * directory as result.json and result.md beside one PNG per view.
 *
 * Usage: node tools/probes/frame-budget.mjs [baseUrl] [--buildings N] [--out dir]
 *        [--seed N] [--frames N] [--generator N] [--webgpu]   (a dev server must be running;
 *        the terrain generator is the first unless one is named; --webgpu runs full Chromium on
 *        the WebGPU backend instead of the headless shell's WebGL2 fallback)
 *
 * Cost mode (dev server only, set SHOTS_DISCRETE_GPU=1 for the discrete card):
 *   --ablate       after the city is built, measure each view with one cost switched off at a
 *                  time, `--runs N` passes (default 3), every case interleaved with the baseline;
 *   --cases a,b    only these cases (see CASES); --views 1-street,3-overview only these views;
 *   --noaa         load the page with antialiasing off (a fresh renderer, so a separate run);
 *   --census       list the triangles each group and the five largest meshes submit, and how many
 *                  instances are in view;
 *   --profile      a CPU profile of the main thread over the baseline oblique and street views;
 *   --tag name     names the files written to the out directory (ablate-name.json / .md). */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hooksReady, tileCamera } from '../shots/lib/camera.mjs';
import { launchBrowser } from '../shots/lib/session.mjs';

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
const flagValues = new Set([
  '--buildings',
  '--out',
  '--seed',
  '--frames',
  '--generator',
  '--cases',
  '--views',
  '--runs',
  '--tag',
]);
const base =
  args.find((a, i) => !a.startsWith('--') && !flagValues.has(args[i - 1] ?? '')) ??
  'http://localhost:5173';
const TARGET = Number(flag('buildings', 10000));
const out = flag('out', 'tools/shots-framebudget');
const SEED = Number(flag('seed', 7));
const FRAMES = Number(flag('frames', 240));
const GENERATOR = flag('generator', undefined);
const WEBGPU = args.includes('--webgpu');
const ABLATE = args.includes('--ablate');
const NOAA = args.includes('--noaa');
const CENSUS = args.includes('--census');
const PROFILE = args.includes('--profile');
const RUNS = Number(flag('runs', 3));
const TAG = flag('tag', 'run');
const ONLY_CASES = flag('cases', undefined)?.split(',');
const ONLY_VIEWS = flag('views', undefined)?.split(',');
const WARMUP = 30;
mkdirSync(out, { recursive: true });

const catalog = JSON.parse(
  readFileSync(new URL('../../src/data/catalog.json', import.meta.url), 'utf8'),
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

/** Sites every kit before the districts claim the ground: shore kits on the first shore that fits, the rest in a band along the south edge, biggest first. A kit that stands only beside rail gets a run of track along its south edge, claimed with it. */
function planKits(water, N, ids) {
  const occ = occupancy(water, N);
  const area = (id) => byId.get(id).footprint.w * byId.get(id).footprint.d;
  const wetKit = (id) => byId.get(id).requiresAdjacent === 'water';
  const railKit = (id) => byId.get(id).requiresAdjacent === 'rail';
  const sorted = [...ids].sort(
    (a, b) => Number(wetKit(b)) - Number(wetKit(a)) || area(b) - area(a),
  );
  const placements = [];
  const misses = [];
  const rails = [];
  for (const id of sorted) {
    const { w, d } = byId.get(id).footprint;
    const shore = wetKit(id);
    const site = siteFor(occ, water, N, w, d, shore, shore ? MARGIN + 1 : N - MARGIN - KIT_ROWS);
    if (!site) {
      misses.push(id);
      continue;
    }
    if (railKit(id)) {
      const track = [site.z + d, site.z - 1].find((z) => {
        for (let dx = -1; dx <= w; dx++) if (!occ.free(site.x + dx, z)) return false;
        return true;
      });
      if (track === undefined) {
        misses.push(id);
        continue;
      }
      const tiles = [];
      for (let dx = -1; dx <= w; dx++) {
        occ.claim(site.x + dx, track);
        tiles.push({ x: site.x + dx, z: track });
      }
      rails.push(tiles);
    }
    for (let dz = 0; dz < d; dz++)
      for (let dx = 0; dx < w; dx++) occ.claim(site.x + dx, site.z + dz);
    placements.push({ catalogId: id, x: site.x, z: site.z, rotation: 0, district: 'kit' });
  }
  return { placements, misses, rails, used: occ.used };
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

/** The wettest tile of the largest 4-connected body of water: the water tile farthest from any dry tile (by steps over the grid), so a view centred on it looks over open water. Null when the map has no water. */
function deepestWater(water, N) {
  const body = new Int32Array(N * N).fill(-1);
  const sizes = [];
  const stack = [];
  for (let start = 0; start < N * N; start++) {
    if (!water[start] || body[start] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    body[start] = id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop();
      size++;
      const x = i % N;
      const z = (i - x) / N;
      for (const [nx, nz] of [
        [x + 1, z],
        [x - 1, z],
        [x, z + 1],
        [x, z - 1],
      ]) {
        if (nx < 0 || nz < 0 || nx >= N || nz >= N) continue;
        const n = nz * N + nx;
        if (water[n] && body[n] < 0) {
          body[n] = id;
          stack.push(n);
        }
      }
    }
    sizes.push(size);
  }
  if (sizes.length === 0) return null;
  const largest = sizes.indexOf(Math.max(...sizes));
  // Steps from the nearest dry tile, by breadth-first sweep; water meeting the map edge is open sea, not a shore.
  const dist = new Int32Array(N * N).fill(-1);
  let frontier = [];
  for (let i = 0; i < N * N; i++) {
    const x = i % N;
    const z = (i - x) / N;
    if (body[i] !== largest) continue;
    const inland = x > 0 && z > 0 && x < N - 1 && z < N - 1;
    if (inland && [i + 1, i - 1, i + N, i - N].some((n) => body[n] !== largest)) {
      dist[i] = 1;
      frontier.push(i);
    }
  }
  let best = frontier[0] ?? body.indexOf(largest);
  let depth = 1;
  while (frontier.length) {
    best = frontier[0];
    const next = [];
    for (const i of frontier) {
      const x = i % N;
      for (const n of [x < N - 1 ? i + 1 : -1, x > 0 ? i - 1 : -1, i + N, i - N]) {
        if (n >= 0 && n < N * N && body[n] === largest && dist[n] < 0) {
          dist[n] = depth + 1;
          next.push(n);
        }
      }
    }
    frontier = next;
    depth++;
  }
  return { x: best % N, z: (best - (best % N)) / N, tiles: sizes[largest] };
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

const browser = await launchBrowser(WEBGPU, [
  '--disable-gpu-vsync',
  '--disable-frame-rate-limit',
  // Timestamp queries are an unsafe-API feature in Chromium; the cost mode reads GPU time from them.
  ...(ABLATE || CENSUS || PROFILE
    ? ['--enable-webgpu-developer-features', '--enable-dawn-features=allow_unsafe_apis']
    : []),
]);
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text());
});
// The cost mode counts the buffer writes the page makes: calls, bytes and the time inside the call.
if (ABLATE || CENSUS || PROFILE)
  await page.addInitScript(() => {
    window.__upload = { calls: 0, bytes: 0, ms: 0 };
    if (typeof GPUQueue === 'undefined') return;
    const write = GPUQueue.prototype.writeBuffer;
    GPUQueue.prototype.writeBuffer = function (buffer, offset, data, ...rest) {
      const t = performance.now();
      const result = write.call(this, buffer, offset, data, ...rest);
      window.__upload.ms += performance.now() - t;
      window.__upload.calls++;
      window.__upload.bytes += data.byteLength ?? 0;
      return result;
    };
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
  [
    {
      screen: 'playing',
      seed: SEED,
      mode: 'new',
      ...(GENERATOR === undefined ? {} : { generator: Number(GENERATOR) }),
    },
  ],
);

const result = { seed: SEED, target: TARGET, frames: FRAMES };
try {
  const query = [NOAA ? 'noaa' : '', ABLATE || CENSUS || PROFILE ? 'gputime' : '']
    .filter(Boolean)
    .join('&');
  await page.goto(query ? `${base.replace(/\/$/, '')}/?${query}` : base, {
    waitUntil: 'domcontentloaded',
  });
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
  const railTier = await page.evaluate(
    async () => (await import('/src/shared/types.ts')).RoadTier.RailTrack,
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
  const lake = deepestWater(water, N);
  if (!lake) console.log('no water on this map: the 5-water view is skipped');
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
    ...(lake
      ? [
          {
            name: '5-water',
            label: 'default oblique over the largest body of water',
            tx: lake.x,
            tz: lake.z,
            distance: 380,
            yaw: 0,
            pitch: 0.7,
            night: false,
          },
        ]
      : []),
  ];
  result.views = VIEWS.map(({ name, label, tx, tz, distance }) => ({
    name,
    label,
    tx,
    tz,
    distance,
  }));

  const camera = tileCamera(page);
  const measurePaced = (frames) =>
    page.evaluate(
      ([frames, warm]) =>
        new Promise((resolve) => {
          window.__slimcity.takeFrameJs();
          const dts = [];
          let last = performance.now();
          const tick = (now) => {
            dts.push(now - last);
            last = now;
            if (dts.length < frames + warm) requestAnimationFrame(tick);
            else {
              const timed = dts.slice(warm);
              const s = [...timed].sort((a, b) => a - b);
              const median = s[Math.floor(s.length * 0.5)];
              // Where in the run the frames over twice the median fell: a periodic stall and a slow start look different here.
              const slowAt = timed.flatMap((d, i) => (d > 2 * median ? [i] : []));
              // A GPU-bound run lets the CPU queue frames ahead and then stall, so single-frame deltas alternate fast and slow while their average is the true cost; the 95th percentile of eight-frame averages is the stall-free read of the slow end.
              const windows = [];
              for (let i = 0; i + 8 <= timed.length; i += 8) {
                windows.push(timed.slice(i, i + 8).reduce((a, b) => a + b, 0) / 8);
              }
              windows.sort((a, b) => a - b);
              const mean = s.reduce((a, b) => a + b, 0) / s.length;
              const info = window.__slimcity.renderInfo();
              // Main-thread time of the frame callback and of the render call inside it, over the frames just timed.
              const js = window.__slimcity.takeFrameJs();
              const meanOf = (list) =>
                list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0;
              resolve({
                jsFrameMs: meanOf(js.frame.slice(-timed.length)),
                jsRenderMs: meanOf(js.render.slice(-timed.length)),
                meanMs: mean,
                p50Ms: s[Math.floor(s.length * 0.5)],
                p95Ms: s[Math.floor(s.length * 0.95)],
                frames: s.length,
                slowAt,
                p95Of8Ms: windows[Math.floor(windows.length * 0.95)],
                drawCalls: info.drawCalls,
                triangles: info.triangles,
              });
            }
          };
          requestAnimationFrame(tick);
        }),
      [frames, WARMUP],
    );

  // The page's own frame times, and the GPU's own time per frame from timestamp queries
  // (gpuMs is null where the card gives none).
  const measure = async (frames = FRAMES) => {
    await page.evaluate(() => {
      window.__upload = { calls: 0, bytes: 0, ms: 0 };
    });
    const paced = await measurePaced(frames);
    // Buffer writes the page made during those frames (warm-up included), per frame.
    const up = await page.evaluate(() => window.__upload);
    const drawn = frames + WARMUP;
    const samples = await page.evaluate(() => window.__slimcity.sampleGpuMs(12));
    const sorted = (samples ?? []).sort((a, b) => a - b);
    return {
      ...paced,
      gpuMs: sorted.length ? sorted[sorted.length >> 1] : null,
      uploadMs: up.ms / drawn,
      uploadMB: up.bytes / drawn / 1048576,
      uploadCalls: up.calls / drawn,
    };
  };

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
  // The track a rail station stands beside, laid with the streets so it is there when the station is placed.
  await send(
    'Rail',
    kits.rails.map((tiles) => ({ kind: 'buildRoad', tier: railTier, tiles })),
  );
  const roadCount = await settle('roads', roadTiles);
  const wanted = new Set();
  for (const run of [...runs, ...kits.rails]) for (const t of run) wanted.add(`${t.x},${t.z}`);
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

  // Frame and render-call time every few seconds from the moment the build settles, in the oblique view: the work the renderers still owe a fresh city.
  if (ABLATE || CENSUS || PROFILE) {
    const v = VIEWS[1];
    await setPhase(0.5);
    await camera(v.tx, v.tz, v.distance, v.yaw, v.pitch);
    result.settle = [];
    const t0 = Date.now();
    // Read every five seconds or so until the render-call time stops falling (the last three
    // readings within 1.5 ms of each other), at most 120 s.
    while (Date.now() - t0 < 120000) {
      const m = await measure(40);
      const row = {
        secondsAfterBuild: Math.round((Date.now() - t0) / 1000),
        meanMs: m.meanMs,
        jsRenderMs: m.jsRenderMs,
        gpuMs: m.gpuMs,
      };
      result.settle.push(row);
      console.log('settle', JSON.stringify(row));
      const last = result.settle.slice(-3).map((s) => s.jsRenderMs);
      if (last.length === 3 && Math.max(...last) - Math.min(...last) < 1.5) break;
      await page.waitForTimeout(2000);
    }
    result.settleSeconds = Math.round((Date.now() - t0) / 1000);
    console.log('settled flat after', result.settleSeconds, 's');
  }
  await page.waitForTimeout(3000);
  result.city = await readViews('city');
  result.errors = errors.slice(0, 20);
  result.errorCount = errors.length;

  // --- cost mode: one switch off at a time, census, profile ---
  const hook = (fn, ...a) =>
    page.evaluate(([name, params]) => window.__slimcity[name](...params), [fn, a]);
  const defaultRatio = await page.evaluate(() => Math.min(window.devicePixelRatio || 1, 2));
  const hide = (group) => ({
    on: () => hook('setGroupHidden', group, true),
    off: () => hook('setGroupHidden', group, false),
  });
  const GROUPS = [
    'terrain',
    'water',
    'sea',
    'trees',
    'roads',
    'furniture',
    'buildings',
    'lots',
    'vehicles',
    'power',
  ];
  const CASES = {
    base: { on: async () => {}, off: async () => {} },
    'shadows-off': { on: () => hook('setShadows', false), off: () => hook('setShadows', true) },
    'shadow-2048': {
      on: () => hook('setShadows', true, 2048),
      off: () => hook('setShadows', true, 4096),
    },
    'shadow-1024': {
      on: () => hook('setShadows', true, 1024),
      off: () => hook('setShadows', true, 4096),
    },
    'post-off': {
      on: () => hook('setDirectRender', true),
      off: () => hook('setDirectRender', false),
    },
    'bloom-off': { on: () => hook('setBloom', false), off: () => hook('setBloom', true) },
    'ratio-1': {
      on: () => hook('setPixelRatio', 1),
      off: () => hook('setPixelRatio', defaultRatio),
    },
    'ratio-2': {
      on: () => hook('setPixelRatio', 2),
      off: () => hook('setPixelRatio', defaultRatio),
    },
    'scale-0.75': {
      on: () => hook('setPixelRatio', 0.75 * defaultRatio),
      off: () => hook('setPixelRatio', defaultRatio),
    },
    'scale-0.5': {
      on: () => hook('setPixelRatio', 0.5 * defaultRatio),
      off: () => hook('setPixelRatio', defaultRatio),
    },
    ...Object.fromEntries(GROUPS.map((g) => [`hide-${g}`, hide(g)])),
    // Every group at once: the sky, the post pass and the page's own work are what is left.
    'hide-all': {
      on: async () => {
        for (const g of GROUPS) await hook('setGroupHidden', g, true);
      },
      off: () => hook('showAllGroups'),
    },
  };
  const stat = (xs) => {
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, xs.length - 1));
    return { mean, sd, min: Math.min(...xs), max: Math.max(...xs), n: xs.length };
  };
  const costViews = VIEWS.filter((v) => !ONLY_VIEWS || ONLY_VIEWS.includes(v.name));
  // The renderers lay their chunks over the frames after a build; the first reads include that work, so the cost runs wait it out.
  // The renderers lay their chunks over the frames after a build; the cost runs wait it out.
  if (ABLATE || CENSUS || PROFILE) await page.waitForTimeout(20000);

  if (ABLATE) {
    const names = (ONLY_CASES ?? Object.keys(CASES)).filter((n) => n in CASES);
    const samples = {};
    const keep = (view, name, m) => {
      const s = (samples[`${view}|${name}`] ??= []);
      s.push(m);
    };
    for (let run = 0; run < RUNS; run++) {
      for (const v of costViews) {
        await setPhase(v.night ? 0.96 : 0.5);
        await camera(v.tx, v.tz, v.distance, v.yaw, v.pitch);
        await page.waitForTimeout(2500);
        await dismissToasts();
        const order = ['base', ...names.filter((n) => n !== 'base'), 'base'];
        for (const name of order) {
          await CASES[name].on();
          await page.waitForTimeout(700);
          const m = await measure(Math.min(FRAMES, 120));
          await CASES[name].off();
          keep(v.name, name, m);
          console.log('run', run, v.name, name, JSON.stringify({ mean: m.meanMs, p95: m.p95Ms }));
        }
      }
    }
    const table = {};
    for (const [key, list] of Object.entries(samples)) {
      const [view, name] = key.split('|');
      const last = list[list.length - 1];
      (table[view] ??= {})[name] = {
        meanMs: stat(list.map((m) => m.meanMs)),
        p95Ms: stat(list.map((m) => m.p95Ms)),
        jsFrameMs: stat(list.map((m) => m.jsFrameMs)),
        jsRenderMs: stat(list.map((m) => m.jsRenderMs)),
        gpuMs: stat(list.map((m) => m.gpuMs ?? NaN)),
        uploadMs: stat(list.map((m) => m.uploadMs)),
        uploadMB: stat(list.map((m) => m.uploadMB)),
        uploadCalls: stat(list.map((m) => m.uploadCalls)),
        drawCalls: last.drawCalls,
        triangles: last.triangles,
      };
    }
    result.ablate = {
      runs: RUNS,
      noaa: NOAA,
      defaultRatio,
      buildingsStanding: standing.length,
      settle: result.settle,
      settleSeconds: result.settleSeconds,
      table,
    };
    const lines = [
      `# Ablation (${TAG}, ${standing.length} buildings, ${RUNS} runs${NOAA ? ', no antialiasing' : ''})`,
      '',
      '| View | Case | GPU ms (sd) | js render ms | frame mean ms (sd) | frame p95 ms (sd) | upload ms | upload MB | draw calls | triangles |',
      '| ---- | ---- | ----------- | ------------ | ------------------ | ----------------- | --------- | --------- | ---------- | --------- |',
    ];
    for (const [view, cases] of Object.entries(table))
      for (const [name, r] of Object.entries(cases))
        lines.push(
          `| ${view} | ${name} | ${r.gpuMs.mean.toFixed(1)} (${r.gpuMs.sd.toFixed(1)}) | ${r.jsRenderMs.mean.toFixed(1)} | ${r.meanMs.mean.toFixed(1)} (${r.meanMs.sd.toFixed(1)}) | ${r.p95Ms.mean.toFixed(1)} (${r.p95Ms.sd.toFixed(1)}) | ${r.uploadMs.mean.toFixed(1)} | ${r.uploadMB.mean.toFixed(2)} | ${r.drawCalls} | ${r.triangles} |`,
        );
    writeFileSync(`${out}/ablate-${TAG}.md`, `${lines.join('\n')}\n`);
    writeFileSync(`${out}/ablate-${TAG}.json`, `${JSON.stringify(result.ablate, null, 2)}\n`);
    console.log(lines.join('\n'));
  }

  if (CENSUS) {
    const census = {};
    for (const v of costViews) {
      await setPhase(v.night ? 0.96 : 0.5);
      await camera(v.tx, v.tz, v.distance, v.yaw, v.pitch);
      await page.waitForTimeout(2500);
      await dismissToasts();
      const rows = await hook('meshCensus');
      const full = await measure(30);
      await hook('setShadows', false);
      await page.waitForTimeout(700);
      const noShadow = await measure(30);
      await hook('setShadows', true, 4096);
      const byGroup = {};
      for (const r of rows) {
        const g = (byGroup[r.group] ??= {
          meshes: 0,
          instances: 0,
          inView: 0,
          trianglesSubmitted: 0,
          trianglesInView: 0,
          uncullable: 0,
        });
        g.meshes++;
        g.instances += r.instances;
        g.inView += r.inView;
        g.trianglesSubmitted += r.instances * r.trianglesEach;
        g.trianglesInView += r.inView * r.trianglesEach;
        if (!r.frustumCulled) g.uncullable++;
      }
      const top = rows
        .map((r) => ({ ...r, submitted: r.instances * r.trianglesEach }))
        .sort((a, b) => b.submitted - a.submitted)
        .slice(0, 8);
      census[v.name] = {
        rendererTriangles: full.triangles,
        rendererTrianglesNoShadow: noShadow.triangles,
        drawCalls: full.drawCalls,
        drawCallsNoShadow: noShadow.drawCalls,
        sceneMeshes: rows.length,
        sceneTriangles: rows.reduce((a, r) => a + r.instances * r.trianglesEach, 0),
        sceneTrianglesInView: rows.reduce((a, r) => a + r.inView * r.trianglesEach, 0),
        byGroup,
        top,
      };
      console.log('census', v.name, JSON.stringify(census[v.name]));
    }
    result.census = census;
    writeFileSync(`${out}/census-${TAG}.json`, `${JSON.stringify(census, null, 2)}\n`);
  }

  if (PROFILE) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
    const profiles = {};
    for (const v of costViews.filter((x) => x.name === '2-oblique' || x.name === '1-street')) {
      await setPhase(0.5);
      await camera(v.tx, v.tz, v.distance, v.yaw, v.pitch);
      await page.waitForTimeout(2500);
      await cdp.send('Profiler.start');
      const m = await measure(Math.min(FRAMES, 150));
      const { profile } = await cdp.send('Profiler.stop');
      const self = new Map();
      const byId = new Map(profile.nodes.map((n) => [n.id, n]));
      const parentOf = new Map();
      for (const n of profile.nodes) for (const c of n.children ?? []) parentOf.set(c, n.id);
      const nameOf = (id) => {
        const fn = byId.get(id).callFrame;
        return `${fn.functionName || '(anonymous)'} ${fn.url.split('/').slice(-2).join('/')}:${fn.lineNumber}`;
      };
      // Self time of the busiest non-idle function, split by the three callers above it.
      const chains = new Map();
      profile.samples.forEach((id, i) => {
        const key = nameOf(id);
        self.set(key, (self.get(key) ?? 0) + (profile.timeDeltas[i] ?? 0));
        if (key.startsWith('writeBuffer')) {
          const up = [
            parentOf.get(id),
            parentOf.get(parentOf.get(id)),
            parentOf.get(parentOf.get(parentOf.get(id))),
          ];
          const chain = up
            .filter((x) => x !== undefined)
            .map(nameOf)
            .join(' < ');
          chains.set(chain, (chains.get(chain) ?? 0) + (profile.timeDeltas[i] ?? 0));
        }
      });
      const total = [...self.values()].reduce((a, b) => a + b, 0);
      const idle = (self.get('(idle) :-1') ?? 0) + (self.get('(program) :-1') ?? 0);
      profiles[v.name] = {
        frameMs: m.meanMs,
        jsFrameMs: m.jsFrameMs,
        jsRenderMs: m.jsRenderMs,
        sampledMs: total / 1000,
        idleOrProgramMs: idle / 1000,
        top: [...self.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 12)
          .map(([k, us]) => [k, us / 1000]),
        writeBufferCallers: [...chains.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([k, us]) => [k, us / 1000]),
      };
      console.log('profile', v.name, JSON.stringify(profiles[v.name]));
    }
    result.profile = profiles;
    writeFileSync(`${out}/profile-${TAG}.json`, `${JSON.stringify(profiles, null, 2)}\n`);
  }

  // --- report ---
  const f = (n) => n.toFixed(1);
  const lines = [
    `# Frame budget (seed ${SEED}, ${standing.length} buildings standing of ${all.length} planned)`,
    '',
    `Machine: ${result.machine.webglRenderer ?? 'unknown GPU'} / ${result.machine.userAgent}`,
    '',
    '| View | Case | mean ms | p50 ms | p95 ms | p95 of 8 ms | draw calls | triangles |',
    '| ---- | ---- | ------- | ------ | ------ | ----------- | ---------- | --------- |',
  ];
  for (const [i, v] of VIEWS.entries()) {
    const b = result.baseline[i];
    const c = result.city[i];
    const row = (tag, r) =>
      `| ${v.name} | ${tag} | ${f(r.meanMs)} | ${f(r.p50Ms)} | ${f(r.p95Ms)} | ${f(r.p95Of8Ms)} | ${r.drawCalls} | ${r.triangles} |`;
    lines.push(row('empty map', b), row('city', c));
    lines.push(
      `| ${v.name} | difference | ${f(c.meanMs - b.meanMs)} | ${f(c.p50Ms - b.p50Ms)} | ${f(c.p95Ms - b.p95Ms)} | ${f(c.p95Of8Ms - b.p95Of8Ms)} | ${c.drawCalls - b.drawCalls} | ${c.triangles - b.triangles} |`,
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
