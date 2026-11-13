import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  DEPOT_BODY,
  DEPOT_CANOPY,
  DEPOT_PLATFORM,
  DEPOT_TRACK_EDGE_M,
  computeDepotTrackside,
  RAIL_YARD_SPEC,
  TRAM_DEPOT_SPEC,
  UtilityKitRenderer,
  YARD_CARS,
  chooseYardJoin,
  computeYardLayout,
  footprintHalfExtents,
  railSideOf,
  rotateLocalXZ,
  yardFootprint,
  yardFrame,
  type UtilityKitPartKind,
  type Vec2,
  type YardJoin,
} from './utilitykits';
import catalogData from '../data/catalog.json';
import { BuildingState, type BuildingCatalogEntry } from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import { footprintForRotation } from '../shared/footprint';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const byId = (id: string): BuildingCatalogEntry => catalog.find((e) => e.id === id)!;
const RAIL = byId('rail-yard');
const TRAM = byId('tram-depot');
const flat = (): number => 0;
const SPECS = { rail: RAIL_YARD_SPEC, tram: TRAM_DEPOT_SPEC } as const;
const ENTRIES = { rail: RAIL, tram: TRAM } as const;
const FULL: YardJoin = { reach: 'full', mirror: false };
const stationLineOffset = TILE_METERS / 2;

const headingDeg = (a: Vec2, b: Vec2): number => (Math.atan2(b.z - a.z, b.x - a.x) * 180) / Math.PI;
const turnDeg = (a: number, b: number): number => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

/** The lead's two rails, each as the polyline of chord ends offset by half the gauge. */
function rails(path: Vec2[]): Vec2[][] {
  return [-0.75, 0.75].map((off) =>
    path.map((p, i) => {
      const a = path[Math.max(0, i - 1)]!;
      const b = path[Math.min(path.length - 1, i + 1)]!;
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      return { x: p.x + (-(b.z - a.z) / len) * off, z: p.z + ((b.x - a.x) / len) * off };
    }),
  );
}

describe.each(['rail', 'tram'] as const)('the %s yard lead to its line', (mode) => {
  const spec = SPECS[mode];
  const cars = YARD_CARS[mode];
  const footprint = yardFootprint(ENTRIES[mode]);
  const { halfD, halfW } = footprintHalfExtents(footprint);
  // The track the lead joins: the tile's centre for a railway, the nearer lane's for a tram street.
  const lineOffset = TILE_METERS / 2 - spec.trackOffset;

  it('joins a tram street at its nearer lane, not at the tile centre', () => {
    expect(TRAM_DEPOT_SPEC.trackOffset).toBeCloseTo(1.875, 6);
    expect(RAIL_YARD_SPEC.trackOffset).toBe(0);
  });

  it.each([false, true])(
    'is continuous, tangent to the line and to the climb (off the end: %s)',
    (fromEnd) => {
      for (const reach of ['full', 'short'] as const) {
        const layout = computeYardLayout(footprint, spec, fromEnd, cars, { reach, mirror: false });
        const path = layout.joinPath;
        const lead = layout.lead[0]!;
        // Starts on the line's centre, ends where the climb starts.
        const first = path[0]!;
        if (fromEnd) expect(first.x).toBeCloseTo(-halfW - lineOffset, 6);
        else expect(first.z).toBeCloseTo(-halfD - lineOffset, 6);
        const last = path[path.length - 1]!;
        expect(Math.hypot(last.x - lead.x0, last.z - lead.z0)).toBeLessThan(0.01);
        // The first chord runs along the line, the last along the climb.
        const lineHeading = fromEnd ? 90 : 0;
        expect(turnDeg(headingDeg(path[0]!, path[1]!), lineHeading)).toBeLessThanOrEqual(1);
        const climb = headingDeg({ x: lead.x0, z: lead.z0 }, { x: lead.x1, z: lead.z1 });
        expect(turnDeg(headingDeg(path[path.length - 2]!, last), climb)).toBeLessThanOrEqual(1);
        // Chords share their end points, so each rail runs unbroken from the line to the climb.
        expect(rails(path)).toHaveLength(2);
        // The opening at each joint between chords, on the outer rail, stays under 5 cm.
        for (let i = 2; i < path.length; i++) {
          // Chords are shared points, so the rails meet; their joint opening stays under 5 cm.
          const a = headingDeg(path[Math.max(0, i - 2)]!, path[i - 1]!);
          const b = headingDeg(path[i - 1]!, path[i]!);
          expect(2 * 0.75 * Math.sin((turnDeg(a, b) * Math.PI) / 360)).toBeLessThan(0.05);
        }
      }
    },
  );

  it('turns through 45° on one curve and meets the line at its turnout', () => {
    const full = computeYardLayout(footprint, spec, false, cars, FULL);
    const turn = full.turnout!;
    expect(turn.at.z).toBeCloseTo(-halfD - lineOffset, 6);
    const widest = (-full.lead[0]!.z0 - halfD - lineOffset) * -1;
    expect(turn.radius).toBeCloseTo(widest / (1 - Math.SQRT1_2), 6);
    const short = computeYardLayout(footprint, spec, false, cars, {
      reach: 'short',
      mirror: false,
    });
    expect(short.turnout!.radius).toBeCloseTo(spec.shortRadius, 6);
    expect(short.joinPath.length).toBeGreaterThan(full.joinPath.length - 1);
  });
});

