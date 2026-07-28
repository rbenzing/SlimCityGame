import { describe, expect, it } from 'vitest';
import type { CameraState } from '../shared/types';
import {
  CAMERA_MAX_DISTANCE,
  CAMERA_MAX_PITCH,
  CAMERA_MIN_DISTANCE,
  CAMERA_MIN_PITCH,
  MAP_SIZE,
  TILE_METERS,
} from '../shared/constants';
import { cameraPosition, clampState, dampTowards, panDelta, zoomToCursor } from './cameramath';

const baseState = (overrides: Partial<CameraState> = {}): CameraState => ({
  targetX: 1000,
  targetZ: 1000,
  distance: 400,
  yaw: 0.4,
  pitch: 0.7,
  ...overrides,
});

/**
 * The idealized ground-plane "projection" used by the invariance test:
 * an orthographic-style screen offset of a world point relative to the
 * current target, scaled by distance. zoomToCursor is designed to keep
 * this exactly fixed for the cursor's ground point (see cameramath.ts docs).
 */
const projectedOffset = (
  state: CameraState,
  world: { x: number; z: number },
): { x: number; z: number } => ({
  x: (world.x - state.targetX) / state.distance,
  z: (world.z - state.targetZ) / state.distance,
});

describe('cameraPosition', () => {
  it('places the camera above the target at pitch = PI/2', () => {
    const state = baseState({ pitch: Math.PI / 2, distance: 500, yaw: 0 });
    const pos = cameraPosition(state);
    expect(pos.x).toBeCloseTo(state.targetX, 6);
    expect(pos.z).toBeCloseTo(state.targetZ, 6);
    expect(pos.y).toBeCloseTo(500, 6);
  });

  it('places the camera at the horizon (y=0) at pitch = 0', () => {
    const state = baseState({ pitch: 0, distance: 300, yaw: 1.1 });
    const pos = cameraPosition(state);
    expect(pos.y).toBeCloseTo(0, 6);
    const horizontalDist = Math.hypot(pos.x - state.targetX, pos.z - state.targetZ);
    expect(horizontalDist).toBeCloseTo(300, 6);
  });

  it('rotates the horizontal offset by yaw', () => {
    const distance = 200;
    const pitch = 0.5;
    const a = cameraPosition(baseState({ yaw: 0, distance, pitch }));
    const b = cameraPosition(baseState({ yaw: Math.PI / 2, distance, pitch }));
    // Same horizontal radius, but swapped/negated axis due to the 90 degree turn.
    const radiusA = Math.hypot(a.x - 1000, a.z - 1000);
    const radiusB = Math.hypot(b.x - 1000, b.z - 1000);
    expect(radiusA).toBeCloseTo(radiusB, 6);
    expect(a.y).toBeCloseTo(b.y, 6);
  });
});

describe('zoomToCursor', () => {
  it('shrinks distance when zoomFactor < 1 and grows it when > 1', () => {
    const state = baseState({ distance: 400 });
    const cursor = { x: 1200, z: 900 };
    const zoomedIn = zoomToCursor(state, 0.5, cursor);
    const zoomedOut = zoomToCursor(state, 2, cursor);
    expect(zoomedIn.distance).toBeCloseTo(200, 6);
    expect(zoomedOut.distance).toBeCloseTo(800, 6);
  });

  it('clamps the resulting distance to [CAMERA_MIN_DISTANCE, CAMERA_MAX_DISTANCE]', () => {
    const state = baseState({ distance: CAMERA_MIN_DISTANCE * 1.1 });
    const tooClose = zoomToCursor(state, 0.01, { x: 0, z: 0 });
    expect(tooClose.distance).toBeCloseTo(CAMERA_MIN_DISTANCE, 6);

    const farState = baseState({ distance: CAMERA_MAX_DISTANCE * 0.9 });
    const tooFar = zoomToCursor(farState, 100, { x: 0, z: 0 });
    expect(tooFar.distance).toBeCloseTo(CAMERA_MAX_DISTANCE, 6);
  });

  it('keeps the cursor ground point invariant under the idealized ground projection, even when clamped', () => {
    const cases: Array<{
      state: CameraState;
      zoomFactor: number;
      cursor: { x: number; z: number };
    }> = [
      { state: baseState({ distance: 400 }), zoomFactor: 0.5, cursor: { x: 1400, z: 500 } },
      { state: baseState({ distance: 400 }), zoomFactor: 2.3, cursor: { x: 200, z: 1800 } },
      // Clamped cases: requested factor is not what actually applies.
      {
        state: baseState({ distance: CAMERA_MIN_DISTANCE * 1.05 }),
        zoomFactor: 0.1,
        cursor: { x: 3000, z: 200 },
      },
      {
        state: baseState({ distance: CAMERA_MAX_DISTANCE * 0.95 }),
        zoomFactor: 50,
        cursor: { x: -500, z: -500 },
      },
    ];

    for (const { state, zoomFactor, cursor } of cases) {
      const before = projectedOffset(state, cursor);
      const after = zoomToCursor(state, zoomFactor, cursor);
      const afterOffset = projectedOffset(after, cursor);
      expect(afterOffset.x).toBeCloseTo(before.x, 9);
      expect(afterOffset.z).toBeCloseTo(before.z, 9);
    }
  });

  it('leaves yaw and pitch untouched', () => {
    const state = baseState({ yaw: 1.23, pitch: 0.55 });
    const result = zoomToCursor(state, 1.5, { x: 0, z: 0 });
    expect(result.yaw).toBe(state.yaw);
    expect(result.pitch).toBe(state.pitch);
  });
});

