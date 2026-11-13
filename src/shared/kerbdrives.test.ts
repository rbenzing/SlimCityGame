import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { TILE_METERS } from './constants';
import {
  blockFaceAt,
  kerbCreditFor,
  lotDriveCuts,
  paintedKerbStallsAlong,
  roadSurroundings,
  withDriveCuts,
  type DriveCut,
  type KerbSurroundings,
} from './kerblayout';
import { lotParkingAt } from './lotparking';
import {
  driveZone,
  NO_PARKING_BESIDE_DRIVE_M,
  PARKING_END_STALL_M,
  PARKING_STALL_LENGTH_M,
  PARKING_STALL_MAX_M,
} from './kerbstalls';
import {
  composeProfile,
  FIRST_CUSTOM_PROFILE_ID,
  NO_EDITS,
  presetProfileForTier,
} from './roadprofile';
import {
  RoadFlow,
  RoadTier,
  type BuildingCatalogEntry,
  type RoadProfile,
  type RoadTileDelta,
} from './types';

const NORTH = 1;
const EAST = 2;
const SOUTH = 4;
const WEST = 8;
const ROAD_Z = 5;
const T = TILE_METERS;

const parkedBoth: RoadProfile = composeProfile(presetProfileForTier(RoadTier.TwoLane), {
  ...NO_EDITS,
  parking: 'both',
  parkingStyle: 'parallel',
});

/**
 * An east-west two-lane street with a parallel parking lane on both kerbs,
 * `tiles` long from x = 0, a crossing street at tile `crossingAt` when given,
 * and the driveway cuts `cuts` along it.
 */
function street(
  tiles: number,
  cuts: readonly DriveCut[],
  crossingAt: number | null = null,
): KerbSurroundings {
  const roadAt = (x: number, z: number): RoadTileDelta | undefined => {
    const base = {
      tier: RoadTier.TwoLane,
      elevation: 0,
      profile: FIRST_CUSTOM_PROFILE_ID,
      flow: RoadFlow.None,
    };
    if (z === ROAD_Z && x >= 0 && x < tiles) {
      const cross = x === crossingAt ? NORTH | SOUTH : 0;
      return { x, z, ...base, mask: (x > 0 ? WEST : 0) | (x < tiles - 1 ? EAST : 0) | cross };
    }
    if (crossingAt !== null && x === crossingAt && (z === ROAD_Z - 1 || z === ROAD_Z + 1)) {
      return { x, z, ...base, mask: z < ROAD_Z ? SOUTH : NORTH };
    }
    return undefined;
  };
  return roadSurroundings(
    { roadAt, profileById: (id) => (id === FIRST_CUSTOM_PROFILE_ID ? parkedBoth : null) },
    { controlAt: () => undefined, turnsAt: () => 0, laneTurnsAt: () => 0 },
    (x, z) => (z !== ROAD_Z ? [] : cuts.filter((c) => c.to > x * T && c.from < (x + 1) * T)),
  );
}

const stallsOf = (s: KerbSurroundings, _tiles: number, side: 'low' | 'high') =>
  blockFaceAt(1, ROAD_Z, side, s)?.face.stalls ?? [];

/** A cut `width` wide whose middle lies `at` metres along the street. */
const cutAt = (side: 'low' | 'high', at: number, width = 3): DriveCut => ({
  side,
  from: at - width / 2,
  to: at + width / 2,
});

