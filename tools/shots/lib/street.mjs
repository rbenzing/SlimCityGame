/** Scene code shared by the street series: what a run of street needs beside it to show
 * the things that stand on it, and how to get a line's vehicles running without growing a town.
 *
 * A street subject is a road piece (see `lib/roads.mjs`): its `lay` returns the commands that
 * build it. Lamps, poles and the lines' vehicles need a supplied street, so a wind turbine is
 * stood on the north kerb of the street as the supply, as a player would.
 */
import { settle } from './session.mjs';

/** Catalog ids of the buildings a street scene stands. */
export const GENERATOR = 'gas-turbine';
export const BUS_DEPOT = 'bus-depot';
export const TRAM_DEPOT = 'tram-depot';
export const RAIL_YARD = 'rail-yard';
export const RAIL_STATION = 'rail-station';
export const SUBSTATION = 'substation';

/** Rotations of a building that fronts south (north of its street), north, east and west. */
export const FRONTS_SOUTH = 0;
export const FRONTS_EAST = 1;
export const FRONTS_NORTH = 2;
export const FRONTS_WEST = 3;

/** A footway's width and a travel lane's, in metres (src/shared/roadprofile.ts). */
export const FOOTWAY_M = 1.875;
export const LANE_M = 3.75;
export const WALK = { kind: 'sidewalk', width: FOOTWAY_M };
export const LANES = [
  { kind: 'travel', width: LANE_M, flow: 'back' },
  { kind: 'travel', width: LANE_M, flow: 'fwd' },
];

/** A road profile of a local street built from `pieces`, defined under `id`. */
export const defineProfile = (id, pieces, extra = {}) => ({
  kind: 'defineRoadProfile',
  id,
  profile: { class: 'local', pieces, ...extra },
});

/** A generator on the kerb north of street row `row`, at pad column `x`: the supply the street is lit and strung from. */
export const supply = (p, x, row) =>
  p.building(GENERATOR, x, row - p.size(GENERATOR).d, FRONTS_SOUTH);

/** Line colours (RGB bytes): bus, tram, train. */
export const LINE_COLOR = { bus: 0xef5350, tram: 0x3cb45a, rail: 0x42a5f5 };

/** A transit line command through `stops` (pad tiles already on the map: `{ x, z }`). */
export const transitLine = (id, mode, stops, vehicles = 2) => ({
  kind: 'createTransitLine',
  line: { id, color: LINE_COLOR[mode], mode, vehicles, stops },
});

/**
 * Run the simulation until each of `lines` lines has a vehicle in service and the transit
 * renderer draws them, then hold the city still again. The depots field their vehicles only
 * while the clock runs: the wait ends on the condition, never on time.
 */
export async function fieldVehicles({ page }, lines = 1) {
  await page.evaluate(() => window.__slimcity.setSpeed(1));
  try {
    await settle(page, {
      until: (n) => {
        const { served } = window.__slimcity.readTransit();
        return (
          served.length >= n &&
          served.every((v) => v > 0) &&
          window.__slimcity.readTransitRender().vehicles >= n
        );
      },
      arg: lines,
      timeout: 60000,
    });
  } finally {
    await page.evaluate(() => window.__slimcity.setSpeed(0));
  }
}

/** Where the transit renderer's vehicles stand now, world metres. */
export const vehiclesNow = (page) =>
  page.evaluate(() => window.__slimcity.readTransitRender().positions);
