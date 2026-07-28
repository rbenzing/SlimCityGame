/**
 * RTS camera rig: middle/right-drag rotate, wheel zoom-to-
 * cursor, WASD/arrow pan, edge-scroll, inertia damping, terrain-following.
 * Left-drag is deliberately NOT handled here — tools own left-click/drag.
 * All the actual math lives in cameramath.ts (pure, unit tested); this class
 * is a thin, real DOM/three.js wrapper around it.
 */

import * as THREE from 'three';
import type { CameraState } from '../shared/types';
import { MAP_SIZE, TILE_METERS } from '../shared/constants';
import { cameraPosition, clampState, dampTowards, panDelta, zoomToCursor } from './cameramath';

const ROTATE_SPEED = 0.006; // radians per pixel of drag
const ZOOM_SPEED = 0.0011; // exponential factor per wheel deltaY unit
const EDGE_PX = 8; // edge-scroll activation band, in CSS pixels
const KEY_PAN_PX_PER_SEC = 900; // synthetic screen-pixel pan speed for WASD/edge-scroll
// Stiffness (1/s) of the critically-damped ease that the
// rendered pan target chases the goal target with. ~1/lambda = 125ms time
// constant — fast enough to feel responsive, slow enough that WASD/edge-
// scroll/clamp-at-boundary doesn't read as a discrete "jump the map".
const PAN_LAMBDA = 8;

const clampToMap = (v: number, mapMeters: number): number => Math.min(mapMeters, Math.max(0, v));

const MIDDLE_BUTTON = 1;
const RIGHT_BUTTON = 2;

