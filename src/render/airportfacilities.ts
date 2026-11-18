/**
 * What stands and is paved beside an airport's runway, drawn from its shared
 * layout: the paved shapes of the plate with rounded corners, every solid part
 * as a box or cylinder for the pools all airports share, and the fence's thin
 * fabric as one mesh. Pure geometry and numbers.
 *
 * Frame: the layout's (metres, x along the runway, z toward the street).
 */
import * as THREE from 'three';
import { AirportLayout, Garage, Rect, carParkRowZs } from '../shared/airportlayout';
import { CIVIC_WALK_WIDTH_M } from '../shared/civicaccess';
import { ISLAND_WIDTH_M, STALL_LENGTH_M, STALL_WIDTH_M, stallsInRow } from '../shared/parkingcode';
import {
  AISLE_TURN_RADIUS_M,
  CAR_PARK_CORNER_RADIUS_M,
  CornerRadii,
  Pt,
  SERVICE_TURN_RADIUS_M,
  TAXIWAY_FILLET_RADIUS_M,
  arcSegments,
  filletPolyline,
  roundedRect,
} from '../shared/roundedoutline';
import { DOCK_DOOR_CENTRES_M, DOCK_DOOR_HEIGHT_M, DOCK_DOOR_WIDTH_M } from './buildingkit';
import { materialHex, materialUnit, saturatedHex } from './palette';
import { MARKING_COLOR, YELLOW_MARKING_COLOR } from './roadsmesh';

type RGB = readonly [number, number, number];

// ---------------------------------------------------------------------------
// The plate's paved shapes
// ---------------------------------------------------------------------------

/** A flat convex or fan-visible polygon on one of the plate's layers. */
export interface PlatePoly {
  points: Pt[];
  /** Triangles as point indices, for a shape a fan from its first point cannot fill. */
  triangles?: number[][];
  layer: 'pavement' | 'paint';
  color: RGB;
}

const ROAD_COLOR: RGB = materialUnit('darkAsphalt');
const APRON_COLOR: RGB = materialUnit('brightAsphalt');
const WALK_COLOR: RGB = materialUnit('cleanConcrete');
const DIKE_FLOOR_COLOR: RGB = materialUnit('concreteDike');
const LAWN_COLOR: RGB = materialUnit('mownLawn');
/** The kerb lanes' widening eases in over this length, in this many steps. */
export const KERB_TAPER_M = 24;
const KERB_TAPER_STEPS = 8;

/** Lane line width, and its dash and gap (a lane line is 3 m long with a 9 m gap). */
export const LANE_LINE_WIDTH_M = 0.12;
export const LANE_DASH_M = 3.0;
export const LANE_GAP_M = 9.0;
/** The two-way drive's yellow centre line. */
export const DRIVE_LINE_WIDTH_M = 0.15;

const rectPoints = (r: Rect): Pt[] => [
  { x: r.x, z: r.z },
  { x: r.x + r.w, z: r.z },
  { x: r.x + r.w, z: r.z + r.d },
  { x: r.x, z: r.z + r.d },
];

const pave = (points: Pt[], color: RGB): PlatePoly => ({ points, layer: 'pavement', color });
const paint = (points: Pt[], color: RGB): PlatePoly => ({ points, layer: 'paint', color });

/** The band a polyline of the given width covers, as quads along it. */
export function ribbon(points: readonly Pt[], width: number): Pt[][] {
  const pts = points.filter(
    (p, i) => i === 0 || Math.hypot(p.x - points[i - 1]!.x, p.z - points[i - 1]!.z) > 1e-9,
  );
  const half = width / 2;
  const normal = (a: Pt, b: Pt): Pt => {
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    return { x: -(b.z - a.z) / len, z: (b.x - a.x) / len };
  };
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < pts.length; i++) {
    const before = i > 0 ? normal(pts[i - 1]!, pts[i]!) : null;
    const after = i + 1 < pts.length ? normal(pts[i]!, pts[i + 1]!) : null;
    const a = before ?? after!;
    const b = after ?? before!;
    const sx = a.x + b.x;
    const sz = a.z + b.z;
    const len = Math.hypot(sx, sz) || 1;
    const n = { x: sx / len, z: sz / len };
    const miter = half / Math.max(0.5, n.x * a.x + n.z * a.z);
    left.push({ x: pts[i]!.x + n.x * miter, z: pts[i]!.z + n.z * miter });
    right.push({ x: pts[i]!.x - n.x * miter, z: pts[i]!.z - n.z * miter });
  }
  const out: Pt[][] = [];
  for (let i = 0; i + 1 < pts.length; i++)
    out.push([left[i]!, left[i + 1]!, right[i + 1]!, right[i]!]);
  return out;
}

/** Dashes along a polyline: `dash` long, `gap` apart, each as a ribbon of the line width. */
export function dashedLine(
  points: readonly Pt[],
  width: number,
  dash: number,
  gap: number,
): Pt[][] {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const len = Math.hypot(points[i + 1]!.x - points[i]!.x, points[i + 1]!.z - points[i]!.z);
    lengths.push(len);
    total += len;
  }
  const at = (s: number): { p: Pt; seg: number } => {
    let rest = s;
    for (let i = 0; i < lengths.length; i++) {
      if (rest <= lengths[i]! || i === lengths.length - 1) {
        const t = lengths[i]! === 0 ? 0 : Math.min(1, rest / lengths[i]!);
        const a = points[i]!;
        const b = points[i + 1]!;
        return { p: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, seg: i };
      }
      rest -= lengths[i]!;
    }
    return { p: points[points.length - 1]!, seg: lengths.length - 1 };
  };
  const out: Pt[][] = [];
  for (let s = gap / 2; s + dash <= total + 1e-9; s += dash + gap) {
    const from = at(s);
    const to = at(s + dash);
    const path: Pt[] = [from.p];
    for (let i = from.seg + 1; i <= to.seg; i++) path.push(points[i]!);
    path.push(to.p);
    out.push(...ribbon(path, width));
  }
  return out;
}

