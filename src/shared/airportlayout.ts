/**
 * The three airports laid out in their own plot, pure and free of any scene.
 *
 * Frame: metres, origin at the plot's minimum corner, x along the runway, z from
 * the far side (half the object free area) toward the street the car park fronts.
 */
import { TILE_METERS } from './constants';

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
  kerbRoad: Rect;
  carPark: Rect;
  /** The drive's point on the street edge of the plot. */
  drive: Point;
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
        pilotsBuilding = { x, z: buildingsZ, ...PILOTS_BUILDING_M };
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

  const kerbZ = buildingsZ + buildingsDepth;
  const carParkZ = kerbZ + KERB_ROAD_DEPTH_M;
  const carParkDepth = plotD - carParkZ;
  const carParkWidth = Math.min(
    plotW,
    Math.ceil((CAR_PARK_SPACES[id] * CAR_PARK_SPACE_M2) / carParkDepth),
  );
  const carParkX = (plotW - carParkWidth) / 2;
  const kerbRoad: Rect = { x: carParkX, z: kerbZ, w: carParkWidth, d: KERB_ROAD_DEPTH_M };
  const carPark: Rect = { x: carParkX, z: carParkZ, w: carParkWidth, d: carParkDepth };

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
    kerbRoad,
    carPark,
    drive: { x: plotW / 2, z: plotD },
    paint: RUNWAY_PAINT[id],
    thresholdStripes: THRESHOLD_STRIPES[id],
  };
}

/** Spaces a car park holds at the all-in area of a surface space. */
export function carParkCapacity(layout: AirportLayout): number {
  return Math.floor((layout.carPark.w * layout.carPark.d) / CAR_PARK_SPACE_M2);
}
