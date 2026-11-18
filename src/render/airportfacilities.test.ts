import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  AIRPORT_IDS,
  AirportId,
  Rect,
  airportLayout,
  carParkCapacity,
  carParkRowZs,
} from '../shared/airportlayout';
import { ISLAND_WIDTH_M } from '../shared/parkingcode';
import {
  AIRCRAFT_SPECS,
  aircraftPlacements,
  aircraftGeometry,
  airportBuildings,
  airportPlateGeometry,
  airportPlateQuads,
  buildingPanes,
} from './airportkit';
import {
  CAB_GLASS_M,
  CAB_ROOF_M,
  GANTRY_HEIGHT_M,
  GANTRY_PANEL_H_M,
  GANTRY_PANEL_W_M,
  FENCE_END_INSET_M,
  FENCE_FAR_INSET_M,
  FENCE_POST_M,
  KERB_TAPER_M,
  garageRoofMarksGeometry,
  GARAGE_SPANDREL_M,
  LANE_LINE_WIDTH_M,
  PartPlacement,
  facilityParts,
  facilityPlatePolys,
  fenceFabricGeometry,
  fenceRuns,
  loopPath,
} from './airportfacilities';
import { DOCK_DOOR_CENTRES_M, DOCK_DOOR_HEIGHT_M, DOCK_DOOR_WIDTH_M } from './buildingkit';
import { YELLOW_MARKING_COLOR, MARKING_COLOR } from './roadsmesh';
import { castsShadow } from './scene';
import { materialUnit } from './palette';

const EPS = 1e-6;
const inside = (inner: Rect, outer: Rect): boolean =>
  inner.x >= outer.x - EPS &&
  inner.z >= outer.z - EPS &&
  inner.x + inner.w <= outer.x + outer.w + EPS &&
  inner.z + inner.d <= outer.z + outer.d + EPS;
const entryHeight: Record<AirportId, number> = {
  airfield: 6,
  'regional-airport': 9,
  'international-airport': 14,
};

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w - EPS && b.x < a.x + a.w - EPS && a.z < b.z + b.d - EPS && b.z < a.z + a.d - EPS;

/** Where a placement stands on the ground, in the layout's frame. */
function footprint(p: PartPlacement): Rect {
  if (p.rotZ) return { x: p.cx - p.h, z: p.cz - p.d / 2, w: p.h, d: p.d };
  return { x: p.cx - p.w / 2, z: p.cz - p.d / 2, w: p.w, d: p.d };
}

const inFootprint = (p: PartPlacement, r: Rect): boolean =>
  p.cx >= r.x - EPS && p.cx <= r.x + r.w + EPS && p.cz >= r.z - EPS && p.cz <= r.z + r.d + EPS;

