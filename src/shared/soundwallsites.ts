/**
 * Where a road's sound walls stand on the grid: which edge of a tile, and how
 * far across it. Which edge is one answer for the noise field and the renderer
 * alike, read off the road's own section, so neither needs the approach walk
 * to agree with the other; how far across is the renderer's alone, and follows
 * the drawn section where the reader has one.
 */
import { carriagewayHalfWidthOf, carriagewayShiftOf } from './roadprofile';
import { flowDirection, RoadFlow, type RoadProfile } from './types';

const NORTH = 1;
const EAST = 2;
const SOUTH = 4;
const WEST = 8;

/** The tile edges a wall can stand on, by the mask bit an arm through them sets. */
export type WallEdge = typeof NORTH | typeof EAST | typeof SOUTH | typeof WEST;
export const WALL_EDGE = { north: NORTH, east: EAST, south: SOUTH, west: WEST } as const;

export interface SoundWallReader {
  /**
   * The tile's own cross-section on the ground layer, in world order and
   * halved where the tile is half of a corridor; null where no road is.
   */
  sectionAt(x: number, z: number): RoadProfile | null;
  /** The tile's stored flow byte. */
  flowAt(x: number, z: number): number;
  /** Which neighbours the tile's road joins, one bit per edge. */
  maskAt(x: number, z: number): number;
  /**
   * The cross-section as drawn on this tile, with the auxiliary lane a slip
   * road makes the motorway grow; the wall's face stands at ITS edge, so the
   * lane runs inside the wall rather than under it. A reader that runs no
   * approach walk (the noise field, which cares only which edge) leaves it
   * out and the own section stands in.
   */
  drawnAt?(x: number, z: number): RoadProfile | null;
}

export interface SoundWallSite {
  edge: WallEdge;
  heightM: number;
  /**
   * The world offset from the tile's centre, across the road (east or south
   * positive), of the wall base's road-side face: the carriageway's edge.
   */
  faceOffsetM: number;
  /** Which way the wall faces away from the road: −1 toward the low offsets, 1 the high. */
  outward: -1 | 1;
  /** Whether the road runs along x, so the wall does too. */
  alongX: boolean;
}

/** Whether a road runs along x: by its stored flow, or by its arms where the flow says nothing. */
function runsAlongX(flow: number, mask: number): boolean {
  const direction = flowDirection(flow);
  if (direction === RoadFlow.East || direction === RoadFlow.West) return true;
  if (direction === RoadFlow.North || direction === RoadFlow.South) return false;
  return (mask & (EAST | WEST)) !== 0 && (mask & (NORTH | SOUTH)) === 0;
}

/**
 * The walls standing on tile (x, z). A wall at the low end of the section is
 * on the north edge of a road running along x and the west edge of one
 * running along z; the high end, south or east. It stands only on an edge no
 * arm leaves by, so it opens across a slip road's mouth and round the inside
 * of a corner, which is where real walls break.
 */
export function soundWallsAt(x: number, z: number, reader: SoundWallReader): SoundWallSite[] {
  const section = reader.sectionAt(x, z);
  if (!section) return [];
  const first = section.pieces[0];
  const last = section.pieces[section.pieces.length - 1];
  if (first?.kind !== 'soundWall' && last?.kind !== 'soundWall') return [];

  const mask = reader.maskAt(x, z);
  const alongX = runsAlongX(reader.flowAt(x, z), mask);
  const drawn = reader.drawnAt?.(x, z) ?? section;
  const shift = carriagewayShiftOf(drawn);
  const reach = carriagewayHalfWidthOf(drawn);
  const sites: SoundWallSite[] = [];
  const add = (edge: WallEdge, heightM: number, outward: -1 | 1): void => {
    if ((mask & edge) !== 0) return;
    sites.push({ edge, heightM, faceOffsetM: shift + outward * reach, outward, alongX });
  };
  if (first?.kind === 'soundWall') add(alongX ? NORTH : WEST, first.height ?? 0, -1);
  if (last?.kind === 'soundWall' && section.pieces.length > 1) {
    add(alongX ? SOUTH : EAST, last.height ?? 0, 1);
  }
  return sites;
}
