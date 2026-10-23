import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  computeTramStations,
  STATION_CANOPY_CLEAR_M,
  STATION_CANOPY_DEPTH_M,
  STATION_CANOPY_OVERHANG_M,
  STATION_PLATFORM_CLEARANCE_M,
  STATION_PLATFORM_DEPTH_M,
  STATION_PLATFORM_LENGTH_M,
  STATION_PLATFORM_WIDTH_M,
  STATION_POST_SPACING_M,
  STATION_STAIR_ANGLE,
  STATION_STAIR_WIDTH_M,
  STATION_TOWER_M,
  TramStationRenderer,
} from './tramstations';
import { computeGuideway, GUIDEWAY_BEAM_TOP_M, TRAM_FLOOR_ABOVE_BEAM_M } from './guideway';
import { tileKey } from './roadfurniture';
import type { FurnitureRoadTile } from './roadfurniture';
import { markingPlan } from './roadmarkings';
import {
  carriagewayHalfWidthOf,
  composeProfile,
  NO_EDITS,
  presetProfileForTier,
} from '../shared/roadprofile';
import { TILE_METERS, tileToWorld } from '../shared/constants';
import { RoadTier } from '../shared/types';
import type { TransitLine } from '../shared/types';

const flat = (): number => 0;
const ROW = 5;

const reservedProfile = composeProfile(presetProfileForTier(RoadTier.Avenue), {
  ...NO_EDITS,
  tram: 'reserved',
});
const reserved = (x: number, z: number): FurnitureRoadTile => ({
  x,
  z,
  tier: RoadTier.Avenue,
  profile: reservedProfile,
});
const mixed = (x: number, z: number): FurnitureRoadTile => ({ x, z, tier: RoadTier.Tram });
const row = (from: number, to: number, make: (x: number, z: number) => FurnitureRoadTile) =>
  Array.from({ length: to - from + 1 }, (_, i) => make(from + i, ROW));

/** Where the road mesh centres the reservation across the road. */
const medianCentre = (): number => {
  const bands = markingPlan(reservedProfile).bands.filter((b) => b.kind === 'tram');
  return bands.reduce((s, b) => s + (b.from + b.to) / 2, 0) / bands.length;
};
const centreZ = tileToWorld(ROW) + medianCentre();
const kerbZ = (side: 1 | -1): number =>
  tileToWorld(ROW) + side * carriagewayHalfWidthOf(reservedProfile);

const tramLine = (stops: { x: number; z: number }[], color = 0x42a5f5): TransitLine => ({
  id: 1,
  stops,
  color,
  mode: 'tram',
});

const stationsOver = (tiles: FurnitureRoadTile[], stops: { x: number; z: number }[]) =>
  computeTramStations([tramLine(stops)], tiles, flat, computeGuideway(tiles, flat));

