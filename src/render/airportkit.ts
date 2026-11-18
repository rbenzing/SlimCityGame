/**
 * The three airports drawn from their shared layout: one merged ground plate
 * (grass, asphalt and every paint mark) in the layout's own frame, the
 * buildings and panes as boxes for shared instanced pools, and one aircraft
 * per stand. Everything here is pure geometry and numbers; LandmarkRenderer
 * owns the scene objects.
 *
 * Frame: metres, x along the runway, z from the far side toward the street,
 * origin at the plot's minimum corner (the layout's). The plate geometry is
 * centred on the plot so a mesh turned about Y by the building's rotation
 * lands on its footprint.
 */
import * as THREE from 'three';
import {
  AirportId,
  AirportLayout,
  Line,
  Rect,
  RUNWAY_WIDTH_M,
  STAND_CLEARANCE_M,
  StandKind,
  CAR_PARK_SPACES,
  carParkRowStalls,
  carParkRowZs,
  airportLayout,
} from '../shared/airportlayout';
import { ISLAND_WIDTH_M, STALL_LENGTH_M, STALL_WIDTH_M } from '../shared/parkingcode';
import { materialUnit, saturatedUnit } from './palette';
import { facilityPlatePolys, shoulderPieces } from './airportfacilities';
import { PLOT_YARD_TOP } from './plotground';
import { MARKING_COLOR, YELLOW_MARKING_COLOR } from './roadsmesh';
import { mergeGeometryParts } from './trees';

type RGB = readonly [number, number, number];

// ---------------------------------------------------------------------------
// Heights of the plate's layers, all inside the thin band every lot surface uses.
// ---------------------------------------------------------------------------

export const GRASS_Y = PLOT_YARD_TOP;
export const PAVEMENT_Y = PLOT_YARD_TOP + 0.01;
export const PAINT_Y = PLOT_YARD_TOP + 0.025;

/** The plate's layers from the ground up: the order of its geometry groups and of its materials. */
export const PLATE_LAYER_Y: readonly number[] = [GRASS_Y, PAVEMENT_Y, PAINT_Y];

const GRASS_COLOR: RGB = materialUnit('mownLawn');
const RUNWAY_COLOR: RGB = materialUnit('darkAsphalt');
const APRON_COLOR: RGB = materialUnit('brightAsphalt');
export const WHITE_PAINT: RGB = MARKING_COLOR;
export const YELLOW_PAINT: RGB = YELLOW_MARKING_COLOR;

// ---------------------------------------------------------------------------
// Paint, sizes in metres. The first group is the marking circular's (AC
// 150/5340-1M); the second is the game's own where the circular is not held.
// ---------------------------------------------------------------------------

export const NUMERAL_HEIGHT_M = 18.3;
/** Centreline stripe and gap, 120 ft and 80 ft (2.4); reduced stripes keep 24 m, reduced gaps 12.3 m. */
export const CENTRELINE_STRIPE_M = 36.5;
export const CENTRELINE_GAP_M = 24.3;
export const CENTRELINE_WIDTH_M = {
  visual: 0.3,
  'non-precision': 0.45,
  precision: 0.9,
} as const;
/** Threshold stripe 150 ft by 5.75 ft, the gap between stripes 5.75 ft, the innermost pair's gap doubled (2.5). */
export const THRESHOLD_STRIPE_LENGTH_M = 45.7;
export const THRESHOLD_STRIPE_WIDTH_M = 1.75;
export const THRESHOLD_STRIPE_GAP_M = 1.75;
export const THRESHOLD_CENTRE_GAP_M = 3.5;
export const THRESHOLD_OFFSET_M = 6.1;
/** The aiming point begins 1,020 ft from the threshold (2.6.3). */
export const AIMING_POINT_START_M = 311;
/** Its bars are 150 ft long on a runway of 1,280 m or more, 100 ft on a shorter one (2.6.5). */
export const AIMING_POINT_LONG_M = 45.7;
export const AIMING_POINT_SHORT_M = 30.5;
export const AIMING_POINT_LONG_RUNWAY_M = 1280;
/** The 500 ft step of the touchdown zone groups. */
export const TDZ_STEP_M = 152.4;
/** Touchdown zone groups, as steps of 500 ft from the threshold and bars a side: the 1,000 ft step is the aiming point's (2.7.3). */
export const TDZ_GROUPS: readonly { step: number; bars: number }[] = [
  { step: 1, bars: 3 },
  { step: 3, bars: 2 },
  { step: 4, bars: 2 },
  { step: 5, bars: 1 },
  { step: 6, bars: 1 },
];
/** Runway edge marking: 36 in on a runway of 100 ft or more (2.8). */
export const SIDE_STRIPE_WIDTH_M = 0.9;
export const TAXIWAY_CENTRELINE_M = 0.15;
export const HOLDING_LINE_M = 0.3;

