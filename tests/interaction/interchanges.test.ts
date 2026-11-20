import { describe, expect, it } from 'vitest';
import { tileIndex } from '../../src/shared/constants';
import {
  interchangeCommands,
  interchangeLayout,
  readInterchangeSite,
  type InterchangeForm,
  type InterchangeGround,
} from '../../src/shared/interchange';
import { RoadFlow, RoadTier } from '../../src/shared/types';
import type { GridState, TilePoint } from '../../src/shared/types';
import { flowDirection } from '../../src/shared/types';
import { RoadNetwork } from '../../src/world/roadgraph';
import { column, latestSaveGrid, run, sandboxed, type Harness } from '../support/sim';

// A motorway of two carriageways down columns 40 (southbound) and 41
// (northbound), with the interchange's street crossing on row 50.
const SB = 40;
const NB = 41;
const ROW = 50;

function motorway(): Harness {
  const h = sandboxed();
  expect(
    run(h, 1, [{ kind: 'buildRoad', tier: RoadTier.Highway, tiles: column(SB, 20, 61) }]).ok,
  ).toBe(true);
  expect(
    run(h, 2, [
      { kind: 'buildRoad', tier: RoadTier.Highway, tiles: [...column(NB, 20, 61)].reverse() },
    ]).ok,
  ).toBe(true);
  return h;
}

function grid(h: Harness): GridState {
  h.sim.handleMessage({ type: 'requestSave' });
  return latestSaveGrid(h);
}

/** The grid as the layout reads it, from a save. */
function groundOf(g: GridState): InterchangeGround {
  const at = (x: number, z: number): number => tileIndex(x, z);
  return {
    motorwayFlowAt: (x, z) =>
      g.roadTier[at(x, z)] === RoadTier.Highway
        ? flowDirection(g.roadFlow[at(x, z)] ?? 0)
        : RoadFlow.None,
    maskAt: (x, z) => g.roadMask[at(x, z)] ?? 0,
    roadAt: (x, z) => (g.roadTier[at(x, z)] ?? 0) !== 0 || (g.overTier[at(x, z)] ?? 0) !== 0,
    overRoadAt: (x, z) => (g.overTier[at(x, z)] ?? 0) !== 0,
    buildableAt: () => true,
    heightAt: (x, z) => g.height[at(x, z)] ?? 0,
  };
}

function lay(form: InterchangeForm): { h: Harness; street: TilePoint[] } {
  const h = motorway();
  const site = readInterchangeSite({ x: SB, z: ROW }, groundOf(grid(h)));
  if ('refusal' in site) throw new Error(site.refusal);
  const ground = groundOf(grid(h));
  const layout = interchangeLayout(form, site, RoadTier.TwoLane, ground.heightAt);
  const laid = run(h, 3, interchangeCommands(layout, RoadTier.TwoLane));
  expect(laid.ok, laid.reason).toBe(true);
  return { h, street: layout.street.tiles };
}

describe.each(['diamond', 'parclo', 'cloverleaf'] as InterchangeForm[])('a %s laid', (form) => {
  it('serves every movement between the street and the motorway, and lets both run straight through', () => {
    const { h, street } = lay(form);
    const cars = new RoadNetwork();
    cars.rebuild(grid(h));
    const west = street[0]!;
    const east = street[street.length - 1]!;
    const routes: Array<[string, TilePoint, TilePoint]> = [
      ['onto the southbound from the west', west, { x: SB, z: 60 }],
      ['onto the southbound from the east', east, { x: SB, z: 60 }],
      ['onto the northbound from the west', west, { x: NB, z: 21 }],
      ['onto the northbound from the east', east, { x: NB, z: 21 }],
      ['off the southbound to the west', { x: SB, z: 21 }, west],
      ['off the southbound to the east', { x: SB, z: 21 }, east],
      ['off the northbound to the west', { x: NB, z: 60 }, west],
      ['off the northbound to the east', { x: NB, z: 60 }, east],
    ];
    for (const [name, from, to] of routes) expect(cars.findPath(from, to), name).not.toBeNull();
    // Straight across stays on the street, and straight down stays on the motorway.
    const across = cars.findPath(west, east)!;
    expect(across.points.every((p) => Math.round(p.z) === ROW)).toBe(true);
    const down = cars.findPath({ x: SB, z: 21 }, { x: SB, z: 60 })!;
    expect(down.points.every((p) => Math.round(p.x) === SB)).toBe(true);
  });

  it('is taken away whole by one undo', () => {
    const h = motorway();
    const before = grid(h);
    const site = readInterchangeSite({ x: SB, z: ROW }, groundOf(before));
    if ('refusal' in site) throw new Error(site.refusal);
    const laid = run(
      h,
      3,
      interchangeCommands(interchangeLayout(form, site, RoadTier.TwoLane), RoadTier.TwoLane),
    );
    expect(run(h, 4, laid.inverse).ok).toBe(true);
    const after = grid(h);
    expect(Array.from(after.roadTier)).toEqual(Array.from(before.roadTier));
    expect(Array.from(after.overTier)).toEqual(Array.from(before.overTier));
    expect(Array.from(after.roadMask)).toEqual(Array.from(before.roadMask));
  });
});

