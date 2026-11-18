/**
 * The three airports laid out in their own plot, pure and free of any scene.
 *
 * Frame: metres, origin at the plot's minimum corner, x along the runway, z from
 * the far side (half the object free area) toward the street the car park fronts.
 */
import { TILE_METERS } from './constants';
import { GARAGE_TIER_M } from './garage';
import {
  AISLE_WIDTH_M,
  ISLAND_WIDTH_M,
  STALL_LENGTH_M,
  STALL_WIDTH_M,
  stallsInRow,
} from './parkingcode';

export type AirportId = 'airfield' | 'regional-airport' | 'international-airport';
export const AIRPORT_IDS: readonly AirportId[] = [
  'airfield',
  'regional-airport',
  'international-airport',
];

/** The paint a runway's approach category asks for. */
export type RunwayPaint = 'visual' | 'non-precision' | 'precision';
export type StandKind = 'tie-down' | 'narrow' | 'wide';

export interface Rect {
  x: number;
  z: number;
  w: number;
  d: number;
}
export interface Point {
  x: number;
  z: number;
}
/** A line across the plot at one z, from x to x + w. */
export interface Line {
  x: number;
  z: number;
  w: number;
}
export interface Stand extends Rect {
  kind: StandKind;
}

/** The airside fence: a closed ring on the plot's far side and ends and on the building line. */
export interface Fence {
  height: number;
  /** The barbed-wire arm leaning out of the top; none on the airfield. */
  outrigger: { length: number; angleDeg: number } | null;
  postSpacing: number;
  /** Closed ring of axis-aligned corners, first point repeated last. */
  line: Point[];
  /** Openings on the building line, one where each road crosses it. */
  gates: Line[];
  /** The buildings standing on the building line: the fence runs between them. */
  buildings: Rect[];
}
export interface Tower {
  /** The shaft's footprint, on the building line. */
  base: Rect;
  height: number;
  /** Width of the glazed cab at the top; the shaft's is the base's. */
  cab: number;
  shaft: number;
  /** The controller's eye above the ground. */
  eyeHeight: number;
}
export interface FuelTank {
  footprint: Rect;
  diameter: number;
  /** Long if lying, high if upright. */
  length: number;
  lying: boolean;
  /** Top above the ground. */
  height: number;
}
export interface Fuel {
  tanks: FuelTank[];
  /** The bund round upright tanks. */
  dike: Rect | null;
  dikeWall: number | null;
}
/** A hangar or cargo building's airside: an apron at the stand line, a link back to the taxiway, an approach to the face. */
export interface Maintenance {
  hangar: Rect;
  height: number;
  apron: Rect;
  link: Rect;
  approach: Rect;
}
export interface Cargo {
  building: Rect;
  height: number;
  apron: Rect;
  stands: Stand[];
  link: Rect;
  approach: Rect;
  /** Truck court on the landside face. */
  court: Rect;
  /** The landside face, where the dock doors are. */
  dockFace: Line;
}
export interface Garage {
  rect: Rect;
  tiers: number;
  stallsPerTier: number;
  height: number;
  /** The spur from the loop's last leg to the entry: a two-way centreline, loop end first. */
  entry: Point[];
  /** The entry's place on the garage's street face. */
  entryFace: Line;
  /** The round helix ramp the tiers connect to, standing against the street face. */
  drum: { cx: number; cz: number; diameter: number };
}
export interface LoopRoad {
  /** One-way centreline from the drive, past the terminal's kerb, round the parking and back. */
  centreline: Point[];
  lanes: number;
  laneWidth: number;
  kerbStoppingLane: number;
  kerbThroughLanes: number;
  kerbWalk: Rect;
  cornerRadius: { inner: number; outer: number };
}
export interface ServiceRoad {
  width: number;
  lines: Point[][];
}
export interface Signs {
  entrance: { rect: Rect; height: number; top: number };
  /** Guide sign gantries, on the loop's centreline. */
  gantries: Point[];
}
export interface BoardingBridge {
  /** Index into `stands`. */
  stand: number;
  rect: Rect;
  /** The aircraft's forward left door. */
  door: Point;
}

export interface AirportLayout {
  id: AirportId;
  plot: Rect;
  plotTiles: { w: number; d: number };
  objectFreeArea: Rect;
  safetyArea: Rect;
  runway: Rect;
  /** Runway centreline, z. */
  runwayCentreZ: number;
  shoulders: Rect[];
  blastPads: Rect[];
  taxiway: Rect;
  /** Taxiway centreline, z. */
  taxiwayCentreZ: number;
  /** Runway end connectors, then the mid connector on the two larger rungs. */
  connectors: Rect[];
  holdingPositions: Line[];
  /** The international's apron taxiway, and the two links joining it to the first. */
  secondTaxiway: Rect | null;
  secondTaxiwayCentreZ: number | null;
  taxiwayLinks: Rect[];
  apron: Rect;
  stands: Stand[];
  terminal: Rect | null;
  hangars: Rect[];
  pilotsBuilding: Rect | null;
  /** The kerb road; on the two larger rungs the loop's lanes along the terminal. */
  kerbRoad: Rect;
  /** The surface car park; the international's is two garages. */
  carPark: Rect | null;
  /** The drive's point on the street edge of the plot. */
  drive: Point;
  fence: Fence;
  tower: Tower | null;
  fuel: Fuel;
  maintenance: Maintenance;
  cargo: Cargo[];
  garages: Garage[];
  loopRoad: LoopRoad | null;
  serviceRoad: ServiceRoad;
  signs: Signs;
  boardingBridges: BoardingBridge[];
  paint: RunwayPaint;
  thresholdStripes: number;
}

