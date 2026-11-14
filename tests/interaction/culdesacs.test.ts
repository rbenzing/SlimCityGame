import { describe, expect, it } from 'vitest';
import { tileIndex } from '../../src/shared/constants';
import {
  CUL_DE_SAC_CODE,
  CUL_DE_SAC_RADIUS_M,
  CUL_DE_SAC_REFUSALS,
  CUL_DE_SAC_ROUTE_RADIUS_M,
  culDeSacAtEnd,
  culDeSacCommands,
} from '../../src/shared/culdesac';
import { isPresetProfileId, presetProfileForTier } from '../../src/shared/roadprofile';
import { blockTiles, ringCentre } from '../../src/shared/roundabout';
import { RoadFlow, RoadTier } from '../../src/shared/types';
import type { GridState, SimSnapshot, TilePoint } from '../../src/shared/types';
import { RoadNetwork } from '../../src/world/roadgraph';
import { roundaboutGroundOf } from '../../src/world/roundabouts';
import { column, latestSaveGrid, run, sandboxed, twoLaneSpec, type Harness } from '../support/sim';

// A street down column 50 that ends at (50, 50); the cul-de-sac goes on the
// block beyond it, to its east.
const X = 50;
const Z = 50;
const END: TilePoint = { x: X, z: Z };
const BLOCK = { x: X, z: Z + 1 };

function grid(h: Harness): GridState {
  h.sim.handleMessage({ type: 'requestSave' });
  return latestSaveGrid(h);
}

function groundOf(h: Harness): ReturnType<typeof roundaboutGroundOf> {
  const g = grid(h);
  return roundaboutGroundOf(
    g,
    (x, z) => g.junctionControl[tileIndex(x, z)] ?? 0,
    (id) => (isPresetProfileId(id) ? presetProfileForTier(id as RoadTier) : null),
  );
}

function deadEndStreet(): Harness {
  const h = sandboxed();
  expect(
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(X, Z - 10, 11) }]).ok,
  ).toBe(true);
  return h;
}

function stamp(h: Harness, seq: number): ReturnType<typeof run> {
  const plan = culDeSacAtEnd(END, true, true, groundOf(h));
  expect(plan.refusal).toBeNull();
  return run(h, seq, culDeSacCommands(plan, RoadTier.TwoLane));
}

function network(h: Harness): RoadNetwork {
  const cars = new RoadNetwork();
  cars.rebuild(grid(h));
  return cars;
}

