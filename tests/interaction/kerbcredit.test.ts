/**
 * A parked street on the map's edge: the road mesh must read nothing off the
 * map, as the sim reads nothing there, so the stalls a lot's kerb credit is
 * counted from are the same on both threads at the edge as anywhere else.
 */
import { describe, expect, it } from 'vitest';
import { drawnRoads, simKerb } from '../support/kerbtown';
import { column, roadRow, run, sandboxed } from '../support/sim';
import { MAP_SIZE } from '../../src/shared/constants';
import {
  isStraightRunMask,
  paintedKerbStallsAlong,
  parkingSetbacksAt,
} from '../../src/shared/kerblayout';
import {
  composeProfile,
  FIRST_CUSTOM_PROFILE_ID,
  NO_EDITS,
  presetProfileForTier,
} from '../../src/shared/roadprofile';
import { RoadTier, type Command } from '../../src/shared/types';

const EAST_WEST = 2 | 8;

describe('a parked street on the map’s edge', () => {
  it('gives the road mesh the stalls the sim counts: nothing is read off the map', () => {
    const h = sandboxed();
    const profile = composeProfile(presetProfileForTier(RoadTier.TwoLane), {
      ...NO_EDITS,
      parking: 'both',
      parkingStyle: 'parallel',
    });
    let seq = 1;
    const must = (commands: Command[]): void => {
      const ack = run(h, seq++, commands);
      if (!ack.ok) throw new Error(`refused ${JSON.stringify(commands)}: ${ack.reason}`);
    };
    const parked = (tiles: { x: number; z: number }[]): Command => ({
      kind: 'buildRoad',
      tier: RoadTier.TwoLane,
      tiles,
      profile: FIRST_CUSTOM_PROFILE_ID,
    });
    const plain = (tiles: { x: number; z: number }[]): Command => ({
      kind: 'buildRoad',
      tier: RoadTier.TwoLane,
      tiles,
    });
    must([{ kind: 'defineRoadProfile', id: FIRST_CUSTOM_PROFILE_ID, profile }]);
    // Down the west edge, along the north edge, and to the east edge, each
    // beside a road where a lookup that wrapped off the map would land.
    must([parked(column(0, 20, 20))]);
    must([plain(column(MAP_SIZE - 1, 2, 24))]);
    must([parked(roadRow(100, 0, 20))]);
    must([parked(roadRow(MAP_SIZE - 20, 100, 20))]);
    must([plain(column(0, 110, 12))]);
    h.ticks(2);

    const { renderer, roadTiles } = drawnRoads(h);
    const sim = simKerb(h);
    const drawn = renderer.kerbSurroundings();
    expect(drawn.roadAt(-1, 25)).toBeUndefined();
    expect(drawn.roadAt(MAP_SIZE, 105)).toBeUndefined();
    expect(drawn.roadAt(110, -1)).toBeUndefined();

    let stalls = 0;
    for (const { x, z } of roadTiles) {
      expect(parkingSetbacksAt(x, z, drawn), `setbacks at ${x},${z}`).toEqual(
        parkingSetbacksAt(x, z, sim),
      );
      const tile = sim.roadAt(x, z)!;
      if (!isStraightRunMask(tile.mask)) continue;
      const alongX = (tile.mask & EAST_WEST) !== 0;
      for (const side of ['low', 'high'] as const) {
        const frontage = { x, z, alongX, tiles: 1, side };
        const painted = paintedKerbStallsAlong(sim, frontage);
        expect(paintedKerbStallsAlong(drawn, frontage), `${side} kerb at ${x},${z}`).toEqual(
          painted,
        );
        stalls += painted.length;
      }
    }
    expect(stalls).toBeGreaterThan(100);
  }, 120_000);
});