// Lengths in metres; each feet figure is the circular's value times 0.3048.

export const RUNWAY_LENGTH_M: Record<AirportId, number> = {
  airfield: 823,
  'regional-airport': 1524,
  'international-airport': 3048,
};
export const RUNWAY_WIDTH_M: Record<AirportId, number> = {
  airfield: 18.3,
  'regional-airport': 30.5,
  'international-airport': 45.7,
};
export const SAFETY_AREA_WIDTH_M: Record<AirportId, number> = {
  airfield: 36.6,
  'regional-airport': 152.4,
  'international-airport': 152.4,
};
export const OBJECT_FREE_AREA_WIDTH_M: Record<AirportId, number> = {
  airfield: 76.2,
  'regional-airport': 243.8,
  'international-airport': 243.8,
};
/** Safety area and object free area beyond each runway end. */
export const CLEAR_BEYOND_END_M: Record<AirportId, number> = {
  airfield: 73.2,
  'regional-airport': 304.8,
  'international-airport': 304.8,
};
export const SHOULDER_WIDTH_M: Record<AirportId, number> = {
  airfield: 3.0,
  'regional-airport': 6.1,
  'international-airport': 10.7,
};
/** Blast pad width and length; none on the airfield. */
export const BLAST_PAD_M: Record<AirportId, { w: number; l: number } | null> = {
  airfield: null,
  'regional-airport': { w: 42.7, l: 61.0 },
  'international-airport': { w: 67.1, l: 121.9 },
};
export const RUNWAY_TO_TAXIWAY_M: Record<AirportId, number> = {
  airfield: 45.7,
  'regional-airport': 121.9,
  'international-airport': 121.9,
};
export const HOLDING_POSITION_M: Record<AirportId, number> = {
  airfield: 38.1,
  'regional-airport': 76.2,
  'international-airport': 76.2,
};
export const TAXIWAY_WIDTH_M: Record<AirportId, number> = {
  airfield: 7.6,
  'regional-airport': 15.2,
  'international-airport': 22.9,
};
/** Taxiway centreline to a fixed object. */
export const TAXIWAY_FIXED_OBJECT_M: Record<AirportId, number> = {
  airfield: 13.6,
  'regional-airport': 26.1,
  'international-airport': 43.4,
};
/** Parked aircraft clearance. */
export const STAND_CLEARANCE_M: Record<AirportId, number> = {
  airfield: 3.0,
  'regional-airport': 7.6,
  'international-airport': 7.6,
};
/** Widest wingspan on a stand; the international's narrow stands take the regional's group. */
export const WIDEST_WINGSPAN_M: Record<AirportId, number> = {
  airfield: 14.9,
  'regional-airport': 36.0,
  'international-airport': 65.2,
};
export const NARROW_WINGSPAN_M = WIDEST_WINGSPAN_M['regional-airport'];
export const RUNWAY_PAINT: Record<AirportId, RunwayPaint> = {
  airfield: 'visual',
  'regional-airport': 'non-precision',
  'international-airport': 'precision',
};
export const THRESHOLD_STRIPES: Record<AirportId, number> = {
  airfield: 0,
  'regional-airport': 8,
  'international-airport': 12,
};
/** Taxiway-to-taxiway separation for group V, 249.5 ft. */
export const SECOND_TAXIWAY_SEPARATION_M = 76.0;
/** Half the group V taxilane object free area, 135 ft. */
export const TAXILANE_FIXED_OBJECT_M = 41.1;
/** Stand depth: the game's own for groups III and V, the circular's tie-down row for group I. */
export const APRON_DEPTH_M: Record<AirportId, number> = {
  airfield: 52.0,
  'regional-airport': 40.0,
  'international-airport': 76.0,
};
/** The group I taxilane's clear width between two tie-down rows, 79 ft. */
export const AIRFIELD_TAXILANE_CLEAR_M = 24.1;
export const TIE_DOWN_ROW_DEPTH_M = (APRON_DEPTH_M.airfield - AIRFIELD_TAXILANE_CLEAR_M) / 2;
export const TIE_DOWNS_PER_ROW = 10;
export const REGIONAL_STANDS = 4;
export const INTERNATIONAL_NARROW_STANDS = 4;
export const INTERNATIONAL_WIDE_STANDS = 2;
export const BUILDINGS_STRIP_DEPTH_M: Record<AirportId, number> = {
  airfield: 15.0,
  'regional-airport': 40.0,
  'international-airport': 60.0,
};
export const TERMINAL_FLOORS = 2;
/** Terminal floor, m2 over all floors; the airfield has a pilots' building only. */
export const TERMINAL_FLOOR_M2: Record<AirportId, number> = {
  airfield: 0,
  'regional-airport': 11_600,
  'international-airport': 38_800,
};
/** The pilots' building: 150 m2. */
export const PILOTS_BUILDING_M = { w: 15, d: 10 };
export const HANGAR_COUNT = 4;
export const HANGAR_M = { w: 15, d: 15 };
/** One two-way aisle, 24 ft. */
export const KERB_ROAD_DEPTH_M = 7.32;
export const KERB_AND_CAR_PARK_STRIP_M: Record<AirportId, number> = {
  airfield: 15.6,
  'regional-airport': 110.0,
  'international-airport': 150.0,
};
export const CAR_PARK_SPACES: Record<AirportId, number> = {
  airfield: 20,
  'regional-airport': 1200,
  'international-airport': 4000,
};
/** One surface space all in, aisle share included. */
export const CAR_PARK_SPACE_M2 = 30;

