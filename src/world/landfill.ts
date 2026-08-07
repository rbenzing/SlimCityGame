/**
 * SlimCity landfill area paint: a per-tile membership layer (GridState.landfill)
 * painted/erased like world/districts.ts paints districts. Collected trash piles
 * up on these tiles; painting more expands the landfill's capacity.
 *
 * Placement follows the ZONE rule, not the district rule: a tile can only JOIN
 * a landfill if it is zonable — empty land with perpendicular road frontage
 * (world/zonable.ts computeZonableMask), the same "available road grid" the
 * zone brushes paint into. A landfill is an operated facility: its grounds
 * need street access for the garbage trucks, so it can't be painted onto
 * roadless backcountry. Erasing is ungated (any in-bounds tile clears).
 *
 * Pure, no three.js/DOM, worker-owned. Mirrors world/districts.ts's
 * command-agnostic contract: paintLandfill stamps membership onto every eligible
 * in-bounds tile of `tiles` and returns exactly the tiles actually applied, so
 * the worker builds the undo inverse the same way it does for paintDistrict.
 *
 * Also home to the shared AREA model: a landfill "area" is one 4-connected
 * component of membership tiles. Its OFFICE tile (the small gatehouse with the
 * parking lot) sits at the road entrance; every other tile is dumping grounds.
 * landfillAreas() is the single deterministic source of that split — the sim
 * (truck depots/dump routes) and the renderer (office kit vs trash piles) both
 * call it so they always agree on where the entrance is.
 */
import type { TilePoint } from '../shared/types';
import { computeZonableMask, type ZonableGridSource } from './zonable';

/**
 * The minimal slice of GridState this module needs — the zonable layers (the
 * placement gate marches from roads) plus the landfill membership layer
 * itself. A real GridState satisfies this structurally; tests hand-build just
 * these layers — same narrow-interface pattern as world/districts.ts.
 */
export interface LandfillGridSource extends ZonableGridSource {
  landfill: Uint8Array;
}

// Orthogonal directions in fixed N, E, S, W order — every scan/BFS here walks
// them in this order so area discovery, office picks, and dump paths are
// deterministic and identical between the sim worker and the renderer.
const DIRS: ReadonlyArray<readonly [number, number]> = [
  [0, -1], // N
  [1, 0], // E
  [0, 1], // S
  [-1, 0], // W
];

const indexOf = (size: number, x: number, z: number): number => z * size + x;

const inBoundsOf = (size: number, x: number, z: number): boolean =>
  x >= 0 && z >= 0 && x < size && z < size;

/** True when (x, z) is empty land (no water/road/building) — necessary but not
 * sufficient to paint: placement also needs road frontage (landfillPlacementMask). */
export function canLandfill(g: LandfillGridSource, x: number, z: number): boolean {
  if (!inBoundsOf(g.size, x, z)) return false;
  const i = indexOf(g.size, x, z);
  return g.water[i] === 0 && g.roadTier[i] === 0 && (g.buildingId[i] ?? 0) === 0;
}

/**
 * The per-tile landfill placement mask (1 = paintable): exactly the zonable
 * "available road grid" the zone brushes use — empty buildable land within
 * perpendicular frontage reach of a street. Build it ONCE per paint batch and
 * index it, like setZones does with computeZonableMask.
 */
export function landfillPlacementMask(g: LandfillGridSource): Uint8Array {
  return computeZonableMask(g);
}

/**
 * Paints (`on` = true) or erases (`on` = false) landfill membership onto every
 * eligible in-bounds tile of `tiles`. Painting skips tiles outside the
 * placement mask (zonable road frontage); erasing applies to any in-bounds
 * tile. Returns exactly the tiles actually changed-or-kept (out-of-bounds /
 * ineligible-for-paint dropped) — same return contract as paintDistrict.
 */
export function paintLandfill(g: LandfillGridSource, tiles: TilePoint[], on: boolean): TilePoint[] {
  const mask = on && tiles.length > 0 ? landfillPlacementMask(g) : null;
  const applied: TilePoint[] = [];
  for (const t of tiles) {
    const { x, z } = t;
    if (!inBoundsOf(g.size, x, z)) continue;
    if (on) {
      if (mask![indexOf(g.size, x, z)] !== 1) continue;
      g.landfill[indexOf(g.size, x, z)] = 1;
    } else {
      g.landfill[indexOf(g.size, x, z)] = 0;
    }
    applied.push({ x, z });
  }
  return applied;
}

