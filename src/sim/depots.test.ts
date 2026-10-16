import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { connectedDepots, fleetPools, inServiceAt } from './depots';
import { createGrid } from '../world/grid';
import { MAP_SIZE, tileIndex } from '../shared/constants';
import {
  BuildingState,
  Problem,
  RoadTier,
  type BuildingCatalogEntry,
  type BuildingInstance,
  type GridState,
} from '../shared/types';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const byId = new Map(catalog.map((e) => [e.id, e]));

function depot(
  id: number,
  catalogId: string,
  x: number,
  z: number,
  extra: Partial<BuildingInstance> = {},
): BuildingInstance {
  return {
    id,
    catalogId,
    x,
    z,
    rotation: 0,
    level: 1,
    state: BuildingState.Active,
    problems: 0,
    ...extra,
  };
}

/** A street along row 10, tram track along row 20 and rail along row 30, with power everywhere. */
function grid(): GridState {
  const g = createGrid(MAP_SIZE);
  g.power.fill(1);
  for (let x = 0; x < 64; x++) {
    g.roadTier[tileIndex(x, 10)] = RoadTier.TwoLane;
    g.roadTier[tileIndex(x, 20)] = RoadTier.Tram;
    g.roadTier[tileIndex(x, 30)] = RoadTier.RailTrack;
  }
  return g;
}

/** Takes the power off every tile of a w × d lot at (x, z). */
function unpower(g: GridState, x: number, z: number, w: number, d: number): void {
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) g.power[tileIndex(x + dx, z + dz)] = 0;
  }
}

describe('the catalog’s depots', () => {
  it('holds the four, each fielding a fifth less than it holds', () => {
    expect(byId.get('bus-depot')!.depot).toEqual({ mode: 'bus', fleet: 10 });
    expect(byId.get('bus-garage')!.depot).toEqual({ mode: 'bus', fleet: 36 });
    expect(byId.get('tram-depot')!.depot).toEqual({ mode: 'tram', fleet: 8 });
    expect(byId.get('rail-yard')!.depot).toEqual({ mode: 'rail', fleet: 5 });
    expect(byId.get('tram-depot')!.requiresAdjacent).toBe('tram');
    expect(byId.get('rail-yard')!.requiresAdjacent).toBe('rail');
    expect(byId.get('bus-depot')!.unlockMilestone).toBe(1);
    expect(byId.get('bus-garage')!.unlockMilestone).toBe(4);
    expect(byId.get('tram-depot')!.unlockMilestone).toBe(3);
    expect(byId.get('rail-yard')!.unlockMilestone).toBe(3);
  });
});

describe('which depots field', () => {
  it('a bus depot on a street fields eight; two of them pool sixteen', () => {
    const g = grid();
    const depots = connectedDepots(
      g,
      [depot(1, 'bus-depot', 4, 11), depot(2, 'bus-depot', 20, 8)],
      byId,
    );
    expect(depots.map((d) => d.fields)).toEqual([8, 8]);
    expect(fleetPools(depots)).toEqual({ bus: 16, rail: 0, tram: 0 });
  });

  it('a depot of another mode adds nothing to the bus pool', () => {
    const g = grid();
    const depots = connectedDepots(
      g,
      [depot(1, 'bus-depot', 4, 11), depot(2, 'tram-depot', 4, 21), depot(3, 'rail-yard', 4, 31)],
      byId,
    );
    expect(fleetPools(depots)).toEqual({ bus: 8, tram: 6, rail: 4 });
  });

  it('fields nothing off its network: a bus depot touching only tram track or rail, a tram depot touching only a street', () => {
    const g = grid();
    const depots = connectedDepots(
      g,
      [depot(1, 'bus-depot', 4, 31), depot(2, 'tram-depot', 4, 11), depot(3, 'rail-yard', 4, 21)],
      byId,
    );
    expect(depots).toEqual([]);
  });

  it('a bus depot on the tram track fields, since tram track is a street', () => {
    const g = grid();
    expect(connectedDepots(g, [depot(1, 'bus-depot', 4, 21)], byId)).toHaveLength(1);
  });

  it('fields nothing with no power on its lot, under construction or abandoned', () => {
    const g = grid();
    unpower(g, 4, 11, 2, 2);
    const buildings = [
      depot(1, 'bus-depot', 4, 11),
      depot(2, 'bus-depot', 10, 11, { state: BuildingState.Constructing }),
      depot(3, 'bus-depot', 16, 11, { state: BuildingState.Abandoned }),
      // Short of water, or flagged for it, a depot still fields: only power is asked.
      depot(4, 'bus-depot', 22, 11, { problems: Problem.NoWater }),
    ];
    expect(connectedDepots(g, buildings, byId).map((d) => d.id)).toEqual([4]);
    // Power on any one tile of the lot is enough, as it is for growth.
    g.power[tileIndex(5, 12)] = 1;
    expect(connectedDepots(g, buildings, byId).map((d) => d.id)).toEqual([1, 4]);
  });

  it('reads a turned footprint: a 3×4 yard turned a quarter lies 4 along the track', () => {
    const g = grid();
    // At rotation 1 the yard is 4 wide and 3 deep, so (4, 27) reaches z 29 and touches the rail at z 30.
    expect(connectedDepots(g, [depot(1, 'rail-yard', 4, 27, { rotation: 1 })], byId)).toHaveLength(
      1,
    );
    // Unturned it is 3 wide and 4 deep: z 27..30 overlaps the rail rather than touching it, so stand it at 26.
    expect(connectedDepots(g, [depot(1, 'rail-yard', 4, 26)], byId)).toHaveLength(1);
    expect(connectedDepots(g, [depot(1, 'rail-yard', 4, 25)], byId)).toEqual([]);
  });

  it('lists depots in ascending id whatever order the registry gives', () => {
    const g = grid();
    const depots = connectedDepots(
      g,
      [depot(5, 'bus-depot', 20, 11), depot(2, 'bus-depot', 4, 11)],
      byId,
    );
    expect(depots.map((d) => d.id)).toEqual([2, 5]);
  });
});

describe('what a depot has in service', () => {
  it('fills depots in ascending id with the mode’s served total', () => {
    const g = grid();
    const depots = connectedDepots(
      g,
      [depot(1, 'bus-depot', 4, 11), depot(2, 'bus-garage', 20, 11), depot(3, 'tram-depot', 4, 21)],
      byId,
    );
    const served = { bus: 11, rail: 0, tram: 2 };
    expect(inServiceAt(depots, 1, served)).toBe(8);
    expect(inServiceAt(depots, 2, served)).toBe(3);
    expect(inServiceAt(depots, 3, served)).toBe(2);
    expect(inServiceAt(depots, 9, served)).toBe(0);
  });
});
