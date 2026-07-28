import { describe, expect, it } from 'vitest';
import type { CameraState } from '../shared/types';
import {
  CAMERA_MAX_DISTANCE,
  CAMERA_MAX_PITCH,
  CAMERA_MIN_DISTANCE,
  CAMERA_MIN_PITCH,
} from '../shared/constants';
import {
  enterPhotoModeState,
  exitPhotoModeState,
  PHOTO_MODE_MAX_DISTANCE,
  PHOTO_MODE_MAX_PITCH,
  PHOTO_MODE_MIN_DISTANCE,
  PHOTO_MODE_MIN_PITCH,
  PhotoModeController,
} from './photomode';

const GAMEPLAY_STATE: CameraState = {
  targetX: 500,
  targetZ: 500,
  distance: 600,
  yaw: 0.4,
  pitch: 0.7,
};

describe('photo-mode bounds', () => {
  it('photo-mode bounds are strictly wider than gameplay bounds on both ends', () => {
    expect(PHOTO_MODE_MIN_DISTANCE).toBeLessThan(CAMERA_MIN_DISTANCE);
    expect(PHOTO_MODE_MAX_DISTANCE).toBeGreaterThan(CAMERA_MAX_DISTANCE);
    expect(PHOTO_MODE_MIN_PITCH).toBeLessThan(CAMERA_MIN_PITCH);
    expect(PHOTO_MODE_MAX_PITCH).toBeGreaterThan(CAMERA_MAX_PITCH);
  });
});

describe('enterPhotoModeState', () => {
  it('preserves a normal gameplay state exactly (no jump on entry)', () => {
    expect(enterPhotoModeState(GAMEPLAY_STATE)).toEqual(GAMEPLAY_STATE);
  });

  it('clamps into the wider photo-mode bounds if given an already out-of-range state', () => {
    const wild: CameraState = { ...GAMEPLAY_STATE, distance: 999_999, pitch: 99 };
    const result = enterPhotoModeState(wild);
    expect(result.distance).toBe(PHOTO_MODE_MAX_DISTANCE);
    expect(result.pitch).toBe(PHOTO_MODE_MAX_PITCH);
  });
});

describe('exitPhotoModeState', () => {
  it('re-clamps a free-flown photo-mode state back into gameplay bounds', () => {
    const flown: CameraState = {
      ...GAMEPLAY_STATE,
      distance: PHOTO_MODE_MAX_DISTANCE,
      pitch: PHOTO_MODE_MIN_PITCH,
    };
    const result = exitPhotoModeState(flown);
    expect(result.distance).toBe(CAMERA_MAX_DISTANCE);
    expect(result.pitch).toBe(CAMERA_MIN_PITCH);
  });

  it('leaves an in-bounds state untouched', () => {
    expect(exitPhotoModeState(GAMEPLAY_STATE)).toEqual(GAMEPLAY_STATE);
  });
});

describe('PhotoModeController', () => {
  it('starts inactive with chrome shown', () => {
    const controller = new PhotoModeController();
    expect(controller.active).toBe(false);
    expect(controller.chromeHidden).toBe(false);
  });

  it('enter() activates, hides chrome, and returns the widened camera state', () => {
    const controller = new PhotoModeController();
    const result = controller.enter(GAMEPLAY_STATE);
    expect(controller.active).toBe(true);
    expect(controller.chromeHidden).toBe(true);
    expect(result).toEqual(enterPhotoModeState(GAMEPLAY_STATE));
  });

  it('exit() restores the ORIGINAL gameplay state captured at enter(), not whatever free-fly state the camera drifted to since', () => {
    const controller = new PhotoModeController();
    controller.enter(GAMEPLAY_STATE);
    // Simulate the camera having since free-flown somewhere wild while in photo mode.
    const restored = controller.exit();
    expect(restored).toEqual(exitPhotoModeState(GAMEPLAY_STATE));
    expect(controller.active).toBe(false);
    expect(controller.chromeHidden).toBe(false);
  });

  it('exit() when never entered is a safe no-op returning null', () => {
    const controller = new PhotoModeController();
    expect(controller.exit()).toBeNull();
    expect(controller.active).toBe(false);
  });

  it('re-entering while already active does not overwrite the originally saved gameplay state', () => {
    const controller = new PhotoModeController();
    controller.enter(GAMEPLAY_STATE);
    const otherState: CameraState = { ...GAMEPLAY_STATE, distance: 1200, pitch: 1.0 };
    // A second enter() call (e.g. a duplicate toggle) while already active must not
    // treat `otherState` as the new "saved" gameplay state to restore later.
    controller.enter(otherState);
    const restored = controller.exit();
    expect(restored).toEqual(exitPhotoModeState(GAMEPLAY_STATE));
  });

  it('toggle() flips between enter and exit', () => {
    const controller = new PhotoModeController();
    const entered = controller.toggle(GAMEPLAY_STATE);
    expect(controller.active).toBe(true);
    expect(entered).toEqual(enterPhotoModeState(GAMEPLAY_STATE));

    const exited = controller.toggle(GAMEPLAY_STATE);
    expect(controller.active).toBe(false);
    expect(exited).toEqual(exitPhotoModeState(GAMEPLAY_STATE));
  });

  it('handleKeyDown exits on Escape while active and returns the restored state', () => {
    const controller = new PhotoModeController();
    controller.enter(GAMEPLAY_STATE);
    const result = controller.handleKeyDown({ key: 'Escape' });
    expect(result).toEqual(exitPhotoModeState(GAMEPLAY_STATE));
    expect(controller.active).toBe(false);
  });

  it('handleKeyDown ignores non-Escape keys and Escape while inactive', () => {
    const controller = new PhotoModeController();
    controller.enter(GAMEPLAY_STATE);
    expect(controller.handleKeyDown({ key: 'a' })).toBeNull();
    expect(controller.active).toBe(true);

    controller.exit();
    expect(controller.handleKeyDown({ key: 'Escape' })).toBeNull();
    expect(controller.active).toBe(false);
  });
});
