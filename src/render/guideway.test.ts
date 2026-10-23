import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  beamTopAtTile,
  computeGuideway,
  GuidewayRenderer,
  GUIDEWAY_BEAM_DEPTH_M,
  GUIDEWAY_BEAM_OFFSET_M,
  GUIDEWAY_BEAM_TOP_M,
  GUIDEWAY_BEAM_WIDTH_M,
  GUIDEWAY_COLUMN_SPACING_M,
  GUIDEWAY_CROSSHEAD_DEPTH_M,
  GUIDEWAY_MIN_CROSSHEAD_CLEARANCE_M,
  TRAM_FLOOR_ABOVE_BEAM_M,
  type GuidewayBeam,
} from './guideway';
import { tileKey } from './roadfurniture';
import type { FurnitureRoadTile } from './roadfurniture';
import { markingPlan } from './roadmarkings';
import { composeProfile, NO_EDITS, presetProfileForTier } from '../shared/roadprofile';
import { OVERPASS_CLEARANCE_M, TILE_METERS, tileToWorld } from '../shared/constants';
import { RoadTier } from '../shared/types';

const flat = (): number => 0;
const ROW = 5;

/** A street with a tram reservation composed on: the guideway's road. */
const reservedProfile = composeProfile(presetProfileForTier(RoadTier.Avenue), {
  ...NO_EDITS,
  tram: 'reserved',
});
const reserved = (x: number, z: number): FurnitureRoadTile => ({
  x,
  z,
  tier: RoadTier.Avenue,
  profile: reservedProfile,
});
/** A street tramway, its trams in the traffic lanes: tram track at grade. */
const mixed = (x: number, z: number): FurnitureRoadTile => ({ x, z, tier: RoadTier.Tram });
const street = (x: number, z: number): FurnitureRoadTile => ({ x, z, tier: RoadTier.TwoLane });

const row = (from: number, to: number, make: (x: number, z: number) => FurnitureRoadTile) =>
  Array.from({ length: to - from + 1 }, (_, i) => make(from + i, ROW));

/** Where the road mesh centres the reservation across the road, from its plan. */
const medianCentre = (): number => {
  const bands = markingPlan(reservedProfile).bands.filter((b) => b.kind === 'tram');
  return bands.reduce((s, b) => s + (b.from + b.to) / 2, 0) / bands.length;
};

const beamsOn = (beams: readonly GuidewayBeam[], x: number, z: number): GuidewayBeam[] =>
  beams.filter((b) => b.tileX === x && b.tileZ === z);
const inTile = (x: number) => (c: { x: number }) =>
  c.x >= x * TILE_METERS && c.x < (x + 1) * TILE_METERS;