describe('kerb stalls fitted round driveways', () => {
  it('marks stalls of 6.1 to 7.9 m along an undisturbed run', () => {
    const stalls = stallsOf(street(8, []), 8, 'low');
    expect(stalls.length).toBeGreaterThan(10);
    for (const st of stalls) {
      expect(st.to - st.from).toBeGreaterThanOrEqual(PARKING_END_STALL_M - 1e-6);
      expect(st.to - st.from).toBeLessThanOrEqual(PARKING_STALL_MAX_M + 1e-6);
    }
  });

  it('marks no stall within 1.5 m of a drive, and only whole stalls on either side of it', () => {
    const drive = cutAt('low', 80);
    const stalls = stallsOf(street(8, [drive]), 8, 'low');
    const lo = drive.from - NO_PARKING_BESIDE_DRIVE_M;
    const hi = drive.to + NO_PARKING_BESIDE_DRIVE_M;
    expect(stalls.some((st) => st.to <= lo + 1e-6)).toBe(true);
    expect(stalls.some((st) => st.from >= hi - 1e-6)).toBe(true);
    for (const st of stalls) {
      expect(st.to <= lo + 1e-6 || st.from >= hi - 1e-6).toBe(true);
      expect(st.to - st.from).toBeGreaterThanOrEqual(PARKING_END_STALL_M - 1e-6);
      expect(st.to - st.from).toBeLessThanOrEqual(PARKING_STALL_MAX_M + 1e-6);
    }
    // What the zone leaves unmarked beside it is less than one stall pitch, never a long stretch.
    const before = stalls.filter((st) => st.to <= lo + 1e-6);
    const after = stalls.filter((st) => st.from >= hi - 1e-6);
    expect(lo - before[before.length - 1]!.to).toBeLessThan(PARKING_STALL_LENGTH_M);
    expect(after[0]!.from - hi).toBeLessThan(PARKING_STALL_LENGTH_M);
  });

  it('lays the stalls the same on both tiles of a drive that straddles a seam', () => {
    const drive = cutAt('low', 2 * T, 4);
    const s = street(8, [drive]);
    const stalls = stallsOf(s, 8, 'low');
    const lo = drive.from - NO_PARKING_BESIDE_DRIVE_M;
    const hi = drive.to + NO_PARKING_BESIDE_DRIVE_M;
    expect(stalls.filter((st) => st.from < hi - 1e-6 && st.to > lo + 1e-6)).toEqual([]);
    const before = stalls.filter((st) => st.to <= lo + 1e-6);
    const after = stalls.filter((st) => st.from >= hi - 1e-6);
    expect(lo - before[before.length - 1]!.to).toBeLessThan(PARKING_STALL_LENGTH_M);
    expect(after[0]!.from - hi).toBeLessThan(PARKING_STALL_LENGTH_M);
  });

  it('leaves a remainder shorter than a stall between two close drives unmarked', () => {
    const a = cutAt('low', 80);
    const b = cutAt('low', 80 + 3 + 2 * NO_PARKING_BESIDE_DRIVE_M + 5);
    const stalls = stallsOf(street(8, [a, b]), 8, 'low');
    const gapFrom = a.to + NO_PARKING_BESIDE_DRIVE_M;
    const gapTo = b.from - NO_PARKING_BESIDE_DRIVE_M;
    expect(gapTo - gapFrom).toBeCloseTo(5, 6);
    expect(stalls.filter((st) => st.to > gapFrom + 1e-6 && st.from < gapTo - 1e-6)).toEqual([]);
  });

  it('marks a whole stall between two drives that leave room for one', () => {
    const a = cutAt('low', 80);
    const b = cutAt('low', 80 + 3 + 2 * NO_PARKING_BESIDE_DRIVE_M + 6.5);
    const stalls = stallsOf(street(8, [a, b]), 8, 'low');
    const between = stalls.filter((st) => st.from >= a.to && st.to <= b.from);
    expect(between).toHaveLength(1);
    expect(between[0]!.to - between[0]!.from).toBeCloseTo(6.5, 6);
  });

  it('keeps a drive beside a junction clear of both its setback and its own zone', () => {
    const crossing = 6;
    const base = street(8, [], crossing);
    const open = stallsOf(base, 8, 'low');
    // The stall nearest the crossing ends where its setback does.
    const nearJunction = open.filter((st) => st.to <= crossing * T);
    const lastBefore = nearJunction[nearJunction.length - 1]!;
    const drive = cutAt('low', lastBefore.from - 3);
    const stalls = stallsOf(street(8, [drive], crossing), 8, 'low');
    const zoneHi = drive.to + NO_PARKING_BESIDE_DRIVE_M;
    for (const st of stalls.filter((x) => x.to <= crossing * T)) {
      expect(st.to - st.from).toBeGreaterThanOrEqual(PARKING_END_STALL_M - 1e-6);
      expect(st.from < zoneHi - 1e-6 && st.to > drive.from - NO_PARKING_BESIDE_DRIVE_M).toBe(false);
    }
  });

  it('lets a drive on one kerb leave the other kerb untouched', () => {
    const drive = cutAt('low', 80);
    const s = street(8, [drive]);
    expect(stallsOf(s, 8, 'high')).toEqual(stallsOf(street(8, []), 8, 'high'));
    expect(stallsOf(s, 8, 'low')).not.toEqual(stallsOf(street(8, []), 8, 'low'));
  });

  it('keeps stalls clear of drives on both kerbs at once', () => {
    const lowDrive = cutAt('low', 60);
    const highDrive = cutAt('high', 100);
    const s = street(8, [lowDrive, highDrive]);
    for (const [side, drive] of [
      ['low', lowDrive],
      ['high', highDrive],
    ] as const) {
      for (const st of stallsOf(s, 8, side)) {
        expect(
          st.to <= drive.from - NO_PARKING_BESIDE_DRIVE_M + 1e-6 ||
            st.from >= drive.to + NO_PARKING_BESIDE_DRIVE_M - 1e-6,
        ).toBe(true);
      }
    }
  });

  it('credits a lot exactly the stalls its frontage marks, none that a drive blocks', () => {
    const drive = cutAt('low', 3 * T + 4);
    const open = street(8, []);
    const blocked = street(8, [drive]);
    // A lot south of the street (the street is on its N edge) lies on the high kerb; one north on the low.
    const lot = { x: 2, z: ROAD_Z + 1, w: 3, d: 2 };
    const north = { x: 2, z: ROAD_Z - 2, w: 3, d: 2 };
    const marked = (s: KerbSurroundings, l: typeof lot, edge: 'N' | 'S') =>
      paintedKerbStallsAlong(s, {
        x: l.x,
        z: edge === 'N' ? l.z - 1 : l.z + l.d,
        alongX: true,
        tiles: l.w,
        side: edge === 'N' ? 'high' : 'low',
      }).length;
    expect(kerbCreditFor(open, north, 'S')).toBe(marked(open, north, 'S'));
    expect(kerbCreditFor(blocked, north, 'S')).toBe(marked(blocked, north, 'S'));
    expect(kerbCreditFor(blocked, north, 'S')).toBeLessThan(kerbCreditFor(open, north, 'S'));
    expect(kerbCreditFor(blocked, lot, 'N')).toBe(kerbCreditFor(open, lot, 'N'));
  });
});

