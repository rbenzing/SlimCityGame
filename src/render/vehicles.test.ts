import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  buildVehicleGeometry,
  laneOffset,
  lerpVehicle,
  paletteColorForSlot,
  paletteIndexForSlot,
  variantIndexForSlot,
  VehicleRenderer,
  LANE_OFFSET_METERS,
  VEHICLE_NIGHT_LIGHT_THRESHOLD,
  VEHICLE_PALETTE,
  VEHICLE_REGION,
} from './vehicles';
import { MAX_VEHICLES, VEHICLE_STRIDE, INACTIVE_VEHICLE_X, VehicleKind } from '../shared/types';

const deg = (d: number): number => (d * Math.PI) / 180;
const flatHeightAt = (): number => 0;

describe('lerpVehicle', () => {
  it('lerps position linearly and heading directly when there is no wraparound', () => {
    const prev = [0, 0, 0, 10, VehicleKind.Car];
    const curr = [10, 20, 0, 10, VehicleKind.Car];
    const result = lerpVehicle(prev, curr, 0.5);
    expect(result.x).toBeCloseTo(5, 6);
    expect(result.z).toBeCloseTo(10, 6);
    expect(result.heading).toBeCloseTo(0, 6);
  });

  it('snaps to curr (no lerp) when curr is the inactive marker', () => {
    const prev = [5, 5, deg(10), 10, VehicleKind.Car];
    const curr = [INACTIVE_VEHICLE_X, 0, 0, 0, VehicleKind.Car];
    const result = lerpVehicle(prev, curr, 0.5);
    expect(result.x).toBe(INACTIVE_VEHICLE_X);
  });

  it('snaps to curr (no lerp from the inactive marker) when prev is inactive but curr is active', () => {
    const prev = [INACTIVE_VEHICLE_X, 0, 0, 0, VehicleKind.Car];
    const curr = [50, 60, deg(90), 10, VehicleKind.Car];
    const result = lerpVehicle(prev, curr, 0.5);
    expect(result.x).toBeCloseTo(50, 6);
    expect(result.z).toBeCloseTo(60, 6);
    expect(result.heading).toBeCloseTo(deg(90), 6);
  });

  it('snaps to curr on a slot handoff (an implausibly large prev->curr jump) instead of sliding across the map', () => {
    // The cosmetic pool can hand one slot to a brand-new vehicle elsewhere, so
    // prev/curr are two unrelated routes far apart (>2 tiles / 32 m).
    const prev = [0, 0, deg(0), 10, VehicleKind.Car];
    const curr = [300, 300, deg(90), 12, VehicleKind.Truck];
    const result = lerpVehicle(prev, curr, 0.5);
    expect(result.x).toBeCloseTo(300, 6);
    expect(result.z).toBeCloseTo(300, 6);
    expect(result.heading).toBeCloseTo(deg(90), 6);
  });

  it('still lerps a normal in-route step (jump under the handoff threshold)', () => {
    const prev = [100, 100, 0, 10, VehicleKind.Car];
    const curr = [104, 100, 0, 10, VehicleKind.Car]; // 4 m — well under 2 tiles
    const result = lerpVehicle(prev, curr, 0.5);
    expect(result.x).toBeCloseTo(102, 6);
    expect(result.z).toBeCloseTo(100, 6);
  });

  it('takes the shortest angular arc across the +-180 degree wraparound', () => {
    const prev = [0, 0, deg(170), 10, VehicleKind.Car];
    const curr = [0, 0, deg(-170), 10, VehicleKind.Car];
    // Shortest path from 170deg to -170deg(=190deg) is +20deg, through 180, not -340deg.
    const result = lerpVehicle(prev, curr, 0.5);
    expect(result.heading).toBeCloseTo(deg(180), 6);
  });

  it('wraps correctly from a negative heading toward a positive one', () => {
    const prev = [0, 0, deg(-179), 10, VehicleKind.Car];
    const curr = [0, 0, deg(179), 10, VehicleKind.Car];
    const result = lerpVehicle(prev, curr, 0.5);
    // Shortest arc is -2deg, halfway is -180deg == 180deg.
    const normalized = Math.abs(result.heading);
    expect(normalized).toBeCloseTo(deg(180), 5);
  });

  it('throws if a slot array is too short to read x/z/heading', () => {
    expect(() => lerpVehicle([1, 2], [1, 2, 3, 4, 5], 0.5)).toThrow();
    expect(() => lerpVehicle([1, 2, 3, 4, 5], [1, 2], 0.5)).toThrow();
  });
});

