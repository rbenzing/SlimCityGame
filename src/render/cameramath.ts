/**
 * Pure RTS camera math. No three.js imports — the render
 * thread wraps these in camera.ts, but every function here is plain-number
 * math so it can be unit tested without a GPU/DOM.
 *
 * Convention: the camera orbits `state.targetX/targetZ` at `state.distance`,
 * rotated by `state.yaw` (radians, around the world Y axis) and tilted by
 * `state.pitch` (radians above the horizon). The vector from target to
 * camera, projected onto the ground plane, points in direction
 * `(sin(yaw), cos(yaw))` — see {@link cameraPosition}. All pan/rotate helpers
 * are defined consistently with that convention.
 */

import type { CameraState } from '../shared/types';
import {
  CAMERA_MAX_DISTANCE,
  CAMERA_MAX_PITCH,
  CAMERA_MIN_DISTANCE,
  CAMERA_MIN_PITCH,
  MAP_SIZE,
  TILE_METERS,
} from '../shared/constants';

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/**
 * Spherical camera placement around `state.targetX/targetZ`.
 * `y` is the camera's height ABOVE the target's own ground level (i.e. it
 * assumes the target sits at y=0); callers that follow terrain (CameraRig)
 * add `heightAt(targetX, targetZ)` on top of this result.
 */
export function cameraPosition(state: CameraState): { x: number; y: number; z: number } {
  const horizontal = state.distance * Math.cos(state.pitch);
  const y = state.distance * Math.sin(state.pitch);
  const x = state.targetX + horizontal * Math.sin(state.yaw);
  const z = state.targetZ + horizontal * Math.cos(state.yaw);
  return { x, y, z };
}

/**
 * Zoom-to-cursor: shrinks/grows `distance` (clamped) and shifts the target
 * toward/away from `cursorGround` so the cursor's ground point stays fixed.
 *
 * This is exact (not an approximation) under the idealized ground-plane
 * "projection" `projectedOffset(state, worldPoint) = (worldPoint - target) /
 * distance` — see cameramath.test.ts. Because the target shift uses the
 * SAME post-clamp ratio (`actualFactor`) that distance changed by, that
 * offset is invariant before/after the call regardless of clamping:
 *
 *   (cursorGround - targetNew) / distanceNew
 *     = (cursorGround - targetOld) * actualFactor / (distanceOld * actualFactor)
 *     = (cursorGround - targetOld) / distanceOld
 */
export function zoomToCursor(
  state: CameraState,
  zoomFactor: number,
  cursorGround: { x: number; z: number },
): CameraState {
  const rawDistance = state.distance * zoomFactor;
  const distance = clamp(rawDistance, CAMERA_MIN_DISTANCE, CAMERA_MAX_DISTANCE);
  const actualFactor = distance / state.distance;
  const targetX = state.targetX + (cursorGround.x - state.targetX) * (1 - actualFactor);
  const targetZ = state.targetZ + (cursorGround.z - state.targetZ) * (1 - actualFactor);
  return { ...state, distance, targetX, targetZ };
}

/**
 * Screen-relative pan: `dxPx` positive = rightward screen motion, `dyPx`
 * positive = downward screen motion (e.g. from a drag delta, or a synthetic
 * WASD/edge-scroll intent scaled by dt). Scaled by `distance` (so pan speed
 * matches the current zoom level) and by `viewportH` (so a full-height drag
 * covers a consistent world distance). The basis vectors rotate with yaw.
 */
export function panDelta(
  state: CameraState,
  dxPx: number,
  dyPx: number,
  viewportH: number,
): { dx: number; dz: number } {
  const scale = state.distance / Math.max(1, viewportH);
  // Ground-projected camera basis, consistent with cameraPosition's convention.
  const rightX = Math.cos(state.yaw);
  const rightZ = -Math.sin(state.yaw);
  const forwardX = -Math.sin(state.yaw);
  const forwardZ = -Math.cos(state.yaw);
  const dx = (rightX * dxPx - forwardX * dyPx) * scale;
  const dz = (rightZ * dxPx - forwardZ * dyPx) * scale;
  return { dx, dz };
}

/**
 * Critically-damped-style exponential smoothing step:
 * moves `current` toward `goal` at time-constant `1/lambda`, framerate-
 * independent because it integrates the exact decay `gap(t) = gap(0) *
 * e^{-lambda*t}` rather than a per-frame multiply — i.e. `dampTowards` called
 * once with `dt = a + b` gives (up to float rounding) the same result as
 * calling it twice in a row with `dt = a` then `dt = b`, so the visual result
 * doesn't depend on the caller's frame rate. Always moves monotonically
 * toward `goal` and never overshoots (no oscillation), matching a critically
 * damped (not underdamped) spring.
 *
 * Extremes are exact, not just approximate:
 * - `lambda <= 0` (zero stiffness): returns `current` unchanged — the goal
 *   never pulls at all.
 * - `lambda === Infinity` (infinite stiffness): returns `goal` exactly — an
 *   instant snap.
 * - `dt <= 0`: returns `current` unchanged — no time has elapsed to move in.
 */
export function dampTowards(current: number, goal: number, lambda: number, dt: number): number {
  if (dt <= 0) return current;
  if (lambda <= 0) return current;
  if (!Number.isFinite(lambda)) return goal;
  const decay = Math.exp(-lambda * dt);
  return goal + (current - goal) * decay;
}

/** Clamp pitch/distance/target into valid ranges. yaw passes through unchanged. */
export function clampState(state: CameraState): CameraState {
  const mapMeters = MAP_SIZE * TILE_METERS;
  return {
    targetX: clamp(state.targetX, 0, mapMeters),
    targetZ: clamp(state.targetZ, 0, mapMeters),
    distance: clamp(state.distance, CAMERA_MIN_DISTANCE, CAMERA_MAX_DISTANCE),
    yaw: state.yaw,
    pitch: clamp(state.pitch, CAMERA_MIN_PITCH, CAMERA_MAX_PITCH),
  };
}