describe('computeTramStations — a stop mid-run on a full-height guideway', () => {
  const run = row(0, 14, reserved);
  const STOP = 7;
  const { stations, stopTiles, tiles } = stationsOver(run, [{ x: STOP, z: ROW }]);
  const station = stations[0]!;
  const top = GUIDEWAY_BEAM_TOP_M + TRAM_FLOOR_ABOVE_BEAM_M;
  const lo = tileToWorld(STOP) - STATION_PLATFORM_LENGTH_M / 2;
  const hi = tileToWorld(STOP) + STATION_PLATFORM_LENGTH_M / 2;

  it('stands two platforms either side of the beams, 26 m long, at the trams’ floor', () => {
    expect(stations).toHaveLength(1);
    expect(station.alongX).toBe(true);
    expect(station.platforms).toHaveLength(2);
    const inner = STATION_PLATFORM_CLEARANCE_M + STATION_PLATFORM_WIDTH_M / 2;
    expect(station.platforms.map((p) => p.z).sort((a, b) => a - b)).toEqual([
      expect.closeTo(centreZ - inner, 9),
      expect.closeTo(centreZ + inner, 9),
    ]);
    for (const p of station.platforms) {
      expect(p.top).toBeCloseTo(top, 9);
      expect(p.y + STATION_PLATFORM_DEPTH_M / 2).toBeCloseTo(top, 9);
      expect(p.lo).toBeCloseTo(lo, 9);
      expect(p.hi).toBeCloseTo(hi, 9);
      expect(p.sx).toBeCloseTo(STATION_PLATFORM_LENGTH_M, 9);
      expect(p.sz).toBeCloseTo(STATION_PLATFORM_WIDTH_M, 9);
      expect(p.x).toBeCloseTo(tileToWorld(STOP), 9);
    }
  });

  it('covers each platform with a canopy 2.7 m up, overhanging 0.3 m, on a post every 6.5 m', () => {
    expect(station.canopies).toHaveLength(2);
    for (const c of station.canopies) {
      expect(c.y - STATION_CANOPY_DEPTH_M / 2).toBeCloseTo(top + STATION_CANOPY_CLEAR_M, 9);
      expect(c.sx).toBeCloseTo(STATION_PLATFORM_LENGTH_M + 2 * STATION_CANOPY_OVERHANG_M, 9);
      expect(c.sz).toBeCloseTo(STATION_PLATFORM_WIDTH_M + 2 * STATION_CANOPY_OVERHANG_M, 9);
    }
    const perPlatform = Math.floor(STATION_PLATFORM_LENGTH_M / STATION_POST_SPACING_M) + 1;
    expect(station.posts).toHaveLength(2 * perPlatform);
    for (const post of station.posts) {
      expect(post.x).toBeGreaterThanOrEqual(lo);
      expect(post.x).toBeLessThanOrEqual(hi);
      // On the outer edge, clear of the inner one.
      expect(Math.abs(post.z - centreZ)).toBeGreaterThan(
        STATION_PLATFORM_CLEARANCE_M + STATION_PLATFORM_WIDTH_M / 2,
      );
    }
  });

  it('runs a stair down from the low end at 32° to the footway, landing on the tile past the end', () => {
    expect(station.stairs).toHaveLength(2);
    for (const s of station.stairs) {
      expect(s.head.x).toBeCloseTo(lo, 9);
      expect(s.head.y).toBeCloseTo(top, 9);
      expect(s.foot.y).toBe(0);
      expect(s.foot.x).toBeCloseTo(lo - top / Math.tan(STATION_STAIR_ANGLE), 9);
      expect(s.pitch).toBeCloseTo(STATION_STAIR_ANGLE, 9);
      expect(s.sz).toBeCloseTo(STATION_STAIR_WIDTH_M, 9);
      expect(s.sx).toBeCloseTo(Math.hypot(lo - s.foot.x, top), 9);
      // Beside the road, never in its lanes.
      expect(Math.abs(s.z - tileToWorld(ROW))).toBeGreaterThan(
        carriagewayHalfWidthOf(reservedProfile),
      );
    }
    expect(Math.floor(station.stairs[0]!.foot.x / TILE_METERS)).toBe(STOP - 1);
  });

  it('stands a lift tower each side from the footway to the canopy, its road face at the kerb, with a glazed pane', () => {
    expect(station.towers).toHaveLength(2);
    expect(station.panes).toHaveLength(2);
    const canopyTop = top + STATION_CANOPY_CLEAR_M + STATION_CANOPY_DEPTH_M;
    for (const t of station.towers) {
      expect(t.sx).toBe(STATION_TOWER_M);
      expect(t.sz).toBe(STATION_TOWER_M);
      expect(t.y - t.sy / 2).toBe(0);
      expect(t.y + t.sy / 2).toBeCloseTo(canopyTop, 9);
      const side = t.z > centreZ ? 1 : -1;
      expect(t.z - side * (STATION_TOWER_M / 2)).toBeCloseTo(kerbZ(side), 9);
      // At the platform's low end, on its outer side.
      expect(t.x - STATION_TOWER_M / 2).toBeCloseTo(lo, 9);
    }
    for (const pane of station.panes) {
      const side = pane.z > centreZ ? 1 : -1;
      expect(Math.abs(pane.z - kerbZ(side))).toBeLessThan(0.05);
      expect(pane.y - pane.sy / 2).toBeGreaterThan(0);
      expect(pane.y + pane.sy / 2).toBeLessThan(canopyTop);
    }
  });

  it('hangs the line’s sign from each canopy’s edge at the platform’s centre', () => {
    expect(station.signs).toHaveLength(2);
    for (const sign of station.signs) {
      expect(sign.color).toBe(0x42a5f5);
      expect(sign.x).toBeCloseTo(tileToWorld(STOP), 9);
      expect(sign.y + sign.sy / 2).toBeCloseTo(top + STATION_CANOPY_CLEAR_M, 9);
    }
  });

  it('occupies the stop tile and the landing tile, and is a station on the stop tile only', () => {
    expect([...stopTiles]).toEqual([tileKey(STOP, ROW)]);
    expect([...tiles].sort()).toEqual([tileKey(STOP - 1, ROW), tileKey(STOP, ROW)].sort());
  });
});