describe('laneOffset (§6.20 #1 drive-on-the-right perpendicular lane offset)', () => {
  it('is perpendicular to the travel direction for arbitrary headings', () => {
    for (const heading of [0, Math.PI / 6, Math.PI / 2, 2, Math.PI, -Math.PI / 3, 5]) {
      const travel = { x: Math.sin(heading), z: Math.cos(heading) };
      const offset = laneOffset(heading);
      const dot = travel.x * offset.dx + travel.z * offset.dz;
      expect(dot).toBeCloseTo(0, 9);
    }
  });

  it('has magnitude exactly LANE_OFFSET_METERS regardless of heading', () => {
    for (const heading of [0, 1, 2, 3, 4, 5, 6]) {
      const { dx, dz } = laneOffset(heading);
      expect(Math.hypot(dx, dz)).toBeCloseTo(LANE_OFFSET_METERS, 9);
    }
  });

  it('sits well within even the narrowest road tier carriageway (Alley half-width 3m)', () => {
    // roadsmesh.ts: ALLEY_HALF_WIDTH_FRACTION = 6 / (2 * TILE_METERS) -> 3m half-width.
    expect(LANE_OFFSET_METERS).toBeLessThan(3);
  });

  it('puts opposing travel directions on exactly opposite sides of the centerline', () => {
    const north = laneOffset(0);
    const south = laneOffset(Math.PI);
    expect(south.dx).toBeCloseTo(-north.dx, 9);
    expect(south.dz).toBeCloseTo(-north.dz, 9);

    const east = laneOffset(Math.PI / 2);
    const west = laneOffset(-Math.PI / 2);
    expect(west.dx).toBeCloseTo(-east.dx, 9);
    expect(west.dz).toBeCloseTo(-east.dz, 9);
  });

  it('renders two vehicles traveling opposite directions through the same point on opposite sides (VehicleRenderer integration)', () => {
    const scene = new THREE.Scene();
    const renderer = new VehicleRenderer(scene, flatHeightAt);
    const buf = makeBuffer({
      0: [64, 64, 0, 5, VehicleKind.Car], // heading 0
      1: [64, 64, Math.PI, 5, VehicleKind.Car], // heading PI (opposite)
    });
    renderer.setBuffer(buf);
    renderer.update(0);

    const mesh = meshForKind(scene, VehicleKind.Car);
    const a = decomposeAt(mesh, 0);
    const b = decomposeAt(mesh, 1);

    expect(a.pos.x).not.toBeCloseTo(b.pos.x, 5);
    // Opposite offsets around the same shared (64, 64) center.
    expect(a.pos.x - 64).toBeCloseTo(-(b.pos.x - 64), 5);
    expect(a.pos.z - 64).toBeCloseTo(-(b.pos.z - 64), 5);
  });
});

function makeBuffer(
  overrides: Record<number, [number, number, number, number, number]>,
): Float32Array {
  const buf = new Float32Array(MAX_VEHICLES * VEHICLE_STRIDE);
  for (let slot = 0; slot < MAX_VEHICLES; slot++) {
    buf[slot * VEHICLE_STRIDE] = INACTIVE_VEHICLE_X;
  }
  for (const key of Object.keys(overrides)) {
    const slot = Number(key);
    const vals = overrides[slot];
    if (!vals) continue;
    const base = slot * VEHICLE_STRIDE;
    for (let i = 0; i < VEHICLE_STRIDE; i++) buf[base + i] = vals[i] as number;
  }
  return buf;
}

function decomposeAt(mesh: THREE.InstancedMesh, slot: number) {
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  mesh.getMatrixAt(slot, m);
  m.decompose(pos, quat, scl);
  return { pos, quat, scl };
}

