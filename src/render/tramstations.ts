/**
 * The raised tram stations: a line's stop on a guideway tile at full height
 * is a pair of side platforms at the trams' floor outside the beams, each
 * under a canopy, with a stair and a lift tower down to the footway at the
 * platforms' low-coordinate end. Seven instanced parts, all unit boxes:
 *   PLATFORMS — the two slabs along the run, and each one's landing out to
 *               its lift tower over the kerb lane.
 *   CANOPIES  — the roof slab over each platform.
 *   POSTS     — the canopy's posts down the platform's outer edge.
 *   STAIRS    — one sloped box each side, the stringer closed.
 *   TOWERS    — the lift tower each side, footway to canopy.
 *   PANES     — the lit glazing on each tower's road face.
 *   SIGNS     — the line's board hung from each canopy's edge.
 *
 * Placement is a pure function of the lines, the road tiles and the guideway
 * (`computeTramStations`); nothing is saved, and the renderer only turns it
 * into instances. Heights come from the guideway's beams, the ground from the
 * road surface.
 */
import * as THREE from 'three';
import { TILE_METERS, tileToWorld, worldToTile } from '../shared/constants';
import { carriagewayHalfWidthOf, presetProfileForTier } from '../shared/roadprofile';
import { RoadTier } from '../shared/types';
import type { TransitLine } from '../shared/types';
import { LIT_DAY_FLOOR } from './buildingkit';
import { SHELTER_GLASS_COLOR, SHELTER_ROOF_COLOR } from './busshelter';
import {
  beamTopAtTile,
  GUIDEWAY_COLUMN_COLOR,
  TRAM_FLOOR_ABOVE_BEAM_M,
  type Guideway,
  type GuidewayPoint,
  type GuidewayTile,
} from './guideway';
import { buildTileSet, hasCrossingRoad, joins, tileKey } from './roadfurniture';
import type { FurnitureRoadTile, RoadTileIndex } from './roadfurniture';
import { seamShift } from './roadsmesh';
import { STOP_SIGN_SIZE } from './transit';

/** Each platform's inner edge stands this far from the guideway's centre, clear of a car straddling its beam. */
export const STATION_PLATFORM_CLEARANCE_M = 3.2;
export const STATION_PLATFORM_WIDTH_M = 3;
export const STATION_PLATFORM_DEPTH_M = 0.25;
/** A platform's length along the run, before the straight run through the neighbours shortens it. */
export const STATION_PLATFORM_LENGTH_M = 26;
/** The canopy slab: its depth, its clear height over the platform, and how far it overhangs each edge. */
export const STATION_CANOPY_DEPTH_M = 0.15;
export const STATION_CANOPY_CLEAR_M = 2.7;
export const STATION_CANOPY_OVERHANG_M = 0.3;
/** The canopy's posts, square in plan, down the platform's outer edge. */
export const STATION_POST_M = 0.15;
export const STATION_POST_SPACING_M = 6.5;
/** The stair: its width, its pitch, and the depth of the sloped box that closes its stringer. */
export const STATION_STAIR_WIDTH_M = 1.5;
export const STATION_STAIR_ANGLE = (32 * Math.PI) / 180;
export const STATION_STAIR_DEPTH_M = 0.3;
/** The lift tower, square in plan. */
export const STATION_TOWER_M = 2.4;
/** The tower's glazed pane: its width, its thickness, its sill over the footway and its head under the canopy. */
export const STATION_PANE_WIDTH_M = 1.6;
export const STATION_PANE_DEPTH_M = 0.04;
export const STATION_PANE_SILL_M = 1.0;
export const STATION_PANE_HEAD_M = 0.4;