describe('how a yard meets its line follows the tiles', () => {
  const footprint = yardFootprint(RAIL);
  const join = (fromEnd: boolean, tiles: (i: number) => boolean): YardJoin =>
    chooseYardJoin(footprint, RAIL_YARD_SPEC, fromEnd, tiles);

  it('takes the full curve where two tiles lie before the corner', () => {
    expect(join(false, (i) => i >= -2 && i < 9)).toEqual({ reach: 'full', mirror: false });
  });
  it('takes the tighter curve where one tile lies before the corner', () => {
    expect(join(false, (i) => i >= -1 && i < 4)).toEqual({ reach: 'short', mirror: false });
  });
  it('lays the yard mirrored where the line runs only the other way', () => {
    expect(join(false, (i) => i >= 0 && i <= 5)).toEqual({ reach: 'full', mirror: true });
    expect(join(false, (i) => i === 4)).toEqual({ reach: 'short', mirror: true });
  });
  it('ends the lead at a buffer stop where there is no room either way', () => {
    expect(join(false, () => false)).toEqual({ reach: 'stop', mirror: false });
    expect(join(false, (i) => i >= 0 && i < 4)).toEqual({ reach: 'stop', mirror: false });
  });
  it('never mirrors a yard whose line is off its end', () => {
    for (const tiles of [(i: number) => i >= 0 && i < 3, () => false]) {
      expect(join(true, tiles).mirror).toBe(false);
    }
  });
  it('is the same answer every time', () => {
    expect(join(false, (i) => i >= -1 && i < 4)).toEqual(join(false, (i) => i >= -1 && i < 4));
  });
});