describe('a car park lot’s kerb credit', () => {
  const entry = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings.find(
    (e) => e.id === 'com-strip-2',
  )!;

  it('counts only stalls the lot’s own drive leaves marked', () => {
    const kerb = street(14, []);
    const roadAt = (x: number, z: number): boolean => kerb.hasRoad(x, z);
    const x = 2;
    const z = ROAD_Z + 1;
    const parking = lotParkingAt(entry, x, z, 0, roadAt, kerb)!;
    expect(parking.edge.side).toBe('N');
    const tiles = { x, z, w: entry.footprint.w, d: entry.footprint.d };
    const { curbCut } = parking.layout;
    const own = withDriveCuts(kerb, lotDriveCuts(tiles, 'N', curbCut.u0, curbCut.u1));
    const stalls = paintedKerbStallsAlong(own, {
      x,
      z: ROAD_Z,
      alongX: true,
      tiles: tiles.w,
      side: 'high',
    });
    expect(parking.kerbCredit).toBe(stalls.length);
    expect(parking.kerbCredit).toBeLessThanOrEqual(kerbCreditFor(kerb, tiles, 'N'));
    const zone = driveZone(2 * T + curbCut.u0, 2 * T + curbCut.u1);
    for (const st of stalls)
      expect(st.to <= zone.from + 1e-6 || st.from >= zone.to - 1e-6).toBe(true);
  });
});

