/**
 * Selection highlight shell: a pulsing green wireframe box
 * hugging the selected building. Consumes plain box data only — this file
 * never imports buildings.ts; integration derives {position, footprint,
 * height} from the building instancer and calls highlight()/update() each
 * frame a selection is held.
 *
 * Target box contract (defined here since this file owns the shape):
 *  - `position` is the GROUND-LEVEL center of the building's footprint in
 *    world meters — x/z at the footprint centroid, y at the terrain height
 *    under it (the box's BASE corner-height, not its vertical middle).
 *  - `footprint` is {w,d} in TILES — the same shape/units as
 *    BuildingCatalogEntry.footprint.
 *  - `height` is meters.
 * These are exactly the numbers BuildingInstancer already computes per
 * instance (centerX/centerZ/groundY) before its own "+height/2" shift to a
 * centroid (see buildings.ts writeInstance), so integration can pass them
 * straight through without extra math. The roof sits at
 * `position.y + height` — the natural anchor for a MapPin above it.
 */
import * as THREE from 'three';
import { TILE_METERS } from '../shared/constants';

export interface OutlineTarget {
  position: { x: number; y: number; z: number };
  footprint: { w: number; d: number };
  height: number;
}

/** Edge-outline color: positive green for the building's selection wireframe. */
const OUTLINE_COLOR = 0x5dd06b;
/** The shell sits this many meters outside the building's true surface on every side, so the line never z-fights the box mesh it's tracing. */
const OUTLINE_MARGIN = 0.12;

export const PULSE_MIN_OPACITY = 0.45;
export const PULSE_MAX_OPACITY = 0.95;
/** Full pulse cycle length, in the same elapsed-visual-time units update(t) receives (see below). */
export const PULSE_PERIOD_SECONDS = 1.6;

/**
 * Pure: world-space wireframe box dimensions (meters) for a building's tile
 * footprint + meter height, with the outward margin baked equally into every
 * axis. Negative inputs clamp to zero before the margin is applied, so the
 * result is always a valid (non-inverted) box size.
 */
export function outlineBoxSize(
  footprint: { w: number; d: number },
  height: number,
): { w: number; h: number; d: number } {
  return {
    w: Math.max(0, footprint.w) * TILE_METERS + OUTLINE_MARGIN * 2,
    h: Math.max(0, height) + OUTLINE_MARGIN * 2,
    d: Math.max(0, footprint.d) * TILE_METERS + OUTLINE_MARGIN * 2,
  };
}

/**
 * Pure: subtle opacity pulse, oscillating within [PULSE_MIN_OPACITY,
 * PULSE_MAX_OPACITY] with period PULSE_PERIOD_SECONDS. Deterministic in `t`
 * (elapsed visual time — a caller-owned, deterministic clock derived from
 * sim ticks, e.g. tick / TICK_RATE; never Date.now()).
 */
export function pulseOpacity(t: number): number {
  const wave = (Math.sin((t / PULSE_PERIOD_SECONDS) * Math.PI * 2) + 1) / 2; // 0..1
  return PULSE_MIN_OPACITY + wave * (PULSE_MAX_OPACITY - PULSE_MIN_OPACITY);
}

export class SelectionOutline {
  private readonly lines: THREE.LineSegments;
  private readonly material: THREE.LineBasicMaterial;

  constructor(scene: THREE.Scene) {
    const unitBox = new THREE.BoxGeometry(1, 1, 1);
    const edges = new THREE.EdgesGeometry(unitBox);
    unitBox.dispose();

    this.material = new THREE.LineBasicMaterial({
      color: OUTLINE_COLOR,
      transparent: true,
      opacity: PULSE_MAX_OPACITY,
      depthTest: true,
    });

    this.lines = new THREE.LineSegments(edges, this.material);
    this.lines.visible = false;
    this.lines.renderOrder = 15;
    scene.add(this.lines);
  }

  /**
   * Shows the shell sized/positioned to `target`'s box, or hides it when
   * `target` is null (selection cleared / building demolished).
   */
  highlight(target: OutlineTarget | null): void {
    if (!target) {
      this.lines.visible = false;
      return;
    }

    const size = outlineBoxSize(target.footprint, target.height);
    this.lines.scale.set(size.w, size.h, size.d);
    this.lines.position.set(
      target.position.x,
      target.position.y + target.height / 2,
      target.position.z,
    );
    this.lines.visible = true;
  }

  /** Advances the opacity pulse. `t`: elapsed visual time, see {@link pulseOpacity}. */
  update(t: number): void {
    this.material.opacity = pulseOpacity(t);
  }
}
