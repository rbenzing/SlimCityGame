import { describe, expect, it } from 'vitest';
import { RoadTier, ZoneType, type GridState } from '../shared/types';
import { MAX_BUILD_SLOPE, ROAD_CHECK_RADIUS, TILE_METERS } from '../shared/constants';
import { presetProfileForTier } from '../shared/roadprofile';
import { deriveRoadFootprint, halfWidthOf } from './freeroads';
import { createGrid } from './grid';
import { addNode, addSegment, createRoadNetwork, segmentGeom } from './roadnet';
import { SoilGrade } from '../shared/soil';
import {
  FARM_DEPTH,
  ZONE_DEPTH,
  computeFarmableMask,
  computeZonableMask,
  zonableMaskFor,
  computeZonableTiles,
  isZonable,
  type ZonableGridSource,
} from './zonable';

// ---------------------------------------------------------------------------
// Hand-built minimal grid (only the layers zonable.ts reads). Flat height 0,
// no water, no buildings, no roads unless the test adds them.
// ---------------------------------------------------------------------------
function makeGrid(size: number): ZonableGridSource {
  const n = size * size;
  return {
    size,
    roadTier: new Uint8Array(n),
    water: new Uint8Array(n),
    zone: new Uint8Array(n),
    buildingId: new Uint32Array(n),
    height: new Float32Array(n),
  };
}

function idx(size: number, x: number, z: number): number {
  return z * size + x;
}

/** True iff exactly the given coords are zonable in the returned tile set. */
function coordSet(tiles: Array<{ x: number; z: number }>): Set<string> {
  return new Set(tiles.map((t) => `${t.x},${t.z}`));
}

describe('ZONE_DEPTH', () => {
  it('is the distance a lot may stand from its street, so nothing zonable is land that can never grow', () => {
    expect(ZONE_DEPTH).toBe(ROAD_CHECK_RADIUS);
    expect(ZONE_DEPTH).toBe(3);
  });
});

describe('computeZonableTiles — straight road', () => {
  // Vertical run along Z at x=5, z=2..7 on a 12x12 flat grid.
  const size = 12;
  function straight(): ZonableGridSource {
    const g = makeGrid(size);
    for (let z = 2; z <= 7; z++) g.roadTier[idx(size, 5, z)] = RoadTier.TwoLane;
    return g;
  }

  it('makes a 3-deep band on BOTH sides (E and W)', () => {
    const set = coordSet(computeZonableTiles(straight()));
    // East side depth 1..3 for an interior road row.
    expect(set.has('6,4')).toBe(true);
    expect(set.has('7,4')).toBe(true);
    expect(set.has('8,4')).toBe(true);
    // West side depth 1..3.
    expect(set.has('4,4')).toBe(true);
    expect(set.has('3,4')).toBe(true);
    expect(set.has('2,4')).toBe(true);
  });

  it('marks nothing at depth 4, and never the road tile itself', () => {
    const set = coordSet(computeZonableTiles(straight()));
    expect(set.has('9,4')).toBe(false); // E depth 4
    expect(set.has('1,4')).toBe(false); // W depth 4
    expect(set.has('5,4')).toBe(false); // the road tile
  });

  it('marks nothing off the ends (no frontage along the run axis)', () => {
    const set = coordSet(computeZonableTiles(straight()));
    // Straight-off the N end (z=1) and S end (z=8): the run marches only E/W.
    expect(set.has('5,1')).toBe(false);
    expect(set.has('5,8')).toBe(false);
    expect(set.has('6,1')).toBe(false);
    expect(set.has('6,8')).toBe(false);
  });

  it('grants no frontage from a stretch that is up on a bridge deck', () => {
    const g = straight();
    const elevation = new Float32Array(size * size);
    g.roadElevation = elevation;
    // Lift the middle of the run: there is no way onto a lot from up there.
    for (const z of [4, 5]) elevation[idx(size, 5, z)] = 8;

    const set = coordSet(computeZonableTiles(g));
    expect(set.has('6,4')).toBe(false);
    expect(set.has('4,5')).toBe(false);
    // The at-grade stretch either side still fronts as it always did.
    expect(set.has('6,3')).toBe(true);
    expect(set.has('4,6')).toBe(true);
  });
});

