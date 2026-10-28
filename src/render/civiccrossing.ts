/**
 * The civic crossing: where a civic building's way in meets the street. A
 * kit declares its spans along one local edge (shared/civicaccess.ts); this
 * turns them onto the lot edge that faces the street, in the same frame a
 * car park's curb cut is laid in, and says which road tiles they cross.
 *
 * Lot coordinates are the lot plan's: `u` along the edge, `v` into the lot,
 * so the verge and the footway lie at negative `v`, out to the carriageway.
 * Pure: no three.js, no scene.
 */
import { TILE_METERS } from '../shared/constants';
import { footprintForRotation } from '../shared/footprint';
import type { BuildingCatalogEntry, BuildingInstance } from '../shared/types';
import type { LotRect } from '../shared/lotlayout';
import {
  civicAccessFor,
  civicCrossingWidth,
  type CivicAccess,
  type CivicSpanKind,
} from '../shared/civicaccess';
import {
  edgeFrameFor,
  edgeFrameOfParcel,
  findStreetFacingEdge,
  frameToWorld,
  type EdgeFrame,
  type RoadFacingEdge,
  type Side,
  type StreetLookup,
} from './frontage';
import { depotFrame, railSideOf, waterSideOf, yardFrame } from './utilitykits';

/** The terrain a kit turns to face: the water beside a shore kit, the track beside a station or a rail yard. */
export interface KitSensors {
  waterAt: (tileX: number, tileZ: number) => boolean;
  railAt: (tileX: number, tileZ: number) => boolean;
}

/** Sensors that find neither water nor track: every kit takes its placed rotation. */
export const NO_SENSORS: KitSensors = { waterAt: () => false, railAt: () => false };

type Turn = 0 | 1 | 2 | 3;

/** One crossing, in metres along the lot edge. */
export interface CivicCrossing {
  kind: CivicSpanKind;
  u0: number;
  u1: number;
}

/** A civic building's crossings over the edge that faces its street, and the frame they lie in. */
export interface CivicSite {
  edge: RoadFacingEdge;
  frame: EdgeFrame;
  /** A parcel on a curve: its front line is the back of its free road's footway, so it has no verge. */
  framed: boolean;
  crossings: CivicCrossing[];
}

const SIDES_CLOCKWISE: readonly Side[] = ['N', 'E', 'S', 'W'];

/** The map side a kit's access edge lies on when the kit stands turned `turn` quarter turns. */
export function civicEdgeSide(access: CivicAccess, turn: Turn): Side {
  const front = (2 - turn + 4) % 4;
  return SIDES_CLOCKWISE[access.edge === 'back' ? (front + 2) % 4 : front]!;
}

/** The turn a kit stands at, and the width of its own frame in tiles. */
function kitFrameOf(
  entry: BuildingCatalogEntry,
  access: CivicAccess,
  building: Pick<BuildingInstance, 'x' | 'z' | 'rotation'>,
  sensors: KitSensors,
): { turn: Turn; widthTiles: number } {
  const { x, z, rotation } = building;
  const lot = footprintForRotation(entry, rotation);
  switch (access.turn ?? 'placed') {
    case 'water':
      return { turn: waterSideOf(x, z, lot, sensors.waterAt), widthTiles: entry.footprint.w };
    case 'station': {
      const facing = railSideOf(x, z, lot, sensors.railAt) ?? (((rotation + 2) % 4) as Turn);
      const frame = depotFrame(entry, rotation, facing);
      return { turn: frame.turn, widthTiles: frame.footprint.w };
    }
    case 'yard': {
      const facing = railSideOf(x, z, lot, sensors.railAt) ?? (((rotation + 2) % 4) as Turn);
      const frame = yardFrame(entry, rotation, facing);
      return { turn: frame.turn, widthTiles: frame.footprint.w };
    }
    default:
      return { turn: rotation, widthTiles: entry.footprint.w };
  }
}

/**
 * A kit's spans as crossings on a lot edge `lengthM` long: `kitWidthM` is the
 * width of the kit's own edge, `flip` says the lot edge runs the other way
 * to the kit's `u`. A drive and a walk are cut to their width about the
 * span's middle, an apron to the span's own; none leaves the edge.
 */
export function crossingsOf(
  access: CivicAccess,
  kitWidthM: number,
  lengthM: number,
  flip: boolean,
): CivicCrossing[] {
  const base = access.centred ? kitWidthM / 2 : 0;
  return access.spans.map((span) => {
    const a = base + span.u0;
    const b = base + span.u1;
    const middle = flip ? kitWidthM - (a + b) / 2 : (a + b) / 2;
    const width = civicCrossingWidth(span);
    const u0 = Math.min(Math.max(0, middle - width / 2), Math.max(0, lengthM - width));
    return { kind: span.kind, u0, u1: Math.min(lengthM, u0 + width) };
  });
}

