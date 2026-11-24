import { describe, expect, it } from 'vitest';
import { tileIndex } from '../../src/shared/constants';
import {
  CENTRED_RING_REFUSALS,
  CENTRED_ROUNDABOUT_CODE,
  centredRingAtJunction,
  centredRingCentre,
  centredRingCommands,
  centredRingTiles,
  centredRunsRound,
  type CentredRing,
} from '../../src/shared/centredring';
import { codeForControl } from '../../src/shared/junction';
import { isPresetProfileId, presetProfileForTier } from '../../src/shared/roadprofile';
import {
  blockTiles,
  roundaboutAtJunction,
  RING_ROUTE_RADIUS_M,
  ringArcTiles,
  roundaboutCommands,
  runsRound,
  type RoundaboutBlock,
} from '../../src/shared/roundabout';
import { RoadFlow, RoadTier } from '../../src/shared/types';
import type { GridState, SimSnapshot, TilePoint } from '../../src/shared/types';
import { RoadNetwork } from '../../src/world/roadgraph';
import { roundaboutGroundOf } from '../../src/world/roundabouts';
import { column, latestSaveGrid, run, sandboxed, twoLaneSpec, type Harness } from '../support/sim';

// A street along row 50 and one down column 50, crossing at (50, 50); the
// roundabout goes on the block south-east of the crossing.
const X = 50;
const Z = 50;
const BLOCK: RoundaboutBlock = { x: X, z: Z };
const ROUNDABOUT = codeForControl('roundabout');

const row = (z: number, x0: number, count: number): TilePoint[] =>
  Array.from({ length: count }, (_, i) => ({ x: x0 + i, z }));

function grid(h: Harness): GridState {
  h.sim.handleMessage({ type: 'requestSave' });
  return latestSaveGrid(h);
}

function crossroads(): Harness {
  const h = sandboxed();
  expect(
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: row(Z, X - 10, 21) }]).ok,
  ).toBe(true);
  expect(
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(X, Z - 10, 21) }]).ok,
  ).toBe(true);
  return h;
}

function stamp(h: Harness, seq: number): ReturnType<typeof run> {
  const g = grid(h);
  const ground = roundaboutGroundOf(
    g,
    (x, z) => g.junctionControl[tileIndex(x, z)] ?? 0,
    (id) => (isPresetProfileId(id) ? presetProfileForTier(id as RoadTier) : null),
  );
  const plan = roundaboutAtJunction({ x: X, z: Z }, true, true, ground);
  expect(plan.refusal).toBeNull();
  return run(h, seq, roundaboutCommands(plan, RoadTier.TwoLane));
}

function network(h: Harness): RoadNetwork {
  const cars = new RoadNetwork();
  cars.rebuild(grid(h));
  return cars;
}

const inBlock = (t: TilePoint): boolean =>
  t.x >= BLOCK.x && t.x <= BLOCK.x + 1 && t.z >= BLOCK.z && t.z <= BLOCK.z + 1;

const LEGS: Record<string, TilePoint> = {
  west: { x: X - 10, z: Z },
  east: { x: X + 10, z: Z },
  north: { x: X, z: Z - 10 },
  south: { x: X, z: Z + 10 },
};

