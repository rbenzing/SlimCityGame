import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  computeTramPolePlacements,
  computeTramWireRuns,
  FurnitureRoadTile,
  RoadFurnitureRenderer,
  TRAM_POLE_ARM_LENGTH_M,
} from './roadfurniture';
import type { TramPoleStand } from './roadfurniture';
import { TRAM_SUPPORT_MAX_M, TRAM_WIRE_HEIGHT_M } from './tramwire';
import { allMovements, trackPaths } from './trackpaths';
import { TILE_METERS, tileToWorld } from '../shared/constants';
import { RoadTier } from '../shared/types';
import { composeProfile, NO_EDITS, presetProfileForTier } from '../shared/roadprofile';

const Z = 5;
const LANE = 1.875;
const flat = (): number => 0;
const centre = tileToWorld(Z);

const run = (
  tier: RoadTier,
  length = 20,
  extra: Partial<FurnitureRoadTile> = {},
): FurnitureRoadTile[] => Array.from({ length }, (_, x) => ({ x, z: Z, tier, ...extra }));
const mixed = composeProfile(presetProfileForTier(RoadTier.TwoLane), {
  ...NO_EDITS,
  tram: 'mixed',
});
const reserved = composeProfile(presetProfileForTier(RoadTier.Avenue), {
  ...NO_EDITS,
  tram: 'reserved',
});

/** The renderer with these poles and wire standing, and the meshes it put in the scene. */
function standing(tiles: FurnitureRoadTile[]) {
  const scene = new THREE.Scene();
  const renderer = new RoadFurnitureRenderer(scene, flat);
  const poles = computeTramPolePlacements(tiles);
  renderer.setTramPoles(poles, computeTramWireRuns(tiles));
  const kind = (k: string) =>
    scene.children.find((o) => o.userData.furnitureKind === k) as THREE.Mesh | undefined;
  return {
    poles,
    pole: kind('tramPole') as THREE.InstancedMesh,
    arm: kind('tramArm') as THREE.InstancedMesh,
    wire: kind('tramWire'),
  };
}

function wireVertices(wire: THREE.Mesh): THREE.Vector3[] {
  const position = wire.geometry.getAttribute('position') as THREE.BufferAttribute;
  return Array.from({ length: position.count }, (_, i) =>
    new THREE.Vector3().fromBufferAttribute(position, i),
  );
}

describe('a tram contact pole stands plumb', () => {
  it('turns no instance of the mast or its arm off the vertical', () => {
    const { pole, arm } = standing(run(RoadTier.Tram));
    const m = new THREE.Matrix4();
    expect(pole.count).toBeGreaterThan(0);
    for (const mesh of [pole, arm].filter((m) => m)) {
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, m);
        const up = new THREE.Vector3(0, 1, 0).transformDirection(m);
        expect(up.x).toBeCloseTo(0, 9);
        expect(up.y).toBeCloseTo(1, 9);
        expect(up.z).toBeCloseTo(0, 9);
      }
    }
  });
});

