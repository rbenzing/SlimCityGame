import { beforeAll, describe, expect, it } from 'vitest';
import golden from './kerbstalls.golden.json';
import { kerbTown, renderedKerbs, simKerb, type KerbTown } from '../support/kerbtown';
import { TILE_METERS } from '../../src/shared/constants';
import {
  isStraightRunMask,
  kerbCreditFor,
  paintedKerbStallsAlong,
  parkingSetbacksAt,
  type KerbSurroundings,
  type LotTiles,
} from '../../src/shared/kerblayout';
import { lotParkingRequirement } from '../../src/shared/parkingcode';
import type { Side } from '../../src/shared/roadedge';
import type { BuildingCatalogEntry } from '../../src/shared/types';
import { lotPlanFor } from '../../src/render/lotplan';
import { hasOwnLotParking } from '../../src/render/parked';
import { catalog } from '../support/sim';

/** The mask bits of a road running along x. */
const EAST_WEST = 2 | 8;

let town: KerbTown;
let sim: KerbSurroundings;
beforeAll(() => {
  town = kerbTown();
  sim = simKerb(town.h);
}, 120_000);

describe('kerb stalls — one layout for the road mesh and the sim', () => {
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
    // Every tile's faces are laid afresh on the sim side: about 9 s alone, more under a full run.
  }, 60_000);

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

describe('kerb credit — the stalls a lot fronts, counted alike by the sim and the road mesh', () => {
  const drawn = (): KerbSurroundings => town.renderer.kerbSurroundings();
  const roadAt = (x: number, z: number): boolean =>
    town.roadTiles.some((t) => t.x === x && t.z === z);
  const entry = (id: string): BuildingCatalogEntry => catalog.find((e) => e.id === id)!;

  /** Lots along the town's parked streets, each with the edge it fronts. */
  const LOTS: readonly { name: string; lot: LotTiles; side: Side }[] = [
    // The two-way parallel street at z = 20, parking both kerbs.
    { name: 'north of the parallel street', lot: { x: 12, z: 18, w: 3, d: 2 }, side: 'S' },
    { name: 'south of the parallel street', lot: { x: 12, z: 21, w: 3, d: 2 }, side: 'N' },
    // The two-way angled street at z = 50, parking its high kerb only.
    { name: 'south of the angled street', lot: { x: 26, z: 51, w: 3, d: 2 }, side: 'N' },
    { name: 'north of the angled street', lot: { x: 26, z: 48, w: 3, d: 2 }, side: 'S' },
    // The two-way head-in street at z = 80, parking its high kerb only.
    { name: 'south of the head-in street', lot: { x: 18, z: 81, w: 3, d: 2 }, side: 'N' },
  ];
  const credit = (name: string): number => {
    const { lot, side } = LOTS.find((l) => l.name === name)!;
    return kerbCreditFor(sim, lot, side);
  };

  it.each(LOTS)('$name: the sim credits what the road mesh paints', ({ lot, side }) => {
    expect(kerbCreditFor(sim, lot, side)).toBe(kerbCreditFor(drawn(), lot, side));
  });

  it('credits the stalls on the lot’s own kerb, never the far one', () => {
    expect(credit('north of the parallel street')).toBeGreaterThan(0);
    expect(credit('south of the parallel street')).toBeGreaterThan(0);
    expect(credit('south of the angled street')).toBeGreaterThan(0);
    // The angled street paints no lane on its low kerb.
    expect(credit('north of the angled street')).toBe(0);
  });

  it('counts each stall one, whatever its style: angled credits more than parallel, head-in more still', () => {
    const parallel = credit('south of the parallel street');
    const angled = credit('south of the angled street');
    expect(angled).toBeGreaterThan(parallel);
    expect(credit('south of the head-in street')).toBeGreaterThan(angled);
    // One credit per painted stall whose middle lies along the frontage, accessible ones included.
    const painted = paintedKerbStallsAlong(sim, {
      x: 26,
      z: 50,
      alongX: true,
      tiles: 3,
      side: 'high',
    });
    expect(angled).toBe(painted.length);
  });

  it('credits nothing in a junction’s no-parking zone', () => {
    // Beside the stop-controlled T at x = 20 on the parallel street, against
    // the same one-tile frontage in mid-block.
    const nearJunction = kerbCreditFor(sim, { x: 19, z: 21, w: 1, d: 2 }, 'N');
    const midBlock = kerbCreditFor(sim, { x: 14, z: 21, w: 1, d: 2 }, 'N');
    expect(midBlock).toBeGreaterThan(0);
    expect(nearJunction).toBeLessThan(midBlock);
  });

  it('draws on a strip’s lot the spaces its kerb credit leaves, and lays nothing for an exempt corner shop', () => {
    const strip = entry('com-strip-1-lot4x2');
    const required = lotParkingRequirement(strip)!.spaces;
    const credited = lotPlanFor(strip, 12, 21, roadAt, 0, drawn())!;
    const bare = lotPlanFor(strip, 12, 21, roadAt, 0, null)!;
    expect(credited.kerbCredit).toBe(kerbCreditFor(sim, { x: 12, z: 21, w: 4, d: 2 }, 'N'));
    expect(credited.kerbCredit).toBeGreaterThan(0);
    expect(credited.layout.required).toBe(required - credited.kerbCredit);
    expect(credited.layout.stalls).toHaveLength(credited.layout.provided);
    expect(credited.layout.stalls.length).toBeLessThan(bare.layout.stalls.length);
    expect(bare.layout.required).toBe(required);

    const shop = entry('com-low-1');
    const plan = lotPlanFor(shop, 12, 21, roadAt, 0, drawn())!;
    expect(plan.layout.required).toBe(0);
    expect(plan.layout.stalls).toHaveLength(0);
    // With no car park of its own, its customers use the kerb.
    expect(hasOwnLotParking(shop, 12, 21, roadAt, 0, drawn())).toBe(false);
  });
});