describe('a compact roundabout laid on a crossroads', () => {
  it('is laid in one batch, and stored as the roundabout control on its four tiles', () => {
    const h = crossroads();
    const laid = stamp(h, 3);
    expect(laid.ok, laid.reason).toBe(true);
    const g = grid(h);
    for (const t of blockTiles(BLOCK))
      expect(g.junctionControl[tileIndex(t.x, t.z)]).toBe(ROUNDABOUT);
    expect(g.roadTier[tileIndex(X + 1, Z + 1)]).toBe(RoadTier.TwoLane);
    const snaps = h.messages.flatMap((m) => (m.type === 'snapshot' ? [m.snap as SimSnapshot] : []));
    expect(snaps.some((s) => s.roundabouts?.some((r) => r.x === X && r.z === Z))).toBe(true);
  });

  it('routes every movement between its legs, and never against the ring', () => {
    const h = crossroads();
    expect(stamp(h, 3).ok).toBe(true);
    const cars = network(h);
    for (const [fromName, from] of Object.entries(LEGS)) {
      for (const [toName, to] of Object.entries(LEGS)) {
        if (fromName === toName) continue;
        const path = cars.findPath(from, to);
        expect(path, `${fromName} to ${toName}`).not.toBeNull();
        const points = path!.points;
        for (let i = 1; i < points.length; i++) {
          const [a, b] = [points[i - 1]!, points[i]!];
          if (inBlock(a) && inBlock(b)) {
            expect(runsRound(BLOCK, a, b), `${fromName} to ${toName}`).toBe(true);
          }
        }
      }
    }
  });

  it('drives its ring on the circle, clear of the island', () => {
    const h = crossroads();
    expect(stamp(h, 3).ok).toBe(true);
    const path = network(h).findPath(LEGS.west!, LEGS.east!)!;
    const centre = { x: (X + 1) * 20, z: (Z + 1) * 20 };
    const route = path.route ?? [];
    expect(route.length).toBeGreaterThan(0);
    for (const p of route) {
      expect(Math.hypot(p.x - centre.x, p.z - centre.z)).toBeGreaterThan(12);
    }
  });

  it('costs a left turn the long way round, and a right turn the short way', () => {
    const h = crossroads();
    expect(stamp(h, 3).ok).toBe(true);
    const cars = network(h);
    // From the west leg the south leg is a quarter round, the east leg three,
    // and the north leg all the way round.
    const right = cars.findPath(LEGS.west!, LEGS.south!)!.cost;
    const ahead = cars.findPath(LEGS.west!, LEGS.east!)!.cost;
    const left = cars.findPath(LEGS.west!, LEGS.north!)!.cost;
    expect(right).toBeLessThan(ahead);
    expect(ahead).toBeLessThan(left);
  });

  it('is taken away whole by one undo, putting back what the crossing carried', () => {
    const h = crossroads();
    expect(
      run(h, 3, [
        { kind: 'setJunctionControl', x: X, z: Z, control: 'signal' },
        { kind: 'setJunctionTurns', x: X, z: Z, arm: RoadFlow.West, allowed: 0b0010 },
      ]).ok,
    ).toBe(true);
    const before = grid(h);
    const laid = stamp(h, 4);
    expect(laid.ok, laid.reason).toBe(true);
    expect(grid(h).junctionTurns[tileIndex(X, Z)]).toBe(0);
    expect(run(h, 5, laid.inverse).ok).toBe(true);
    const after = grid(h);
    expect(Array.from(after.roadTier)).toEqual(Array.from(before.roadTier));
    expect(Array.from(after.roadMask)).toEqual(Array.from(before.roadMask));
    expect(Array.from(after.junctionControl)).toEqual(Array.from(before.junctionControl));
    expect(Array.from(after.junctionTurns)).toEqual(Array.from(before.junctionTurns));
  });

  it('is one junction: a control or a turn set on one of its tiles is refused', () => {
    const h = crossroads();
    expect(stamp(h, 3).ok).toBe(true);
    expect(run(h, 4, [{ kind: 'setJunctionControl', x: X, z: Z, control: 'signal' }]).ok).toBe(
      false,
    );
    expect(
      run(h, 5, [{ kind: 'setJunctionTurns', x: X, z: Z, arm: RoadFlow.West, allowed: 0b0010 }]).ok,
    ).toBe(false);
    expect(grid(h).junctionControl[tileIndex(X, Z)]).toBe(ROUNDABOUT);
  });

  it('goes whole when one of its tiles is bulldozed, and comes back whole with the undo', () => {
    const h = crossroads();
    expect(stamp(h, 3).ok).toBe(true);
    const razed = run(h, 4, [{ kind: 'bulldoze', tiles: [{ x: X + 1, z: Z + 1 }] }]);
    expect(razed.ok).toBe(true);
    const g = grid(h);
    for (const t of blockTiles(BLOCK)) expect(g.junctionControl[tileIndex(t.x, t.z)]).toBe(0);
    expect(run(h, 5, razed.inverse).ok).toBe(true);
    const back = grid(h);
    for (const t of blockTiles(BLOCK))
      expect(back.junctionControl[tileIndex(t.x, t.z)]).toBe(ROUNDABOUT);
    expect(network(h).getRoundabouts()).toEqual([BLOCK]);
  });

  it('is taken out, and put back, by the inspector’s command', () => {
    const h = crossroads();
    expect(stamp(h, 3).ok).toBe(true);
    const out = run(h, 4, [{ kind: 'removeRoundabout', x: X, z: Z }]);
    expect(out.ok).toBe(true);
    expect(network(h).getRoundabouts()).toEqual([]);
    expect(run(h, 5, out.inverse).ok).toBe(true);
    expect(network(h).getRoundabouts()).toEqual([BLOCK]);
    // Only a block that is a roundabout can be taken out.
    expect(run(h, 6, [{ kind: 'removeRoundabout', x: X + 5, z: Z + 5 }]).ok).toBe(false);
  });

  it('is refused by the world where the site is refused, with the reason', () => {
    const h = crossroads();
    const refused = run(h, 3, [{ kind: 'buildRoundabout', x: X, z: Z }]);
    // The block's fourth corner has no road yet.
    expect(refused.ok).toBe(false);
  });
});

