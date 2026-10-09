/**
 * The shared part kit an archetype is assembled from (render/archetypes.ts
 * picks the recipe; this builds it).
 *
 * Every part is a box (a tank, a cylinder), placed in the building's own
 * UNROTATED footprint frame and rotated with it — the same convention props.ts
 * uses for roof clutter. The placements are pure functions of the building's
 * boxes and its road-facing side, so a warehouse's dock is testable without a
 * scene.
 *
 * Budget: a part is one box, twelve triangles. A whole assembly is under a
 * hundred, which is why the reference's 65,536-vertex mesh cap is never the
 * binding constraint on a building — merged ground geometry is.
 */
import * as THREE from 'three';
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  BuildingState,
} from '../shared/types';
import { computeSetbacks, frontageSetbackFor, InstancedSlotPool, type SetbackBox } from './massing';
import { TILE_METERS } from '../shared/constants';
import { footprintForRotation } from '../shared/footprint';
import { maxHeightUnderBody } from './footprint';
import { findRoadFacingEdge, localSideOf, NO_STREETS, type Side } from './frontage';
import { materialHex } from './palette';
import { partsFor, type BuildingPart } from './archetypes';
import { FUEL_CANOPY_DEPTH_M, FUEL_CANOPY_GAP_M, TANK_DIAMETER_M, TANK_GAP_M } from './lotplan';
import type { KerbSurroundings } from '../shared/kerblayout';

const INITIAL_PART_CAPACITY = 32;

/** Colours, all from the calibrated chart. */
const PART_COLOR: Readonly<Record<BuildingPart, number>> = {
  loadingDock: materialHex('stainedConcrete'),
  rollUpDoors: materialHex('metalPlates'),
  monitorRoof: materialHex('metalPlates'),
  roofArray: materialHex('bluePlaster'), // photovoltaic dark blue
  canopy: materialHex('redPlaster'),
  signageBand: materialHex('whiteBrick'),
  fuelCanopy: materialHex('whiteBrick'),
  pumps: materialHex('redPlaster'),
  tanks: materialHex('whitePlaster'),
};

/** A part's unit geometry, scaled per instance: a box unless the part is round. */
const PART_GEOMETRY: Partial<Record<BuildingPart, () => THREE.BufferGeometry>> = {
  tanks: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
};

// --- part dimensions, world meters -----------------------------------------

const DOCK_DEPTH_M = 2.6;
const DOCK_HEIGHT_M = 1.2;
/** Share of the frontage the dock platform runs along. */
const DOCK_FRONTAGE_FRACTION = 0.65;

const DOOR_WIDTH_M = 3;
const DOOR_HEIGHT_M = 3.6;
const DOOR_THICKNESS_M = 0.18;
export const DOOR_COUNT = 3;

/** The monitor roof is a raised lantern running down the roof's long axis. */
const MONITOR_HEIGHT_M = 1.9;
const MONITOR_WIDTH_FRACTION = 0.34;
const MONITOR_LENGTH_FRACTION = 0.78;

const ARRAY_HEIGHT_M = 0.25;
const ARRAY_INSET_FRACTION = 0.72;

const CANOPY_DEPTH_M = 1.9;
const CANOPY_THICKNESS_M = 0.22;
const CANOPY_HEIGHT_M = 3.1;
const CANOPY_FRONTAGE_FRACTION = 0.82;

const SIGN_HEIGHT_M = 0.9;
const SIGN_THICKNESS_M = 0.16;
const SIGN_FRONTAGE_FRACTION = 0.7;
/** The band sits just above the shopfront, i.e. above the canopy. */
const SIGN_ABOVE_CANOPY_M = 0.5;

