/**
 * The kerb credit a framed lot earns from the road off the grid under its
 * frontage. The section rule is the kerb layout's (`kerbCreditOnSection`);
 * this finds which road and which side of it the lot fronts.
 */

import { TILE_METERS } from '../shared/constants';
import { kerbCreditOnSection } from '../shared/kerblayout';
import { toWorld } from '../shared/lotframe';
import { headingAt } from '../shared/roadgeom';
import { presetProfileForTier } from '../shared/roadprofile';
import type { ParcelFrame, RoadNet, RoadTier } from '../shared/types';
import { nearestRoadPoint, type ProfileLookup } from './freeroads';
import { segmentGeom } from './roadnet';

/** How far from a frame's kerb line the road under it may lie, metres: past any road's half width. */
const KERB_ROAD_REACH_M = 2 * TILE_METERS;

/**
 * The segment nearest the frontage's middle, the side of its direction of
 * travel the lot lies on, and that side's section: one stall per stall
 * length of frontage where a parking lane runs there, none where none does
 * or no road is near.
 */
export function kerbCreditAlongFrame(
  net: RoadNet,
  frame: ParcelFrame,
  wM: number,
  profileOf: ProfileLookup,
): number {
  const kerb = toWorld(frame, wM / 2, 0);
  const at = nearestRoadPoint(
    net,
    { x: Math.round(kerb.x * 100), z: Math.round(kerb.z * 100) },
    KERB_ROAD_REACH_M,
  );
  if (at === null) return 0;
  // The lot lies to the side local v runs to; the high offsets of a road off
  // the grid are laid a quarter turn toward increasing angle from its travel.
  const heading = headingAt(segmentGeom(net, at.seg), at.t);
  const into = toWorld(frame, wM / 2, 1);
  const toward = -(into.x - kerb.x) * Math.sin(heading) + (into.z - kerb.z) * Math.cos(heading);
  const id = net.segProfile[at.seg]!;
  const profile = profileOf(id) ?? presetProfileForTier(id as RoadTier);
  return kerbCreditOnSection(profile, toward > 0 ? 'high' : 'low', wM);
}
