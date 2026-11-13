import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { TILE_METERS, tileToWorld } from '../shared/constants';
import {
  carriagewayHalfWidthOf,
  hasFootway,
  kerbWidthOf,
  presetProfileForTier,
} from '../shared/roadprofile';
import { RoadFlow, RoadTier, type BusStop } from '../shared/types';
import { BUS_SHELTER } from './busshelter';
import {
  BUS_STOP_PAD,
  BUS_STOP_PAD_RISE_M,
  BUS_STOP_POLE_FROM_KERB_M,
  BUS_STOP_SIGN,
  BUS_STOP_SHELTER_FRONT_M,
  BusStopRenderer,
  busStopPlacement,
  stopRoadAt,
  type StopRoad,
} from './busstops';
import { buildTileSet } from './roadfurniture';
import { SIGN_NO_KERB_M } from './roadsidespace';

const TILE = { x: 7, z: 4 };
const CX = tileToWorld(TILE.x);
const CZ = tileToWorld(TILE.z);

function stopOn(side: 0 | 1, kind: BusStop['kind'] = 'shelter'): BusStop {
  return { ...TILE, side, kind };
}

/** Metres from the tile's centre line out to a spot, along the side's normal. */
function outOf(spot: { x: number; z: number }, side: 0 | 1, lateral: 'x' | 'z'): number {
  const sign = side === 1 ? 1 : -1;
  return sign * (lateral === 'z' ? spot.z - CZ : spot.x - CX);
}

