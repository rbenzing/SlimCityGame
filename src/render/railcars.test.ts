import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import {
  RAIL_BOGIE_CENTRE_FRACTION,
  RAIL_WHEEL_COLOR,
  TRAIN_BOGIE,
  TRAIN_CAR_SIZE,
  TRAM_BOGIE,
  TRAM_CAR_SIZE,
  TRAM_FLOOR_M,
  TRAM_PANTOGRAPH_HEAD_M,
  buildTrainEndCarGeometry,
  buildTrainMidCarGeometry,
  buildTramLeadSectionGeometry,
  buildTramTailSectionGeometry,
} from './railcars';
import { TRAIN_CAR_PITCH, TRAM_CAR_PITCH } from './transit';
import * as vehicles from './vehicles';
import { VEHICLE_REGION } from './vehicles';

const builders = {
  'train end car': buildTrainEndCarGeometry,
  'train middle car': buildTrainMidCarGeometry,
  'tram lead section': buildTramLeadSectionGeometry,
  'tram tail section': buildTramTailSectionGeometry,
} as const;

/** The vertices of a geometry that satisfy `keep`, as [x, y, z]. */
function vertices(
  geometry: THREE.BufferGeometry,
  keep: (i: number) => boolean = () => true,
): [number, number, number][] {
  const position = geometry.getAttribute('position');
  const out: [number, number, number][] = [];
  for (let i = 0; i < position.count; i += 1) {
    if (keep(i)) out.push([position.getX(i), position.getY(i), position.getZ(i)]);
  }
  return out;
}

const isWheel = (geometry: THREE.BufferGeometry) => (i: number) => {
  const color = geometry.getAttribute('color');
  return (
    Math.abs(color.getX(i) - RAIL_WHEEL_COLOR[0]) < 1e-6 &&
    Math.abs(color.getY(i) - RAIL_WHEEL_COLOR[1]) < 1e-6 &&
    Math.abs(color.getZ(i) - RAIL_WHEEL_COLOR[2]) < 1e-6
  );
};

const inRegion = (geometry: THREE.BufferGeometry, region: number) => (i: number) =>
  geometry.getAttribute('vehicleRegion').getX(i) === region;