/** An axis-aligned box: its centre and its size along the world axes. */
export interface StationBox {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

export interface StationPlatform extends StationBox {
  alongX: boolean;
  /** The side of the guideway's centre line it stands on: +z for a run along x, +x for one along z. */
  side: 1 | -1;
  /** Its walking surface. */
  top: number;
  /** Its ends along the run, world metres. */
  lo: number;
  hi: number;
}

/** A sloped box pitched about the across axis so its high end is at `head`. */
export interface StationStair extends StationBox {
  alongX: boolean;
  pitch: number;
  head: GuidewayPoint;
  foot: GuidewayPoint;
}

export interface StationSign extends StationBox {
  color: number;
}

export interface TramStation {
  /** The stop tile. */
  x: number;
  z: number;
  alongX: boolean;
  platforms: StationPlatform[];
  /** Each platform's end run out to its tower, drawn with the platforms. */
  landings: StationBox[];
  canopies: StationBox[];
  posts: StationBox[];
  stairs: StationStair[];
  towers: StationBox[];
  panes: StationBox[];
  signs: StationSign[];
  /** The tiles it occupies, keyed by `tileKey`: the stop tile and the landing tile. */
  tiles: number[];
}

export interface TramStations {
  stations: TramStation[];
  /** The stop tiles, keyed by `tileKey`. */
  stopTiles: ReadonlySet<number>;
  /** Every tile a station occupies, keyed by `tileKey`, for what keeps off them. */
  tiles: ReadonlySet<number>;
}

const EMPTY: TramStations = { stations: [], stopTiles: new Set(), tiles: new Set() };

/**
 * A guideway tile a platform may run over: a reserved tile whose beams run
 * straight along `alongX` at full height, on the centre line `line`, with
 * no road crossing it.
 */
function straightFullHeight(
  tile: GuidewayTile | undefined,
  road: FurnitureRoadTile | undefined,
  tileSet: RoadTileIndex,
  alongX: boolean,
  line: number,
): tile is GuidewayTile {
  if (!tile || !road || !tile.reserved || !tile.fullHeight) return false;
  if (tile.alongX !== alongX || tile.line === null || Math.abs(tile.line - line) > 1e-6) {
    return false;
  }
  return !road.ring && !hasCrossingRoad(tileSet, tile.x, tile.z);
}

/** The world coordinate across the run of the road's kerb line on `side` of the tile's centre. */
function kerbLine(road: FurnitureRoadTile, alongX: boolean, side: 1 | -1): number {
  const profile = road.profile ?? presetProfileForTier(road.tier ?? RoadTier.TwoLane);
  const { shiftX, shiftZ } = seamShift(profile, road.flow ?? 0);
  const centre = alongX ? tileToWorld(road.z) + shiftZ : tileToWorld(road.x) + shiftX;
  return centre + side * carriagewayHalfWidthOf(profile);
}

/**
 * Every raised station over `roadTiles` for the tram lines' stops on the
 * guideway. Pure: the same lines, tiles and guideway give the same stations.
 */
export function computeTramStations(
  lines: readonly TransitLine[],
  roadTiles: readonly FurnitureRoadTile[],
  surfaceAt: (wx: number, wz: number) => number,
  guideway: Guideway | null,
): TramStations {
  if (!guideway || guideway.tiles.size === 0) return EMPTY;
  const tileSet = buildTileSet(roadTiles);
  const stations: TramStation[] = [];
  const stopTiles = new Set<number>();
  const tiles = new Set<number>();

  for (const line of lines) {
    if (line.mode !== 'tram') continue;
    for (const stop of line.stops) {
      const key = tileKey(stop.x, stop.z);
      if (stopTiles.has(key)) continue;
      const tile = guideway.tiles.get(key);
      const road = tileSet.get(key);
      if (!tile || !road || tile.alongX === null || tile.line === null) continue;
      if (!straightFullHeight(tile, road, tileSet, tile.alongX, tile.line)) continue;
      const beamTop = beamTopAtTile(guideway, stop.x, stop.z);
      if (beamTop === null) continue;
      const station = buildStation(
        road,
        tile.alongX,
        tile.line,
        beamTop + TRAM_FLOOR_ABOVE_BEAM_M,
        line.color,
        tileSet,
        guideway,
        surfaceAt,
      );
      stations.push(station);
      stopTiles.add(key);
      for (const t of station.tiles) tiles.add(t);
    }
  }
  return { stations, stopTiles, tiles };
}

/** One station on `road`, its platforms' tops at `top`. */
function buildStation(
  road: FurnitureRoadTile,
  alongX: boolean,
  line: number,
  top: number,
  color: number,
  tileSet: RoadTileIndex,
  guideway: Guideway,
  surfaceAt: (wx: number, wz: number) => number,
): TramStation {
  const along0 = alongX ? tileToWorld(road.x) : tileToWorld(road.z);
  const tileLo = along0 - TILE_METERS / 2;
  const tileHi = along0 + TILE_METERS / 2;
  // The platform reaches into a neighbour only where the straight run goes on
  // through it at full height; otherwise it stops at this tile's edge.
  const runsOn = (step: 1 | -1): boolean => {
    const nx = road.x + (alongX ? step : 0);
    const nz = road.z + (alongX ? 0 : step);
    const key = tileKey(nx, nz);
    return (
      joins(tileSet, road.x, road.z, nx, nz) &&
      straightFullHeight(guideway.tiles.get(key), tileSet.get(key), tileSet, alongX, line)
    );
  };
  const half = STATION_PLATFORM_LENGTH_M / 2;
  const lo = runsOn(-1) ? along0 - half : Math.max(tileLo, along0 - half);
  const hi = runsOn(1) ? along0 + half : Math.min(tileHi, along0 + half);
  const length = hi - lo;
  const mid = (lo + hi) / 2;
  const canopyBottom = top + STATION_CANOPY_CLEAR_M;
  const canopyTop = canopyBottom + STATION_CANOPY_DEPTH_M;

  const point = (along: number, across: number, y: number): GuidewayPoint =>
    alongX ? { x: along, y, z: across } : { x: across, y, z: along };
  const box = (
    along: number,
    across: number,
    y: number,
    sizeAlong: number,
    sizeY: number,
    sizeAcross: number,
  ): StationBox => ({
    ...point(along, across, y),
    sx: alongX ? sizeAlong : sizeAcross,
    sy: sizeY,
    sz: alongX ? sizeAcross : sizeAlong,
  });

  const station: TramStation = {
    x: road.x,
    z: road.z,
    alongX,
    platforms: [],
    landings: [],
    canopies: [],
    posts: [],
    stairs: [],
    towers: [],
    panes: [],
    signs: [],
    tiles: [tileKey(road.x, road.z)],
  };

  for (const side of [-1, 1] as const) {
    const inner = line + side * STATION_PLATFORM_CLEARANCE_M;
    const outer = inner + side * STATION_PLATFORM_WIDTH_M;
    const centre = (inner + outer) / 2;
    station.platforms.push({
      ...box(
        mid,
        centre,
        top - STATION_PLATFORM_DEPTH_M / 2,
        length,
        STATION_PLATFORM_DEPTH_M,
        STATION_PLATFORM_WIDTH_M,
      ),
      alongX,
      side,
      top,
      lo,
      hi,
    });
    station.canopies.push(
      box(
        mid,
        centre,
        canopyBottom + STATION_CANOPY_DEPTH_M / 2,
        length + 2 * STATION_CANOPY_OVERHANG_M,
        STATION_CANOPY_DEPTH_M,
        STATION_PLATFORM_WIDTH_M + 2 * STATION_CANOPY_OVERHANG_M,
      ),
    );
    const postAcross = outer - side * (STATION_POST_M / 2);
    const postCount = Math.floor(length / STATION_POST_SPACING_M + 1e-9) + 1;
    for (let k = 0; k < postCount; k++) {
      const along = Math.min(
        lo + STATION_POST_M / 2 + k * STATION_POST_SPACING_M,
        hi - STATION_POST_M / 2,
      );
      station.posts.push(
        box(
          along,
          postAcross,
          top + STATION_CANOPY_CLEAR_M / 2,
          STATION_POST_M,
          STATION_CANOPY_CLEAR_M,
          STATION_POST_M,
        ),
      );
    }

    // The tower's road face stands at the kerb line, or at the platform's
    // outer edge where the road is too narrow for the platform to clear it.
    const kerb = kerbLine(road, alongX, side);
    const towerFace = side > 0 ? Math.max(kerb, outer) : Math.min(kerb, outer);
    const towerCentre = towerFace + side * (STATION_TOWER_M / 2);
    const towerAlong = lo + STATION_TOWER_M / 2;
    const towerAt = point(towerAlong, towerCentre, 0);
    const footway = surfaceAt(towerAt.x, towerAt.z);
    station.towers.push(
      box(
        towerAlong,
        towerCentre,
        (footway + canopyTop) / 2,
        STATION_TOWER_M,
        canopyTop - footway,
        STATION_TOWER_M,
      ),
    );
    const landingWidth = Math.abs(towerFace - outer);
    if (landingWidth > 1e-3) {
      station.landings.push(
        box(
          towerAlong,
          (towerFace + outer) / 2,
          top - STATION_PLATFORM_DEPTH_M / 2,
          STATION_TOWER_M,
          STATION_PLATFORM_DEPTH_M,
          landingWidth,
        ),
      );
    }
    const paneBottom = footway + STATION_PANE_SILL_M;
    const paneTop = canopyBottom - STATION_PANE_HEAD_M;
    station.panes.push(
      box(
        towerAlong,
        towerFace - side * (STATION_PANE_DEPTH_M / 2),
        (paneBottom + paneTop) / 2,
        STATION_PANE_WIDTH_M,
        paneTop - paneBottom,
        STATION_PANE_DEPTH_M,
      ),
    );

    // The stair heads at the platform's low end beside the tower and runs
    // down along the road to the footway; its run follows the ground it
    // lands on.
    const head = point(lo, towerCentre, top);
    const tan = Math.tan(STATION_STAIR_ANGLE);
    let footAlong = lo - (top - surfaceAt(head.x, head.z)) / tan;
    const footAt = point(footAlong, towerCentre, 0);
    const footY = surfaceAt(footAt.x, footAt.z);
    const height = top - footY;
    const run = height / tan;
    footAlong = lo - run;
    const foot = point(footAlong, towerCentre, footY);
    const slope = Math.hypot(run, height);
    station.stairs.push({
      ...box(
        (lo + footAlong) / 2,
        towerCentre,
        (top + footY) / 2 - STATION_STAIR_DEPTH_M / 2,
        slope,
        STATION_STAIR_DEPTH_M,
        STATION_STAIR_WIDTH_M,
      ),
      alongX,
      pitch: Math.atan2(height, run),
      head,
      foot,
    });
    const landingTile = worldToTile(footAlong);
    const landingKey = alongX ? tileKey(landingTile, road.z) : tileKey(road.x, landingTile);
    if (!station.tiles.includes(landingKey)) station.tiles.push(landingKey);

    const [signW, signH, signD] = STOP_SIGN_SIZE;
    station.signs.push({
      ...box(
        mid,
        outer + side * (STATION_CANOPY_OVERHANG_M - signD / 2),
        canopyBottom - signH / 2,
        signW,
        signH,
        signD,
      ),
      color,
    });
  }
  return station;
}

const _matrix = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler(0, 0, 0, 'XYZ');
const _position = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();

/** The stations as instanced boxes, one draw per part. */
export class TramStationRenderer {
  private readonly scene: THREE.Scene;
  private readonly surfaceAt: (wx: number, wz: number) => number;
  private readonly box = new THREE.BoxGeometry(1, 1, 1);
  private readonly concrete = new THREE.MeshLambertMaterial({ color: GUIDEWAY_COLUMN_COLOR });
  private readonly roof = new THREE.MeshLambertMaterial({ color: SHELTER_ROOF_COLOR });
  /** The panes glow as a kit's lit parts do: a floor by day, full at night. */
  private readonly glass = new THREE.MeshLambertMaterial({
    color: SHELTER_GLASS_COLOR,
    emissive: 0xffffff,
    emissiveIntensity: LIT_DAY_FLOOR,
  });
  /** White, tinted per instance in the line's colour. */
  private readonly sign = new THREE.MeshLambertMaterial({ color: 0xffffff });
  private meshes: THREE.InstancedMesh[] = [];
  private current: TramStations = EMPTY;

