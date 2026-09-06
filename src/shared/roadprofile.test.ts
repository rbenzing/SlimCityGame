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
  adoptCustomProfiles,
  admitsAllPieces,
  canJoin,
  CAPACITY_PER_VEH_PER_HOUR,
  carriagewayWidth,
  composeProfile,
  editsOf,
  FIRST_CUSTOM_PROFILE_ID,
  fitsTile,
  canGainAuxiliaryLane,
  hasKerbs,
  KERB_RESERVE_M,
  kerbWidthOf,
  isLayable,
  isPaved,
  isPresetProfileId,
  joinRefusal,
  lanesEachWayRange,
  laneCapacity,
  laneCount,
  laneWidthFor,
  layRefusal,
  laneOptionsFor,
  NO_EDITS,
  presetProfileForTier,
  profileCapacity,
  profileIdForTier,
  profilesEqual,
  rankForTier,
  roadRank,
  profileSpeed,
  profileWidth,
  ROAD_CLASSES,
  ROAD_PRESETS,
  roadClass,
  SATURATION_FLOW_VEH_PER_HOUR,
  speedFromKmh,
  tierForProfile,
  TURN_POCKET_MIN_WIDTH_M,
  withinLaneRange,
  withAuxiliaryLane,
  withTurnPocket,
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

