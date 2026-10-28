/**
 * Bus stops as road furniture: a pad, a pole carrying the stop sign and, for a
 * shelter, the shelter and a bin, laid on one side of a street tile from that
 * tile's own cross-section. A stop is never a building and takes no land.
 *
 * `busStopPlacement` is the ONE function that lays a stop; the committed
 * stops and the ghost both draw from it. Its frame is the tile's road frame:
 * `along` runs down the road, `out` runs from the road's centre line toward the
 * stop's side. The footway is kept clear, so the stop stands at its outer
 * edge: the pad's near edge is the kerb face plus the footway's depth, and the
 * pad runs 2.44 m beyond that and 3.66 m along; the pole stands 0.46 m from
 * the pad's road-side edge at its leading end, the end traffic reaches first;
 * the shelter stands at the back of the pad with its front 0.9 m from that
 * edge; the bin stands at the pad's trailing end. A road with no footway has
 * nothing to keep clear, so the same pad stands off the edge of its pavement
 * by the kerb reserve.
 *
 * Every part is one instanced pool; nothing here draws a stop per mesh.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tileToWorld } from '../shared/constants';
import {
  carriagewayHalfWidthOf,
  carriagewayShiftOf,
  hasFootway,
  KERB_RESERVE_M,
  presetProfileForTier,
} from '../shared/roadprofile';
import { flowDirection, RoadFlow, RoadTier, type BusStop, type RoadProfile } from '../shared/types';
import { box, BUS_SHELTER, buildBusShelterGeometry, painted } from './busshelter';
import { lateralAxis, tileKey, type FurnitureAxis, type RoadTileIndex } from './roadfurniture';
import { sidewalkDepthMeters } from './frontage';
import { CURB_Y_OFFSET, ROAD_Y_OFFSET } from './roadsmesh';

/** The boarding pad: 96 in out from the kerb, 12 ft along it, the shelter's length. */
export const BUS_STOP_PAD = { out: 2.44, along: 3.66 };
/** The pole stands this far out from the kerb. */
export const BUS_STOP_POLE_FROM_KERB_M = 0.46;
/** The shelter's front stands this far out from the kerb. */
export const BUS_STOP_SHELTER_FRONT_M = 0.9;
/** The flag sign: 18 × 24 in with its bottom 7 ft up, on a slim pole. */
export const BUS_STOP_SIGN = { w: 0.46, h: 0.61, bottom: 2.13, pole: 0.04 };
/** The receptacle: a 32 gal can, 24 in across and 40 in tall. */
export const BUS_STOP_BIN = { r: 0.305, h: 1.0 };
/** How far the bin stands out from the kerb, on the pad in front of the shelter. */
const BUS_STOP_BIN_FROM_KERB_M = 0.5;
/** The pad's slab: its top this far above the footway, and thick enough to hide on a slope. */
const PAD_RISE_M = 0.03;
const PAD_THICKNESS_M = 0.35;

const PAD_COLOR = 0xbdb8ae;
const SIGN_COLOR = 0x294d85;
const POLE_COLOR = 0x73787f;
const BIN_COLOR = 0x384d42;

/** A road tile as a stop needs to read it. */
export interface StopRoad {
  tier: RoadTier;
  /** The tile's own cross-section; absent reads as its tier's preset. */
  profile?: RoadProfile | undefined;
  /** The tile's stored flow byte. */
  flow: number;
  /** The world axis a stop's side is offset along: 'z' for a road running east-west. */
  lateral: FurnitureAxis;
}

export interface StopSpot {
  x: number;
  z: number;
  /** Metres from the road's centre line, outward. */
  out: number;
}

/** Where one stop's furniture stands, world metres, and the road-frame offsets it was laid from. */
export interface BusStopPlacement {
  /** Y rotation turning a part's local +Z, its open front, toward the carriageway. */
  yaw: number;
  /** Which way along the road, in world coordinate sign, traffic passing this kerb runs: the pad's leading end. */
  leading: 1 | -1;
  /** The pad's near edge, metres out from the road's centre line: the footway's outer edge, or the kerb reserve beyond a footless road's pavement. */
  kerbOut: number;
  pad: StopSpot & { out0: number; out1: number; along: number };
  pole: StopSpot;
  /** The shelter's body centre, its front `BUS_STOP_SHELTER_FRONT_M` from the kerb; absent on a sign. */
  shelter: (StopSpot & { frontOut: number }) | null;
  bin: StopSpot | null;
  /** Whether the pad stands on a footway (kerb height) or on the carriageway's own level. */
  onFootway: boolean;
}