describe('computeZonableTiles — dangling end', () => {
  // Length-2 road at x=5, z=3..4: both tiles are dangling ends.
  const size = 12;
  function dangling(): ZonableGridSource {
    const g = makeGrid(size);
    g.roadTier[idx(size, 5, 3)] = RoadTier.TwoLane;
    g.roadTier[idx(size, 5, 4)] = RoadTier.TwoLane;
    return g;
  }

  it('frontages the two perpendicular side bands only', () => {
    const set = coordSet(computeZonableTiles(dangling()));
    expect(set.has('6,3')).toBe(true); // E of (5,3)
    expect(set.has('4,3')).toBe(true); // W of (5,3)
    expect(set.has('6,4')).toBe(true);
    expect(set.has('4,4')).toBe(true);
  });

  it('never zones the open ends: end-cap and straight-off-end excluded', () => {
    const set = coordSet(computeZonableTiles(dangling()));
    expect(set.has('5,2')).toBe(false); // straight off the N open end
    expect(set.has('5,5')).toBe(false); // straight off the S open end
    expect(set.has('5,1')).toBe(false);
    expect(set.has('5,6')).toBe(false);
    expect(set.has('5,3')).toBe(false); // road tile itself
    expect(set.has('5,4')).toBe(false);
  });
});

describe('computeZonableTiles — direct access (blocking obstacles)', () => {
  const size = 12;

  it('a building mid-band blocks cells behind it, march stops', () => {
    const g = makeGrid(size);
    for (let z = 2; z <= 7; z++) g.roadTier[idx(size, 5, z)] = RoadTier.TwoLane;
    g.buildingId[idx(size, 7, 4)] = 42; // block at E depth 2 of row z=4
    const set = coordSet(computeZonableTiles(g));
    expect(set.has('6,4')).toBe(true); // before the block
    expect(set.has('7,4')).toBe(false); // the building tile
    expect(set.has('8,4')).toBe(false); // behind the block — no direct access
    expect(set.has('9,4')).toBe(false);
    expect(set.has('8,5')).toBe(true); // a different row is unaffected
  });

  it('water mid-band blocks cells behind it', () => {
    const g = makeGrid(size);
    for (let z = 2; z <= 7; z++) g.roadTier[idx(size, 5, z)] = RoadTier.TwoLane;
    g.water[idx(size, 3, 5)] = 1; // block at W depth 2 of row z=5
    const set = coordSet(computeZonableTiles(g));
    expect(set.has('4,5')).toBe(true); // before the block
    expect(set.has('3,5')).toBe(false); // water tile
    expect(set.has('2,5')).toBe(false); // behind the block
    expect(set.has('1,5')).toBe(false);
  });
});

describe('computeZonableTiles — T-junction & turns frontage the open sides', () => {
  const size = 12;

  it('a T-junction frontages its single open side', () => {
    const g = makeGrid(size);
    // Horizontal run along X at z=5, x=2..6; south stub at (4,6),(4,7).
    for (let x = 2; x <= 6; x++) g.roadTier[idx(size, x, 5)] = RoadTier.TwoLane;
    g.roadTier[idx(size, 4, 6)] = RoadTier.TwoLane;
    g.roadTier[idx(size, 4, 7)] = RoadTier.TwoLane;
    const set = coordSet(computeZonableTiles(g));
    // (4,5) connects W,E,S -> open side is N -> N band 1..3.
    expect(set.has('4,4')).toBe(true);
    expect(set.has('4,3')).toBe(true);
    expect(set.has('4,2')).toBe(true);
    expect(set.has('4,1')).toBe(false);
    // Stub end (4,7) is a dangling end -> side bands E/W, never the open S end.
    expect(set.has('5,7')).toBe(true);
    expect(set.has('3,7')).toBe(true);
    expect(set.has('4,8')).toBe(false); // straight off the stub's open end
  });

  it('a 4-way junction tile contributes no frontage of its own', () => {
    const g = makeGrid(size);
    // Cross centered at (6,6): arms N,S,E,W.
    g.roadTier[idx(size, 6, 6)] = RoadTier.TwoLane;
    g.roadTier[idx(size, 6, 5)] = RoadTier.TwoLane;
    g.roadTier[idx(size, 6, 7)] = RoadTier.TwoLane;
    g.roadTier[idx(size, 5, 6)] = RoadTier.TwoLane;
    g.roadTier[idx(size, 7, 6)] = RoadTier.TwoLane;
    // The center's own 4 orthogonal neighbours are all roads, so it marches
    // no frontage; but the arm ends still do. Diagonals-of-center like (7,7)
    // are reached by the arm dangling ends, so just assert the center adds
    // nothing directly: (6,6) is a road and not itself zonable.
    const set = coordSet(computeZonableTiles(g));
    expect(set.has('6,6')).toBe(false);
    // Arm tip (6,5) is a dangling end (connects only S) -> E/W bands, not N.
    expect(set.has('6,4')).toBe(false); // straight off the N arm's open end
    expect(set.has('7,5')).toBe(true); // E of the N arm tip
    expect(set.has('5,5')).toBe(true); // W of the N arm tip
  });
});