describe('computeTramStations — what shortens or refuses a station', () => {
  it('stops the platform at the tile edge where the next tile is a turn', () => {
    // Along the row to x = 7, then south down x = 7: the turn is at 7.
    const tiles = [
      ...row(0, 7, reserved),
      ...Array.from({ length: 6 }, (_, i) => reserved(7, ROW + 1 + i)),
    ];
    const { stations } = stationsOver(tiles, [{ x: 6, z: ROW }]);
    expect(stations).toHaveLength(1);
    for (const p of stations[0]!.platforms) {
      expect(p.lo).toBeCloseTo(tileToWorld(6) - STATION_PLATFORM_LENGTH_M / 2, 9);
      expect(p.hi).toBeCloseTo(7 * TILE_METERS, 9);
      expect(p.sx).toBeCloseTo(7 * TILE_METERS - p.lo, 9);
    }
  });

  it('never shortens the platform below the tile', () => {
    const { stations } = stationsOver(row(4, 4, reserved), [{ x: 4, z: ROW }]);
    expect(stations).toHaveLength(1);
    for (const p of stations[0]!.platforms) expect(p.sx).toBeCloseTo(TILE_METERS, 9);
  });

  it('draws nothing for a stop on a ramp tile or on the tile the ramp ends on', () => {
    // Street track at x = 0..2; the guideway climbs over x = 3..7 and is full from 8.
    const tiles = [...row(0, 2, mixed), ...row(3, 14, reserved)];
    expect(stationsOver(tiles, [{ x: 5, z: ROW }]).stations).toHaveLength(0);
    expect(stationsOver(tiles, [{ x: 7, z: ROW }]).stations).toHaveLength(0);
    // The first full tile is a station, its platform cut short toward the ramp.
    const first = stationsOver(tiles, [{ x: 8, z: ROW }]).stations;
    expect(first).toHaveLength(1);
    expect(first[0]!.platforms[0]!.lo).toBeCloseTo(8 * TILE_METERS, 9);
  });

  it('draws nothing for a stop on a street tramway, on a turn, or for a bus line', () => {
    expect(stationsOver(row(0, 14, mixed), [{ x: 7, z: ROW }]).stations).toHaveLength(0);
    const turning = [
      ...row(0, 7, reserved),
      ...Array.from({ length: 6 }, (_, i) => reserved(7, ROW + 1 + i)),
    ];
    expect(stationsOver(turning, [{ x: 7, z: ROW }]).stations).toHaveLength(0);
    const run = row(0, 14, reserved);
    const bus: TransitLine = { id: 2, stops: [{ x: 7, z: ROW }], color: 0xff0000 };
    expect(computeTramStations([bus], run, flat, computeGuideway(run, flat)).stations).toHaveLength(
      0,
    );
    expect(computeTramStations([tramLine([{ x: 7, z: ROW }])], run, flat, null).stations).toEqual(
      [],
    );
  });

  it('lands the stair on the footway where the road stands on a deck', () => {
    const deck = (): number => 8;
    const run = row(0, 14, reserved);
    const { stations } = computeTramStations(
      [tramLine([{ x: 7, z: ROW }])],
      run,
      deck,
      computeGuideway(run, deck),
    );
    const top = 8 + GUIDEWAY_BEAM_TOP_M + TRAM_FLOOR_ABOVE_BEAM_M;
    for (const s of stations[0]!.stairs) {
      expect(s.head.y).toBeCloseTo(top, 9);
      expect(s.foot.y).toBe(8);
      expect(s.head.x - s.foot.x).toBeCloseTo((top - 8) / Math.tan(STATION_STAIR_ANGLE), 9);
    }
  });
});