/** The forecourt canopy's and the tank farm's ground, which the lot plan keeps clear for them. */
export { FUEL_CANOPY_GAP_M, FUEL_CANOPY_DEPTH_M, TANK_DIAMETER_M, TANK_GAP_M };
/** A filling station's canopy stands off the kiosk over the forecourt, on posts. */
export const FUEL_CANOPY_THICKNESS_M = 0.5;
export const FUEL_CANOPY_HEIGHT_M = 5.2;
export const FUEL_CANOPY_FRONTAGE_FRACTION = 0.9;
const FUEL_POST_M = 0.4;
const FUEL_POST_INSET_M = 1;
/** Two pump islands under the canopy, on the forecourt the lot plan keeps clear. */
export const PUMP_ISLAND_SIZE_M: readonly [number, number, number] = [1, 1.4, 3];
const PUMP_OUT_FROM_WALL_M = 4.5;

/** A tank farm: three tanks in a row off the wall opposite the street, in the yard behind the plant. */
export const TANK_COUNT = 3;
export const TANK_HEIGHT_M = 5;
export const TANK_SPACING_M = 7.5;

export interface PartPlacement {
  readonly part: BuildingPart;
  /** Box size in world meters (w along X, h along Y, d along Z), unrotated. */
  readonly size: readonly [number, number, number];
  /** Center offset from the building's footprint center, unrotated, meters. */
  readonly offset: readonly [number, number, number];
}

/** The side across the footprint from `side`: the back of a building that fronts `side`. */
function oppositeSide(side: Side): Side {
  switch (side) {
    case 'N':
      return 'S';
    case 'S':
      return 'N';
    case 'E':
      return 'W';
    default:
      return 'E';
  }
}

/** Outward unit normal of a footprint side, in the unrotated frame. */
function sideNormal(side: Side): { nx: number; nz: number } {
  switch (side) {
    case 'N':
      return { nx: 0, nz: -1 };
    case 'S':
      return { nx: 0, nz: 1 };
    case 'E':
      return { nx: 1, nz: 0 };
    default:
      return { nx: -1, nz: 0 };
  }
}

/** Span of the facade on a side: the box's X extent for N/S, its Z extent for E/W. */
function facadeSpan(box: SetbackBox, side: Side): number {
  return side === 'N' || side === 'S' ? box.w : box.d;
}

/** Half-depth from the box center out to the given face. */
function halfDepthTo(box: SetbackBox, side: Side): number {
  return (side === 'N' || side === 'S' ? box.d : box.w) / 2;
}

/**
 * A box laid flat against one facade: `span` wide along the wall, `depth` out
 * from it, `height` tall, its inner face flush with the wall.
 */
function againstFacade(
  part: BuildingPart,
  base: SetbackBox,
  side: Side,
  span: number,
  depth: number,
  height: number,
  centerY: number,
): PartPlacement {
  const { nx, nz } = sideNormal(side);
  const out = halfDepthTo(base, side) + depth / 2;
  const alongX = side === 'N' || side === 'S';
  return {
    part,
    size: alongX ? [span, height, depth] : [depth, height, span],
    offset: [nx * out, centerY, nz * out],
  };
}

/**
 * Every part this building's archetype calls for, placed. `topBox` carries the
 * roof parts, `baseBox` the facade ones; `side` is the frontage, without which
 * a dock or a canopy would face nothing and is skipped.
 */
