import { MAP_SIZE, tileIndex } from '../../src/shared/constants';
import { RoadTier, ZoneType } from '../../src/shared/types';
import {
  composeProfile,
  FIRST_CUSTOM_PROFILE_ID,
  NO_EDITS,
  presetProfileForTier,
} from '../../src/shared/roadprofile';
import type { Command, CommandAck, MapData, TilePoint } from '../../src/shared/types';
import { ClientGridMirror } from '../../src/app/clientgrid';
import {
  column,
  feedMirror,
  flatMap,
  makeHarness,
  rows,
  roadRow,
  send,
  sixLaneCommands,
  type Harness,
} from './sim';

/** The motorway's own section with a 4.5 m sound wall each side; the six-lane road takes the first id. */
export const WALLED_MOTORWAY_PROFILE_ID = FIRST_CUSTOM_PROFILE_ID + 1;
export const WALLED_MOTORWAY = composeProfile(presetProfileForTier(RoadTier.Highway), {
  ...NO_EDITS,
  soundWall: 'both',
  soundWallHeight: 4.5,
});

/**
 * The small town every interaction regression grows: every road type, every
 * zone, every service, garbage, a bus line, a railway and a tramway, and
 * farmland off a dirt road — each step one batch a player could have sent.
 *
 * North to south (z grows southward):
 *
 *   z  40      rail track, x 58–124, with a station at each end
 *   z  41–43   a landfill between the track and the station road
 *   z  44      station road, homes and shops along its south side
 *   z  57      the road out to the motorway ramp, x 130–151
 *   z  70–74   a river, which the avenue and the ramp road bridge
 *   z  85      tramway, x 50–129, drawn after the avenue and crossing it
 *   z 100      main street (two-lane), x 50–130, the town centre, carried on
 *              east to x 140 across a six-lane road at x 134–135, z 88–111
 *   z 101–129  one-way street (x 60), alley (x 70), bus lane (x 120)
 *   z 115      bike lane, x 91–119
 *   z 130      four-lane road, x 50–130, industry, power and the incinerator
 *   z 146–151  an airfield beside the avenue
 *   z 160      dirt road, x 50–130, farms south of it — joined to the town by a
 *              power line down from the avenue's end and along it, and by no
 *              road, so no water main reaches it
 *   x  90      the avenue, z 44–150, joining the rest
 *   x 150      the motorway, z 60–160, southbound, fed by a ramp at x 151,
 *              walled both sides from z 80 down past the town
 */
export const TOWN_SEED = 1337;

export const RIVER = { z0: 70, z1: 74, bed: -3 } as const;

export const TOWN = {
  rail: { z: 40, x0: 58, x1: 124 },
  stationWest: { x: 60, z: 41 },
  stationEast: { x: 120, z: 41 },
  stationRoad: { z: 44 },
  tram: { z: 85, x0: 50, x1: 129 },
  // Either side of the avenue, so the line only runs if the tram crosses it.
  tramStops: [
    { x: 55, z: 85 },
    { x: 110, z: 85 },
  ],
  main: { z: 100, x0: 50, x1: 130 },
  mainEast: { x0: 131, x1: 140 },
  sixLane: { x: 134, z0: 88, z1: 111 },
  avenue: { x: 90, z0: 44, z1: 150 },
  oneWay: { x: 60, z0: 101, z1: 129 },
  alley: { x: 70, z0: 101, z1: 112 },
  busLane: { x: 120, z0: 101, z1: 129 },
  bikeLane: { z: 115, x0: 91, x1: 119 },
  fourLane: { z: 130, x0: 50, x1: 130 },
  dirt: { z: 160, x0: 50, x1: 130 },
  motorway: { x: 150, z0: 60, z1: 160 },
  soundWall: { z0: 80 },
  ramp: { x: 151, z0: 58, z1: 62 },
  rampRoad: { z: 57, x0: 130, x1: 151 },
  busStopWest: { x: 52, z: 101 },
  busStopEast: { x: 129, z: 131 },
  landfill: { x0: 64, z0: 41, w: 24, d: 3 },
  airport: { x: 91, z: 146 },
  hill: { x: 210, z: 210 },
} as const;

