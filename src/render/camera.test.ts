// @vitest-environment jsdom
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CAMERA_MAX_DISTANCE,
  CAMERA_MAX_PITCH,
  CAMERA_MIN_DISTANCE,
  CAMERA_MIN_PITCH,
  MAP_SIZE,
  TILE_METERS,
} from '../shared/constants';
import { cameraPosition } from './cameramath';
import { CameraRig } from './camera';

// Most of CameraRig's DOM event wiring (drag-rotate, wheel-zoom, WASD) needs
// a real `window`/pointer events and is exercised manually/in-app; only the
// pure math (cameramath.test.ts) and the parts reachable
// without a DOM are unit tested in the `describe('CameraRig', ...)` block
// below. The edge-scroll/pointer-exit guard DOES get full
// attach()/dispatchEvent coverage in the second describe block further down,
// since jsdom is a real enough DOM for that specific bug (pointermove
// delivery stopping) to be reproduced and asserted against.

const makeCamera = (): THREE.PerspectiveCamera =>
  new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 1_000_000);

describe('CameraRig', () => {
  it('positions the camera at the default state immediately on construction', () => {
    const camera = makeCamera();
    const rig = new CameraRig(camera, () => 0);
    const expected = cameraPosition(rig.state);
    expect(camera.position.x).toBeCloseTo(expected.x, 5);
    expect(camera.position.y).toBeCloseTo(expected.y, 5);
    expect(camera.position.z).toBeCloseTo(expected.z, 5);
  });

  it('starts centered on the map with distance/pitch within the documented bounds', () => {
    const rig = new CameraRig(makeCamera(), () => 0);
    expect(rig.state.targetX).toBeCloseTo((MAP_SIZE * TILE_METERS) / 2, 5);
    expect(rig.state.targetZ).toBeCloseTo((MAP_SIZE * TILE_METERS) / 2, 5);
    expect(rig.state.distance).toBeGreaterThanOrEqual(CAMERA_MIN_DISTANCE);
    expect(rig.state.distance).toBeLessThanOrEqual(CAMERA_MAX_DISTANCE);
    expect(rig.state.pitch).toBeGreaterThanOrEqual(CAMERA_MIN_PITCH);
    expect(rig.state.pitch).toBeLessThanOrEqual(CAMERA_MAX_PITCH);
  });

  it('lifts the camera by heightAt(target) in addition to the spherical offset', () => {
    const camera = makeCamera();
    const rig = new CameraRig(camera, () => 250);
    rig.update(16);
    const base = cameraPosition(rig.state);
    expect(camera.position.y).toBeCloseTo(base.y + 250, 4);
  });

  it('reflects a direct external state assignment on the next update()', () => {
    const camera = makeCamera();
    const rig = new CameraRig(camera, () => 0);
    rig.state = { targetX: 500, targetZ: 700, distance: 300, yaw: 1.2, pitch: 0.9 };
    rig.update(16);
    const expected = cameraPosition(rig.state);
    expect(camera.position.x).toBeCloseTo(expected.x, 4);
    expect(camera.position.y).toBeCloseTo(expected.y, 4);
    expect(camera.position.z).toBeCloseTo(expected.z, 4);
  });

  it('clamps an out-of-bounds external state assignment on update()', () => {
    const rig = new CameraRig(makeCamera(), () => 0);
    rig.state = { targetX: -99_999, targetZ: 99_999_999, distance: 999_999, yaw: 0, pitch: 99 };
    rig.update(16);
    expect(rig.state.targetX).toBe(0);
    expect(rig.state.targetZ).toBe(MAP_SIZE * TILE_METERS);
    expect(rig.state.distance).toBe(CAMERA_MAX_DISTANCE);
    expect(rig.state.pitch).toBe(CAMERA_MAX_PITCH);
  });

  it('setEnabled(false) freezes the camera against further state/update changes', () => {
    const camera = makeCamera();
    const rig = new CameraRig(camera, () => 0);
    rig.update(16);
    const before = camera.position.clone();

    rig.setEnabled(false);
    rig.state = { ...rig.state, targetX: rig.state.targetX + 500 };
    rig.update(16);

    expect(camera.position.equals(before)).toBe(true);
  });

  it('setEnabled(true) resumes applying updates', () => {
    const camera = makeCamera();
    const rig = new CameraRig(camera, () => 0);
    rig.setEnabled(false);
    rig.update(16);
    const frozen = camera.position.clone();

    rig.setEnabled(true);
    rig.state = { ...rig.state, yaw: rig.state.yaw + 1 };
    rig.update(16);

    expect(camera.position.equals(frozen)).toBe(false);
  });

  it('detach() before any attach() is a harmless no-op', () => {
    const rig = new CameraRig(makeCamera(), () => 0);
    expect(() => rig.detach()).not.toThrow();
  });

  it('orients the camera to look toward the (height-lifted) target', () => {
    const camera = makeCamera();
    const rig = new CameraRig(camera, () => 42);
    rig.update(16);

    const target = new THREE.Vector3(rig.state.targetX, 42, rig.state.targetZ);
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    const toTarget = target.clone().sub(camera.position).normalize();

    expect(forward.dot(toTarget)).toBeGreaterThan(0.99);
  });
});