/** The game's own: a digit's width, stroke and the gap between the two digits. */
export const NUMERAL_WIDTH_M = 6.0;
export const NUMERAL_STROKE_M = 1.5;
export const NUMERAL_GAP_M = 3.0;
/** Clear paving between the threshold stripes and the numerals, and the numerals and the centreline. */
export const PAINT_CLEAR_M = 12.2;
/** From the threshold to the numerals' near edge. */
export const NUMERAL_START_M = THRESHOLD_OFFSET_M + THRESHOLD_STRIPE_LENGTH_M + PAINT_CLEAR_M;
/** From the threshold to where the centreline stripes begin. */
export const CENTRELINE_START_M = NUMERAL_START_M + NUMERAL_HEIGHT_M + PAINT_CLEAR_M;
/** A touchdown zone bar, 75 ft long and 6 ft wide, 5 ft between bars on one side (2.7.5). */
export const TDZ_BAR_LENGTH_M = 22.9;
export const TDZ_BAR_WIDTH_M = 1.8;
export const TDZ_BAR_GAP_M = 1.5;

/**
 * The aiming point's bars and the touchdown zone's innermost bars: their width
 * (aiming point only) and the spacing between their inner sides, by runway
 * width (2.6.5): 150 ft or more, then 100 ft. The touchdown bars keep 1.8 m.
 */
export function aimingPointDims(runwayWidth: number): { width: number; spacing: number } {
  return runwayWidth >= 45.7 ? { width: 9.1, spacing: 21.9 } : { width: 6.0, spacing: 14.6 };
}
/** A holding position's gap between lines, and its broken lines' dash and gap. */
export const HOLDING_LINE_GAP_M = 0.3;
export const HOLDING_DASH_M = 0.9;
/** A car park stall's divider. */
export const STALL_LINE_M = 0.1;

export interface PlateQuad {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y: number;
  color: RGB;
}

function quad(r: { x: number; z: number; w: number; d: number }, y: number, color: RGB): PlateQuad {
  return { x0: r.x, z0: r.z, x1: r.x + r.w, z1: r.z + r.d, y, color };
}

function span(xa: number, za: number, xb: number, zb: number, y: number, color: RGB): PlateQuad {
  return {
    x0: Math.min(xa, xb),
    z0: Math.min(za, zb),
    x1: Math.max(xa, xb),
    z1: Math.max(za, zb),
    y,
    color,
  };
}

// ---------------------------------------------------------------------------
// Designation numerals
// ---------------------------------------------------------------------------

/**
 * The runway's two designations, the layout's low-x end first. North is -z on
 * the map, so a layout turned by `rotation` quarter turns heads east, north,
 * west, south for rotations 0, 1, 2, 3 when flown toward its high-x end.
 */
export function runwayDesignations(rotation: 0 | 1 | 2 | 3): [string, string] {
  switch (rotation) {
    case 0:
      return ['9', '27'];
    case 1:
      return ['36', '18'];
    case 2:
      return ['27', '9'];
    case 3:
      return ['18', '36'];
  }
}