describe('a mirrored yard', () => {
  const footprint = yardFootprint(RAIL);
  const mirrored = computeYardLayout(footprint, RAIL_YARD_SPEC, false, YARD_CARS.rail, {
    reach: 'full',
    mirror: true,
  });
  const plain = computeYardLayout(footprint, RAIL_YARD_SPEC, false, YARD_CARS.rail, FULL);

  it('is the yard with its track side reflected along the track, its street side left alone', () => {
    expect(mirrored.join.mirror).toBe(true);
    expect(mirrored.lead[0]!.x0).toBeCloseTo(-plain.lead[0]!.x0, 9);
    expect(mirrored.roads[0]!.x0).toBeCloseTo(-plain.roads[0]!.x0, 9);
    expect(mirrored.roads[0]!.x1).toBeCloseTo(-plain.roads[0]!.x1, 9);
    expect(mirrored.drive).toEqual(plain.drive);
    expect(mirrored.office).toEqual(plain.office);
    expect(mirrored.sets[0]![0]!.turn).toBe(3);
  });

  it('opens the fence where its lead crosses and stands every part inside the lot', () => {
    const gaps = mirrored.fenceGaps.slice(0, -1);
    expect(gaps.length).toBeGreaterThan(0);
    const lot = footprintHalfExtents(footprint);
    for (const r of [mirrored.hall, mirrored.office]) {
      expect(r.x0).toBeGreaterThanOrEqual(-lot.halfW);
      expect(r.x1).toBeLessThanOrEqual(lot.halfW);
    }
  });

  it('places every part with a positive-determinant transform and winds every face outward', () => {
    const renderer = new UtilityKitRenderer(
      new THREE.Scene(),
      flat,
      [RAIL],
      undefined,
      // A line along the lot's +X side beyond the far corner only.
      (x, z) => z === 9 && x >= 10 + 3 && x < 10 + 6,
    );
    renderer.apply({
      added: [
        {
          id: 1,
          catalogId: 'rail-yard',
          x: 10,
          z: 10,
          rotation: 1,
          level: 1,
          state: BuildingState.Active,
          problems: 0,
        },
      ],
      removed: [],
      updated: [],
    });
    const kinds = renderer
      .poolKinds('rail-yard')
      .filter((k) => renderer.partSlotsFor(1, k).length > 0 && k !== 'railYardCar');
    expect(kinds.some((k) => k.includes('Mirror'))).toBe(true);
    for (const kind of kinds as UtilityKitPartKind[]) {
      for (const slot of renderer.partSlotsFor(1, kind)) {
        const m = new THREE.Matrix4();
        renderer.getPartMatrix('rail-yard', kind, slot, m);
        expect(m.determinant(), kind).toBeGreaterThan(0);
      }
      const geometry = renderer.partGeometry('rail-yard', kind)!;
      const pos = geometry.getAttribute('position');
      const nor = geometry.getAttribute('normal');
      const index = geometry.getIndex();
      const count = index ? index.count : pos.count;
      const at = (n: number): number => (index ? index.getX(n) : n);
      let inward = 0;
      for (let t = 0; t < count; t += 3) {
        const [a, b, c] = [at(t), at(t + 1), at(t + 2)];
        const p = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, i);
        const face = new THREE.Vector3()
          .crossVectors(p(b!).sub(p(a!)), p(c!).sub(p(a!)))
          .normalize();
        const stored = new THREE.Vector3().fromBufferAttribute(nor, a!);
        if (face.lengthSq() > 0.5 && face.dot(stored) < 0) inward++;
      }
      expect(inward, kind).toBe(0);
    }
  });
});

describe('a yard is laid against the tiles of its own line', () => {
  it('joins the line it stands beside, turned to it at every rotation', () => {
    for (const rotation of [0, 1, 2, 3] as const) {
      const lot = footprintForRotation(RAIL, rotation);
      // A long line along the lot's north edge, tiles 4 either side.
      const trackAt = (x: number, z: number): boolean => z === 9 && x >= 6 && x < 10 + lot.w + 4;
      const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [RAIL], undefined, trackAt);
      renderer.apply({
        added: [
          {
            id: 1,
            catalogId: 'rail-yard',
            x: 10,
            z: 10,
            rotation,
            level: 1,
            state: BuildingState.Active,
            problems: 0,
          },
        ],
        removed: [],
        updated: [],
      });
      const facing = railSideOf(10, 10, lot, trackAt)!;
      const frame = yardFrame(RAIL, rotation, facing);
      const joined = renderer
        .poolKinds('rail-yard')
        .filter((k) => k.startsWith('railYardTrack') && renderer.partSlotsFor(1, k).length > 0);
      expect(joined, `rotation ${rotation}`).toHaveLength(1);
      expect(joined[0]!.includes('Stop'), `rotation ${rotation}`).toBe(false);
      expect(joined[0]!.includes('End')).toBe(frame.fromEnd);
      // The tangent point lies on the line's centre in the world.
      const layout = computeYardLayout(
        frame.footprint,
        RAIL_YARD_SPEC,
        frame.fromEnd,
        YARD_CARS.rail,
      );
      const t = rotateLocalXZ(layout.turnout!.at.x, layout.turnout!.at.z, frame.turn);
      const cx = (10 + lot.w / 2) * TILE_METERS + t.x;
      const cz = (10 + lot.d / 2) * TILE_METERS + t.z;
      expect(trackAt(Math.floor(cx / TILE_METERS), Math.floor(cz / TILE_METERS))).toBe(true);
      const onCentre = facing % 2 === 0 ? cz : cx;
      const centreLine = { 0: 10 + lot.d + 0.5, 1: 10 + lot.w + 0.5, 2: 9.5, 3: 9.5 }[facing];
      expect(onCentre / TILE_METERS).toBeCloseTo(centreLine, 6);
    }
  });
});

