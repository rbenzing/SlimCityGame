/**
 * The tram's overhead wire: the heights and spacings every tram support is
 * laid to, and the thin merged geometry of the wires hung between them. A
 * wire is a thin box per segment, never a line a pixel wide; the poles and
 * their arms stay instanced where the street furniture draws them.
 */
import * as THREE from 'three';

/** A 19 ft contact wire over the rail head. */
export const TRAM_WIRE_HEIGHT_M = 5.8;
/** The wire's supports stand no further apart than the old 120 ft limit. */
export const TRAM_SUPPORT_MAX_M = 36.6;
/** A span wire between two kerb poles, and a bracket arm, sit at this height. */
export const TRAM_SUPPORT_HEIGHT_M = 6.0;
const WIRE_THICKNESS_M = 0.04;
const SPAN_THICKNESS_M = 0.05;

export interface WirePoint {
  x: number;
  y: number;
  z: number;
}

/** A straight piece of wire from `a` to `b`. */
export interface WireSegment {
  a: WirePoint;
  b: WirePoint;
  thickness: number;
}

/** The contact wire along a polyline of plan points, `height` over the ground at each. */
export function contactWireSegments(
  run: readonly { x: number; z: number }[],
  height: (x: number, z: number) => number,
): WireSegment[] {
  const out: WireSegment[] = [];
  for (let i = 1; i < run.length; i++) {
    const p = run[i - 1]!;
    const q = run[i]!;
    out.push({
      a: { x: p.x, y: height(p.x, p.z) + TRAM_WIRE_HEIGHT_M, z: p.z },
      b: { x: q.x, y: height(q.x, q.z) + TRAM_WIRE_HEIGHT_M, z: q.z },
      thickness: WIRE_THICKNESS_M,
    });
  }
  return out;
}

/** A span wire between two kerb poles, at the support height over each foot. */
export function spanWireSegment(
  a: { x: number; z: number },
  b: { x: number; z: number },
  height: (x: number, z: number) => number,
): WireSegment {
  return {
    a: { x: a.x, y: height(a.x, a.z) + TRAM_SUPPORT_HEIGHT_M, z: a.z },
    b: { x: b.x, y: height(b.x, b.z) + TRAM_SUPPORT_HEIGHT_M, z: b.z },
    thickness: SPAN_THICKNESS_M,
  };
}

/** A short dropper from a span wire down to the contact wire hung from it. */
export function dropperSegment(at: { x: number; z: number }, ground: number): WireSegment {
  return {
    a: { x: at.x, y: ground + TRAM_WIRE_HEIGHT_M, z: at.z },
    b: { x: at.x, y: ground + TRAM_SUPPORT_HEIGHT_M, z: at.z },
    thickness: WIRE_THICKNESS_M,
  };
}

const _east = new THREE.Vector3(1, 0, 0);
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _matrix = new THREE.Matrix4();
const _scale = new THREE.Vector3();

/** Every segment as one merged geometry (position, normal, index); empty when there are none. */
export function buildWireGeometry(segments: readonly WireSegment[]): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(1, 1, 1);
  const unitPositions = box.getAttribute('position') as THREE.BufferAttribute;
  const unitNormals = box.getAttribute('normal') as THREE.BufferAttribute;
  const unitIndex = box.index!;
  const vertices = unitPositions.count;
  const positions = new Float32Array(segments.length * vertices * 3);
  const normals = new Float32Array(segments.length * vertices * 3);
  const indices: number[] = [];
  const point = new THREE.Vector3();
  const normal = new THREE.Vector3();
  segments.forEach((s, k) => {
    _from.set(s.a.x, s.a.y, s.a.z);
    _to.set(s.b.x, s.b.y, s.b.z);
    const length = _from.distanceTo(_to);
    if (length < 1e-6) return;
    _quat.setFromUnitVectors(_east, _to.clone().sub(_from).divideScalar(length));
    _matrix.compose(
      _from.clone().add(_to).multiplyScalar(0.5),
      _quat,
      _scale.set(length, s.thickness, s.thickness),
    );
    for (let i = 0; i < vertices; i++) {
      point.fromBufferAttribute(unitPositions, i).applyMatrix4(_matrix);
      normal.fromBufferAttribute(unitNormals, i).applyQuaternion(_quat);
      positions.set([point.x, point.y, point.z], (k * vertices + i) * 3);
      normals.set([normal.x, normal.y, normal.z], (k * vertices + i) * 3);
    }
    for (let i = 0; i < unitIndex.count; i++) indices.push(unitIndex.getX(i) + k * vertices);
  });
  box.dispose();
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setIndex(indices);
  return merged;
}