describe('CameraRig edge-scroll pointer-exit guard (UI-SPEC §6.17)', () => {
  // jsdom performs no layout, so the real getBoundingClientRect() would
  // always report a zero-size rect; stub it with a fixed, realistic
  // viewport so the rect-relative pointer math in camera.ts has real
  // numbers to work with.
  const VIEWPORT = { left: 0, top: 0, width: 800, height: 600 };

  function stubRect(target: HTMLElement): void {
    const rect = {
      left: VIEWPORT.left,
      top: VIEWPORT.top,
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      right: VIEWPORT.left + VIEWPORT.width,
      bottom: VIEWPORT.top + VIEWPORT.height,
      x: VIEWPORT.left,
      y: VIEWPORT.top,
      toJSON: () => ({}),
    };
    target.getBoundingClientRect = () => rect as DOMRect;
  }

  // Comfortably inside the EDGE_PX(8) activation band on the left edge,
  // vertically centered so only the left-edge condition ever fires.
  const EDGE_X = 2;
  const EDGE_Y = VIEWPORT.height / 2;

  function movePointerTo(x: number, y: number): void {
    window.dispatchEvent(
      new PointerEvent('pointermove', { clientX: VIEWPORT.left + x, clientY: VIEWPORT.top + y }),
    );
  }

  // Registry for afterEach cleanup only — individual tests use the `rig`/
  // `el` returned by setup() directly, never these.
  let activeRig: CameraRig | null = null;
  let activeEl: HTMLDivElement | null = null;

  function setup(): { rig: CameraRig; camera: THREE.PerspectiveCamera; el: HTMLDivElement } {
    const camera = makeCamera();
    const rig = new CameraRig(camera, () => 0);
    const el = document.createElement('div');
    stubRect(el);
    document.body.appendChild(el);
    rig.attach(el);
    activeRig = rig;
    activeEl = el;
    return { rig, camera, el };
  }

  afterEach(() => {
    activeRig?.detach();
    activeEl?.remove();
    activeRig = null;
    activeEl = null;
    vi.restoreAllMocks();
  });

  it('pans toward the edge once a pointermove lands inside the edge band', () => {
    const { rig } = setup();
    const targetX0 = rig.state.targetX;

    movePointerTo(EDGE_X, EDGE_Y);
    rig.update(16);

    // EDGE_X sits on the LEFT edge, so the pan must be toward decreasing X.
    expect(rig.state.targetX).toBeLessThan(targetX0);
  });

  /**
   * Shared assertion for all three pointer-exit triggers: an edge-band
   * pointermove starts a pan; `leave` (dispatched on whichever target the
   * trigger under test uses) must stop any FURTHER edge-scroll contribution
   * from that point on. Residual velocity is still allowed to coast and
   * decay (inertia keeps working) — the bug this guards against is
   * a fresh edge-scroll contribution being added every frame forever, which
   * would make each frame's delta grow (or hold steady), never shrink.
   */
  function expectStopsPanningAfter(leave: (el: HTMLElement) => void): void {
    const { rig, el } = setup();
    const targetX0 = rig.state.targetX;

    movePointerTo(EDGE_X, EDGE_Y);
    rig.update(16);
    const targetX1 = rig.state.targetX;
    const panDelta = targetX1 - targetX0;
    expect(panDelta).toBeLessThan(0); // sanity: the initial pan really happened

    leave(el);

    rig.update(16);
    const targetX2 = rig.state.targetX;
    const delta2 = targetX2 - targetX1;
    // Still coasting in the same direction (inertia keeps working)...
    expect(delta2).not.toBe(0);
    expect(Math.sign(delta2)).toBe(Math.sign(panDelta));
    // ...but strictly decaying: no fresh edge-scroll addition landed.
    expect(Math.abs(delta2)).toBeLessThan(Math.abs(panDelta));

    rig.update(16);
    const targetX3 = rig.state.targetX;
    const delta3 = targetX3 - targetX2;
    expect(Math.abs(delta3)).toBeLessThan(Math.abs(delta2));
  }

  it('stops contributing new edge-scroll on the element pointerleave (decaying inertia only)', () => {
    expectStopsPanningAfter((el) => el.dispatchEvent(new Event('pointerleave')));
  });

  it('stops contributing new edge-scroll on window blur (decaying inertia only)', () => {
    expectStopsPanningAfter(() => window.dispatchEvent(new Event('blur')));
  });

  it('stops contributing new edge-scroll on document mouseleave (decaying inertia only)', () => {
    expectStopsPanningAfter(() => document.dispatchEvent(new Event('mouseleave')));
  });

  it('re-enables edge-scroll on the next pointermove that lands inside the viewport', () => {
    const { rig, el } = setup();

    movePointerTo(EDGE_X, EDGE_Y);
    rig.update(16);
    const targetX1 = rig.state.targetX;

    el.dispatchEvent(new Event('pointerleave'));
    rig.update(16);
    const targetX2 = rig.state.targetX;
    const parkedDelta = Math.abs(targetX2 - targetX1);

    movePointerTo(EDGE_X, EDGE_Y);
    rig.update(16);
    const targetX3 = rig.state.targetX;
    const reenabledDelta = Math.abs(targetX3 - targetX2);

    // Pure decay (0.88^n) is monotonically decreasing; the only way this
    // frame's delta can be LARGER than the previous one is a fresh
    // edge-scroll contribution, proving the pointermove re-armed it.
    expect(reenabledDelta).toBeGreaterThan(parkedDelta);
  });

  it('keeps keyboard pan (and inertia) working while the pointer is parked outside the viewport', () => {
    const { rig, el } = setup();

    movePointerTo(EDGE_X, EDGE_Y);
    rig.update(16);
    el.dispatchEvent(new Event('pointerleave'));

    const targetX0 = rig.state.targetX;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyD' }));
    rig.update(16);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyD' }));

    // KeyD pans toward +X; keyboard input must be unaffected by the guard.
    expect(rig.state.targetX).toBeGreaterThan(targetX0);
  });

  it('drops all edge-scroll tracking on detach(): none of the guard events pan afterward', () => {
    const { rig, el, camera } = setup();
    rig.detach();
    const before = camera.position.clone();
    const targetX0 = rig.state.targetX;

    movePointerTo(EDGE_X, EDGE_Y);
    el.dispatchEvent(new Event('pointerleave'));
    window.dispatchEvent(new Event('blur'));
    document.dispatchEvent(new Event('mouseleave'));
    rig.update(16);
    rig.update(16);
    rig.update(16);

    expect(rig.state.targetX).toBe(targetX0);
    expect(camera.position.equals(before)).toBe(true);
  });

  it('attach()/detach() add and remove the pointer-exit listeners symmetrically', () => {
    const camera = makeCamera();
    const rig = new CameraRig(camera, () => 0);
    const el = document.createElement('div');
    document.body.appendChild(el);
    activeRig = rig;
    activeEl = el;

    const elAdd = vi.spyOn(el, 'addEventListener');
    const elRemove = vi.spyOn(el, 'removeEventListener');
    const winAdd = vi.spyOn(window, 'addEventListener');
    const winRemove = vi.spyOn(window, 'removeEventListener');
    const docAdd = vi.spyOn(document, 'addEventListener');
    const docRemove = vi.spyOn(document, 'removeEventListener');

    rig.attach(el);
    rig.detach();

    const names = (spy: { mock: { calls: unknown[][] } }): string[] =>
      spy.mock.calls.map((call) => call[0] as string).sort();

    expect(names(elRemove)).toEqual(names(elAdd));
    expect(names(winRemove)).toEqual(names(winAdd));
    expect(names(docRemove)).toEqual(names(docAdd));

    expect(names(elAdd)).toContain('pointerleave');
    expect(names(winAdd)).toContain('blur');
    expect(names(docAdd)).toContain('mouseleave');
  });
});
