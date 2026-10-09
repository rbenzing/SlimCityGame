import { beforeAll, describe, expect, it } from 'vitest';
import golden from './kerbstalls.golden.json';
import { kerbTown, renderedKerbs, type KerbTown } from '../support/kerbtown';
import { latestSaveData, latestSaveGrid } from '../support/sim';
import { decodeSave } from '../../src/app/persist';
import { TILE_METERS } from '../../src/shared/constants';
import {
  isStraightRunMask,
  paintedKerbStallsAlong,
  parkingSetbacksAt,
  type KerbSurroundings,
} from '../../src/shared/kerblayout';
import { isPresetProfileId, presetProfileForTier } from '../../src/shared/roadprofile';
import type { RoadProfile, RoadTier } from '../../src/shared/types';
import { gridKerbSurroundings } from '../../src/sim/kerbsurroundings';
import { RoadNetwork } from '../../src/world/roadgraph';

/** The mask bits of a road running along x. */
const EAST_WEST = 2 | 8;

/** The town's roads as the sim holds them: its saved grid, its road graph and its profile table. */
function simSide(town: KerbTown): KerbSurroundings {
  town.h.sim.handleMessage({ type: 'requestSave' });
  const table = new Map(
    (decodeSave(latestSaveData(town.h)).meta.roadProfiles ?? []).map((e) => [e.id, e.profile]),
  );
  const profileById = (id: number): RoadProfile | null =>
    isPresetProfileId(id) ? presetProfileForTier(id as RoadTier) : (table.get(id) ?? null);
  const grid = latestSaveGrid(town.h);
  const network = new RoadNetwork();
  network.setProfileResolver((id) => table.get(id) ?? null);
  network.rebuild(grid);
  return gridKerbSurroundings(grid, network.getNodes(), profileById);
}

describe('kerb stalls — one layout for the road mesh and the sim', () => {
  let town: KerbTown;
  let sim: KerbSurroundings;
  beforeAll(() => {
    town = kerbTown();
    sim = simSide(town);
  }, 120_000);

  it('marks every stall, setback and accessible stall where it always has', () => {
    expect(renderedKerbs(town)).toEqual(golden);
  });

  it('gives the sim the setbacks and the stalls the road mesh marks, tile by tile', () => {
    let stalls = 0;
    let accessible = 0;
    for (const { x, z } of town.roadTiles) {
      expect(parkingSetbacksAt(x, z, sim), `setbacks at ${x},${z}`).toEqual(
        town.renderer.parkingSetbacksAt(x, z),
      );
      const tile = sim.roadAt(x, z)!;
      if (!isStraightRunMask(tile.mask)) continue;
      const alongX = (tile.mask & EAST_WEST) !== 0;
      for (const side of ['low', 'high'] as const) {
        const painted = paintedKerbStallsAlong(sim, { x, z, alongX, tiles: 1, side });
        const rendered = town.renderer.parkingStallsAt(x, z, side) ?? [];
        expect(
          painted.map(({ style: _style, ...stall }) => stall),
          `${side} kerb at ${x},${z}`,
        ).toEqual(rendered);
        stalls += painted.length;
        accessible += painted.filter((s) => s.accessible).length;
      }
    }
    // The town marks hundreds of stalls, accessible ones among them.
    expect(stalls).toBeGreaterThan(1000);
    expect(accessible).toBeGreaterThan(50);
  });

  it('counts a frontage of several tiles as the stalls whose middles lie along it, in its style', () => {
    // Five tiles of the two-way angled street east of its signal, on its parking side.
    const frontage = { x: 24, z: 50, alongX: true, tiles: 5, side: 'high' } as const;
    const painted = paintedKerbStallsAlong(sim, frontage);
    const rendered = Array.from(
      { length: frontage.tiles },
      (_, i) => town.renderer.parkingStallsAt(frontage.x + i, frontage.z, frontage.side) ?? [],
    ).flat();
    expect(painted.length).toBeGreaterThan(0);
    expect(painted.map(({ style: _style, ...stall }) => stall)).toEqual(rendered);
    expect(painted.every((s) => s.style === 'angled')).toBe(true);
    const start = frontage.x * TILE_METERS;
    const end = start + frontage.tiles * TILE_METERS;
    expect(painted.every((s) => s.centre >= start && s.centre < end)).toBe(true);
    // The far kerb of that street paints no parking lane.
    expect(paintedKerbStallsAlong(sim, { ...frontage, side: 'low' })).toEqual([]);
  });

  it('counts nothing along a frontage the road only crosses', () => {
    // The two-way parallel street runs along x at z = 20; a frontage along z
    // through it meets it at one tile, crosswise.
    expect(
      paintedKerbStallsAlong(sim, { x: 25, z: 18, alongX: false, tiles: 5, side: 'low' }),
    ).toEqual([]);
  });
});
