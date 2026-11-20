import { readFileSync } from 'node:fs';
import { defineSeries } from '../../lib/series.mjs';
import { column, districtBox, rect, row } from '../../lib/town.mjs';

const CATALOG = JSON.parse(
  readFileSync(new URL('../../../../src/data/catalog.json', import.meta.url), 'utf8'),
).buildings;

/** Zone numbers (src/shared/types.ts ZoneType) and road tier (RoadTier.TwoLane). */
const ZONE = { ResLow: 1, ResHigh: 2, ComLow: 3, Industrial: 5 };
const TWO_LANE = 1;
/** Building states (BuildingState). */
const CONSTRUCTING = 0;
const ACTIVE = 1;
const ABANDONED = 2;

/** The main street, west to east, with the plant at its east end and a tower beside it. */
const MAIN_Z = 100;
const MAIN = { x0: 60, x1: 119 };
/** Homes either side of the gap the derelict block is cut off by, north of the main street. */
const HOMES_WEST = { x0: 60, z0: 97, x1: 68, z1: 99 };
const HOMES_EAST = { x0: 72, z0: 97, x1: 100, z1: 99 };
const GAP = { x: 70, z: MAIN_Z };
const WORKS_BLOCK = { x0: 90, z0: 101, x1: 99, z1: 106 };
/** The second street the sites rise on, joined to the main street's east end. */
const SITE_Z = 120;
/** Tiles along the street each site block takes, and how deep it runs back from the street. */
const BLOCK_W = 8;
const BLOCK_D = 4;
const SITES = [
  { kind: 'house', zone: ZONE.ResLow },
  { kind: 'shop', zone: ZONE.ComLow },
  { kind: 'works', zone: ZONE.Industrial },
  { kind: 'tall', zone: ZONE.ResHigh },
].map((s, i) => {
  const x0 = 62 + i * BLOCK_W;
  return { ...s, block: { x0, z0: SITE_Z - BLOCK_D, x1: x0 + BLOCK_W - 1, z1: SITE_Z - 1 } };
});
/** How far along the build each stage is: earth and fence, foundation, two heights of frame, enclosed. */
const STAGES = [
  { name: 'earth', progress: 0.05 },
  { name: 'foundation', progress: 0.2 },
  { name: 'frame-high', progress: 0.65 },
  { name: 'enclosed', progress: 0.9 },
];

const inBlock = (b, k) => b.x >= k.x0 && b.x <= k.x1 && b.z >= k.z0 && b.z <= k.z1;
const zone = (zoneType, k) => ({
  kind: 'paintZone',
  zone: zoneType,
  tiles: rect(k.x0, k.z0, k.x1 - k.x0 + 1, k.z1 - k.z0 + 1),
});
const wait = (k, extra) => ({ ...k, ...extra });
const place = (catalogId, x, z) => ({ kind: 'placeBuilding', catalogId, x, z, rotation: 2 });

/** A building's footprint as a view box, the street on its south side. */
const boxOfBuilding = (b) => {
  const entry = CATALOG.find((e) => e.id === b.catalogId);
  return districtBox(
    b.x,
    b.z,
    b.x + entry.footprint.w - 1,
    b.z + entry.footprint.d - 1,
    entry.height,
  );
};

/** What is going up in each site block, and the first home cut off from power. */
const sites = {};

const subjects = STAGES.flatMap((stage) =>
  SITES.map((site) => ({
    id: `${site.kind}-${stage.name}`,
    views: ['above', 'front', 'rear', 'left', 'right'],
    night: false,
    // Every site is set to the stage at once; a paused sim posts a snapshot only when a command
    // lands, so the clock is pinned to carry the new progress to the renderer.
    before: async ({ page, pinDay }) => {
      await page.evaluate((p) => window.__slimcity.constructionProgress(p), stage.progress);
      await pinDay(0.5);
    },
    box: () => boxOfBuilding(sites[site.kind]),
  })),
);

export default defineSeries({
  name: 'life',
  type: 'town',
  purpose:
    'A building rises stage by stage from the same lot (earth and fence, foundation, frame, enclosed) in every use, and a home cut off from power stands derelict: no stage shows a wall, floor or roof out of place.',
  budgetS: 240,
  plan: {
    live: true,
    phases: [
      {
        // The street, the plant and the tower, and homes grown until people live somewhere.
        batches: [
          {
            label: 'main street',
            commands: [
              {
                kind: 'buildRoad',
                tier: TWO_LANE,
                tiles: row(MAIN.x0, MAIN_Z, MAIN.x1 - MAIN.x0 + 1),
              },
            ],
          },
          { label: 'plant', commands: [place('coal-plant', 114, 101)] },
          { label: 'tower', commands: [place('water-tower', 112, 101)] },
          {
            label: 'homes',
            commands: [zone(ZONE.ResLow, HOMES_WEST), zone(ZONE.ResLow, HOMES_EAST)],
          },
        ],
        timeoutMs: 90000,
        until: [
          wait(HOMES_WEST, { prefix: 'res', state: ACTIVE, min: 2 }),
          wait(HOMES_EAST, { prefix: 'res', state: ACTIVE, min: 8 }),
        ],
      },
      {
        // Works for the jobs shops open against.
        batches: [{ label: 'works', commands: [zone(ZONE.Industrial, WORKS_BLOCK)] }],
        timeoutMs: 90000,
        until: [wait(WORKS_BLOCK, { prefix: 'ind', state: ACTIVE, min: 1 })],
      },
      {
        // The street the sites stand on, joined to the main street's east end.
        batches: [
          {
            label: 'connector',
            commands: [
              {
                kind: 'buildRoad',
                tier: TWO_LANE,
                tiles: column(MAIN.x1, MAIN_Z + 1, SITE_Z - MAIN_Z),
              },
            ],
          },
          {
            label: 'site street',
            commands: [
              {
                kind: 'buildRoad',
                tier: TWO_LANE,
                tiles: row(MAIN.x0, SITE_Z, MAIN.x1 - MAIN.x0 + 1),
              },
            ],
          },
        ],
      },
      // One site a phase, held from the first tick, so each stays a site and none uses up the
      // demand the next is waiting on. The scarcest use goes first.
      ...['works', 'shop', 'house', 'tall'].map((kind) => {
        const site = SITES.find((s) => s.kind === kind);
        return {
          hold: true,
          batches: [{ label: `${kind} site`, commands: [zone(site.zone, site.block)] }],
          timeoutMs: 90000,
          until: [wait(site.block, { state: CONSTRUCTING, min: 1 })],
        };
      }),
      {
        // Cut the west homes off the main street's power: they lapse while the sites stay held.
        hold: true,
        batches: [{ label: 'gap', commands: [{ kind: 'bulldoze', tiles: [GAP] }] }],
        timeoutMs: 90000,
        until: [wait(HOMES_WEST, { state: ABANDONED, min: 1 })],
      },
    ],
  },
  ready: async (_session, town) => {
    const all = await town.buildings();
    for (const s of SITES) {
      const found = all.find((b) => b.state === CONSTRUCTING && inBlock(b, s.block));
      if (!found) throw new Error(`no ${s.kind} site is under construction`);
      sites[s.kind] = found;
    }
    const lapsed = all.find((b) => b.state === ABANDONED && inBlock(b, HOMES_WEST));
    if (!lapsed) throw new Error('no home stands derelict');
    sites.derelict = lapsed;
  },
  subjects: [
    ...subjects,
    {
      id: 'derelict',
      views: ['above', 'front', 'rear', 'left', 'right'],
      night: true,
      box: () => boxOfBuilding(sites.derelict),
    },
  ],
});
