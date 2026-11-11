import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MIN_INSTANCE_CAPACITY } from './groundquad';
import { PowerLineRenderer } from './powerlines';
import { CableOverlayRenderer, cableStrips, placedCableStrip } from './cables';
import { PIPE_STRIP_OFFSET_M, PIPE_STRIP_WIDTH_M, pipeStrips } from './pipes';
import { carriagewayHalfWidthOf, kerbWidthOf, presetProfileForTier } from '../shared/roadprofile';
import { RoadTier } from '../shared/types';
import { JUNCTION_BOX_M, TRANSFORMER_M } from './powerpoles';
import type { CableBox, PowerLay } from './powerpoles';
import { undergroundRoleOf } from './underground';

const flat = (): number => 0;

const box = (kind: CableBox['kind'], x: number, z: number): CableBox => ({
  kind,
  x,
  z,
  fx: 0,
  fz: 1,
});

const lay = (boxes: CableBox[]): PowerLay => ({ poles: [], spans: [], boxes });

const instanced = (scene: THREE.Scene): THREE.InstancedMesh[] =>
  scene.children.filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh);

describe('the boxes of a buried cable, drawn', () => {
  it('draws a box and its doors for each junction box and transformer, as instanced meshes', () => {
    const scene = new THREE.Scene();
    const lines = new PowerLineRenderer(scene, flat);
    lines.setSlot(0, lay([box('junction', 30, 30), box('transformer', 70, 30)]));
    lines.commit();
    expect(lines.boxCount()).toBe(2);
    // The body and the door pool: two meshes, each starting at the least capacity.
    const meshes = instanced(scene);
    expect(meshes).toHaveLength(2);
    for (const mesh of meshes) {
      expect(mesh.count).toBe(2);
      expect(mesh.instanceMatrix.count).toBe(MIN_INSTANCE_CAPACITY);
      const material = mesh.material as THREE.MeshLambertMaterial;
      expect(material.map).toBeNull();
      expect(material).not.toBeInstanceOf(THREE.ShaderMaterial);
    }
  });

  it('sizes the junction box 1.9 x 1.8 x 1.15 m and the transformer 1.0 x 0.9 x 0.8 m', () => {
    expect(JUNCTION_BOX_M).toEqual({ width: 1.9, depth: 1.8, height: 1.15 });
    expect(TRANSFORMER_M).toEqual({ width: 1.0, depth: 0.9, height: 0.8 });
    const scene = new THREE.Scene();
    const lines = new PowerLineRenderer(scene, flat);
    lines.setSlot(0, lay([box('junction', 30, 30), box('transformer', 70, 30)]));
    lines.commit();
    const body = instanced(scene)[0]!;
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    body.getMatrixAt(0, matrix);
    matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    expect(scale.x).toBeCloseTo(1.9);
    expect(scale.y).toBeCloseTo(1.15);
    expect(scale.z).toBeCloseTo(1.8);
    body.getMatrixAt(1, matrix);
    matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    expect([scale.x, scale.y, scale.z].map((v) => Math.round(v * 100) / 100)).toEqual([
      1, 0.8, 0.9,
    ]);
  });

  it('stands a box on its ground and reads it back', () => {
    const scene = new THREE.Scene();
    const lines = new PowerLineRenderer(scene, (x) => x * 0.01);
    lines.setSlot(0, lay([box('junction', 30, 30)]));
    lines.commit();
    expect(lines.boxPosition(0)).toEqual({ x: 30, y: 0.3, z: 30 });
    expect(lines.boxPosition(1)).toBeNull();
  });

  it('draws a guard up the side of a riser pole and marks its foot', () => {
    const scene = new THREE.Scene();
    const lines = new PowerLineRenderer(scene, flat);
    const riserLay: PowerLay = {
      poles: [
        {
          key: 1,
          kind: 'street',
          x: 20,
          z: 20,
          height: 10.4,
          arm: 9.5,
          armLength: 2.4,
          spread: 0.9,
          radius: 0.2,
          armX: 0,
          armZ: 1,
          guy: null,
          riser: { x: 1, z: 0 },
        },
        {
          key: 2,
          kind: 'street',
          x: 60,
          z: 20,
          height: 10.4,
          arm: 9.5,
          armLength: 2.4,
          spread: 0.9,
          radius: 0.2,
          armX: 0,
          armZ: 1,
          guy: null,
        },
      ],
      spans: [],
    };
    lines.setSlot(0, riserLay);
    lines.commit();
    expect(lines.guardCount()).toBe(1);
    expect(lines.footings()).toEqual([{ x: 20, z: 20 }]);
  });

  it('empties a chunk of its boxes when it is laid again without them', () => {
    const scene = new THREE.Scene();
    const lines = new PowerLineRenderer(scene, flat);
    lines.setSlot(0, lay([box('junction', 30, 30)]));
    lines.setSlot(1, lay([box('junction', 330, 30)]));
    lines.commit();
    const laid = lines.slotsLaid();
    lines.setSlot(1, null);
    lines.commit();
    expect(lines.slotsLaid()).toBe(laid + 1);
    expect(lines.boxCount()).toBe(1);
    expect(lines.slotKeys()).toEqual([0]);
  });
});

