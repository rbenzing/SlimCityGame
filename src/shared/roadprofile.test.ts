import { describe, expect, it } from 'vitest';
import {
  ALLEY_HALF_WIDTH_FRACTION,
  AVENUE_HALF_WIDTH_FRACTION,
  BIKE_LANE_HALF_WIDTH_FRACTION,
  BUS_LANE_HALF_WIDTH_FRACTION,
  FOUR_LANE_HALF_WIDTH_FRACTION,
  GRAVEL_HALF_WIDTH_FRACTION,
  HIGHWAY_HALF_WIDTH_FRACTION,
  RAIL_HALF_WIDTH_FRACTION,
  TRAM_HALF_WIDTH_FRACTION,
  TWO_LANE_HALF_WIDTH_FRACTION,
} from '../render/roadsmesh';
import { TILE_METERS } from './constants';
import {
  admitsAllPieces,
  canJoin,
  CAPACITY_PER_VEH_PER_HOUR,
  carriagewayWidth,
  composeProfile,
  editsOf,
  FIRST_CUSTOM_PROFILE_ID,
  fitsTile,
  hasKerbs,
  isLayable,
  isPaved,
  DEFAULT_PIECE_WIDTHS,
  isPresetProfileId,
  joinRefusal,
  lanesEachWayRange,
  laneCapacity,
  laneCount,
  NO_EDITS,
  presetProfileForTier,
  profileCapacity,
  profileIdForTier,
  profilesEqual,
  profileSpeed,
  profileWidth,
  ROAD_CLASSES,
  ROAD_PRESETS,
  roadClass,
  SATURATION_FLOW_VEH_PER_HOUR,
  speedFromKmh,
  tierForProfile,
  withinLaneRange,
} from './roadprofile';
import type { RoadClassId, RoadProfile, RoadSpec } from './types';
import { RoadTier } from './types';

const presetProfile = (tier: RoadTier): RoadProfile => presetProfileForTier(tier);

describe('units — the sim already speaks m/s and seconds', () => {
  it('converts posted km/h to the speeds roads.json has always carried', () => {
    expect(speedFromKmh(50)).toBe(14);
    expect(speedFromKmh(65)).toBe(18);
    expect(speedFromKmh(100)).toBe(28);
    expect(speedFromKmh(30)).toBe(8);
  });

  it('calibrates capacity so two local lanes at 700 veh/h are the two-lane 600', () => {
    expect(CAPACITY_PER_VEH_PER_HOUR).toBeCloseTo(3 / 7, 10);
    expect(SATURATION_FLOW_VEH_PER_HOUR).toBe(1900);
    expect(2 * Math.round(1900 * 0.37) * CAPACITY_PER_VEH_PER_HOUR).toBeCloseTo(600, -1);
  });
});

describe('per-lane capacity by class (HCM saturation flow × green ratio × k)', () => {
  const expected: Record<RoadClassId, number> = {
    dirt: 100,
    alley: 175,
    rural: 400,
    local: 300,
    urban: 300,
    collector: 350,
    arterial: 400,
    divided: 450,
    oneWay: 550,
    highway: 1000,
    ramp: 850,
    rail: 0,
  };
  for (const [id, cap] of Object.entries(expected) as [RoadClassId, number][]) {
    it(`${id} lane = ${cap}`, () => {
      expect(laneCapacity(id)).toBe(cap);
    });
  }

  it('keeps the motorway-to-local ratio the HCM gives (≈ 3.3 : 1)', () => {
    expect(laneCapacity('highway') / laneCapacity('local')).toBeCloseTo(3.33, 1);
  });
});