/**
 * The corner patch where an arm leaves the edge of a wide pavement at a right angle:
 * the square between the two edges less the arc tangent to both. `u` runs along the wide
 * edge away from the arm, `v` along the arm away from the wide pavement.
 */
export function filletPatch(j: Pt, u: Pt, v: Pt, r: number): Pt[] {
  const c = { x: j.x + r * (u.x + v.x), z: j.z + r * (u.z + v.z) };
  const n = arcSegments(r);
  const out: Pt[] = [{ ...j }];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * (Math.PI / 2);
    out.push({
      x: c.x - v.x * r * Math.cos(t) - u.x * r * Math.sin(t),
      z: c.z - v.z * r * Math.cos(t) - u.z * r * Math.sin(t),
    });
  }
  return out;
}

/** The sides of an arm that turn into a wide pavement by a fillet: the arm's edge x and which way the wide pavement runs on from it. */
function filletSides(arm: Rect, wide: Rect, radius: number): { x: number; ux: -1 | 1 }[] {
  if (arm.d <= 2 * radius) return [];
  return (
    [
      { x: arm.x, ux: -1 },
      { x: arm.x + arm.w, ux: 1 },
    ] as const
  ).filter(({ x, ux }) => {
    const far = x + ux * radius;
    return far >= wide.x - 1e-6 && far <= wide.x + wide.w + 1e-6;
  }) as { x: number; ux: -1 | 1 }[];
}

/** Fillets for both sides of an arm below or above a wide pavement, wherever the pavement runs on past it. */
function junctionPatches(
  arm: Rect,
  wide: Rect,
  side: 'below' | 'above',
  radius: number,
  color: RGB,
): PlatePoly[] {
  const z = side === 'below' ? wide.z + wide.d : wide.z;
  const v: Pt = { x: 0, z: side === 'below' ? 1 : -1 };
  return filletSides(arm, wide, radius).map(({ x, ux }) =>
    pave(filletPatch({ x, z }, { x: ux, z: 0 }, v, radius), color),
  );
}

/**
 * The runway shoulders with the connectors' footprints taken out: each shoulder
 * is cut where a connector leaves it and, past the connector's fillet, resumes;
 * the sliver of shoulder between a fillet's arc and the shoulder's outer edge
 * is a polygon on the arc's own points, so no two shapes cover the same ground.
 */
export function shoulderPieces(layout: AirportLayout): { rects: Rect[]; polys: PlatePoly[] } {
  const rects: Rect[] = [];
  const polys: PlatePoly[] = [];
  const radius = TAXIWAY_FILLET_RADIUS_M;
  for (const shoulder of layout.shoulders) {
    const arms = layout.connectors.filter((c) => Math.abs(c.z - shoulder.z) < 1e-6);
    const cuts: { from: number; to: number }[] = [];
    for (const arm of arms) {
      const sides = filletSides(arm, layout.runway, radius);
      const west = sides.find((s) => s.ux === -1);
      const east = sides.find((s) => s.ux === 1);
      cuts.push({
        from: west ? arm.x - radius : arm.x,
        to: east ? arm.x + arm.w + radius : arm.x + arm.w,
      });
      for (const { x, ux } of sides) {
        const arc = filletPatch(
          { x, z: shoulder.z },
          { x: ux, z: 0 },
          { x: 0, z: 1 },
          radius,
        ).slice(1);
        const edge = shoulder.z + shoulder.d;
        const k = arc.findIndex((p) => p.z >= edge);
        if (k <= 0) continue;
        const a = arc[k - 1]!;
        const b = arc[k]!;
        const f = (edge - a.z) / (b.z - a.z);
        polys.push(
          pave(
            [...arc.slice(0, k), { x: a.x + f * (b.x - a.x), z: edge }, { x: arc[0]!.x, z: edge }],
            APRON_COLOR,
          ),
        );
      }
    }
    cuts.sort((p, q) => p.from - q.from);
    let x = shoulder.x;
    for (const cut of cuts) {
      if (cut.from > x) rects.push({ ...shoulder, x, w: cut.from - x });
      x = Math.max(x, cut.to);
    }
    if (x < shoulder.x + shoulder.w) rects.push({ ...shoulder, x, w: shoulder.x + shoulder.w - x });
  }
  return { rects, polys };
}

/** The loop's centreline with each turn filleted so its inside radius is the loop's. */
export function loopPath(layout: AirportLayout): Pt[] {
  const loop = layout.loopRoad;
  if (!loop) return [];
  const width = loop.lanes * loop.laneWidth;
  // The drive spur and its return are straight; the ring between them turns.
  const ring = loop.centreline.slice(1, -1);
  return filletPolyline(ring, loop.cornerRadius.inner + width / 2);
}

/** A kerb road's outer corners and a car park's free corners, as the paving rules turn them. */
function pavedRect(r: Rect, radii: CornerRadii, color: RGB): PlatePoly {
  return pave(roundedRect(r, radii), color);
}

/** The lorry's turn where each service road leaves the loop, and where it runs under a truck court. */
function serviceJunctionPatches(layout: AirportLayout): PlatePoly[] {
  const loop = layout.loopRoad;
  if (!loop) return [];
  const out: PlatePoly[] = [];
  const r = SERVICE_TURN_RADIUS_M;
  const width = layout.serviceRoad.width;
  const half = (loop.lanes * loop.laneWidth) / 2;
  // The loop's side legs run straight between their turns.
  const turn = loop.cornerRadius.inner + half;
  const legFrom = loop.centreline[3]!.z + turn;
  const legTo = loop.centreline[1]!.z - turn;
  for (const line of layout.serviceRoad.lines) {
    const from = line[0]!;
    const next = line[1]!;
    if (Math.abs(from.z - next.z) > 1e-6 || Math.abs(next.x - from.x) <= r) continue;
    const away: Pt = { x: Math.sign(next.x - from.x), z: 0 };
    for (const side of [-1, 1]) {
      const z = from.z + (side * width) / 2;
      if (z + side * r < legFrom || z + side * r > legTo) continue;
      out.push(pave(filletPatch({ x: from.x, z }, { x: 0, z: side }, away, r), ROAD_COLOR));
    }
  }
  // Under the truck courts the road runs along their landside edge: each court's side meets it.
  const lorryRoad = layout.serviceRoad.lines[1];
  if (lorryRoad && layout.cargo.length > 0) {
    const roadStart = lorryRoad[0]!;
    const roadEnd = lorryRoad[lorryRoad.length - 1]!;
    const band: Rect = {
      x: roadStart.x,
      z: roadStart.z - width / 2,
      w: roadEnd.x - roadStart.x,
      d: width,
    };
    for (const c of layout.cargo) {
      out.push(...junctionPatches(c.court, band, 'above', r, ROAD_COLOR));
    }
  }
  return out;
}