/** Whether (x, z) is currently a landfill tile; false if out of bounds. */
export function landfillAt(g: LandfillGridSource, x: number, z: number): boolean {
  if (!inBoundsOf(g.size, x, z)) return false;
  return (g.landfill[indexOf(g.size, x, z)] ?? 0) === 1;
}

/** Every landfill tile, row-major (z-major, x-minor). */
export function landfillTiles(g: LandfillGridSource): TilePoint[] {
  const { size } = g;
  const tiles: TilePoint[] = [];
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      if (g.landfill[indexOf(size, x, z)] === 1) tiles.push({ x, z });
    }
  }
  return tiles;
}

/** Count of landfill tiles — the area's capacity is this × LANDFILL_CAPACITY_PER_TILE. */
export function landfillTileCount(g: LandfillGridSource): number {
  let count = 0;
  const n = g.size * g.size;
  for (let i = 0; i < n; i++) if (g.landfill[i] === 1) count += 1;
  return count;
}

/**
 * One 4-connected landfill area: its OFFICE tile (the gatehouse at the road
 * entrance — rendered as a small building + parking lot, never a trash pile),
 * the street tile trucks stage from, and the in-area route trucks drive to
 * reach the dumping grounds.
 */
export interface LandfillArea {
  /** Every member tile of this component, in BFS discovery order from its smallest-index tile. */
  tiles: TilePoint[];
  /** The entrance/office tile: smallest-index member adjacent to a street (smallest-index member as fallback). */
  office: TilePoint;
  /** The street tile adjacent to the office (first of N/E/S/W), or null when the area has no street contact. */
  roadTile: TilePoint | null;
  /** In-area tile path office → deepest member (max BFS depth, smallest-index tiebreak) — the trucks' dump run. */
  dumpPath: TilePoint[];
}

/**
 * Splits the membership layer into its 4-connected areas and derives each
 * one's office/entrance + dump route. Deterministic for a given membership +
 * street layout: areas come out in row-major order of their smallest tile.
 * `isStreet` abstracts the road lookup so the sim worker (GridState roadTier)
 * and the renderer (its patch cache + client grid) share one algorithm.
 */
export function landfillAreas(
  size: number,
  landfill: Uint8Array,
  isStreet: (x: number, z: number) => boolean,
): LandfillArea[] {
  const seen = new Uint8Array(size * size);
  const areas: LandfillArea[] = [];
  for (let z = 0; z < size; z++) {
    for (let x = 0; x < size; x++) {
      const start = indexOf(size, x, z);
      if (landfill[start] !== 1 || seen[start] === 1) continue;
      seen[start] = 1;
      const queue: number[] = [start];
      const tiles: TilePoint[] = [];
      for (let qi = 0; qi < queue.length; qi++) {
        const i = queue[qi]!;
        const tx = i % size;
        const tz = (i - tx) / size;
        tiles.push({ x: tx, z: tz });
        for (const [dx, dz] of DIRS) {
          const nx = tx + dx;
          const nz = tz + dz;
          if (!inBoundsOf(size, nx, nz)) continue;
          const ni = indexOf(size, nx, nz);
          if (landfill[ni] === 1 && seen[ni] === 0) {
            seen[ni] = 1;
            queue.push(ni);
          }
        }
      }
      areas.push(buildArea(size, tiles, isStreet));
    }
  }
  return areas;
}

/**
 * True when any area containing one of `justPainted` is smaller than
 * `minTiles` — i.e. the paint batch left a fragment too small to operate
 * (no room for the gatehouse office + a truck dump run). Expanding an
 * existing area past the minimum never trips this.
 */
export function hasUndersizedArea(
  size: number,
  landfill: Uint8Array,
  justPainted: TilePoint[],
  minTiles: number,
): boolean {
  if (justPainted.length === 0) return false;
  const painted = new Set(justPainted.map((t) => indexOf(size, t.x, t.z)));
  return landfillAreas(size, landfill, () => false).some(
    (a) => a.tiles.length < minTiles && a.tiles.some((t) => painted.has(indexOf(size, t.x, t.z))),
  );
}

