/**
 * Rail and tram cars: their own geometry, never a bus stretched.
 *
 * Every car is built at its real size in metres, nose to local +Z, standing on
 * its origin (y = 0 is the bottom of the wheels, which stand on the rail head).
 * A flat-sided body overhangs two bogies set in from its ends; no wheel arch
 * cuts its side. One window band runs the length, broken by two doors a side.
 * A cab (raked nose, windscreen, lights, coupler) stands on the cab end of an
 * end car; an inner end is blunt and carries a gangway bellows.
 *
 * The body is tagged BODY so the line's colour tints it alone; glass, doors,
 * bogies, bellows, couplers and roof gear keep their own baked colours (the
 * vehicle kit's region mask). A train's three cars are an end car, a middle car
 * and the end car turned about; a tram's two sections are a lead (it carries the
 * pantograph) and a tail turned about, the sections sharing one bogie at the
 * joint, each carrying its half.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { VEHICLE_REGION, tagGeometry } from './vehicles';

/** A train car is longer and taller than a bus; several of them make a train. */
export const TRAIN_CAR_SIZE: readonly [number, number, number] = [3.2, 3.8, 14];
/** A tram car is longer and taller than a bus, and narrower than a train car. */
export const TRAM_CAR_SIZE: readonly [number, number, number] = [2.6, 3.4, 11];

/** The bogies' centres stand this far either side of the car's middle, as a fraction of its length (0.70 apart). */
export const RAIL_BOGIE_CENTRE_FRACTION = 0.35;
/** A train bogie's wheelbase and wheel diameter. */
export const TRAIN_BOGIE = { wheelbase: 2.6, wheelDiameter: 0.91 } as const;
/** A tram bogie's wheelbase and wheel diameter. */
export const TRAM_BOGIE = { wheelbase: 1.9, wheelDiameter: 0.66 } as const;
/** A train car's floor over the rail head. */
export const TRAIN_FLOOR_M = 1.3;
/** A tram section's floor over the rail head (low floor, the wheels under it). */
export const TRAM_FLOOR_M = 0.95;
/** How far the raised pantograph's head stands over the tram's roof. */
export const TRAM_PANTOGRAPH_HEAD_M = 1.6;
/** Rail gauge half either side of a train's centreline, and a street tram's. */
const TRAIN_GAUGE_HALF_M = 0.75;
const TRAM_GAUGE_HALF_M = 0.7175;

/** The colour of the vertices a car's body tint leaves alone, and the white the tint multiplies. */
type RGB = readonly [number, number, number];
const hex = (h: number): RGB => [
  ((h >> 16) & 0xff) / 255,
  ((h >> 8) & 0xff) / 255,
  (h & 0xff) / 255,
];
const BODY_WHITE = hex(0xffffff);
export const RAIL_WHEEL_COLOR = hex(0x0d0e10);
const GLASS = hex(0x1a1f26);
const DOOR = hex(0x4b5560);
const BOGIE = hex(0x23272c);
const UNDERFRAME = hex(0x2a2e33);
const BELLOWS = hex(0x2d3238);
const COUPLER = hex(0x4a4f55);
const ROOF_GEAR = hex(0x8c9298);
const HEADLAMP = hex(0xd9d3bf);

interface CarSpec {
  size: readonly [number, number, number];
  /** Underside of the saloon over the rail head. */
  floor: number;
  /** Top of the body; roof pods stand on it. */
  roof: number;
  wheelbase: number;
  wheelRadius: number;
  wheelWidth: number;
  gaugeHalf: number;
  /** How far the nose's top edge sits back from its foot. */
  rake: number;
  /** Length of the coupler that ends a train's nose and blunt ends; a tram has none. */
  coupler: number;
  /** How far a gangway bellows reaches past a blunt end: half the gap to the next car, so two meet midway. */
  bellows: number;
  /** Skirts close the side from the saloon floor down over the wheels. */
  skirts: boolean;
  podSize: readonly [number, number, number];
  podZ: readonly number[];
}

interface CarOptions {
  /** The +Z end is a cab; otherwise it is a blunt end with a bellows. */
  cab: boolean;
  /** The -Z end carries half a shared bogie instead of a whole one (a tram's joint). */
  sharedJoint: boolean;
  pantograph: boolean;
}

const TRAIN_SPEC: CarSpec = {
  size: TRAIN_CAR_SIZE,
  floor: TRAIN_FLOOR_M - 0.2,
  roof: TRAIN_CAR_SIZE[1] - 0.2,
  wheelbase: TRAIN_BOGIE.wheelbase,
  wheelRadius: TRAIN_BOGIE.wheelDiameter / 2,
  wheelWidth: 0.14,
  gaugeHalf: TRAIN_GAUGE_HALF_M,
  rake: 1.1,
  coupler: 0.35,
  bellows: 0.6,
  skirts: false,
  podSize: [2.0, 0.2, 2.6],
  podZ: [-3.6, 3.6],
};

