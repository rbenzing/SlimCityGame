/**
 * Data-lens overlay renderer. A single DataTexture sized MAP_SIZE² backs a
 * ground-hugging
 * quad. Two lens families share it (LensId = FieldId | 'power' | 'watered'):
 *  - FieldId lenses: setFieldData() re-ramps and uploads a full-map scalar
 *    byte array through the perceptual blue->green->yellow->red ramp.
 *  - 'power'/'watered' coverage lenses: setCoverage() folds incoming
 *    SimSnapshot ZonePatch[] rectangles (0/1 coverage bytes) into a cached
 *    full-map layer per kind, then — if that lens is the active one —
 *    re-ramps it through a two-tone ramp (covered = accent, uncovered = dim
 *    red) instead. The cache stays current regardless of which lens is
 *    active (cheap byte writes), so switching straight to a coverage lens
 *    repaints instantly from already-known data rather than waiting for the
 *    next patch.
 */

import * as THREE from 'three';
import type { LensId, ZonePatch } from '../shared/types';
import { FieldId } from '../shared/types';
import { MAP_SIZE, TILE_METERS } from '../shared/constants';

const OVERLAY_Y = 45;
const OVERLAY_OPACITY = 0.55;

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Stops for the blue -> green -> yellow -> red perceptual ramp, v in [0,255]. */
const RAMP_STOPS: ReadonlyArray<readonly [number, readonly [number, number, number]]> = [
  [0, [0.05, 0.1, 0.9]],
  [85, [0.1, 0.75, 0.2]],
  [170, [0.95, 0.85, 0.1]],
  [255, [0.95, 0.15, 0.1]],
];

/** Deterministic 0..255 -> RGB (0..1) heatmap ramp. Pure and exported for tests. */
export function rampColor(v: number): [number, number, number] {
  const value = Math.min(255, Math.max(0, v));
  const lastIndex = RAMP_STOPS.length - 1;
  for (let i = 0; i < lastIndex; i++) {
    const lo = RAMP_STOPS[i]!;
    const hi = RAMP_STOPS[i + 1]!;
    if (value <= hi[0] || i === lastIndex - 1) {
      const span = hi[0] - lo[0];
      const t = span === 0 ? 0 : clamp01((value - lo[0]) / span);
      return [
        lerp(lo[1][0], hi[1][0], t),
        lerp(lo[1][1], hi[1][1], t),
        lerp(lo[1][2], hi[1][2], t),
      ];
    }
  }
  const last = RAMP_STOPS[lastIndex]!;
  return [last[1][0], last[1][1], last[1][2]];
}

// ---------------------------------------------------------------------------
// 'power' / 'watered' coverage ramp (accent / dim danger)
// ---------------------------------------------------------------------------

function hexToRgb01(hex: number): [number, number, number] {
  return [((hex >> 16) & 0xff) / 255, ((hex >> 8) & 0xff) / 255, (hex & 0xff) / 255];
}

const COVERAGE_COVERED: readonly [number, number, number] = hexToRgb01(0x38b6e3); // accent
const COVERAGE_UNCOVERED_DIM_FACTOR = 0.55;
const COVERAGE_UNCOVERED: readonly [number, number, number] = (() => {
  const [r, g, b] = hexToRgb01(0xe5533f); // danger, dimmed
  return [
    r * COVERAGE_UNCOVERED_DIM_FACTOR,
    g * COVERAGE_UNCOVERED_DIM_FACTOR,
    b * COVERAGE_UNCOVERED_DIM_FACTOR,
  ];
})();

/**
 * Two-tone 0/1 coverage ramp: any nonzero byte reads as covered (accent),
 * zero as uncovered (dim danger red). Pure and exported for tests.
 */
export function coverageColor(value: number): [number, number, number] {
  return value > 0 ? [...COVERAGE_COVERED] : [...COVERAGE_UNCOVERED];
}

export type CoverageKind = 'power' | 'watered';

export class OverlayRenderer {
  private readonly mesh: THREE.Mesh;
  private readonly texture: THREE.DataTexture;
  private readonly textureData: Uint8Array;
  private active: LensId | null = null;
  private readonly coverageCache: Record<CoverageKind, Uint8Array> = {
    power: new Uint8Array(MAP_SIZE * MAP_SIZE),
    watered: new Uint8Array(MAP_SIZE * MAP_SIZE),
  };