describe('computeGuideway — a straight reserved run', () => {
  const run = row(0, 14, reserved);
  const { beams, columns } = computeGuideway(run, flat);

  it('carries two beams at ±1.83 m from the median the road draws, 7.22 m up', () => {
    expect(GUIDEWAY_BEAM_TOP_M).toBeCloseTo(7.22, 9);
    const centre = tileToWorld(ROW) + medianCentre();
    for (let x = 0; x <= 14; x++) {
      const here = beamsOn(beams, x, ROW);
      expect(here).toHaveLength(2);
      expect(here.map((b) => b.from.z).sort((a, b) => a - b)).toEqual([
        expect.closeTo(centre - GUIDEWAY_BEAM_OFFSET_M, 9),
        expect.closeTo(centre + GUIDEWAY_BEAM_OFFSET_M, 9),
      ]);
      for (const b of here) {
        expect(b.alongX).toBe(true);
        expect(b.from.y).toBeCloseTo(GUIDEWAY_BEAM_TOP_M, 9);
        expect(b.to.y).toBeCloseTo(GUIDEWAY_BEAM_TOP_M, 9);
        // Edge to edge, so the run is continuous.
        expect(Math.min(b.from.x, b.to.x)).toBeCloseTo(x * TILE_METERS, 9);
        expect(Math.max(b.from.x, b.to.x)).toBeCloseTo((x + 1) * TILE_METERS, 9);
      }
    }
  });

  it('stands a column every 30 m of world metres, its crosshead 5 m clear of the road', () => {
    expect(columns.map((c) => c.x)).toEqual(
      Array.from({ length: 10 }, (_, k) => k * GUIDEWAY_COLUMN_SPACING_M),
    );
    for (const c of columns) {
      expect(c.z).toBeCloseTo(tileToWorld(ROW) + medianCentre(), 9);
      expect(c.surfaceY).toBe(0);
      expect(c.crossheadY).toBeCloseTo(OVERPASS_CLEARANCE_M, 9);
      expect(c.crossheadY + GUIDEWAY_CROSSHEAD_DEPTH_M + GUIDEWAY_BEAM_DEPTH_M).toBeCloseTo(
        GUIDEWAY_BEAM_TOP_M,
        9,
      );
    }
  });

  it('stands no column in a junction box on the reserved road', () => {
    // A side street joins the run from the north at x = 3, whose tile holds x = 60 m.
    const tiles = [...run, street(3, ROW - 1), street(3, ROW - 2)];
    const { columns: withJunction } = computeGuideway(tiles, flat);
    expect(withJunction.filter(inTile(3))).toHaveLength(0);
    expect(columns.filter(inTile(3))).toHaveLength(1);
    // The beams run on over it.
    expect(beamsOn(computeGuideway(tiles, flat).beams, 3, ROW)).toHaveLength(2);
  });
});

describe('computeGuideway — a turn', () => {
  // West to east along the row, then south down x = 6.
  const tiles = [
    ...row(0, 6, reserved),
    ...Array.from({ length: 6 }, (_, i) => reserved(6, ROW + 1 + i)),
  ];
  const { beams, columns } = computeGuideway(tiles, flat);

  it('turns with the road: each arm two beams in from its edge, meeting at the corner', () => {
    const corner = beamsOn(beams, 6, ROW);
    expect(corner.filter((b) => b.alongX)).toHaveLength(2);
    expect(corner.filter((b) => !b.alongX)).toHaveLength(2);
    const px = tileToWorld(6);
    const half = GUIDEWAY_BEAM_WIDTH_M / 2;
    // The arm from the west: its outer (north) beam runs on past the centre to
    // the south arm's outer beam's far face; its inner one stops at the inner
    // beam's near face.
    const fromWest = corner.filter((b) => b.alongX);
    const outer = fromWest.find((b) => b.side === -1)!;
    const inner = fromWest.find((b) => b.side === 1)!;
    expect(outer.to.x).toBeCloseTo(px + GUIDEWAY_BEAM_OFFSET_M + half, 9);
    expect(inner.to.x).toBeCloseTo(px - GUIDEWAY_BEAM_OFFSET_M + half, 9);
    expect(outer.from.x).toBeCloseTo(6 * TILE_METERS, 9);
  });

  it('stands no column on the turn', () => {
    expect(columns.filter((c) => inTile(6)(c) && Math.abs(c.z - tileToWorld(ROW)) < 10)).toEqual(
      [],
    );
  });
});

describe('computeGuideway — passing over a street it crosses', () => {
  // The reservation either side of a plain north–south street at x = 5.
  const crossStreet = Array.from({ length: 11 }, (_, z) => street(5, z));
  const tiles = [...row(0, 4, reserved), ...row(6, 10, reserved), ...crossStreet];
  const { beams, columns } = computeGuideway(tiles, flat);

  it('spans the junction box at its own height', () => {
    const over = beamsOn(beams, 5, ROW);
    expect(over).toHaveLength(2);
    for (const b of over) {
      expect(b.alongX).toBe(true);
      expect(b.from.y).toBeCloseTo(GUIDEWAY_BEAM_TOP_M, 9);
      expect(b.to.y).toBeCloseTo(GUIDEWAY_BEAM_TOP_M, 9);
    }
  });

  it('stands no column in the street it spans', () => {
    expect(columns.filter(inTile(5))).toHaveLength(0);
    expect(columns.length).toBeGreaterThan(0);
  });

  it('spans a road laid as two carriageways, both tiles of it', () => {
    const twoTiles = [
      ...row(0, 4, reserved),
      ...row(7, 10, reserved),
      ...crossStreet,
      ...Array.from({ length: 11 }, (_, z) => street(6, z)),
    ];
    const { beams: spanning } = computeGuideway(twoTiles, flat);
    expect(beamsOn(spanning, 5, ROW)).toHaveLength(2);
    expect(beamsOn(spanning, 6, ROW)).toHaveLength(2);
  });

  it('lays nothing over a street crossed by street track at grade', () => {
    const atGrade = [...row(0, 4, mixed), ...row(6, 10, mixed), ...crossStreet];
    expect(computeGuideway(atGrade, flat).beams).toHaveLength(0);
  });
});

