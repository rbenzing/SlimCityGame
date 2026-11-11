import { describe, expect, it } from 'vitest';
import { bendRadiusOf, presetProfileForTier } from '../shared/roadprofile';
import { RoadFlow, RoadTier } from '../shared/types';
import type { CmPoint } from '../shared/roadgeom';
import { tileCentreCm } from '../shared/roadgeom';
import type { GridState, TilePoint } from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { createGrid } from '../world/grid';
import { laySegment, planSegment } from '../world/freeroads';
import { applyRoad } from '../world/roads';
import { RoadNetwork } from '../world/roadgraph';
import { bendsOf, networkFromGrid, reconcileRoads } from '../world/roadnet';
import { routeOf, smoothCorners } from './traffic';

const at = (x: number, z: number): CmPoint => ({ x: Math.round(x * 100), z: Math.round(z * 100) });
/** Half a lane: where a car sits off the centre line of its lane. */
const LANE_CENTRE_M = 1.875;
const tileOf = (m: number): number => Math.floor(m / TILE_METERS);

/**
 * Two runs of one road meeting at an angle, and the tiles at their far ends. With `grid`
 * the first run is a grid street ending on a tile, the second a free run off its centre.
 */
function bendWorld(
  tier: number,
  deg: number,
  grid: boolean,
): { g: GridState; from: TilePoint; to: TilePoint } {
  const g = createGrid(48);
  g.roads = networkFromGrid(g);
  const arm = grid ? 90 : 120;
  const d = { x: Math.cos((deg * Math.PI) / 180), z: Math.sin((deg * Math.PI) / 180) };
  let n = { x: 480, z: 400 };
  let runs: (readonly [CmPoint, CmPoint])[];
  if (grid) {
    // The street keeps the direction it was drawn in, as the game stores it.
    const tiles = Array.from({ length: 12 }, (_, i) => ({ x: 13 + i, z: 20 }));
    applyRoad(
      g,
      tiles,
      tier as RoadTier,
      undefined,
      tier,
      false,
      tiles.map(() => RoadFlow.East),
    );
    g.roads = networkFromGrid(g);
    const end = { x: tileCentreCm(24), z: tileCentreCm(20) };
    n = { x: end.x / 100, z: end.z / 100 };
    runs = [[end, at(n.x + d.x * arm, n.z + d.z * arm)]];
  } else {
    runs = [
      [at(n.x - arm, n.z), at(n.x, n.z)],
      [at(n.x, n.z), at(n.x + d.x * arm, n.z + d.z * arm)],
    ];
  }
  for (const [a, b] of runs) {
    const req = { tier: tier as RoadTier, profileId: tier, a, b, control: null, flow: 0 };
    const plan = planSegment(g, g.roads, req, () => null);
    if (!plan.ok) throw new Error(plan.reason);
    laySegment(g, g.roads, plan, req);
    reconcileRoads(g.roads, g);
  }
  return {
    g,
    from: grid ? { x: 13, z: 20 } : { x: tileOf(n.x - arm), z: tileOf(n.z) },
    to: { x: tileOf(n.x + arm * d.x), z: tileOf(n.z + arm * d.z) },
  };
}

describe('a vehicle driven through a bend', () => {
  const cases: [number, boolean, number][] = [
    ...[30, 60, 90, 120].map((d): [number, boolean, number] => [d, false, 0.3]),
    ...[30, 60, 90].map((d): [number, boolean, number] => [d, true, 0.5]),
  ];
  for (const [deg, grid, within] of cases) {
    it(`follows the arc of a ${deg} degree bend${grid ? ' off a grid street' : ''}, each lane within ${within} m of its centre`, () => {
      const tier = RoadTier.TwoLane;
      const { g, from, to } = bendWorld(tier, deg, grid);
      const [found] = [
        ...bendsOf(g.roads!, () => bendRadiusOf(presetProfileForTier(tier))).values(),
      ];
      const { bend } = found!;
      const net = new RoadNetwork();
      net.rebuild(g);
      const path = net.findPath(from, to);
      expect(path).not.toBeNull();
      for (const route of [path!, net.findPath(to, from)!]) {
        const driven = smoothCorners(routeOf(route));
        const first = bend.path[bend.arc[0]]!;
        const last = bend.path[bend.arc[1]]!;
        const radial = (p: { x: number; z: number }): number =>
          Math.hypot(p.x - bend.centre.x, p.z - bend.centre.z);
        // The driven points between the arc's ends, and the lane each side of the centre line.
        const mid = bend.path[bend.middle]!;
        const cx = mid.x - bend.centre.x;
        const cz = mid.z - bend.centre.z;
        const reach = Math.abs(
          Math.atan2(
            cx * (first.z - bend.centre.z) - cz * (first.x - bend.centre.x),
            cx * (first.x - bend.centre.x) + cz * (first.z - bend.centre.z),
          ),
        );
        const between = (p: { x: number; z: number }): boolean => {
          const wx = p.x - bend.centre.x;
          const wz = p.z - bend.centre.z;
          return Math.abs(Math.atan2(cx * wz - cz * wx, cx * wx + cz * wz)) <= reach;
        };
        expect(driven.filter(between).length).toBeGreaterThanOrEqual(5);
        expect(Math.hypot(first.x - last.x, first.z - last.z)).toBeGreaterThan(1);
        for (let k = 1; k + 1 < driven.length; k++) {
          const p = driven[k]!;
          if (!between(p)) continue;
          // The car's heading from its neighbours, then half a lane to each side of the centre line.
          const h = {
            x: driven[k + 1]!.x - driven[k - 1]!.x,
            z: driven[k + 1]!.z - driven[k - 1]!.z,
          };
          const len = Math.hypot(h.x, h.z);
          // Driven either way, the lanes lie half a lane in and half a lane out of the arc.
          const [inner, outer] = [-1, 1]
            .map((side) =>
              radial({
                x: p.x + (-h.z / len) * LANE_CENTRE_M * side,
                z: p.z + (h.x / len) * LANE_CENTRE_M * side,
              }),
            )
            .sort((a, b) => a - b);
          expect(Math.abs(inner! - (bend.radius - LANE_CENTRE_M))).toBeLessThan(within);
          expect(Math.abs(outer! - (bend.radius + LANE_CENTRE_M))).toBeLessThan(within);
        }
      }
    });
  }
});