describe('the cable underground', () => {
  const build = (): { scene: THREE.Scene; overlay: CableOverlayRenderer } => {
    const scene = new THREE.Scene();
    return { scene, overlay: new CableOverlayRenderer(scene, flat) };
  };
  const meshOf = (scene: THREE.Scene): THREE.Mesh =>
    scene.children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh)!;

  it('draws a strip for each tile, joined to its neighbours, and nothing while the surface shows', () => {
    const { scene, overlay } = build();
    overlay.rebuild(
      [
        { x: 5, z: 5 },
        { x: 6, z: 5 },
      ],
      [],
    );
    expect(overlay.isVisible()).toBe(false);
    expect(meshOf(scene).visible).toBe(false);
    overlay.setVisible(true);
    expect(meshOf(scene).visible).toBe(true);
    // Each tile of a pair: a hub and its one arm, two triangles a strip.
    expect(overlay.triangleCount()).toBe(2 * 2 * 2);
    expect(overlay.counts()).toEqual({ tiles: 2, feet: 0 });
  });

  it('keeps the overlay visible across a rebuild, and hides it again', () => {
    const { overlay } = build();
    overlay.setVisible(true);
    overlay.rebuild([{ x: 5, z: 5 }], []);
    expect(overlay.isVisible()).toBe(true);
    overlay.setVisible(false);
    expect(overlay.isVisible()).toBe(false);
  });

  it('marks the foot of each box and riser, and wears a colour no pipe wears', () => {
    const { scene, overlay } = build();
    overlay.rebuild([{ x: 5, z: 5 }], [{ x: 100, z: 100 }]);
    expect(overlay.counts().feet).toBe(1);
    const colors = meshOf(scene).geometry.getAttribute('color');
    const first = new THREE.Color().setRGB(colors.getX(0), colors.getY(0), colors.getZ(0));
    // Not the water blue 0x38b6e3 nor the sewer brown 0x8a5a2b.
    expect(first.getHex()).not.toBe(new THREE.Color(0x38b6e3).getHex());
    expect(first.getHex()).not.toBe(new THREE.Color(0x8a5a2b).getHex());
    expect(first.r).toBeGreaterThan(first.b * 2);
  });

  it('is kept whole when the surface goes to glass, and has strips only for cable tiles', () => {
    const { scene, overlay } = build();
    expect(undergroundRoleOf(meshOf(scene))).toBe('keep');
    overlay.rebuild([], []);
    expect(overlay.triangleCount()).toBe(0);
  });

  it('lies under the footway, clear of the water and sewer strips and narrower than a pipe', () => {
    const profile = presetProfileForTier(RoadTier.TwoLane);
    const reach = carriagewayHalfWidthOf(profile) + kerbWidthOf(profile) / 2;
    for (const side of [1, -1]) {
      const [, z0, , z1] = placedCableStrip({ alongX: true, offset: reach * side });
      const pipes = pipeStrips({ east: true, west: true, south: false, north: false });
      // The water run and the sewer run, across the section (z), for the same street.
      for (const [, p0, , p1] of pipes) {
        const sewer = [p0 + 2 * PIPE_STRIP_OFFSET_M, p1 + 2 * PIPE_STRIP_OFFSET_M];
        for (const [a, b] of [[p0, p1], sewer]) expect(z1 <= a! || z0 >= b!).toBe(true);
      }
      expect(z1 - z0).toBeLessThan(PIPE_STRIP_WIDTH_M);
    }
  });

  it('joins a straight run in one strip, never a run of cross ticks', () => {
    expect(cableStrips({ east: true, west: true, south: false, north: false })).toHaveLength(3);
    expect(cableStrips({ east: false, west: false, south: false, north: false })).toHaveLength(2);
  });
});
