import { describe, expect, it, vi } from 'vitest';
import { BuildingState, FIELD_COUNT, FieldId, RoadTier } from '../shared/types';
import type { BuildingCatalogEntry, BuildingInstance, GridState } from '../shared/types';
import { MAP_TILES, tileIndex } from '../shared/constants';
import { createGrid } from '../world/grid';
import catalogData from '../data/catalog.json';
import { FieldSim, LAND_VALUE_BASE } from './fields';
import { ServiceSim } from './services';
import { SLOW_TEST_TIMEOUT_MS } from '../../tests/support/timeouts';

vi.setConfig({ testTimeout: SLOW_TEST_TIMEOUT_MS });

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const funding = { police: 1, fire: 1, health: 1, education: 1, park: 1 };

/** The lone street every street case lies along: two-lane road on z = 128, x = 100..160. */
const STREET_Z = 128;
const STREET_X0 = 100;
const STREET_X1 = 160;
/** A home's tile fronting the street, midway between the school and the station. */
const HOME = tileIndex(120, 127);

/** The block: a ring of streets 7 apart, x and z from 100 to 107, six tiles of lots inside. */
const BLOCK_LO = 100;
const BLOCK_HI = 107;

type Facility =
  | 'school'
  | 'police-station'
  | 'fire-station'
  | 'clinic'
  | 'library'
  | 'high-school'
  | 'small-park';

interface Site {
  x: number;
  z: number;
  w: number;
  d: number;
}

/** Footprint and spot of each facility on the lone street, all within two tiles of it. */
const STREET_SITES: Record<Facility, Site> = {
  school: { x: 110, z: 124, w: 3, d: 3 },
  'police-station': { x: 130, z: 125, w: 2, d: 2 },
  'fire-station': { x: 130, z: 125, w: 2, d: 2 },
  clinic: { x: 110, z: 126, w: 1, d: 2 },
  library: { x: 110, z: 125, w: 3, d: 2 },
  'high-school': { x: 108, z: 123, w: 5, d: 4 },
  'small-park': { x: 120, z: 126, w: 1, d: 1 },
};

/** The same two services outside the block, against its north street. */
const BLOCK_SITES: Partial<Record<Facility, Site>> = {
  school: { x: 101, z: 97, w: 3, d: 3 },
  'police-station': { x: 104, z: 98, w: 2, d: 2 },
};

interface Town {
  g: GridState;
  buildings: BuildingInstance[];
  fields: FieldSim;
  services: ServiceSim;
}

function place(t: Town, id: number, catalogId: Facility, site: Site): void {
  const { x, z, w, d } = site;
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) t.g.buildingId[tileIndex(x + dx, z + dz)] = id;
  }
  t.buildings.push({
    id,
    catalogId,
    x,
    z,
    rotation: 0,
    level: 1,
    state: BuildingState.Active,
    problems: 0,
  });
}

function empty(): Town {
  return {
    g: createGrid(),
    buildings: [],
    fields: new FieldSim(),
    services: new ServiceSim(catalog),
  };
}

/** A lone street with the named facilities on it, one service tick already run. */
function town(...facilities: Facility[]): Town {
  const t = empty();
  for (let x = STREET_X0; x <= STREET_X1; x++) {
    t.g.roadTier[tileIndex(x, STREET_Z)] = RoadTier.TwoLane;
  }
  facilities.forEach((f, i) => place(t, i + 1, f, STREET_SITES[f]));
  t.services.tick(t.g, t.buildings, funding, [], 6);
  return t;
}

/** A ring of four streets with the named facilities outside it, one service tick already run. */
function block(...facilities: Facility[]): Town {
  const t = empty();
  for (let i = BLOCK_LO; i <= BLOCK_HI; i++) {
    t.g.roadTier[tileIndex(i, BLOCK_LO)] = RoadTier.TwoLane;
    t.g.roadTier[tileIndex(i, BLOCK_HI)] = RoadTier.TwoLane;
    t.g.roadTier[tileIndex(BLOCK_LO, i)] = RoadTier.TwoLane;
    t.g.roadTier[tileIndex(BLOCK_HI, i)] = RoadTier.TwoLane;
  }
  facilities.forEach((f, i) => place(t, i + 1, f, BLOCK_SITES[f]!));
  t.services.tick(t.g, t.buildings, funding, [], 6);
  return t;
}