describe('computeGuideway — the ramp down to a street tramway', () => {
  // Street track at x = 0..2, the reservation from x = 3 on.
  const tiles = [...row(0, 2, mixed), ...row(3, 14, reserved)];
  const { beams, columns } = computeGuideway(tiles, flat);
  const topAtEdge = (edgeX: number): number => {
    const b = beams.find((beam) => beam.side === 1 && beam.tileX === edgeX / TILE_METERS)!;
    return Math.min(b.from.x, b.to.x) === edgeX ? (b.from.x < b.to.x ? b.from.y : b.to.y) : NaN;
  };

  it('climbs a fifth of its height per tile from the street, to full height over five', () => {
    for (let i = 0; i <= 6; i++) {
      const expected = GUIDEWAY_BEAM_TOP_M * Math.min(1, i / 5);
      expect(topAtEdge((3 + i) * TILE_METERS)).toBeCloseTo(expected, 9);
    }
  });

  it('draws no column where its crosshead would stand under 0.5 m clear of the road', () => {
    for (const c of columns) {
      expect(c.crossheadY - c.surfaceY).toBeGreaterThanOrEqual(GUIDEWAY_MIN_CROSSHEAD_CLEARANCE_M);
    }
    // 60 m and 90 m are low on the ramp; 120 m has climbed clear.
    const xs = columns.map((c) => c.x);
    expect(xs).not.toContain(60);
    expect(xs).not.toContain(90);
    expect(xs).toContain(120);
  });

  it('slopes each beam between its edges', () => {
    const b = beams.find((beam) => beam.tileX === 4)!;
    expect(Math.abs(b.to.y - b.from.y)).toBeCloseTo(GUIDEWAY_BEAM_TOP_M / 5, 9);
  });
});

describe('computeGuideway — on a deck', () => {
  it('stands on the road surface, not the ground', () => {
    const deck = (): number => 8;
    const { beams, columns } = computeGuideway(row(0, 9, reserved), deck);
    for (const b of beams) expect(b.from.y).toBeCloseTo(8 + GUIDEWAY_BEAM_TOP_M, 9);
    for (const c of columns) {
      expect(c.surfaceY).toBe(8);
      expect(c.crossheadY).toBeCloseTo(8 + OVERPASS_CLEARANCE_M, 9);
    }
  });
});

describe('the guideway seat sampler', () => {
  const { seatAt } = computeGuideway(row(0, 9, reserved), flat);
  const centre = tileToWorld(ROW) + medianCentre();
  const x = tileToWorld(4);

  it('seats a tram on the beam to the right of its travel, its floor 0.45 m over the beam', () => {
    const east = seatAt(x, tileToWorld(ROW), Math.PI / 2);
    expect(east).not.toBeNull();
    // Eastbound, the right is south: +z.
    expect(east!.z).toBeCloseTo(centre + GUIDEWAY_BEAM_OFFSET_M, 9);
    expect(east!.x).toBeCloseTo(x, 9);
    expect(east!.y).toBeCloseTo(GUIDEWAY_BEAM_TOP_M + TRAM_FLOOR_ABOVE_BEAM_M, 9);
    const west = seatAt(x, tileToWorld(ROW), -Math.PI / 2);
    expect(west!.z).toBeCloseTo(centre - GUIDEWAY_BEAM_OFFSET_M, 9);
  });

  it('writes into the point it is handed', () => {
    const out = { x: 0, y: 0, z: 0 };
    expect(seatAt(x, tileToWorld(ROW), Math.PI / 2, out)).toBe(out);
  });

  it('answers null off the guideway', () => {
    expect(seatAt(x, tileToWorld(ROW + 3), Math.PI / 2)).toBeNull();
  });
});

