/**
 * Photo mode: a pure helper describing the photo-mode camera
 * transform plus the enter/exit/ESC state machine. Deliberately has NO
 * three.js/DOM imports (like cameramath.ts) so it's plain-number-testable;
 * the integrator wires it to the real CameraRig (assign `.state` to the
 * returned CameraState), hides DOM chrome while `chromeHidden` is true, adds
 * a toggle button calling `toggle()`, and forwards window keydown events to
 * `handleKeyDown` so ESC exits. No sim coupling, no Math.random/Date.now —
 * purely a function of the CameraState it's given.
 */
import type { CameraState } from '../shared/types';
import {
  CAMERA_MAX_DISTANCE,
  CAMERA_MAX_PITCH,
  CAMERA_MIN_DISTANCE,
  CAMERA_MIN_PITCH,
} from '../shared/constants';

/**
 * Wider bounds available ONLY while photo mode is active — a closer close-up
 * and a near-top-down or near-horizon tilt than normal gameplay allows, for
 * framing a clean shot. Strictly wider than the gameplay bounds on both ends.
 */
export const PHOTO_MODE_MIN_DISTANCE = CAMERA_MIN_DISTANCE / 4;
export const PHOTO_MODE_MAX_DISTANCE = CAMERA_MAX_DISTANCE * 2;
export const PHOTO_MODE_MIN_PITCH = CAMERA_MIN_PITCH / 4;
export const PHOTO_MODE_MAX_PITCH = Math.min(Math.PI / 2 - 0.001, CAMERA_MAX_PITCH + 0.4);

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/**
 * Pure transform: the given (gameplay-clamped) CameraState re-clamped against
 * the wider photo-mode bounds. A normal gameplay state passes through
 * unchanged (no jump when entering); only an out-of-range state gets pulled
 * into the photo-mode range.
 */
export function enterPhotoModeState(state: CameraState): CameraState {
  return {
    ...state,
    distance: clamp(state.distance, PHOTO_MODE_MIN_DISTANCE, PHOTO_MODE_MAX_DISTANCE),
    pitch: clamp(state.pitch, PHOTO_MODE_MIN_PITCH, PHOTO_MODE_MAX_PITCH),
  };
}

/**
 * Pure transform: re-clamps a (possibly photo-mode-wide) CameraState back
 * into normal gameplay bounds, for restoring the camera when photo mode
 * exits. (CameraRig's own `state` setter clamps too, via clampState — this
 * makes the transform explicit and unit-tested here rather than relying on
 * that side effect alone.)
 */
export function exitPhotoModeState(state: CameraState): CameraState {
  return {
    ...state,
    distance: clamp(state.distance, CAMERA_MIN_DISTANCE, CAMERA_MAX_DISTANCE),
    pitch: clamp(state.pitch, CAMERA_MIN_PITCH, CAMERA_MAX_PITCH),
  };
}

/**
 * Enter/exit state machine + the chrome-hidden flag contract: `chromeHidden`
 * is true for exactly as long as `active` is true, so the integrator can
 * drive DOM chrome visibility straight off one boolean.
 *
 * The gameplay CameraState present at `enter()` is captured once and
 * restored verbatim (re-clamped) by `exit()`, regardless of any free-fly
 * drift the camera does while photo mode is active — a duplicate `enter()`
 * call while already active is a no-op on the saved state (it still returns
 * a freshly-computed photo-mode transform of the ORIGINAL saved state, not
 * the state passed to the duplicate call).
 */
export class PhotoModeController {
  private _active = false;
  private savedState: CameraState | null = null;

  get active(): boolean {
    return this._active;
  }

  /** Chrome-hidden flag contract: hide all DOM chrome exactly while this is true. */
  get chromeHidden(): boolean {
    return this._active;
  }

  /** Enters photo mode (no-op if already active) and returns the CameraState to apply. */
  enter(currentState: CameraState): CameraState {
    if (!this._active) {
      this.savedState = currentState;
      this._active = true;
    }
    return enterPhotoModeState(this.savedState ?? currentState);
  }

  /** Exits photo mode and returns the restored gameplay CameraState, or null if not active. */
  exit(): CameraState | null {
    if (!this._active || !this.savedState) {
      this._active = false;
      this.savedState = null;
      return null;
    }
    const restored = exitPhotoModeState(this.savedState);
    this._active = false;
    this.savedState = null;
    return restored;
  }

  /** Convenience for a single toggle button: exits if active, else enters with `currentState`. */
  toggle(currentState: CameraState): CameraState | null {
    return this._active ? this.exit() : this.enter(currentState);
  }

  /**
   * Forward window keydown events here; exits (returning the restored
   * CameraState) on Escape while active. Returns null otherwise, including
   * when inactive or for any other key — safe to call unconditionally from a
   * global keydown listener.
   */
  handleKeyDown(e: { key: string }): CameraState | null {
    if (!this._active || e.key !== 'Escape') return null;
    return this.exit();
  }
}