describe('panDelta', () => {
  it('rotates the pan direction with yaw', () => {
    const state = baseState({ distance: 500 });
    const viewportH = 800;

    const yaws = [0, Math.PI / 6, Math.PI / 2, 2.1, -1.4];
    for (const yaw of yaws) {
      const s = { ...state, yaw };
      const result = panDelta(s, 37, -19, viewportH);
      const baseline = panDelta({ ...state, yaw: 0 }, 37, -19, viewportH);

      const angleBaseline = Math.atan2(baseline.dz, baseline.dx);
      const angleRotated = Math.atan2(result.dz, result.dx);
      // The implementation's right/forward basis rotates by -yaw (see cameramath.ts);
      // the resulting pan vector should rotate by the same amount, and its magnitude
      // should be preserved.
      const expectedAngle = angleBaseline - yaw;
      const angleDiff = Math.atan2(
        Math.sin(angleRotated - expectedAngle),
        Math.cos(angleRotated - expectedAngle),
      );
      expect(angleDiff).toBeCloseTo(0, 6);

      const magBaseline = Math.hypot(baseline.dx, baseline.dz);
      const magRotated = Math.hypot(result.dx, result.dz);
      expect(magRotated).toBeCloseTo(magBaseline, 6);
    }
  });

  it('scales with distance', () => {
    const near = panDelta(baseState({ distance: 100, yaw: 0 }), 10, 0, 500);
    const far = panDelta(baseState({ distance: 1000, yaw: 0 }), 10, 0, 500);
    expect(Math.hypot(far.dx, far.dz)).toBeCloseTo(Math.hypot(near.dx, near.dz) * 10, 6);
  });

  it('scales inversely with viewport height', () => {
    const small = panDelta(baseState({ distance: 500, yaw: 0 }), 10, 0, 400);
    const large = panDelta(baseState({ distance: 500, yaw: 0 }), 10, 0, 800);
    expect(Math.hypot(small.dx, small.dz)).toBeCloseTo(Math.hypot(large.dx, large.dz) * 2, 6);
  });

  it('produces zero delta for zero input', () => {
    const result = panDelta(baseState(), 0, 0, 800);
    expect(result.dx).toBeCloseTo(0, 9);
    expect(result.dz).toBeCloseTo(0, 9);
  });
});