describe('a station platform stands at its track', () => {
  const STATION = byId('rail-station');
  const footprint = { w: 3, d: 2 };
  const { halfD } = footprintHalfExtents(footprint);

  it('runs out to 1.55 m from the track centre along each tile that has track, tactile strip at its edge', () => {
    const lay = computeDepotTrackside(footprint, [true, false, true]);
    expect(lay.platform).toHaveLength(2);
    for (const r of lay.platform) {
      expect(r.z0 - (-halfD - stationLineOffset)).toBeCloseTo(DEPOT_TRACK_EDGE_M, 9);
      expect(r.z1).toBe(-halfD);
    }
    for (const r of lay.tactile) {
      expect(r.z1 - r.z0).toBeCloseTo(0.61, 9);
      expect(r.z0).toBeCloseTo(lay.platform[0]!.z0, 9);
    }
    // The canopy's track-side edge moves with it, and nothing lies on the track.
    for (const r of lay.canopy) expect(r.z0).toBeCloseTo(lay.platform[0]!.z0, 9);
    expect(computeDepotTrackside(footprint, [false, false, false]).platform).toHaveLength(0);
  });

  it('roofs only the 12 ft platform at the track, not the paving that carries on to the lot', () => {
    const lay = computeDepotTrackside(footprint, [true, true, true]);
    expect(lay.canopy.length).toBeGreaterThan(0);
    for (const c of lay.canopy) {
      const platform = lay.platform.find((p) => p.x0 <= c.x0 + 1e-9 && p.x1 >= c.x1 - 1e-9)!;
      expect(platform).toBeDefined();
      expect(c.z0).toBeCloseTo(platform.z0, 9);
      expect(c.z1 - c.z0).toBeCloseTo(DEPOT_PLATFORM.w, 9);
      expect(c.z1).toBeLessThan(platform.z1 - 1);
    }
    for (const p of lay.posts) {
      expect(lay.canopy.some((c) => p.x > c.x0 && p.x < c.x1 && p.z > c.z0 && p.z < c.z1)).toBe(
        true,
      );
    }
  });

  it.each([-0.6, -0.3, 0, 0.2, 0.4, 0.6])(
    'keeps the canopy under the depot’s eaves, with headroom over the platform, where the track lies %s m off the lot',
    (rise) => {
      const lay = computeDepotTrackside(footprint, [true, true, true], rise);
      const { lotTop, edgeTop } = lay.levels;
      const top = lay.canopyBottom + DEPOT_CANOPY.slab;
      expect(top - lotTop).toBeLessThanOrEqual(DEPOT_BODY.plate - 0.3 + 1e-9);
      expect(lay.canopyBottom - edgeTop).toBeGreaterThanOrEqual(2.03 - 1e-9);
    },
  );

  it.each([-0.4, -0.2, 0, 0.2, 0.4])(
    'runs one unbroken ramp from the platform to the lot no steeper than 1 in 12, with a 1.525 m landing at each end, where the track lies %s m off the lot',
    (rise) => {
      const lay = computeDepotTrackside(footprint, [true, true, true], rise);
      const pieces = lay.approach;
      const first = pieces[0]!;
      const last = pieces[pieces.length - 1]!;
      // From the platform's edge to the lot's edge with no gap between pieces.
      expect(first.z0).toBeCloseTo(lay.platform[0]!.z0, 9);
      expect(last.z1).toBeCloseTo(lay.platform[0]!.z1, 9);
      expect(first.y0).toBeCloseTo(lay.levels.edgeTop, 9);
      expect(last.y1).toBeCloseTo(lay.levels.lotTop, 9);
      for (let i = 1; i < pieces.length; i++) {
        expect(pieces[i]!.z0).toBeCloseTo(pieces[i - 1]!.z1, 9);
        expect(pieces[i]!.y0).toBeCloseTo(pieces[i - 1]!.y1, 9);
      }
      for (const p of pieces) {
        expect(Math.abs(p.y1 - p.y0) / (p.z1 - p.z0)).toBeLessThanOrEqual(1 / 12 + 1e-9);
      }
      // A flat landing at the platform end, and the lot's own platform flat beyond the other.
      expect(first.y1).toBeCloseTo(first.y0, 9);
      expect(first.z1 - first.z0).toBeGreaterThanOrEqual(1.525 - 1e-9);
      expect(lay.platform[0]!.z1 - last.z0).toBeGreaterThan(0);
    },
  );

  it('keeps every platform vertex clear of the sleepers and rails of the track', () => {
    const renderer = new UtilityKitRenderer(
      new THREE.Scene(),
      flat,
      [STATION],
      undefined,
      (x, z) => z === 9 && x >= 10 && x < 12,
    );
    renderer.apply({
      added: [
        {
          id: 1,
          catalogId: 'rail-station',
          x: 10,
          z: 10,
          rotation: 0,
          level: 1,
          state: BuildingState.Active,
          problems: 0,
        },
      ],
      removed: [],
      updated: [],
    });
    const kinds = renderer
      .poolKinds('rail-station')
      .filter((k) => k.startsWith('depotTrackside') && renderer.partSlotsFor(1, k).length > 0);
    expect(kinds).toHaveLength(1);
    const kind = kinds[0] as UtilityKitPartKind;
    const m = new THREE.Matrix4();
    renderer.getPartMatrix('rail-station', kind, renderer.partSlotsFor(1, kind)[0]!, m);
    const pos = renderer.partGeometry('rail-station', kind)!.getAttribute('position');
    const trackCentreZ = 9.5 * TILE_METERS;
    for (let i = 0; i < pos.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m);
      expect(Math.abs(v.z - trackCentreZ)).toBeGreaterThanOrEqual(DEPOT_TRACK_EDGE_M - 1e-6);
    }
  });
});