  /** True on a stop tile a station stands on, as last rebuilt; stable across rebuilds. */
  readonly isStation = (x: number, z: number): boolean => this.current.stopTiles.has(tileKey(x, z));

  /** `surfaceAt` is the road surface the stairs and towers land on. */
  constructor(scene: THREE.Scene, surfaceAt: (wx: number, wz: number) => number) {
    this.scene = scene;
    this.surfaceAt = surfaceAt;
  }

  /** Replaces every station from the current lines, road tiles and guideway. */
  rebuild(
    lines: readonly TransitLine[],
    roadTiles: readonly FurnitureRoadTile[],
    guideway: Guideway | null,
  ): void {
    this.clearMeshes();
    this.current = computeTramStations(lines, roadTiles, this.surfaceAt, guideway);
    const all = this.current.stations;
    const flat = <T>(pick: (s: TramStation) => T[]): T[] => all.flatMap(pick);

    const platforms = [...flat((s) => s.platforms), ...flat((s) => s.landings)];
    this.addBoxes(this.concrete, platforms);
    this.addBoxes(
      this.roof,
      flat((s) => s.canopies),
    );
    this.addBoxes(
      this.roof,
      flat((s) => s.posts),
    );
    const stairs = flat((s) => s.stairs);
    if (stairs.length > 0) {
      const mesh = this.addMesh(this.concrete, stairs.length);
      stairs.forEach((stair, i) => {
        if (stair.alongX) _euler.set(0, 0, stair.pitch);
        else _euler.set(-stair.pitch, 0, 0);
        _quat.setFromEuler(_euler);
        _position.set(stair.x, stair.y, stair.z);
        _scale.set(stair.sx, stair.sy, stair.sz);
        _matrix.compose(_position, _quat, _scale);
        mesh.setMatrixAt(i, _matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.addBoxes(
      this.concrete,
      flat((s) => s.towers),
    );
    this.addBoxes(
      this.glass,
      flat((s) => s.panes),
    );
    const signs = flat((s) => s.signs);
    const signMesh = this.addBoxes(this.sign, signs);
    if (signMesh) {
      signs.forEach((sign, i) => {
        _color.setHex(sign.color);
        signMesh.setColorAt(i, _color);
      });
      if (signMesh.instanceColor) signMesh.instanceColor.needsUpdate = true;
    }
  }

  /** 0 (day) .. 1 (night): how brightly the panes glow. */
  setNightFactor(nightFactor: number): void {
    const night = Math.min(1, Math.max(0, nightFactor));
    this.glass.emissiveIntensity = LIT_DAY_FLOOR + (1 - LIT_DAY_FLOOR) * night;
  }

  /** Every tile a station occupies, keyed as the lamps key tiles. */
  tiles(): ReadonlySet<number> {
    return this.current.tiles;
  }

  stationCount(): number {
    return this.current.stations.length;
  }

  /** The stations as last computed, for a test. */
  stations(): readonly TramStation[] {
    return this.current.stations;
  }

  /** The instanced meshes in part order: platforms, canopies, posts, stairs, towers, panes, signs; a part with nothing to draw has none. */
  meshList(): readonly THREE.InstancedMesh[] {
    return this.meshes;
  }

  private addBoxes(
    material: THREE.Material,
    boxes: readonly StationBox[],
  ): THREE.InstancedMesh | null {
    if (boxes.length === 0) return null;
    const mesh = this.addMesh(material, boxes.length);
    _quat.identity();
    boxes.forEach((b, i) => {
      _position.set(b.x, b.y, b.z);
      _scale.set(b.sx, b.sy, b.sz);
      _matrix.compose(_position, _quat, _scale);
      mesh.setMatrixAt(i, _matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }

  private addMesh(material: THREE.Material, count: number): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(this.box, material, count);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData['underground'] = 'road';
    this.scene.add(mesh);
    this.meshes.push(mesh);
    return mesh;
  }

  private clearMeshes(): void {
    for (const mesh of this.meshes) {
      this.scene.remove(mesh);
      // The unit box is the renderer's, which dispose() on an instance leaves alone.
      mesh.dispose();
    }
    this.meshes = [];
  }

  dispose(): void {
    this.clearMeshes();
    this.current = EMPTY;
    this.box.dispose();
    this.concrete.dispose();
    this.roof.dispose();
    this.glass.dispose();
    this.sign.dispose();
  }
}