export function computePartPlacements(
  entry: BuildingCatalogEntry,
  baseBox: SetbackBox,
  topBox: SetbackBox,
  side: Side | null,
): PartPlacement[] {
  const out: PartPlacement[] = [];
  const roofY = topBox.yOffset + topBox.h;
  const parts = partsFor(entry);
  // Doors stand on the dock where there is one, and on the ground where not.
  const doorSill = parts.includes('loadingDock') ? DOCK_HEIGHT_M : 0;

  for (const part of parts) {
    switch (part) {
      case 'monitorRoof': {
        const alongZ = topBox.d >= topBox.w;
        const w = alongZ ? topBox.w * MONITOR_WIDTH_FRACTION : topBox.w * MONITOR_LENGTH_FRACTION;
        const d = alongZ ? topBox.d * MONITOR_LENGTH_FRACTION : topBox.d * MONITOR_WIDTH_FRACTION;
        out.push({
          part,
          size: [w, MONITOR_HEIGHT_M, d],
          offset: [0, roofY + MONITOR_HEIGHT_M / 2, 0],
        });
        break;
      }
      case 'roofArray': {
        out.push({
          part,
          size: [topBox.w * ARRAY_INSET_FRACTION, ARRAY_HEIGHT_M, topBox.d * ARRAY_INSET_FRACTION],
          offset: [0, roofY + ARRAY_HEIGHT_M / 2, 0],
        });
        break;
      }
      case 'loadingDock': {
        if (!side) break;
        out.push(
          againstFacade(
            part,
            baseBox,
            side,
            facadeSpan(baseBox, side) * DOCK_FRONTAGE_FRACTION,
            DOCK_DEPTH_M,
            DOCK_HEIGHT_M,
            DOCK_HEIGHT_M / 2,
          ),
        );
        break;
      }
      case 'rollUpDoors': {
        if (!side) break;
        const { nx, nz } = sideNormal(side);
        const outDist = halfDepthTo(baseBox, side) + DOOR_THICKNESS_M / 2;
        const alongX = side === 'N' || side === 'S';
        const span = facadeSpan(baseBox, side);
        // Doors sit on their sill, evenly spaced across the frontage.
        const usable = span * DOCK_FRONTAGE_FRACTION;
        const pitch = usable / DOOR_COUNT;
        for (let i = 0; i < DOOR_COUNT; i += 1) {
          const along = -usable / 2 + (i + 0.5) * pitch;
          const width = Math.min(DOOR_WIDTH_M, pitch * 0.8);
          out.push({
            part,
            size: alongX
              ? [width, DOOR_HEIGHT_M, DOOR_THICKNESS_M]
              : [DOOR_THICKNESS_M, DOOR_HEIGHT_M, width],
            offset: [
              alongX ? along : nx * outDist,
              doorSill + DOOR_HEIGHT_M / 2,
              alongX ? nz * outDist : along,
            ],
          });
        }
        break;
      }
      case 'tanks': {
        if (!side) break;
        const back = oppositeSide(side);
        const { nx, nz } = sideNormal(back);
        const alongX = back === 'N' || back === 'S';
        const outDist = halfDepthTo(baseBox, back) + TANK_GAP_M + TANK_DIAMETER_M / 2;
        for (let i = 0; i < TANK_COUNT; i += 1) {
          const along = (i - (TANK_COUNT - 1) / 2) * TANK_SPACING_M;
          out.push({
            part,
            size: [TANK_DIAMETER_M, TANK_HEIGHT_M, TANK_DIAMETER_M],
            offset: [
              alongX ? along : nx * outDist,
              TANK_HEIGHT_M / 2,
              alongX ? nz * outDist : along,
            ],
          });
        }
        break;
      }
      case 'canopy': {
        if (!side) break;
        out.push(
          againstFacade(
            part,
            baseBox,
            side,
            facadeSpan(baseBox, side) * CANOPY_FRONTAGE_FRACTION,
            CANOPY_DEPTH_M,
            CANOPY_THICKNESS_M,
            CANOPY_HEIGHT_M,
          ),
        );
        break;
      }
      case 'signageBand': {
        if (!side) break;
        out.push(
          againstFacade(
            part,
            baseBox,
            side,
            facadeSpan(baseBox, side) * SIGN_FRONTAGE_FRACTION,
            SIGN_THICKNESS_M,
            SIGN_HEIGHT_M,
            CANOPY_HEIGHT_M + SIGN_ABOVE_CANOPY_M,
          ),
        );
        break;
      }
      case 'fuelCanopy': {
        if (!side) break;
        const { nx, nz } = sideNormal(side);
        const alongX = side === 'N' || side === 'S';
        const span = facadeSpan(baseBox, side) * FUEL_CANOPY_FRONTAGE_FRACTION;
        const centreOut = halfDepthTo(baseBox, side) + FUEL_CANOPY_GAP_M + FUEL_CANOPY_DEPTH_M / 2;
        const slabY = FUEL_CANOPY_HEIGHT_M + FUEL_CANOPY_THICKNESS_M / 2;
        out.push({
          part,
          size: alongX
            ? [span, FUEL_CANOPY_THICKNESS_M, FUEL_CANOPY_DEPTH_M]
            : [FUEL_CANOPY_DEPTH_M, FUEL_CANOPY_THICKNESS_M, span],
          offset: [nx * centreOut, slabY, nz * centreOut],
        });
        // Four posts, inset from the canopy's corners.
        const halfSpan = span / 2 - FUEL_POST_INSET_M;
        const halfDepth = FUEL_CANOPY_DEPTH_M / 2 - FUEL_POST_INSET_M;
        for (const a of [-1, 1]) {
          for (const d of [-1, 1]) {
            const along = a * halfSpan;
            const outDist = centreOut + d * halfDepth;
            out.push({
              part,
              size: [FUEL_POST_M, FUEL_CANOPY_HEIGHT_M, FUEL_POST_M],
              offset: [
                alongX ? along : nx * outDist,
                FUEL_CANOPY_HEIGHT_M / 2,
                alongX ? nz * outDist : along,
              ],
            });
          }
        }
        break;
      }
      case 'pumps': {
        if (!side) break;
        const { nx, nz } = sideNormal(side);
        const alongX = side === 'N' || side === 'S';
        const span = facadeSpan(baseBox, side) * FUEL_CANOPY_FRONTAGE_FRACTION;
        const outDist = halfDepthTo(baseBox, side) + PUMP_OUT_FROM_WALL_M;
        const [w, h, len] = PUMP_ISLAND_SIZE_M;
        for (const a of [-1, 1]) {
          const along = (a * span) / 4;
          out.push({
            part,
            size: alongX ? [len, h, w] : [w, h, len],
            offset: [alongX ? along : nx * outDist, h / 2, alongX ? nz * outDist : along],
          });
        }
        break;
      }
    }
  }
  return out;
}