// The facilities beside the runway. Metres; "dial" is the game's own figure.

/** Fence height, 2.1 fabric under a 0.3 outrigger on the two larger rungs. */
export const FENCE_HEIGHT_M: Record<AirportId, number> = {
  airfield: 1.2,
  'regional-airport': 2.4,
  'international-airport': 2.4,
};
/** Barbed-wire outrigger: three strands leaning out at 45 degrees. */
export const FENCE_OUTRIGGER: Record<AirportId, { length: number; angleDeg: number } | null> = {
  airfield: null,
  'regional-airport': { length: 0.3, angleDeg: 45 },
  'international-airport': { length: 0.3, angleDeg: 45 },
};
export const FENCE_POST_SPACING_M = 3.05;

/** Primary surface width of the runway's approach category. */
export const PRIMARY_SURFACE_WIDTH_M: Record<AirportId, number> = {
  airfield: 76.2,
  'regional-airport': 152.4,
  'international-airport': 304.8,
};
/** The 7 to 1 surface rising from the primary surface's edge. */
export const SURFACE_SLOPE = 7;

export const TOWER_M: Record<AirportId, { height: number; cab: number; shaft: number } | null> = {
  airfield: null,
  'regional-airport': { height: 26.5, cab: 7.6, shaft: 6.0 },
  'international-airport': { height: 60.4, cab: 7.6, shaft: 9.0 },
};
/** The controller's eye sits this far under the tower's top. */
export const TOWER_EYE_BELOW_TOP_M = 3;
/** Least angle below level to every runway and taxiway corner from the cab. */
export const TOWER_SIGHT_ANGLE_DEG = 0.8;

/** Fuel tanks: count, diameter, length if lying or height if upright. */
export const FUEL_TANKS: Record<
  AirportId,
  { count: number; diameter: number; length: number; lying: boolean }
> = {
  airfield: { count: 1, diameter: 3.0, length: 6.4, lying: true },
  'regional-airport': { count: 2, diameter: 9.1, length: 6.1, lying: false },
  'international-airport': { count: 3, diameter: 16.3, length: 6.5, lying: false },
};
/** Tank to any building: a parked fuel truck's distance, used for tanks. */
export const TANK_TO_BUILDING_M = 15.2;
/** Height of the bund round upright tanks. */
export const DIKE_WALL_M: Record<AirportId, number | null> = {
  airfield: null,
  'regional-airport': 1.0,
  'international-airport': 1.0,
};
/** Gap between tanks, and from the outer tanks to the bund, and the fuel area's clearance from the fence. */
export const TANK_GAP_M = 3.0;
export const DIKE_MARGIN_M = 1.5;
export const FUEL_FENCE_CLEARANCE_M = 1.5;

export const MAINTENANCE_HANGAR_M: Record<AirportId, { w: number; d: number; h: number }> = {
  airfield: { w: 18.3, d: 24.4, h: 6 },
  'regional-airport': { w: 45, d: 62, h: 20 },
  'international-airport': { w: 75, d: 95, h: 26.5 },
};
export const HANGAR_APRON_DEPTH_M: Record<AirportId, number> = {
  airfield: 12,
  'regional-airport': 40,
  'international-airport': 72,
};
/** Clear gap between a support building's apron and the terminal's apron row or landside block. */
export const SUPPORT_GAP_M = TANK_TO_BUILDING_M;

export const CARGO_BUILDING_M: Record<
  AirportId,
  { count: number; w: number; d: number; h: number; stand: StandKind } | null
> = {
  airfield: null,
  'regional-airport': { count: 1, w: 60, d: 30, h: 9, stand: 'narrow' },
  'international-airport': { count: 2, w: 120, d: 36, h: 10, stand: 'wide' },
};
export const TRUCK_COURT_DEPTH_M = 36.6;

export const GARAGES: Record<
  AirportId,
  { count: number; tiers: number; stallsPerTier: number; w: number; d: number } | null
> = {
  airfield: null,
  'regional-airport': null,
  'international-airport': { count: 2, tiers: 5, stallsPerTier: 400, w: 135, d: 73.2 },
};
/** Tier height of a garage: the shared garage kit's. */
export const GARAGE_TIER_HEIGHT_M = GARAGE_TIER_M;
/** Diameter of a garage's helix ramp drum: a dial. */
export const GARAGE_DRUM_M = 18;
/** Distance of the drum's centre from its garage's end wall: a dial. */
export const GARAGE_DRUM_INSET_M = 12;
/** Clear width between the international's two garages. */
export const GARAGE_GAP_M = 7.2;

/** Loop road lane width, the terminal's stopping lane, and the through lanes beside it. */
export const LOOP_LANE_M = 3.6;
export const LOOP_LANES = 2;
export const KERB_STOPPING_LANE_M = 2.4;
export const KERB_THROUGH_LANES: Record<AirportId, number | null> = {
  airfield: null,
  'regional-airport': 2,
  'international-airport': 3,
};
export const KERB_WALK_M = 3.4;
/** Inside radius of the loop's turns. */
export const LOOP_INNER_RADIUS_M = 7.6;
/** Verge between the loop's last leg and the street edge, where the entrance sign stands. */
export const DRIVE_VERGE_M = 1.8;
/** The 24 ft service aisle. */
export const SERVICE_ROAD_M = KERB_ROAD_DEPTH_M;

export const ENTRANCE_SIGN_M = { w: 2.4, d: 0.3, h: 1.2, top: 1.8 };
/** Gap from the drive's edge to the entrance sign. */
export const ENTRANCE_SIGN_GAP_M = 0.6;
export const GANTRIES: Record<AirportId, number> = {
  airfield: 0,
  'regional-airport': 1,
  'international-airport': 2,
};