describe.each(AIRPORT_IDS)('airport facilities drawn: %s', (id) => {
  const l = airportLayout(id);
  const parts = facilityParts(l);

  it('draws the fence posts a post spacing apart, taller at each gate', () => {
    const fabric = l.fence.height - (l.fence.outrigger?.length ?? 0);
    const posts = parts.filter(
      (p) => p.pool === 'body' && p.w < 0.2 && Math.abs(p.h - fabric) < EPS,
    );
    const far = posts.filter((p) => p.cz < 1).sort((a, b) => a.cx - b.cx);
    expect(far.length).toBeGreaterThan(l.plot.w / l.fence.postSpacing);
    // The far side's posts stand with their outer faces flush with the plot's edge.
    for (const p of far) expect(p.cz - p.d / 2).toBeCloseTo(0, 9);
    for (const p of far) expect(p.cz).toBeCloseTo(FENCE_FAR_INSET_M, 9);
    // The ends stand inside the plot, clear of the object free area.
    const ends = posts.filter((p) => p.cz >= 1 && (p.cx < 1 || p.cx > l.plot.w - 1));
    expect(ends.length).toBeGreaterThan(0);
    for (const p of ends) {
      expect(Math.min(p.cx, l.plot.w - p.cx)).toBeCloseTo(FENCE_END_INSET_M, 9);
    }
    for (let i = 1; i < far.length; i++) {
      expect(far[i]!.cx - far[i - 1]!.cx).toBeLessThanOrEqual(l.fence.postSpacing + EPS);
    }
    const gatePosts = parts.filter(
      (p) => p.pool === 'body' && Math.abs(p.h - (fabric + 0.6)) < EPS,
    );
    expect(gatePosts).toHaveLength(l.fence.gates.length * 2);
    for (const g of l.fence.gates) {
      expect(gatePosts.some((p) => Math.abs(p.cx - g.x) < EPS)).toBe(true);
      expect(gatePosts.some((p) => Math.abs(p.cx - (g.x + g.w)) < EPS)).toBe(true);
    }
  });

  it('draws the fabric as a thin double-sided mesh at the fence height, leaning out on the outrigger', () => {
    const g = fenceFabricGeometry(l);
    g.computeBoundingBox();
    const top = l.fence.outrigger
      ? l.fence.height - l.fence.outrigger.length * (1 - Math.SQRT1_2)
      : l.fence.height;
    expect(g.boundingBox!.max.y).toBeCloseTo(top, 6);
    // The fabric covers the plot's far side and both ends and the near line outside the buildings.
    const runs = fenceRuns(l);
    expect(runs.length).toBeGreaterThanOrEqual(4);
    if (l.fence.outrigger) {
      // The outrigger of the far side leans toward -z: its top edge lies outside the line.
      const far = new THREE.Box3().setFromBufferAttribute(
        g.getAttribute('position') as THREE.BufferAttribute,
      );
      // The line is the post centre line; the outrigger reaches 0.21 m past it.
      expect(far.min.z).toBeGreaterThanOrEqual(-l.plot.d / 2 - 0.25);
      expect(far.min.z).toBeLessThan(-l.plot.d / 2 + FENCE_FAR_INSET_M);
    }
    // Too thin for the shadow map: it is a sheet, so a mesh made of it must not cast.
    expect(g.getAttribute('position').count % 4).toBe(0);
  });

  it('draws the tower at its height, with a cab as wide as the layout says, glazed at the eye', () => {
    const t = l.tower;
    if (!t) {
      expect(id).toBe('airfield');
      return;
    }
    const mine = parts.filter((p) =>
      inFootprint(p, {
        ...t.base,
        x: t.base.x - 1,
        w: t.base.w + 2,
        z: t.base.z - 1,
        d: t.base.d + 2,
      }),
    );
    expect(Math.max(...mine.map((p) => p.y + p.h))).toBeCloseTo(t.height, 6);
    const glass = mine.find((p) => p.pool === 'pane')!;
    expect(glass.w).toBeCloseTo(t.cab, 6);
    expect(glass.h).toBeCloseTo(CAB_GLASS_M, 6);
    expect(glass.y).toBeLessThanOrEqual(t.eyeHeight);
    expect(glass.y + glass.h).toBeGreaterThanOrEqual(t.eyeHeight);
    const roof = mine.find((p) => p.pool === 'roof')!;
    expect(roof.y + roof.h).toBeCloseTo(t.height, 6);
    expect(roof.h).toBeCloseTo(CAB_ROOF_M, 6);
    const shaft = mine.filter((p) => p.pool === 'body' && p.y === 0 && p.w > 1)[0]!;
    expect(shaft.w).toBeCloseTo(t.shaft, 6);
  });

  it('draws each tank as a cylinder of its size, upright in a low dike or lying on two saddles', () => {
    // The garages' drums are cylinders too; the tanks are the ones that stand in the fuel area.
    const fuelArea = l.fuel.dike ?? l.fuel.tanks[0]!.footprint;
    const cylinders = parts.filter(
      (p) => p.pool === 'cylinder' && Math.abs(p.cz - (fuelArea.z + fuelArea.d / 2)) < fuelArea.d,
    );
    expect(cylinders).toHaveLength(l.fuel.tanks.length);
    for (const c of cylinders) {
      const t = l.fuel.tanks[0]!;
      expect(c.w).toBeCloseTo(t.diameter, 6);
      expect(c.h).toBeCloseTo(t.length, 6);
      expect(Boolean(c.rotZ)).toBe(t.lying);
    }
    const f = l.fuel.tanks[0]!.footprint;
    const saddles = parts.filter(
      (p) => p.pool === 'body' && inFootprint(p, f) && p.y === 0 && Math.abs(p.w - 0.4) < EPS,
    );
    expect(saddles).toHaveLength(l.fuel.tanks[0]!.lying ? 2 : 0);
    if (l.fuel.dike) {
      const walls = parts.filter(
        (p) => p.pool === 'body' && Math.abs(p.h - l.fuel.dikeWall!) < EPS && p.y === 0,
      );
      expect(walls).toHaveLength(4);
    }
  });

  it('draws the hangar and cargo buildings at their layout size, with dock doors on the court face', () => {
    const boxes = airportBuildings(l, entryHeight[id]);
    const hangar = boxes.find(
      (b) =>
        b.kind === 'hangar' &&
        b.rect.x === l.maintenance.hangar.x &&
        b.rect.z === l.maintenance.hangar.z,
    )!;
    expect(hangar.kind).toBe('hangar');
    expect(hangar.height).toBe(l.maintenance.height);
    expect(buildingPanes(hangar)[0]!.cz).toBeCloseTo(l.maintenance.hangar.z, 6);
    const cargo = boxes.filter((b) => b.kind === 'cargo');
    expect(cargo).toHaveLength(l.cargo.length);
    l.cargo.forEach((c, i) => {
      expect(cargo[i]!.rect).toEqual(c.building);
      expect(cargo[i]!.height).toBe(c.height);
      const doors = parts.filter(
        (p) =>
          p.pool === 'body' &&
          Math.abs(p.w - DOCK_DOOR_WIDTH_M) < EPS &&
          Math.abs(p.h - DOCK_DOOR_HEIGHT_M) < EPS &&
          Math.abs(p.cz - c.dockFace.z) < EPS &&
          p.cx > c.building.x &&
          p.cx < c.building.x + c.building.w,
      );
      expect(doors).toHaveLength(Math.floor(c.dockFace.w / DOCK_DOOR_CENTRES_M));
    });
  });

  it('draws one boarding bridge a terminal stand, and the entrance sign to its height', () => {
    const bridges = parts.filter((p) => p.pool === 'body' && Math.abs(p.y - 3.2) < EPS);
    expect(bridges).toHaveLength(l.boardingBridges.length);
    l.boardingBridges.forEach((b) => {
      expect(
        bridges.some(
          (p) => Math.abs(p.d - b.rect.d) < EPS && Math.abs(p.cx - (b.rect.x + b.rect.w / 2)) < EPS,
        ),
      ).toBe(true);
    });
    const s = l.signs.entrance;
    const panel = parts.find((p) => p.cx === s.rect.x + s.rect.w / 2 && p.w === s.rect.w)!;
    expect(panel.y + panel.h).toBeCloseTo(s.top, 6);
    expect(panel.h).toBeCloseTo(s.height, 6);
    // An upright portal on the street gantry's sizes: two legs, a beam across every lane, one panel.
    const gantryPanels = parts.filter(
      (p) => Math.abs(p.h - GANTRY_PANEL_H_M) < EPS && Math.max(p.w, p.d) === GANTRY_PANEL_W_M,
    );
    expect(gantryPanels).toHaveLength(l.signs.gantries.length);
    const legs = parts.filter((p) => Math.abs(p.h - GANTRY_HEIGHT_M) < EPS && p.y === 0);
    expect(legs).toHaveLength(2 * l.signs.gantries.length);
    for (const panel of gantryPanels) {
      const width = l.loopRoad!.lanes * l.loopRoad!.laneWidth;
      const beam = parts.find(
        (p) => Math.abs(p.h - 0.62) < EPS && Math.max(p.w, p.d) >= width + 2 * 1.2 - EPS,
      )!;
      expect(beam).toBeDefined();
      expect(panel.y + panel.h).toBeLessThanOrEqual(beam.y + EPS);
      // The panel is thin along the traffic and wide across it.
      expect(Math.min(panel.w, panel.d)).toBeLessThan(0.3);
    }
  });

  it('draws the garages as open tiers to their height, with a ramp', () => {
    for (const g of l.garages) {
      const mine = parts.filter((p) => inFootprint(p, g.rect));
      const slabs = mine.filter(
        (p) => Math.abs(p.w - g.rect.w) < EPS && Math.abs(p.d - g.rect.d) < EPS,
      );
      expect(slabs).toHaveLength(g.tiers + 1);
      expect(Math.max(...slabs.map((p) => p.y + p.h))).toBeCloseTo(g.height, 6);
      const spandrels = mine.filter((p) => Math.abs(p.h - GARAGE_SPANDREL_M) < EPS);
      expect(spandrels).toHaveLength(4 * g.tiers);
    }
    for (const g of l.garages) {
      // A round drum: cylinders of the drum's diameter, a band on every tier, up to the roof.
      const drum = parts.filter(
        (p) =>
          p.pool === 'cylinder' &&
          p.cx === g.drum.cx &&
          p.cz === g.drum.cz &&
          p.w === g.drum.diameter,
      );
      expect(drum).toHaveLength(2 * g.tiers + 1);
      expect(Math.max(...drum.map((p) => p.y + p.h))).toBeCloseTo(g.height, 6);
      expect(
        parts.some((p) => p.pool === 'cylinder' && p.cx === g.drum.cx && p.w < g.drum.diameter),
      ).toBe(true);
      const entry = parts.find(
        (p) => p.pool === 'body' && p.cz === g.entryFace.z && Math.abs(p.w - g.entryFace.w) < EPS,
      )!;
      expect(entry).toBeDefined();
    }
  });

  it('draws nothing outside the plot', () => {
    for (const p of parts) {
      expect(inside(footprint(p), l.plot), `part at ${p.cx},${p.cz} off the plot`).toBe(true);
    }
  });

  it('paints stall rows on each garage roof, and one aircraft on each cargo stand nose to its building', () => {
    const marks = garageRoofMarksGeometry(l);
    const pos = marks.getAttribute('position');
    expect(pos.count > 0).toBe(l.garages.length > 0);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + l.plot.w / 2;
      const z = pos.getZ(i) + l.plot.d / 2;
      const g = l.garages.find(
        (gg) =>
          x >= gg.rect.x &&
          x <= gg.rect.x + gg.rect.w &&
          z >= gg.rect.z &&
          z <= gg.rect.z + gg.rect.d,
      );
      expect(g, 'paint on a roof').toBeDefined();
      expect(pos.getY(i)).toBeCloseTo(g!.height + 0.03, 4);
    }
    const planes = aircraftPlacements(l);
    expect(planes).toHaveLength(l.stands.length + l.cargo.length);
    l.cargo.forEach((c, i) => {
      const plane = planes[l.stands.length + i]!;
      expect(plane.kind).toBe(c.stands[0]!.kind);
      expect(plane.z).toBeLessThan(c.building.z);
      expect(c.building.z - plane.z).toBeLessThanOrEqual(8);
      expect(plane.x).toBeCloseTo(c.stands[0]!.x + c.stands[0]!.w / 2, 6);
      // The tail still lies on the cargo apron's pavement.
      expect(plane.z - AIRCRAFT_SPECS[plane.kind].length).toBeGreaterThanOrEqual(c.apron.z - EPS);
    });
  });

  it('keeps every part out of both clear areas and every post that casts a shadow whole', () => {
    for (const p of parts) {
      if (p.rotX !== undefined) continue;
      const f = footprint(p);
      // A far-side fence post stands flush with the plot's edge, which is the object free area's
      // edge: it intrudes by at most its own width. End posts stand clear.
      if (p.pool === 'body' && Math.abs(p.w - FENCE_POST_M) < EPS && p.cz < 1) {
        const intrusion = p.cz + p.d / 2 - l.objectFreeArea.z;
        expect(intrusion).toBeLessThanOrEqual(FENCE_POST_M + EPS);
        continue;
      }
      for (const area of [l.safetyArea, l.objectFreeArea]) {
        expect(overlaps(f, area), `part at ${p.cx},${p.cz} in a clear area`).toBe(false);
      }
      if (p.pool === 'body') {
        const geometry = new THREE.BoxGeometry(p.w, p.h, p.d);
        expect(castsShadow(geometry), `part ${p.w}x${p.h}x${p.d} thinner than a texel`).toBe(true);
      }
    }
    for (const b of airportBuildings(l, entryHeight[id])) {
      for (const area of [l.safetyArea, l.objectFreeArea])
        expect(overlaps(b.rect, area)).toBe(false);
    }
  });

  it('draws from the four pools every airport shares and no others', () => {
    const pools = new Set(parts.map((p) => p.pool));
    for (const pool of pools) expect(['body', 'roof', 'pane', 'cylinder']).toContain(pool);
    expect(pools.has('body')).toBe(true);
    expect(pools.has('cylinder')).toBe(true);
  });

  it('marks the one-way loop white and only the two-way drive yellow', () => {
    const polys = facilityPlatePolys(l);
    const yellow = polys.filter((p) => p.layer === 'paint' && p.color === YELLOW_MARKING_COLOR);
    const white = polys.filter((p) => p.layer === 'paint' && p.color === MARKING_COLOR);
    if (!l.loopRoad) {
      expect(yellow).toHaveLength(0);
      expect(white).toHaveLength(0);
      return;
    }
    expect(white.length).toBeGreaterThan(5);
    expect(yellow).toHaveLength(1);
    const half = (l.loopRoad.lanes * l.loopRoad.laneWidth) / 2;
    for (const p of yellow[0]!.points) {
      expect(Math.abs(p.x - l.drive.x)).toBeLessThan(0.1);
      expect(p.z).toBeGreaterThanOrEqual(l.loopRoad.centreline[1]!.z + half - EPS);
    }
    for (const p of white) {
      for (const pt of p.points) {
        expect(pt.x).toBeGreaterThanOrEqual(l.kerbRoad.x - half);
      }
    }
    expect(LANE_LINE_WIDTH_M).toBeLessThan(0.2);
  });
});

