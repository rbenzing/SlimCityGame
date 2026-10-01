/**
 * The tile edges the roads' sound walls stand on, as the noise field crosses
 * them. Derived from the grid's road layers and the profile table whenever
 * either changes, and never saved.
 */
import { MAP_SIZE } from '../shared/constants';
import { corridorHalfProfile, worldOrderedProfile } from '../shared/roadprofile';
import { noiseTransmission, OPEN_EDGE, type NoiseWalls } from '../shared/soundwall';
import { soundWallsAt, WALL_EDGE, type SoundWallReader } from '../shared/soundwallsites';
import { corridorHalfOf, RoadTier, type GridState, type RoadProfile } from '../shared/types';

/** The section a ground-layer road tile carries, as every reader of its walls asks for it. */
export function ownSection(
  g: GridState,
  idx: number,
  profileOf: (id: number) => RoadProfile | null,
): RoadProfile | null {
  const tier = g.roadTier[idx] ?? RoadTier.None;
  if (tier === RoadTier.None) return null;
  const whole = profileOf(g.roadProfile[idx] || tier);
  if (!whole) return null;
  const stored = g.roadFlow[idx] ?? 0;
  return corridorHalfProfile(worldOrderedProfile(whole, stored), corridorHalfOf(stored));
}

/**
 * Every walled edge's transmission, or null where no road carries a wall at
 * all, which is most cities and costs the noise pass nothing. An edge two
 * walls stand on passes what the taller lets through.
 */
export function noiseWallsOf(
  g: GridState,
  profileOf: (id: number) => RoadProfile | null,
): NoiseWalls | null {
  const walled = new Map<number, boolean>();
  const carriesWall = (id: number): boolean => {
    let known = walled.get(id);
    if (known === undefined) {
      known = profileOf(id)?.pieces.some((p) => p.kind === 'soundWall') ?? false;
      walled.set(id, known);
    }
    return known;
  };
  const reader: SoundWallReader = {
    sectionAt: (x, z) => ownSection(g, z * MAP_SIZE + x, profileOf),
    flowAt: (x, z) => g.roadFlow[z * MAP_SIZE + x] ?? 0,
    maskAt: (x, z) => g.roadMask[z * MAP_SIZE + x] ?? 0,
  };

  let walls: NoiseWalls | null = null;
  const cut = (edges: Uint16Array, at: number, t: number): void => {
    edges[at] = Math.min(edges[at]!, t);
  };
  for (let idx = 0; idx < g.roadTier.length; idx++) {
    const tier = g.roadTier[idx] ?? RoadTier.None;
    if (tier === RoadTier.None || !carriesWall(g.roadProfile[idx] || tier)) continue;
    const x = idx % MAP_SIZE;
    const z = Math.floor(idx / MAP_SIZE);
    for (const site of soundWallsAt(x, z, reader)) {
      walls ??= {
        east: new Uint16Array(g.roadTier.length).fill(OPEN_EDGE),
        south: new Uint16Array(g.roadTier.length).fill(OPEN_EDGE),
      };
      const t = noiseTransmission(site.heightM);
      // The map's own edge already passes nothing, so a wall on it adds nothing.
      if (site.edge === WALL_EDGE.east && x < MAP_SIZE - 1) cut(walls.east, idx, t);
      if (site.edge === WALL_EDGE.west && x > 0) cut(walls.east, idx - 1, t);
      if (site.edge === WALL_EDGE.south && z < MAP_SIZE - 1) cut(walls.south, idx, t);
      if (site.edge === WALL_EDGE.north && z > 0) cut(walls.south, idx - MAP_SIZE, t);
    }
  }
  return walls;
}
