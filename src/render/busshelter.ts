/**
 * The bus shelter: one builder for the shelter a transit line draws at its
 * stop and the shelter the bus-stop ploppable's kit stands, so the two read
 * alike. Local frame: the long axis along X, the open front toward +Z, the
 * glazed back at -Z, local Y=0 the ground the posts stand on. Pure of the
 * scene; the geometry carries its colours as vertex colours.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** A 5 × 12 ft transit shelter: its plan, its roof's clear height and overhang, its posts and glazing, its 6 ft bench. */
export const BUS_SHELTER = {
  /** Along the kerb. */
  w: 3.66,
  /** Out from the kerb. */
  d: 1.52,
  /** Ground to the roof's underside. */
  clear: 2.29,
  roof: 0.08,
  overhang: 0.3,
  /** The posts' radius. */
  post: 0.06,
  /** The glazed back and end panels' thickness. */
  glass: 0.02,
  bench: { l: 1.83, d: 0.4, h: 0.45, slab: 0.05 },
} as const;

const POST_COLOR = 0x53585d;
/** The roof's grey and the glazing's blue-grey, which the raised tram station shares. */
export const SHELTER_ROOF_COLOR = 0x8a8f94;
export const SHELTER_GLASS_COLOR = 0x384d5c;
const BENCH_COLOR = 0x8a6a4a;

function painted(geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const c = new THREE.Color(hex);
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.deleteAttribute('uv');
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y0: number,
  z: number,
  hex: number,
): THREE.BufferGeometry {
  const geometry = new THREE.BoxGeometry(w, h, d);
  geometry.translate(x, y0 + h / 2, z);
  return painted(geometry, hex);
}

/** The shelter's parts merged into one geometry: four posts, the roof, the glazed back and ends, the bench. */
export function buildBusShelterGeometry(): THREE.BufferGeometry {
  const { w, d, clear, roof, overhang, post, glass, bench } = BUS_SHELTER;
  const parts: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const column = new THREE.CylinderGeometry(post, post, clear, 6);
      column.translate(sx * (w / 2 - post), clear / 2, sz * (d / 2 - post));
      parts.push(painted(column, POST_COLOR));
    }
  }
  parts.push(box(w + 2 * overhang, roof, d + 2 * overhang, 0, clear, 0, SHELTER_ROOF_COLOR));
  parts.push(box(w - 2 * post, clear, glass, 0, 0, -d / 2 + post + glass / 2, SHELTER_GLASS_COLOR));
  for (const sx of [-1, 1]) {
    parts.push(
      box(glass, clear, d - 2 * post, sx * (w / 2 - post - glass / 2), 0, 0, SHELTER_GLASS_COLOR),
    );
  }
  const benchZ = -d / 2 + post + glass + bench.d / 2;
  parts.push(box(bench.l, bench.slab, bench.d, 0, bench.h - bench.slab, benchZ, BENCH_COLOR));
  for (const sx of [-1, 1]) {
    parts.push(
      box(
        0.06,
        bench.h - bench.slab,
        bench.d * 0.8,
        sx * (bench.l / 2 - 0.1),
        0,
        benchZ,
        POST_COLOR,
      ),
    );
  }
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('busshelter: the shelter did not merge');
  return merged;
}