describe('a diamond laid: how its slip roads stand', () => {
  const NORTH = 1;
  const EAST = 2;
  const SOUTH = 4;
  const WEST = 8;
  /** Each neighbour's offset, the bit that says this tile joins it, and the bit that says it joins back. */
  const NEIGHBOURS = [
    [0, -1, NORTH, SOUTH],
    [1, 0, EAST, WEST],
    [0, 1, SOUTH, NORTH],
    [-1, 0, WEST, EAST],
  ] as const;

  /** The most recent junction list the sim posted: it travels only when it changes. */
  function junctionsOf(h: Harness): { x: number; z: number; control: string }[] {
    for (let i = h.messages.length - 1; i >= 0; i--) {
      const m = h.messages[i]!;
      if (m.type === 'snapshot' && m.snap.junctions !== undefined) return m.snap.junctions;
    }
    return [];
  }

  it('is four slip roads, each joined once to the motorway and once to the street, the street over both carriageways', () => {
    const { h } = lay('diamond');
    h.ticks(4);
    const g = grid(h);
    const tierAt = (x: number, z: number): number => g.roadTier[tileIndex(x, z)] ?? 0;
    const maskAt = (x: number, z: number): number => g.roadMask[tileIndex(x, z)] ?? 0;

    // The slip roads are the runs of ramp tiles joined to each other.
    const seen = new Set<string>();
    const runs: TilePoint[][] = [];
    for (let z = ROW - 16; z <= ROW + 16; z++) {
      for (let x = SB - 12; x <= NB + 12; x++) {
        if (tierAt(x, z) !== RoadTier.Ramp || seen.has(`${x},${z}`)) continue;
        const tiles: TilePoint[] = [];
        const stack = [{ x, z }];
        seen.add(`${x},${z}`);
        while (stack.length > 0) {
          const t = stack.pop()!;
          tiles.push(t);
          for (const [dx, dz, bit] of NEIGHBOURS) {
            const n = { x: t.x + dx, z: t.z + dz };
            if (tierAt(n.x, n.z) !== RoadTier.Ramp || seen.has(`${n.x},${n.z}`)) continue;
            if ((maskAt(t.x, t.z) & bit) === 0) continue;
            seen.add(`${n.x},${n.z}`);
            stack.push(n);
          }
        }
        runs.push(tiles);
      }
    }
    expect(runs).toHaveLength(4);

    const joinsOf = (tiles: TilePoint[], tier: number): TilePoint[] =>
      tiles.flatMap((t) =>
        NEIGHBOURS.flatMap(([dx, dz, bit, back]) => {
          const n = { x: t.x + dx, z: t.z + dz };
          return tierAt(n.x, n.z) === tier &&
            (maskAt(t.x, t.z) & bit) !== 0 &&
            (maskAt(n.x, n.z) & back) !== 0
            ? [n]
            : [];
        }),
      );
    const terminals: TilePoint[] = [];
    for (const [i, tiles] of runs.entries()) {
      expect(joinsOf(tiles, RoadTier.Highway), `slip road ${i} at the motorway`).toHaveLength(1);
      const street = joinsOf(tiles, RoadTier.TwoLane);
      expect(street, `slip road ${i} at the street`).toHaveLength(1);
      terminals.push(street[0]!);
    }

    // A ramp terminal is where the street holds traffic; the motorway end of a ramp never does.
    const controls = junctionsOf(h);
    for (const t of terminals) {
      const j = controls.find((q) => q.x === t.x && q.z === t.z);
      expect(j, `terminal ${t.x},${t.z}`).toBeDefined();
      expect(j!.control).not.toBe('none');
    }

    // The street crosses on the over layer, with the motorway still under it.
    for (const column of [SB, NB]) {
      expect(g.overTier[tileIndex(column, ROW)], `street over column ${column}`).toBe(
        RoadTier.TwoLane,
      );
      expect(tierAt(column, ROW)).toBe(RoadTier.Highway);
    }
  });
});