const PAN_KEYS: Record<string, { dx: number; dy: number }> = {
  KeyW: { dx: 0, dy: -1 },
  ArrowUp: { dx: 0, dy: -1 },
  KeyS: { dx: 0, dy: 1 },
  ArrowDown: { dx: 0, dy: 1 },
  KeyA: { dx: -1, dy: 0 },
  ArrowLeft: { dx: -1, dy: 0 },
  KeyD: { dx: 1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
};

export class CameraRig {
  private _state!: CameraState;

  /**
   * The rendered camera state. Reading it returns wherever the camera
   * currently IS (post-damping); assigning it (boot framing, save/load, the
   * dev harness's `setCamera`) is a hard "teleport" that resyncs the goal
   * target to match, so a direct external assignment never leaves a stale
   * goal trying to ease back to it afterward.
   */
  get state(): CameraState {
    return this._state;
  }

  set state(next: CameraState) {
    this._state = next;
    this.goalTargetX = next.targetX;
    this.goalTargetZ = next.targetZ;
  }

  private readonly camera: THREE.PerspectiveCamera;
  private readonly heightAt: (x: number, z: number) => number;

  private el: HTMLElement | null = null;
  private enabled = true;

  private dragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;
  private pointerX = 0;
  private pointerY = 0;
  // True only once a real pointermove/pointerenter has confirmed the OS
  // pointer is over the attached element. Cleared (and pointerX/Y parked at
  // viewport center) whenever the pointer is known to have left the element,
  // the window, or the document entirely, so a pointermove that stops
  // arriving (e.g. the OS cursor leaves the browser window) can never leave
  // stale edge-band coordinates driving update() forever.
  private pointerInside = false;

  // Goal target: WASD/edge-scroll drive this every frame
  // in update(); the rendered `state.targetX/targetZ` eases toward it via
  // dampTowards instead of snapping straight there. Kept separate from
  // `_state` so the ease has somewhere to converge FROM each frame.
  private goalTargetX = 0;
  private goalTargetZ = 0;
  private readonly keys = new Set<string>();

  constructor(camera: THREE.PerspectiveCamera, heightAt: (x: number, z: number) => number) {
    this.camera = camera;
    this.heightAt = heightAt;
    const mapMeters = MAP_SIZE * TILE_METERS;
    this.state = clampState({
      targetX: mapMeters / 2,
      targetZ: mapMeters / 2,
      distance: 600,
      yaw: 0,
      pitch: 0.7,
    });
    this.applyToCamera();
  }

  attach(el: HTMLElement): void {
    if (this.el) this.detach();
    this.el = el;
    el.addEventListener('pointerdown', this.onPointerDown);
    el.addEventListener('pointerenter', this.onPointerEnter);
    el.addEventListener('pointerleave', this.onPointerLeaveElement);
    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('blur', this.onWindowBlur);
    document.addEventListener('mouseleave', this.onDocumentMouseLeave);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
  }

  detach(): void {
    const el = this.el;
    if (!el) return;
    el.removeEventListener('pointerdown', this.onPointerDown);
    el.removeEventListener('pointerenter', this.onPointerEnter);
    el.removeEventListener('pointerleave', this.onPointerLeaveElement);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('blur', this.onWindowBlur);
    document.removeEventListener('mouseleave', this.onDocumentMouseLeave);
    el.removeEventListener('wheel', this.onWheel);
    el.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.el = null;
    this.dragging = false;
    this.keys.clear();
    this.pointerInside = false;
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (!v) {
      this.dragging = false;
      this.keys.clear();
      // Freeze the goal at wherever the camera actually is, so re-enabling
      // later never triggers a catch-up ease toward a stale goal.
      this.goalTargetX = this.state.targetX;
      this.goalTargetZ = this.state.targetZ;
    }
  }

  update(dtMs: number): void {
    if (!this.enabled) return;
    const dt = dtMs / 1000;

    let kx = 0;
    let ky = 0;
    for (const code of this.keys) {
      const dir = PAN_KEYS[code];
      if (dir) {
        kx += dir.dx;
        ky += dir.dy;
      }
    }

    // Zero edge-scroll contribution while the pointer isn't confirmed inside
    // the attached element (e.g. it left the browser window entirely and
    // stopped delivering pointermove) — see pointerInside's field doc.
    if (this.el && this.pointerInside) {
      const rect = this.el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        if (this.pointerX <= EDGE_PX) kx -= 1;
        if (this.pointerX >= rect.width - EDGE_PX) kx += 1;
        if (this.pointerY <= EDGE_PX) ky -= 1;
        if (this.pointerY >= rect.height - EDGE_PX) ky += 1;
      }
    }

    if (kx !== 0 || ky !== 0) {
      const viewportH = this.el?.clientHeight || 800;
      const { dx, dz } = panDelta(
        this.state,
        kx * KEY_PAN_PX_PER_SEC * dt,
        ky * KEY_PAN_PX_PER_SEC * dt,
        viewportH,
      );
      this.goalTargetX += dx;
      this.goalTargetZ += dz;
    }

    // Clamp the GOAL (not just the eventual rendered value) so holding a pan
    // key against the map boundary can't accumulate an unbounded goal that
    // the camera would have to "catch up" through later.
    const mapMeters = MAP_SIZE * TILE_METERS;
    this.goalTargetX = clampToMap(this.goalTargetX, mapMeters);
    this.goalTargetZ = clampToMap(this.goalTargetZ, mapMeters);

    // Ease the rendered target toward the goal with a
    // dt-correct, deterministic critically-damped step (no Date.now/
    // Math.random) instead of snapping straight to it. This is also what
    // absorbs the pointer-leave guard: leaving just stops the goal
    // from moving any further (see the pointerInside gate above); the
    // in-flight ease keeps decaying smoothly toward wherever the goal was
    // when leaves happened, no discrete jump.
    const dampedX = dampTowards(this.state.targetX, this.goalTargetX, PAN_LAMBDA, dt);
    const dampedZ = dampTowards(this.state.targetZ, this.goalTargetZ, PAN_LAMBDA, dt);

    // Write the rendered value directly (bypassing the `state` setter) so
    // this partial ease doesn't resync the goal to itself — that would erase
    // the very gap we're easing across. clampState still guards the final
    // rendered value against ever landing (or during an external teleport,
    // starting) out of bounds.
    this._state = clampState({ ...this.state, targetX: dampedX, targetZ: dampedZ });

    this.applyToCamera();
  }

  private applyToCamera(): void {
    const pos = cameraPosition(this.state);
    const lift = this.heightAt(this.state.targetX, this.state.targetZ);
    this.camera.position.set(pos.x, pos.y + lift, pos.z);
    this.camera.lookAt(this.state.targetX, lift, this.state.targetZ);
  }

  /** Unprojects a screen point to the ground, refined against the actual terrain height under it. */
  private unprojectGround(
    px: number,
    py: number,
    width: number,
    height: number,
  ): { x: number; z: number } {
    this.camera.updateMatrixWorld(true);
    const ndcX = (px / width) * 2 - 1;
    const ndcY = -(py / height) * 2 + 1;
    const near = new THREE.Vector3(ndcX, ndcY, -1).unproject(this.camera);
    const far = new THREE.Vector3(ndcX, ndcY, 1).unproject(this.camera);
    const dir = far.clone().sub(near);

    let hitX = this.state.targetX;
    let hitZ = this.state.targetZ;
    let groundY = this.heightAt(hitX, hitZ);
    for (let i = 0; i < 2; i++) {
      const denom = Math.abs(dir.y) < 1e-6 ? (dir.y < 0 ? -1e-6 : 1e-6) : dir.y;
      const t = (groundY - near.y) / denom;
      hitX = near.x + dir.x * t;
      hitZ = near.z + dir.z * t;
      groundY = this.heightAt(hitX, hitZ);
    }
    return { x: hitX, z: hitZ };
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    if (!this.enabled) return;
    if (e.button !== MIDDLE_BUTTON && e.button !== RIGHT_BUTTON) return;
    this.dragging = true;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;
    e.preventDefault();
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.el) {
      const rect = this.el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x >= 0 && y >= 0 && x <= rect.width && y <= rect.height) {
        this.pointerX = x;
        this.pointerY = y;
        this.pointerInside = true;
      } else {
        // Outside the element (e.g. over other UI chrome, still inside the
        // window): park at center and stop edge-scroll same as a real leave.
        this.parkPointerAtCenter();
      }
    }

    if (!this.enabled || !this.dragging) return;
    const dx = e.clientX - this.lastPointerX;
    const dy = e.clientY - this.lastPointerY;
    this.lastPointerX = e.clientX;
    this.lastPointerY = e.clientY;

    this.state = clampState({
      ...this.state,
      yaw: this.state.yaw - dx * ROTATE_SPEED,
      pitch: this.state.pitch + dy * ROTATE_SPEED,
    });
    this.applyToCamera();
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (e.button === MIDDLE_BUTTON || e.button === RIGHT_BUTTON) this.dragging = false;
  };

  private readonly onPointerEnter = (): void => {
    this.pointerInside = true;
  };

  // pointerleave (element), blur (window), and mouseleave (document) are the
  // three ways the OS pointer can stop delivering pointermove to us without
  // ever telling us it left: dropping focus, or exiting the element/document
  // bounds outright. All three park the pointer and clear pointerInside so
  // update() cannot keep edge-scrolling toward the map boundary forever.
  private readonly onPointerLeaveElement = (): void => {
    this.parkPointerAtCenter();
  };

  private readonly onWindowBlur = (): void => {
    this.parkPointerAtCenter();
  };

  private readonly onDocumentMouseLeave = (): void => {
    this.parkPointerAtCenter();
  };

  private parkPointerAtCenter(): void {
    this.pointerInside = false;
    if (this.el) {
      const rect = this.el.getBoundingClientRect();
      this.pointerX = rect.width / 2;
      this.pointerY = rect.height / 2;
    } else {
      this.pointerX = 0;
      this.pointerY = 0;
    }
  }

  private readonly onWheel = (e: WheelEvent): void => {
    if (!this.enabled || !this.el) return;
    e.preventDefault();
    const rect = this.el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;
    const ground = this.unprojectGround(px, py, rect.width, rect.height);
    const zoomFactor = Math.exp(e.deltaY * ZOOM_SPEED);
    this.state = clampState(zoomToCursor(this.state, zoomFactor, ground));
    this.applyToCamera();
  };

  private readonly onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (PAN_KEYS[e.code]) this.keys.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };
}
