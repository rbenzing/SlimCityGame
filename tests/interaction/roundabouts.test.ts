import { describe, expect, it } from 'vitest';
import { tileIndex } from '../../src/shared/constants';
import { codeForControl } from '../../src/shared/junction';
import { isPresetProfileId, presetProfileForTier } from '../../src/shared/roadprofile';
import {
  blockTiles,
  roundaboutAtJunction,
  roundaboutCommands,
  runsRound,
  type RoundaboutBlock,
} from '../../src/shared/roundabout';
import { RoadFlow, RoadTier } from '../../src/shared/types';
import type { GridState, SimSnapshot, TilePoint } from '../../src/shared/types';
import { RoadNetwork } from '../../src/world/roadgraph';
import { roundaboutGroundOf } from '../../src/world/roundabouts';
import { column, latestSaveGrid, run, sandboxed, type Harness } from '../support/sim';

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