describe('a cul-de-sac laid beyond a dead end', () => {
  it('is laid in one batch for four tiles of street, and stored as its code on those tiles', () => {
    const h = deadEndStreet();
    const laid = stamp(h, 2);
    expect(laid.ok, laid.reason).toBe(true);
    expect(laid.cost).toBe(4 * twoLaneSpec.costPerTile);
    const g = grid(h);
    for (const t of blockTiles(BLOCK)) {
      expect(g.junctionControl[tileIndex(t.x, t.z)]).toBe(CUL_DE_SAC_CODE);
      expect(g.roadTier[tileIndex(t.x, t.z)]).toBe(RoadTier.TwoLane);
    }
    const snaps = h.messages.flatMap((m) => (m.type === 'snapshot' ? [m.snap as SimSnapshot] : []));
    expect(snaps.some((s) => s.culDeSacs?.some((c) => c.x === BLOCK.x && c.z === BLOCK.z))).toBe(
      true,
    );
  });

  it('is taken away whole by one undo, leaving the street as it was', () => {
    const h = deadEndStreet();
    const before = grid(h);
    const laid = stamp(h, 2);
    expect(laid.ok).toBe(true);
    // The inverse of the batch ends in a settle, like every batch's.
    expect(laid.inverse[laid.inverse.length - 1]?.kind).toBe('settle');
    expect(run(h, 3, laid.inverse).ok).toBe(true);
    const after = grid(h);
    expect(Array.from(after.roadTier)).toEqual(Array.from(before.roadTier));
    expect(Array.from(after.roadMask)).toEqual(Array.from(before.roadMask));
    expect(Array.from(after.junctionControl)).toEqual(Array.from(before.junctionControl));
    expect(network(h).getCulDeSacs()).toEqual([]);
  });

  it('is taken out, and put back, by its own commands, each the other’s exact inverse', () => {
    const h = deadEndStreet();
    expect(stamp(h, 2).ok).toBe(true);
    const out = run(h, 3, [{ kind: 'removeCulDeSac', x: BLOCK.x, z: BLOCK.z }]);
    expect(out.ok).toBe(true);
    expect(out.inverse[0]).toEqual({ kind: 'buildCulDeSac', x: BLOCK.x, z: BLOCK.z });
    expect(network(h).getCulDeSacs()).toEqual([]);
    // The street the block was made of stays.
    expect(grid(h).roadTier[tileIndex(BLOCK.x, BLOCK.z)]).toBe(RoadTier.TwoLane);
    const back = run(h, 4, out.inverse);
    expect(back.ok).toBe(true);
    expect(back.inverse[0]).toMatchObject({ kind: 'removeCulDeSac', x: BLOCK.x, z: BLOCK.z });
    expect(network(h).getCulDeSacs()).toMatchObject([BLOCK]);
    expect(run(h, 5, [{ kind: 'removeCulDeSac', x: BLOCK.x + 5, z: BLOCK.z }]).ok).toBe(false);
  });

  it('is one thing: a control, a turn or a lane turn set on one of its tiles is refused', () => {
    const h = deadEndStreet();
    expect(stamp(h, 2).ok).toBe(true);
    for (const t of blockTiles(BLOCK)) {
      expect(
        run(h, 10, [{ kind: 'setJunctionControl', x: t.x, z: t.z, control: 'signal' }]).ok,
      ).toBe(false);
      expect(
        run(h, 11, [
          { kind: 'setJunctionTurns', x: t.x, z: t.z, arm: RoadFlow.North, allowed: 0b0010 },
        ]).ok,
      ).toBe(false);
      expect(
        run(h, 12, [
          {
            kind: 'setJunctionLaneTurns',
            x: t.x,
            z: t.z,
            arm: RoadFlow.North,
            lane: 0,
            allowed: 0b0010,
          },
        ]).ok,
      ).toBe(false);
      expect(grid(h).junctionControl[tileIndex(t.x, t.z)]).toBe(CUL_DE_SAC_CODE);
    }
  });

  it('is not warranted a control where its street joins the circle', () => {
    const h = deadEndStreet();
    expect(stamp(h, 2).ok).toBe(true);
    const mouth = network(h)
      .getNodes()
      .find((n) => n.x === BLOCK.x && n.z === BLOCK.z)!;
    expect(mouth.control).toBe('none');
    expect(mouth.warranted).toBe('none');
  });

  it('goes whole when one of its tiles is bulldozed, and comes back whole with the undo', () => {
    const h = deadEndStreet();
    expect(stamp(h, 2).ok).toBe(true);
    const before = grid(h);
    const razed = run(h, 3, [{ kind: 'bulldoze', tiles: [{ x: BLOCK.x + 1, z: BLOCK.z + 1 }] }]);
    expect(razed.ok).toBe(true);
    const g = grid(h);
    for (const t of blockTiles(BLOCK)) {
      expect(g.roadTier[tileIndex(t.x, t.z)]).toBe(RoadTier.None);
      expect(g.junctionControl[tileIndex(t.x, t.z)]).toBe(0);
    }
    expect(network(h).getCulDeSacs()).toEqual([]);
    expect(run(h, 4, razed.inverse).ok).toBe(true);
    const back = grid(h);
    expect(Array.from(back.roadTier)).toEqual(Array.from(before.roadTier));
    expect(Array.from(back.roadMask)).toEqual(Array.from(before.roadMask));
    expect(Array.from(back.junctionControl)).toEqual(Array.from(before.junctionControl));
    expect(network(h).getCulDeSacs()).toMatchObject([BLOCK]);
  });

  it('reads as plain road once the street that met it is bulldozed', () => {
    const h = deadEndStreet();
    expect(stamp(h, 2).ok).toBe(true);
    expect(run(h, 3, [{ kind: 'bulldoze', tiles: [END] }]).ok).toBe(true);
    expect(network(h).getCulDeSacs()).toEqual([]);
  });

  it('is refused by the world where the block is not the end of one street, with the reason', () => {
    const h = deadEndStreet();
    const open = run(h, 2, [{ kind: 'buildCulDeSac', x: BLOCK.x, z: BLOCK.z }]);
    expect(open.ok).toBe(false);
    expect(open.reason).toBe(CUL_DE_SAC_REFUSALS.notLaid);
  });

  it('is refused by the tool beyond a street that is not a dead end, with the sentence', () => {
    const h = deadEndStreet();
    expect(culDeSacAtEnd({ x: X, z: Z - 4 }, true, true, groundOf(h)).refusal).toBe(
      CUL_DE_SAC_REFUSALS.notDeadEnd,
    );
  });

  it('keeps its circle for cars: one lane round it, anticlockwise, inside the kerb', () => {
    const h = deadEndStreet();
    expect(stamp(h, 2).ok).toBe(true);
    const cars = network(h);
    const loops = cars.getEdges().filter((e) => e.a === e.b);
    expect(loops).toHaveLength(1);
    const loop = loops[0]!;
    const centre = ringCentre(BLOCK);
    for (const p of loop.route ?? []) {
      expect(Math.hypot(p.x - centre.x, p.z - centre.z)).toBeLessThan(CUL_DE_SAC_RADIUS_M - 3);
    }
    expect((loop.lanesAtoB ?? 0) + (loop.lanesBtoA ?? 0)).toBe(1);
    // A car can reach the circle and come back out along the street.
    expect(cars.findPath({ x: X, z: Z - 8 }, { x: BLOCK.x + 1, z: BLOCK.z + 1 })).not.toBeNull();
    expect(cars.findPath({ x: BLOCK.x + 1, z: BLOCK.z + 1 }, { x: X, z: Z - 8 })).not.toBeNull();
  });

  describe('a car bound for, or leaving, a home round the circle', () => {
    const centre = ringCentre(BLOCK);
    const radiusOf = (p: { x: number; z: number }): number =>
      Math.hypot(p.x - centre.x, p.z - centre.z);
    const angleOf = (p: { x: number; z: number }): number =>
      Math.atan2(p.z - centre.z, p.x - centre.x);
    /** Vertices of a route standing on the circle's asphalt. */
    const onBlock = (route: { x: number; z: number }[]): { x: number; z: number }[] =>
      route.filter((p) => radiusOf(p) <= CUL_DE_SAC_RADIUS_M);
    /** The signed turn, radians, the vertices make about the circle's centre. */
    const turnOf = (pts: { x: number; z: number }[]): number => {
      let total = 0;
      for (let i = 1; i < pts.length; i++) {
        let d = angleOf(pts[i]!) - angleOf(pts[i - 1]!);
        while (d > Math.PI) d -= 2 * Math.PI;
        while (d <= -Math.PI) d += 2 * Math.PI;
        total += d;
      }
      return total;
    };
    const home = { x: BLOCK.x + 2, z: BLOCK.z + 1 };
    const away = { x: X, z: Z - 8 };

    function routeOf(from: TilePoint, to: TilePoint): { x: number; z: number }[] {
      const h = deadEndStreet();
      expect(stamp(h, 2).ok).toBe(true);
      const path = network(h).findPath(from, to);
      expect(path?.route).toBeDefined();
      return path!.route!;
    }

    it('drives round the circle on its route line, anticlockwise, to a home on the far side', () => {
      const block = onBlock(routeOf(away, home));
      expect(block.length).toBeGreaterThan(9);
      for (const p of block) {
        expect(Math.abs(radiusOf(p) - CUL_DE_SAC_ROUTE_RADIUS_M)).toBeLessThan(1);
      }
      // Anticlockwise seen from above with z south is a falling angle.
      expect(turnOf(block)).toBeLessThan(-Math.PI / 4);
    });

    it('drives out the same way from a home round the circle, ending on the street', () => {
      const route = routeOf(home, away);
      const block = onBlock(route);
      expect(block.length).toBeGreaterThan(9);
      for (const p of block) {
        expect(Math.abs(radiusOf(p) - CUL_DE_SAC_ROUTE_RADIUS_M)).toBeLessThan(1);
      }
      expect(turnOf(block)).toBeLessThan(-Math.PI / 4);
      expect(radiusOf(route[route.length - 1]!)).toBeGreaterThan(CUL_DE_SAC_RADIUS_M);
    });

    it('a car bound for a home nowhere near the circle never drives round it', () => {
      const far = { x: BLOCK.x + 6, z: BLOCK.z + 1 };
      const block = onBlock(routeOf(away, far));
      expect(block.length).toBeLessThanOrEqual(1);
    });
  });

  it('survives a save, which carries nothing new but the code', () => {
    const h = deadEndStreet();
    expect(stamp(h, 2).ok).toBe(true);
    h.sim.handleMessage({ type: 'requestSave' });
    const saved = h.messages.filter((m) => m.type === 'save').pop();
    expect(saved?.type).toBe('save');
    if (!saved || saved.type !== 'save') return;
    const h2 = sandboxed();
    h2.sim.handleMessage({ type: 'loadSave', data: saved.data });
    h2.ticks(2);
    expect(network(h2).getCulDeSacs()).toMatchObject([BLOCK]);
  });
});