/** Rotates a local footprint-frame offset by rotation*90°, matching props.ts. */
function rotateLocal(x: number, z: number, rotation: 0 | 1 | 2 | 3): { x: number; z: number } {
  const theta = rotation * (Math.PI / 2);
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  return { x: x * cos + z * sin, z: -x * sin + z * cos };
}

const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);

/** A unit box anchored at its own center, scaled per instance. */
function unitBox(): THREE.BoxGeometry {
  return new THREE.BoxGeometry(1, 1, 1);
}

export class BuildingKitRenderer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (x: number, z: number) => number;
  private readonly catalogById: Map<string, BuildingCatalogEntry>;
  private readonly roadAt: (x: number, z: number) => boolean;
  /** The stalls the streets paint, which a car park counts toward its code; null credits none. */
  private readonly kerb: KerbSurroundings | null;
  private readonly pools = new Map<BuildingPart, InstancedSlotPool>();
  private readonly buildingSlots = new Map<number, { part: BuildingPart; slot: number }[]>();
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });

  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    catalog: readonly BuildingCatalogEntry[],
    roadAt: (x: number, z: number) => boolean,
    kerb: KerbSurroundings | null = null,
  ) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.catalogById = new Map(catalog.map((e) => [e.id, e]));
    this.roadAt = roadAt;
    this.kerb = kerb;
  }

  /**
   * Removals are applied LAST, matching the order the render thread folds a
   * delta into its own building map. A building can be both updated and removed
   * within one delta — abandoned and then demolished inside a single snapshot
   * window — and freeing first would let the update re-place it, leaving parts
   * standing over a building the world no longer has.
   */
  apply(delta: BuildingDelta): void {
    for (const b of delta.updated) this.free(b.id);
    for (const b of delta.added) this.place(b);
    for (const b of delta.updated) this.place(b);
    for (const id of delta.removed) this.free(id);
    for (const pool of this.pools.values()) pool.commit();
  }

  partCountFor(buildingId: number): number {
    return this.buildingSlots.get(buildingId)?.length ?? 0;
  }

  /** Ids the kit currently holds parts for — for reconciling against the world. */
  trackedIds(): number[] {
    return Array.from(this.buildingSlots.keys());
  }

  /**
   * Parts of this kind currently standing. Counted from the live per-building
   * records, NOT from the pool's extent: a pool keeps its high-water slot count
   * after buildings churn, so asking it would report parts that no longer exist.
   */
  instanceCount(part: BuildingPart): number {
    let live = 0;
    for (const held of this.buildingSlots.values()) {
      for (const h of held) if (h.part === part) live += 1;
    }
    return live;
  }

  dispose(): void {
    for (const id of Array.from(this.buildingSlots.keys())) this.free(id);
    for (const pool of this.pools.values()) pool.commit();
    this.pools.clear();
    this.material.dispose();
  }

  private poolFor(part: BuildingPart): InstancedSlotPool {
    let pool = this.pools.get(part);
    if (!pool) {
      const geometry = PART_GEOMETRY[part]?.() ?? unitBox();
      pool = new InstancedSlotPool(this.scene, geometry, this.material, INITIAL_PART_CAPACITY);
      this.pools.set(part, pool);
    }
    return pool;
  }

  private free(id: number): void {
    const held = this.buildingSlots.get(id);
    if (!held) return;
    for (const { part, slot } of held) this.pools.get(part)?.free(slot);
    this.buildingSlots.delete(id);
  }

  private place(building: BuildingInstance): void {
    const entry = this.catalogById.get(building.catalogId);
    if (!entry) return;
    if (building.state !== BuildingState.Active) return;

    const frontage = frontageSetbackFor(
      entry,
      building.x,
      building.z,
      this.roadAt,
      NO_STREETS,
      building.rotation,
      this.kerb,
    );
    const { boxes } = computeSetbacks(entry, building.id, frontage);
    const baseBox = boxes[0];
    const topBox = boxes[boxes.length - 1];
    if (!baseBox || !topBox) return;

    // The edge is found on the map; the parts sit in the building's own frame.
    const lot = footprintForRotation(entry, building.rotation);
    const edge = findRoadFacingEdge(building.x, building.z, lot.w, lot.d, this.roadAt);
    const localSide = edge ? localSideOf(edge.side, building.rotation) : null;
    const placements = computePartPlacements(entry, baseBox, topBox, localSide);
    if (placements.length === 0) return;

    const centerX = (building.x + lot.w / 2) * TILE_METERS;
    const centerZ = (building.z + lot.d / 2) * TILE_METERS;
    // The kit stands where the body stands: on the ground under the base
    // tier, as the instancer seats it, so a dock or a pump never hangs over
    // the downhill side of a lot its body is level on.
    const groundY = maxHeightUnderBody(
      this.heightAt,
      centerX + frontage.centerXM,
      centerZ + frontage.centerZM,
      baseBox.w,
      baseBox.d,
      building.rotation,
    );
    // Kit only goes on finished buildings — a loading dock on a quarter-built
    // shell reads as debris — so the lifecycle tint is always the Active one.
    const held: { part: BuildingPart; slot: number }[] = [];
    for (const p of placements) {
      const pool = this.poolFor(p.part);
      const slot = pool.allocate();

      // The offset rotates with the footprint; the size does not, because the
      // instance quaternion already turns the box itself.
      const rotated = rotateLocal(p.offset[0], p.offset[2], building.rotation);
      _position.set(
        centerX + frontage.centerXM + rotated.x,
        groundY + p.offset[1],
        centerZ + frontage.centerZM + rotated.z,
      );
      _quaternion.setFromAxisAngle(_yAxis, building.rotation * (Math.PI / 2));
      _scale.set(p.size[0], p.size[1], p.size[2]);
      _matrix.compose(_position, _quaternion, _scale);
      pool.setMatrixAt(slot, _matrix);

      _color.setHex(PART_COLOR[p.part]);
      pool.setColorAt(slot, _color);

      held.push({ part: p.part, slot });
    }
    this.buildingSlots.set(building.id, held);
  }
}