/** Finds the kind-tagged InstancedMesh (one per VehicleKind). */
function meshForKind(scene: THREE.Scene, kind: number): THREE.InstancedMesh {
  const mesh = scene.children.find(
    (c) => (c as THREE.InstancedMesh).isInstancedMesh === true && c.userData.vehicleKind === kind,
  );
  if (!mesh) throw new Error(`expected a kind-tagged InstancedMesh for kind ${kind}`);
  return mesh as THREE.InstancedMesh;
}

/**
 * Whether a slot's raw matrix is the zero-scale "hidden" transform. Reading
 * the raw elements (rather than Matrix4.decompose) matters here: three's
 * decompose() special-cases a zero determinant and reports scale (1,1,1)
 * because rotation/scale can't be split out of a singular matrix.
 */
function isHiddenAt(mesh: THREE.InstancedMesh, slot: number): boolean {
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(slot, m);
  const e = m.elements;
  return e[0] === 0 && e[5] === 0 && e[10] === 0;
}

describe('VehicleRenderer', () => {
  it('adds a hidden (zero-scale) InstancedMesh per kind up front and tolerates update() with no buffer yet', () => {
    const scene = new THREE.Scene();
    const renderer = new VehicleRenderer(scene, flatHeightAt);
    expect(() => renderer.update(0.5)).not.toThrow();

    const carMesh = meshForKind(scene, VehicleKind.Car);
    const truckMesh = meshForKind(scene, VehicleKind.Truck);
    const busMesh = meshForKind(scene, VehicleKind.Bus);
    expect(carMesh.count).toBe(MAX_VEHICLES);
    expect(truckMesh.count).toBe(MAX_VEHICLES);
    expect(busMesh.count).toBe(MAX_VEHICLES);
    expect(isHiddenAt(carMesh, 0)).toBe(true);
    expect(isHiddenAt(truckMesh, 0)).toBe(true);
    expect(isHiddenAt(busMesh, 0)).toBe(true);
  });

  it('places an active vehicle using its kind size, at heightAt(x,z) + halfHeight, shifted onto the right-hand lane (§6.20 #1)', () => {
    const scene = new THREE.Scene();
    const renderer = new VehicleRenderer(scene, flatHeightAt);
    const buf = makeBuffer({ 0: [32, 48, 0, 5, VehicleKind.Car] });
    renderer.setBuffer(buf);
    renderer.update(0);

    const mesh = meshForKind(scene, VehicleKind.Car);
    const { pos, scl } = decomposeAt(mesh, 0);
    const offset = laneOffset(0);
    expect(pos.x).toBeCloseTo(32 + offset.dx, 5);
    expect(pos.z).toBeCloseTo(48 + offset.dz, 5);
    expect(pos.y).toBeCloseTo(scl.y / 2, 5); // sits on flat ground (heightAt = 0)
    expect(scl.x).toBeGreaterThan(0);
    expect(scl.y).toBeGreaterThan(0);
    expect(scl.z).toBeGreaterThan(0);
  });

  it('hides inactive slots via a zero-scale matrix while other slots stay active', () => {
    const scene = new THREE.Scene();
    const renderer = new VehicleRenderer(scene, flatHeightAt);
    const buf = makeBuffer({ 0: [32, 48, 0, 5, VehicleKind.Car] });
    renderer.setBuffer(buf);
    renderer.update(0);

    const mesh = meshForKind(scene, VehicleKind.Car);
    expect(isHiddenAt(mesh, 1)).toBe(true);
    expect(isHiddenAt(mesh, 0)).toBe(false);
  });

  it('interpolates position between the previous and current buffer by alpha', () => {
    const scene = new THREE.Scene();
    const renderer = new VehicleRenderer(scene, flatHeightAt);
    renderer.setBuffer(makeBuffer({ 0: [0, 0, 0, 5, VehicleKind.Car] }));
    renderer.update(0);
    // 12 m step: a realistic per-snapshot move (2 ticks at highway speed) that
    // stays under the slot-handoff teleport-snap threshold, so this exercises
    // the interpolation path, not the snap-on-teleport guard.
    renderer.setBuffer(makeBuffer({ 0: [12, 0, 0, 5, VehicleKind.Car] }));
    renderer.update(0.5);

    const mesh = meshForKind(scene, VehicleKind.Car);
    const { pos } = decomposeAt(mesh, 0);
    const offset = laneOffset(0); // heading is 0 in both frames
    expect(pos.x).toBeCloseTo(6 + offset.dx, 5);
  });

  it('renders each vehicle kind via its own kind-tagged InstancedMesh (§6.8: one InstancedMesh per kind), sized per kind, and hides a slot in every kind-mesh that is not its current kind', () => {
    const scene = new THREE.Scene();
    const renderer = new VehicleRenderer(scene, flatHeightAt);
    const buf = makeBuffer({
      0: [0, 0, 0, 5, VehicleKind.Car],
      1: [50, 0, 0, 5, VehicleKind.Bus],
    });
    renderer.setBuffer(buf);
    renderer.update(0);

    const carMesh = meshForKind(scene, VehicleKind.Car);
    const busMesh = meshForKind(scene, VehicleKind.Bus);
    expect(carMesh).not.toBe(busMesh);

    const car = decomposeAt(carMesh, 0);
    const bus = decomposeAt(busMesh, 1);
    expect(bus.scl.z).toBeGreaterThan(car.scl.z); // a bus is longer than a car

    // Slot 1 is a bus this frame, so it must be hidden in the car mesh (and
    // vice versa) -- kind-routing must not leak a stale visible instance into
    // the "wrong" kind's InstancedMesh.
    expect(isHiddenAt(carMesh, 1)).toBe(true);
    expect(isHiddenAt(busMesh, 0)).toBe(true);
  });

  it('keeps a slot color stable across frames while the same vehicle stays active, and re-rolls the palette color when a slot goes inactive then active again (reuse)', () => {
    const scene = new THREE.Scene();
    const renderer = new VehicleRenderer(scene, flatHeightAt);

    renderer.setBuffer(makeBuffer({ 0: [10, 10, 0, 5, VehicleKind.Car] }));
    renderer.update(0);
    const mesh = meshForKind(scene, VehicleKind.Car);
    const firstColor = new THREE.Color();
    mesh.getColorAt(0, firstColor);

    // Same vehicle, still active on the next snapshot -- must not flicker.
    renderer.setBuffer(makeBuffer({ 0: [11, 10, 0.01, 5, VehicleKind.Car] }));
    renderer.update(0);
    const stillColor = new THREE.Color();
    mesh.getColorAt(0, stillColor);
    expect(stillColor.equals(firstColor)).toBe(true);

    // Slot goes inactive (vehicle despawns)...
    renderer.setBuffer(makeBuffer({}));
    renderer.update(0);

    // ...then gets reused for a "new" vehicle -- inactive->active transition
    // must re-roll the palette color.
    renderer.setBuffer(makeBuffer({ 0: [12, 10, 0, 5, VehicleKind.Car] }));
    renderer.update(0);
    const rerolledColor = new THREE.Color();
    mesh.getColorAt(0, rerolledColor);
    expect(rerolledColor.equals(firstColor)).toBe(false);
  });

  describe('update(alphaToNext) speed scaling (§6.20 #4)', () => {
    it('interpolates proportionally for every alpha in [0,1] with no internal clamping or capping', () => {
      const scene = new THREE.Scene();
      const renderer = new VehicleRenderer(scene, flatHeightAt);
      renderer.setBuffer(makeBuffer({ 0: [0, 0, 0, 5, VehicleKind.Car] }));
      renderer.update(0);
      // 12 m step: a realistic per-snapshot move that stays under the
      // slot-handoff teleport-snap threshold (a 100 m jump would be a pool
      // handoff, not motion, and correctly snaps instead of lerping).
      renderer.setBuffer(makeBuffer({ 0: [12, 0, 0, 5, VehicleKind.Car] }));

      const mesh = meshForKind(scene, VehicleKind.Car);
      const offset = laneOffset(0);
      // A higher playback speed simply means more, closer-together alpha
      // samples arrive per real second (driven by the caller) -- not a
      // different mapping here. Sweeping alpha densely must always track
      // the same straight line between prev (x=0) and curr (x=12).
      for (const alpha of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
        renderer.update(alpha);
        const { pos } = decomposeAt(mesh, 0);
        expect(pos.x).toBeCloseTo(12 * alpha + offset.dx, 5);
      }
    });
  });

  describe('setNightFactor', () => {
    it('defaults to 0, clamps into [0,1], and is readable back for tests/introspection', () => {
      const scene = new THREE.Scene();
      const renderer = new VehicleRenderer(scene, flatHeightAt);
      expect(renderer.nightFactor()).toBe(0);

      renderer.setNightFactor(0.6);
      expect(renderer.nightFactor()).toBeCloseTo(0.6, 9);

      renderer.setNightFactor(-4);
      expect(renderer.nightFactor()).toBe(0);

      renderer.setNightFactor(9);
      expect(renderer.nightFactor()).toBe(1);
    });
  });
});

