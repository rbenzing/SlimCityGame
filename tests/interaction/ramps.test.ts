import { describe, expect, it } from 'vitest';
import { tileIndex } from '../../src/shared/constants';
import { carriagewayWidth, presetProfileForTier } from '../../src/shared/roadprofile';
import { flowDirection, RoadFlow, RoadTier } from '../../src/shared/types';
import type { GridState, SimSnapshot } from '../../src/shared/types';
import { column, latestSaveGrid, roadRow, run, sandboxed, type Harness } from '../support/sim';

const NORTH = 1;
const SOUTH = 4;
/** A motorway along row 10 and a street along row 16, both from x = 10 across 19 tiles. */
const HWY = 10;
const STREET = 16;
/** The slip roads: one climbs from beside the street, round an elbow, and merges east; one leaves going east and drops to the street. */
const ON = { x: 19, mergeX: 23 };
const OFF = { x: 15, leaveX: 12 };
const onRamp = [...column(ON.x, HWY + 1, 5).reverse(), ...roadRow(ON.x + 1, HWY + 1, 4)];
const offRamp = [...roadRow(OFF.leaveX, HWY + 1, 4), ...column(OFF.x, HWY + 2, 4)];

function laid(): Harness {
  const h = sandboxed();
  run(h, 1, [
    { kind: 'buildRoad', tier: RoadTier.Highway, tiles: roadRow(10, HWY, 19) },
    { kind: 'buildRoad', tier: RoadTier.TwoLane, tiles: roadRow(10, STREET, 19) },
  ]);
  expect(run(h, 2, [{ kind: 'buildRoad', tier: RoadTier.Ramp, tiles: onRamp }]).ok).toBe(true);
  expect(run(h, 3, [{ kind: 'buildRoad', tier: RoadTier.Ramp, tiles: offRamp }]).ok).toBe(true);
  h.ticks(4);
  return h;
}

function grid(h: Harness): GridState {
  h.sim.handleMessage({ type: 'requestSave' });
  return latestSaveGrid(h);
}

/** The most recent junction list the sim posted: it travels only when it changes. */
function junctionsOf(h: Harness): NonNullable<SimSnapshot['junctions']> {
  for (let i = h.messages.length - 1; i >= 0; i--) {
    const m = h.messages[i]!;
    if (m.type === 'snapshot' && m.snap.junctions !== undefined) return m.snap.junctions;
  }
  return [];
}

describe('a slip road laid as a player lays one', () => {
  it('is one lane 7.8 m across', () => {
    const profile = presetProfileForTier(RoadTier.Ramp);
    expect(profile.pieces.filter((p) => p.kind === 'travel')).toHaveLength(1);
    expect(carriagewayWidth(profile)).toBeCloseTo(7.8, 6);
  });

  it('lays every tile of both slip roads as ramp, and leaves the street its own tiles', () => {
    const g = grid(laid());
    for (const t of [...onRamp, ...offRamp])
      expect(g.roadTier[tileIndex(t.x, t.z)], `${t.x},${t.z}`).toBe(RoadTier.Ramp);
    expect(g.roadTier[tileIndex(ON.x, STREET)]).toBe(RoadTier.TwoLane);
    expect(g.roadTier[tileIndex(OFF.x, STREET)]).toBe(RoadTier.TwoLane);
  });

  it('runs the way it was drawn: the on-ramp climbs north, the off-ramp drops south', () => {
    const g = grid(laid());
    const flowAt = (x: number, z: number): number =>
      flowDirection(g.roadFlow[tileIndex(x, z)] ?? 0);
    expect(flowAt(ON.x, HWY + 3)).toBe(RoadFlow.North);
    expect(flowAt(OFF.x, HWY + 3)).toBe(RoadFlow.South);
  });

  it('joins the motorway at one end and the street at the other, each holding the other', () => {
    const g = grid(laid());
    const maskAt = (x: number, z: number): number => g.roadMask[tileIndex(x, z)] ?? 0;
    // On-ramp: merges into the motorway beside it, and ends against the street.
    expect(maskAt(ON.mergeX, HWY + 1) & NORTH).toBe(NORTH);
    expect(maskAt(ON.mergeX, HWY) & SOUTH).toBe(SOUTH);
    expect(maskAt(ON.x, STREET - 1) & SOUTH).toBe(SOUTH);
    expect(maskAt(ON.x, STREET) & NORTH).toBe(NORTH);
    // Off-ramp: leaves the motorway, and drops to the street.
    expect(maskAt(OFF.leaveX, HWY + 1) & NORTH).toBe(NORTH);
    expect(maskAt(OFF.leaveX, HWY) & SOUTH).toBe(SOUTH);
    expect(maskAt(OFF.x, STREET - 1) & SOUTH).toBe(SOUTH);
    expect(maskAt(OFF.x, STREET) & NORTH).toBe(NORTH);
    // Beside the motorway the ramp stays its own road until its end.
    for (const x of [ON.x + 1, ON.mergeX - 1])
      expect(maskAt(x, HWY + 1) & NORTH, `ramp at ${x}`).toBe(0);
  });

  it('holds nobody on the motorway, and holds the street where the ramp meets it', () => {
    const h = laid();
    const controls = junctionsOf(h);
    const at = (x: number, z: number) => controls.find((j) => j.x === x && j.z === z);
    const merge = at(ON.mergeX, HWY);
    if (merge) expect(merge.control).toBe('none');
    for (const x of [ON.x, OFF.x]) {
      const terminal = at(x, STREET);
      expect(terminal, `terminal at ${x}`).toBeDefined();
      expect(terminal!.control).not.toBe('none');
    }
  });
});