  constructor(scene: THREE.Scene) {
    const mapMeters = MAP_SIZE * TILE_METERS;

    this.textureData = new Uint8Array(MAP_SIZE * MAP_SIZE * 4);
    const [r0, g0, b0] = rampColor(0);
    for (let i = 0; i < MAP_SIZE * MAP_SIZE; i++) {
      this.textureData[i * 4] = Math.round(r0 * 255);
      this.textureData[i * 4 + 1] = Math.round(g0 * 255);
      this.textureData[i * 4 + 2] = Math.round(b0 * 255);
      this.textureData[i * 4 + 3] = 255;
    }

    const texture = new THREE.DataTexture(
      this.textureData,
      MAP_SIZE,
      MAP_SIZE,
      THREE.RGBAFormat,
      THREE.UnsignedByteType,
    );
    texture.flipY = false;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = THREE.NoColorSpace;
    texture.needsUpdate = true;
    this.texture = texture;

    const geometry = new THREE.PlaneGeometry(mapMeters, mapMeters, 1, 1);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(mapMeters / 2, 0, mapMeters / 2);

    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: OVERLAY_OPACITY,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = OVERLAY_Y;
    mesh.visible = false;
    mesh.renderOrder = 10;
    scene.add(mesh);
    this.mesh = mesh;
  }

  /**
   * Shows/hides the overlay quad and selects which lens future
   * setFieldData()/setCoverage() calls apply to. Switching straight onto a
   * coverage lens repaints immediately from its cache (see class doc) since
   * coverage patches otherwise only arrive on change, not on a fixed cycle
   * like FieldId's requestField/'field' round trip.
   */
  setActive(lens: LensId | null): void {
    this.active = lens;
    // 'transit' and 'districts' are drawn by their own dedicated
    // terrain-conforming renderers (TransitRenderer / DistrictsRenderer),
    // not this scalar/coverage quad — so hide the quad for those two lenses.
    this.mesh.visible = lens !== null && !this.isDedicatedLens(lens);
    if (lens !== null && this.isCoverageKind(lens)) {
      this.paintCoverage(lens);
    }
  }

  /** Lenses handled by a dedicated renderer rather than this DataTexture quad. */
  private isDedicatedLens(lens: LensId): boolean {
    return lens === 'transit' || lens === 'districts';
  }

  /** Re-ramps `data` (MAP_SIZE² bytes) into the texture, only when `field` is the active one. */
  setFieldData(field: FieldId, data: Uint8Array): void {
    if (field !== this.active) return;
    const count = Math.min(data.length, MAP_SIZE * MAP_SIZE);
    for (let i = 0; i < count; i++) {
      const value = data[i] ?? 0;
      const [r, g, b] = rampColor(value);
      const base = i * 4;
      this.textureData[base] = Math.round(r * 255);
      this.textureData[base + 1] = Math.round(g * 255);
      this.textureData[base + 2] = Math.round(b * 255);
      this.textureData[base + 3] = 255;
    }
    this.texture.needsUpdate = true;
  }

  /**
   * Folds incoming coverage patches (SimSnapshot.power/.watered) into the
   * cached full-map 0/1 layer for `kind`, then re-ramps into the texture
   * only when `kind` is the active lens (mirrors setFieldData's active-only
   * gate). The cache write itself always happens, regardless of which lens
   * is active — cheap, and it's what lets setActive() repaint instantly.
   */
  setCoverage(kind: CoverageKind, patches: ZonePatch[]): void {
    const cache = this.coverageCache[kind];
    for (const patch of patches) {
      for (let dz = 0; dz < patch.h; dz++) {
        for (let dx = 0; dx < patch.w; dx++) {
          const x = patch.x + dx;
          const z = patch.z + dz;
          if (x < 0 || z < 0 || x >= MAP_SIZE || z >= MAP_SIZE) continue;
          cache[z * MAP_SIZE + x] = patch.data[dz * patch.w + dx] ?? 0;
        }
      }
    }
    if (kind === this.active) this.paintCoverage(kind);
  }

  private isCoverageKind(lens: LensId): lens is CoverageKind {
    return lens === 'power' || lens === 'watered';
  }

  private paintCoverage(kind: CoverageKind): void {
    const cache = this.coverageCache[kind];
    const count = MAP_SIZE * MAP_SIZE;
    for (let i = 0; i < count; i++) {
      const [r, g, b] = coverageColor(cache[i] ?? 0);
      const base = i * 4;
      this.textureData[base] = Math.round(r * 255);
      this.textureData[base + 1] = Math.round(g * 255);
      this.textureData[base + 2] = Math.round(b * 255);
      this.textureData[base + 3] = 255;
    }
    this.texture.needsUpdate = true;
  }
}