describe('computeTramStations — which end the stair and lift land at', () => {
  const street = (x: number, z: number): FurnitureRoadTile => ({ x, z, tier: RoadTier.TwoLane });
  const crossingAt = (x: number): FurnitureRoadTile[] => [street(x, ROW - 1), street(x, ROW + 1)];
  const STOP = 7;
  const top = GUIDEWAY_BEAM_TOP_M + TRAM_FLOOR_ABOVE_BEAM_M;
  const run = top / Math.tan(STATION_STAIR_ANGLE);

  it('swaps to the high end when the tile past the low end is a crossing street', () => {
    const tiles = [...row(0, 14, reserved), ...crossingAt(STOP - 1)];
    const { stations, tiles: occupied } = stationsOver(tiles, [{ x: STOP, z: ROW }]);
    expect(stations).toHaveLength(1);
    const station = stations[0]!;
    const { lo, hi } = station.platforms[0]!;
    // The crossing cuts the platform short at the low end; the high end runs on.
    expect(lo).toBeCloseTo(STOP * TILE_METERS, 9);
    expect(hi).toBeCloseTo(tileToWorld(STOP) + STATION_PLATFORM_LENGTH_M / 2, 9);
    expect(station.stairs).toHaveLength(2);
    for (const s of station.stairs) {
      expect(s.head.x).toBeCloseTo(hi, 9);
      expect(s.foot.x).toBeCloseTo(hi + run, 9);
      expect(s.foot.x).toBeGreaterThan(hi);
      expect(Math.abs(s.pitch)).toBeCloseTo(STATION_STAIR_ANGLE, 9);
      expect(s.x).toBeCloseTo((hi + s.foot.x) / 2, 9);
    }
    // The tower, its pane and the landing move with it, mirrored at the high end.
    for (const t of station.towers) expect(t.x + STATION_TOWER_M / 2).toBeCloseTo(hi, 9);
    for (const p of station.panes) expect(p.x).toBeCloseTo(hi - STATION_TOWER_M / 2, 9);
    for (const l of station.landings) expect(l.x).toBeCloseTo(hi - STATION_TOWER_M / 2, 9);
    // The landing tile is past the high end, never the junction.
    expect(occupied.has(tileKey(STOP + 1, ROW))).toBe(true);
    expect(occupied.has(tileKey(STOP - 1, ROW))).toBe(false);
  });

  it('stays at the low end when both ends meet a crossing', () => {
    const tiles = [...row(0, 14, reserved), ...crossingAt(STOP - 1), ...crossingAt(STOP + 1)];
    const { stations } = stationsOver(tiles, [{ x: STOP, z: ROW }]);
    expect(stations).toHaveLength(1);
    const station = stations[0]!;
    const { lo } = station.platforms[0]!;
    expect(lo).toBeCloseTo(STOP * TILE_METERS, 9);
    for (const s of station.stairs) {
      expect(s.head.x).toBeCloseTo(lo, 9);
      expect(s.foot.x).toBeCloseTo(lo - run, 9);
      expect(s.pitch).toBeCloseTo(STATION_STAIR_ANGLE, 9);
    }
    for (const t of station.towers) expect(t.x - STATION_TOWER_M / 2).toBeCloseTo(lo, 9);
  });
});

describe('TramStationRenderer', () => {
  it('answers platformsAt with both platforms on the stop tile and null elsewhere', () => {
    const scene = new THREE.Scene();
    const renderer = new TramStationRenderer(scene, flat);
    const run = row(0, 14, reserved);
    expect(renderer.platformsAt(7, ROW)).toBeNull();
    renderer.rebuild([tramLine([{ x: 7, z: ROW }])], run, computeGuideway(run, flat));
    const platforms = renderer.platformsAt(7, ROW);
    expect(platforms).toHaveLength(2);
    expect(platforms!.map((p) => p.side).sort()).toEqual([-1, 1]);
    for (const p of platforms!) {
      expect(p.top).toBeCloseTo(GUIDEWAY_BEAM_TOP_M + TRAM_FLOOR_ABOVE_BEAM_M, 9);
      expect(p.alongX).toBe(true);
    }
    // The landing tile is the station's but not its stop.
    expect(renderer.platformsAt(6, ROW)).toBeNull();
    expect(renderer.platformsAt(8, ROW)).toBeNull();
    renderer.dispose();
  });

  it('draws each part as one instanced pool of boxes and answers isStation on the stop tile', () => {
    const scene = new THREE.Scene();
    const renderer = new TramStationRenderer(scene, flat);
    const run = row(0, 14, reserved);
    renderer.rebuild([tramLine([{ x: 7, z: ROW }])], run, computeGuideway(run, flat));
    const meshes = renderer.meshList();
    // Platforms, canopies, posts, stairs, towers, panes, signs.
    expect(meshes).toHaveLength(7);
    expect(meshes.every((m) => m instanceof THREE.InstancedMesh)).toBe(true);
    expect(meshes.every((m) => m.userData['underground'] === 'road')).toBe(true);
    expect(renderer.stationCount()).toBe(1);
    expect(renderer.isStation(7, ROW)).toBe(true);
    expect(renderer.isStation(6, ROW)).toBe(false);
    expect(renderer.tiles().has(tileKey(6, ROW))).toBe(true);

    // The sign pool carries the line's colour per instance.
    const signs = meshes[6]!;
    const c = new THREE.Color();
    signs.getColorAt(0, c);
    expect(c.getHex()).toBe(0x42a5f5);

    // A platform instance's top is at the trams' floor.
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    meshes[0]!.getMatrixAt(0, m);
    p.setFromMatrixPosition(m);
    expect(p.y + STATION_PLATFORM_DEPTH_M / 2).toBeCloseTo(
      GUIDEWAY_BEAM_TOP_M + TRAM_FLOOR_ABOVE_BEAM_M,
      6,
    );

    renderer.rebuild([], run, computeGuideway(run, flat));
    expect(scene.children).toHaveLength(0);
    expect(renderer.isStation(7, ROW)).toBe(false);
    renderer.dispose();
  });
});