describe('busStopPlacement', () => {
  const kerbed = presetProfileForTier(RoadTier.TwoLane);
  const gravel = presetProfileForTier(RoadTier.Gravel);

  it('reads the presets it is tested on as a footway road and a footless one', () => {
    expect(hasFootway(kerbed)).toBe(true);
    expect(hasFootway(gravel)).toBe(false);
  });

  for (const lateral of ['z', 'x'] as const) {
    for (const side of [0, 1] as const) {
      const where = `lateral ${lateral}, side ${side}`;

      it(`stands the pad at the footway's outer edge, the pole 0.46 m and the shelter's front 0.9 m beyond it on a kerbed street (${where})`, () => {
        const p = busStopPlacement(stopOn(side), RoadTier.TwoLane, kerbed, 0, lateral);
        const footway = kerbWidthOf(kerbed);
        expect(footway).toBeGreaterThan(0);
        const kerb = carriagewayHalfWidthOf(kerbed) + footway;
        expect(p.kerbOut).toBeCloseTo(kerb, 9);
        expect(p.pad.out0).toBeCloseTo(kerb, 9);
        expect(p.pad.out1 - p.pad.out0).toBeCloseTo(BUS_STOP_PAD.out, 9);
        expect(outOf(p.pad, side, lateral)).toBeCloseTo(kerb + BUS_STOP_PAD.out / 2, 9);
        expect(outOf(p.pole, side, lateral) - kerb).toBeCloseTo(BUS_STOP_POLE_FROM_KERB_M, 9);
        const shelter = p.shelter!;
        expect(outOf(shelter, side, lateral)).toBeCloseTo(
          kerb + BUS_STOP_SHELTER_FRONT_M + BUS_SHELTER.d / 2,
          9,
        );
        expect(shelter.frontOut - kerb).toBeCloseTo(BUS_STOP_SHELTER_FRONT_M, 9);
      });

      it(`stands the pole 3.7 m off the pavement's edge on a gravel road, the pad and shelter behind it (${where})`, () => {
        const p = busStopPlacement(stopOn(side), RoadTier.Gravel, gravel, 0, lateral);
        const edge = carriagewayHalfWidthOf(gravel) + SIGN_NO_KERB_M - BUS_STOP_POLE_FROM_KERB_M;
        expect(p.kerbOut).toBeCloseTo(edge, 9);
        expect(p.pad.out0).toBeCloseTo(edge, 9);
        expect(outOf(p.pole, side, lateral) - edge).toBeCloseTo(BUS_STOP_POLE_FROM_KERB_M, 9);
        expect(p.shelter!.frontOut - edge).toBeCloseTo(BUS_STOP_SHELTER_FRONT_M, 9);
      });
    }
  }

  it('reads a tier with no profile as its preset', () => {
    const a = busStopPlacement(stopOn(1), RoadTier.TwoLane, undefined, 0, 'z');
    const b = busStopPlacement(stopOn(1), RoadTier.TwoLane, kerbed, 0, 'z');
    expect(a).toEqual(b);
  });

  it('draws a sign as a pad and a pole with no shelter or bin', () => {
    const p = busStopPlacement(stopOn(1, 'sign'), RoadTier.TwoLane, kerbed, 0, 'z');
    expect(p.shelter).toBeNull();
    expect(p.bin).toBeNull();
  });

  it('turns the shelter to face the carriageway from either side', () => {
    const facing = (side: 0 | 1, lateral: 'x' | 'z'): { x: number; z: number } => {
      const { yaw } = busStopPlacement(stopOn(side), RoadTier.TwoLane, kerbed, 0, lateral);
      return { x: Math.round(Math.sin(yaw)), z: Math.round(Math.cos(yaw)) };
    };
    expect(facing(1, 'z')).toEqual({ x: 0, z: -1 });
    expect(facing(0, 'z')).toEqual({ x: 0, z: 1 });
    expect(facing(1, 'x')).toEqual({ x: -1, z: 0 });
    expect(facing(0, 'x')).toEqual({ x: 1, z: 0 });
  });

  describe('the pole stands at the pad end traffic reaches first', () => {
    it('on a two-way road, the end each kerb`s own lane arrives at (drive on the right)', () => {
      const south = busStopPlacement(stopOn(1), RoadTier.TwoLane, kerbed, 0, 'z');
      const north = busStopPlacement(stopOn(0), RoadTier.TwoLane, kerbed, 0, 'z');
      expect(south.pole.x).toBeGreaterThan(CX);
      expect(north.pole.x).toBeLessThan(CX);
      const east = busStopPlacement(stopOn(1), RoadTier.TwoLane, kerbed, 0, 'x');
      const west = busStopPlacement(stopOn(0), RoadTier.TwoLane, kerbed, 0, 'x');
      expect(east.pole.z).toBeLessThan(CZ);
      expect(west.pole.z).toBeGreaterThan(CZ);
    });

    it('on a one-way road, the way it was drawn, on both kerbs, and the bin at the other end', () => {
      for (const side of [0, 1] as const) {
        const p = busStopPlacement(stopOn(side), RoadTier.TwoLane, kerbed, RoadFlow.West, 'z');
        expect(p.pole.x).toBeCloseTo(CX - BUS_STOP_PAD.along / 2, 9);
        expect(p.bin!.x).toBeGreaterThan(CX);
      }
    });

    it('masks the flow byte before reading it', () => {
      const corridorBit = 0b1000;
      const p = busStopPlacement(
        stopOn(1),
        RoadTier.TwoLane,
        kerbed,
        RoadFlow.West | corridorBit,
        'z',
      );
      expect(p.leading).toBe(-1);
    });
  });

  it('centres the pad on the tile along the road', () => {
    const p = busStopPlacement(stopOn(1), RoadTier.TwoLane, kerbed, 0, 'z');
    expect(p.pad.x).toBeCloseTo(CX, 9);
    expect(p.pad.along).toBeCloseTo(BUS_STOP_PAD.along, 9);
    expect(Math.abs(p.pad.out1 - p.pad.out0)).toBeLessThan(TILE_METERS / 2);
  });
});

/** The footway-level position of every vertex of a geometry, after a matrix. */
function vertices(geometry: THREE.BufferGeometry, m: THREE.Matrix4): THREE.Vector3[] {
  const position = geometry.getAttribute('position');
  return Array.from({ length: position.count }, (_, i) =>
    new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(m),
  );
}