describe('the tram wire runs over each track', () => {
  it('lies over the centre line of each tramway lane, from tile to tile without a break', () => {
    const runs = computeTramWireRuns(run(RoadTier.Tram));
    const points = runs.flat();
    for (const p of points) expect(Math.abs(Math.abs(p.z - centre) - LANE)).toBeLessThan(1e-9);
    for (const lane of [-LANE, LANE]) {
      const xs = points
        .filter((p) => Math.abs(p.z - centre - lane) < 1e-9)
        .map((p) => p.x)
        .sort((a, b) => a - b);
      // A dead end's track runs half its tile, to the tile's centre.
      expect(xs[0]).toBeCloseTo(tileToWorld(0), 9);
      expect(xs[xs.length - 1]).toBeCloseTo(tileToWorld(19), 9);
      for (let i = 1; i < xs.length; i++) expect(xs[i]! - xs[i - 1]!).toBeLessThanOrEqual(2 + 1e-9);
    }
  });

  it('hangs at 5.8 m over the rail, thin, as one merged mesh', () => {
    const { wire } = standing(run(RoadTier.Tram));
    expect(wire).toBeDefined();
    expect(wire).not.toBeInstanceOf(THREE.InstancedMesh);
    const ys = wireVertices(wire!).map((v) => v.y);
    expect(TRAM_WIRE_HEIGHT_M).toBe(5.8);
    expect(Math.min(...ys)).toBeGreaterThan(TRAM_WIRE_HEIGHT_M - 0.05);
    expect(Math.min(...ys)).toBeLessThan(TRAM_WIRE_HEIGHT_M);
    // The span wires hang from the poles' 6 m supports, no higher.
    expect(Math.max(...ys)).toBeLessThan(6.05);
    wire!.geometry.computeBoundingBox();
    const box = wire!.geometry.boundingBox!;
    expect(box.min.z).toBeLessThan(centre - LANE + 0.1);
    expect(box.max.z).toBeGreaterThan(centre + LANE - 0.1);
  });

  it('follows the track’s own path round a bend', () => {
    // Along x to the corner at x = 5, then south down it.
    const tiles: FurnitureRoadTile[] = [
      ...Array.from({ length: 5 }, (_, x) => ({ x, z: Z, tier: RoadTier.Tram })),
      { x: 5, z: Z, tier: RoadTier.Tram },
      ...Array.from({ length: 4 }, (_, i) => ({ x: 5, z: Z + 1 + i, tier: RoadTier.Tram })),
    ];
    const runs = computeTramWireRuns(tiles);
    const inTurn = (p: { x: number; z: number }) =>
      Math.abs(p.x - tileToWorld(5)) <= TILE_METERS / 2 + 1e-9 &&
      Math.abs(p.z - tileToWorld(Z)) <= TILE_METERS / 2 + 1e-9;
    const turnPoints = runs.flat().filter(inTurn);
    const expected = trackPaths(allMovements(['w', 's']), [-LANE, LANE]).flatMap((path) =>
      path.samples.map((s) => ({ x: tileToWorld(5) + s.x, z: tileToWorld(Z) + s.z })),
    );
    for (const e of expected) {
      expect(
        turnPoints.some((p) => Math.hypot(p.x - e.x, p.z - e.z) < 1e-6),
        `a wire point on the bend at ${e.x},${e.z}`,
      ).toBe(true);
    }
    // The turn's ends meet the straight runs either side where they end.
    const ends = trackPaths(allMovements(['w', 's']), [-LANE, LANE]).flatMap((path) => [
      path.samples[0]!,
      path.samples[path.samples.length - 1]!,
    ]);
    for (const e of ends) {
      const at = { x: tileToWorld(5) + e.x, z: tileToWorld(Z) + e.z };
      const meeting = runs.flat().filter((p) => Math.hypot(p.x - at.x, p.z - at.z) < 1e-6);
      expect(
        meeting.length,
        `a neighbour's wire meets the bend at ${at.x},${at.z}`,
      ).toBeGreaterThan(1);
    }
  });

  it('runs straight through a junction on the tramway’s own lanes and not up the side street', () => {
    const tiles: FurnitureRoadTile[] = [
      ...run(RoadTier.Tram, 8),
      { x: 3, z: Z + 1, tier: RoadTier.TwoLane },
      { x: 3, z: Z + 2, tier: RoadTier.TwoLane },
    ];
    const box = {
      x0: tileToWorld(3) - TILE_METERS / 2,
      x1: tileToWorld(3) + TILE_METERS / 2,
    };
    const inside = computeTramWireRuns(tiles)
      .flat()
      .filter((p) => p.x >= box.x0 - 1e-9 && p.x <= box.x1 + 1e-9);
    expect(inside.length).toBeGreaterThan(10);
    for (const p of inside) expect(Math.abs(Math.abs(p.z - centre) - LANE)).toBeLessThan(1e-9);
  });

  it('is laid over mixed running too, and over no street without a street track', () => {
    expect(
      computeTramWireRuns(run(RoadTier.TwoLane, 6, { profile: mixed })).length,
    ).toBeGreaterThan(0);
    expect(computeTramWireRuns(run(RoadTier.TwoLane, 6))).toEqual([]);
    // A reservation's trams run on the guideway, which has its own beam.
    expect(computeTramWireRuns(run(RoadTier.Avenue, 6, { profile: reserved }))).toEqual([]);
    expect(standing(run(RoadTier.TwoLane, 6)).wire).toBeUndefined();
  });
});

describe('the wire’s supports', () => {
  const alongOf = (poles: readonly TramPoleStand[]): number[] =>
    [...new Set(poles.map((p) => Math.round(p.x * 1000) / 1000))].sort((a, b) => a - b);

  it('stand no further apart than 36.6 m on a plain run', () => {
    const xs = alongOf(computeTramPolePlacements(run(RoadTier.Tram)));
    expect(xs.length).toBeGreaterThan(10);
    for (let i = 1; i < xs.length; i++)
      expect(xs[i]! - xs[i - 1]!).toBeLessThanOrEqual(TRAM_SUPPORT_MAX_M);
  });

  it('stand no further apart than 36.6 m across a junction that takes a pole’s place', () => {
    const tiles: FurnitureRoadTile[] = [
      ...run(RoadTier.Tram),
      ...[Z - 2, Z - 1, Z + 1, Z + 2].map((z) => ({ x: 11, z, tier: RoadTier.TwoLane })),
    ];
    const xs = alongOf(computeTramPolePlacements(tiles));
    for (let i = 1; i < xs.length; i++)
      expect(xs[i]! - xs[i - 1]!).toBeLessThanOrEqual(TRAM_SUPPORT_MAX_M);
    const junction = [11 * TILE_METERS, 12 * TILE_METERS];
    expect(xs.some((x) => x >= junction[0]! && x < junction[1]!)).toBe(false);
  });

  it('are span-wire pairs on both kerbs where the 1.9 m arm does not reach the track', () => {
    for (const tiles of [run(RoadTier.Tram), run(RoadTier.TwoLane, 20, { profile: mixed })]) {
      const poles = computeTramPolePlacements(tiles);
      expect(poles.length).toBeGreaterThan(0);
      for (const p of poles) {
        // The kerb pole's arm tip falls 0.4 m short of the lane's centre line.
        const tip = Math.abs(p.z - centre) - TRAM_POLE_ARM_LENGTH_M;
        expect(Math.abs(tip - LANE)).toBeGreaterThan(0.1);
        expect(p.bracket).toBe(false);
      }
      const owners = poles.filter((p) => p.spanTo !== null);
      expect(owners.length * 2).toBe(poles.length);
      for (const o of owners) {
        const other = poles.find((p) => p.x === o.spanTo!.x && p.z === o.spanTo!.z)!;
        expect(other).toBeDefined();
        expect(other.x).toBeCloseTo(o.x, 9);
        expect(Math.sign(other.z - centre)).toBe(-Math.sign(o.z - centre));
      }
    }
  });

  it('draw an arm only where the arm itself carries the wire', () => {
    const { poles, arm, pole } = standing(run(RoadTier.Tram));
    expect(pole.count).toBe(poles.length);
    expect(arm?.count ?? 0).toBe(poles.filter((p) => p.bracket).length);
  });
});