/** A landfill area's cosmetic-truck depot: where its trucks stage and where they tip. */
export interface LandfillDepot {
  /** Area index, for stable per-depot bookkeeping. */
  index: number;
  /** The street tile the area's office fronts — trucks stage from here. */
  sourceTile: TilePoint;
  /** Concurrent trucks this area fields. */
  budget: number;
  /** In-area route from the office to the dump spot. */
  dumpPath: TilePoint[];
}

/**
 * Truck depots for the areas that can actually operate: street-connected and
 * at least `minTiles` in size. Budget is `base + floor(tiles / perTiles)`,
 * capped at `max`. Pure, so the truck wiring is testable without a worker.
 */
export function landfillTruckDepots(
  areas: readonly LandfillArea[],
  minTiles: number,
  base: number,
  perTiles: number,
  max: number,
): LandfillDepot[] {
  const depots: LandfillDepot[] = [];
  for (let index = 0; index < areas.length; index++) {
    const area = areas[index]!;
    if (!area.roadTile || area.tiles.length < minTiles) continue;
    depots.push({
      index,
      sourceTile: area.roadTile,
      budget: Math.min(max, base + Math.floor(area.tiles.length / perTiles)),
      dumpPath: area.dumpPath,
    });
  }
  return depots;
}

/** Office pick + street contact + dump route for one component's tiles. */
function buildArea(
  size: number,
  tiles: TilePoint[],
  isStreet: (x: number, z: number) => boolean,
): LandfillArea {
  // Office: smallest-index member with a street neighbour; smallest-index member otherwise.
  let office: TilePoint | null = null;
  let officeIndex = Infinity;
  let fallback: TilePoint = tiles[0]!;
  let fallbackIndex = indexOf(size, fallback.x, fallback.z);
  for (const t of tiles) {
    const i = indexOf(size, t.x, t.z);
    if (i < fallbackIndex) {
      fallback = t;
      fallbackIndex = i;
    }
    if (i >= officeIndex) continue;
    for (const [dx, dz] of DIRS) {
      if (isStreet(t.x + dx, t.z + dz)) {
        office = t;
        officeIndex = i;
        break;
      }
    }
  }
  const officeTile = office ?? fallback;

  let roadTile: TilePoint | null = null;
  for (const [dx, dz] of DIRS) {
    const nx = officeTile.x + dx;
    const nz = officeTile.z + dz;
    if (isStreet(nx, nz)) {
      roadTile = { x: nx, z: nz };
      break;
    }
  }

  return { tiles, office: officeTile, roadTile, dumpPath: dumpPathFrom(size, tiles, officeTile) };
}

/** BFS inside the component from the office; the path to its deepest tile (smallest-index tiebreak). */
function dumpPathFrom(size: number, tiles: TilePoint[], office: TilePoint): TilePoint[] {
  const member = new Set<number>();
  for (const t of tiles) member.add(indexOf(size, t.x, t.z));

  const startIndex = indexOf(size, office.x, office.z);
  const parent = new Map<number, number>();
  const depth = new Map<number, number>();
  parent.set(startIndex, -1);
  depth.set(startIndex, 0);
  const queue: number[] = [startIndex];
  let deepest = startIndex;
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi]!;
    const d = depth.get(i)!;
    const deepestDepth = depth.get(deepest)!;
    if (d > deepestDepth || (d === deepestDepth && i < deepest)) deepest = i;
    const tx = i % size;
    const tz = (i - tx) / size;
    for (const [dx, dz] of DIRS) {
      const nx = tx + dx;
      const nz = tz + dz;
      if (!inBoundsOf(size, nx, nz)) continue;
      const ni = indexOf(size, nx, nz);
      if (!member.has(ni) || parent.has(ni)) continue;
      parent.set(ni, i);
      depth.set(ni, d + 1);
      queue.push(ni);
    }
  }

  const path: TilePoint[] = [];
  for (let i = deepest; i !== -1; i = parent.get(i)!) {
    const x = i % size;
    path.unshift({ x, z: (i - x) / size });
  }
  return path;
}