/** Boarding bridge width; the forward door's distance behind the nose and its offset from the centreline by stand kind. */
export const BOARDING_BRIDGE_WIDTH_M = 3.0;
export const DOOR_BEHIND_NOSE_M = 4.0;
export const DOOR_OFFSET_M: Record<StandKind, number> = { 'tie-down': 0, narrow: 2.0, wide: 3.1 };

/** Float noise guard for rounding a metre length up to whole tiles. */
const TILE_ROUND_EPS = 1e-6;

const tilesFor = (metres: number): number => Math.ceil(metres / TILE_METERS - TILE_ROUND_EPS);

const standWidth = (id: AirportId, wingspan: number): number => wingspan + STAND_CLEARANCE_M[id];

/** Stand widths along the apron, left to right. */
function standWidths(id: AirportId): { kind: StandKind; w: number }[] {
  if (id === 'airfield') {
    return Array.from({ length: TIE_DOWNS_PER_ROW }, () => ({
      kind: 'tie-down' as const,
      w: standWidth(id, WIDEST_WINGSPAN_M[id]),
    }));
  }
  if (id === 'regional-airport') {
    return Array.from({ length: REGIONAL_STANDS }, () => ({
      kind: 'narrow' as const,
      w: standWidth(id, WIDEST_WINGSPAN_M[id]),
    }));
  }
  const narrow = { kind: 'narrow' as const, w: standWidth(id, NARROW_WINGSPAN_M) };
  const wide = { kind: 'wide' as const, w: standWidth(id, WIDEST_WINGSPAN_M[id]) };
  const half = INTERNATIONAL_NARROW_STANDS / 2;
  return [
    ...Array.from({ length: half }, () => narrow),
    ...Array.from({ length: INTERNATIONAL_WIDE_STANDS }, () => wide),
    ...Array.from({ length: half }, () => narrow),
  ];
}

/** The strips from the far side to the street, in order, each as its depth in metres. */
function stripDepths(id: AirportId): number[] {
  const international = id === 'international-airport';
  return [
    OBJECT_FREE_AREA_WIDTH_M[id] / 2,
    RUNWAY_TO_TAXIWAY_M[id],
    international
      ? SECOND_TAXIWAY_SEPARATION_M + TAXILANE_FIXED_OBJECT_M
      : TAXIWAY_FIXED_OBJECT_M[id],
    APRON_DEPTH_M[id],
    BUILDINGS_STRIP_DEPTH_M[id],
    KERB_AND_CAR_PARK_STRIP_M[id],
  ];
}

/** The plot in whole tiles: the runway plus its two clear ends, and the strips to the street. */
export function airportPlotTiles(id: AirportId): { w: number; d: number } {
  const length = RUNWAY_LENGTH_M[id] + 2 * CLEAR_BEYOND_END_M[id];
  const depth = stripDepths(id).reduce((sum, strip) => sum + strip, 0);
  return { w: tilesFor(length), d: tilesFor(depth) };
}