/**
 * The crossings a civic building lays over the street it fronts, or null when
 * it has no access, no street along the edge its spans lie on, or (on a curve)
 * only a back edge to declare spans on. A framed building crosses its
 * parcel's front, which its kit faces.
 */
export function civicSiteFor(
  entry: BuildingCatalogEntry,
  building: Pick<BuildingInstance, 'x' | 'z' | 'rotation' | 'frame'>,
  street: StreetLookup,
  sensors: KitSensors = NO_SENSORS,
): CivicSite | null {
  const access = civicAccessFor(entry);
  if (!access || access.spans.length === 0) return null;
  if (building.frame) {
    if (access.edge === 'back') return null;
    const frame = edgeFrameOfParcel(building.frame);
    const lengthM = entry.footprint.w * TILE_METERS;
    const road = frameToWorld(frame, lengthM / 2, 0.5);
    const edge: RoadFacingEdge = {
      side: 'N',
      edgeTiles: entry.footprint.w,
      roadTileX: Math.floor(road.x / TILE_METERS),
      roadTileZ: Math.floor(road.z / TILE_METERS),
    };
    return { edge, frame, framed: true, crossings: crossingsOf(access, lengthM, lengthM, true) };
  }
  const lot = footprintForRotation(entry, building.rotation);
  const edge = findStreetFacingEdge(building.x, building.z, lot.w, lot.d, street);
  if (!edge) return null;
  const { turn, widthTiles } = kitFrameOf(entry, access, building, sensors);
  if (civicEdgeSide(access, turn) !== edge.side) return null;
  return {
    edge,
    frame: edgeFrameFor(edge.side, building.x, building.z, lot.w, lot.d),
    framed: false,
    crossings: crossingsOf(
      access,
      widthTiles * TILE_METERS,
      edge.edgeTiles * TILE_METERS,
      turn === 1 || turn === 2,
    ),
  };
}

/** Which part of the crossing a rectangle is: the grass verge, or the footway the kerb is dropped across. */
export type CivicLayer = 'verge' | 'footway';

export interface CivicCrossingRect {
  rect: LotRect;
  kind: CivicSpanKind;
  layer: CivicLayer;
}

/** Each crossing as its verge strip and its footway strip, from the footprint's edge out to the carriageway. */
export function civicCrossingRects(
  crossings: readonly CivicCrossing[],
  vergeM: number,
  sidewalkM: number,
): CivicCrossingRect[] {
  const rects: CivicCrossingRect[] = [];
  for (const c of crossings) {
    if (vergeM > 0) {
      rects.push({
        rect: { u0: c.u0, u1: c.u1, v0: -vergeM, v1: 0 },
        kind: c.kind,
        layer: 'verge',
      });
    }
    if (sidewalkM > 0) {
      rects.push({
        rect: { u0: c.u0, u1: c.u1, v0: -vergeM - sidewalkM, v1: -vergeM },
        kind: c.kind,
        layer: 'footway',
      });
    }
  }
  return rects;
}

/** A crossing's end sits a hair inside its edge, so a cut ending on a tile boundary names its own tile. */
const CUT_EDGE_INSET_M = 0.01;

/**
 * The road tiles a civic building's drives and aprons cross, so kerb furniture
 * keeps off them: the tile across each end and the middle of every vehicle
 * crossing. A walk is too narrow to clash with a lamp.
 */
export function civicCutTiles(site: CivicSite, street: StreetLookup): { x: number; z: number }[] {
  const tiles = new Map<number, { x: number; z: number }>();
  for (const c of site.crossings) {
    if (c.kind === 'walk') continue;
    for (const u of [c.u0 + CUT_EDGE_INSET_M, (c.u0 + c.u1) / 2, c.u1 - CUT_EDGE_INSET_M]) {
      const out = frameToWorld(site.frame, u, 0.5);
      const tile = { x: Math.floor(out.x / TILE_METERS), z: Math.floor(out.z / TILE_METERS) };
      // A framed lot's cut opens onto its free road, whose tiles the street lookup need not name.
      const at =
        site.framed || street(tile.x, tile.z)
          ? tile
          : { x: site.edge.roadTileX, z: site.edge.roadTileZ };
      tiles.set(at.x * 100_000 + at.z, at);
    }
  }
  return [...tiles.values()];
}