// --- The centred form: a 3×3 block, the ring on the junction's own tile ----------------

const CENTRED: CentredRing = { x: X - 1, z: Z - 1 };
const CENTRED_TILES = centredRingTiles(CENTRED);
const inCentred = (t: TilePoint): boolean =>
  t.x >= CENTRED.x && t.x <= CENTRED.x + 2 && t.z >= CENTRED.z && t.z <= CENTRED.z + 2;

/** A T: the street along row 50 and a road coming down column 50 from the north, ending at the junction. */
function tJunction(): Harness {
  const h = sandboxed();
  expect(
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: row(Z, X - 10, 21) }]).ok,
  ).toBe(true);
  expect(
    run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: column(X, Z - 10, 10) }]).ok,
  ).toBe(true);
  return h;
}

function groundOf(h: Harness): ReturnType<typeof roundaboutGroundOf> {
  const g = grid(h);
  return roundaboutGroundOf(
    g,
    (x, z) => g.junctionControl[tileIndex(x, z)] ?? 0,
    (id) => (isPresetProfileId(id) ? presetProfileForTier(id as RoadTier) : null),
  );
}

function stampCentred(h: Harness, seq: number): ReturnType<typeof run> {
  const plan = centredRingAtJunction({ x: X, z: Z }, groundOf(h));
  expect(plan.refusal).toBeNull();
  return run(h, seq, centredRingCommands(plan, RoadTier.TwoLane));
}