export function airportLayout(id: AirportId): AirportLayout {
  const plotTiles = airportPlotTiles(id);
  const plotW = plotTiles.w * TILE_METERS;
  const plotD = plotTiles.d * TILE_METERS;
  const length = RUNWAY_LENGTH_M[id];
  const beyond = CLEAR_BEYOND_END_M[id];
  const runwayWidth = RUNWAY_WIDTH_M[id];
  const x0 = (plotW - length) / 2;
  const x1 = x0 + length;
  const rz = OBJECT_FREE_AREA_WIDTH_M[id] / 2;

  const clearArea = (width: number): Rect => ({
    x: x0 - beyond,
    z: rz - width / 2,
    w: length + 2 * beyond,
    d: width,
  });
  const shoulder = SHOULDER_WIDTH_M[id];
  const shoulders: Rect[] = [
    { x: x0, z: rz - runwayWidth / 2 - shoulder, w: length, d: shoulder },
    { x: x0, z: rz + runwayWidth / 2, w: length, d: shoulder },
  ];
  const pad = BLAST_PAD_M[id];
  const blastPads: Rect[] = pad
    ? [
        { x: x0 - pad.l, z: rz - pad.w / 2, w: pad.l, d: pad.w },
        { x: x1, z: rz - pad.w / 2, w: pad.l, d: pad.w },
      ]
    : [];

  const taxiwayWidth = TAXIWAY_WIDTH_M[id];
  const tz = rz + RUNWAY_TO_TAXIWAY_M[id];
  const taxiway: Rect = { x: x0, z: tz - taxiwayWidth / 2, w: length, d: taxiwayWidth };
  const connectorZ = rz + runwayWidth / 2;
  const connectorX = [x0, x1 - taxiwayWidth];
  if (id !== 'airfield') connectorX.push(x0 + length / 2 - taxiwayWidth / 2);
  const connectors: Rect[] = connectorX.map((x) => ({
    x,
    z: connectorZ,
    w: taxiwayWidth,
    d: tz - taxiwayWidth / 2 - connectorZ,
  }));
  const holdingPositions: Line[] = connectors.map((c) => ({
    x: c.x,
    z: rz + HOLDING_POSITION_M[id],
    w: c.w,
  }));

  let secondTaxiway: Rect | null = null;
  let secondTaxiwayCentreZ: number | null = null;
  const taxiwayLinks: Rect[] = [];
  let standLineZ = tz + TAXIWAY_FIXED_OBJECT_M[id];
  if (id === 'international-airport') {
    secondTaxiwayCentreZ = tz + SECOND_TAXIWAY_SEPARATION_M;
    secondTaxiway = {
      x: x0,
      z: secondTaxiwayCentreZ - taxiwayWidth / 2,
      w: length,
      d: taxiwayWidth,
    };
    for (const x of [x0, x1 - taxiwayWidth]) {
      taxiwayLinks.push({
        x,
        z: tz + taxiwayWidth / 2,
        w: taxiwayWidth,
        d: SECOND_TAXIWAY_SEPARATION_M - taxiwayWidth,
      });
    }
    standLineZ = secondTaxiwayCentreZ + TAXILANE_FIXED_OBJECT_M;
  }

  const widths = standWidths(id);
  const rowWidth = widths.reduce((sum, s) => sum + s.w, 0);
  const rowX = (plotW - rowWidth) / 2;
  const standDepth = id === 'airfield' ? TIE_DOWN_ROW_DEPTH_M : APRON_DEPTH_M[id];
  const stands: Stand[] = [];
  const rowZs = id === 'airfield' ? [0, APRON_DEPTH_M.airfield - TIE_DOWN_ROW_DEPTH_M] : [0];
  for (const rowZ of rowZs) {
    let x = rowX;
    for (const s of widths) {
      stands.push({ kind: s.kind, x, z: standLineZ + rowZ, w: s.w, d: standDepth });
      x += s.w;
    }
  }
  const apron: Rect = { x: rowX, z: standLineZ, w: rowWidth, d: APRON_DEPTH_M[id] };

  const buildingsZ = standLineZ + APRON_DEPTH_M[id];
  const buildingsDepth = BUILDINGS_STRIP_DEPTH_M[id];
  let terminal: Rect | null = null;
  const hangars: Rect[] = [];
  let pilotsBuilding: Rect | null = null;
  if (id === 'airfield') {
    const row = HANGAR_COUNT * HANGAR_M.w + PILOTS_BUILDING_M.w;
    let x = (plotW - row) / 2;
    const half = HANGAR_COUNT / 2;
    for (let i = 0; i <= HANGAR_COUNT; i++) {
      if (i === half) {
        pilotsBuilding = {
          x,
          z: buildingsZ + buildingsDepth - PILOTS_BUILDING_M.d,
          ...PILOTS_BUILDING_M,
        };
        x += PILOTS_BUILDING_M.w;
      } else {
        hangars.push({ x, z: buildingsZ, w: HANGAR_M.w, d: HANGAR_M.d });
        x += HANGAR_M.w;
      }
    }
  } else {
    const terminalLength =
      id === 'international-airport'
        ? rowWidth
        : TERMINAL_FLOOR_M2[id] / TERMINAL_FLOORS / buildingsDepth;
    terminal = {
      x: (plotW - terminalLength) / 2,
      z: buildingsZ,
      w: terminalLength,
      d: buildingsDepth,
    };
  }

  const buildingLineZ = buildingsZ + buildingsDepth;
  const drive: Point = { x: plotW / 2, z: plotD };
  const landside = layLandside(id, plotW, plotD, buildingLineZ, terminal, drive);
  const facilities = layFacilities({
    id,
    plot: { x: 0, z: 0, w: plotW, d: plotD },
    runwayCentreZ: rz,
    runway: { x: x0, z: rz - runwayWidth / 2, w: length, d: runwayWidth },
    lastTaxiway: secondTaxiway ?? taxiway,
    standLineZ,
    apron,
    stands,
    terminal,
    hangars,
    pilotsBuilding,
    buildingLineZ,
    landside,
    drive,
  });

  return {
    id,
    plot: { x: 0, z: 0, w: plotW, d: plotD },
    plotTiles,
    objectFreeArea: clearArea(OBJECT_FREE_AREA_WIDTH_M[id]),
    safetyArea: clearArea(SAFETY_AREA_WIDTH_M[id]),
    runway: { x: x0, z: rz - runwayWidth / 2, w: length, d: runwayWidth },
    runwayCentreZ: rz,
    shoulders,
    blastPads,
    taxiway,
    taxiwayCentreZ: tz,
    connectors,
    holdingPositions,
    secondTaxiway,
    secondTaxiwayCentreZ,
    taxiwayLinks,
    apron,
    stands,
    terminal,
    hangars,
    pilotsBuilding,
    kerbRoad: landside.kerbRoad,
    carPark: landside.carPark,
    drive,
    paint: RUNWAY_PAINT[id],
    thresholdStripes: THRESHOLD_STRIPES[id],
    ...facilities,
    garages: landside.garages,
    loopRoad: landside.loopRoad,
  };
}

interface Landside {
  kerbRoad: Rect;
  carPark: Rect | null;
  garages: Garage[];
  loopRoad: LoopRoad | null;
  /** Centre of the loop's last leg, and the loop's side legs' centres; null on the airfield. */
  ring: { bottomZ: number; westX: number; eastX: number; kerbCentreZ: number } | null;
}