describe('a stop turned to its kerb', () => {
  const flat = (): number => 0;
  const kerbedRoad = (lateral: 'x' | 'z'): StopRoad => ({
    tier: RoadTier.TwoLane,
    profile: presetProfileForTier(RoadTier.TwoLane),
    flow: 0,
    lateral,
  });

  for (const lateral of ['z', 'x'] as const) {
    for (const side of [0, 1] as const) {
      it(`opens the placed shelter to the carriageway and puts its glazed back to the lots (lateral ${lateral}, side ${side})`, () => {
        const renderer = new BusStopRenderer(new THREE.Scene(), flat);
        renderer.apply([stopOn(side)], () => kerbedRoad(lateral));
        const m = new THREE.Matrix4();
        renderer.getMatrix('shelter', 0, m);
        const centre = new THREE.Vector3().setFromMatrixPosition(m);
        const roadCentre = new THREE.Vector3(CX, 0, CZ);
        const front = new THREE.Vector3(0, 0, 1).transformDirection(m);
        const toRoad = roadCentre.clone().sub(centre).setY(0).normalize();
        expect(front.dot(toRoad)).toBeCloseTo(1, 6);
        // The glazed back is the shelter's furthest panel from the road.
        const placed = vertices(renderer.partGeometry('shelter'), m);
        const back = placed.reduce((far, v) =>
          far.distanceTo(roadCentre) > v.distanceTo(roadCentre) ? far : v,
        );
        expect(back.clone().sub(centre).setY(0).dot(toRoad)).toBeLessThan(0);
      });
    }
  }

  it('hangs a bus stop sign as a plate 0.305 × 0.457 m (12 × 18 in) with its bottom edge 7 ft over the pad', () => {
    expect(BUS_STOP_SIGN.w).toBeCloseTo(0.3048, 3);
    expect(BUS_STOP_SIGN.h).toBeCloseTo(0.4572, 3);
    const renderer = new BusStopRenderer(new THREE.Scene(), flat);
    const plate = vertices(renderer.partGeometry('pole'), new THREE.Matrix4()).filter(
      (v) => Math.abs(v.x) > BUS_STOP_SIGN.pole + 1e-6,
    );
    expect(plate.length).toBeGreaterThan(0);
    const ys = plate.map((v) => v.y);
    const zs = plate.map((v) => v.z);
    expect(Math.min(...ys) - BUS_STOP_PAD_RISE_M).toBeGreaterThanOrEqual(7 * 0.3048 - 1e-6);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(BUS_STOP_SIGN.h, 6);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(BUS_STOP_SIGN.w, 6);
  });

  it('shows a plate face to traffic arriving from either way, along the road, whichever kerb the stop is on', () => {
    for (const lateral of ['z', 'x'] as const) {
      for (const side of [0, 1] as const) {
        const renderer = new BusStopRenderer(new THREE.Scene(), flat);
        renderer.apply([stopOn(side)], () => kerbedRoad(lateral));
        const m = new THREE.Matrix4();
        renderer.getMatrix('pole', 0, m);
        const post = new THREE.Vector3().setFromMatrixPosition(m);
        const along = lateral === 'z' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
        const plate = vertices(renderer.partGeometry('pole'), m).filter(
          (v) => Math.abs(v.clone().sub(post).dot(along)) > BUS_STOP_SIGN.pole + 1e-6,
        );
        const ahead = plate.some((v) => v.clone().sub(post).dot(along) > 0);
        const behind = plate.some((v) => v.clone().sub(post).dot(along) < 0);
        expect(ahead && behind, `${lateral} ${side}`).toBe(true);
      }
    }
  });

  it('keeps every part of a stop clear of the carriageway and standing 3.7 m from its edge where there is no kerb', () => {
    const gravel = presetProfileForTier(RoadTier.Gravel);
    for (const lateral of ['z', 'x'] as const) {
      for (const side of [0, 1] as const) {
        const renderer = new BusStopRenderer(new THREE.Scene(), flat);
        renderer.apply([stopOn(side)], () => ({
          tier: RoadTier.Gravel,
          profile: gravel,
          flow: 0,
          lateral,
        }));
        const edge = carriagewayHalfWidthOf(gravel);
        let nearest = Infinity;
        for (const part of ['pad', 'pole', 'shelter', 'bin'] as const) {
          const m = new THREE.Matrix4();
          renderer.getMatrix(part, 0, m);
          for (const v of vertices(renderer.partGeometry(part), m)) {
            const out = outOf(v, side, lateral);
            nearest = Math.min(nearest, out - edge);
          }
        }
        // The pole is the sign: 3.7 m out. Nothing, roof included, stands nearer than the clear zone.
        expect(nearest, `${lateral} ${side}`).toBeGreaterThanOrEqual(3.0 - 1e-6);
        const p = busStopPlacement(stopOn(side), RoadTier.Gravel, gravel, 0, lateral);
        expect(outOf(p.pole, side, lateral) - edge).toBeCloseTo(SIGN_NO_KERB_M, 6);
      }
    }
  });
});

describe('stopRoadAt', () => {
  it('reads the axis from the neighbours and none where no road stands', () => {
    const tileSet = buildTileSet([
      { x: 2, z: 3, tier: RoadTier.TwoLane },
      { x: 3, z: 3, tier: RoadTier.TwoLane },
      { x: 4, z: 3, tier: RoadTier.TwoLane },
    ]);
    expect(stopRoadAt(tileSet, 3, 3)?.lateral).toBe('z');
    expect(stopRoadAt(tileSet, 9, 9)).toBeNull();
  });
});

