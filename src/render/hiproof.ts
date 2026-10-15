/**
 * The hipped roof the farmhouse and the apartment walk-ups share: one unit
 * geometry, scaled per instance to the plan and the rise it covers.
 */
import * as THREE from 'three';

/** Flat-shaded triangles from a list of [x, y, z] corners, three per face. */
export function faceted(
  corners: ReadonlyArray<readonly [number, number, number]>,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(corners.flat(), 3));
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * A hipped roof with its ridge along X, spanning x and z over [-0.5, 0.5] and
 * rising from y = 0 at the eaves to 1 at the ridge: four pitches, the two ends
 * hipped back to a ridge `ridge` of the length long (a 9 × 8 m plan over a 1 m
 * ridge is 1/9; a square plan meets at a point, 0). No underside: a body
 * stands beneath it.
 */
export function hipRoofGeometry(ridge: number): THREE.BufferGeometry {
  const r = ridge / 2;
  return faceted([
    [-0.5, 0, 0.5],
    [0.5, 0, 0.5],
    [r, 1, 0],
    [-0.5, 0, 0.5],
    [r, 1, 0],
    [-r, 1, 0],
    [-r, 1, 0],
    [r, 1, 0],
    [0.5, 0, -0.5],
    [-r, 1, 0],
    [0.5, 0, -0.5],
    [-0.5, 0, -0.5],
    [0.5, 0, 0.5],
    [0.5, 0, -0.5],
    [r, 1, 0],
    [-0.5, 0, -0.5],
    [-0.5, 0, 0.5],
    [-r, 1, 0],
  ]);
}