describe('the beam top at a tile', () => {
  const ramp = [...row(0, 2, mixed), ...row(3, 14, reserved)];

  it('is the surface plus the full height on a full tile, read through the renderer', () => {
    const deck = (): number => 8;
    const renderer = new GuidewayRenderer(new THREE.Scene(), deck);
    renderer.rebuild(row(0, 9, reserved));
    expect(renderer.beamTopAt(tileToWorld(4), tileToWorld(ROW))).toBeCloseTo(
      8 + GUIDEWAY_BEAM_TOP_M,
      9,
    );
    expect(renderer.beamTopAt(tileToWorld(4), tileToWorld(ROW + 3))).toBeNull();
    renderer.dispose();
  });

  it('is the mean of the two edge tops on a ramp tile', () => {
    const guideway = computeGuideway(ramp, flat);
    // x = 4 is the second ramp tile: one fifth up at its west edge, two fifths at its east.
    expect(beamTopAtTile(guideway, 4, ROW)).toBeCloseTo((GUIDEWAY_BEAM_TOP_M * 3) / 10, 9);
    expect(beamTopAtTile(guideway, 10, ROW)).toBeCloseTo(GUIDEWAY_BEAM_TOP_M, 9);
    expect(beamTopAtTile(guideway, 1, ROW)).toBeNull();
  });

  it('marks a tile at full height only when both its edges are: not the ramp, nor the tile it ends on', () => {
    const { tiles } = computeGuideway(ramp, flat);
    const full = (x: number): boolean => tiles.get(tileKey(x, ROW))!.fullHeight;
    for (let x = 3; x <= 7; x++) expect(full(x)).toBe(false);
    for (let x = 8; x <= 14; x++) expect(full(x)).toBe(true);
    expect(tiles.get(tileKey(10, ROW))).toMatchObject({ reserved: true, alongX: true });
    expect(tiles.get(tileKey(10, ROW))!.line).toBeCloseTo(tileToWorld(ROW) + medianCentre(), 9);
  });

  it('answers null before the first rebuild', () => {
    const renderer = new GuidewayRenderer(new THREE.Scene(), flat);
    expect(renderer.beamTopAt(tileToWorld(4), tileToWorld(ROW))).toBeNull();
    expect(renderer.structure()).toBeNull();
  });
});

describe('GuidewayRenderer', () => {
  it('draws beams, stems and crossheads as one instanced pool each', () => {
    const scene = new THREE.Scene();
    const renderer = new GuidewayRenderer(scene, flat);
    renderer.rebuild(row(0, 9, reserved));
    const meshes = renderer.meshList();
    expect(meshes).toHaveLength(3);
    expect(meshes.every((m) => m instanceof THREE.InstancedMesh)).toBe(true);
    expect(meshes[0]!.count).toBe(renderer.beamCount());
    expect(meshes[1]!.count).toBe(renderer.columnCount());
    expect(meshes[2]!.count).toBe(renderer.columnCount());
    expect(renderer.seatAt(tileToWorld(4), tileToWorld(ROW), Math.PI / 2)).not.toBeNull();

    // A beam instance stands with its top at the beam top.
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    meshes[0]!.getMatrixAt(0, m);
    p.setFromMatrixPosition(m);
    expect(p.y + GUIDEWAY_BEAM_DEPTH_M / 2).toBeCloseTo(GUIDEWAY_BEAM_TOP_M, 6);

    renderer.rebuild([]);
    expect(scene.children).toHaveLength(0);
    expect(renderer.seatAt(tileToWorld(4), tileToWorld(ROW), Math.PI / 2)).toBeNull();
    renderer.dispose();
  });
});