describe('dampTowards (UI-SPEC §6.18 #4)', () => {
  it('moves current strictly toward goal without overshoot, converging over repeated steps', () => {
    let current = 0;
    const goal = 100;
    let prevGap = Math.abs(goal - current);
    for (let i = 0; i < 60; i++) {
      current = dampTowards(current, goal, 8, 1 / 60);
      const gap = Math.abs(goal - current);
      // Monotonic progress toward goal: gap shrinks every step, never grows,
      // never crosses past goal (critically damped, no oscillation).
      expect(gap).toBeLessThan(prevGap);
      expect(gap).toBeGreaterThanOrEqual(0);
      prevGap = gap;
    }
    expect(current).toBeCloseTo(goal, 1);
  });

  it('also converges monotonically approaching from above', () => {
    let current = 100;
    const goal = -50;
    let prevGap = Math.abs(goal - current);
    for (let i = 0; i < 60; i++) {
      current = dampTowards(current, goal, 5, 1 / 60);
      const gap = Math.abs(goal - current);
      expect(gap).toBeLessThan(prevGap);
      prevGap = gap;
    }
  });

  it('is framerate-independent: one big step matches two smaller steps summing to the same dt', () => {
    const current = 10;
    const goal = 250;
    const lambda = 6;
    const oneStep = dampTowards(current, goal, lambda, 0.5);
    const twoStep = dampTowards(dampTowards(current, goal, lambda, 0.2), goal, lambda, 0.3);
    expect(twoStep).toBeCloseTo(oneStep, 9);

    // And a finer subdivision of the same total dt agrees too.
    let fine = current;
    for (let i = 0; i < 10; i++) fine = dampTowards(fine, goal, lambda, 0.05);
    expect(fine).toBeCloseTo(oneStep, 6);
  });

  it('is exact at lambda <= 0: current is frozen (goal never pulls)', () => {
    expect(dampTowards(42, 999, 0, 1 / 60)).toBe(42);
    expect(dampTowards(42, 999, -5, 1 / 60)).toBe(42);
  });

  it('is exact at lambda = Infinity: instant snap to goal', () => {
    expect(dampTowards(42, 999, Infinity, 1 / 60)).toBe(999);
    expect(dampTowards(-5, 0.001, Infinity, 16)).toBe(0.001);
  });

  it('does not move when dt <= 0, regardless of lambda', () => {
    expect(dampTowards(10, 500, 8, 0)).toBe(10);
    expect(dampTowards(10, 500, 8, -1)).toBe(10);
  });

  it('returns goal unchanged when current already equals goal', () => {
    expect(dampTowards(77, 77, 8, 1 / 60)).toBe(77);
  });

  it('moves faster (covers more of the gap) with a larger lambda over the same dt', () => {
    const slow = dampTowards(0, 100, 2, 1 / 60);
    const fast = dampTowards(0, 100, 20, 1 / 60);
    expect(Math.abs(100 - fast)).toBeLessThan(Math.abs(100 - slow));
  });
});

describe('clampState', () => {
  const mapMeters = MAP_SIZE * TILE_METERS;

  it('clamps distance into [CAMERA_MIN_DISTANCE, CAMERA_MAX_DISTANCE]', () => {
    expect(clampState(baseState({ distance: -50 })).distance).toBe(CAMERA_MIN_DISTANCE);
    expect(clampState(baseState({ distance: CAMERA_MAX_DISTANCE * 10 })).distance).toBe(
      CAMERA_MAX_DISTANCE,
    );
    const mid = CAMERA_MIN_DISTANCE + (CAMERA_MAX_DISTANCE - CAMERA_MIN_DISTANCE) / 2;
    expect(clampState(baseState({ distance: mid })).distance).toBeCloseTo(mid, 9);
  });

  it('clamps pitch into [CAMERA_MIN_PITCH, CAMERA_MAX_PITCH]', () => {
    expect(clampState(baseState({ pitch: -10 })).pitch).toBe(CAMERA_MIN_PITCH);
    expect(clampState(baseState({ pitch: 10 })).pitch).toBe(CAMERA_MAX_PITCH);
  });

  it('clamps target into map bounds [0, MAP_SIZE*TILE_METERS]', () => {
    const clampedNeg = clampState(baseState({ targetX: -500, targetZ: -1 }));
    expect(clampedNeg.targetX).toBe(0);
    expect(clampedNeg.targetZ).toBe(0);

    const clampedOver = clampState(baseState({ targetX: mapMeters + 500, targetZ: mapMeters + 1 }));
    expect(clampedOver.targetX).toBe(mapMeters);
    expect(clampedOver.targetZ).toBe(mapMeters);
  });

  it('leaves in-bounds values and yaw untouched', () => {
    const state = baseState({ yaw: -3.7, distance: 500, pitch: 0.8, targetX: 500, targetZ: 700 });
    const result = clampState(state);
    expect(result).toEqual(state);
  });
});