interface UV {
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** One digit in its cell: u across to the pilot's right, v up the runway away from the threshold. */
function glyph(ch: string): UV[] {
  const W = NUMERAL_WIDTH_M;
  const H = NUMERAL_HEIGHT_M;
  const T = NUMERAL_STROKE_M;
  if (ch === '1') return [{ u0: (W - T) / 2, v0: 0, u1: (W + T) / 2, v1: H }];
  const seg: Record<string, UV> = {
    a: { u0: 0, v0: H - T, u1: W, v1: H },
    d: { u0: 0, v0: 0, u1: W, v1: T },
    g: { u0: 0, v0: (H - T) / 2, u1: W, v1: (H + T) / 2 },
    b: { u0: W - T, v0: (H + T) / 2, u1: W, v1: H - T },
    c: { u0: W - T, v0: T, u1: W, v1: (H - T) / 2 },
    f: { u0: 0, v0: (H + T) / 2, u1: T, v1: H - T },
    e: { u0: 0, v0: T, u1: T, v1: (H - T) / 2 },
  };
  const lit: Record<string, string> = {
    '0': 'abcdef',
    '2': 'abged',
    '3': 'abgcd',
    '6': 'afgecd',
    '7': 'abc',
    '8': 'abcdefg',
    '9': 'abcdfg',
  };
  const keys = lit[ch];
  if (!keys) throw new RangeError(`airportkit: no glyph for ${ch}`);
  return [...keys].flatMap((k) => seg[k] ?? []);
}

/** A one or two digit label as rectangles in (u, v), u centred on the runway's centreline. */
function labelRects(label: string): UV[] {
  const digits = [...label].length;
  const total = digits * NUMERAL_WIDTH_M + (digits - 1) * NUMERAL_GAP_M;
  const out: UV[] = [];
  [...label].forEach((ch, i) => {
    const shift = i * (NUMERAL_WIDTH_M + NUMERAL_GAP_M) - total / 2;
    for (const r of glyph(ch)) out.push({ u0: r.u0 + shift, v0: r.v0, u1: r.u1 + shift, v1: r.v1 });
  });
  return out;
}

// ---------------------------------------------------------------------------
// The plate
// ---------------------------------------------------------------------------

function runwayPaint(layout: AirportLayout, rotation: 0 | 1 | 2 | 3): PlateQuad[] {
  const id = layout.id;
  const out: PlateQuad[] = [];
  const x0 = layout.runway.x;
  const x1 = x0 + layout.runway.w;
  const rz = layout.runwayCentreZ;
  const width = RUNWAY_WIDTH_M[id];
  const paint = (xa: number, za: number, xb: number, zb: number): void => {
    out.push(span(xa, za, xb, zb, PAINT_Y, WHITE_PAINT));
  };

  // The numerals, read from the approach: forward is +x at the low end and -x
  // at the high end, and the pilot's right is +z at the low end and -z at the high.
  const [lowLabel, highLabel] = runwayDesignations(rotation);
  for (const r of labelRects(lowLabel)) {
    paint(x0 + NUMERAL_START_M + r.v0, rz + r.u0, x0 + NUMERAL_START_M + r.v1, rz + r.u1);
  }
  for (const r of labelRects(highLabel)) {
    paint(x1 - NUMERAL_START_M - r.v0, rz - r.u0, x1 - NUMERAL_START_M - r.v1, rz - r.u1);
  }

  // The centreline: whole stripes and gaps from each threshold's clear paving,
  // the adjustment made near the midpoint, where the stripes and gaps between are
  // shortened evenly.
  const half = CENTRELINE_WIDTH_M[layout.paint] / 2;
  const run = layout.runway.w - 2 * CENTRELINE_START_M;
  const period = CENTRELINE_STRIPE_M + CENTRELINE_GAP_M;
  const whole = Math.max(0, Math.floor(run / 2 / period) - 1);
  const stripe = (xa: number, xb: number): void => paint(xa, rz - half, xb, rz + half);
  for (let i = 0; i < whole; i++) {
    const xa = CENTRELINE_START_M + i * period;
    stripe(x0 + xa, x0 + xa + CENTRELINE_STRIPE_M);
    stripe(x1 - xa - CENTRELINE_STRIPE_M, x1 - xa);
  }
  const zone = run - 2 * whole * period;
  const inZone = Math.ceil((zone + CENTRELINE_GAP_M) / period);
  const shrink = zone / (inZone * CENTRELINE_STRIPE_M + (inZone - 1) * CENTRELINE_GAP_M);
  for (let i = 0; i < inZone; i++) {
    const xa = x0 + CENTRELINE_START_M + whole * period + i * period * shrink;
    stripe(xa, xa + CENTRELINE_STRIPE_M * shrink);
  }

  if (layout.paint === 'visual') return out;

  // Threshold stripes: 1.75 m wide and 1.75 m apart, the innermost pair 3.5 m apart,
  // symmetrical about the centreline.
  const eachSide = layout.thresholdStripes / 2;
  for (let i = 0; i < eachSide; i++) {
    const inner =
      THRESHOLD_CENTRE_GAP_M / 2 + i * (THRESHOLD_STRIPE_WIDTH_M + THRESHOLD_STRIPE_GAP_M);
    for (const side of [-1, 1]) {
      const za = rz + side * inner;
      const zb = rz + side * (inner + THRESHOLD_STRIPE_WIDTH_M);
      paint(x0 + THRESHOLD_OFFSET_M, za, x0 + THRESHOLD_OFFSET_M + THRESHOLD_STRIPE_LENGTH_M, zb);
      paint(x1 - THRESHOLD_OFFSET_M - THRESHOLD_STRIPE_LENGTH_M, za, x1 - THRESHOLD_OFFSET_M, zb);
    }
  }

  // The aiming point: a bar either side of the centreline, at both ends.
  const aim = aimingPointDims(width);
  const aimLength =
    layout.runway.w >= AIMING_POINT_LONG_RUNWAY_M ? AIMING_POINT_LONG_M : AIMING_POINT_SHORT_M;
  for (const side of [-1, 1]) {
    const za = rz + (side * aim.spacing) / 2;
    const zb = rz + side * (aim.spacing / 2 + aim.width);
    paint(x0 + AIMING_POINT_START_M, za, x0 + AIMING_POINT_START_M + aimLength, zb);
    paint(x1 - AIMING_POINT_START_M - aimLength, za, x1 - AIMING_POINT_START_M, zb);
  }

  if (layout.paint !== 'precision') return out;

  // Touchdown zone groups: the bars of a group lie side by side across the runway,
  // the innermost pair as far apart as the aiming point's bars.
  for (const { step, bars } of TDZ_GROUPS) {
    const along = TDZ_STEP_M * step;
    for (let b = 0; b < bars; b++) {
      const inner = aim.spacing / 2 + b * (TDZ_BAR_WIDTH_M + TDZ_BAR_GAP_M);
      for (const side of [-1, 1]) {
        const za = rz + side * inner;
        const zb = rz + side * (inner + TDZ_BAR_WIDTH_M);
        paint(x0 + along, za, x0 + along + TDZ_BAR_LENGTH_M, zb);
        paint(x1 - along - TDZ_BAR_LENGTH_M, za, x1 - along, zb);
      }
    }
  }
  // The edge marking along both edges of the runway, its full length.
  for (const side of [-1, 1]) {
    const edge = rz + side * (width / 2);
    const inner = rz + side * (width / 2 - SIDE_STRIPE_WIDTH_M);
    paint(x0, inner, x1, edge);
  }
  return out;
}

/** A holding position: two broken lines on the runway side, two solid on the taxiway side. */
function holdingPosition(line: Line): PlateQuad[] {
  const out: PlateQuad[] = [];
  const yellow = (xa: number, za: number, xb: number, zb: number): void => {
    out.push(span(xa, za, xb, zb, PAINT_Y, YELLOW_PAINT));
  };
  const pitch = HOLDING_LINE_M + HOLDING_LINE_GAP_M;
  const dashPeriod = 2 * HOLDING_DASH_M;
  const dashes = Math.floor((line.w + HOLDING_DASH_M) / dashPeriod);
  const dashStart = line.x + (line.w - (dashes * dashPeriod - HOLDING_DASH_M)) / 2;
  for (let i = 0; i < 4; i++) {
    const za = line.z + i * pitch;
    const zb = za + HOLDING_LINE_M;
    if (i >= 2) {
      yellow(line.x, za, line.x + line.w, zb);
      continue;
    }
    for (let k = 0; k < dashes; k++) {
      const xa = dashStart + k * dashPeriod;
      yellow(xa, za, xa + HOLDING_DASH_M, zb);
    }
  }
  return out;
}

/** The car park's stall dividers, filling rows from the kerb road until the layout's space count is drawn. */
function carParkStalls(layout: AirportLayout): PlateQuad[] {
  const cp = layout.carPark;
  const out: PlateQuad[] = [];
  if (!cp) return out;
  const perRow = carParkRowStalls(layout);
  // Rows start after the island at each end where the loop gives it one.
  const x0 = layout.loopRoad ? cp.x + ISLAND_WIDTH_M : cp.x;
  let remaining = CAR_PARK_SPACES[layout.id];
  // Two rows back to back, then an aisle; the first row's aisle is the kerb road.
  for (const rowZ of carParkRowZs(cp.d)) {
    if (remaining <= 0) break;
    const z = cp.z + rowZ;
    const stalls = Math.min(perRow, remaining);
    for (let i = 0; i <= stalls; i++) {
      const x = x0 + i * STALL_WIDTH_M;
      const xa = Math.max(cp.x, x - STALL_LINE_M / 2);
      const xb = Math.min(cp.x + cp.w, x + STALL_LINE_M / 2);
      out.push(span(xa, z, xb, z + STALL_LENGTH_M, PAINT_Y, WHITE_PAINT));
    }
    remaining -= stalls;
  }
  return out;
}

/** Every quad of an airport's plate, in the layout's frame and in draw order. */
export function airportPlateQuads(id: AirportId, rotation: 0 | 1 | 2 | 3): PlateQuad[] {
  const layout = airportLayout(id);
  const quads: PlateQuad[] = [quad(layout.plot, GRASS_Y, GRASS_COLOR)];
  const pave = (r: Rect, color: RGB): void => {
    quads.push(quad(r, PAVEMENT_Y, color));
  };

  pave(layout.runway, RUNWAY_COLOR);
  for (const r of shoulderPieces(layout).rects) pave(r, APRON_COLOR);
  for (const r of layout.blastPads) pave(r, APRON_COLOR);
  pave(layout.taxiway, RUNWAY_COLOR);
  for (const r of layout.connectors) pave(r, RUNWAY_COLOR);
  if (layout.secondTaxiway) pave(layout.secondTaxiway, RUNWAY_COLOR);
  for (const r of layout.taxiwayLinks) pave(r, RUNWAY_COLOR);

  // The apron reaches back to the last taxiway's edge, so a stand's aircraft meet pavement.
  const lastTaxiway = layout.secondTaxiway ?? layout.taxiway;
  const apronFrom = lastTaxiway.z + lastTaxiway.d;
  pave(
    {
      x: layout.apron.x,
      z: apronFrom,
      w: layout.apron.w,
      d: layout.apron.z + layout.apron.d - apronFrom,
    },
    APRON_COLOR,
  );

  quads.push(...runwayPaint(layout, rotation));

  const yellow = (r: Rect): void => {
    quads.push(quad(r, PAINT_Y, YELLOW_PAINT));
  };
  const half = TAXIWAY_CENTRELINE_M / 2;
  yellow({
    x: layout.taxiway.x,
    z: layout.taxiwayCentreZ - half,
    w: layout.taxiway.w,
    d: TAXIWAY_CENTRELINE_M,
  });
  if (layout.secondTaxiway && layout.secondTaxiwayCentreZ !== null) {
    yellow({
      x: layout.secondTaxiway.x,
      z: layout.secondTaxiwayCentreZ - half,
      w: layout.secondTaxiway.w,
      d: TAXIWAY_CENTRELINE_M,
    });
  }
  for (const c of layout.connectors) {
    yellow({
      x: c.x + c.w / 2 - half,
      z: c.z,
      w: TAXIWAY_CENTRELINE_M,
      d: layout.taxiwayCentreZ - c.z,
    });
  }
  for (const l of layout.taxiwayLinks) {
    yellow({
      x: l.x + l.w / 2 - half,
      z: layout.taxiwayCentreZ,
      w: TAXIWAY_CENTRELINE_M,
      d: (layout.secondTaxiwayCentreZ ?? layout.taxiwayCentreZ) - layout.taxiwayCentreZ,
    });
  }
  for (const h of layout.holdingPositions) quads.push(...holdingPosition(h));

  quads.push(...carParkStalls(layout));
  return quads;
}

/** The plate as one vertex-coloured mesh geometry, four vertices a quad, centred on the plot. */
export function airportPlateGeometry(id: AirportId, rotation: 0 | 1 | 2 | 3): THREE.BufferGeometry {
  const layout = airportLayout(id);
  const cx = layout.plot.w / 2;
  const cz = layout.plot.d / 2;
  const shapes: PlateShape[] = airportPlateQuads(id, rotation).map((q) => ({
    points: [
      { x: q.x0, z: q.z0 },
      { x: q.x0, z: q.z1 },
      { x: q.x1, z: q.z1 },
      { x: q.x1, z: q.z0 },
    ],
    y: q.y,
    color: q.color,
  }));
  for (const poly of facilityPlatePolys(layout)) {
    shapes.push({
      points: poly.points,
      triangles: poly.triangles,
      y: poly.layer === 'pavement' ? PAVEMENT_Y : PAINT_Y,
      color: poly.color,
    });
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const geometry = new THREE.BufferGeometry();
  // One group a layer (grass, pavement, paint), in draw order, so each layer
  // can take its own depth bias: a centimetre of height does not separate
  // surfaces at the camera's far distances.
  let start = 0;
  for (let layer = 0; layer < PLATE_LAYER_Y.length; layer++) {
    for (const shape of shapes) {
      if (shape.y !== PLATE_LAYER_Y[layer]) continue;
      const base = positions.length / 3;
      for (const p of shape.points) {
        positions.push(p.x - cx, shape.y, p.z - cz);
        normals.push(0, 1, 0);
        colors.push(...shape.color);
      }
      // A fan from the first point unless the shape brings its own triangles; wound to face up.
      const triangles =
        shape.triangles ??
        Array.from({ length: Math.max(0, shape.points.length - 2) }, (_, i) => [0, i + 1, i + 2]);
      for (const [i, j, k] of triangles as [number, number, number][]) {
        const a = shape.points[i]!;
        const b = shape.points[j]!;
        const c = shape.points[k]!;
        const facingUp = (b.z - a.z) * (c.x - a.x) - (b.x - a.x) * (c.z - a.z) > 0;
        indices.push(base + i, ...(facingUp ? [base + j, base + k] : [base + k, base + j]));
      }
    }
    geometry.addGroup(start, indices.length - start, layer);
    start = indices.length;
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
  return geometry;
}

interface PlateShape {
  points: { x: number; z: number }[];
  triangles?: number[][];
  y: number;
  color: RGB;
}

// ---------------------------------------------------------------------------
// Buildings and panes
// ---------------------------------------------------------------------------

export type AirportBuildingKind = 'terminal' | 'hangar' | 'pilots' | 'cargo';

export interface AirportBox {
  kind: AirportBuildingKind;
  rect: Rect;
  height: number;
}

/** The pilots' building's one storey: the game's own. */
export const PILOTS_BUILDING_HEIGHT_M = 3.6;
/** How far a roof slab overhangs its walls, and its thickness. */
export const ROOF_OVERHANG_M = 0.3;
export const ROOF_THICKNESS_M = 0.5;
/** A lit pane's depth, centred on the wall face. */
export const PANE_DEPTH_M = 0.3;
/** Entrance doors on a street face: a pair of leaves 3.6 m across every 30 m of a terminal, one 1.0 m door on the pilots' building, both 2.4 m high from the ground. */
export const TERMINAL_DOOR_SPACING_M = 30;
export const TERMINAL_DOOR_W_M = 3.6;
export const PILOTS_DOOR_W_M = 1.0;
export const ENTRANCE_DOOR_H_M = 2.4;

/** The buildings of a layout with their heights: the terminal and hangars take the catalog entry's. */
export function airportBuildings(layout: AirportLayout, entryHeight: number): AirportBox[] {
  const out: AirportBox[] = [];
  if (layout.terminal) out.push({ kind: 'terminal', rect: layout.terminal, height: entryHeight });
  for (const rect of layout.hangars) out.push({ kind: 'hangar', rect, height: entryHeight });
  if (layout.pilotsBuilding) {
    out.push({ kind: 'pilots', rect: layout.pilotsBuilding, height: PILOTS_BUILDING_HEIGHT_M });
  }
  out.push({ kind: 'hangar', rect: layout.maintenance.hangar, height: layout.maintenance.height });
  for (const c of layout.cargo) out.push({ kind: 'cargo', rect: c.building, height: c.height });
  return out;
}

/** A lit pane as a box in the layout's frame: centre x and z, underside y, and its size. */
export interface PaneBox {
  cx: number;
  cz: number;
  y: number;
  w: number;
  h: number;
  d: number;
}

/** Glazing on a building's apron face and street face: a band a floor on a terminal, a door on a hangar, two windows on the pilots' building; and the entrance doors on a street face. */
export function buildingPanes(box: AirportBox): PaneBox[] {
  const { rect, height } = box;
  const faces = [rect.z, rect.z + rect.d];
  const out: PaneBox[] = [];
  const cx = rect.x + rect.w / 2;
  if (box.kind === 'terminal') {
    const floor = height / 2;
    for (const cz of faces) {
      for (let f = 0; f < 2; f++) {
        out.push({
          cx,
          cz,
          y: f * floor + floor * 0.25,
          w: rect.w * 0.94,
          h: floor * 0.5,
          d: PANE_DEPTH_M,
        });
      }
    }
    const doors = Math.max(2, Math.floor(rect.w / TERMINAL_DOOR_SPACING_M));
    for (let i = 0; i < doors; i++) {
      out.push({
        cx: rect.x + ((i + 0.5) * rect.w) / doors,
        cz: rect.z + rect.d,
        y: 0,
        w: TERMINAL_DOOR_W_M,
        h: ENTRANCE_DOOR_H_M,
        d: PANE_DEPTH_M,
      });
    }
  } else if (box.kind === 'hangar') {
    out.push({ cx, cz: rect.z, y: 0, w: rect.w * 0.8, h: height * 0.7, d: PANE_DEPTH_M });
  } else if (box.kind === 'pilots') {
    for (const cz of faces) {
      for (const dx of [-0.25, 0.25]) {
        out.push({ cx: cx + dx * rect.w, cz, y: 1.0, w: rect.w * 0.3, h: 1.4, d: PANE_DEPTH_M });
      }
    }
    out.push({
      cx,
      cz: rect.z + rect.d,
      y: 0,
      w: PILOTS_DOOR_W_M,
      h: ENTRANCE_DOOR_H_M,
      d: PANE_DEPTH_M,
    });
  }
  return out;
}

export const TERMINAL_BODY_COLOR = 'aluminiumClad';
export const TERMINAL_ROOF_COLOR = 'whiteMembrane';
export const HANGAR_BODY_COLOR = 'ribbedWhite';
export const HANGAR_ROOF_COLOR = 'metalPlates';
export const PILOTS_BODY_COLOR = 'sidingOffWhite';
export const PILOTS_ROOF_COLOR = 'slateRoof';
export const CARGO_BODY_COLOR = 'cleanConcrete';
export const CARGO_ROOF_COLOR = 'metalPlates';

// ---------------------------------------------------------------------------
// Aircraft: one geometry per stand kind, nose at the origin, tail toward -z,
// wheels on y = 0. Sizes are the published figures of one real type each.
// ---------------------------------------------------------------------------

export interface AircraftSpec {
  /** The real type this is sized from. */
  type: string;
  span: number;
  length: number;
  /** Fuselage diameter. */
  diameter: number;
  /** Wheel height: the fuselage's underside above the ground. */
  gear: number;
  fin: number;
  engines: number;
  highWing: boolean;
  /** The wing's planform: root and tip chord, and how far the tip's leading edge lies behind the root's. */
  rootChord: number;
  tipChord: number;
  sweep: number;
  /** A propeller disc on the nose. */
  propeller: boolean;
}

export const AIRCRAFT_SPECS: Record<StandKind, AircraftSpec> = {
  'tie-down': {
    type: 'four-seat trainer',
    span: 11.0,
    length: 8.3,
    diameter: 1.2,
    gear: 0.5,
    fin: 1.3,
    engines: 0,
    highWing: true,
    rootChord: 1.6,
    tipChord: 1.6,
    sweep: 0,
    propeller: true,
  },
  narrow: {
    type: 'regional jet',
    span: 26.0,
    length: 31.7,
    diameter: 3.0,
    gear: 1.0,
    fin: 3.8,
    engines: 2,
    highWing: false,
    rootChord: 5.0,
    tipChord: 1.6,
    sweep: 5.5,
    propeller: false,
  },
  wide: {
    type: 'twin-aisle airliner',
    span: 60.3,
    length: 63.7,
    diameter: 5.6,
    gear: 1.6,
    fin: 7.5,
    engines: 2,
    highWing: false,
    rootChord: 11,
    tipChord: 3,
    sweep: 14,
    propeller: false,
  },
};

const BODY_COLOR: RGB = materialUnit('insulatedWhite');
const WING_COLOR: RGB = materialUnit('aluminiumClad');
const FIN_COLOR: RGB = saturatedUnit('navyAccent');
const ENGINE_COLOR: RGB = materialUnit('metalPlates');
const PROPELLER_COLOR: RGB = materialUnit('darkPanel');

function painted(geometry: THREE.BufferGeometry, color: RGB): THREE.BufferGeometry {
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set(color, i * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/** A cylinder along z, `top` radius at +z, centred at (x, y, z). */
function barrel(
  rTop: number,
  rBottom: number,
  length: number,
  x: number,
  y: number,
  z: number,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBottom, length, 10);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

export function aircraftGeometry(kind: StandKind): THREE.BufferGeometry {
  const s = AIRCRAFT_SPECS[kind];
  const r = s.diameter / 2;
  const axis = s.gear + r;
  const noseLen = s.length * 0.16;
  const tailLen = s.length * 0.22;
  const bodyLen = s.length - noseLen - tailLen;
  const wingY = s.highWing ? axis + r * 0.8 : axis - r * 0.35;
  const wingLE = -(noseLen + bodyLen * 0.2);
  const thickness = s.diameter * 0.08 + 0.1;
  const parts: THREE.BufferGeometry[] = [
    painted(barrel(r * 0.25, r, noseLen, 0, axis, -noseLen / 2), BODY_COLOR),
    painted(barrel(r, r, bodyLen, 0, axis, -(noseLen + bodyLen / 2)), BODY_COLOR),
    painted(barrel(r, r * 0.25, tailLen, 0, axis, -(s.length - tailLen / 2)), BODY_COLOR),
  ];
  const wing = planform(s.span, s.rootChord, s.tipChord, s.sweep, thickness);
  wing.translate(0, wingY, wingLE);
  parts.push(painted(wing, WING_COLOR));

  // The tailplane: a smaller wing at the tail, swept to match.
  const stabRoot = s.rootChord * 0.55;
  const stabTip = stabRoot * 0.5;
  const stabSweep = s.sweep * 0.5;
  const stab = planform(s.span * 0.38, stabRoot, stabTip, stabSweep, 0.2);
  // Its furthest trailing edge, root or tips, ends 2% short of the tail.
  stab.translate(0, axis + r * 0.5, -(s.length * 0.98) + Math.max(stabRoot, stabSweep + stabTip));
  parts.push(painted(stab, WING_COLOR));

  const finChord = s.rootChord * 0.8;
  const fin = new THREE.BoxGeometry(Math.max(0.2, r * 0.12), s.fin, finChord);
  fin.translate(0, axis + r * 0.6 + s.fin / 2, -(s.length - finChord / 2));
  parts.push(painted(fin, FIN_COLOR));

  if (s.engines > 0) {
    // Two pods hung under the wing, ahead of its leading edge.
    const er = r * 0.5;
    const el = er * 3.2;
    const halfSpan = s.span / 2;
    const x = halfSpan * 0.35;
    const edge = wingLE - s.sweep * (x / halfSpan);
    for (const sign of [-1, 1]) {
      parts.push(
        painted(barrel(er, er, el, sign * x, wingY - er * 1.2, edge - el * 0.3), ENGINE_COLOR),
      );
    }
  }
  if (s.propeller) {
    const disc = new THREE.CylinderGeometry(0.95, 0.95, 0.04, 14);
    disc.rotateX(Math.PI / 2);
    disc.translate(0, axis, -0.03);
    parts.push(painted(disc, PROPELLER_COLOR));
  }
  return mergeGeometryParts(parts);
}

/**
 * A flat tapered wing seen from above, both sides, its top at y = 0 and its
 * root leading edge at z = 0, running back toward -z. The tip's leading edge
 * lies `sweep` behind the root's.
 */
function planform(
  span: number,
  rootChord: number,
  tipChord: number,
  sweep: number,
  thickness: number,
): THREE.BufferGeometry {
  const h = span / 2;
  const shape = new THREE.Shape();
  const outline: [number, number][] =
    sweep === 0 && rootChord === tipChord
      ? [
          [-h, 0],
          [h, 0],
          [h, -rootChord],
          [-h, -rootChord],
        ]
      : [
          [0, 0],
          [h, -sweep],
          [h, -sweep - tipChord],
          [0, -rootChord],
          [-h, -sweep - tipChord],
          [-h, -sweep],
        ];
  outline.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: false });
  // The shape's y becomes z, and the extrusion hangs below y = 0.
  g.rotateX(Math.PI / 2);
  return g;
}

/** The pool kind an aircraft of a stand kind is drawn from. */
export type AircraftPoolKind = 'aircraftTieDown' | 'aircraftNarrow' | 'aircraftWide';
export const AIRCRAFT_POOL_BY_STAND: Record<StandKind, AircraftPoolKind> = {
  'tie-down': 'aircraftTieDown',
  narrow: 'aircraftNarrow',
  wide: 'aircraftWide',
};

export interface AircraftPlacement {
  kind: StandKind;
  /** Nose point in the layout's frame. */
  x: number;
  z: number;
}

/** One aircraft per stand, nose a clearance short of the building line, centred across the stand. */
export function aircraftPlacements(layout: AirportLayout): AircraftPlacement[] {
  const terminalStands = layout.stands.map((s) => ({
    kind: s.kind,
    x: s.x + s.w / 2,
    z: s.z + s.d - STAND_CLEARANCE_M[layout.id],
  }));
  // A cargo aircraft stands nose to its building, a clearance short of the wall.
  const cargoStands = layout.cargo.flatMap((c) =>
    c.stands.map((s) => ({
      kind: s.kind,
      x: s.x + s.w / 2,
      z: c.building.z - STAND_CLEARANCE_M[layout.id],
    })),
  );
  return [...terminalStands, ...cargoStands];
}