/** The airfield's kerb road and car park, or the loop road round the others' parking. */
function layLandside(
  id: AirportId,
  plotW: number,
  plotD: number,
  buildingLineZ: number,
  terminal: Rect | null,
  drive: Point,
): Landside {
  const through = KERB_THROUGH_LANES[id];
  if (through === null || !terminal) {
    const carParkZ = buildingLineZ + KERB_ROAD_DEPTH_M;
    const carParkDepth = plotD - carParkZ;
    const carParkWidth = Math.min(
      plotW,
      Math.ceil((CAR_PARK_SPACES[id] * CAR_PARK_SPACE_M2) / carParkDepth),
    );
    const x = (plotW - carParkWidth) / 2;
    return {
      kerbRoad: { x, z: buildingLineZ, w: carParkWidth, d: KERB_ROAD_DEPTH_M },
      carPark: { x, z: carParkZ, w: carParkWidth, d: carParkDepth },
      garages: [],
      loopRoad: null,
      ring: null,
    };
  }

  const half = (LOOP_LANES * LOOP_LANE_M) / 2;
  const kerbWalk: Rect = { x: terminal.x, z: buildingLineZ, w: terminal.w, d: KERB_WALK_M };
  const kerbDepth = KERB_STOPPING_LANE_M + through * LOOP_LANE_M;
  const parkZ0 = kerbWalk.z + kerbWalk.d + kerbDepth;
  const bottomZ = plotD - DRIVE_VERGE_M - half;
  const parkZ1 = bottomZ - half;

  const garageSpec = GARAGES[id];
  let block: Rect;
  let carPark: Rect | null = null;
  const garages: Garage[] = [];
  if (garageSpec) {
    const total = garageSpec.count * garageSpec.w + (garageSpec.count - 1) * GARAGE_GAP_M;
    const x0 = (plotW - total) / 2;
    const z = parkZ0 + (parkZ1 - parkZ0 - garageSpec.d) / 2;
    for (let i = 0; i < garageSpec.count; i++) {
      const rect: Rect = {
        x: x0 + i * (garageSpec.w + GARAGE_GAP_M),
        z,
        w: garageSpec.w,
        d: garageSpec.d,
      };
      const faceZ = rect.z + rect.d;
      const entryX = rect.x + rect.w / 2;
      // The first garage's drum stands at its west end, the last one's at its east end.
      const drumX = i === 0 ? rect.x + GARAGE_DRUM_INSET_M : rect.x + rect.w - GARAGE_DRUM_INSET_M;
      garages.push({
        rect,
        tiers: garageSpec.tiers,
        stallsPerTier: garageSpec.stallsPerTier,
        height: garageSpec.tiers * GARAGE_TIER_HEIGHT_M,
        entry: [
          { x: entryX, z: bottomZ },
          { x: entryX, z: faceZ },
        ],
        entryFace: { x: entryX - half, z: faceZ, w: 2 * half },
        drum: { cx: drumX, cz: faceZ + GARAGE_DRUM_M / 2, diameter: GARAGE_DRUM_M },
      });
    }
    block = { x: x0, z, w: total, d: garageSpec.d };
  } else {
    const depth = parkZ1 - parkZ0;
    // Rows of stalls with an island at each end; the width is the fewest stalls a row needs.
    const perRow = Math.ceil(CAR_PARK_SPACES[id] / carParkRowZs(depth).length);
    const width = Math.min(
      plotW,
      Math.ceil((perRow * STALL_WIDTH_M + 2 * ISLAND_WIDTH_M) * 10) / 10,
    );
    carPark = { x: (plotW - width) / 2, z: parkZ0, w: width, d: depth };
    block = carPark;
  }

  const westX = block.x - half;
  const eastX = block.x + block.w + half;
  const kerbCentreZ = kerbWalk.z + kerbWalk.d + kerbDepth / 2;
  const kerbRoad: Rect = {
    x: westX - half,
    z: kerbWalk.z + kerbWalk.d,
    w: block.w + 4 * half,
    d: kerbDepth,
  };
  const loopRoad: LoopRoad = {
    centreline: [
      drive,
      { x: drive.x, z: bottomZ },
      { x: eastX, z: bottomZ },
      { x: eastX, z: kerbCentreZ },
      { x: westX, z: kerbCentreZ },
      { x: westX, z: bottomZ },
      { x: drive.x, z: bottomZ },
      drive,
    ],
    lanes: LOOP_LANES,
    laneWidth: LOOP_LANE_M,
    kerbStoppingLane: KERB_STOPPING_LANE_M,
    kerbThroughLanes: through,
    kerbWalk,
    cornerRadius: { inner: LOOP_INNER_RADIUS_M, outer: LOOP_INNER_RADIUS_M + 2 * half },
  };
  return { kerbRoad, carPark, garages, loopRoad, ring: { bottomZ, westX, eastX, kerbCentreZ } };
}

interface FacilitiesInput {
  id: AirportId;
  plot: Rect;
  runwayCentreZ: number;
  runway: Rect;
  lastTaxiway: Rect;
  standLineZ: number;
  apron: Rect;
  stands: Stand[];
  terminal: Rect | null;
  hangars: Rect[];
  pilotsBuilding: Rect | null;
  buildingLineZ: number;
  landside: Landside;
  drive: Point;
}

type Facilities = Pick<
  AirportLayout,
  'fence' | 'tower' | 'fuel' | 'maintenance' | 'cargo' | 'serviceRoad' | 'signs' | 'boardingBridges'
>;

const ceilTenth = (v: number): number => Math.ceil(v * 10) / 10;