describe('class table sanity', () => {
  it('names twelve classes, each with a coherent speed range and lane range', () => {
    expect(ROAD_CLASSES).toHaveLength(12);
    for (const cls of ROAD_CLASSES) {
      expect(cls.postedKmh.min).toBeLessThanOrEqual(cls.postedKmh.default);
      expect(cls.postedKmh.default).toBeLessThanOrEqual(cls.postedKmh.max);
      expect(cls.lanes.min).toBeLessThanOrEqual(cls.lanes.max);
      if (cls.id !== 'rail') expect(cls.admits).toContain('travel');
    }
  });

  it('only highway and ramp refuse water and zoning; only dirt is gravel, only rail ballast', () => {
    const dry = ROAD_CLASSES.filter((c) => !c.carriesWater).map((c) => c.id);
    expect(dry.sort()).toEqual(['highway', 'ramp']);
    const unzonable = ROAD_CLASSES.filter((c) => !c.zonable).map((c) => c.id);
    expect(unzonable.sort()).toEqual(['highway', 'rail', 'ramp']);
    expect(ROAD_CLASSES.filter((c) => c.surface === 'gravel').map((c) => c.id)).toEqual(['dirt']);
    expect(ROAD_CLASSES.filter((c) => c.surface === 'ballast').map((c) => c.id)).toEqual(['rail']);
  });

  it('a highway never admits a footway, and a ramp is one-directional travel only', () => {
    expect(roadClass('highway').admits).not.toContain('sidewalk');
    expect(roadClass('highway').admits).not.toContain('parking');
    expect(roadClass('ramp').admits).toEqual(['travel', 'shoulder']);
  });
});

describe('the eleven presets reproduce their tier scalars from the formula', () => {
  it('every spec carries a profile', () => {
    expect(ROAD_PRESETS).toHaveLength(11);
    for (const spec of ROAD_PRESETS) expect(spec.profile).toBeDefined();
  });

  for (const spec of ROAD_PRESETS as RoadSpec[]) {
    const p = spec.profile!;
    describe(spec.name, () => {
      it('Σ piece capacity equals the catalogue capacity', () => {
        expect(profileCapacity(p)).toBe(spec.capacity);
      });
      it('class (or posted) speed equals the catalogue speed', () => {
        expect(profileSpeed(p)).toBe(spec.speed);
      });
      it('fits the tile, holds only admitted pieces, and sits in its class lane range', () => {
        expect(fitsTile(p)).toBe(true);
        expect(admitsAllPieces(p)).toBe(true);
        expect(withinLaneRange(p)).toBe(true);
      });
      it('agrees with the spec on water and one-way', () => {
        expect(roadClass(p.class).carriesWater).toBe(spec.carriesWater ?? true);
        const oneWay = p.pieces.filter((x) => x.kind === 'travel').every((x) => x.flow === 'fwd');
        expect(oneWay && p.pieces.some((x) => x.kind === 'travel')).toBe(spec.oneWay === true);
      });
    });
  }
});

describe('preset carriageways match the widths the render already draws', () => {
  const widths: [RoadTier, number][] = [
    [RoadTier.TwoLane, TWO_LANE_HALF_WIDTH_FRACTION],
    [RoadTier.Avenue, AVENUE_HALF_WIDTH_FRACTION],
    [RoadTier.Highway, HIGHWAY_HALF_WIDTH_FRACTION],
    [RoadTier.Gravel, GRAVEL_HALF_WIDTH_FRACTION],
    [RoadTier.Alley, ALLEY_HALF_WIDTH_FRACTION],
    [RoadTier.OneWay, TWO_LANE_HALF_WIDTH_FRACTION],
    [RoadTier.FourLane, FOUR_LANE_HALF_WIDTH_FRACTION],
    [RoadTier.BusLane, BUS_LANE_HALF_WIDTH_FRACTION],
    [RoadTier.BikeLane, BIKE_LANE_HALF_WIDTH_FRACTION],
    [RoadTier.Tram, TRAM_HALF_WIDTH_FRACTION],
    [RoadTier.RailTrack, RAIL_HALF_WIDTH_FRACTION],
  ];
  for (const [tier, halfFraction] of widths) {
    it(`tier ${tier} carriageway = ${halfFraction * 2 * TILE_METERS} m`, () => {
      expect(carriagewayWidth(presetProfile(tier))).toBeCloseTo(halfFraction * 2 * TILE_METERS, 6);
    });
  }

  it('kerbs and paving follow the render: footways or an explicit kerb, gravel and ballast unpainted', () => {
    expect(hasKerbs(presetProfile(RoadTier.TwoLane))).toBe(true);
    expect(hasKerbs(presetProfile(RoadTier.Highway))).toBe(true);
    expect(hasKerbs(presetProfile(RoadTier.Avenue))).toBe(true);
    expect(hasKerbs(presetProfile(RoadTier.Gravel))).toBe(false);
    expect(hasKerbs(presetProfile(RoadTier.Alley))).toBe(false);
    expect(hasKerbs(presetProfile(RoadTier.RailTrack))).toBe(false);
    expect(isPaved(presetProfile(RoadTier.Gravel))).toBe(false);
    expect(isPaved(presetProfile(RoadTier.RailTrack))).toBe(false);
    expect(isPaved(presetProfile(RoadTier.Alley))).toBe(true);
  });
});