describe('a changed track tile lays again only the kit beside it', () => {
  it('re-lays the yard whose line grew and leaves the other alone', () => {
    const lines = new Set<string>();
    const railAt = (x: number, z: number): boolean => lines.has(`${x},${z}`);
    const renderer = new UtilityKitRenderer(new THREE.Scene(), flat, [RAIL], undefined, railAt);
    const yard = (id: number, x: number) => ({
      id,
      catalogId: 'rail-yard',
      x,
      z: 10,
      rotation: 1 as const,
      level: 1,
      state: BuildingState.Active,
      problems: 0,
    });
    // Both yards have track along their own long edge only: each ends at a buffer stop.
    for (const x of [10, 60]) for (let i = 0; i < 4; i++) lines.add(`${x + i},9`);
    renderer.apply({ added: [yard(1, 10), yard(2, 60)], removed: [], updated: [] });
    expect(renderer.partSlotsFor(1, 'railYardTrackStop')).toHaveLength(1);
    expect(renderer.partSlotsFor(2, 'railYardTrackStop')).toHaveLength(1);
    const before = renderer.partSlotsFor(2, 'railYardTrackStop');
    // The line beside the first yard runs on two tiles before its corner.
    lines.add('8,9');
    lines.add('9,9');
    expect(
      renderer.relayBeside([
        { x: 8, z: 9 },
        { x: 9, z: 9 },
      ]),
    ).toEqual([1]);
    expect(renderer.partSlotsFor(1, 'railYardTrackStop')).toHaveLength(0);
    expect(renderer.partSlotsFor(1, 'railYardTrack')).toHaveLength(1);
    expect(renderer.partSlotsFor(2, 'railYardTrackStop')).toEqual(before);
    expect(renderer.relayBeside([{ x: 200, z: 200 }])).toEqual([]);
  });
});