describe('computeZonableTiles — slope budget', () => {
  const size = 12;

  it('excludes cells whose slope to an orthogonal neighbour exceeds MAX_BUILD_SLOPE', () => {
    const g = makeGrid(size);
    for (let z = 2; z <= 7; z++) g.roadTier[idx(size, 5, z)] = RoadTier.TwoLane;
    // Raise the whole E half (x>=6) into a cliff; every x=6 cell now has a
    // (MAX_BUILD_SLOPE+... ) delta to its x=5 (road, height 0) neighbour.
    const tall = MAX_BUILD_SLOPE + 6;
    for (let z = 0; z < size; z++) {
      for (let x = 6; x < size; x++) g.height[idx(size, x, z)] = tall;
    }
    const set = coordSet(computeZonableTiles(g));
    expect(set.has('6,4')).toBe(false); // steep -> not buildable -> march stops
    expect(set.has('7,4')).toBe(false);
    // West side stays flat and zonable.
    expect(set.has('4,4')).toBe(true);
    expect(set.has('2,4')).toBe(true);
  });
});

describe('computeZonableTiles — depth parameter', () => {
  const size = 12;
  it('respects a custom depth', () => {
    const g = makeGrid(size);
    for (let z = 2; z <= 7; z++) g.roadTier[idx(size, 5, z)] = RoadTier.TwoLane;
    const set = coordSet(computeZonableTiles(g, 2));
    expect(set.has('6,4')).toBe(true); // depth 1
    expect(set.has('7,4')).toBe(true); // depth 2
    expect(set.has('8,4')).toBe(false); // depth 3 excluded
    expect(set.has('9,4')).toBe(false);
  });
});

describe('computeZonableTiles — no roads', () => {
  it('returns empty on a road-free grid', () => {
    const g = makeGrid(12);
    expect(computeZonableTiles(g)).toEqual([]);
  });

  it('an isolated single road tile (no run axis) contributes no frontage', () => {
    const g = makeGrid(12);
    g.roadTier[idx(12, 6, 6)] = RoadTier.TwoLane;
    expect(computeZonableTiles(g)).toEqual([]);
  });
});

describe('computeZonableTiles — does not consult the zone layer', () => {
  it('an already-zoned tile is still reported zonable', () => {
    const g = makeGrid(12);
    for (let z = 2; z <= 7; z++) g.roadTier[idx(12, 5, z)] = RoadTier.TwoLane;
    g.zone[idx(12, 6, 4)] = 1; // ResLow already painted
    const set = coordSet(computeZonableTiles(g));
    expect(set.has('6,4')).toBe(true);
  });
});

describe('computeZonableTiles — dedupe / union', () => {
  it('returns each zonable tile exactly once when two roads overlap frontage', () => {
    const g = makeGrid(12);
    // Two parallel vertical roads at x=4 and x=8; the band between them
    // (x=5,6,7) is frontage-reachable from BOTH.
    for (let z = 2; z <= 7; z++) {
      g.roadTier[idx(12, 4, z)] = RoadTier.TwoLane;
      g.roadTier[idx(12, 8, z)] = RoadTier.TwoLane;
    }
    const tiles = computeZonableTiles(g);
    const seen = new Set<string>();
    for (const t of tiles) {
      const key = `${t.x},${t.z}`;
      expect(seen.has(key)).toBe(false); // no duplicates
      seen.add(key);
    }
    // Shared middle tile appears once.
    expect(seen.has('6,4')).toBe(true);
  });
});