/** The fence, tower, fuel, maintenance and cargo buildings, service road, signs and bridges. */
function layFacilities(input: FacilitiesInput): Facilities {
  const { id, plot, standLineZ, buildingLineZ, landside, drive, terminal, stands } = input;
  const { kerbRoad, ring } = landside;
  const loopHalf = (LOOP_LANES * LOOP_LANE_M) / 2;

  // A support building stands no nearer the runway than its 7 to 1 surface lets its height rise.
  const surfaceZ = (height: number): number =>
    ceilTenth(input.runwayCentreZ + PRIMARY_SURFACE_WIDTH_M[id] / 2 + SURFACE_SLOPE * height);
  const apronEndZ = input.apron.z + input.apron.d;
  const link = (x: number, w: number): Rect => ({
    x,
    z: input.lastTaxiway.z + input.lastTaxiway.d,
    w,
    d: standLineZ - (input.lastTaxiway.z + input.lastTaxiway.d),
  });

  let tower: Tower | null = null;
  const towerSpec = TOWER_M[id];
  if (towerSpec && terminal) {
    tower = {
      base: {
        x: terminal.x + terminal.w + SUPPORT_GAP_M,
        z: buildingLineZ - towerSpec.shaft,
        w: towerSpec.shaft,
        d: towerSpec.shaft,
      },
      height: towerSpec.height,
      cab: towerSpec.cab,
      shaft: towerSpec.shaft,
      eyeHeight: towerSpec.height - TOWER_EYE_BELOW_TOP_M,
    };
  }

  // The landside block and the terminal's apron row bound the support buildings either side.
  const blockRects = [
    input.apron,
    kerbRoad,
    ...(terminal ? [terminal] : []),
    ...(input.pilotsBuilding ? [input.pilotsBuilding] : []),
    ...input.hangars,
    ...(landside.carPark ? [landside.carPark] : []),
    ...landside.garages.map((g) => g.rect),
    ...(tower ? [tower.base] : []),
  ];
  const westLimit = Math.min(...blockRects.map((r) => r.x));
  const eastLimit = Math.max(...blockRects.map((r) => r.x + r.w));

  const hangarSpec = MAINTENANCE_HANGAR_M[id];
  const hangarApron = HANGAR_APRON_DEPTH_M[id];
  // A lying tank stands on the tie-down apron's west edge, level with its taxilane, where an
  // aircraft pulls up to it; the hangar keeps clear of it. Upright tanks lie beside the hangar.
  const tankSpec = FUEL_TANKS[id];
  const margin = tankSpec.lying ? 0 : DIKE_MARGIN_M;
  const tankW = tankSpec.lying ? tankSpec.length : tankSpec.diameter;
  const rowW = tankSpec.count * tankW + (tankSpec.count - 1) * TANK_GAP_M;
  const areaW = rowW + 2 * margin;
  const areaD = tankSpec.diameter + 2 * margin;
  const hangarX = tankSpec.lying
    ? input.apron.x - areaW - TANK_TO_BUILDING_M - hangarSpec.w
    : westLimit - SUPPORT_GAP_M - hangarSpec.w;
  const hangarRect: Rect = {
    x: hangarX,
    z: Math.max(buildingLineZ - hangarSpec.d, surfaceZ(hangarSpec.h), standLineZ + hangarApron),
    w: hangarSpec.w,
    d: hangarSpec.d,
  };
  const maintenance: Maintenance = {
    hangar: hangarRect,
    height: hangarSpec.h,
    apron: { x: hangarRect.x, z: standLineZ, w: hangarRect.w, d: hangarApron },
    link: link(hangarRect.x, hangarRect.w),
    approach: {
      x: hangarRect.x,
      z: standLineZ + hangarApron,
      w: hangarRect.w,
      d: hangarRect.z - (standLineZ + hangarApron),
    },
  };

  const cargo: Cargo[] = [];
  const cargoSpec = CARGO_BUILDING_M[id];
  if (cargoSpec) {
    const wingspan = cargoSpec.stand === 'wide' ? WIDEST_WINGSPAN_M[id] : NARROW_WINGSPAN_M;
    const standW = standWidth(id, wingspan);
    let x = eastLimit + SUPPORT_GAP_M;
    for (let i = 0; i < cargoSpec.count; i++) {
      const z = Math.max(buildingLineZ - cargoSpec.d, surfaceZ(cargoSpec.h), apronEndZ);
      const standX = x + (cargoSpec.w - standW) / 2;
      const stand: Stand = {
        kind: cargoSpec.stand,
        x: standX,
        z: standLineZ,
        w: standW,
        d: APRON_DEPTH_M[id],
      };
      cargo.push({
        building: { x, z, w: cargoSpec.w, d: cargoSpec.d },
        height: cargoSpec.h,
        apron: { x: standX, z: standLineZ, w: standW, d: APRON_DEPTH_M[id] },
        stands: [stand],
        link: link(standX, standW),
        approach: { x: standX, z: apronEndZ, w: standW, d: z - apronEndZ },
        court: { x, z: z + cargoSpec.d, w: cargoSpec.w, d: TRUCK_COURT_DEPTH_M },
        dockFace: { x, z: z + cargoSpec.d, w: cargoSpec.w },
      });
      x += cargoSpec.w + SUPPORT_GAP_M;
    }
  }

  // Fuel stays inside the fence, at a gate of its own.
  const area: Rect = tankSpec.lying
    ? {
        x: input.apron.x - areaW,
        z: input.apron.z + input.apron.d / 2 - areaD / 2,
        w: areaW,
        d: areaD,
      }
    : {
        x: hangarRect.x - TANK_TO_BUILDING_M - areaW,
        z: buildingLineZ - FUEL_FENCE_CLEARANCE_M - areaD,
        w: areaW,
        d: areaD,
      };
  const tanks: FuelTank[] = Array.from({ length: tankSpec.count }, (_, i) => ({
    footprint: {
      x: area.x + margin + i * (tankW + TANK_GAP_M),
      z: area.z + margin,
      w: tankW,
      d: tankSpec.diameter,
    },
    diameter: tankSpec.diameter,
    length: tankSpec.length,
    lying: tankSpec.lying,
    height: tankSpec.lying ? tankSpec.diameter : tankSpec.length,
  }));
  const dikeWall = DIKE_WALL_M[id];
  const fuel: Fuel = { tanks, dike: dikeWall === null ? null : area, dikeWall };
  const fuelX = area.x + area.w / 2;

  const serviceLines: Point[][] = [];
  const fuelGate: Line = { x: fuelX - SERVICE_ROAD_M / 2, z: buildingLineZ, w: SERVICE_ROAD_M };
  if (ring) {
    // Under the hangar's landside face, then up to the fuel gate; and under the truck courts.
    const hangarRoadZ = hangarRect.z + hangarRect.d + SERVICE_ROAD_M / 2;
    serviceLines.push([
      { x: kerbRoad.x, z: hangarRoadZ },
      { x: fuelX, z: hangarRoadZ },
      { x: fuelX, z: buildingLineZ },
    ]);
    const lastCourt = cargo[cargo.length - 1];
    if (lastCourt) {
      const courtRoadZ = lastCourt.court.z + lastCourt.court.d + SERVICE_ROAD_M / 2;
      serviceLines.push([
        { x: kerbRoad.x + kerbRoad.w, z: courtRoadZ },
        { x: lastCourt.court.x + lastCourt.court.w, z: courtRoadZ },
      ]);
    }
  } else {
    const roadZ = buildingLineZ + SERVICE_ROAD_M / 2;
    serviceLines.push([
      { x: kerbRoad.x, z: roadZ },
      { x: fuelX, z: roadZ },
      { x: fuelX, z: buildingLineZ },
    ]);
  }

  const signGantries: Point[] = [];
  if (ring) {
    signGantries.push(
      { x: (drive.x + ring.eastX) / 2, z: ring.bottomZ },
      { x: ring.eastX, z: (ring.kerbCentreZ + ring.bottomZ) / 2 },
    );
  }

  const boardingBridges: BoardingBridge[] = terminal
    ? stands.map((s, i) => {
        const doorX = s.x + s.w / 2 + DOOR_OFFSET_M[s.kind];
        const doorZ = s.z + s.d - STAND_CLEARANCE_M[id] - DOOR_BEHIND_NOSE_M;
        return {
          stand: i,
          rect: {
            x: doorX - BOARDING_BRIDGE_WIDTH_M / 2,
            z: doorZ,
            w: BOARDING_BRIDGE_WIDTH_M,
            d: terminal.z - doorZ,
          },
          door: { x: doorX, z: doorZ },
        };
      })
    : [];

  const buildingsOnLine = [
    ...(terminal ? [terminal] : []),
    ...(input.pilotsBuilding ? [input.pilotsBuilding] : []),
    ...input.hangars,
    hangarRect,
    ...cargo.map((c) => c.building),
    ...(tower ? [tower.base] : []),
  ].filter(
    (r) => r.z < buildingLineZ - TILE_ROUND_EPS && r.z + r.d >= buildingLineZ - TILE_ROUND_EPS,
  );

  return {
    fence: {
      height: FENCE_HEIGHT_M[id],
      outrigger: FENCE_OUTRIGGER[id],
      postSpacing: FENCE_POST_SPACING_M,
      line: [
        { x: 0, z: 0 },
        { x: plot.w, z: 0 },
        { x: plot.w, z: buildingLineZ },
        { x: 0, z: buildingLineZ },
        { x: 0, z: 0 },
      ],
      gates: [fuelGate],
      buildings: buildingsOnLine,
    },
    tower,
    fuel,
    maintenance,
    cargo,
    serviceRoad: { width: SERVICE_ROAD_M, lines: serviceLines },
    signs: {
      entrance: {
        rect: {
          x: drive.x + loopHalf + ENTRANCE_SIGN_GAP_M,
          z: plot.d - DRIVE_VERGE_M / 2 - ENTRANCE_SIGN_M.d / 2,
          w: ENTRANCE_SIGN_M.w,
          d: ENTRANCE_SIGN_M.d,
        },
        height: ENTRANCE_SIGN_M.h,
        top: ENTRANCE_SIGN_M.top,
      },
      gantries: signGantries.slice(0, GANTRIES[id]),
    },
    boardingBridges,
  };
}