describe('a run of kerb between two no-parking zones', () => {
  /** The stalls laid in a run of `run` metres between two drives on the low kerb, drive A first. */
  function runBetween(run: number) {
    const a = cutAt('low', 80);
    const from = a.to + NO_PARKING_BESIDE_DRIVE_M;
    const b = cutAt('low', from + run + NO_PARKING_BESIDE_DRIVE_M + 1.5);
    const stalls = stallsOf(street(8, [a, b]), 8, 'low').filter(
      (st) => st.from >= from - 1e-6 && st.to <= from + run + 1e-6,
    );
    return { stalls, from, to: from + run };
  }
  const lengths = (stalls: { from: number; to: number }[]) => stalls.map((st) => st.to - st.from);

  it('marks nothing in a run shorter than one end stall', () => {
    expect(runBetween(5.9).stalls).toEqual([]);
  });

  it('holds two end stalls, flush to both zones, in a 12.2 m run', () => {
    const { stalls, from, to } = runBetween(12.2);
    expect(lengths(stalls)).toHaveLength(2);
    for (const l of lengths(stalls)) expect(l).toBeCloseTo(PARKING_END_STALL_M, 6);
    expect(stalls[0]!.from).toBeCloseTo(from, 6);
    expect(stalls[1]!.to).toBeCloseTo(to, 6);
  });

  it('stretches one stall to take up the odd length of a 13 m run, leaving nothing over', () => {
    const { stalls, from, to } = runBetween(13);
    const l = lengths(stalls);
    expect(l).toHaveLength(2);
    expect(l.reduce((sum, x) => sum + x, 0)).toBeCloseTo(13, 6);
    expect(Math.min(...l)).toBeCloseTo(PARKING_END_STALL_M, 6);
    expect(Math.max(...l)).toBeLessThanOrEqual(PARKING_STALL_MAX_M + 1e-6);
    expect(stalls[0]!.from).toBeCloseTo(from, 6);
    expect(stalls[1]!.to).toBeCloseTo(to, 6);
  });

  it('holds two end stalls and a 6.7 m stall between in a 19 m run', () => {
    const { stalls } = runBetween(19);
    const l = lengths(stalls);
    expect(l).toHaveLength(3);
    expect(l[1]).toBeCloseTo(PARKING_STALL_LENGTH_M, 6);
    for (const x of l) {
      expect(x).toBeGreaterThanOrEqual(PARKING_END_STALL_M - 1e-6);
      expect(x).toBeLessThanOrEqual(PARKING_STALL_MAX_M + 1e-6);
    }
  });

  it('lays the same stalls from every tile of a run that spans three tiles', () => {
    const s = street(10, [cutAt('low', 25), cutAt('low', 150)]);
    const first = blockFaceAt(1, ROAD_Z, 'low', s)!;
    expect(first.face.stalls.length).toBeGreaterThan(0);
    for (const x of [2, 3, 4, 5, 6, 7]) {
      expect(blockFaceAt(x, ROAD_Z, 'low', s)!.face.stalls).toEqual(first.face.stalls);
    }
    // The run between the drives crosses at least three tiles.
    const between = first.face.stalls.filter((st) => st.from > 40 && st.to < 145);
    expect(between.length).toBeGreaterThan(10);
  });

  it('credits a lot the stalls of the runs along its frontage, no more', () => {
    const s = street(10, [cutAt('low', 50), cutAt('low', 70), cutAt('low', 110)]);
    const lot = { x: 2, z: ROAD_Z - 2, w: 4, d: 2 };
    const marked = paintedKerbStallsAlong(s, {
      x: lot.x,
      z: ROAD_Z,
      alongX: true,
      tiles: lot.w,
      side: 'low',
    });
    expect(kerbCreditFor(s, lot, 'S')).toBe(marked.length);
  });
});