describe('isZonable', () => {
  const size = 12;
  function straight(): ZonableGridSource {
    const g = makeGrid(size);
    for (let z = 2; z <= 7; z++) g.roadTier[idx(size, 5, z)] = RoadTier.TwoLane;
    return g;
  }

  it('agrees exactly with the computeZonableTiles set', () => {
    const g = straight();
    const set = coordSet(computeZonableTiles(g));
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        expect(isZonable(g, x, z)).toBe(set.has(`${x},${z}`));
      }
    }
  });

  it('is false out of bounds', () => {
    const g = straight();
    expect(isZonable(g, -1, 4)).toBe(false);
    expect(isZonable(g, 4, -1)).toBe(false);
    expect(isZonable(g, size, 4)).toBe(false);
    expect(isZonable(g, 4, size)).toBe(false);
  });

  it('honours a custom depth', () => {
    const g = straight();
    expect(isZonable(g, 7, 4, 2)).toBe(true);
    expect(isZonable(g, 8, 4, 2)).toBe(false);
    expect(isZonable(g, 8, 4, 4)).toBe(true);
  });

  it('is false everywhere on a road-free grid', () => {
    const g = makeGrid(size);
    expect(isZonable(g, 5, 5)).toBe(false);
    expect(isZonable(g, 0, 0)).toBe(false);
  });
});

describe('computeZonableMask', () => {
  it('is a size*size byte mask matching the tile set', () => {
    const size = 12;
    const g = makeGrid(size);
    for (let z = 2; z <= 7; z++) g.roadTier[idx(size, 5, z)] = RoadTier.TwoLane;
    const mask = computeZonableMask(g);
    expect(mask.length).toBe(size * size);
    const tiles = computeZonableTiles(g);
    let count = 0;
    for (const b of mask) count += b;
    expect(count).toBe(tiles.length);
    for (const t of tiles) expect(mask[idx(size, t.x, t.z)]).toBe(1);
  });
});

describe('farmland', () => {
  // A vertical road along x=10, z=2..17, on a 24x24 grid of prime soil.
  const size = 24;
  function farmland(tier: RoadTier = RoadTier.Gravel): ZonableGridSource {
    const g = makeGrid(size);
    g.soil = new Uint8Array(size * size).fill(SoilGrade.Prime);
    for (let z = 2; z <= 17; z++) g.roadTier[idx(size, 10, z)] = tier;
    return g;
  }

  it('runs FARM_DEPTH back from both sides of a dirt road', () => {
    const mask = computeFarmableMask(farmland());
    expect(FARM_DEPTH).toBe(8);
    expect(mask[idx(size, 11, 9)]).toBe(1);
    expect(mask[idx(size, 18, 9)]).toBe(1);
    expect(mask[idx(size, 19, 9)]).toBe(0);
    expect(mask[idx(size, 2, 9)]).toBe(1);
    expect(mask[idx(size, 1, 9)]).toBe(0);
  });

  it.each([
    ['a two-lane street', RoadTier.TwoLane],
    ['an alley', RoadTier.Alley],
    ['a motorway', RoadTier.Highway],
  ])('is fronted by no road but a dirt one: not by %s', (_label, tier) => {
    expect(computeFarmableMask(farmland(tier)).every((b) => b === 0)).toBe(true);
  });

  it('runs right up to a paved road, which stops it but gives it no access of its own', () => {
    const g = farmland();
    for (let z = 0; z < size; z++) g.roadTier[idx(size, 14, z)] = RoadTier.TwoLane;
    const mask = computeFarmableMask(g);
    expect(mask[idx(size, 13, 9)]).toBe(1);
    expect(mask[idx(size, 14, 9)]).toBe(0);
    expect(mask[idx(size, 15, 9)]).toBe(0);
  });

  it('leaves unfit ground unzoned but marches on past it', () => {
    const g = farmland();
    g.soil![idx(size, 12, 9)] = SoilGrade.Unfit;
    const mask = computeFarmableMask(g);
    expect(mask[idx(size, 12, 9)]).toBe(0);
    expect(mask[idx(size, 13, 9)]).toBe(1);
  });

  it('takes somewhat fertile ground', () => {
    const g = farmland();
    g.soil![idx(size, 12, 9)] = SoilGrade.Marginal;
    expect(computeFarmableMask(g)[idx(size, 12, 9)]).toBe(1);
  });

  it('is nowhere on a grid nobody has graded', () => {
    const g = farmland();
    delete g.soil;
    expect(computeFarmableMask(g).every((b) => b === 0)).toBe(true);
  });

  it('gates Agriculture on farmland and every other zone on road frontage', () => {
    const g = farmland();
    expect(Array.from(zonableMaskFor(g, ZoneType.Agriculture))).toEqual(
      Array.from(computeFarmableMask(g)),
    );
    expect(Array.from(zonableMaskFor(g, ZoneType.ResLow))).toEqual(
      Array.from(computeZonableMask(g)),
    );
  });
});

