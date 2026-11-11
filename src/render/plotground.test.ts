import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import catalogData from '../data/catalog.json';
import { BuildingInstancer } from './buildings';
import { LANE_Y_OFFSET, LOT_Y_OFFSET } from './lots';
import { PLINTH_TOP, PLOT_BAND_TOP, PLOT_YARD_TOP } from './plotground';
import { UTILITY_KIT_CATALOG_IDS, UtilityKitRenderer, cemeteryPlots } from './utilitykits';
import { BuildingState, type BuildingCatalogEntry, type BuildingDelta } from '../shared/types';

const CATALOG = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const flat = (): number => 0;
const EPS = 1e-6;

/** Level upward faces over this height are a prop's floor, a roof or a deck, not ground. */
const GROUND_MAX_TOP_M = 0.5;
/** How far over the band a thin surface laid on a yard would reach; a prop's floor, a ballast bed, stands higher than this. */
const SURFACE_REACH_M = 0.04;
const SURFACE_MIN_AREA_M2 = 100;

/**
 * The ground layers a scene lays on level ground at height 0: every upward,
 * level triangle of every drawn part (each instance of an instanced mesh), its
 * area summed by height to the millimetre. A yard, lawn, court, pond or plate is
 * a layer of many square metres; a wall, a roof, a car or a prop is not (it is
 * too high or too small), and a line of paint is too small to count.
 */
function groundLayers(scene: THREE.Scene): Map<number, number> {
  const layers = new Map<number, number>();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  const local = new THREE.Matrix4();
  scene.updateMatrixWorld(true);
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    const position = geometry.getAttribute('position');
    const index = geometry.index;
    const triangles = (index?.count ?? position.count) / 3;
    const copies = object instanceof THREE.InstancedMesh ? object.count : 1;
    for (let i = 0; i < copies; i++) {
      matrix.copy(object.matrixWorld);
      if (object instanceof THREE.InstancedMesh) {
        object.getMatrixAt(i, local);
        matrix.multiply(local);
      }
      for (let t = 0; t < triangles; t++) {
        const at = (k: number): number => index?.getX(t * 3 + k) ?? t * 3 + k;
        a.fromBufferAttribute(position, at(0)).applyMatrix4(matrix);
        b.fromBufferAttribute(position, at(1)).applyMatrix4(matrix);
        c.fromBufferAttribute(position, at(2)).applyMatrix4(matrix);
        if (Math.abs(a.y - b.y) > 1e-4 || Math.abs(a.y - c.y) > 1e-4) continue;
        b.sub(a);
        c.sub(a);
        const normalY = b.z * c.x - b.x * c.z;
        if (normalY <= 0 || a.y >= GROUND_MAX_TOP_M) continue;
        const key = Math.round(a.y * 1000);
        layers.set(key, (layers.get(key) ?? 0) + normalY / 2);
      }
    }
  });
  return layers;
}

describe('[R-render-034] a plot is flush with the ground round it', () => {
  it('keeps the plinth top under the yard top, inside the lot-surface band', () => {
    expect(PLINTH_TOP).toBeGreaterThanOrEqual(LOT_Y_OFFSET);
    expect(PLINTH_TOP).toBeLessThan(PLOT_YARD_TOP);
    expect(PLOT_YARD_TOP).toBeLessThanOrEqual(PLOT_BAND_TOP);
    expect(PLOT_BAND_TOP).toBeCloseTo(LANE_Y_OFFSET, 9);
  });

  const kits = UTILITY_KIT_CATALOG_IDS.map((id) => CATALOG.find((e) => e.id === id)!);

  for (const entry of kits) {
    it(`lays no ground above the band under ${entry.id}, and its plinth lies under it`, () => {
      const delta: BuildingDelta = {
        added: [
          {
            id: 1,
            catalogId: entry.id,
            x: 10,
            z: 10,
            rotation: 0,
            level: entry.level ?? 1,
            state: BuildingState.Active,
            problems: 0,
          },
        ],
        updated: [],
        removed: [],
      };
      const plinthScene = new THREE.Scene();
      new BuildingInstancer(plinthScene, CATALOG, flat, new Set(UTILITY_KIT_CATALOG_IDS)).apply(
        delta,
      );
      const plinthLayers = groundLayers(plinthScene);
      // A draped entry's pad sinks to the lowest ground under it, under its lawn.
      for (const y of plinthLayers.keys()) {
        expect(y / 1000, entry.id).toBeLessThanOrEqual(PLINTH_TOP + EPS);
      }

      const kitScene = new THREE.Scene();
      const kitRenderer = new UtilityKitRenderer(kitScene, flat, CATALOG);
      kitRenderer.apply(delta);
      if (entry.deathCare?.plots !== undefined) {
        kitRenderer.setInterments([{ id: 1, used: cemeteryPlots(entry) }]);
      }
      const layers = [...groundLayers(kitScene)].map(([key, area]) => ({ top: key / 1000, area }));
      // The ground itself is the widest layer there is: a yard, a lawn, a plate.
      const widest = layers.reduce((a, b) => (b.area > a.area ? b : a), { top: 0, area: 0 });
      expect(
        widest.top,
        `${entry.id}: its widest layer, ${widest.area.toFixed(0)} m²`,
      ).toBeLessThanOrEqual(PLOT_BAND_TOP + EPS);
      // A patch, a walk or a court laid on it belongs to the band, not just above
      // it. Paint (a pitch's lines, a helipad's mark) may stand over the band, and
      // a pitch's lines add up to a few tens of square metres: only a layer wider
      // than that is a surface.
      const proud = layers
        .filter(
          (l) =>
            l.area > SURFACE_MIN_AREA_M2 &&
            l.top > PLOT_BAND_TOP + EPS &&
            l.top <= PLOT_BAND_TOP + SURFACE_REACH_M,
        )
        .map((l) => `${l.top} m: ${l.area.toFixed(0)} m²`);
      expect(proud, entry.id).toEqual([]);
    });
  }
});
