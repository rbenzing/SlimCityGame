import { describe, expect, it } from 'vitest';
import { RoadTier } from './types';
import { bridgeStyleFor, GIRDER_DEPTH_M, girderDepthFor } from './bridgestyle';
import type { BridgeStyle } from './bridgestyle';

/** Every buildable tier — bridging is not a privilege of the big roads. */
const ALL_TIERS = Object.values(RoadTier).filter((t) => t !== RoadTier.None) as RoadTier[];

describe('bridgeStyleFor', () => {
  it('gives rail a steel through-truss, the way railway bridges are built', () => {
    expect(bridgeStyleFor(RoadTier.RailTrack)).toBe('truss');
  });

  it('gives the big roads a deep box girder', () => {
    expect(bridgeStyleFor(RoadTier.Highway)).toBe('box');
    expect(bridgeStyleFor(RoadTier.Avenue)).toBe('box');
  });

  it('gives tracks and lanes bare planking rather than a concrete beam', () => {
    for (const tier of [RoadTier.Gravel, RoadTier.Alley, RoadTier.BikeLane])
      expect(bridgeStyleFor(tier)).toBe('plank');
  });

  it('leaves ordinary streets on the concrete beam', () => {
    for (const tier of [RoadTier.TwoLane, RoadTier.FourLane, RoadTier.OneWay, RoadTier.BusLane])
      expect(bridgeStyleFor(tier)).toBe('beam');
  });

  it('gives every tier a span it can be built in — a tram line bridges too', () => {
    const styles: BridgeStyle[] = ['plank', 'beam', 'box', 'truss'];
    for (const tier of ALL_TIERS) expect(styles).toContain(bridgeStyleFor(tier));
  });
});

describe('girderDepthFor', () => {
  it('is the depth of the family the tier is built in', () => {
    expect(girderDepthFor(RoadTier.Highway)).toBe(GIRDER_DEPTH_M.box);
    expect(girderDepthFor(RoadTier.RailTrack)).toBe(GIRDER_DEPTH_M.truss);
    expect(girderDepthFor(RoadTier.TwoLane)).toBe(GIRDER_DEPTH_M.beam);
    expect(girderDepthFor(RoadTier.Alley)).toBe(GIRDER_DEPTH_M.plank);
  });
});