/** Only land value's own slots run: enough passes to settle, and cheap. */
function settle(t: Town, passes = 400): void {
  for (let p = 0; p < passes; p++) t.fields.tick(t.g, p * 8, t.services.lotReachOn(t.g));
}

const landValueAt = (t: Town, tile = HOME): number => t.g.fields[FieldId.LandValue]![tile]!;

/** Land value on rows 1 to 4 north of the lone street, at x = 120. */
function rowsFromStreet(t: Town): number[] {
  return [127, 126, 125, 124].map((z) => landValueAt(t, tileIndex(120, z)));
}

/** Every lot tile inside the block. */
function blockLots(t: Town): number[] {
  const out: number[] = [];
  for (let z = BLOCK_LO + 1; z < BLOCK_HI; z++) {
    for (let x = BLOCK_LO + 1; x < BLOCK_HI; x++) out.push(landValueAt(t, tileIndex(x, z)));
  }
  return out;
}

describe('land value equilibrium on bare ground', () => {
  it.each([
    [0, 119],
    [16, 138],
    [32, 158],
  ])('a gain of 7 plus %i of trees settles at %i', (trees, settled) => {
    const t = town();
    t.g.trees.fill(trees);
    settle(t);
    expect(landValueAt(t, tileIndex(50, 50))).toBe(settled);
  });

  it('puts bare clean ground at LAND_VALUE_BASE, the figure the other cases build on', () => {
    expect(LAND_VALUE_BASE).toBe(119);
  });
});

describe('a school and a police station on a lone street', () => {
  it('with neither leave every row exactly as bare ground is', () => {
    const t = town();
    settle(t);
    expect(rowsFromStreet(t)).toEqual([119, 119, 119, 119]);
  });

  it('with a school alone settle rows 1 to 4 at 128, 126, 123, 119: under level 2', () => {
    const t = town('school');
    settle(t);
    expect(rowsFromStreet(t)).toEqual([128, 126, 123, 119]);
  });

  it('with a police station alone settle rows 1 to 4 at 128, 126, 123, 119: under level 2', () => {
    const t = town('police-station');
    settle(t);
    expect(rowsFromStreet(t)).toEqual([128, 126, 123, 119]);
  });

  it('with both settle rows 1 to 4 at 141, 139, 135, 122: only row 1 clears level 2 (a lone street has bare ground behind it)', () => {
    const t = town('school', 'police-station');
    settle(t);
    expect(rowsFromStreet(t)).toEqual([141, 139, 135, 122]);
  });
});

describe('a school and a police station on a block of streets 7 apart', () => {
  it('with neither leave every lot at 119, exactly as today', () => {
    const t = block();
    settle(t);
    expect(new Set(blockLots(t))).toEqual(new Set([119]));
  });

  it.each(['school', 'police-station'] as const)(
    'with a %s alone settle every lot at 138: none passes level 2',
    (facility) => {
      const t = block(facility);
      settle(t);
      expect(new Set(blockLots(t))).toEqual(new Set([138]));
    },
  );

  it('with both settle every lot between 153 and 158: over level 2, under the double lot and level 3', () => {
    const t = block('school', 'police-station');
    settle(t);
    const lots = blockLots(t);
    expect(Math.min(...lots)).toBe(153);
    expect(Math.max(...lots)).toBe(158);
    for (const v of lots) {
      expect(v).toBeGreaterThan(140);
      expect(v).toBeLessThan(160);
    }
  });
});

describe('what else is in reach adds nothing', () => {
  it('a park tile keeps what the park gave it: level 3 still comes from the park', () => {
    const parkTile = tileIndex(120, 126);
    const withPark = (...facilities: Facility[]): number => {
      const t = town('small-park', ...facilities);
      for (let p = 0; p < 400; p++) {
        t.services.tick(t.g, t.buildings, funding, [], p * 8 + 6);
        t.fields.tick(t.g, p * 8 + 8, t.services.lotReachOn(t.g));
      }
      return landValueAt(t, parkTile);
    };
    const alone = withPark();
    const served = withPark('school', 'police-station');
    expect(alone).toBeGreaterThanOrEqual(190);
    expect(served).toBeGreaterThanOrEqual(alone);
  });

  it.each(['fire-station', 'clinic', 'library', 'high-school'] as const)(
    'a %s beside the street adds nothing',
    (facility) => {
      const t = town(facility);
      settle(t);
      expect(rowsFromStreet(t)).toEqual([119, 119, 119, 119]);
    },
  );

  it('a clinic and a high school do reach the street, so their nothing is not an absent reach', () => {
    expect(town('clinic').g.fields[FieldId.Health]![HOME]).toBeGreaterThan(0);
    expect(town('high-school').g.fields[FieldId.HighEducation]![HOME]).toBeGreaterThan(0);
  });

  it('two runs of the same town settle to the same bytes', () => {
    const run = (): Uint8Array => {
      const t = town('school', 'police-station');
      t.g.water[tileIndex(90, 90)] = 1;
      t.g.trees[tileIndex(121, 126)] = 90;
      settle(t, 150);
      return t.g.fields[FieldId.LandValue]!.slice();
    };
    expect(run()).toEqual(run());
  });
});