/** A vertex colour as the kit's painted geometry stores it. */
const painted = (rgb: readonly [number, number, number]): [number, number, number] => {
  const c = new THREE.Color(new THREE.Color(rgb[0], rgb[1], rgb[2]).getHex());
  return [c.r, c.g, c.b];
};
const sameColour = (a: ArrayLike<number>, i: number, b: readonly number[]): boolean =>
  Math.abs(a[i * 3]! - b[0]!) < 1e-4 &&
  Math.abs(a[i * 3 + 1]! - b[1]!) < 1e-4 &&
  Math.abs(a[i * 3 + 2]! - b[2]!) < 1e-4;

/** Ground that holds `h` m up to the line's tile centre (z = 190) and falls evenly to 0 by the lot's edge (z = 200). */
const slope =
  (h: number) =>
  (_x: number, z: number): number =>
    z < 190 ? h : z < 200 ? h * (1 - (z - 190) / 10) : 0;

describe('a lead follows the ground it stands on', () => {
  it.each([1.5, -1.5])(
    'keeps its rails at the line’s level at the points and the ladder’s at the fence with the line %f m off the lot',
    (h) => {
      const alongTrack = (x: number, z: number): boolean => z === 9 && x >= 4 && x < 20;
      const renderer = new UtilityKitRenderer(
        new THREE.Scene(),
        slope(h),
        [RAIL],
        undefined,
        alongTrack,
      );
      renderer.apply({
        added: [
          {
            id: 1,
            catalogId: 'rail-yard',
            x: 10,
            z: 10,
            rotation: 1,
            level: 1,
            state: BuildingState.Active,
            problems: 0,
          },
        ],
        removed: [],
        updated: [],
      });
      const kind = renderer
        .poolKinds('rail-yard')
        .find((k) => k.startsWith('railYardTrack') && renderer.partSlotsFor(1, k).length > 0)!;
      expect(kind).toBe(`railYardTrackR${Math.round(h * 100)}`);
      const geometry = renderer.partGeometry('rail-yard', kind)!;
      const pos = geometry.getAttribute('position');
      const col = geometry.getAttribute('color').array;
      const frame = yardFrame(RAIL, 1, 2);
      const layout = computeYardLayout(frame.footprint, RAIL_YARD_SPEC, false, YARD_CARS.rail);
      const rail = [painted([0.7, 0.71, 0.74]), painted([0.84, 0.85, 0.88])];
      const topNear = (p: Vec2): number => {
        let top = -Infinity;
        for (let i = 0; i < pos.count; i++) {
          if (!rail.some((c) => sameColour(col, i, c))) continue;
          if (Math.hypot(pos.getX(i) - p.x, pos.getZ(i) - p.z) < 1.2)
            top = Math.max(top, pos.getY(i));
        }
        return top;
      };
      // The line's rail head stands 0.162 m over its ground.
      expect(Math.abs(topNear(layout.turnout!.at) - (h + 0.162))).toBeLessThan(0.03);
      // At the fence the lead is the ladder's height: yard slab, bed, sleeper, rail.
      const ladderTop = 0.09 + 0.08 + 0.1 + 0.12;
      const start = layout.lead[0]!;
      expect(Math.abs(topNear({ x: start.x0, z: start.z0 }) - ladderTop)).toBeLessThan(0.03);
      // No sleeper beyond the turnout lies under the ground.
      const sleeper = painted([0.26, 0.22, 0.19]);
      const t = layout.turnout!.at;
      for (let i = 0; i < pos.count; i++) {
        if (!sameColour(col, i, sleeper)) continue;
        const x = pos.getX(i);
        const z = pos.getZ(i);
        if (Math.hypot(x - t.x, z - t.z) < 20) continue;
        const lotZ = 230 + z; // the yard's centre is at world z 230
        if (lotZ > 200) continue;
        // A 2.3 m sleeper spans a metre of slope each side of its centre: its ends may sink a few cm.
        expect(pos.getY(i)).toBeGreaterThanOrEqual(slope(h)(0, lotZ) - 0.08);
      }
    },
  );

  it('stands a station platform’s track edge 0.2 m over the rail and ramps to the lot’s platform', () => {
    const STATION = byId('rail-station');
    const h = 1.5;
    const renderer = new UtilityKitRenderer(
      new THREE.Scene(),
      slope(h),
      [STATION],
      undefined,
      (x, z) => z === 9 && x >= 10 && x < 12,
    );
    renderer.apply({
      added: [
        {
          id: 1,
          catalogId: 'rail-station',
          x: 10,
          z: 10,
          rotation: 0,
          level: 1,
          state: BuildingState.Active,
          problems: 0,
        },
      ],
      removed: [],
      updated: [],
    });
    const kind = renderer
      .poolKinds('rail-station')
      .find((k) => k.startsWith('depotTrackside') && renderer.partSlotsFor(1, k).length > 0)!;
    expect(kind.endsWith('R150')).toBe(true);
    const geometry = renderer.partGeometry('rail-station', kind)!;
    const pos = geometry.getAttribute('position');
    const col = geometry.getAttribute('color').array;
    const paving = painted([0.66, 0.65, 0.62]);
    const edgeZ = -30 - 10 + 1.55; // the 2×3 station's frame: track on its -Z edge, lot half-depth 30
    let atEdge = -Infinity;
    let atLot = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      if (!sameColour(col, i, paving)) continue;
      if (Math.abs(pos.getZ(i) - edgeZ) < 1e-6) atEdge = Math.max(atEdge, pos.getY(i));
      // The slab's top at the lot edge; the repaving quad lies a centimetre above it.
      if (Math.abs(pos.getZ(i) + 30) < 1e-6 && pos.getY(i) > 0.1) {
        atLot = atLot === -Infinity ? pos.getY(i) : Math.min(atLot, pos.getY(i));
      }
    }
    expect(atEdge).toBeCloseTo(h + 0.162 + 0.2, 6);
    expect(atLot).toBeCloseTo(0.09 + 0.2, 6);
  });
});