/** The car park's outline inside the loop: the loop's own inside arcs, and the kerb lanes' taper along its top. */
function loopCarParkOutline(layout: AirportLayout): PlatePoly {
  const loop = layout.loopRoad!;
  const cp = layout.carPark!;
  const k = layout.kerbRoad;
  const inner = loop.cornerRadius.inner;
  const half = (loop.lanes * loop.laneWidth) / 2;
  const ringTop = k.z + k.d / 2 + half;
  const turnEnd = cp.x + inner;
  const turnsW = cp.w - 2 * inner;
  const arc = (cx: number, cz: number, from: number, to: number): Pt[] => {
    const n = arcSegments(inner);
    return Array.from({ length: n + 1 }, (_, i) => {
      const a = (from + ((to - from) * i) / n) * Math.PI;
      return { x: cx + inner * Math.cos(a), z: cz + inner * Math.sin(a) };
    });
  };
  const taperZ = (t: number): number => ringTop + (cp.z - ringTop) * t * t * (3 - 2 * t);
  const west: Pt[] = [];
  const east: Pt[] = [];
  for (let i = 0; i <= KERB_TAPER_STEPS; i++) {
    const t = i / KERB_TAPER_STEPS;
    west.push({ x: turnEnd + KERB_TAPER_M * t, z: taperZ(t) });
    east.push({ x: turnEnd + turnsW - KERB_TAPER_M * t, z: taperZ(t) });
  }
  const bottom = cp.z + cp.d;
  const points: Pt[] = [
    ...arc(cp.x + inner, ringTop + inner, 1, 1.5),
    ...west,
    ...east.reverse(),
    ...arc(cp.x + cp.w - inner, ringTop + inner, 1.5, 2),
    ...arc(cp.x + cp.w - inner, bottom - inner, 0, 0.5),
    ...arc(cp.x + inner, bottom - inner, 0.5, 1),
  ];
  const triangles = THREE.ShapeUtils.triangulateShape(
    points.map((p) => new THREE.Vector2(p.x, p.z)),
    [],
  );
  return { points, triangles, layer: 'pavement', color: APRON_COLOR };
}

