/**
 * The shared part kit an archetype is assembled from (render/archetypes.ts
 * picks the recipe; this builds it).
 *
 * Every part is a box, placed in the building's own UNROTATED footprint frame
 * and rotated with it — the same convention props.ts uses for roof clutter. The
 * placements are pure functions of the building's boxes and its road-facing
 * side, so a warehouse's dock is testable without a scene.
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
import {
  computeSetbacks,
  frontageSetbackFor,
  InstancedSlotPool,
  type SetbackBox,
} from './massing';
import { TILE_METERS } from '../shared/constants';
import { maxHeightOverFootprint } from './footprint';
import { findRoadFacingEdge, type Side } from './parked';
import { materialHex } from './palette';
import { partsFor, type BuildingPart } from './archetypes';

const INITIAL_PART_CAPACITY = 32;

/** Colours, all from the calibrated chart. */
const PART_COLOR: Readonly<Record<BuildingPart, number>> = {
  loadingDock: materialHex('stainedConcrete'),
  rollUpDoors: materialHex('metalPlates'),
  monitorRoof: materialHex('metalPlates'),
  roofArray: materialHex('bluePlaster'), // photovoltaic dark blue
  canopy: materialHex('redPlaster'),
  signageBand: materialHex('whiteBrick'),
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

export interface PartPlacement {
  readonly part: BuildingPart;
  /** Box size in world meters (w along X, h along Y, d along Z), unrotated. */
  readonly size: readonly [number, number, number];
  /** Center offset from the building's footprint center, unrotated, meters. */
  readonly offset: readonly [number, number, number];
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

  for (const part of partsFor(entry)) {
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
          size: [
            topBox.w * ARRAY_INSET_FRACTION,
            ARRAY_HEIGHT_M,
            topBox.d * ARRAY_INSET_FRACTION,
          ],
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
        // Doors sit above the dock platform, evenly spaced across the frontage.
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
              DOCK_HEIGHT_M + DOOR_HEIGHT_M / 2,
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
  private readonly pools = new Map<BuildingPart, InstancedSlotPool>();
  private readonly buildingSlots = new Map<number, { part: BuildingPart; slot: number }[]>();
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true });

  constructor(
    scene: THREE.Scene,
    heightAt: (x: number, z: number) => number,
    catalog: readonly BuildingCatalogEntry[],
    roadAt: (x: number, z: number) => boolean,
  ) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.catalogById = new Map(catalog.map((e) => [e.id, e]));
    this.roadAt = roadAt;
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
      pool = new InstancedSlotPool(this.scene, unitBox(), this.material, INITIAL_PART_CAPACITY);
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

    const frontage = frontageSetbackFor(entry, building.x, building.z, this.roadAt);
    const { boxes } = computeSetbacks(entry, building.id, frontage);
    const baseBox = boxes[0];
    const topBox = boxes[boxes.length - 1];
    if (!baseBox || !topBox) return;

    const edge = findRoadFacingEdge(
      building.x,
      building.z,
      entry.footprint.w,
      entry.footprint.d,
      this.roadAt,
    );
    const placements = computePartPlacements(entry, baseBox, topBox, edge?.side ?? null);
    if (placements.length === 0) return;

    const groundY = maxHeightOverFootprint(
      this.heightAt,
      building.x,
      building.z,
      entry.footprint.w,
      entry.footprint.d,
    );
    const centerX = (building.x + entry.footprint.w / 2) * TILE_METERS;
    const centerZ = (building.z + entry.footprint.d / 2) * TILE_METERS;
    // Kit only goes on finished buildings — a loading dock on a quarter-built
    // shell reads as debris — so the lifecycle tint is always the Active one.
    const held: { part: BuildingPart; slot: number }[] = [];
    for (const p of placements) {
      const pool = this.poolFor(p.part);
      const slot = pool.allocate();

      // The offset rotates with the footprint; the size does not, because the
      // instance quaternion already turns the box itself.
      const rotated = rotateLocal(p.offset[0], p.offset[2], building.rotation);
      _position.set(centerX + rotated.x, groundY + p.offset[1], centerZ + rotated.z);
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