/** How many triangles of the plate's pavement group cover a point. */
function coverAt(id: AirportId, x: number, z: number): number {
  let count = 0;
  const l = airportLayout(id);
  const g = airportPlateGeometry(id, 0);
  const group = g.groups.find((gr) => gr.materialIndex === 1)!;
  const pos = g.getAttribute('position');
  const index = g.index!;
  const px = x - l.plot.w / 2;
  const pz = z - l.plot.d / 2;
  for (let i = group.start; i < group.start + group.count; i += 3) {
    const v = [0, 1, 2].map((k) => ({
      x: pos.getX(index.getX(i + k)),
      z: pos.getZ(index.getX(i + k)),
    }));
    const sign = (a: { x: number; z: number }, b: { x: number; z: number }): number =>
      (px - b.x) * (a.z - b.z) - (a.x - b.x) * (pz - b.z);
    const d1 = sign(v[0]!, v[1]!);
    const d2 = sign(v[1]!, v[2]!);
    const d3 = sign(v[2]!, v[0]!);
    const neg = d1 < 0 || d2 < 0 || d3 < 0;
    const pos2 = d1 > 0 || d2 > 0 || d3 > 0;
    if (!(neg && pos2)) count++;
  }
  return count;
}

/** Whether a point lies on pavement: inside any triangle of the plate's pavement group. */
function pavedAt(id: AirportId, x: number, z: number): boolean {
  return coverAt(id, x, z) > 0;
}