describe('reach follows the roads', () => {
  /** A second street 6 tiles off the first, joined to nothing, with water between. */
  const apart = (): Town => {
    const t = town();
    for (let x = 100; x <= 135; x++) t.g.roadTier[tileIndex(x, 134)] = RoadTier.TwoLane;
    for (let x = 98; x <= 137; x++) t.g.water[tileIndex(x, 131)] = t.g.water[tileIndex(x, 132)] = 1;
    place(t, 8, 'police-station', STREET_SITES['police-station']);
    place(t, 9, 'school', STREET_SITES.school);
    t.services.tick(t.g, t.buildings, funding, [], 14);
    return t;
  };

  it('marks lots on the street a station stands on, and none on a street no road joins to it', () => {
    const t = apart();
    const r = t.services.lotReachOn(t.g)!;
    expect(r.police[tileIndex(131, 129)]).toBe(1);
    expect(r.police[tileIndex(120, 133)]).toBe(0);
    expect(r.police[tileIndex(120, 134)]).toBe(0);
    expect(r.police[tileIndex(120, 135)]).toBe(0);
  });

  it('marks school lots only where the school field is over the gate, and none across the water', () => {
    const t = apart();
    const r = t.services.lotReachOn(t.g)!;
    expect(r.school[HOME]).toBe(1);
    expect(r.school[tileIndex(120, 133)]).toBe(0);
    // 48 road tiles from the school, the field there is under the gate.
    expect(r.school[tileIndex(158, 127)]).toBe(0);
  });

  it('reaches lots ZONE_DEPTH (3) from the road and not a tile further', () => {
    const t = town('police-station');
    const r = t.services.lotReachOn(t.g)!;
    expect(r.police[tileIndex(120, 125)]).toBe(1);
    expect(r.police[tileIndex(120, 124)]).toBe(0);
    expect(r.police[tileIndex(120, 131)]).toBe(1);
    expect(r.police[tileIndex(120, 132)]).toBe(0);
  });

  it('follows the station: placed, then bulldozed', () => {
    const t = town();
    expect(t.services.lotReachOn(t.g)!.police[HOME]).toBe(0);
    place(t, 5, 'police-station', STREET_SITES['police-station']);
    t.services.tick(t.g, t.buildings, funding, [], 14);
    expect(t.services.lotReachOn(t.g)!.police[HOME]).toBe(1);
    for (const tile of t.g.buildingId.keys())
      if (t.g.buildingId[tile] === 5) t.g.buildingId[tile] = 0;
    t.buildings.pop();
    t.services.tick(t.g, t.buildings, funding, [], 22);
    expect(t.services.lotReachOn(t.g)!.police[HOME]).toBe(0);
  });

  it('follows the road: cut between the station and a tile, the tile is no longer reached', () => {
    const t = town('police-station');
    expect(t.services.lotReachOn(t.g)!.police[HOME]).toBe(1);
    t.g.roadTier[tileIndex(124, STREET_Z)] = RoadTier.None;
    t.services.tick(t.g, t.buildings, funding, [], 14);
    const r = t.services.lotReachOn(t.g)!;
    expect(r.police[tileIndex(135, 127)]).toBe(1);
    // West of the cut the road still runs, and the station no longer reaches it.
    expect(r.police[HOME]).toBe(0);
  });

  it('is empty for a grid no tick has seen, and nothing about it is saved', () => {
    const t = town('police-station');
    expect(t.services.lotReachOn(createGrid())).toBeNull();
    expect(t.g.fields.length).toBe(FIELD_COUNT);
    expect(t.services.lotReachOn(t.g)!.police.length).toBe(MAP_TILES);
  });
});