describe('variantIndexForSlot (§6.8 silhouette variants, deterministic by slot-index hash)', () => {
  it('is deterministic: repeated calls for the same slot+kind return the same variant', () => {
    for (let i = 0; i < 5; i++) {
      expect(variantIndexForSlot(17, VehicleKind.Car)).toBe(
        variantIndexForSlot(17, VehicleKind.Car),
      );
    }
  });

  it('stays within the valid variant count for each kind (Car: sedan/wagon/hatch=3, Truck: box/pickup=2, Bus: 1)', () => {
    for (let slot = 0; slot < 64; slot++) {
      const car = variantIndexForSlot(slot, VehicleKind.Car);
      const truck = variantIndexForSlot(slot, VehicleKind.Truck);
      const bus = variantIndexForSlot(slot, VehicleKind.Bus);
      expect(car).toBeGreaterThanOrEqual(0);
      expect(car).toBeLessThan(3);
      expect(truck).toBeGreaterThanOrEqual(0);
      expect(truck).toBeLessThan(2);
      expect(bus).toBe(0);
    }
  });

  it('varies across slots so the fleet reads as mixed silhouettes, not a single repeated shape', () => {
    const seen = new Set<number>();
    for (let slot = 0; slot < 50; slot++) seen.add(variantIndexForSlot(slot, VehicleKind.Car));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('paletteIndexForSlot / paletteColorForSlot (§6.8 saturated ~10-color palette, by slot hash)', () => {
  it('VEHICLE_PALETTE has the curated ~10 saturated colors from the spec list', () => {
    expect(VEHICLE_PALETTE.length).toBe(10);
    for (const [r, g, b] of VEHICLE_PALETTE) {
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic for a given (slot, generation) pair', () => {
    expect(paletteIndexForSlot(5, 0)).toBe(paletteIndexForSlot(5, 0));
    expect(paletteColorForSlot(5, 0)).toEqual(paletteColorForSlot(5, 0));
  });

  it('returns a color that is exactly one of VEHICLE_PALETTE (fixed set, no arbitrary hues)', () => {
    const color = paletteColorForSlot(9, 0);
    const isInPalette = VEHICLE_PALETTE.some(
      (p) => p[0] === color[0] && p[1] === color[1] && p[2] === color[2],
    );
    expect(isInPalette).toBe(true);
  });

  it('re-rolls to a different palette entry every time generation advances by one (slot reuse)', () => {
    const idx0 = paletteIndexForSlot(3, 0);
    const idx1 = paletteIndexForSlot(3, 1);
    const idx2 = paletteIndexForSlot(3, 2);
    expect(idx1).not.toBe(idx0);
    expect(idx2).not.toBe(idx1);
    expect(paletteColorForSlot(3, 1)).not.toEqual(paletteColorForSlot(3, 0));
  });

  it('varies across slots at the same generation (not a constant color for the whole fleet)', () => {
    const seen = new Set<string>();
    for (let slot = 0; slot < 20; slot++) seen.add(paletteColorForSlot(slot, 0).join(','));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('buildVehicleGeometry (§6.8 multi-part merged geometry + region mask)', () => {
  it('tags every vertex with a region code, and body-region vertices are baked white (tint-ready) while fixed-region vertices are not', () => {
    const geo = buildVehicleGeometry(VehicleKind.Car);
    const position = geo.getAttribute('position');
    const region = geo.getAttribute('vehicleRegion');
    const color = geo.getAttribute('color');
    expect(region).toBeDefined();
    expect(color).toBeDefined();
    expect(region.count).toBe(position.count);
    expect(color.count).toBe(position.count);

    let bodyCount = 0;
    let fixedCount = 0;
    let headlightCount = 0;
    let taillightCount = 0;

    for (let i = 0; i < region.count; i++) {
      const code = region.getX(i);
      const c: [number, number, number] = [color.getX(i), color.getY(i), color.getZ(i)];
      const isWhite = c[0] === 1 && c[1] === 1 && c[2] === 1;

      if (code === VEHICLE_REGION.BODY) {
        bodyCount++;
        // instanceColor must be free to tint these vertices -- baked white so
        // (instanceColor * white) reproduces the instance color exactly.
        expect(isWhite).toBe(true);
      } else if (code === VEHICLE_REGION.FIXED) {
        fixedCount++;
        // Fixed parts (cabin/window mass, wheels) must NOT be white, or an
        // all-white geometry would trivially "pass" the body-only check above.
        expect(isWhite).toBe(false);
      } else if (code === VEHICLE_REGION.HEADLIGHT) {
        headlightCount++;
      } else if (code === VEHICLE_REGION.TAILLIGHT) {
        taillightCount++;
      } else {
        throw new Error(`unexpected vehicleRegion code ${code}`);
      }
    }

    expect(bodyCount).toBeGreaterThan(0);
    expect(fixedCount).toBeGreaterThan(0);
    expect(headlightCount).toBeGreaterThan(0);
    expect(taillightCount).toBeGreaterThan(0);
  });

  it('builds a distinct geometry (multi-part: body + cabin/window mass + wheels + lights) for every kind', () => {
    for (const kind of [VehicleKind.Car, VehicleKind.Truck, VehicleKind.Bus]) {
      const geo = buildVehicleGeometry(kind);
      expect(geo.getAttribute('position').count).toBeGreaterThan(0);
      expect(geo.getAttribute('vehicleRegion')).toBeDefined();
      expect(geo.getAttribute('color')).toBeDefined();
    }
  });

  it('gives the bus a near-full-length window band and the truck a small, front-biased cab (distinct silhouettes, §6.8)', () => {
    function fixedUpperPartZExtent(geo: THREE.BufferGeometry): { minZ: number; maxZ: number } {
      const pos = geo.getAttribute('position');
      const region = geo.getAttribute('vehicleRegion');
      let minZ = Infinity;
      let maxZ = -Infinity;
      // Restrict to region===FIXED vertices ABOVE the chassis (y>0): this
      // isolates the cabin/window mass from the wheels, which are also FIXED
      // but sit low (near y=-0.5) under the body.
      for (let i = 0; i < pos.count; i++) {
        if (region.getX(i) === VEHICLE_REGION.FIXED && pos.getY(i) > 0) {
          minZ = Math.min(minZ, pos.getZ(i));
          maxZ = Math.max(maxZ, pos.getZ(i));
        }
      }
      return { minZ, maxZ };
    }

    const bus = fixedUpperPartZExtent(buildVehicleGeometry(VehicleKind.Bus));
    const truck = fixedUpperPartZExtent(buildVehicleGeometry(VehicleKind.Truck));
    const busSpan = bus.maxZ - bus.minZ;
    const truckSpan = truck.maxZ - truck.minZ;

    expect(busSpan).toBeGreaterThan(truckSpan * 2); // bus window band runs the length; truck cab is small
    expect(truck.minZ).toBeGreaterThan(0.1); // truck cab sits toward the front, not centered/rear
  });
});

describe('VEHICLE_NIGHT_LIGHT_THRESHOLD (§6.8 headlight/taillight toggle)', () => {
  it('is a hard-toggle threshold strictly between 0 and 1 (neither always-on nor always-off)', () => {
    expect(VEHICLE_NIGHT_LIGHT_THRESHOLD).toBeGreaterThan(0);
    expect(VEHICLE_NIGHT_LIGHT_THRESHOLD).toBeLessThan(1);
  });
});

describe('VehicleRenderer frustum culling (wave 6)', () => {
  it('disables frustum culling on every vehicle mesh (instances span the map and move every frame)', () => {
    const scene = new THREE.Scene();
    new VehicleRenderer(scene, flatHeightAt);
    const meshes = scene.children.filter(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    );
    expect(meshes.length).toBeGreaterThan(0);
    for (const mesh of meshes) expect(mesh.frustumCulled).toBe(false);
  });
});