describe('profile ids and the tier a profile is nearest to', () => {
  it('presets are ids 1..11 and equal their tier; custom ids start at 12', () => {
    expect(FIRST_CUSTOM_PROFILE_ID).toBe(12);
    for (const spec of ROAD_PRESETS) {
      expect(isPresetProfileId(spec.tier)).toBe(true);
      expect(profileIdForTier(spec.tier)).toBe(spec.tier);
    }
    expect(isPresetProfileId(0)).toBe(false);
    expect(isPresetProfileId(12)).toBe(false);
  });

  it('every preset profile maps back to its own tier', () => {
    for (const spec of ROAD_PRESETS) expect(tierForProfile(spec.profile!)).toBe(spec.tier);
  });

  it('a composed profile lands on the preset that shares its role, transit lanes first', () => {
    const lanes = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        kind: 'travel' as const,
        width: 3.5,
        flow: i < n / 2 ? ('back' as const) : ('fwd' as const),
      }));
    expect(tierForProfile({ class: 'collector', pieces: lanes(4) })).toBe(RoadTier.FourLane);
    expect(tierForProfile({ class: 'divided', pieces: lanes(4) })).toBe(RoadTier.Avenue);
    expect(tierForProfile({ class: 'rural', pieces: lanes(2) })).toBe(RoadTier.TwoLane);
    expect(tierForProfile({ class: 'ramp', pieces: lanes(1) })).toBe(RoadTier.OneWay);
    expect(
      tierForProfile({
        class: 'collector',
        pieces: [...lanes(2), { kind: 'bus', width: 3.5, flow: 'fwd' }],
      }),
    ).toBe(RoadTier.BusLane);
    expect(
      tierForProfile({
        class: 'local',
        pieces: [{ kind: 'travel', width: 3.5, flow: 'both', tram: true }],
      }),
    ).toBe(RoadTier.Tram);
  });
});

