/**
 * Which structure a road's spans are built in, and how deep that structure is.
 *
 * The depth is shared rather than a drawing detail because the world needs it
 * too: a deck passing over a road has to clear it to the UNDERSIDE of the
 * girder, so the height rule and the picture read one table.
 */
import { RoadTier } from './types';

/**
 * The structural families a span can be built in. Deliberately a short list of
 * clearly different silhouettes rather than one per tier — the point is that a
 * player reads what a bridge carries from across the map.
 */
export type BridgeStyle = 'plank' | 'beam' | 'box' | 'truss';

/** Depth of the structure under the road surface, metres, by family. */
export const GIRDER_DEPTH_M: Readonly<Record<BridgeStyle, number>> = {
  plank: 0.3,
  beam: 0.75,
  box: 1.5,
  truss: 0.55,
};

/** Which family a road tier's spans are built in. */
export function bridgeStyleFor(tier: RoadTier): BridgeStyle {
  switch (tier) {
    case RoadTier.RailTrack:
      return 'truss';
    // A slip road flies over on the same box girder the motorway it serves
    // does, because that is the structure it is usually part of.
    case RoadTier.Ramp:
    case RoadTier.Highway:
    case RoadTier.Avenue:
      return 'box';
    case RoadTier.Gravel:
    case RoadTier.Alley:
    case RoadTier.BikeLane:
      return 'plank';
    default:
      return 'beam';
  }
}

/** How deep the structure under a tier's deck is, metres. */
export function girderDepthFor(tier: RoadTier): number {
  return GIRDER_DEPTH_M[bridgeStyleFor(tier)];
}