const TRAM_SPEC: CarSpec = {
  size: TRAM_CAR_SIZE,
  floor: TRAM_FLOOR_M,
  roof: TRAM_CAR_SIZE[1] - 0.3,
  wheelbase: TRAM_BOGIE.wheelbase,
  wheelRadius: TRAM_BOGIE.wheelDiameter / 2,
  wheelWidth: 0.1,
  gaugeHalf: TRAM_GAUGE_HALF_M,
  rake: 0.9,
  coupler: 0,
  bellows: 0.2,
  skirts: true,
  podSize: [1.4, 0.3, 2.0],
  podZ: [-3.0, 3.0],
};

const SIDE_SLAB = 0.03;
const BODY_INSET = 0.025;

function box(
  w: number,
  h: number,
  d: number,
  cx: number,
  cy: number,
  cz: number,
  color: RGB,
  region: number,
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(w, h, d);
  geo.translate(cx, cy, cz);
  return tagGeometry(geo, color, region);
}

/** A box from (z0, y0) to (z1, y1) whose top front edge is drawn back by `rake`: the raked nose. */
function bodyBox(
  width: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  rake: number,
): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(width, y1 - y0, z1 - z0);
  geo.translate(0, (y0 + y1) / 2, (z0 + z1) / 2);
  if (rake > 0) {
    const position = geo.getAttribute('position');
    for (let i = 0; i < position.count; i += 1) {
      if (position.getZ(i) > z1 - 1e-6 && position.getY(i) > y1 - 1e-6) {
        position.setZ(i, z1 - rake);
      }
    }
    geo.computeVertexNormals();
  }
  return tagGeometry(geo, BODY_WHITE, VEHICLE_REGION.BODY);
}

/** A wheel: a cylinder on its side, axle along X, outward-wound. */
function wheel(radius: number, width: number, x: number, z: number): THREE.BufferGeometry {
  const geo = new THREE.CylinderGeometry(radius, radius, width, 16, 1);
  geo.rotateZ(Math.PI / 2);
  geo.translate(x, radius, z);
  return tagGeometry(geo, RAIL_WHEEL_COLOR, VEHICLE_REGION.FIXED);
}

/** One axle of two wheels on the gauge, with its beam. */
function axle(spec: CarSpec, z: number, parts: THREE.BufferGeometry[]): void {
  for (const side of [-1, 1]) {
    parts.push(wheel(spec.wheelRadius, spec.wheelWidth, side * spec.gaugeHalf, z));
  }
  parts.push(
    box(2 * spec.gaugeHalf, 0.1, 0.1, 0, spec.wheelRadius, z, BOGIE, VEHICLE_REGION.FIXED),
  );
}

/** A whole bogie centred on z: two axles at the wheelbase, one frame between the wheels. */
function bogie(spec: CarSpec, z: number, parts: THREE.BufferGeometry[]): void {
  axle(spec, z - spec.wheelbase / 2, parts);
  axle(spec, z + spec.wheelbase / 2, parts);
  const frameW = 2 * (spec.gaugeHalf - spec.wheelWidth / 2) - 0.04;
  parts.push(
    box(
      frameW,
      0.28,
      spec.wheelbase + 0.5,
      0,
      spec.wheelRadius + 0.16,
      z,
      BOGIE,
      VEHICLE_REGION.FIXED,
    ),
  );
}

/** The half of a shared bogie one section carries: the axle on its side of the joint, and the frame running from it to the section's end. */
function halfBogie(
  spec: CarSpec,
  endZ: number,
  axleZ: number,
  parts: THREE.BufferGeometry[],
): void {
  axle(spec, axleZ, parts);
  const frameW = 2 * (spec.gaugeHalf - spec.wheelWidth / 2) - 0.04;
  const frontZ = axleZ + 0.25;
  parts.push(
    box(
      frameW,
      0.28,
      frontZ - endZ,
      0,
      spec.wheelRadius + 0.16,
      (endZ + frontZ) / 2,
      BOGIE,
      VEHICLE_REGION.FIXED,
    ),
  );
}