describe('composing a profile from a preset and the player’s edits', () => {
  const twoLane = () => presetProfileForTier(RoadTier.TwoLane);

  it('no edits composes back to the preset exactly', () => {
    for (const spec of ROAD_PRESETS) {
      expect(profilesEqual(composeProfile(spec.profile!, NO_EDITS), spec.profile!)).toBe(true);
    }
  });

  it('adds a parking lane inside each footway and the width adds up', () => {
    const p = composeProfile(twoLane(), { ...NO_EDITS, parking: 'both' });
    expect(p.pieces.map((x) => x.kind)).toEqual([
      'sidewalk',
      'parking',
      'travel',
      'travel',
      'parking',
      'sidewalk',
    ]);
    expect(profileWidth(p)).toBeCloseTo(7.5 + 2 * 2.25 + 2 * 1.875, 6);
    expect(isLayable(p)).toBe(true);
    expect(tierForProfile(p)).toBe(RoadTier.TwoLane);
  });

  it('puts a bike lane between the footway and the parking lane, on the side asked for', () => {
    const p = composeProfile(twoLane(), { ...NO_EDITS, parking: 'left', bike: 'right' });
    expect(p.pieces.map((x) => x.kind)).toEqual([
      'sidewalk',
      'parking',
      'travel',
      'travel',
      'bike',
      'sidewalk',
    ]);
    expect(p.pieces.find((x) => x.kind === 'bike')?.flow).toBe('fwd');
    expect(tierForProfile(p)).toBe(RoadTier.BikeLane);
  });

  it('refuses what the tile cannot hold: parking and bike lanes on both sides of a two-lane', () => {
    const p = composeProfile(twoLane(), { ...NO_EDITS, parking: 'both', bike: 'both' });
    expect(profileWidth(p)).toBeGreaterThan(16);
    expect(isLayable(p)).toBe(false);
  });

  it('turning footways off drops the kerbs a two-lane got from them', () => {
    const p = composeProfile(twoLane(), { ...NO_EDITS, footways: false });
    expect(p.pieces.map((x) => x.kind)).toEqual(['travel', 'travel']);
    expect(hasKerbs(p)).toBe(false);
  });

  it('cannot add footways to an avenue whose carriageway already fills the tile', () => {
    const p = composeProfile(presetProfileForTier(RoadTier.Avenue), {
      ...NO_EDITS,
      footways: true,
    });
    expect(isLayable(p)).toBe(false);
  });

  it('stripping the bike lanes from the bike-lane preset gives the two-lane preset', () => {
    const p = composeProfile(presetProfileForTier(RoadTier.BikeLane), {
      ...NO_EDITS,
      bike: 'none',
    });
    expect(profilesEqual(p, twoLane())).toBe(true);
  });

  it('reads a preset back the way edits are written', () => {
    expect(editsOf(presetProfileForTier(RoadTier.BikeLane))).toEqual({
      parking: 'none',
      bike: 'both',
      footways: true,
      lanes: 1,
      middle: 'none',
      postedKmh: 50,
    });
    expect(editsOf(presetProfileForTier(RoadTier.Highway))).toEqual({
      parking: 'none',
      bike: 'none',
      footways: false,
      lanes: 2,
      middle: 'none',
      postedKmh: 100,
    });
    expect(editsOf(presetProfileForTier(RoadTier.Avenue))).toMatchObject({
      lanes: 2,
      middle: 'median',
    });
    // A one-way road counts every lane it has, since they all run one way.
    expect(editsOf(presetProfileForTier(RoadTier.OneWay))).toMatchObject({ lanes: 2 });
    // A tram preset carries its own posted speed rather than the class default.
    expect(editsOf(presetProfileForTier(RoadTier.Tram))).toMatchObject({ postedKmh: 58 });
  });

  it('keeps the core untouched: a bus preset’s reserved lanes survive an edge edit', () => {
    const p = composeProfile(presetProfileForTier(RoadTier.BusLane), {
      ...NO_EDITS,
      footways: true,
    });
    expect(p.pieces.filter((x) => x.kind === 'bus')).toHaveLength(2);
    expect(p.kerbs).toBe(true);
  });
});

describe('composition rules the editor will enforce', () => {
  it('counts reserved bus and tram lanes as lanes, and a shared lane for both directions', () => {
    expect(laneCount(presetProfile(RoadTier.BusLane))).toBe(4);
    expect(laneCount(presetProfile(RoadTier.Alley))).toBe(2);
    expect(laneCount(presetProfile(RoadTier.Tram))).toBe(2);
  });

  it('a four-lane street with footways does not fit one tile, and gives up the footways', () => {
    const withFootways: RoadProfile = {
      class: 'urban',
      pieces: [
        { kind: 'sidewalk', width: 1.9 },
        { kind: 'travel', width: 3.5, flow: 'back' },
        { kind: 'travel', width: 3.5, flow: 'back' },
        { kind: 'travel', width: 3.5, flow: 'fwd' },
        { kind: 'travel', width: 3.5, flow: 'fwd' },
        { kind: 'sidewalk', width: 1.9 },
      ],
    };
    expect(fitsTile(withFootways)).toBe(false);
    expect(fitsTile({ ...withFootways, pieces: withFootways.pieces.slice(1, -1) })).toBe(true);
  });

  it('a local street with a centre turn lane and two bike lanes fits', () => {
    const p: RoadProfile = {
      class: 'local',
      pieces: [
        { kind: 'sidewalk', width: 1.9 },
        { kind: 'bike', width: 1.6, flow: 'back' },
        { kind: 'travel', width: 3.5, flow: 'back' },
        { kind: 'centreTurn', width: 3.5 },
        { kind: 'travel', width: 3.5, flow: 'fwd' },
        { kind: 'bike', width: 1.6, flow: 'fwd' },
      ],
    };
    expect(fitsTile(p)).toBe(true);
    expect(admitsAllPieces(p)).toBe(true);
    expect(withinLaneRange(p)).toBe(true);
    expect(profileCapacity(p)).toBe(2 * 300 + 2 * 75);
  });

  it('refuses a piece the class does not admit and a lane count outside the class', () => {
    const parkedHighway: RoadProfile = {
      class: 'highway',
      pieces: [
        { kind: 'parking', width: 2.25 },
        { kind: 'travel', width: 3.5, flow: 'fwd' },
        { kind: 'travel', width: 3.5, flow: 'back' },
      ],
    };
    expect(admitsAllPieces(parkedHighway)).toBe(false);
    const sixLaneLocal: RoadProfile = {
      class: 'local',
      pieces: Array.from({ length: 6 }, (_, i) => ({
        kind: 'travel' as const,
        width: 2.5,
        flow: i < 3 ? ('back' as const) : ('fwd' as const),
      })),
    };
    expect(withinLaneRange(sixLaneLocal)).toBe(false);
  });

  it('clamps a posted speed to the class range', () => {
    expect(profileSpeed({ class: 'local', postedKmh: 90, pieces: [] })).toBe(speedFromKmh(50));
    expect(profileSpeed({ class: 'highway', postedKmh: 30, pieces: [] })).toBe(speedFromKmh(90));
  });
});