/** The unit step along the road, in world coordinate sign, that traffic runs past this side's kerb. */
function leadingSign(lateral: FurnitureAxis, side: 1 | -1, flow: number): 1 | -1 {
  const direction = flowDirection(flow);
  if (lateral === 'z') {
    if (direction === RoadFlow.East) return 1;
    if (direction === RoadFlow.West) return -1;
    // Two ways, driving on the right: the south kerb carries the eastbound lane.
    return side;
  }
  if (direction === RoadFlow.South) return 1;
  if (direction === RoadFlow.North) return -1;
  return side === 1 ? -1 : 1;
}

/**
 * Lays one stop's furniture on its tile. `lateral` is the world axis the
 * stop's side is offset along (`lateralAxis`), side 0 the low coordinate and
 * side 1 the high. Pure: no scene, no terrain.
 */
export function busStopPlacement(
  stop: BusStop,
  tier: RoadTier,
  profile: RoadProfile | undefined,
  flow: number,
  lateral: FurnitureAxis,
): BusStopPlacement {
  const section = profile ?? presetProfileForTier(tier);
  const side: 1 | -1 = stop.side === 0 ? -1 : 1;
  const onFootway = hasFootway(section);
  // Half of a corridor nothing divides is pushed against the edge it shares
  // with the other half, and its kerbs go with it.
  const kerbFace = carriagewayHalfWidthOf(section) + side * carriagewayShiftOf(section);
  // The footway is kept clear: the stop stands beyond its outer edge.
  const kerbOut = kerbFace + (onFootway ? sidewalkDepthMeters(tier, section) : KERB_RESERVE_M);
  const leading = leadingSign(lateral, side, flow);
  const cx = tileToWorld(stop.x);
  const cz = tileToWorld(stop.z);
  const at = (along: number, out: number): StopSpot => ({
    x: lateral === 'z' ? cx + along : cx + side * out,
    z: lateral === 'z' ? cz + side * out : cz + along,
    out,
  });
  const yaw =
    lateral === 'z' ? (side === 1 ? Math.PI : 0) : side === 1 ? -Math.PI / 2 : Math.PI / 2;
  const padMid = kerbOut + BUS_STOP_PAD.out / 2;
  const frontOut = kerbOut + BUS_STOP_SHELTER_FRONT_M;
  const shelterOut = frontOut + BUS_SHELTER.d / 2;
  const isShelter = stop.kind === 'shelter';
  return {
    yaw,
    leading,
    kerbOut,
    pad: {
      ...at(0, padMid),
      out0: kerbOut,
      out1: kerbOut + BUS_STOP_PAD.out,
      along: BUS_STOP_PAD.along,
    },
    pole: at(leading * (BUS_STOP_PAD.along / 2), kerbOut + BUS_STOP_POLE_FROM_KERB_M),
    shelter: isShelter ? { ...at(0, shelterOut), frontOut } : null,
    bin: isShelter
      ? at(
          -leading * (BUS_STOP_PAD.along / 2 - BUS_STOP_BIN.r - 0.1),
          kerbOut + BUS_STOP_BIN_FROM_KERB_M,
        )
      : null,
    onFootway,
  };
}

/** The stop's road as the placement reads it, from the road tiles' own index; null where no road stands. */
export function stopRoadAt(tileSet: RoadTileIndex, x: number, z: number): StopRoad | null {
  const tile = tileSet.get(tileKey(x, z));
  if (!tile) return null;
  return {
    tier: tile.tier ?? RoadTier.TwoLane,
    profile: tile.profile,
    flow: tile.flow ?? 0,
    lateral: lateralAxis(tileSet, x, z),
  };
}

// --- geometry ---------------------------------------------------------------