/** Flat banks at 5 m with a river running east to west across the whole map. */
export function townMap(): MapData {
  const map = flatMap();
  for (let z = RIVER.z0; z <= RIVER.z1; z++) {
    for (let x = 0; x < MAP_SIZE; x++) {
      const i = tileIndex(x, z);
      map.water[i] = 1;
      map.height[i] = RIVER.bed;
    }
  }
  return map;
}

export interface TownStep {
  label: string;
  commands: Command[];
}

const span = (a: number, b: number): number => b - a + 1;
const place = (catalogId: string, at: TilePoint): Command => ({
  kind: 'placeBuilding',
  catalogId,
  x: at.x,
  z: at.z,
  rotation: 0,
});
const zone = (z: ZoneType, tiles: TilePoint[]): Command => ({ kind: 'paintZone', zone: z, tiles });

/** Every step of building the town, in the order a player would build it. */
export function townSteps(): TownStep[] {
  const t = TOWN;
  return [
    {
      label: 'a sandbox with money to spend',
      commands: [
        { kind: 'setSandbox', on: true },
        { kind: 'setUnlimitedMoney', on: true },
      ],
    },
    {
      label: 'main street',
      commands: [
        {
          kind: 'buildRoad',
          tier: RoadTier.TwoLane,
          tiles: roadRow(t.main.x0, t.main.z, span(t.main.x0, t.main.x1)),
        },
      ],
    },
    {
      label: 'the avenue, bridging the river',
      commands: [
        {
          kind: 'buildRoad',
          tier: RoadTier.Avenue,
          tiles: column(t.avenue.x, t.avenue.z0, span(t.avenue.z0, t.avenue.z1)),
        },
      ],
    },
    {
      label: 'the four-lane road',
      commands: [
        {
          kind: 'buildRoad',
          tier: RoadTier.FourLane,
          tiles: roadRow(t.fourLane.x0, t.fourLane.z, span(t.fourLane.x0, t.fourLane.x1)),
        },
      ],
    },
    {
      label: 'a six-lane road, laid as two carriageways',
      commands: sixLaneCommands(
        column(t.sixLane.x, t.sixLane.z0, span(t.sixLane.z0, t.sixLane.z1)),
      ),
    },
    {
      label: 'main street on east, across the six-lane road',
      commands: [
        {
          kind: 'buildRoad',
          tier: RoadTier.TwoLane,
          tiles: roadRow(t.mainEast.x0, t.main.z, span(t.mainEast.x0, t.mainEast.x1)),
        },
      ],
    },
    {
      label: 'a one-way street, drawn south',
      commands: [
        {
          kind: 'buildRoad',
          tier: RoadTier.OneWay,
          tiles: column(t.oneWay.x, t.oneWay.z0, span(t.oneWay.z0, t.oneWay.z1)),
        },
      ],
    },
    {
      label: 'an alley',
      commands: [
        {
          kind: 'buildRoad',
          tier: RoadTier.Alley,
          tiles: column(t.alley.x, t.alley.z0, span(t.alley.z0, t.alley.z1)),
        },
      ],
    },
    {
      label: 'a bus lane',
      commands: [
        {
          kind: 'buildRoad',
          tier: RoadTier.BusLane,
          tiles: column(t.busLane.x, t.busLane.z0, span(t.busLane.z0, t.busLane.z1)),
        },
      ],
    },
    {
      label: 'a bike lane',
      commands: [
        {
          kind: 'buildRoad',
          tier: RoadTier.BikeLane,
          tiles: roadRow(t.bikeLane.x0, t.bikeLane.z, span(t.bikeLane.x0, t.bikeLane.x1)),
        },
      ],
    },
    {
      label: 'a tramway, across the avenue',
      commands: [
        {
          kind: 'buildRoad',
          tier: RoadTier.Tram,
          tiles: roadRow(t.tram.x0, t.tram.z, span(t.tram.x0, t.tram.x1)),
        },
      ],
    },
    {
      label: 'the station road',
      commands: [
        {
          kind: 'buildRoad',
          tier: RoadTier.TwoLane,
          tiles: roadRow(t.rail.x0, t.stationRoad.z, span(t.rail.x0, t.rail.x1)),
        },
      ],
    },
    {
      label: 'rail track',
      commands: [
        {
          kind: 'buildRoad',
          tier: RoadTier.RailTrack,
          tiles: roadRow(t.rail.x0, t.rail.z, span(t.rail.x0, t.rail.x1)),
        },
      ],
    },
    {
      label: 'a dirt road for the farms',
      commands: [
        {
          kind: 'buildRoad',
          tier: RoadTier.Gravel,
          tiles: roadRow(t.dirt.x0, t.dirt.z, span(t.dirt.x0, t.dirt.x1)),
        },
      ],
    },
    {
      label: 'a motorway, drawn south',
      commands: [
        {
          kind: 'buildRoad',
          tier: RoadTier.Highway,
          tiles: column(t.motorway.x, t.motorway.z0, span(t.motorway.z0, t.motorway.z1)),
        },
      ],
    },
    {
      label: 'the road out to the ramp, bridging the river',
      commands: [
        {
          kind: 'buildRoad',
          tier: RoadTier.TwoLane,
          tiles: [
            ...column(t.main.x1, t.rampRoad.z + 1, span(t.rampRoad.z + 1, t.main.z - 1)).reverse(),
            ...roadRow(t.rampRoad.x0, t.rampRoad.z, span(t.rampRoad.x0, t.rampRoad.x1)),
          ],
        },
      ],
    },
    {
      label: 'an on-ramp joining the motorway',
      commands: [
        {
          kind: 'buildRoad',
          tier: RoadTier.Ramp,
          tiles: column(t.ramp.x, t.ramp.z0, span(t.ramp.z0, t.ramp.z1)),
        },
      ],
    },
    {
      label: 'a sound wall along the motorway past the town, laid over it with Replace',
      commands: [
        { kind: 'defineRoadProfile', id: WALLED_MOTORWAY_PROFILE_ID, profile: WALLED_MOTORWAY },
        {
          kind: 'buildRoad',
          tier: RoadTier.Highway,
          tiles: column(t.motorway.x, t.soundWall.z0, span(t.soundWall.z0, t.motorway.z1)),
          profile: WALLED_MOTORWAY_PROFILE_ID,
          replace: true,
        },
      ],
    },
    {
      label: 'power and water',
      commands: [
        place('coal-plant', { x: 110, z: 131 }),
        place('wind-turbine', { x: 131, z: 99 }),
        place('water-tower', { x: 102, z: 101 }),
        place('water-tower', { x: 106, z: 101 }),
      ],
    },
    {
      label: 'a power line from the avenue out along the dirt road',
      commands: [
        {
          kind: 'stringPowerLine',
          tiles: [
            ...column(t.avenue.x, t.avenue.z1 + 1, span(t.avenue.z1 + 1, t.dirt.z - 1)),
            ...roadRow(t.dirt.x0, t.dirt.z, span(t.dirt.x0, t.dirt.x1)),
          ],
          on: true,
        },
      ],
    },
    {
      label: 'services and a park',
      commands: [
        place('police-station', { x: 61, z: 101 }),
        place('fire-station', { x: 71, z: 105 }),
        place('clinic', { x: 91, z: 101 }),
        place('school', { x: 91, z: 116 }),
        place('small-park', { x: 100, z: 101 }),
        place('small-park', { x: 56, z: 86 }),
      ],
    },
    {
      label: 'an airfield',
      commands: [place('airport', t.airport)],
    },
    {
      label: 'garbage: an incinerator and a landfill',
      commands: [
        place('incinerator', { x: 91, z: 126 }),
        {
          kind: 'paintLandfill',
          tiles: rows(t.landfill.x0, t.landfill.z0, t.landfill.w, t.landfill.d),
          on: true,
        },
      ],
    },
    {
      label: 'homes',
      commands: [
        zone(ZoneType.ResLow, rows(50, 96, 20, 4)),
        zone(ZoneType.ResHigh, rows(70, 96, 20, 4)),
        zone(ZoneType.ResLow, rows(61, 86, 29, 4)),
        zone(ZoneType.ResMediumRow, rows(50, 81, 40, 4)),
        zone(ZoneType.ResMedium, rows(91, 81, 39, 4)),
        zone(ZoneType.Mixed, rows(71, 101, 19, 4)),
        zone(ZoneType.ResLow, rows(62, 45, 28, 4)),
      ],
    },
    {
      label: 'shops',
      commands: [
        zone(ZoneType.ComLow, rows(91, 96, 39, 4)),
        zone(ZoneType.ComHigh, rows(91, 86, 39, 4)),
        zone(ZoneType.ComLow, rows(91, 45, 28, 4)),
      ],
    },
    {
      label: 'industry',
      commands: [
        zone(ZoneType.Industrial, rows(50, 131, 40, 4)),
        zone(ZoneType.Industrial, rows(96, 131, 14, 4)),
      ],
    },
    {
      label: 'farmland off the dirt road',
      commands: [zone(ZoneType.Agriculture, rows(t.dirt.x0, t.dirt.z + 1, 40, 8))],
    },
    {
      label: 'bus stops at each end of town',
      commands: [place('bus-stop', t.busStopWest), place('bus-stop', t.busStopEast)],
    },
    {
      label: 'rail stations on the track',
      commands: [place('rail-station', t.stationWest), place('rail-station', t.stationEast)],
    },
    {
      label: 'a bus line, stop to stop',
      commands: [
        {
          kind: 'createTransitLine',
          line: { id: 0, stops: [t.busStopWest, t.busStopEast], color: 0xd23c3c, mode: 'bus' },
        },
      ],
    },
    {
      label: 'a rail line, station to station',
      commands: [
        {
          kind: 'createTransitLine',
          line: { id: 0, stops: [t.stationWest, t.stationEast], color: 0x3c6ed2, mode: 'rail' },
        },
      ],
    },
    {
      label: 'a tram line along the tramway',
      commands: [
        {
          kind: 'createTransitLine',
          line: { id: 0, stops: [...t.tramStops], color: 0x3cb45a, mode: 'tram' },
        },
      ],
    },
    {
      label: 'signals where the avenue crosses main street',
      commands: [{ kind: 'setJunctionControl', x: t.avenue.x, z: t.main.z, control: 'signal' }],
    },
    {
      label: 'a district downtown, with a policy',
      commands: [
        { kind: 'paintDistrict', districtId: 1, tiles: rows(50, 81, 81, 24) },
        { kind: 'setDistrictPolicy', districtId: 1, policy: 'noHeavyTraffic', on: true },
      ],
    },
    {
      label: 'taxes, service funding and a loan',
      commands: [
        { kind: 'setTaxRate', sector: 'res', rate: 0.1 },
        { kind: 'setServiceFunding', service: 'police', funding: 1.2 },
        { kind: 'takeLoan', amount: 10_000 },
        { kind: 'repayLoan', amount: 5_000 },
      ],
    },
    {
      label: 'a hill raised outside town, steep enough to spoil its soil',
      commands: [{ kind: 'terraform', mode: 'raise', center: t.hill, radius: 4, strength: 24 }],
    },
  ];
}

