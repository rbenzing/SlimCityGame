/**
 * Round car park corners: the radius read back from the vertices a lot draws, the layout left
 * exactly as it was laid out, and no stall's corner cut away.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { carParkShape } from '../shared/carparkshape';
import { lotPaving, type LotLayout, type LotRect } from '../shared/lotlayout';
import {
  AISLE_TURN_RADIUS_M,
  CAR_PARK_CORNER_RADIUS_M,
  ISLAND_NOSE_RADIUS_M,
  roundedRect,
} from '../shared/roundedoutline';
import { BuildingState, type BuildingCatalogEntry, type BuildingInstance } from '../shared/types';
import { lotLayoutFor, lotPlanFor, lotPointToWorld, type LotPlan } from './lotplan';
import { DRIVE_Y_OFFSET, LotRenderer } from './lots';
import {
  LOT_CAR_BODY,
  lotStallPlacement,
  ParkedCarRenderer,
  STRIPE_LINE_HALF_WIDTH_M,
  STRIPE_LINE_Y_OFFSET,
  YAW_JITTER_MAX,
} from './parked';

/** Whether a point lies inside a convex polygon, whichever way it winds. */
function insideConvex(poly: { x: number; z: number }[], q: { x: number; z: number }): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const cross = (b.x - a.x) * (q.z - a.z) - (b.z - a.z) * (q.x - a.x);
    if (Math.abs(cross) < 1e-9) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const entryOf = (id: string): BuildingCatalogEntry => {
  const e = catalog.find((c) => c.id === id);
  if (!e) throw new Error(`no catalog entry ${id}`);
  return e;
};

/** A street along the north side of a lot at (10, 10). */
const roadAt = (x: number, z: number): boolean => z === 9 && x >= 10;
const flat = (): number => 0;

const buildingFor = (entry: BuildingCatalogEntry): BuildingInstance =>
  ({
    id: 1,
    catalogId: entry.id,
    x: 10,
    z: 10,
    rotation: 0,
    state: BuildingState.Active,
    problems: 0,
  }) as BuildingInstance;

/** Every vertex of the lot's paving layer, as world x, z. */
function pavingVertices(entry: BuildingCatalogEntry): { x: number; z: number }[] {
  const scene = new THREE.Scene();
  const renderer = new LotRenderer(scene, flat, [entry], roadAt);
  renderer.apply({ added: [buildingFor(entry)], updated: [], removed: [] });
  const mesh = scene.children[0] as THREE.Mesh;
  const position = mesh.geometry.getAttribute('position');
  const out: { x: number; z: number }[] = [];
  for (let i = 0; i < position.count; i++) {
    if (Math.abs(position.getY(i) - DRIVE_Y_OFFSET) < 1e-6) {
      out.push({ x: position.getX(i), z: position.getZ(i) });
    }
  }
  return out;
}

const planOf = (entry: BuildingCatalogEntry): LotPlan => lotPlanFor(entry, 10, 10, roadAt)!;

/** The corner point of a lot rect and the direction into the rect from it. */
const cornerOf = (r: LotRect, k: number): { u: number; v: number; iu: number; iv: number } => {
  const east = k === 1 || k === 2;
  const south = k === 2 || k === 3;
  return { u: east ? r.u1 : r.u0, v: south ? r.v1 : r.v0, iu: east ? -1 : 1, iv: south ? -1 : 1 };
};

/** The drawn vertices that lie `radius` from the centre of the arc tangent to the corner's two edges. */
function onArc(
  plan: LotPlan,
  verts: { x: number; z: number }[],
  c: { u: number; v: number; iu: number; iv: number },
  radius: number,
): number {
  const centre = lotPointToWorld(plan.frame, c.u + c.iu * radius, c.v + c.iv * radius);
  return verts.filter((p) => Math.abs(Math.hypot(p.x - centre.x, p.z - centre.z) - radius) < 1e-3)
    .length;
}

const hasVertexAt = (
  plan: LotPlan,
  verts: { x: number; z: number }[],
  c: { u: number; v: number },
): boolean => {
  const at = lotPointToWorld(plan.frame, c.u, c.v);
  return verts.some((p) => Math.hypot(p.x - at.x, p.z - at.z) < 1e-3);
};