/** Every paved shape and lane mark of the facilities, in the layout's frame. */
export function facilityPlatePolys(layout: AirportLayout): PlatePoly[] {
  const out: PlatePoly[] = [];
  const lastTaxiway = layout.secondTaxiway ?? layout.taxiway;
  const taxiEdge = lastTaxiway.z + lastTaxiway.d;
  const fillet = TAXIWAY_FILLET_RADIUS_M;
  const park = CAR_PARK_CORNER_RADIUS_M;

  // Taxiway connectors and links turn into the pavements they leave.
  const runway = layout.runway;
  out.push(...shoulderPieces(layout).polys);
  // The airfield's walk from its car park, over the kerb road, to the pilots' door.
  const pilots = layout.pilotsBuilding;
  if (pilots && layout.carPark) {
    const faceZ = pilots.z + pilots.d;
    out.push(
      paint(
        rectPoints({
          x: pilots.x + pilots.w / 2 - CIVIC_WALK_WIDTH_M / 2,
          z: faceZ,
          w: CIVIC_WALK_WIDTH_M,
          d: layout.carPark.z - faceZ,
        }),
        WALK_COLOR,
      ),
    );
  }
  for (const c of layout.connectors) {
    out.push(...junctionPatches(c, runway, 'below', fillet, ROAD_COLOR));
    out.push(...junctionPatches(c, layout.taxiway, 'above', fillet, ROAD_COLOR));
  }
  if (layout.secondTaxiway) {
    for (const l of layout.taxiwayLinks) {
      out.push(...junctionPatches(l, layout.taxiway, 'below', fillet, ROAD_COLOR));
      out.push(...junctionPatches(l, layout.secondTaxiway, 'above', fillet, ROAD_COLOR));
    }
  }
  const apronArm: Rect = {
    x: layout.apron.x,
    z: taxiEdge,
    w: layout.apron.w,
    d: layout.apron.z + layout.apron.d - taxiEdge,
  };
  out.push(...junctionPatches(apronArm, lastTaxiway, 'below', fillet, APRON_COLOR));

  // Maintenance and cargo aprons, their links back to the taxiway and approaches to the doors.
  const airside = [
    layout.maintenance.link,
    layout.maintenance.apron,
    layout.maintenance.approach,
    ...layout.cargo.flatMap((c) => [c.link, c.apron, c.approach]),
  ];
  for (const r of airside) if (r.d > 0) out.push(pave(rectPoints(r), APRON_COLOR));
  for (const link of [layout.maintenance.link, ...layout.cargo.map((c) => c.link)]) {
    out.push(...junctionPatches(link, lastTaxiway, 'below', fillet, APRON_COLOR));
  }
  for (const c of layout.cargo) out.push(pave(rectPoints(c.court), APRON_COLOR));

  // Fuel: the bund's floor, or the lying tank's pad.
  const fuelArea = layout.fuel.dike ?? layout.fuel.tanks[0]!.footprint;
  out.push(pave(rectPoints(fuelArea), layout.fuel.dike ? DIKE_FLOOR_COLOR : APRON_COLOR));

  // Roads and parking.
  const loop = layout.loopRoad;
  if (!loop) {
    out.push(pavedRect(layout.kerbRoad, [park, park, 0, 0], ROAD_COLOR));
  } else {
    const half = (loop.lanes * loop.laneWidth) / 2;
    const k = layout.kerbRoad;
    // The widened kerb lanes run between the loop's turns, from where each turn ends.
    const turnEnd = k.x + half + loop.cornerRadius.inner + half;
    const turnsW = k.w - 2 * (half + loop.cornerRadius.inner + half);
    // The widening eases in and out over a taper, so the edge is one smooth line.
    const straightFrom = turnEnd + KERB_TAPER_M;
    const straightW = turnsW - 2 * KERB_TAPER_M;
    out.push(pave(rectPoints({ x: straightFrom, z: k.z, w: straightW, d: k.d }), ROAD_COLOR));
    const kerbCentre = k.z + k.d / 2;
    for (const end of [-1, 1]) {
      for (let i = 0; i < KERB_TAPER_STEPS; i++) {
        const taper = (t: number): { x: number; half: number } => {
          const e = t * t * (3 - 2 * t);
          return {
            x: end < 0 ? turnEnd + KERB_TAPER_M * t : turnEnd + turnsW - KERB_TAPER_M * t,
            half: half + (k.d / 2 - half) * e,
          };
        };
        const a = taper(i / KERB_TAPER_STEPS);
        const b = taper((i + 1) / KERB_TAPER_STEPS);
        out.push(
          pave(
            [
              { x: a.x, z: kerbCentre - a.half },
              { x: b.x, z: kerbCentre - b.half },
              { x: b.x, z: kerbCentre + b.half },
              { x: a.x, z: kerbCentre + a.half },
            ],
            ROAD_COLOR,
          ),
        );
      }
    }
    const path = loopPath(layout);
    for (const quadPts of ribbon(path, loop.lanes * loop.laneWidth))
      out.push(pave(quadPts, ROAD_COLOR));
    out.push(pave(rectPoints(loop.kerbWalk), WALK_COLOR));
    const drive = layout.drive;
    const spur = loop.centreline[1]!;
    out.push(
      pave(
        rectPoints({ x: drive.x - half, z: spur.z, w: 2 * half, d: drive.z - spur.z }),
        ROAD_COLOR,
      ),
    );

    // White lane lines on the one-way loop; the two-way drive's centre line is yellow.
    const inKerb = (p: Pt): boolean => p.z > k.z && p.z < k.z + k.d && p.x > k.x && p.x < k.x + k.w;
    for (const dash of dashedLine(path, LANE_LINE_WIDTH_M, LANE_DASH_M, LANE_GAP_M)) {
      const mid = { x: (dash[0]!.x + dash[2]!.x) / 2, z: (dash[0]!.z + dash[2]!.z) / 2 };
      if (!inKerb(mid)) out.push(paint(dash, MARKING_COLOR));
    }
    // The stopping lane's edge is solid; through lanes divide by dashes.
    const lineX = straightFrom;
    const lineW = straightW;
    const stop = k.z + loop.kerbStoppingLane;
    out.push(
      paint(
        rectPoints({ x: lineX, z: stop - LANE_LINE_WIDTH_M / 2, w: lineW, d: LANE_LINE_WIDTH_M }),
        MARKING_COLOR,
      ),
    );
    for (let i = 1; i < loop.kerbThroughLanes; i++) {
      const z = stop + i * loop.laneWidth;
      for (const dash of dashedLine(
        [
          { x: lineX, z },
          { x: lineX + lineW, z },
        ],
        LANE_LINE_WIDTH_M,
        LANE_DASH_M,
        LANE_GAP_M,
      )) {
        out.push(paint(dash, MARKING_COLOR));
      }
    }
    out.push(
      paint(
        rectPoints({
          x: drive.x - DRIVE_LINE_WIDTH_M / 2,
          z: spur.z + half,
          w: DRIVE_LINE_WIDTH_M,
          d: drive.z - spur.z - half,
        }),
        YELLOW_MARKING_COLOR,
      ),
    );
  }

  for (const line of layout.serviceRoad.lines) {
    const turn = SERVICE_TURN_RADIUS_M + layout.serviceRoad.width / 2;
    for (const quadPts of ribbon(filletPolyline(line, turn), layout.serviceRoad.width)) {
      out.push(pave(quadPts, ROAD_COLOR));
    }
  }
  out.push(...serviceJunctionPatches(layout));

  // A garage's entry spur leaves the loop's last leg, its junction turned on the aisle radius.
  if (loop) {
    const half = (loop.lanes * loop.laneWidth) / 2;
    const legZ = loop.centreline[1]!.z;
    const legFrom = loop.centreline[4]!.x + loop.cornerRadius.inner + half;
    const legTo = loop.centreline[2]!.x - loop.cornerRadius.inner - half;
    for (const g of layout.garages) {
      for (const quadPts of ribbon(g.entry, 2 * half)) out.push(pave(quadPts, ROAD_COLOR));
      const face = g.entry[1]!;
      const arm: Rect = { x: face.x - half, z: face.z, w: 2 * half, d: legZ - half - face.z };
      const leg: Rect = { x: legFrom, z: legZ - half, w: legTo - legFrom, d: 2 * half };
      out.push(...junctionPatches(arm, leg, 'above', AISLE_TURN_RADIUS_M, ROAD_COLOR));
    }
  }

  if (layout.carPark && loop) {
    // A lawn island with a round nose at each end of every pair of stall rows.
    const cp = layout.carPark;
    const zs = carParkRowZs(cp.d);
    for (let row = 0; row < zs.length; row += 2) {
      const z0 = cp.z + zs[row]!;
      const z1 = cp.z + zs[Math.min(row + 1, zs.length - 1)]! + STALL_LENGTH_M;
      for (const x of [cp.x, cp.x + cp.w - ISLAND_WIDTH_M]) {
        out.push(
          paint(
            roundedRect({ x, z: z0, w: ISLAND_WIDTH_M, d: z1 - z0 }, ISLAND_WIDTH_M / 2),
            LAWN_COLOR,
          ),
        );
      }
    }
  }

  if (layout.carPark) {
    // Inside the loop its outline is the loop's own inside arcs and the kerb lanes' taper, butted
    // against them; the airfield's is square at the kerb road and round at the street end.
    if (loop) out.push(loopCarParkOutline(layout));
    else out.push(pavedRect(layout.carPark, [0, 0, park, park], APRON_COLOR));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Solid parts for the pools every airport shares
// ---------------------------------------------------------------------------

export type PartPool = 'body' | 'roof' | 'pane' | 'cylinder';

/** One instance: centre x and z, underside y above the plate's grass, scale and a turn in the layout's frame. */
export interface PartPlacement {
  pool: PartPool;
  cx: number;
  cz: number;
  y: number;
  w: number;
  h: number;
  d: number;
  tint: number;
  rotX?: number;
  rotZ?: number;
}

/** Post width: a shadow texel or wider, so a post's shadow is whole. */
export const FENCE_POST_M = 0.18;
/** The far side and ends of the fence stand this far inside the plot: half a post and the outrigger's reach. */
export const FENCE_END_INSET_M = 0.3;
/** On the far side the plot's edge is the object free area's edge: a post's outer face is flush with it. */
export const FENCE_FAR_INSET_M = FENCE_POST_M / 2;
/** A gate's posts stand this much above the fence. */
export const GATE_POST_RISE_M = 0.6;
/** Tower cab: roof slab, glazing and floor, from the top down. */
export const CAB_ROOF_M = 0.5;
export const CAB_GLASS_M = 3.2;
export const CAB_FLOOR_M = 0.6;
/** The cab sits wider than its roof edge by this much each side. */
export const CAB_ROOF_OVERHANG_M = 0.5;
export const BRIDGE_HEIGHT_M = 2.6;
export const BRIDGE_FLOOR_M = 3.2;
export const BRIDGE_POST_M = 0.5;
export const CANOPY_HEIGHT_M = 3.7;
export const CANOPY_THICKNESS_M = 0.3;
export const CANOPY_POST_SPACING_M = 18;
export const DIKE_THICKNESS_M = 0.3;
export const SADDLE_HEIGHT_M = 0.5;
export const SADDLE_WIDTH_M = 0.4;
/** The street gantry's sizes: height, truss depth, panel, and how far its legs stand outside the lanes. */
export const GANTRY_HEIGHT_M = 6.4;
export const GANTRY_TRUSS_DEPTH_M = 0.62;
export const GANTRY_PANEL_W_M = 5.2;
export const GANTRY_PANEL_H_M = 1.6;
export const GANTRY_PANEL_D_M = 0.2;
export const GANTRY_LEG_CLEARANCE_M = 1.2;
/** A box leg as thick as the street gantry's round one is wide, widened to a whole shadow texel. */
export const GANTRY_LEG_M = 0.3;
export const SIGN_POST_M = 0.2;
export const GARAGE_SPANDREL_M = 0.84;
export const GARAGE_WALL_M = 0.3;
export const GARAGE_SLAB_M = 0.3;
export const GARAGE_COLUMN_M = 0.5;
export const GARAGE_COLUMN_SPACING_M = 11.25;
export const GARAGE_STAIR_M = 5.5;
/** Clear height of a garage entry: the clearance bar's. */
export const GARAGE_ENTRY_HEIGHT_M = 2.49;

const TINT = {
  post: materialHex('metalPlates'),
  tank: materialHex('insulatedWhite'),
  dike: materialHex('concreteDike'),
  saddle: materialHex('metalPlates'),
  shaft: materialHex('aluminiumClad'),
  cabFloor: materialHex('metalPlates'),
  cabRoof: materialHex('whiteMembrane'),
  dock: materialHex('darkPanel'),
  bridge: materialHex('insulatedWhite'),
  canopy: materialHex('whiteMembrane'),
  concrete: materialHex('cleanConcrete'),
  garage: materialHex('cleanConcrete'),
  garageStair: materialHex('aluminiumClad'),
  panel: saturatedHex('greenAccent'),
  steel: materialHex('metalPlates'),
  glass: materialHex('tintedGlass'),
};

type Run = { from: Pt; to: Pt };

/** The near fence line's free spans: the line less the buildings standing on it and the gates. */
function nearSpans(layout: AirportLayout): [number, number][] {
  const blocked: [number, number][] = [
    ...layout.fence.buildings.map((b): [number, number] => [b.x, b.x + b.w]),
    ...layout.fence.gates.map((g): [number, number] => [g.x, g.x + g.w]),
  ].sort((a, b) => a[0] - b[0]);
  const spans: [number, number][] = [];
  let at = FENCE_END_INSET_M;
  for (const [a, b] of blocked) {
    if (a > at + 1e-6) spans.push([at, a]);
    at = Math.max(at, b);
  }
  if (at < layout.plot.w - FENCE_END_INSET_M - 1e-6) {
    spans.push([at, layout.plot.w - FENCE_END_INSET_M]);
  }
  return spans;
}

/** The fence's straight runs, each with the way its outside lies (unit x or z). */
export function fenceRuns(layout: AirportLayout): { run: Run; outward: Pt }[] {
  const line = layout.fence.line;
  // The far side and both ends stand a little inside the plot's edge, so a post and the
  // outrigger leaning out of it stay on the plot.
  const farZ = line[0]!.z + FENCE_FAR_INSET_M;
  const nearZ = line[2]!.z;
  const w = layout.plot.w;
  const west = FENCE_END_INSET_M;
  const east = w - FENCE_END_INSET_M;
  const out: { run: Run; outward: Pt }[] = [
    { run: { from: { x: west, z: farZ }, to: { x: east, z: farZ } }, outward: { x: 0, z: -1 } },
    { run: { from: { x: west, z: farZ }, to: { x: west, z: nearZ } }, outward: { x: -1, z: 0 } },
    { run: { from: { x: east, z: farZ }, to: { x: east, z: nearZ } }, outward: { x: 1, z: 0 } },
  ];
  for (const [a, b] of nearSpans(layout)) {
    out.push({
      run: { from: { x: a, z: nearZ }, to: { x: b, z: nearZ } },
      outward: { x: 0, z: 1 },
    });
  }
  return out;
}

function fencePosts(layout: AirportLayout): PartPlacement[] {
  const f = layout.fence;
  const fabric = f.height - (f.outrigger?.length ?? 0);
  const posts: PartPlacement[] = [];
  for (const { run } of fenceRuns(layout)) {
    const length = Math.hypot(run.to.x - run.from.x, run.to.z - run.from.z);
    const count = Math.max(1, Math.ceil(length / f.postSpacing - 1e-9));
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      posts.push({
        pool: 'body',
        cx: run.from.x + (run.to.x - run.from.x) * t,
        cz: run.from.z + (run.to.z - run.from.z) * t,
        y: 0,
        w: FENCE_POST_M,
        h: fabric,
        d: FENCE_POST_M,
        tint: TINT.post,
      });
    }
  }
  const nearZ = f.line[2]!.z;
  for (const g of f.gates) {
    for (const x of [g.x, g.x + g.w]) {
      posts.push({
        pool: 'body',
        cx: x,
        cz: nearZ,
        y: 0,
        w: FENCE_POST_M * 2,
        h: fabric + GATE_POST_RISE_M,
        d: FENCE_POST_M * 2,
        tint: TINT.post,
      });
    }
  }
  return posts;
}

const box = (
  pool: PartPool,
  r: { cx: number; cz: number; y: number; w: number; h: number; d: number },
  tint: number,
  turn: { rotX?: number; rotZ?: number } = {},
): PartPlacement => ({ pool, ...r, tint, ...turn });

const rectBox = (
  r: Rect,
  y: number,
  h: number,
  tint: number,
  pool: PartPool = 'body',
): PartPlacement => box(pool, { cx: r.x + r.w / 2, cz: r.z + r.d / 2, y, w: r.w, h, d: r.d }, tint);

function towerParts(layout: AirportLayout): PartPlacement[] {
  const t = layout.tower;
  if (!t) return [];
  const cx = t.base.x + t.base.w / 2;
  const cz = t.base.z + t.base.d / 2;
  const cabY = t.height - CAB_ROOF_M - CAB_GLASS_M - CAB_FLOOR_M;
  const out: PartPlacement[] = [];
  // A shaft wider than the cab narrows to a stem under it.
  if (t.shaft > t.cab) {
    const lower = cabY * 0.7;
    out.push(box('body', { cx, cz, y: 0, w: t.shaft, h: lower, d: t.shaft }, TINT.shaft));
    const stem = t.cab - 1.6;
    out.push(box('body', { cx, cz, y: lower, w: stem, h: cabY - lower, d: stem }, TINT.shaft));
  } else {
    out.push(box('body', { cx, cz, y: 0, w: t.shaft, h: cabY, d: t.shaft }, TINT.shaft));
  }
  out.push(box('body', { cx, cz, y: cabY, w: t.cab, h: CAB_FLOOR_M, d: t.cab }, TINT.cabFloor));
  out.push(
    box('pane', { cx, cz, y: cabY + CAB_FLOOR_M, w: t.cab, h: CAB_GLASS_M, d: t.cab }, TINT.glass),
  );
  out.push(
    box(
      'roof',
      {
        cx,
        cz,
        y: t.height - CAB_ROOF_M,
        w: t.cab + 2 * CAB_ROOF_OVERHANG_M,
        h: CAB_ROOF_M,
        d: t.cab + 2 * CAB_ROOF_OVERHANG_M,
      },
      TINT.cabRoof,
    ),
  );
  return out;
}

function fuelParts(layout: AirportLayout): PartPlacement[] {
  const out: PartPlacement[] = [];
  for (const t of layout.fuel.tanks) {
    const f = t.footprint;
    const cx = f.x + f.w / 2;
    const cz = f.z + f.d / 2;
    if (t.lying) {
      // On two saddles; the cylinder's axis lies along x, growing from its east end.
      out.push(
        box(
          'cylinder',
          {
            cx: f.x + f.w,
            cz,
            y: SADDLE_HEIGHT_M + t.diameter / 2,
            w: t.diameter,
            h: t.length,
            d: t.diameter,
          },
          TINT.tank,
          { rotZ: Math.PI / 2 },
        ),
      );
      for (const at of [0.25, 0.75]) {
        out.push(
          box(
            'body',
            {
              cx: f.x + f.w * at,
              cz,
              y: 0,
              w: SADDLE_WIDTH_M,
              h: SADDLE_HEIGHT_M + t.diameter * 0.25,
              d: t.diameter * 0.9,
            },
            TINT.saddle,
          ),
        );
      }
    } else {
      out.push(
        box('cylinder', { cx, cz, y: 0, w: t.diameter, h: t.length, d: t.diameter }, TINT.tank),
      );
    }
  }
  const dike = layout.fuel.dike;
  if (dike && layout.fuel.dikeWall !== null) {
    const h = layout.fuel.dikeWall;
    const th = DIKE_THICKNESS_M;
    const walls: Rect[] = [
      { x: dike.x, z: dike.z, w: dike.w, d: th },
      { x: dike.x, z: dike.z + dike.d - th, w: dike.w, d: th },
      { x: dike.x, z: dike.z + th, w: th, d: dike.d - 2 * th },
      { x: dike.x + dike.w - th, z: dike.z + th, w: th, d: dike.d - 2 * th },
    ];
    for (const wall of walls) out.push(rectBox(wall, 0, h, TINT.dike));
  }
  return out;
}

function dockDoors(layout: AirportLayout): PartPlacement[] {
  const out: PartPlacement[] = [];
  for (const c of layout.cargo) {
    const doors = Math.max(1, Math.floor(c.dockFace.w / DOCK_DOOR_CENTRES_M));
    for (let i = 0; i < doors; i++) {
      out.push(
        box(
          'body',
          {
            cx: c.dockFace.x + c.dockFace.w / 2 + (i - (doors - 1) / 2) * DOCK_DOOR_CENTRES_M,
            cz: c.dockFace.z,
            y: 0,
            w: DOCK_DOOR_WIDTH_M,
            h: DOCK_DOOR_HEIGHT_M,
            d: 0.4,
          },
          TINT.dock,
        ),
      );
    }
  }
  return out;
}

function garageParts(g: Garage): PartPlacement[] {
  const r = g.rect;
  const out: PartPlacement[] = [];
  const tier = g.height / g.tiers;
  const bays = Math.max(2, Math.round(r.w / GARAGE_COLUMN_SPACING_M));
  for (let k = 0; k <= g.tiers; k++) {
    out.push(rectBox(r, k * tier - GARAGE_SLAB_M * (k === 0 ? 0 : 1), GARAGE_SLAB_M, TINT.garage));
  }
  // Open tiers: a spandrel along each edge, the band above it open.
  for (let k = 0; k < g.tiers; k++) {
    const y = k * tier + GARAGE_SLAB_M * (k === 0 ? 1 : 0);
    const wall = GARAGE_WALL_M;
    for (const z of [r.z, r.z + r.d - wall]) {
      out.push(rectBox({ x: r.x, z, w: r.w, d: wall }, y, GARAGE_SPANDREL_M, TINT.garage));
    }
    for (const x of [r.x, r.x + r.w - wall]) {
      out.push(
        rectBox(
          { x, z: r.z + wall, w: wall, d: r.d - 2 * wall },
          y,
          GARAGE_SPANDREL_M,
          TINT.garage,
        ),
      );
    }
  }
  for (let i = 0; i <= bays; i++) {
    const x = r.x + (i * (r.w - GARAGE_COLUMN_M)) / bays + GARAGE_COLUMN_M / 2;
    for (const z of [r.z + GARAGE_COLUMN_M / 2, r.z + r.d - GARAGE_COLUMN_M / 2]) {
      out.push(
        box(
          'body',
          { cx: x, cz: z, y: 0, w: GARAGE_COLUMN_M, h: g.height, d: GARAGE_COLUMN_M },
          TINT.garage,
        ),
      );
    }
  }
  // A closed stair tower a tier taller than the roof, at the end away from the drum.
  const drumWest = g.drum.cx < r.x + r.w / 2;
  const sx = drumWest ? r.x + r.w - GARAGE_STAIR_M : r.x;
  out.push(
    rectBox(
      { x: sx, z: r.z, w: GARAGE_STAIR_M, d: GARAGE_STAIR_M },
      0,
      g.height + tier,
      TINT.garageStair,
    ),
  );
  // The entry under a clearance bar on the street face.
  out.push(
    box(
      'body',
      {
        cx: g.entryFace.x + g.entryFace.w / 2,
        cz: g.entryFace.z,
        y: 0,
        w: g.entryFace.w,
        h: GARAGE_ENTRY_HEIGHT_M,
        d: 0.4,
      },
      TINT.dock,
    ),
  );
  // The helix ramp: a round drum, banded by a solid edge on every tier with the band above open
  // onto a core.
  const D = g.drum.diameter;
  const at = { cx: g.drum.cx, cz: g.drum.cz };
  out.push(
    box(
      'cylinder',
      { ...at, y: 0, w: D * 0.35, h: g.height + tier, d: D * 0.35 },
      TINT.garageStair,
    ),
  );
  for (let k = 0; k <= g.tiers; k++) {
    out.push(
      box(
        'cylinder',
        { ...at, y: k * tier - (k === 0 ? 0 : GARAGE_SLAB_M), w: D, h: GARAGE_SLAB_M, d: D },
        TINT.garage,
      ),
    );
    if (k < g.tiers) {
      out.push(
        box(
          'cylinder',
          { ...at, y: k * tier + GARAGE_SLAB_M, w: D, h: GARAGE_SPANDREL_M, d: D },
          TINT.garage,
        ),
      );
    }
  }
  return out;
}

function bridgeParts(layout: AirportLayout): PartPlacement[] {
  const out: PartPlacement[] = [];
  for (const b of layout.boardingBridges) {
    out.push(rectBox(b.rect, BRIDGE_FLOOR_M, BRIDGE_HEIGHT_M, TINT.bridge));
    out.push(
      box(
        'body',
        { cx: b.door.x, cz: b.door.z, y: 0, w: BRIDGE_POST_M, h: BRIDGE_FLOOR_M, d: BRIDGE_POST_M },
        TINT.post,
      ),
    );
  }
  return out;
}

function canopyParts(layout: AirportLayout): PartPlacement[] {
  const loop = layout.loopRoad;
  if (!loop) return [];
  const w = loop.kerbWalk;
  const out: PartPlacement[] = [
    rectBox(
      { x: w.x, z: w.z, w: w.w, d: w.d + 0.6 },
      CANOPY_HEIGHT_M,
      CANOPY_THICKNESS_M,
      TINT.canopy,
      'roof',
    ),
  ];
  const posts = Math.max(1, Math.round(w.w / CANOPY_POST_SPACING_M));
  for (let i = 0; i <= posts; i++) {
    out.push(
      box(
        'body',
        {
          cx: w.x + 0.15 + (i * (w.w - 0.3)) / posts,
          cz: w.z + w.d + 0.3 - 0.15,
          y: 0,
          w: 0.3,
          h: CANOPY_HEIGHT_M,
          d: 0.3,
        },
        TINT.post,
      ),
    );
  }
  return out;
}

function signParts(layout: AirportLayout): PartPlacement[] {
  const s = layout.signs.entrance;
  const out: PartPlacement[] = [rectBox(s.rect, s.top - s.height, s.height, TINT.panel)];
  for (const x of [s.rect.x + SIGN_POST_M / 2, s.rect.x + s.rect.w - SIGN_POST_M / 2]) {
    out.push(
      box(
        'body',
        {
          cx: x,
          cz: s.rect.z + s.rect.d / 2,
          y: 0,
          w: SIGN_POST_M,
          h: s.top - s.height,
          d: SIGN_POST_M,
        },
        TINT.post,
      ),
    );
  }
  return out;
}

/** A portal over the loop on the street gantry's sizes: legs outside the lanes, a truss beam, a green panel hung on it. */
function gantryParts(layout: AirportLayout): PartPlacement[] {
  const loop = layout.loopRoad;
  if (!loop) return [];
  const width = loop.lanes * loop.laneWidth;
  const reach = width / 2 + GANTRY_LEG_CLEARANCE_M;
  const out: PartPlacement[] = [];
  for (const g of layout.signs.gantries) {
    // Travel along z means the portal spans x.
    const spansX = loop.centreline.some((p, i) => {
      const q = loop.centreline[i + 1];
      return (
        q !== undefined &&
        Math.abs(p.x - q.x) < 1e-6 &&
        Math.abs(g.x - p.x) < 1e-6 &&
        g.z >= Math.min(p.z, q.z) &&
        g.z <= Math.max(p.z, q.z)
      );
    });
    const part = (across: number, y: number, w: number, h: number, d: number, tint: number) =>
      box(
        'body',
        {
          cx: spansX ? g.x + across : g.x,
          cz: spansX ? g.z : g.z + across,
          y,
          w: spansX ? w : d,
          h,
          d: spansX ? d : w,
        },
        tint,
      );
    const beamY = GANTRY_HEIGHT_M - GANTRY_TRUSS_DEPTH_M;
    for (const side of [-1, 1]) {
      out.push(part(side * reach, 0, GANTRY_LEG_M, GANTRY_HEIGHT_M, GANTRY_LEG_M, TINT.steel));
    }
    out.push(part(0, beamY, 2 * reach, GANTRY_TRUSS_DEPTH_M, GANTRY_LEG_M, TINT.steel));
    out.push(
      part(
        0,
        beamY - GANTRY_PANEL_H_M,
        GANTRY_PANEL_W_M,
        GANTRY_PANEL_H_M,
        GANTRY_PANEL_D_M,
        TINT.panel,
      ),
    );
  }
  return out;
}

/** Every solid part of the facilities except the buildings, which the building boxes draw. */
export function facilityParts(layout: AirportLayout): PartPlacement[] {
  return [
    ...fencePosts(layout),
    ...towerParts(layout),
    ...fuelParts(layout),
    ...dockDoors(layout),
    ...layout.garages.flatMap((g) => garageParts(g)),
    ...bridgeParts(layout),
    ...canopyParts(layout),
    ...signParts(layout),
    ...gantryParts(layout),
  ];
}

// ---------------------------------------------------------------------------
// The fence's fabric: one thin mesh a plot, centred on the plot like the plate
// ---------------------------------------------------------------------------

const FABRIC_COLOR: RGB = materialUnit('whiteBrick');
/** The fabric's lowest edge above the ground. */
export const FABRIC_LIFT_M = 0.05;

export function fenceFabricGeometry(layout: AirportLayout): THREE.BufferGeometry {
  const f = layout.fence;
  const cx = layout.plot.w / 2;
  const cz = layout.plot.d / 2;
  const fabric = f.height - (f.outrigger?.length ?? 0);
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const sheet = (corners: [number, number, number][], normal: [number, number, number]): void => {
    const base = positions.length / 3;
    for (const [x, y, z] of corners) {
      positions.push(x - cx, y, z - cz);
      normals.push(...normal);
      colors.push(...FABRIC_COLOR);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (const { run, outward } of fenceRuns(layout)) {
    const { from, to } = run;
    sheet(
      [
        [from.x, FABRIC_LIFT_M, from.z],
        [to.x, FABRIC_LIFT_M, to.z],
        [to.x, fabric, to.z],
        [from.x, fabric, from.z],
      ],
      [outward.x, 0, outward.z],
    );
    if (f.outrigger) {
      const rise = f.outrigger.length * Math.sin((f.outrigger.angleDeg * Math.PI) / 180);
      const out = f.outrigger.length * Math.cos((f.outrigger.angleDeg * Math.PI) / 180);
      sheet(
        [
          [from.x, fabric, from.z],
          [to.x, fabric, to.z],
          [to.x + outward.x * out, fabric + rise, to.z + outward.z * out],
          [from.x + outward.x * out, fabric + rise, from.z + outward.z * out],
        ],
        [outward.x * 0.7, 0.7, outward.z * 0.7],
      );
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  g.setIndex(indices);
  return g;
}

// ---------------------------------------------------------------------------
// Painted stall rows on each garage's roof tier: thin sheets, so one mesh a plot
// ---------------------------------------------------------------------------

/** Paint stands this far above the roof slab. */
export const ROOF_PAINT_LIFT_M = 0.03;
const ROOF_PAINT_WIDTH_M = 0.1;

export function garageRoofMarksGeometry(layout: AirportLayout): THREE.BufferGeometry {
  const cx = layout.plot.w / 2;
  const cz = layout.plot.d / 2;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (const g of layout.garages) {
    const wall = GARAGE_WALL_M;
    const y = g.height + ROOF_PAINT_LIFT_M;
    const x0 = g.rect.x + wall;
    const stalls = stallsInRow(g.rect.w - 2 * wall);
    for (const rowZ of carParkRowZs(g.rect.d - 2 * wall)) {
      const z = g.rect.z + wall + rowZ;
      for (let i = 0; i <= stalls; i++) {
        const x = x0 + i * STALL_WIDTH_M;
        const base = positions.length / 3;
        for (const [px, pz] of [
          [x - ROOF_PAINT_WIDTH_M / 2, z],
          [x - ROOF_PAINT_WIDTH_M / 2, z + STALL_LENGTH_M],
          [x + ROOF_PAINT_WIDTH_M / 2, z + STALL_LENGTH_M],
          [x + ROOF_PAINT_WIDTH_M / 2, z],
        ] as const) {
          positions.push(px - cx, y, pz - cz);
          normals.push(0, 1, 0);
          colors.push(...MARKING_COLOR);
        }
        indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
  geometry.setIndex(indices);
  return geometry;
}