/**
 * How long the town grows: every sector has a building open by tick 400 or
 * so, and this leaves room for farms to level and trash to pile up where no
 * truck reaches.
 */
export const GROW_TICKS = 2000;

export interface BuiltTown {
  h: Harness;
  /** The main thread's mirror, fed every snapshot the way main.ts feeds its own. */
  mirror: ClientGridMirror;
  steps: TownStep[];
  /** Each step's ack, in step order. */
  acks: CommandAck[];
}

/**
 * Builds the town while paused, so every command lands with no growth tick in
 * between and the steps alone decide the result. `growTown` then lets it grow.
 */
export function buildTown(): BuiltTown {
  const map = townMap();
  const mirror = new ClientGridMirror(map, TOWN_SEED);
  const h = makeHarness(feedMirror(mirror));
  h.sim.handleMessage({ type: 'init', seed: TOWN_SEED, map });
  h.sim.handleMessage({ type: 'setSpeed', speed: 0 });
  const steps = townSteps();
  const acks = steps.map((step, i) => {
    send(h, i + 1, step.commands);
    h.ticks(1);
    const ack = h.ackFor(i + 1);
    if (!ack) throw new Error(`no ack for step ${step.label}`);
    return ack;
  });
  return { h, mirror, steps, acks };
}

/** Unpauses the town and lets it grow for exactly `ticks` sim ticks. */
export function growTown(town: BuiltTown, ticks: number): void {
  town.h.sim.handleMessage({ type: 'setSpeed', speed: 1 });
  town.h.ticks(ticks);
}
