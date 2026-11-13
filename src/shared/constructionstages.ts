/**
 * The visible stages of a building going up, as shares of its construction:
 * bare earth, foundation, frame, enclosed. The sim reports progress only when
 * the picture changes, so both sides read the stage boundaries from here.
 */
export const FOUNDATION_FROM = 0.15;
export const FRAME_FROM = 0.3;
export const ENCLOSED_FROM = 0.75;
/** A frame rises in at most this many visible lifts, however tall the building. */
export const MAX_FRAME_LIFTS = 5;

/** Frame lifts a building of `storeys` storeys rises in. */
export function frameLifts(storeys: number): number {
  return Math.min(Math.max(1, storeys), MAX_FRAME_LIFTS);
}

/** The lift (1..frameLifts) a frame at `progress` has reached; 0 outside the frame stage. */
export function frameLift(progress: number, storeys: number): number {
  if (progress < FRAME_FROM || progress >= ENCLOSED_FROM) return 0;
  const lifts = frameLifts(storeys);
  const share = (progress - FRAME_FROM) / (ENCLOSED_FROM - FRAME_FROM);
  return Math.min(lifts, Math.floor(share * lifts) + 1);
}

/** A number that changes exactly when the drawn picture does: stage, and lift within the frame. */
export function pictureKey(progress: number, storeys: number): number {
  if (progress < FOUNDATION_FROM) return 0;
  if (progress < FRAME_FROM) return 1;
  if (progress < ENCLOSED_FROM) return 1 + frameLift(progress, storeys);
  return 2 + MAX_FRAME_LIFTS;
}