describe('the twelve presets reproduce their tier scalars from the formula', () => {
  it('every spec carries a profile', () => {
    expect(ROAD_PRESETS).toHaveLength(12);
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
  it('presets are ids 1..12 and equal their tier; custom ids start after them', () => {
    expect(FIRST_CUSTOM_PROFILE_ID).toBe(13);
    for (const spec of ROAD_PRESETS) {
      expect(isPresetProfileId(spec.tier)).toBe(true);
      expect(profileIdForTier(spec.tier)).toBe(spec.tier);
    }
    expect(isPresetProfileId(0)).toBe(false);
    expect(isPresetProfileId(FIRST_CUSTOM_PROFILE_ID)).toBe(false);
  });

  describe('a save written before the catalogue grew keeps the roads it drew', () => {
    const shape = (width: number): RoadProfile => ({
      class: 'local',
      pieces: [{ kind: 'travel', width, flow: 'both' }],
    });

    it('moves a custom profile off an id a preset has since claimed, tiles and all', () => {
      // The Ramp took id 12, which this save had already given to a profile
      // the player composed. Read as the preset it now is, every road drawn
      // with it would change shape.
      const tiles = new Uint16Array([0, RoadTier.TwoLane, 12, 12, 20]);
      const table = adoptCustomProfiles(
        [
          { id: 12, profile: shape(3.1) },
          { id: 20, profile: shape(3.9) },
        ],
        tiles,
      );
      const moved = [...table.keys()].find((id) => id !== 20)!;
      expect(moved).toBeGreaterThanOrEqual(FIRST_CUSTOM_PROFILE_ID);
      expect(table.get(moved)).toEqual(shape(3.1));
      expect([...tiles]).toEqual([0, RoadTier.TwoLane, moved, moved, 20]);
      // The id it moves to is free: nothing else in the table wanted it.
      expect(moved).not.toBe(20);
    });

    it('leaves a table already clear of preset ids exactly as it is', () => {
      const tiles = new Uint16Array([RoadTier.Ramp, 20, 21]);
      const table = adoptCustomProfiles(
        [
          { id: 20, profile: shape(3.2) },
          { id: 21, profile: shape(3.3) },
        ],
        tiles,
      );
      expect([...table.keys()].sort((a, b) => a - b)).toEqual([20, 21]);
      // A tile carrying the new preset is a ramp, not a custom id to move.
      expect([...tiles]).toEqual([RoadTier.Ramp, 20, 21]);
    });

    it('is idempotent: adopting an adopted table changes nothing', () => {
      const tiles = new Uint16Array([12, 12]);
      const once = adoptCustomProfiles([{ id: 12, profile: shape(3.1) }], tiles);
      const snapshot = [...tiles];
      const twice = adoptCustomProfiles(
        [...once].map(([id, profile]) => ({ id, profile })),
        tiles,
      );
      expect([...twice.keys()]).toEqual([...once.keys()]);
      expect([...tiles]).toEqual(snapshot);
    });
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
    expect(tierForProfile({ class: 'ramp', pieces: lanes(1) })).toBe(RoadTier.Ramp);
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
      lanesBack: 1,
      middle: 'none',
      postedKmh: 50,
    });
    expect(editsOf(presetProfileForTier(RoadTier.Highway))).toEqual({
      parking: 'none',
      bike: 'none',
      footways: false,
      lanes: 2,
      lanesBack: 2,
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

  it('rebuilds both directions at the lane width its class is built to', () => {
    const p = composeProfile(presetProfileForTier(RoadTier.FourLane), edits({ lanes: 1 }));
    expect(p.pieces.map((x) => x.kind)).toEqual(['travel', 'travel']);
    expect(p.pieces.map((x) => x.flow)).toEqual(['back', 'fwd']);
    // An urban street is built to 11 ft lanes.
    for (const piece of p.pieces) expect(piece.width).toBeCloseTo(laneWidthFor('urban'), 6);
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

describe('asymmetric profiles: a road need not be the same both ways', () => {
  const edits = (over: Partial<typeof NO_EDITS>) => ({ ...NO_EDITS, ...over });

  it('lays two lanes one way and one the other, in that order across the tile', () => {
    const p = composeProfile(
      presetProfileForTier(RoadTier.FourLane),
      edits({ lanes: 1, lanesBack: 2 }),
    );
    expect(p.pieces.map((x) => x.flow)).toEqual(['back', 'back', 'fwd']);
    expect(laneCount(p)).toBe(3);
    expect(isLayable(p)).toBe(true); // urban allows 2..4
  });

  it('reads an asymmetric profile back the way it was written', () => {
    const p = composeProfile(
      presetProfileForTier(RoadTier.FourLane),
      edits({ lanes: 2, lanesBack: 1 }),
    );
    expect(editsOf(p)).toMatchObject({ lanes: 2, lanesBack: 1 });
  });

  it('keeps a road symmetric when only the one count is given', () => {
    const p = composeProfile(presetProfileForTier(RoadTier.FourLane), edits({ lanes: 1 }));
    expect(editsOf(p)).toMatchObject({ lanes: 1, lanesBack: 1 });
  });

  it('reports a preset as the same both ways, and a one-way road as all one way', () => {
    expect(editsOf(presetProfileForTier(RoadTier.Avenue))).toMatchObject({
      lanes: 2,
      lanesBack: 2,
    });
    expect(editsOf(presetProfileForTier(RoadTier.OneWay))).toMatchObject({
      lanes: 2,
      lanesBack: 2, // no lane runs back, so there is nothing else to report
    });
  });

  it('puts the middle between the two directions however they are split', () => {
    const p = composeProfile(
      presetProfileForTier(RoadTier.FourLane),
      edits({ lanes: 1, lanesBack: 2, middle: 'median' }),
    );
    expect(p.pieces.map((x) => x.kind)).toEqual(['travel', 'travel', 'median', 'travel']);
  });

  it('refuses a split the class has no room for', () => {
    // Urban tops out at four lanes; three each way is eight.
    const tooMany = composeProfile(
      presetProfileForTier(RoadTier.FourLane),
      edits({ lanes: 3, lanesBack: 3 }),
    );
    expect(withinLaneRange(tooMany)).toBe(false);
    expect(isLayable(tooMany)).toBe(false);
  });
});

describe('the road hierarchy: which road replaces which', () => {
  const rank = (tier: RoadTier): number => rankForTier(tier);

  it('never lets a farm track cut a motorway, whatever the tier numbers say', () => {
    // Gravel's tier number is higher than the motorway's — it was added later.
    expect(RoadTier.Gravel).toBeGreaterThan(RoadTier.Highway);
    expect(rank(RoadTier.Gravel)).toBeLessThan(rank(RoadTier.Highway));
  });

  it('ranks the roads the way a road network does', () => {
    const order = [
      RoadTier.Gravel,
      RoadTier.Alley,
      RoadTier.TwoLane,
      RoadTier.OneWay,
      RoadTier.FourLane,
      RoadTier.Avenue,
      RoadTier.Highway,
    ];
    for (let i = 1; i < order.length; i++) {
      expect(rank(order[i]!), `${order[i - 1]} then ${order[i]}`).toBeGreaterThan(
        rank(order[i - 1]!),
      );
    }
  });

  it('puts a road carrying a transit lane above the same road without one', () => {
    // A bus lane is an arterial; an avenue is an arterial without the bus lane.
    expect(rank(RoadTier.BusLane)).toBeGreaterThan(rank(RoadTier.Avenue));
    // A tram street is an urban street with rails down it.
    expect(rank(RoadTier.Tram)).toBeGreaterThan(rank(RoadTier.FourLane));
    expect(
      roadRank({ class: 'urban', pieces: [{ kind: 'travel', width: 3.3, flow: 'fwd' }] }),
    ).toBe(rank(RoadTier.FourLane));
  });

  it('leaves a bike lane a local street, so it never wipes an arterial', () => {
    expect(rank(RoadTier.BikeLane)).toBeLessThan(rank(RoadTier.Avenue));
    expect(rank(RoadTier.BikeLane)).toBeLessThan(rank(RoadTier.Highway));
  });
});

describe('lane widths and the lane counts a road is offered, to US standards', () => {
  it('builds each class to the lane width its kind of road uses', () => {
    // 12 ft on an arterial, a divided road and a motorway; 11 ft on a town
    // street and a collector; 10 ft on a local street and a one-way.
    expect(laneWidthFor('arterial')).toBeCloseTo(3.6, 6);
    expect(laneWidthFor('divided')).toBeCloseTo(3.6, 6);
    expect(laneWidthFor('highway')).toBeCloseTo(3.6, 6);
    expect(laneWidthFor('urban')).toBeCloseTo(3.35, 6);
    expect(laneWidthFor('collector')).toBeCloseTo(3.35, 6);
    expect(laneWidthFor('local')).toBeCloseTo(3.05, 6);
    expect(laneWidthFor('oneWay')).toBeCloseTo(3.05, 6);
    expect(laneWidthFor('dirt')).toBeLessThan(laneWidthFor('local'));
  });

  it('offers only the lane counts a tile can actually hold', () => {
    // The catalogue lets an arterial run to six and a motorway to eight, and
    // both are real roads — but six 12 ft lanes are 21.6 m of carriageway on a
    // 16 m tile. Those are two-tile corridors, and until there are two-tile
    // corridors the tool must not hold out what it will then refuse.
    for (const id of ['highway', 'divided', 'arterial', 'urban', 'collector', 'local'] as const) {
      for (const n of laneOptionsFor(id))
        expect(n * laneWidthFor(id)).toBeLessThanOrEqual(TILE_METERS + 1e-6);
    }
    expect(laneOptionsFor('highway')).toEqual([2, 4]);
    expect(laneOptionsFor('divided')).toEqual([4]);
    expect(laneOptionsFor('arterial')).toEqual([4]);
    expect(laneOptionsFor('urban')).toEqual([2, 4]);
    expect(laneOptionsFor('collector')).toEqual([2, 4]);
    expect(laneOptionsFor('local')).toEqual([2]);
    expect(laneOptionsFor('rural')).toEqual([2]);
    expect(laneOptionsFor('dirt')).toEqual([2]);
    expect(laneOptionsFor('alley')).toEqual([2]);
  });

  it('never offers a count the class itself refuses, since offering one is a promise', () => {
    // The steps a road is built in are one table and what a class may run is
    // another; a count in the first that the second refuses is a road the tool
    // offers and then will not lay.
    for (const cls of ROAD_CLASSES) {
      const { min, max } = cls.lanes;
      for (const n of laneOptionsFor(cls.id)) {
        expect(n, `${cls.id} offers ${n}`).toBeGreaterThanOrEqual(min);
        expect(n, `${cls.id} offers ${n}`).toBeLessThanOrEqual(max);
      }
    }
  });

  it('says which rule refused a road, since too wide and too many are not the same thing', () => {
    const street = presetProfileForTier(RoadTier.TwoLane);
    expect(layRefusal(street)).toBeNull();
    // Four 10 ft lanes and two footways are 15.95 m, which the tile holds
    // perfectly well — a local street is simply not that kind of road.
    const four = composeProfile(street, { ...NO_EDITS, lanes: 2, lanesBack: 2 });
    expect(profileWidth(four)).toBeLessThan(TILE_METERS);
    expect(layRefusal(four)).toBe('A local street runs 2 to 3 lanes');
    // And a road that really is too wide says so.
    const wide = composeProfile(presetProfileForTier(RoadTier.Highway), {
      ...NO_EDITS,
      lanes: 4,
      lanesBack: 4,
    });
    expect(layRefusal(wide)).toBe('Too wide for the tile');
  });

  it('is honest about what a 16 m tile holds: four lanes fit, six do not', () => {
    const urban = presetProfileForTier(RoadTier.FourLane);
    const at = (total: number): RoadProfile =>
      composeProfile(urban, { ...NO_EDITS, lanes: total / 2, lanesBack: total / 2 });
    expect(fitsTile(at(2))).toBe(true);
    expect(fitsTile(at(4))).toBe(true);
    // Six 11 ft lanes are 20.1 m of carriageway; the tile is 16 m across, so a
    // six-lane road needs the two-tile corridor.
    expect(profileWidth(at(6))).toBeGreaterThan(TILE_METERS);
    expect(fitsTile(at(6))).toBe(false);
  });
});

describe('turn pockets', () => {
  const travel = (p: RoadProfile): number[] =>
    p.pieces.filter((q) => q.kind === 'travel').map((q) => q.width);

  it('lets a two-lane street earn a left-turn lane out of its verge', () => {
    const street = presetProfileForTier(RoadTier.TwoLane);
    const pocketed = withTurnPocket(street, 1);
    expect(pocketed).not.toBeNull();
    // The lane it gains sits against the centreline, between the two it had.
    expect(pocketed!.pieces.map((p) => p.kind)).toEqual([
      'sidewalk',
      'travel',
      'travel',
      'travel',
      'sidewalk',
    ]);
    expect(pocketed!.pieces[2]).toMatchObject({ flow: 'fwd', width: laneWidthFor('local') });
    // Nothing else moved: both footways and both running lanes are as they
    // were, and the tile still holds the result.
    expect(travel(pocketed!)).toEqual([3.75, laneWidthFor('local'), 3.75]);
    expect(profileWidth(pocketed!)).toBeCloseTo(profileWidth(street) + laneWidthFor('local'), 6);
    expect(fitsTile(pocketed!)).toBe(true);
  });

  it('opens the bay over a taper rather than starting it at full width', () => {
    const street = presetProfileForTier(RoadTier.TwoLane);
    const full = withTurnPocket(street, 1)!;
    const half = withTurnPocket(street, 1, 0.5)!;
    expect(half.pieces[2]!.width).toBeCloseTo(full.pieces[2]!.width / 2, 6);
    // Only the bay grows. The lanes it opens beside are the same lanes.
    expect(travel(half).filter((_, i) => i !== 1)).toEqual(travel(full).filter((_, i) => i !== 1));
    expect(profileWidth(half)).toBeLessThan(profileWidth(full));
    expect(profileWidth(half)).toBeGreaterThan(profileWidth(street));
    // A bay that has not begun to open is simply the road.
    expect(withTurnPocket(street, 1, 0)).toEqual(street);
  });

  it('takes the parking for the whole bay, not a sliver of it per tile', () => {
    // The parking stops before the taper starts: a half-open tile has given up
    // exactly what the tile against the junction has.
    const parked = composeProfile(presetProfileForTier(RoadTier.TwoLane), {
      ...NO_EDITS,
      parking: 'both',
    });
    const kerbs = (p: RoadProfile): number[] =>
      p.pieces.filter((q) => q.kind === 'parking').map((q) => q.width);
    expect(kerbs(withTurnPocket(parked, 1, 0.25)!)).toEqual(kerbs(withTurnPocket(parked, 1)!));
  });

  it('refuses a bay the full width cannot have, however little of it is open', () => {
    // The taper never rescues a road that has no room for the bay at all.
    expect(withTurnPocket(presetProfileForTier(RoadTier.FourLane), 1, 0.25)).toBeNull();
  });

  it('gives the pocket to whichever half is the one approaching', () => {
    const street = presetProfileForTier(RoadTier.TwoLane);
    expect(withTurnPocket(street, -1)!.pieces[2]).toMatchObject({ flow: 'back' });
    expect(withTurnPocket(street, 1)!.pieces[2]).toMatchObject({ flow: 'fwd' });
  });

  it('takes the kerbside parking, then the width of the lane beside it, when the verge is short', () => {
    const parked = composeProfile(presetProfileForTier(RoadTier.TwoLane), {
      ...NO_EDITS,
      parking: 'both',
    });
    expect(TILE_METERS - profileWidth(parked)).toBeLessThan(TURN_POCKET_MIN_WIDTH_M);
    const pocketed = withTurnPocket(parked, 1)!;
    // The parking bay on the approaching side is gone; the one on the other
    // side is not, since the pocket is not on that side of the road.
    expect(pocketed.pieces.filter((p) => p.kind === 'parking')).toHaveLength(1);
    expect(travel(pocketed)).toHaveLength(3);
    expect(profileWidth(pocketed)).toBeLessThanOrEqual(TILE_METERS + 1e-9);
    for (const width of travel(pocketed))
      expect(width).toBeGreaterThanOrEqual(TURN_POCKET_MIN_WIDTH_M - 1e-9);
  });

  it('cuts a divided road’s turn bay out of the median, which is where one has always gone', () => {
    const divided: RoadProfile = {
      class: 'divided',
      kerbs: true,
      pieces: [
        { kind: 'travel', width: 2.95, flow: 'back' },
        { kind: 'travel', width: 2.95, flow: 'back' },
        { kind: 'median', width: 1.8 },
        { kind: 'travel', width: 2.95, flow: 'fwd' },
        { kind: 'travel', width: 2.95, flow: 'fwd' },
      ],
    };
    const pocketed = withTurnPocket(divided, 1)!;
    expect(pocketed.pieces.some((p) => p.kind === 'median')).toBe(false);
    expect(travel(pocketed)).toHaveLength(5);
    // The bay sits against the centreline on the approaching half, and the
    // road still leaves its kerbs somewhere to stand.
    expect(pocketed.pieces[2]).toMatchObject({ kind: 'travel', flow: 'fwd' });
    expect(pocketed.pieces[2]!.width).toBeGreaterThanOrEqual(TURN_POCKET_MIN_WIDTH_M - 1e-9);
    expect(profileWidth(pocketed)).toBeLessThanOrEqual(TILE_METERS - 2 * KERB_RESERVE_M + 1e-9);
    // The half going the other way never noticed.
    expect(pocketed.pieces.slice(0, 2)).toEqual(divided.pieces.slice(0, 2));
  });

  it('leaves every road somewhere to stand its kerb, whatever the bay costs', () => {
    // A carriageway laid edge to edge has nowhere for the kerb, the lamp or
    // the signal the bay exists to queue at — so the bay never spends the last
    // of the tile.
    for (const tier of [RoadTier.TwoLane, RoadTier.Avenue, RoadTier.FourLane] as const) {
      const preset = presetProfileForTier(tier);
      const pocketed = withTurnPocket(preset, 1);
      if (!pocketed || !hasKerbs(pocketed) || pocketed.pieces.some((p) => p.kind === 'sidewalk'))
        continue;
      expect(kerbWidthOf(pocketed)).toBeGreaterThanOrEqual(KERB_RESERVE_M - 1e-9);
    }
  });

  it('refuses where the width simply is not there', () => {
    // Four 12 ft lanes leave a metre of a 16 m tile; a lane is three.
    expect(withTurnPocket(presetProfileForTier(RoadTier.FourLane), 1)).toBeNull();
    expect(withTurnPocket(presetProfileForTier(RoadTier.Highway), 1)).toBeNull();
    // The avenue is the near miss: 15 m of carriageway in a 16 m tile, with a
    // 1.8 m median to give and inner lanes already under the 10 ft floor. Even
    // spending the median it cannot find a bay AND keep a kerb, so it gets
    // neither — the six-lane divided road that can is a two-tile corridor.
    expect(withTurnPocket(presetProfileForTier(RoadTier.Avenue), 1)).toBeNull();
  });

  it('never takes a reserved lane for it', () => {
    // The bus and bike presets have width beside the traffic lanes, but it
    // belongs to somebody else.
    expect(withTurnPocket(presetProfileForTier(RoadTier.BusLane), 1)).toBeNull();
    expect(withTurnPocket(presetProfileForTier(RoadTier.BikeLane), 1)).toBeNull();
  });

  it('has nothing to add to a road that turns from a lane of its own already', () => {
    const withTurnLane = composeProfile(presetProfileForTier(RoadTier.TwoLane), {
      ...NO_EDITS,
      middle: 'turn',
    });
    expect(withTurnPocket(withTurnLane, 1)).toBeNull();
    expect(withTurnPocket(withTurnLane, -1)).toBeNull();
  });

  it("puts a one-way's pocket against the left kerb, which is what a left turn goes from", () => {
    const oneWay = presetProfileForTier(RoadTier.OneWay);
    // Every lane approaches, so the side the caller names says nothing.
    for (const side of [1, -1] as const) {
      const pocketed = withTurnPocket(oneWay, side)!;
      expect(pocketed.pieces.map((p) => p.kind)).toEqual([
        'sidewalk',
        'travel',
        'travel',
        'travel',
        'sidewalk',
      ]);
      expect(pocketed.pieces[1]).toMatchObject({ flow: 'fwd', width: laneWidthFor('oneWay') });
    }
  });

  it('has no pocket to offer a railway', () => {
    expect(withTurnPocket(presetProfileForTier(RoadTier.RailTrack), 1)).toBeNull();
  });
});

describe('the auxiliary lane a motorway grows beside a slip road', () => {
  const slimMotorway: RoadProfile = {
    class: 'highway',
    kerbs: true,
    pieces: [
      { kind: 'travel', width: 3.75, flow: 'back' },
      { kind: 'travel', width: 3.75, flow: 'fwd' },
    ],
  };

  it('adds a lane against the kerb on the side asked for, carrying that side’s traffic', () => {
    const right = withAuxiliaryLane(slimMotorway, 1)!;
    expect(right.pieces.map((p) => p.kind)).toEqual(['travel', 'travel', 'travel']);
    // Outside everything the road already carries on that side, and going the
    // way the lane it stands beside goes.
    expect(right.pieces[2]).toMatchObject({ flow: 'fwd' });
    expect(carriagewayWidth(right)).toBeCloseTo(
      carriagewayWidth(slimMotorway) + laneWidthFor('highway'),
      6,
    );
    const left = withAuxiliaryLane(slimMotorway, -1)!;
    expect(left.pieces[0]).toMatchObject({ kind: 'travel', flow: 'back' });
  });

  it('opens over a taper, like every other lane a road gains for one junction', () => {
    const half = withAuxiliaryLane(slimMotorway, 1, 0.5)!;
    const full = withAuxiliaryLane(slimMotorway, 1)!;
    expect(half.pieces[2]!.width).toBeCloseTo(full.pieces[2]!.width / 2, 6);
    expect(withAuxiliaryLane(slimMotorway, 1, 0)).toEqual(slimMotorway);
  });

  it('refuses the four-lane motorway, which fills its tile already', () => {
    // 15 m of carriageway and half a metre of kerb each side is the whole 16 m.
    // A motorway with an auxiliary lane is a road for two tiles.
    expect(withAuxiliaryLane(presetProfileForTier(RoadTier.Highway), 1)).toBeNull();
    expect(canGainAuxiliaryLane(presetProfileForTier(RoadTier.Highway), -1)).toBe(false);
    expect(canGainAuxiliaryLane(slimMotorway, 1)).toBe(true);
  });

  it('leaves the road somewhere to stand its kerb, as a turn bay does', () => {
    const widened = withAuxiliaryLane(slimMotorway, 1)!;
    expect(profileWidth(widened)).toBeLessThanOrEqual(TILE_METERS - 2 * KERB_RESERVE_M + 1e-9);
  });
});