/** A slab lying on the nose's slope: a windscreen or a lamp, `width` across, from height `yFrom` to `yTo`. */
function noseSlab(
  spec: CarSpec,
  zFront: number,
  yFrom: number,
  yTo: number,
  width: number,
  cx: number,
  color: RGB,
  region: number,
): THREE.BufferGeometry {
  const rise = spec.roof - spec.floor;
  const theta = Math.atan2(spec.rake, rise);
  const length = (yTo - yFrom) / Math.cos(theta);
  const yMid = (yFrom + yTo) / 2;
  const zMid = zFront - (spec.rake * (yMid - spec.floor)) / rise;
  const lift = 0.01;
  const geo = new THREE.BoxGeometry(width, length, 0.03);
  geo.rotateX(-theta);
  geo.translate(cx, yMid + Math.sin(theta) * lift, zMid + Math.cos(theta) * lift);
  return tagGeometry(geo, color, region);
}

/** The runs of the window band along the side: clear of the doors and of the two ends. */
function windowSpans(
  lo: number,
  hi: number,
  doors: readonly number[],
  doorHalf: number,
): [number, number][] {
  const spans: [number, number][] = [];
  let cursor = lo;
  for (const door of doors) {
    const edge = door - doorHalf - 0.2;
    if (edge - cursor > 0.3) spans.push([cursor, Math.min(edge, hi)]);
    cursor = Math.max(cursor, door + doorHalf + 0.2);
  }
  if (hi - cursor > 0.3) spans.push([cursor, hi]);
  return spans;
}

/** A pantograph standing raised on the roof: base, two arms folded at a knee, and a head `TRAM_PANTOGRAPH_HEAD_M` over the roof. */
function pantograph(roof: number, z: number, parts: THREE.BufferGeometry[]): void {
  const gear = (w: number, h: number, d: number, cx: number, cy: number, cz: number) =>
    box(w, h, d, cx, cy, cz, ROOF_GEAR, VEHICLE_REGION.FIXED);
  parts.push(gear(1.0, 0.12, 1.2, 0, roof + 0.06, z));
  const arm = (x: number, y0: number, z0: number, y1: number, z1: number) => {
    const length = Math.hypot(y1 - y0, z1 - z0);
    const geo = new THREE.BoxGeometry(0.06, length, 0.06);
    geo.rotateX(Math.atan2(z1 - z0, y1 - y0));
    geo.translate(x, (y0 + y1) / 2, (z0 + z1) / 2);
    parts.push(tagGeometry(geo, ROOF_GEAR, VEHICLE_REGION.FIXED));
  };
  const head = roof + TRAM_PANTOGRAPH_HEAD_M;
  for (const x of [-0.3, 0.3]) {
    arm(x, roof + 0.1, z - 0.4, roof + 0.85, z + 0.3);
    arm(x, roof + 0.85, z + 0.3, head - 0.03, z - 0.4);
  }
  parts.push(gear(1.5, 0.06, 0.5, 0, head - 0.03, z - 0.4));
}