describe('a centred roundabout laid on a crossroads', () => {
  it('is laid in one batch for four tiles of street, and stored as its code on its nine tiles', () => {
    const h = crossroads();
    const laid = stampCentred(h, 3);
    expect(laid.ok, laid.reason).toBe(true);
    expect(laid.cost).toBe(4 * twoLaneSpec.costPerTile);
    const g = grid(h);
    for (const t of CENTRED_TILES) {
      expect(g.junctionControl[tileIndex(t.x, t.z)]).toBe(CENTRED_ROUNDABOUT_CODE);
      expect(g.roadTier[tileIndex(t.x, t.z)]).toBe(RoadTier.TwoLane);
    }
    const snaps = h.messages.flatMap((m) => (m.type === 'snapshot' ? [m.snap as SimSnapshot] : []));
    expect(
      snaps.some((s) =>
        s.roundabouts?.some((r) => r.x === CENTRED.x && r.z === CENTRED.z && r.centred === true),
      ),
    ).toBe(true);
    expect(network(h).getCentredRoundabouts()).toMatchObject([CENTRED]);
    expect(network(h).getRoundabouts()).toEqual([]);
  });

  it('routes every movement between its legs, and never against the ring', () => {
    const h = crossroads();
    expect(stampCentred(h, 3).ok).toBe(true);
    const cars = network(h);
    for (const [fromName, from] of Object.entries(LEGS)) {
      for (const [toName, to] of Object.entries(LEGS)) {
        if (fromName === toName) continue;
        const path = cars.findPath(from, to);
        expect(path, `${fromName} to ${toName}`).not.toBeNull();
        const points = path!.points;
        for (let i = 1; i < points.length; i++) {
          const [a, b] = [points[i - 1]!, points[i]!];
          if (inCentred(a) && inCentred(b)) {
            expect(centredRunsRound(CENTRED, a, b), `${fromName} to ${toName}`).toBe(true);
          }
        }
      }
    }
  });

  it('drives the ring on the circle round the middle tile, and every leg straight in down its centre line', () => {
    const h = crossroads();
    expect(stampCentred(h, 3).ok).toBe(true);
    const centre = centredRingCentre(CENTRED);
    expect(centre).toEqual({ x: (X + 0.5) * 20, z: (Z + 0.5) * 20 });
    const path = network(h).findPath(LEGS.west!, LEGS.east!)!;
    const route = path.route ?? [];
    expect(route.length).toBeGreaterThan(0);
    for (const p of route) {
      expect(Math.hypot(p.x - centre.x, p.z - centre.z)).toBeGreaterThan(12);
    }
    const onRing = route.filter((p) => Math.hypot(p.x - centre.x, p.z - centre.z) < 20);
    for (const p of onRing) {
      expect(Math.hypot(p.x - centre.x, p.z - centre.z)).toBeCloseTo(RING_ROUTE_RADIUS_M, 6);
    }
    // The way in: along the row the west leg runs on, to the ring.
    const entry = route.find((p) => Math.hypot(p.x - centre.x, p.z - centre.z) < 20)!;
    expect(entry.z).toBeCloseTo(centre.z, 6);
    expect(entry.x).toBeCloseTo(centre.x - RING_ROUTE_RADIUS_M, 6);
  });

  it('costs a left turn the long way round, straight half, and a right turn the quarter', () => {
    const h = crossroads();
    expect(stampCentred(h, 3).ok).toBe(true);
    const cars = network(h);
    const right = cars.findPath(LEGS.west!, LEGS.south!)!.cost;
    const ahead = cars.findPath(LEGS.west!, LEGS.east!)!.cost;
    const left = cars.findPath(LEGS.west!, LEGS.north!)!.cost;
    expect(right).toBeLessThan(ahead);
    expect(ahead).toBeLessThan(left);
    const edges = cars.getEdges().filter((e) => e.circulating);
    expect(edges).toHaveLength(4);
    for (const e of edges) expect(e.length).toBeCloseTo(ringArcTiles(1), 9);
  });

  it('gives way on entry only: its leg nodes are ring nodes with the roundabout control', () => {
    const h = crossroads();
    expect(stampCentred(h, 3).ok).toBe(true);
    const nodes = network(h)
      .getNodes()
      .filter((n) => inCentred(n));
    expect(nodes.map((n) => `${n.x},${n.z}`).sort()).toEqual(
      [`${X},${Z - 1}`, `${X},${Z + 1}`, `${X - 1},${Z}`, `${X + 1},${Z}`].sort(),
    );
    for (const n of nodes) {
      expect(n.ring).toBe(true);
      expect(n.control).toBe('roundabout');
    }
  });

  it('is taken away whole by one undo, putting back what the crossing carried', () => {
    const h = crossroads();
    expect(
      run(h, 3, [
        { kind: 'setJunctionControl', x: X, z: Z, control: 'signal' },
        { kind: 'setJunctionTurns', x: X, z: Z, arm: RoadFlow.West, allowed: 0b0010 },
      ]).ok,
    ).toBe(true);
    const before = grid(h);
    const laid = stampCentred(h, 4);
    expect(laid.ok, laid.reason).toBe(true);
    expect(grid(h).junctionTurns[tileIndex(X, Z)]).toBe(0);
    expect(run(h, 5, laid.inverse).ok).toBe(true);
    const after = grid(h);
    expect(Array.from(after.roadTier)).toEqual(Array.from(before.roadTier));
    expect(Array.from(after.roadMask)).toEqual(Array.from(before.roadMask));
    expect(Array.from(after.junctionControl)).toEqual(Array.from(before.junctionControl));
    expect(Array.from(after.junctionTurns)).toEqual(Array.from(before.junctionTurns));
  });

  it('is one junction: a control, a turn or a lane turn set on any of its tiles is refused', () => {
    const h = crossroads();
    expect(stampCentred(h, 3).ok).toBe(true);
    for (const t of CENTRED_TILES) {
      expect(
        run(h, 4, [{ kind: 'setJunctionControl', x: t.x, z: t.z, control: 'signal' }]).ok,
      ).toBe(false);
      expect(
        run(h, 5, [
          { kind: 'setJunctionTurns', x: t.x, z: t.z, arm: RoadFlow.West, allowed: 0b0010 },
        ]).ok,
      ).toBe(false);
      expect(
        run(h, 6, [
          {
            kind: 'setJunctionLaneTurns',
            x: t.x,
            z: t.z,
            arm: RoadFlow.West,
            lane: 0,
            allowed: 0b0010,
          },
        ]).ok,
      ).toBe(false);
      expect(grid(h).junctionControl[tileIndex(t.x, t.z)]).toBe(CENTRED_ROUNDABOUT_CODE);
    }
  });

  it.each(CENTRED_TILES.map((t, i) => [i, t] as const))(
    'goes whole when its tile %i is bulldozed, and comes back whole with the undo',
    (_, tile) => {
      const h = crossroads();
      expect(stampCentred(h, 3).ok).toBe(true);
      const before = grid(h);
      const razed = run(h, 4, [{ kind: 'bulldoze', tiles: [tile] }]);
      expect(razed.ok).toBe(true);
      const g = grid(h);
      for (const t of CENTRED_TILES) expect(g.junctionControl[tileIndex(t.x, t.z)]).toBe(0);
      expect(network(h).getCentredRoundabouts()).toEqual([]);
      expect(run(h, 5, razed.inverse).ok).toBe(true);
      const back = grid(h);
      expect(Array.from(back.roadTier)).toEqual(Array.from(before.roadTier));
      expect(Array.from(back.junctionControl)).toEqual(Array.from(before.junctionControl));
      expect(network(h).getCentredRoundabouts()).toMatchObject([CENTRED]);
    },
  );

  it('is taken out, and put back, by its own commands, each the other’s exact inverse', () => {
    const h = crossroads();
    expect(stampCentred(h, 3).ok).toBe(true);
    const out = run(h, 4, [
      { kind: 'removeRoundabout', x: CENTRED.x, z: CENTRED.z, centred: true },
    ]);
    expect(out.ok).toBe(true);
    expect(out.inverse[0]).toEqual({
      kind: 'buildRoundabout',
      x: CENTRED.x,
      z: CENTRED.z,
      centred: true,
    });
    expect(network(h).getCentredRoundabouts()).toEqual([]);
    const back = run(h, 5, out.inverse);
    expect(back.ok).toBe(true);
    expect(back.inverse[0]).toMatchObject({ kind: 'removeRoundabout', centred: true });
    expect((back.inverse[0] as { junctions: unknown[] }).junctions).toHaveLength(9);
    expect(network(h).getCentredRoundabouts()).toMatchObject([CENTRED]);
    // Only the shape that stands can be taken out.
    expect(run(h, 6, [{ kind: 'removeRoundabout', x: CENTRED.x, z: CENTRED.z }]).ok).toBe(false);
    expect(
      run(h, 7, [{ kind: 'removeRoundabout', x: CENTRED.x + 1, z: CENTRED.z, centred: true }]).ok,
    ).toBe(false);
  });

  it('is refused by the world where the nine tiles are not laid, with the reason', () => {
    const h = crossroads();
    const refused = run(h, 3, [
      { kind: 'buildRoundabout', x: CENTRED.x, z: CENTRED.z, centred: true },
    ]);
    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe(CENTRED_RING_REFUSALS.notLaid);
  });

  it('reads as no roundabout of either kind once a corner loses its road', () => {
    const h = crossroads();
    expect(stampCentred(h, 3).ok).toBe(true);
    expect(run(h, 4, [{ kind: 'bulldoze', tiles: [{ x: X + 1, z: Z + 1 }] }]).ok).toBe(true);
    // The bulldoze took the roundabout whole; its codes are written back by hand to model a stale save.
    const g = grid(h);
    for (const t of CENTRED_TILES) g.junctionControl[tileIndex(t.x, t.z)] = CENTRED_ROUNDABOUT_CODE;
    const cars = new RoadNetwork();
    cars.rebuild(g);
    expect(cars.getCentredRoundabouts()).toEqual([]);
    expect(cars.getRoundabouts()).toEqual([]);
    expect(cars.getNodes().every((n) => n.ring !== true)).toBe(true);
  });

  it('survives a save, which carries nothing new but the code', () => {
    const h = crossroads();
    expect(stampCentred(h, 3).ok).toBe(true);
    h.sim.handleMessage({ type: 'requestSave' });
    const saved = h.messages.filter((m) => m.type === 'save').pop();
    expect(saved?.type).toBe('save');
    if (!saved || saved.type !== 'save') return;
    const h2 = sandboxed();
    h2.sim.handleMessage({ type: 'loadSave', data: saved.data });
    h2.ticks(2);
    expect(network(h2).getCentredRoundabouts()).toMatchObject([CENTRED]);
    expect(Array.from(grid(h2).junctionControl)).toEqual(Array.from(grid(h).junctionControl));
  });
});