/** The pad slab: 3.66 × 2.44 m with its top just above the footway, local X along the road. */
function buildPadGeometry(): THREE.BufferGeometry {
  const slab = new THREE.BoxGeometry(BUS_STOP_PAD.along, PAD_THICKNESS_M, BUS_STOP_PAD.out);
  slab.translate(0, PAD_RISE_M - PAD_THICKNESS_M / 2, 0);
  return painted(slab, PAD_COLOR);
}

function merged(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error('busstops: the parts did not merge');
  return geometry;
}

/** The flag sign on its pole; local Y=0 is the ground the pole stands on. */
function buildPoleGeometry(): THREE.BufferGeometry {
  const { w, h, bottom, pole } = BUS_STOP_SIGN;
  const post = new THREE.CylinderGeometry(pole, pole, bottom + h, 6);
  post.translate(0, (bottom + h) / 2, 0);
  return merged([painted(post, POLE_COLOR), box(0.03, h, w, 0, bottom, 0, SIGN_COLOR)]);
}

/** The receptacle: a can and its lid; local Y=0 is the ground. */
function buildBinGeometry(): THREE.BufferGeometry {
  const can = new THREE.CylinderGeometry(BUS_STOP_BIN.r, BUS_STOP_BIN.r * 0.92, BUS_STOP_BIN.h, 8);
  can.translate(0, BUS_STOP_BIN.h / 2, 0);
  const lid = new THREE.CylinderGeometry(BUS_STOP_BIN.r + 0.02, BUS_STOP_BIN.r + 0.02, 0.06, 8);
  lid.translate(0, BUS_STOP_BIN.h + 0.03, 0);
  return merged([painted(can, BIN_COLOR), painted(lid, POLE_COLOR)]);
}

// --- the renderer -------------------------------------------------------------

const GHOST_OK = 0x4caf50;
const GHOST_BAD = 0xe53935;
const GHOST_OPACITY = 0.6;
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3(1, 1, 1);
const _matrix = new THREE.Matrix4();
const _yAxis = new THREE.Vector3(0, 1, 0);

/** A stop as the renderer holds it: the stop and where its furniture stands. */
interface DrawnStop {
  stop: BusStop;
  placement: BusStopPlacement;
}

type PartName = 'pad' | 'pole' | 'shelter' | 'bin';