describe.each([
  ['a shop lot', 'com-shop-2'],
  ['an industrial lot', 'ind-factory-3'],
])('%s draws round corners', (_, id) => {
  const entry = entryOf(id);
  const plan = planOf(entry);
  const shape = carParkShape(plan.layout, true, LOT_CAR_BODY);
  const verts = pavingVertices(entry);

  it('turns an outer kerb corner on the car park radius, with no vertex left at the square corner', () => {
    const [rect, radii] = [...shape.rounded.entries()][0]!;
    const k = radii.findIndex((r) => r > 0);
    expect(k).toBeGreaterThanOrEqual(0);
    expect(radii[k]).toBe(CAR_PARK_CORNER_RADIUS_M);
    const c = cornerOf(rect, k);
    expect(onArc(plan, verts, c, CAR_PARK_CORNER_RADIUS_M)).toBeGreaterThanOrEqual(5);
    expect(hasVertexAt(plan, verts, c)).toBe(false);
  });

  it('ends an island on a full round nose of half its width', () => {
    let measured = 0;
    plan.layout.islands.forEach((island, i) => {
      shape.islands[i]!.kerbRadii.forEach((r, k) => {
        if (r === 0) return;
        expect(r).toBeCloseTo(ISLAND_NOSE_RADIUS_M, 6);
        expect(r).toBeLessThanOrEqual(Math.min(island.u1 - island.u0, island.v1 - island.v0) / 2);
        // A nose that meets paving is filled with it, so the paved layer holds the arc.
        const c = cornerOf(island, k);
        if (onArc(plan, verts, c, r) >= 5) measured += 1;
      });
    });
    expect(measured).toBeGreaterThan(0);
  });
});

describe('the inside of a turn', () => {
  it('is filled on the turn radius where the corner has room', () => {
    const entry = entryOf('ind-warehouse-2');
    const plan = planOf(entry);
    const shape = carParkShape(plan.layout, true, LOT_CAR_BODY);
    const verts = pavingVertices(entry);
    // A fan of a turn runs out from its corner to tangent points a radius along both edges.
    const big = shape.fills.filter((tri) =>
      tri.some((p) => Math.hypot(p.x - tri[0]!.x, p.z - tri[0]!.z) > ISLAND_NOSE_RADIUS_M * 2),
    );
    expect(big.length).toBeGreaterThan(0);
    const corner = big[0]![0]!;
    const far = big.flatMap((t) => t.slice(1));
    const du = Math.sign(
      far.reduce((m, p) => (Math.abs(p.x - corner.x) > Math.abs(m) ? p.x - corner.x : m), 0),
    );
    const dv = Math.sign(
      far.reduce((m, p) => (Math.abs(p.z - corner.z) > Math.abs(m) ? p.z - corner.z : m), 0),
    );
    const arc = { u: corner.x, v: corner.z, iu: du, iv: dv };
    expect(onArc(plan, verts, arc, AISLE_TURN_RADIUS_M)).toBeGreaterThanOrEqual(9);
  });
});