describe('a centred roundabout laid on a T', () => {
  it('lays five tiles, the corners and the side with no road, and joins the three roads', () => {
    const h = tJunction();
    const laid = stampCentred(h, 3);
    expect(laid.ok, laid.reason).toBe(true);
    expect(laid.cost).toBe(5 * twoLaneSpec.costPerTile);
    const g = grid(h);
    for (const t of CENTRED_TILES) {
      expect(g.junctionControl[tileIndex(t.x, t.z)]).toBe(CENTRED_ROUNDABOUT_CODE);
      expect(g.roadTier[tileIndex(t.x, t.z)]).toBe(RoadTier.TwoLane);
    }
    expect(network(h).getCentredRoundabouts()[0]?.legs).toHaveLength(3);
  });

  it('routes every movement between its three legs, never against the ring', () => {
    const h = tJunction();
    expect(stampCentred(h, 3).ok).toBe(true);
    const cars = network(h);
    const legs = { west: LEGS.west!, east: LEGS.east!, north: LEGS.north! };
    for (const [fromName, from] of Object.entries(legs)) {
      for (const [toName, to] of Object.entries(legs)) {
        if (fromName === toName) continue;
        const path = cars.findPath(from, to);
        expect(path, `${fromName} to ${toName}`).not.toBeNull();
        const points = path!.points;
        for (let i = 1; i < points.length; i++) {
          const [a, b] = [points[i - 1]!, points[i]!];
          if (inCentred(a) && inCentred(b)) {
            expect(centredRunsRound(CENTRED, a, b), `${fromName} to ${toName}`).toBe(true);
          }
        }
      }
    }
  });

  it('is taken away whole by one undo, and bulldozed whole with its undo', () => {
    const h = tJunction();
    const before = grid(h);
    const laid = stampCentred(h, 3);
    expect(laid.ok).toBe(true);
    expect(run(h, 4, laid.inverse).ok).toBe(true);
    const after = grid(h);
    expect(Array.from(after.roadTier)).toEqual(Array.from(before.roadTier));
    expect(Array.from(after.junctionControl)).toEqual(Array.from(before.junctionControl));
    expect(stampCentred(h, 5).ok).toBe(true);
    const razed = run(h, 6, [{ kind: 'bulldoze', tiles: [{ x: X, z: Z + 1 }] }]);
    expect(razed.ok).toBe(true);
    expect(run(h, 7, razed.inverse).ok).toBe(true);
    expect(network(h).getCentredRoundabouts()).toMatchObject([CENTRED]);
  });
});