describe('a tram depot’s lead meets the street’s lane track', () => {
  const alongStreet = (x: number, z: number): boolean => z === 9 && x >= 4 && x < 20;
  const depot = {
    id: 1,
    catalogId: 'tram-depot',
    x: 10,
    z: 10,
    rotation: 1 as const,
    level: 1,
    state: BuildingState.Active,
    problems: 0,
  };

  it('ends on the lane the street’s profile gives, and keeps others off the tiles it crosses', () => {
    const renderer = new UtilityKitRenderer(
      new THREE.Scene(),
      flat,
      [TRAM],
      undefined,
      undefined,
      alongStreet,
      () => 1.2,
    );
    renderer.apply({ added: [depot], removed: [], updated: [] });
    expect(
      renderer
        .poolKinds('tram-depot')
        .some((k) => k.startsWith('tramDepotTrack') && renderer.partSlotsFor(1, k).length > 0),
    ).toBe(true);
    // The tangent point lies 1.2 m from the street tile's centre (world z 190) toward the lot.
    const frame = yardFrame(TRAM, 1, 2);
    const layout = computeYardLayout(
      frame.footprint,
      TRAM_DEPOT_SPEC,
      false,
      YARD_CARS.tram,
      { reach: 'full', mirror: false },
      1.2,
    );
    const centreZ = (10 + 1) * TILE_METERS;
    expect(centreZ + layout.turnout!.at.z).toBeCloseTo(190 + 1.2, 6);
    // The street tiles the lead crosses are kept clear, the lot's own are not named.
    const tiles = renderer.leadTiles(depot);
    expect(tiles.some((t) => t.z === 9)).toBe(true);
    expect(tiles.every((t) => !(t.z >= 10 && t.z < 12 && t.x >= 10 && t.x < 13))).toBe(true);
    expect(renderer.leadTiles({ ...depot, catalogId: 'rail-yard' })).toEqual([]);
  });
});