function box(points: [number, number, number][]): THREE.Box3 {
  return new THREE.Box3().setFromPoints(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
}

describe('the rail and tram car geometry', () => {
  it('fills its size to a centimetre, standing on the rail head, so yards and platforms still fit', () => {
    // Each case: geometry, size, top, and the bellows' reach past the -Z and +Z ends (half the gap on a blunt end, none at a cab).
    const trainReach = (TRAIN_CAR_PITCH - TRAIN_CAR_SIZE[2]) / 2;
    const tramReach = (TRAM_CAR_PITCH - TRAM_CAR_SIZE[2]) / 2;
    const cases: [
      THREE.BufferGeometry,
      readonly [number, number, number],
      number,
      number,
      number,
    ][] = [
      [buildTrainEndCarGeometry(), TRAIN_CAR_SIZE, TRAIN_CAR_SIZE[1], trainReach, 0],
      [buildTrainMidCarGeometry(), TRAIN_CAR_SIZE, TRAIN_CAR_SIZE[1], trainReach, trainReach],
      [buildTramTailSectionGeometry(), TRAM_CAR_SIZE, TRAM_CAR_SIZE[1], tramReach, 0],
      // The lead's pantograph stands over the roof: 1.6 m over the roof, which is 0.3 m under the size's top.
      [
        buildTramLeadSectionGeometry(),
        TRAM_CAR_SIZE,
        TRAM_CAR_SIZE[1] - 0.3 + TRAM_PANTOGRAPH_HEAD_M,
        tramReach,
        0,
      ],
    ];
    for (const [geometry, size, top, rear, front] of cases) {
      const bounds = box(vertices(geometry));
      expect(bounds.min.x).toBeCloseTo(-size[0] / 2, 2);
      expect(bounds.max.x).toBeCloseTo(size[0] / 2, 2);
      expect(bounds.min.z).toBeCloseTo(-size[2] / 2 - rear, 2);
      expect(bounds.max.z).toBeCloseTo(size[2] / 2 + front, 2);
      expect(bounds.min.y).toBeCloseTo(0, 2);
      expect(bounds.max.y).toBeCloseTo(top, 2);
      // The body shell, bellows and the rest aside, is the size's length.
      const shell = box(vertices(geometry, inRegion(geometry, VEHICLE_REGION.BODY)));
      expect(shell.min.z).toBeCloseTo(-size[2] / 2, 2);
      expect(shell.max.z).toBeCloseTo(size[2] / 2, 2);
    }
    // A middle car is the pitch long; an end car is a car and half a gap. No coupler protrudes.
    const length = (g: THREE.BufferGeometry): number => {
      const b = box(vertices(g));
      return b.max.z - b.min.z;
    };
    expect(length(buildTrainMidCarGeometry())).toBeCloseTo(TRAIN_CAR_PITCH, 2);
    expect(length(buildTrainEndCarGeometry())).toBeCloseTo(TRAIN_CAR_SIZE[2] + trainReach, 2);
    expect(length(buildTramTailSectionGeometry())).toBeCloseTo(TRAM_CAR_SIZE[2] + tramReach, 2);
  });

  it('sets the bogies in from the ends at 0.70 of the length, wheelbase and wheel as the sources have them', () => {
    const geometry = buildTrainEndCarGeometry();
    const wheels = vertices(geometry, isWheel(geometry));
    const radius = TRAIN_BOGIE.wheelDiameter / 2;
    const bogie = RAIL_BOGIE_CENTRE_FRACTION * TRAIN_CAR_SIZE[2];
    expect(2 * bogie).toBeCloseTo(0.7 * TRAIN_CAR_SIZE[2], 9);
    const reach = bogie + TRAIN_BOGIE.wheelbase / 2 + radius;
    const wheelBounds = box(wheels);
    expect(wheelBounds.min.z).toBeCloseTo(-reach, 2);
    expect(wheelBounds.max.z).toBeCloseTo(reach, 2);
    expect(wheelBounds.min.y).toBeCloseTo(0, 6);
    expect(wheelBounds.max.y).toBeCloseTo(TRAIN_BOGIE.wheelDiameter, 6);
    // No wheel between the two bogies, none under the overhang.
    const innerEdge = bogie - TRAIN_BOGIE.wheelbase / 2 - radius;
    expect(wheels.some(([, , z]) => Math.abs(z) < innerEdge - 0.01)).toBe(false);
  });

  it('gives a tram three bogies: a whole one at each end and one shared at the joint, a half to each section', () => {
    const section = buildTramTailSectionGeometry();
    const wheels = vertices(section, isWheel(section));
    const radius = TRAM_BOGIE.wheelDiameter / 2;
    const outer = RAIL_BOGIE_CENTRE_FRACTION * TRAM_CAR_SIZE[2];
    const jointAxle = -TRAM_CAR_SIZE[2] / 2 + TRAM_BOGIE.wheelbase / 2 - 0.2;
    expect(box(wheels).max.z).toBeCloseTo(outer + TRAM_BOGIE.wheelbase / 2 + radius, 2);
    expect(box(wheels).min.z).toBeCloseTo(jointAxle - radius, 2);
    // The tail turned about stands its joint axle on the other side of the gap, the pair a wheelbase apart.
    const tailAxleWorld = -TRAM_CAR_PITCH - jointAxle;
    expect(Math.abs(tailAxleWorld - jointAxle)).toBeCloseTo(TRAM_BOGIE.wheelbase, 6);
    expect((tailAxleWorld + jointAxle) / 2).toBeCloseTo(-TRAM_CAR_PITCH / 2, 6);
  });

  it('has no wheel arch and a floor over the rail: the body stands clear of the wheel tops', () => {
    const train = buildTrainEndCarGeometry();
    const body = vertices(train, inRegion(train, VEHICLE_REGION.BODY));
    expect(box(body).min.y).toBeGreaterThan(TRAIN_BOGIE.wheelDiameter);
    expect(box(body).min.y).toBeCloseTo(1.1, 2);
    const tram = buildTramTailSectionGeometry();
    const saloon = vertices(tram, inRegion(tram, VEHICLE_REGION.BODY)).filter(([, y]) => y > 0.9);
    expect(box(saloon).min.y).toBeCloseTo(TRAM_FLOOR_M, 2);
  });

  it('carries a cab only on an end car, at its +Z end', () => {
    for (const [name, build] of Object.entries(builders)) {
      const geometry = build();
      const lamps = vertices(geometry, inRegion(geometry, VEHICLE_REGION.HEADLIGHT));
      if (name === 'train middle car') {
        expect(lamps).toHaveLength(0);
      } else {
        expect(lamps.length).toBeGreaterThan(0);
        expect(lamps.every(([, , z]) => z > 0)).toBe(true);
      }
    }
  });

  it('stands one pantograph on a tram set, 1.6 m over the roof, and none on a train', () => {
    const roof = TRAM_CAR_SIZE[1] - 0.3;
    const above = (g: THREE.BufferGeometry) =>
      vertices(g, inRegion(g, VEHICLE_REGION.FIXED)).filter(([, y]) => y > TRAM_CAR_SIZE[1] + 0.01);
    expect(above(buildTramTailSectionGeometry())).toHaveLength(0);
    const lead = buildTramLeadSectionGeometry();
    expect(box(above(lead)).max.y).toBeCloseTo(roof + TRAM_PANTOGRAPH_HEAD_M, 2);
    const train = buildTrainEndCarGeometry();
    expect(box(vertices(train)).max.y).toBeCloseTo(TRAIN_CAR_SIZE[1], 2);
  });

  it('keeps its roof pods narrower than the body', () => {
    const train = buildTrainEndCarGeometry();
    const roofTop = TRAIN_CAR_SIZE[1] - 0.2;
    const pods = vertices(train).filter(([, y]) => y > roofTop + 0.01);
    expect(pods.length).toBeGreaterThan(0);
    expect(Math.max(...pods.map(([x]) => Math.abs(x)))).toBeLessThan(TRAIN_CAR_SIZE[0] / 2 - 0.5);
  });

  it('tints the body alone: glass, bogies and wheels are fixed, the body is white and tagged', () => {
    const geometry = buildTrainEndCarGeometry();
    const color = geometry.getAttribute('color');
    const region = geometry.getAttribute('vehicleRegion');
    let body = 0;
    for (let i = 0; i < region.count; i += 1) {
      if (region.getX(i) === VEHICLE_REGION.BODY) {
        body += 1;
        expect([color.getX(i), color.getY(i), color.getZ(i)]).toEqual([1, 1, 1]);
      }
    }
    expect(body).toBeGreaterThan(0);
    expect(isWheel(geometry)(0) && region.getX(0) === VEHICLE_REGION.BODY).toBe(false);
    expect(vertices(geometry, isWheel(geometry)).length).toBeGreaterThan(0);
  });

  it('winds every face outward, so no near half is culled away', () => {
    for (const [name, build] of Object.entries(builders)) {
      const geometry = build();
      const position = geometry.getAttribute('position');
      const normal = geometry.getAttribute('normal');
      const index = geometry.getIndex()!;
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      const face = new THREE.Vector3();
      const stored = new THREE.Vector3();
      let volume = 0;
      for (let t = 0; t < index.count; t += 3) {
        const [ia, ib, ic] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
        a.fromBufferAttribute(position, ia);
        b.fromBufferAttribute(position, ib);
        c.fromBufferAttribute(position, ic);
        face.subVectors(b, a).cross(c.clone().sub(a));
        if (face.lengthSq() === 0) continue;
        stored.fromBufferAttribute(normal, ia);
        // The winding's own normal points the way the surface's normal does.
        expect(face.dot(stored), `${name} triangle ${t / 3}`).toBeGreaterThan(0);
        volume += a.dot(b.clone().cross(c)) / 6;
      }
      // Closed parts wound outward sum to a positive volume; one wound inward would subtract.
      expect(volume, name).toBeGreaterThan(0);
    }
  });

  it('never calls the bus builder: the cars are their own geometry', () => {
    const spy = vi.spyOn(vehicles, 'buildVehicleGeometry');
    for (const build of Object.values(builders)) build();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