describe('rounding is drawing only', () => {
  const layouts: [string, LotLayout][] = [];
  for (const e of catalog) {
    const layout = lotLayoutFor(e, 0, true);
    if (layout) layouts.push([e.id, layout]);
  }

  it('covers the car parks the catalog lays out', () => {
    expect(layouts.length).toBeGreaterThan(40);
  });

  it.each(layouts)(
    '%s: the layout, its stalls and its lot are exactly as laid out',
    (_, layout) => {
      const before = JSON.stringify(layout);
      const stalls = layout.stalls.length;
      carParkShape(layout, true);
      expect(JSON.stringify(layout)).toBe(before);
      expect(layout.stalls).toHaveLength(stalls);
    },
  );

  it.each(layouts)('%s: no berth or bay corner is cut and no fill lies on paving', (_, layout) => {
    const shape = carParkShape(layout, true, LOT_CAR_BODY);
    const paving = lotPaving(layout);
    const stallRects = [
      ...layout.stalls.map((s) => s.rect),
      ...layout.berths,
      ...layout.trailerStalls,
    ];
    for (const [rect, radii] of shape.rounded) {
      expect([...layout.berths, ...layout.trailerStalls]).not.toContain(rect);
      radii.forEach((r, k) => {
        if (r === 0) return;
        const c = cornerOf(rect, k);
        const cut: LotRect = {
          u0: Math.min(c.u, c.u + c.iu * r),
          u1: Math.max(c.u, c.u + c.iu * r),
          v0: Math.min(c.v, c.v + c.iv * r),
          v1: Math.max(c.v, c.v + c.iv * r),
        };
        for (const s of stallRects.filter((o) => o !== rect)) {
          const overlap =
            s.u0 < cut.u1 - 1e-6 &&
            cut.u0 < s.u1 - 1e-6 &&
            s.v0 < cut.v1 - 1e-6 &&
            cut.v0 < s.v1 - 1e-6;
          expect(overlap).toBe(false);
        }
      });
    }
    const paved = [...paving.yard, ...paving.concrete, ...paving.lane];
    for (const tri of shape.fills) {
      const u = (tri[0]!.x + tri[1]!.x + tri[2]!.x) / 3;
      const v = (tri[0]!.z + tri[1]!.z + tri[2]!.z) / 3;
      expect(paved.some((p) => u > p.u0 && u < p.u1 && v > p.v0 && v < p.v1)).toBe(false);
    }
  });

  it('keeps the street edge square and rounds the lot sides and rear', () => {
    let onSideOrRear = 0;
    for (const [, layout] of layouts) {
      const shape = carParkShape(layout, true, LOT_CAR_BODY);
      for (const [rect, radii] of shape.rounded) {
        radii.forEach((r, k) => {
          if (r === 0) return;
          const c = cornerOf(rect, k);
          const { lot } = layout;
          expect(c.v).toBeGreaterThan(lot.v0 + 1e-6);
          if (
            Math.abs(c.u - lot.u0) < 1e-6 ||
            Math.abs(c.u - lot.u1) < 1e-6 ||
            Math.abs(c.v - lot.v1) < 1e-6
          ) {
            onSideOrRear += 1;
          }
        });
      }
    }
    expect(onSideOrRear).toBeGreaterThan(20);
  });

  it.each(['com-shop-2', 'com-strip-2', 'ind-factory-3', 'ind-warehouse-2', 'com-market-2'])(
    '%s: every cut stall leaves the real parked car on paving',
    (id) => {
      const plan = planOf(entryOf(id));
      const shape = carParkShape(plan.layout, true, LOT_CAR_BODY);
      let cut = 0;
      plan.layout.stalls.forEach((stall) => {
        const radii = shape.rounded.get(stall.rect);
        if (!radii) return;
        cut += 1;
        const r = stall.rect;
        const outline = roundedRect({ x: r.u0, z: r.v0, w: r.u1 - r.u0, d: r.v1 - r.v0 }, radii);
        const poly = outline.map((p) => lotPointToWorld(plan.frame, p.x, p.z));
        const at = lotStallPlacement(plan.frame, stall, LOT_CAR_BODY.length);
        for (const jitter of [-YAW_JITTER_MAX, YAW_JITTER_MAX]) {
          const yaw = at.baseYaw + jitter;
          const fwd = { x: Math.sin(yaw), z: Math.cos(yaw) };
          const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
          for (const a of [-1, 1]) {
            for (const b of [-1, 1]) {
              const q = {
                x:
                  at.worldX +
                  (fwd.x * a * LOT_CAR_BODY.length) / 2 +
                  (right.x * b * LOT_CAR_BODY.width) / 2,
                z:
                  at.worldZ +
                  (fwd.z * a * LOT_CAR_BODY.length) / 2 +
                  (right.z * b * LOT_CAR_BODY.width) / 2,
              };
              expect(insideConvex(poly, q), `${id} stall corner`).toBe(true);
            }
          }
        }
      });
      expect(cut, id).toBeGreaterThanOrEqual(0);
    },
  );

  it.each(['com-shop-2', 'com-strip-2', 'ind-factory-3', 'ind-warehouse-2', 'com-market-2'])(
    '%s: no painted line vertex lies off the paved outline',
    (id) => {
      const entry = entryOf(id);
      const plan = planOf(entry);
      const shape = carParkShape(plan.layout, true, LOT_CAR_BODY);
      const scene = new THREE.Scene();
      new ParkedCarRenderer(scene, flat, [entry], roadAt).apply({
        added: [buildingFor(entry)],
        updated: [],
        removed: [],
      });
      const outlines = lotPaving(plan.layout).yard.map((r) => {
        const radii = shape.rounded.get(r) ?? 0;
        const outline = roundedRect({ x: r.u0, z: r.v0, w: r.u1 - r.u0, d: r.v1 - r.v0 }, radii);
        return outline.map((p) => lotPointToWorld(plan.frame, p.x, p.z));
      });
      // A line is centred on an edge, so half its width may stand past the paving.
      const reach = STRIPE_LINE_HALF_WIDTH_M + 0.01;
      const distance = (poly: { x: number; z: number }[], q: { x: number; z: number }): number => {
        if (insideConvex(poly, q)) return 0;
        let best = Infinity;
        poly.forEach((a, i) => {
          const b = poly[(i + 1) % poly.length]!;
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const t = Math.max(
            0,
            Math.min(1, ((q.x - a.x) * dx + (q.z - a.z) * dz) / (dx * dx + dz * dz)),
          );
          best = Math.min(best, Math.hypot(q.x - a.x - t * dx, q.z - a.z - t * dz));
        });
        return best;
      };
      let checked = 0;
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        const position = mesh.geometry?.getAttribute('position');
        if (!position) return;
        for (let i = 0; i < position.count; i++) {
          if (Math.abs(position.getY(i) - STRIPE_LINE_Y_OFFSET) > 1e-6) continue;
          const q = { x: position.getX(i), z: position.getZ(i) };
          checked += 1;
          expect(
            Math.min(...outlines.map((p) => distance(p, q))),
            `${id} line vertex`,
          ).toBeLessThanOrEqual(reach);
        }
      });
      expect(checked, id).toBeGreaterThan(0);
    },
  );
});