describe('which roads may meet', () => {
  const streets: RoadClassId[] = [
    'dirt',
    'alley',
    'rural',
    'local',
    'urban',
    'collector',
    'arterial',
    'divided',
    'oneWay',
  ];

  it('every street class meets every other street class, both ways', () => {
    for (const a of streets) for (const b of streets) expect(canJoin(a, b)).toBe(true);
  });

  it('a motorway reaches every paved street, so it has a way into the city', () => {
    for (const ok of [
      'highway',
      'ramp',
      'rural',
      'local',
      'urban',
      'collector',
      'arterial',
      'divided',
      'oneWay',
    ] as RoadClassId[]) {
      expect(canJoin('highway', ok)).toBe(true);
      expect(canJoin(ok, 'highway')).toBe(true);
    }
  });

  it('neither a motorway nor a ramp runs onto a farm track or a service alley', () => {
    for (const fast of ['highway', 'ramp'] as RoadClassId[]) {
      for (const slow of ['dirt', 'alley'] as RoadClassId[]) {
        expect(canJoin(fast, slow)).toBe(false);
        expect(canJoin(slow, fast)).toBe(false);
      }
    }
  });

  it('rail is a separate network, so it may sit beside anything', () => {
    for (const c of [...streets, 'highway', 'ramp'] as RoadClassId[])
      expect(canJoin('rail', c)).toBe(true);
  });

  it('phrases the refusal from the side that carries the rule, whichever order is asked', () => {
    const text = "A highway can't meet a dirt road";
    expect(joinRefusal('highway', 'dirt')).toBe(text);
    expect(joinRefusal('dirt', 'highway')).toBe(text);
    expect(joinRefusal('ramp', 'alley')).toBe("A ramp can't meet an alley");
    expect(joinRefusal('highway', 'local')).toBeNull();
    expect(joinRefusal('local', 'urban')).toBeNull();
  });
});