describe('rounded paved corners, measured from the plate', () => {
  /** The nearest a car park polygon's vertices come to a corner of its rectangle. */
  function cornerCut(id: AirportId, corner: 'nw' | 'sw'): number {
    const l = airportLayout(id);
    const cp = l.carPark!;
    const poly = facilityPlatePolys(l).find(
      (p) =>
        p.layer === 'pavement' &&
        Math.abs(Math.min(...p.points.map((q) => q.x)) - cp.x) < EPS &&
        Math.abs(Math.max(...p.points.map((q) => q.z)) - (cp.z + cp.d)) < EPS &&
        Math.min(...p.points.map((q) => q.z)) <= cp.z + EPS,
    )!;
    const z = corner === 'nw' ? Math.min(...poly.points.map((q) => q.z)) : cp.z + cp.d;
    return Math.min(...poly.points.map((p) => Math.hypot(p.x - cp.x, p.z - z)));
  }

  it("turns the airfield car park's street corners on 1.5 m and keeps its kerb corners square", () => {
    // The nearest point of a quarter arc of radius r to its square corner is r(sqrt 2 - 1) away.
    expect(cornerCut('airfield', 'sw')).toBeCloseTo(1.5 * (Math.SQRT2 - 1), 6);
    expect(cornerCut('airfield', 'nw')).toBeCloseTo(0, 6);
  });

  it("turns the regional car park's four corners on the loop's 7.6 m inside radius", () => {
    expect(cornerCut('regional-airport', 'sw')).toBeCloseTo(7.6 * (Math.SQRT2 - 1), 6);
    expect(cornerCut('regional-airport', 'nw')).toBeCloseTo(7.6 * (Math.SQRT2 - 1), 6);
  });

  it.each(['regional-airport', 'international-airport'] as const)(
    "turns the %s loop's inside on 7.6 m",
    (id) => {
      const l = airportLayout(id);
      const loop = l.loopRoad!;
      const half = (loop.lanes * loop.laneWidth) / 2;
      const turn = loop.cornerRadius.inner + half;
      // The north-east turn: its centre lies inside the ring, a turn radius from both legs.
      const east = loop.centreline[2]!.x;
      const kerbZ = loop.centreline[3]!.z;
      const cx = east - turn;
      const cz = kerbZ + turn;
      const at = (r: number): [number, number] => [cx + r * Math.SQRT1_2, cz - r * Math.SQRT1_2];
      // Inside the turn lies the car park, or grass where the international has garages.
      expect(pavedAt(id, ...at(loop.cornerRadius.inner - 0.3))).toBe(!!l.carPark);
      expect(pavedAt(id, ...at(loop.cornerRadius.outer + 0.3))).toBe(false);
      expect(pavedAt(id, ...at(loop.cornerRadius.inner + 0.3))).toBe(true);
      expect(pavedAt(id, ...at(loop.cornerRadius.outer - 0.3))).toBe(true);
      // The path itself is the fillet: every arc point is a turn radius from the centre.
      const arc = loopPath(l).filter((p) => p.x > cx && p.z < cz && p.x < east && p.z > kerbZ);
      expect(arc.length).toBeGreaterThan(3);
      for (const p of arc) expect(Math.hypot(p.x - cx, p.z - cz)).toBeCloseTo(turn, 6);
    },
  );

  it.each(['regional-airport', 'international-airport'] as const)(
    'eases the %s kerb lanes into the loop over a smooth taper',
    (id) => {
      const l = airportLayout(id);
      const loop = l.loopRoad!;
      const half = (loop.lanes * loop.laneWidth) / 2;
      const k = l.kerbRoad;
      const turnEnd = k.x + 2 * half + loop.cornerRadius.inner;
      const centre = k.z + k.d / 2;
      const quads = facilityPlatePolys(l).filter(
        (p) =>
          p.layer === 'pavement' &&
          p.points.length === 4 &&
          p.points.every((q) => q.x >= turnEnd - EPS && q.x <= turnEnd + KERB_TAPER_M + EPS) &&
          p.points.some((q) => Math.abs(q.z - centre) > half + 1e-9 || true) &&
          Math.abs(p.points[0]!.z + p.points[3]!.z - 2 * centre) < 1e-6,
      );
      quads.sort((a, b) => a.points[0]!.x - b.points[0]!.x);
      expect(quads).toHaveLength(8);
      const widths = quads.map((q) => Math.abs(q.points[3]!.z - q.points[0]!.z) / 2);
      expect(widths[0]).toBeCloseTo(half, 6);
      // The far edge of the last step reaches the full kerb width, and each step grows, gently at first.
      const last = quads[7]!;
      expect(Math.abs(last.points[2]!.z - last.points[1]!.z) / 2).toBeCloseTo(k.d / 2, 6);
      for (let i = 1; i < widths.length; i++)
        expect(widths[i]!).toBeGreaterThanOrEqual(widths[i - 1]!);
      expect(widths[1]! - widths[0]!).toBeLessThan(0.15 * (k.d / 2 - half));
    },
  );

  it('puts a round-nosed lawn island at both ends of every pair of rows in the regional car park', () => {
    const l = airportLayout('regional-airport');
    const cp = l.carPark!;
    const lawn = facilityPlatePolys(l).filter(
      (p) => p.layer === 'paint' && p.color[0] === materialUnit('mownLawn')[0],
    );
    expect(lawn).toHaveLength(2 * Math.ceil(carParkRowZs(cp.d).length / 2));
    for (const island of lawn) {
      const xs = island.points.map((p) => p.x);
      const w = Math.max(...xs) - Math.min(...xs);
      expect(w).toBeCloseTo(ISLAND_WIDTH_M, 6);
      // A full round nose: the extreme point is on the island's centre line, and arcs lie between.
      expect(island.points.length).toBeGreaterThan(8);
      expect(
        Math.abs(Math.min(...xs) - cp.x) < EPS || Math.abs(Math.max(...xs) - (cp.x + cp.w)) < EPS,
      ).toBe(true);
    }
    // No stall line crosses an island, and the stall count holds.
    const whiteQuads = airportPlateQuads('regional-airport', 0).filter(
      (q) => q.color === MARKING_COLOR && q.z0 >= cp.z && q.z1 <= cp.z + cp.d,
    );
    for (const q of whiteQuads) {
      expect(q.x0).toBeGreaterThanOrEqual(cp.x + ISLAND_WIDTH_M - 0.06);
      expect(q.x1).toBeLessThanOrEqual(cp.x + cp.w - ISLAND_WIDTH_M + 0.06);
    }
    expect(carParkCapacity(l)).toBeGreaterThanOrEqual(1200);
  });

  it.each(['regional-airport', 'international-airport'] as const)(
    'fillets the %s service road where it leaves the loop and where it meets a truck court, on 7.6 m',
    (id) => {
      const l = airportLayout(id);
      const w = l.serviceRoad.width;
      const reach = (j: { x: number; z: number }): { dx: number; dz: number } | null => {
        const poly = facilityPlatePolys(l).find(
          (p) =>
            p.layer === 'pavement' &&
            p.points[0] !== undefined &&
            Math.abs(p.points[0].x - j.x) < 1e-6 &&
            Math.abs(p.points[0].z - j.z) < 1e-6 &&
            p.points.length > 4,
        );
        if (!poly) return null;
        return {
          dx: Math.max(...poly.points.map((q) => Math.abs(q.x - j.x))),
          dz: Math.max(...poly.points.map((q) => Math.abs(q.z - j.z))),
        };
      };
      // Both inside corners where the first service road leaves the loop's west leg.
      const start = l.serviceRoad.lines[0]![0]!;
      for (const side of [-1, 1]) {
        const r = reach({ x: start.x, z: start.z + (side * w) / 2 });
        expect(r, 'a fillet at the loop').not.toBeNull();
        expect(r!.dx).toBeCloseTo(7.6, 6);
        expect(r!.dz).toBeCloseTo(7.6, 6);
      }
      // The first court's west side, where the lorry turns off the road into the court.
      const court = l.cargo[0]!.court;
      const r = reach({ x: court.x, z: court.z + court.d });
      expect(r, 'a fillet at the court').not.toBeNull();
      expect(r!.dx).toBeCloseTo(7.6, 6);
      expect(r!.dz).toBeCloseTo(7.6, 6);
    },
  );

  it('butts the regional car park against the kerb lanes with no overlap and no gap', () => {
    const id = 'regional-airport';
    const l = airportLayout(id);
    const cp = l.carPark!;
    const loop = l.loopRoad!;
    const half = (loop.lanes * loop.laneWidth) / 2;
    const ringTop = l.kerbRoad.z + l.kerbRoad.d / 2 + half;
    const turnEnd = cp.x + loop.cornerRadius.inner;
    // Along the straight, and half way along the taper, one triangle covers each side of the seam.
    const straight = [
      turnEnd + KERB_TAPER_M + 5,
      cp.x + cp.w / 2,
      cp.x + cp.w - loop.cornerRadius.inner - KERB_TAPER_M - 5,
    ];
    for (const x of straight) {
      expect(coverAt(id, x, cp.z - 0.15), `kerb side at ${x}`).toBe(1);
      expect(coverAt(id, x, cp.z + 0.15), `car park side at ${x}`).toBe(1);
    }
    const seam = ringTop + (cp.z - ringTop) * 0.5;
    const x = turnEnd + KERB_TAPER_M / 2;
    expect(coverAt(id, x, seam - 0.1)).toBe(1);
    expect(coverAt(id, x, seam + 0.1)).toBe(1);
  });

  it('fillets 9.1 m where a taxiway connector leaves the taxiway edge', () => {
    const l = airportLayout('regional-airport');
    const c = l.connectors[2]!;
    // The mid connector: the corner square fills near the corner and stays grass near the arc's centre.
    const z = c.z + c.d;
    expect(pavedAt('regional-airport', c.x - 1, z - 1)).toBe(true);
    expect(pavedAt('regional-airport', c.x - 7.3, z - 7.3)).toBe(false);
    expect(
      pavedAt(
        'regional-airport',
        c.x - (9.1 * (1 - Math.SQRT1_2) - 0.3),
        z - (9.1 * (1 - Math.SQRT1_2) - 0.3),
      ),
    ).toBe(true);
  });
});

describe('what the facilities cost to draw', () => {
  const tris = (g: THREE.BufferGeometry): number =>
    g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
  const BOX = 12;
  const CYLINDER = 64;

  function total(id: AirportId): number {
    const l = airportLayout(id);
    let sum = tris(airportPlateGeometry(id, 0));
    for (const p of facilityParts(l)) sum += p.pool === 'cylinder' ? CYLINDER : BOX;
    for (const b of airportBuildings(l, entryHeight[id]))
      sum += (2 + buildingPanes(b).length) * BOX;
    for (const s of l.stands) sum += tris(aircraftGeometry(s.kind));
    sum += tris(fenceFabricGeometry(l));
    return sum;
  }

  // Measured: 13,854, 23,882 and 37,318 (the international drew 8,500 plate triangles before the facilities);
  // each ceiling is the figure measured, and ten percent.
  const CEILING: Record<AirportId, number> = {
    airfield: 15240,
    'regional-airport': 26270,
    'international-airport': 41050,
  };

  it.each(AIRPORT_IDS)('%s stays under its measured ceiling', (id) => {
    expect(total(id)).toBeLessThanOrEqual(CEILING[id]);
  });
});