/** Which stops are drawn, kept by tile and side. */
export class BusStopRenderer {
  private readonly parts: Record<PartName, THREE.BufferGeometry> = {
    pad: buildPadGeometry(),
    pole: buildPoleGeometry(),
    shelter: buildBusShelterGeometry(),
    bin: buildBinGeometry(),
  };
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });
  private meshes: Partial<Record<PartName, THREE.InstancedMesh>> = {};
  private drawn: DrawnStop[] = [];
  private ghost: THREE.Group | null = null;
  private visible = true;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly heightAt: (x: number, z: number) => number,
  ) {}

  /** Draws exactly these stops, each on the road `roadAt` reads for its tile; a stop whose road is gone is skipped. */
  apply(stops: readonly BusStop[], roadAt: (x: number, z: number) => StopRoad | null): void {
    this.clearMeshes();
    this.drawn = [];
    for (const stop of stops) {
      const road = roadAt(stop.x, stop.z);
      if (!road) continue;
      this.drawn.push({
        stop,
        placement: busStopPlacement(stop, road.tier, road.profile, road.flow, road.lateral),
      });
    }
    const shelters = this.drawn.filter((d) => d.placement.shelter);
    this.build('pad', this.drawn.length, (i) => ({
      spot: this.drawn[i]!.placement.pad,
      d: this.drawn[i]!,
    }));
    this.build('pole', this.drawn.length, (i) => ({
      spot: this.drawn[i]!.placement.pole,
      d: this.drawn[i]!,
    }));
    this.build('shelter', shelters.length, (i) => ({
      spot: shelters[i]!.placement.shelter!,
      d: shelters[i]!,
    }));
    this.build('bin', shelters.length, (i) => ({
      spot: shelters[i]!.placement.bin!,
      d: shelters[i]!,
    }));
  }

  /** Instance count of one part: a pad and a pole per stop, a shelter and a bin per shelter. */
  instanceCount(part: PartName): number {
    return this.meshes[part]?.count ?? 0;
  }

  /** A part's geometry, for a test reading what a stop costs to draw. */
  partGeometry(part: PartName): THREE.BufferGeometry {
    return this.parts[part];
  }

  /** The matrix of one instance, for a test reading where a part stands. */
  getMatrix(part: PartName, slot: number, out: THREE.Matrix4): void {
    this.meshes[part]?.getMatrixAt(slot, out);
  }

  /** The stop whose pad lies nearest the world point, within `radiusM` of the pad's centre, or null. */
  pick(wx: number, wz: number, radiusM = BUS_STOP_PAD.along): BusStop | null {
    let best: BusStop | null = null;
    let bestD = radiusM;
    for (const { stop, placement } of this.drawn) {
      const d = Math.hypot(placement.pad.x - wx, placement.pad.z - wz);
      if (d <= bestD) {
        best = stop;
        bestD = d;
      }
    }
    return best;
  }

  /** Where the people waiting at a tile's stop stand: its shelter's bench, else its pad. */
  waitPoint(x: number, z: number): { x: number; z: number } | null {
    const here = this.drawn.filter((d) => d.stop.x === x && d.stop.z === z);
    const pick = here.find((d) => d.placement.shelter) ?? here[0];
    if (!pick) return null;
    const spot = pick.placement.shelter ?? pick.placement.pad;
    return { x: spot.x, z: spot.z };
  }

  /** Shows the stop a tool is about to place, laid by the same function as a placed one. */
  setGhost(stop: BusStop | null, road: StopRoad | null, valid: boolean): void {
    this.clearGhost();
    if (!stop || !road) return;
    const placement = busStopPlacement(stop, road.tier, road.profile, road.flow, road.lateral);
    const material = new THREE.MeshBasicMaterial({
      color: valid ? GHOST_OK : GHOST_BAD,
      transparent: true,
      opacity: GHOST_OPACITY,
      depthWrite: false,
    });
    const group = new THREE.Group();
    const add = (part: PartName, spot: StopSpot): void => {
      const mesh = new THREE.Mesh(this.parts[part], material);
      this.compose(spot, placement, _matrix);
      mesh.applyMatrix4(_matrix);
      group.add(mesh);
    };
    add('pad', placement.pad);
    add('pole', placement.pole);
    if (placement.shelter) add('shelter', placement.shelter);
    if (placement.bin) add('bin', placement.bin);
    group.userData.material = material;
    group.visible = this.visible;
    this.ghost = group;
    this.scene.add(group);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const mesh of Object.values(this.meshes)) mesh.visible = visible;
    if (this.ghost) this.ghost.visible = visible;
  }

  dispose(): void {
    this.clearMeshes();
    this.clearGhost();
    for (const geometry of Object.values(this.parts)) geometry.dispose();
    this.material.dispose();
  }

  /** Writes the matrix standing a part at `spot`, on the footway or carriageway level of the terrain there. */
  private compose(spot: StopSpot, placement: BusStopPlacement, out: THREE.Matrix4): void {
    const base = placement.onFootway ? CURB_Y_OFFSET : ROAD_Y_OFFSET;
    _position.set(spot.x, this.heightAt(spot.x, spot.z) + base, spot.z);
    _quaternion.setFromAxisAngle(_yAxis, placement.yaw);
    out.compose(_position, _quaternion, _scale);
  }

  private build(
    part: PartName,
    count: number,
    at: (i: number) => { spot: StopSpot; d: DrawnStop },
  ): void {
    if (count === 0) return;
    const mesh = new THREE.InstancedMesh(this.parts[part], this.material, count);
    for (let i = 0; i < count; i++) {
      const { spot, d } = at(i);
      this.compose(spot, d.placement, _matrix);
      mesh.setMatrixAt(i, _matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.visible = this.visible;
    this.meshes[part] = mesh;
    this.scene.add(mesh);
  }

  private clearMeshes(): void {
    for (const mesh of Object.values(this.meshes)) {
      this.scene.remove(mesh);
      mesh.dispose();
    }
    this.meshes = {};
  }

  private clearGhost(): void {
    if (!this.ghost) return;
    this.scene.remove(this.ghost);
    (this.ghost.userData.material as THREE.Material).dispose();
    this.ghost = null;
  }
}
