import { describe, expect, it } from 'vitest';
import { halfWidthOf } from '../world/freeroads';
import { addNode, addSegment, createRoadNetwork, segmentGeom } from '../world/roadnet';
import { kerbCreditAlongFrame } from '../world/kerbcredit';
import { kerbCreditOnSection } from './kerblayout';
import { PARKING_STALL_LENGTH_M } from './kerbstalls';
import { kerbLine } from './roadgeom';
import {
  composeProfile,
  FIRST_CUSTOM_PROFILE_ID,
  NO_EDITS,
  parkingSides,
  presetProfileForTier,
  type SideChoice,
} from './roadprofile';
import { RoadTier, type ParcelFrame, type RoadNet, type RoadProfile } from './types';

/** A two-lane street's cross-section with a parallel parking lane on `parking`'s kerbs. */
const parked = (parking: SideChoice): RoadProfile =>
  composeProfile(presetProfileForTier(RoadTier.TwoLane), {
    ...NO_EDITS,
    parking,
    parkingStyle: 'parallel',
  });

describe('kerbCreditOnSection', () => {
  it('credits a stall per stall length of frontage where the section carries a parking lane on that side', () => {
    const both = parked('both');
    expect(kerbCreditOnSection(both, 'low', 20)).toBe(Math.floor(20 / PARKING_STALL_LENGTH_M));
    expect(kerbCreditOnSection(both, 'high', 60)).toBe(Math.floor(60 / PARKING_STALL_LENGTH_M));
    expect(kerbCreditOnSection(both, 'high', 60)).toBe(8);
  });

  it('credits nothing from a section with no lane on that side', () => {
    expect(kerbCreditOnSection(parked('none'), 'low', 60)).toBe(0);
    expect(kerbCreditOnSection(parked('none'), 'high', 60)).toBe(0);
    const oneSide = parked('left');
    const sides = parkingSides(oneSide);
    expect(sides.low !== sides.high).toBe(true);
    expect(kerbCreditOnSection(oneSide, 'low', 60) > 0).toBe(sides.low);
    expect(kerbCreditOnSection(oneSide, 'high', 60) > 0).toBe(sides.high);
  });
});

describe('kerbCreditAlongFrame', () => {
  const cm = (m: number): number => Math.round(m * 100);
  const a = { x: 60, z: 160 };
  const b = { x: a.x + 200 * Math.cos(Math.PI / 6), z: a.z + 200 * Math.sin(Math.PI / 6) };

  /** One road off the grid from a to b carrying `profile`, and the frames of a lot on each of its kerbs at `s`. */
  function street(profile: RoadProfile): {
    net: RoadNet;
    profileOf: (id: number) => RoadProfile | null;
    frameOn: (side: 1 | -1, s: number, wM: number) => ParcelFrame;
  } {
    const net = createRoadNetwork();
    const facts = { tier: RoadTier.TwoLane, profile: FIRST_CUSTOM_PROFILE_ID, flow: 0 };
    const na = addNode(net, { ...facts, x: cm(a.x), z: cm(a.z), height: 0 });
    const nb = addNode(net, { ...facts, x: cm(b.x), z: cm(b.z), height: 0 });
    const seg = addSegment(net, { ...facts, a: na, b: nb, h0: 0, h1: 0, control: null });
    const half = halfWidthOf(profile);
    const geom = segmentGeom(net, seg);
    const frameOn = (side: 1 | -1, s: number, wM: number): ParcelFrame => {
      const kerb = kerbLine(geom, side, half);
      const at = (along: number) => kerb.reduce((p, q) => (Math.abs(q.s - along) < Math.abs(p.s - along) ? q : p));
      if (side === 1) return { x: at(s).x, z: at(s).z, heading: at(s).heading };
      const far = at(s + wM);
      return { x: far.x, z: far.z, heading: far.heading + Math.PI };
    };
    return { net, profileOf: (id) => (id === FIRST_CUSTOM_PROFILE_ID ? profile : null), frameOn };
  }

  it('credits a lot on either kerb of a street parked both sides by its frontage', () => {
    const { net, profileOf, frameOn } = street(parked('both'));
    expect(kerbCreditAlongFrame(net, frameOn(1, 50, 20), 20, profileOf)).toBe(2);
    expect(kerbCreditAlongFrame(net, frameOn(-1, 50, 20), 20, profileOf)).toBe(2);
    expect(kerbCreditAlongFrame(net, frameOn(1, 50, 60), 60, profileOf)).toBe(8);
  });

  it('credits only the kerb whose side of the section carries the lane', () => {
    const profile = parked('left');
    const sides = parkingSides(profile);
    const { net, profileOf, frameOn } = street(profile);
    // The kerb local v runs away from on side 1 lies on the section's high offsets.
    expect(kerbCreditAlongFrame(net, frameOn(1, 50, 60), 60, profileOf) > 0).toBe(sides.high);
    expect(kerbCreditAlongFrame(net, frameOn(-1, 50, 60), 60, profileOf) > 0).toBe(sides.low);
  });

  it('credits nothing beside a street with no parking lane, or where no road runs', () => {
    const { net, profileOf, frameOn } = street(parked('none'));
    expect(kerbCreditAlongFrame(net, frameOn(1, 50, 60), 60, profileOf)).toBe(0);
    expect(kerbCreditAlongFrame(net, frameOn(-1, 50, 60), 60, profileOf)).toBe(0);
    const far = { x: 2000, z: 2000, heading: 0 };
    expect(kerbCreditAlongFrame(net, far, 60, profileOf)).toBe(0);
  });
});