/** One car: a cab or blunt +Z end, a bellows -Z end (and +Z end when it is no cab), bogies, window band, doors, roof pods. */
function buildCar(spec: CarSpec, options: CarOptions): THREE.BufferGeometry {
  const [width, , length] = spec.size;
  const half = length / 2;
  const halfWidth = width / 2;
  const parts: THREE.BufferGeometry[] = [];
  // The body shell fills the car's length; a bellows reaches half the gap past a blunt end.
  const zRear = -half;
  const zFront = half;
  const bodyHalf = halfWidth - BODY_INSET;

  parts.push(
    bodyBox(2 * bodyHalf, spec.floor, spec.roof, zRear, zFront, options.cab ? spec.rake : 0),
  );

  // Bellows at each blunt end, a coupler under it on a train.
  const bluntEnds = options.cab ? [-1] : [-1, 1];
  for (const end of bluntEnds) {
    const zc = end * (half + spec.bellows / 2);
    parts.push(
      box(
        width - 0.5,
        spec.roof - spec.floor - 0.3,
        spec.bellows,
        0,
        (spec.floor + 0.05 + spec.roof - 0.25) / 2,
        zc,
        BELLOWS,
        VEHICLE_REGION.FIXED,
      ),
    );
    if (spec.coupler > 0) {
      parts.push(
        box(
          0.4,
          0.22,
          spec.coupler,
          0,
          spec.floor - 0.35,
          end * (half - spec.coupler / 2),
          COUPLER,
          VEHICLE_REGION.FIXED,
        ),
      );
    }
  }

  // Cab: coupler, windscreen and lamps on the raked nose.
  if (options.cab) {
    if (spec.coupler > 0) {
      parts.push(
        box(
          0.4,
          0.22,
          spec.coupler,
          0,
          spec.floor - 0.35,
          half - spec.coupler / 2,
          COUPLER,
          VEHICLE_REGION.FIXED,
        ),
      );
    }
    const lampX = Math.min(0.9, halfWidth - 0.55);
    parts.push(
      noseSlab(
        spec,
        zFront,
        spec.floor + 0.9,
        spec.roof - 0.35,
        width - 0.9,
        0,
        GLASS,
        VEHICLE_REGION.FIXED,
      ),
    );
    for (const side of [-1, 1]) {
      parts.push(
        noseSlab(
          spec,
          zFront,
          spec.floor + 0.25,
          spec.floor + 0.5,
          0.3,
          side * lampX,
          HEADLAMP,
          VEHICLE_REGION.HEADLIGHT,
        ),
      );
    }
  }

  // Window band, broken by two doors a side.
  const rise = spec.roof - spec.floor;
  const winLo = spec.floor + 0.8;
  const winHi = spec.roof - 0.55;
  const doorLo = spec.floor + 0.05;
  const doorHi = spec.roof - 0.45;
  const doorZ = [-0.25 * length, 0.25 * length];
  const doorHalf = 0.65;
  const spanHi = options.cab
    ? zFront - (spec.rake * (winHi - spec.floor)) / rise - 0.15
    : zFront - 0.25;
  for (const side of [-1, 1]) {
    const sideX = side * (halfWidth - SIDE_SLAB / 2);
    for (const [a, b] of windowSpans(zRear + 0.25, spanHi, doorZ, doorHalf)) {
      parts.push(
        box(
          SIDE_SLAB,
          winHi - winLo,
          b - a,
          sideX,
          (winLo + winHi) / 2,
          (a + b) / 2,
          GLASS,
          VEHICLE_REGION.FIXED,
        ),
      );
    }
    for (const z of doorZ) {
      parts.push(
        box(
          SIDE_SLAB,
          doorHi - doorLo,
          2 * doorHalf,
          sideX,
          (doorLo + doorHi) / 2,
          z,
          DOOR,
          VEHICLE_REGION.FIXED,
        ),
      );
    }
  }

  // Bogies set in from the ends, the body overhanging.
  const bogieZ = RAIL_BOGIE_CENTRE_FRACTION * length;
  bogie(spec, bogieZ, parts);
  if (options.sharedJoint) {
    halfBogie(spec, -half - spec.bellows, -half + 0.75, parts);
  } else {
    bogie(spec, -bogieZ, parts);
  }
  if (!spec.skirts) {
    parts.push(
      box(1.7, 0.3, length - 4.6, 0, spec.floor - 0.15, 0, UNDERFRAME, VEHICLE_REGION.FIXED),
    );
  } else {
    // Skirts close the side down over the wheels, round each bogie and the joint's half.
    const reach = spec.wheelbase / 2 + 0.85;
    const runs: [number, number][] = [
      [bogieZ - reach, Math.min(bogieZ + reach, zFront - 0.4)],
      [zRear, -half + 0.75 + 0.85],
    ];
    for (const [a, b] of runs) {
      for (const side of [-1, 1]) {
        parts.push(
          box(
            0.04,
            spec.floor + 0.02 - 0.3,
            b - a,
            side * (bodyHalf - 0.02),
            (spec.floor + 0.02 + 0.3) / 2,
            (a + b) / 2,
            BODY_WHITE,
            VEHICLE_REGION.BODY,
          ),
        );
      }
    }
  }

  // Roof pods, narrower than the body, and nothing else on a car without a pantograph.
  for (const z of spec.podZ) {
    parts.push(
      box(
        spec.podSize[0],
        spec.podSize[1],
        spec.podSize[2],
        0,
        spec.roof + spec.podSize[1] / 2,
        z,
        ROOF_GEAR,
        VEHICLE_REGION.FIXED,
      ),
    );
  }
  if (options.pantograph) pantograph(spec.roof, -0.2, parts);

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('buildCar: mergeGeometries failed');
  return merged;
}

/** A train's end car: cab on its +Z end, a bellows on its -Z end. Turn it about for the other end of the set. */
export function buildTrainEndCarGeometry(): THREE.BufferGeometry {
  return buildCar(TRAIN_SPEC, { cab: true, sharedJoint: false, pantograph: false });
}

/** A train's middle car: a bellows on each end, no cab. */
export function buildTrainMidCarGeometry(): THREE.BufferGeometry {
  return buildCar(TRAIN_SPEC, { cab: false, sharedJoint: false, pantograph: false });
}

/** A tram's lead section: cab on its +Z end, the joint's half-bogie behind, the one pantograph on its roof. */
export function buildTramLeadSectionGeometry(): THREE.BufferGeometry {
  return buildCar(TRAM_SPEC, { cab: true, sharedJoint: true, pantograph: true });
}

/** A tram's tail section: the lead's twin without the pantograph; turn it about to close the set. */
export function buildTramTailSectionGeometry(): THREE.BufferGeometry {
  return buildCar(TRAM_SPEC, { cab: true, sharedJoint: true, pantograph: false });
}