describe('the class drawer: lanes, what separates them, and the posted speed', () => {
  const edits = (over: Partial<typeof NO_EDITS>) => ({ ...NO_EDITS, ...over });

  it('leaves the core exactly as the preset has it while the count and the middle are unchanged', () => {
    for (const spec of ROAD_PRESETS) {
      const base = spec.profile!;
      const same = composeProfile(base, edits({ lanes: editsOf(base).lanes }));
      expect(profilesEqual(same, base), spec.name).toBe(true);
    }
  });

  it('rebuilds both directions at the class-default lane width when the count changes', () => {
    const p = composeProfile(presetProfileForTier(RoadTier.FourLane), edits({ lanes: 1 }));
    expect(p.pieces.map((x) => x.kind)).toEqual(['travel', 'travel']);
    expect(p.pieces.map((x) => x.flow)).toEqual(['back', 'fwd']);
    for (const piece of p.pieces) expect(piece.width).toBeCloseTo(DEFAULT_PIECE_WIDTHS.travel, 6);
    expect(laneCount(p)).toBe(2);
  });

  it('keeps a one-way road one-way, and counts its lanes as the lanes it has', () => {
    const p = composeProfile(presetProfileForTier(RoadTier.OneWay), edits({ lanes: 3 }));
    const travel = p.pieces.filter((x) => x.kind === 'travel');
    expect(travel).toHaveLength(3);
    expect(travel.every((x) => x.flow === 'fwd')).toBe(true);
    expect(laneCount(p)).toBe(3);
  });

  it('keeps a reserved bus lane at each kerb of the carriageway when the general lanes change', () => {
    const p = composeProfile(presetProfileForTier(RoadTier.BusLane), edits({ lanes: 2 }));
    expect(p.pieces.map((x) => x.kind)).toEqual([
      'bus',
      'travel',
      'travel',
      'travel',
      'travel',
      'bus',
    ]);
  });

  it('keeps a tram running on the lanes it rebuilds', () => {
    const p = composeProfile(presetProfileForTier(RoadTier.Tram), edits({ lanes: 2 }));
    const travel = p.pieces.filter((x) => x.kind === 'travel');
    expect(travel).toHaveLength(4);
    expect(travel.every((x) => x.tram === true)).toBe(true);
  });

  it('puts a median or a turn lane between the directions, and takes it away again', () => {
    const two = presetProfileForTier(RoadTier.FourLane);
    const median = composeProfile(two, edits({ middle: 'median' }));
    expect(median.pieces.map((x) => x.kind)).toEqual([
      'travel',
      'travel',
      'median',
      'travel',
      'travel',
    ]);
    const turn = composeProfile(two, edits({ middle: 'turn' }));
    expect(turn.pieces.filter((x) => x.kind === 'centreTurn')).toHaveLength(1);
    const plain = composeProfile(presetProfileForTier(RoadTier.Avenue), edits({ middle: 'none' }));
    expect(plain.pieces.some((x) => x.kind === 'median')).toBe(false);
    expect(plain.pieces.filter((x) => x.kind === 'travel')).toHaveLength(4);
  });

  it('counts a centre turn lane as the third lane of a three-lane street', () => {
    const p = composeProfile(presetProfileForTier(RoadTier.TwoLane), edits({ middle: 'turn' }));
    expect(laneCount(p)).toBe(3);
    expect(isLayable(p)).toBe(true); // a local street's lane range is 2..3
  });

  it('a one-way road has no two sides, so it gets no median', () => {
    const p = composeProfile(presetProfileForTier(RoadTier.OneWay), edits({ middle: 'median' }));
    expect(p.pieces.some((x) => x.kind === 'median')).toBe(false);
  });

  it('carries a posted speed only when it says something the class default does not', () => {
    const base = presetProfileForTier(RoadTier.TwoLane);
    const def = roadClass(base.class).postedKmh.default;
    expect(composeProfile(base, edits({ postedKmh: def })).postedKmh).toBeUndefined();
    expect(profilesEqual(composeProfile(base, edits({ postedKmh: def })), base)).toBe(true);
    const slow = composeProfile(base, edits({ postedKmh: 30 }));
    expect(slow.postedKmh).toBe(30);
    expect(profileSpeed(slow)).toBe(speedFromKmh(30));
  });

  it('clamps a posted speed to the class range rather than refusing it', () => {
    // An arterial's default sits inside its range, so both ends are visible.
    const base = presetProfileForTier(RoadTier.Avenue);
    const cls = roadClass(base.class);
    expect(cls.postedKmh.default).toBeGreaterThan(cls.postedKmh.min);
    expect(composeProfile(base, edits({ postedKmh: 5 })).postedKmh).toBe(cls.postedKmh.min);
    expect(composeProfile(base, edits({ postedKmh: 200 })).postedKmh).toBe(cls.postedKmh.max);
  });

  it('offers the lane counts each way that keep the class in its range', () => {
    expect(lanesEachWayRange('local', false)).toEqual({ min: 1, max: 1 });
    expect(lanesEachWayRange('urban', false)).toEqual({ min: 1, max: 2 });
    expect(lanesEachWayRange('divided', false)).toEqual({ min: 2, max: 4 });
    expect(lanesEachWayRange('oneWay', true)).toEqual({ min: 1, max: 5 });
  });

  it('refuses a widening the tile cannot hold, and takes it with the footways dropped', () => {
    const base = presetProfileForTier(RoadTier.FourLane);
    const wide = composeProfile(base, edits({ lanes: 2, footways: true }));
    expect(isLayable(wide)).toBe(false);
    expect(isLayable(composeProfile(base, edits({ lanes: 2, footways: false })))).toBe(true);
  });
});
