/**
 * CPU-side building picking + the 24-bit id&lt;-&gt;RGB codec that will back a
 * future GPU id-buffer picking pass. The codec is exercised
 * now (not dead code) via `buildIdColorArray`, which `BuildingInstancer`
 * uses to (re)populate each bucket's per-instance id-color data, and via
 * `IdPicker.pickBuilding`, which decodes that data back and cross-checks it
 * against the instancer's own slot bookkeeping before trusting a pick.
 */
import * as THREE from 'three';
import type { BuildingInstancer } from './buildings';

/** Highest id representable in a 24-bit RGB triple (2^24 - 1). */
export const MAX_ENCODABLE_ID = 0xff_ff_ff;

/**
 * Encodes a non-negative integer id as an RGB byte triple (0..255 each),
 * low byte first. Pure and total over its documented domain; throws outside
 * the 24-bit range so a bad id fails loudly instead of silently wrapping.
 */
export function encodeId(id: number): [number, number, number] {
  if (!Number.isInteger(id) || id < 0 || id > MAX_ENCODABLE_ID) {
    throw new RangeError(`encodeId: id ${id} is out of the encodable range 0..${MAX_ENCODABLE_ID}`);
  }
  const r = id & 0xff;
  const g = (id >>> 8) & 0xff;
  const b = (id >>> 16) & 0xff;
  return [r, g, b];
}

/** Inverse of {@link encodeId}. Each component is masked to a byte defensively. */
export function decodeId(rgb: [number, number, number]): number {
  const [r, g, b] = rgb;
  return (r & 0xff) | ((g & 0xff) << 8) | ((b & 0xff) << 16);
}

/**
 * Builds a flat, normalized (0..1 per channel) RGB array from an ordered
 * list of building ids, one triple per instance slot (id 0 -> black). Used
 * to bulk-(re)populate a bucket's id-color data in one pass, e.g. right
 * after a capacity grow copies the rest of the per-slot data.
 */
export function buildIdColorArray(instances: readonly number[]): Float32Array {
  const out = new Float32Array(instances.length * 3);
  for (let i = 0; i < instances.length; i++) {
    const id = instances[i] ?? 0;
    const [r, g, b] = encodeId(id);
    out[i * 3] = r / 255;
    out[i * 3 + 1] = g / 255;
    out[i * 3 + 2] = b / 255;
  }
  return out;
}

export class IdPicker {
  encodeId(id: number): [number, number, number] {
    return encodeId(id);
  }

  decodeId(rgb: [number, number, number]): number {
    return decodeId(rgb);
  }

  /**
   * CPU picking: raycasts against every InstancedMesh the instancer
   * currently owns (`BuildingInstancer.getPickables`), resolves the
   * nearest hit's instanceId to a building id via the instancer's slot
   * bookkeeping, then cross-checks that id against the same instance's
   * independently-written id-color attribute (decoded) before returning
   * it, so the two bookkeeping paths are proven consistent on every pick.
   */
  pickBuilding(raycaster: THREE.Raycaster, instancer: BuildingInstancer): number | null {
    const pickables = instancer.getPickables();
    if (pickables.length === 0) return null;

    const meshes = pickables.map((p) => p.mesh);
    const hits = raycaster.intersectObjects<THREE.InstancedMesh>(meshes, false);
    const hit = hits[0];
    if (!hit || hit.instanceId === undefined) return null;

    const pickable = pickables.find((p) => p.mesh === hit.object);
    if (!pickable) return null;

    const id = instancer.buildingIdAt({
      catalogId: pickable.catalogId,
      instanceIndex: hit.instanceId,
    });
    if (id === null) return null;

    const idColor = instancer.idColorAt(pickable.catalogId, hit.instanceId);
    if (!idColor) return null;

    return this.decodeId(idColor) === id ? id : null;
  }
}