/** Spaces a layout's parking holds: its garages' stalls, or its surface car park at the all-in area of a space. */
/** Where each row of a stalled car park starts below its top edge: back-to-back pairs, an aisle after each. */
export function carParkRowZs(depth: number): number[] {
  const out: number[] = [];
  let z = 0;
  for (let row = 0; z + STALL_LENGTH_M <= depth + 1e-6; row++) {
    out.push(z);
    z += STALL_LENGTH_M;
    if (row % 2 === 1) z += AISLE_WIDTH_M;
  }
  return out;
}

/** Stalls in one row of a car park: the loop's has an island at each end. */
export function carParkRowStalls(layout: AirportLayout): number {
  const carPark = layout.carPark;
  if (!carPark) return 0;
  return stallsInRow(layout.loopRoad ? carPark.w - 2 * ISLAND_WIDTH_M : carPark.w);
}

export function carParkCapacity(layout: AirportLayout): number {
  if (layout.garages.length > 0) {
    return layout.garages.reduce((sum, g) => sum + g.tiers * g.stallsPerTier, 0);
  }
  if (!layout.carPark) return 0;
  if (layout.loopRoad) return carParkRowZs(layout.carPark.d).length * carParkRowStalls(layout);
  return Math.floor((layout.carPark.w * layout.carPark.d) / CAR_PARK_SPACE_M2);
}