describe('computeZonableMask — beside a road off the grid', () => {
  const a = { x: 60, z: 160 };
  const b = { x: a.x + 200 * Math.cos(Math.PI / 6), z: a.z + 200 * Math.sin(Math.PI / 6) };
  const cm = (m: number): number => Math.round(m * 100);
  const half = halfWidthOf(presetProfileForTier(RoadTier.TwoLane));

  function freeWorld(): GridState {
    const g = createGrid();
    const net = createRoadNetwork();
    const facts = { tier: RoadTier.TwoLane, profile: RoadTier.TwoLane, flow: 0 };
    const na = addNode(net, { ...facts, x: cm(a.x), z: cm(a.z), height: 0 });
    const nb = addNode(net, { ...facts, x: cm(b.x), z: cm(b.z), height: 0 });
    addSegment(net, { ...facts, a: na, b: nb, h0: 0, h1: 0, control: null });
    g.roads = net;
    deriveRoadFootprint(g, net, () => null);
    return g;
  }

  /** Metres from a tile's centre to the laid centre line. */
  function distanceToRoad(g: GridState, x: number, z: number): number {
    const geom = segmentGeom(g.roads!, 0);
    const p = { x: geom.a.x / 100, z: geom.a.z / 100 };
    const q = { x: geom.b.x / 100, z: geom.b.z / 100 };
    const cx = (x + 0.5) * TILE_METERS;
    const cz = (z + 0.5) * TILE_METERS;
    const dx = q.x - p.x;
    const dz = q.z - p.z;
    const t = Math.max(0, Math.min(1, ((cx - p.x) * dx + (cz - p.z) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(cx - (p.x + dx * t), cz - (p.z + dz * t));
  }

  it('zones every tile off the road within half its width plus the grid depth of the centre line, and none farther', () => {
    const g = freeWorld();
    const mask = computeZonableMask(g);
    const reach = half + ROAD_CHECK_RADIUS * TILE_METERS;
    let within = 0;
    let beyond = 0;
    for (let z = 0; z < g.size; z++) {
      for (let x = 0; x < g.size; x++) {
        const i = z * g.size + x;
        const near = distanceToRoad(g, x, z) <= reach;
        const onRoad = distanceToRoad(g, x, z) <= half;
        expect(mask[i], `${x},${z}`).toBe(near && !onRoad ? 1 : 0);
        if (near && !onRoad) within++;
        else if (!near) beyond++;
      }
    }
    expect(within).toBeGreaterThan(40);
    expect(beyond).toBeGreaterThan(0);
  });

  it('zones a tile the footprint band touches when its centre is off the right-of-way, and none on it', () => {
    const g = freeWorld();
    const mask = computeZonableMask(g);
    let touched = 0;
    for (let z = 0; z < g.size; z++) {
      for (let x = 0; x < g.size; x++) {
        const i = z * g.size + x;
        if (g.roadFootprint[i] !== 1) continue;
        if (distanceToRoad(g, x, z) > half) touched++;
        else expect(mask[i]).toBe(0);
      }
    }
    expect(touched).toBeGreaterThan(0);
  });

  it('leaves a grid street’s zonable set as it was, whatever net the source carries', () => {
    const plain = createGrid();
    for (let x = 10; x < 20; x++) plain.roadTier[idx(plain.size, x, 10)] = RoadTier.TwoLane;
    const before = Array.from(computeZonableMask(plain));
    plain.roads = createRoadNetwork();
    expect(Array.from(computeZonableMask(plain))).toEqual(before);
  });
});