describe('BusStopRenderer', () => {
  const road: StopRoad = {
    tier: RoadTier.TwoLane,
    profile: presetProfileForTier(RoadTier.TwoLane),
    flow: 0,
    lateral: 'z',
  };
  const flat = (): number => 0;

  it('draws N stops as N pad instances, a pole each, and a shelter and bin per shelter', () => {
    const scene = new THREE.Scene();
    const renderer = new BusStopRenderer(scene, flat);
    renderer.apply(
      [
        { x: 1, z: 1, side: 0, kind: 'shelter' },
        { x: 1, z: 1, side: 1, kind: 'sign' },
        { x: 5, z: 1, side: 1, kind: 'shelter' },
      ],
      () => road,
    );
    expect(renderer.instanceCount('pad')).toBe(3);
    expect(renderer.instanceCount('pole')).toBe(3);
    expect(renderer.instanceCount('shelter')).toBe(2);
    expect(renderer.instanceCount('bin')).toBe(2);
  });

  it('redraws from scratch: fewer stops leave fewer instances and no stale mesh', () => {
    const scene = new THREE.Scene();
    const renderer = new BusStopRenderer(scene, flat);
    renderer.apply(
      [
        { x: 1, z: 1, side: 0, kind: 'shelter' },
        { x: 2, z: 1, side: 0, kind: 'shelter' },
      ],
      () => road,
    );
    const before = scene.children.length;
    renderer.apply([{ x: 1, z: 1, side: 0, kind: 'sign' }], () => road);
    expect(renderer.instanceCount('pad')).toBe(1);
    expect(renderer.instanceCount('shelter')).toBe(0);
    expect(scene.children.length).toBeLessThan(before);
  });

  it('skips a stop whose road is gone', () => {
    const renderer = new BusStopRenderer(new THREE.Scene(), flat);
    renderer.apply([{ x: 1, z: 1, side: 0, kind: 'sign' }], () => null);
    expect(renderer.instanceCount('pad')).toBe(0);
  });

  it('stands a pad where busStopPlacement says, on the footway', () => {
    const renderer = new BusStopRenderer(new THREE.Scene(), flat);
    const stop = stopOn(1);
    renderer.apply([stop], () => road);
    const p = busStopPlacement(stop, road.tier, road.profile, road.flow, road.lateral);
    const m = new THREE.Matrix4();
    renderer.getMatrix('pad', 0, m);
    const at = new THREE.Vector3().setFromMatrixPosition(m);
    expect(at.x).toBeCloseTo(p.pad.x, 4);
    expect(at.z).toBeCloseTo(p.pad.z, 4);
    expect(at.y).toBeGreaterThan(0);
  });

  it('picks the nearest stop by its pad, and says where the people wait', () => {
    const renderer = new BusStopRenderer(new THREE.Scene(), flat);
    const stop = stopOn(1);
    renderer.apply([stop], () => road);
    const p = busStopPlacement(stop, road.tier, road.profile, road.flow, road.lateral);
    expect(renderer.pick(p.pad.x, p.pad.z)).toEqual(stop);
    expect(renderer.pick(p.pad.x + 80, p.pad.z)).toBeNull();
    expect(renderer.waitPoint(stop.x, stop.z)).toEqual({ x: p.shelter!.x, z: p.shelter!.z });
    expect(renderer.waitPoint(0, 0)).toBeNull();
  });

  it('holds a whole shelter stop to a few hundred triangles, since a city builds them by the dozen', () => {
    const renderer = new BusStopRenderer(new THREE.Scene(), flat);
    let triangles = 0;
    for (const part of ['pad', 'pole', 'shelter', 'bin'] as const) {
      const g = renderer.partGeometry(part);
      triangles += (g.index?.count ?? g.getAttribute('position').count) / 3;
    }
    expect(triangles).toBeGreaterThan(0);
    expect(triangles).toBeLessThanOrEqual(500);
  });

  it('shows a ghost through the same placement and clears it', () => {
    const scene = new THREE.Scene();
    const renderer = new BusStopRenderer(scene, flat);
    renderer.setGhost(stopOn(1), road, true);
    expect(scene.children).toHaveLength(1);
    expect(scene.children[0]!.children).toHaveLength(4);
    renderer.setGhost(null, null, true);
    expect(scene.children).toHaveLength(0);
  });
});
