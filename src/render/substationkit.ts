/**
 * The substation kit: a fenced gravel yard on a 2 x 2 lot with a gate on the
 * street side, one power transformer on its concrete pad, a row of switchgear
 * cabinets, a steel dead-end gantry where a line arrives, a small control house
 * and a pole-top riser at the street side where the yard feeds the street's
 * line.
 *
 * Geometry only, at real size, in the lot's own frame: x and z in metres from
 * the lot's centre, the street on local +Z, y = 0 the highest ground under the
 * lot. Every part is a merged vertex-coloured BufferGeometry the kit stands as
 * an InstancedMesh; nothing here is mirrored.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TILE_METERS } from '../shared/constants';
import { PLOT_YARD_TOP } from './plotground';

export type SubstationPart = 'substationYard' | 'substationEquipment' | 'substationLit';

export const SUBSTATION_PARTS: readonly SubstationPart[] = [
  'substationYard',
  'substationEquipment',
  'substationLit',
];

/** The lot is 2 x 2 tiles. */
export const SUBSTATION_LOT_M = 2 * TILE_METERS;
const HALF = SUBSTATION_LOT_M / 2;
/** How far inside the lot's edge the fence stands. */
const FENCE_INSET_M = 1.5;
const FENCE = HALF - FENCE_INSET_M;
const FENCE_HEIGHT_M = 2.4;
const FOOTING_M = 8;

/** The gate in the fence on the street side (+Z): its span along x and where it stands. */
export const SUBSTATION_GATE = { x0: -3, x1: 3, z: FENCE } as const;
/** A transformer is about 4 x 3 x 4 m with its radiators and bushings. */
export const TRANSFORMER = { w: 4, d: 3, h: 4, x: 0, z: -6.5 } as const;
/** The control house: 6 x 4 x 3 m. */
export const CONTROL_HOUSE = { w: 6, d: 4, h: 3, x: -12, z: 12 } as const;
export const GANTRY_HEIGHT_M = 12;
export const RISER_POLE_HEIGHT_M = 10.4;
export const SWITCHGEAR_CABINETS = 5;

type RGB = readonly [number, number, number];
const GRAVEL: RGB = [0.42, 0.41, 0.38];
const CONCRETE: RGB = [0.62, 0.62, 0.6];
const DARK_CONCRETE: RGB = [0.46, 0.46, 0.45];
const FENCE_RGB: RGB = [0.55, 0.57, 0.6];
const STEEL: RGB = [0.5, 0.53, 0.57];
const GALVANISED: RGB = [0.68, 0.7, 0.72];
const TRANSFORMER_RGB: RGB = [0.36, 0.45, 0.4];
const FIN_RGB: RGB = [0.3, 0.38, 0.34];
const PORCELAIN: RGB = [0.58, 0.4, 0.28];
const CABINET_RGB: RGB = [0.52, 0.56, 0.54];
const DOOR_RGB: RGB = [0.3, 0.33, 0.33];
const HOUSE_RGB: RGB = [0.72, 0.68, 0.6];
const HOUSE_ROOF_RGB: RGB = [0.36, 0.36, 0.38];
const WOOD: RGB = [0.4, 0.3, 0.2];
const PANE_RGB: RGB = [0.16, 0.2, 0.26];

function paint(g: THREE.BufferGeometry, rgb: RGB): THREE.BufferGeometry {
  const c = new THREE.Color(rgb[0], rgb[1], rgb[2]);
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.deleteAttribute('uv');
  return g;
}

/** A box w x h x d standing on y0, centred at (x, z). */
function box(
  w: number,
  h: number,
  d: number,
  x: number,
  y0: number,
  z: number,
  rgb: RGB,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y0 + h / 2, z);
  return paint(g, rgb);
}

/** An upright cylinder of radius r and height h standing on y0 at (x, z). */
function post(
  r: number,
  h: number,
  x: number,
  y0: number,
  z: number,
  rgb: RGB,
  segments = 8,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, h, segments);
  g.translate(x, y0 + h / 2, z);
  return paint(g, rgb);
}

/** A cylinder lying along x. */
function barX(
  r: number,
  length: number,
  x: number,
  y: number,
  z: number,
  rgb: RGB,
): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r, r, length, 8);
  g.rotateZ(Math.PI / 2);
  g.translate(x, y, z);
  return paint(g, rgb);
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  return merged;
}

const TOP = PLOT_YARD_TOP;

/** The fence round the yard, open at the gate: posts, three rails and a thin mesh panel a run. */
function fenceParts(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const run = (from: number, to: number, fixed: number, alongX: boolean): void => {
    const length = to - from;
    const mid = (from + to) / 2;
    const w = alongX ? length : 0.04;
    const d = alongX ? 0.04 : length;
    const x = alongX ? mid : fixed;
    const z = alongX ? fixed : mid;
    parts.push(box(w, FENCE_HEIGHT_M - 0.3, d, x, TOP + 0.15, z, FENCE_RGB));
    for (const y of [0.1, FENCE_HEIGHT_M / 2, FENCE_HEIGHT_M - 0.1]) {
      parts.push(
        box(alongX ? length : 0.06, 0.06, alongX ? 0.06 : length, x, TOP + y, z, GALVANISED),
      );
    }
    const posts = Math.max(1, Math.ceil(length / 4));
    for (let i = 0; i <= posts; i++) {
      const at = from + (i * length) / posts;
      parts.push(
        box(0.1, FENCE_HEIGHT_M, 0.1, alongX ? at : fixed, TOP, alongX ? fixed : at, GALVANISED),
      );
    }
  };
  run(-FENCE, FENCE, -FENCE, true);
  run(-FENCE, FENCE, -FENCE, false);
  run(-FENCE, FENCE, FENCE, false);
  run(-FENCE, SUBSTATION_GATE.x0, FENCE, true);
  run(SUBSTATION_GATE.x1, FENCE, FENCE, true);
  // Gate posts, and the two leaves swung open into the yard.
  for (const x of [SUBSTATION_GATE.x0, SUBSTATION_GATE.x1]) {
    parts.push(box(0.3, 2.7, 0.3, x, TOP, FENCE, STEEL));
    const s = x < 0 ? 1 : -1;
    parts.push(
      box(0.05, FENCE_HEIGHT_M - 0.3, 2.8, x + s * 0.2, TOP + 0.15, FENCE - 1.6, FENCE_RGB),
    );
  }
  return parts;
}

/** The ground of the yard: the gravel plate over the whole lot, the drive and the concrete pads. */
function yardGeometry(): THREE.BufferGeometry {
  const plate = new THREE.BoxGeometry(SUBSTATION_LOT_M, TOP + FOOTING_M, SUBSTATION_LOT_M);
  plate.translate(0, TOP - (TOP + FOOTING_M) / 2, 0);
  const parts: THREE.BufferGeometry[] = [
    paint(plate, GRAVEL),
    // The drive from the gate in to the transformer's pad.
    box(5, 0.02, FENCE - TRANSFORMER.z - 4, 0, TOP, (FENCE + TRANSFORMER.z + 4) / 2, DARK_CONCRETE),
    // The transformer's pad, with room round it for the oil bund.
    box(8, 0.3, 7, TRANSFORMER.x, TOP, TRANSFORMER.z, CONCRETE),
    // The switchgear's pad and the control house's slab.
    box(8.4, 0.2, 3.2, 9.5, TOP, 6, CONCRETE),
    box(
      CONTROL_HOUSE.w + 1,
      0.2,
      CONTROL_HOUSE.d + 1,
      CONTROL_HOUSE.x,
      TOP,
      CONTROL_HOUSE.z,
      CONCRETE,
    ),
    ...fenceParts(),
  ];
  return merge(parts);
}

/** The transformer on its pad: tank, radiator fins, conservator, and the bushings on its cover. */
function transformerParts(): THREE.BufferGeometry[] {
  const { x, z } = TRANSFORMER;
  const base = TOP + 0.3;
  const tank = { w: 3.4, d: 3, h: 2.6 };
  const parts: THREE.BufferGeometry[] = [
    box(tank.w, tank.h, tank.d, x - 0.3, base, z, TRANSFORMER_RGB),
    box(tank.w + 0.1, 0.12, tank.d + 0.1, x - 0.3, base + tank.h, z, STEEL),
    // The conservator tank along the cover.
    barX(0.35, 3, x - 0.3, base + tank.h + 0.55, z - 0.9, TRANSFORMER_RGB),
  ];
  // Radiator fins on the +x face, one every 0.35 m along it.
  for (let i = 0; i < 8; i++) {
    parts.push(
      box(0.6, 2.0, 0.08, x + tank.w / 2 - 0.3 + 0.3, base + 0.3, z - 1.2 + i * 0.35, FIN_RGB),
    );
  }
  // Three high-voltage and three low-voltage bushings.
  for (let i = -1; i <= 1; i++) {
    parts.push(post(0.12, 1.25, x - 0.3 + i * 1.0, base + tank.h + 0.12, z + 0.6, PORCELAIN));
    parts.push(post(0.09, 0.7, x - 0.3 + i * 1.0, base + tank.h + 0.12, z - 0.1, PORCELAIN));
  }
  return parts;
}

/** A row of metal-clad switchgear cabinets, doors to the street. */
function switchgearParts(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  const w = 1.4;
  const gap = 0.1;
  const row = SWITCHGEAR_CABINETS * w + (SWITCHGEAR_CABINETS - 1) * gap;
  const z = 6;
  for (let i = 0; i < SWITCHGEAR_CABINETS; i++) {
    const x = 9.5 - row / 2 + w / 2 + i * (w + gap);
    parts.push(box(w, 2.4, 2, x, TOP + 0.2, z, CABINET_RGB));
    parts.push(box(w - 0.3, 1.9, 0.04, x, TOP + 0.4, z + 1.02, DOOR_RGB));
    parts.push(box(w, 0.1, 2.1, x, TOP + 2.6, z, STEEL));
  }
  return parts;
}

/** The steel dead-end gantry: two legs, a beam, and insulator strings hanging from it. */
function gantryParts(): THREE.BufferGeometry[] {
  const z = -14;
  const legs = [10, 18];
  const parts: THREE.BufferGeometry[] = [];
  for (const x of legs) {
    parts.push(box(0.5, GANTRY_HEIGHT_M - 0.5, 0.5, x, TOP, z, STEEL));
    // A cross brace low on each leg.
    parts.push(box(0.15, 0.15, 3, x, TOP + 3, z + 1.2, STEEL));
  }
  parts.push(box(legs[1]! - legs[0]! + 0.5, 0.5, 0.5, 14, TOP + GANTRY_HEIGHT_M - 0.5, z, STEEL));
  for (const x of [11.5, 14, 16.5]) {
    parts.push(post(0.09, 1.4, x, TOP + GANTRY_HEIGHT_M - 0.5 - 1.4, z, PORCELAIN));
    // The jumper dropping to the equipment below.
    parts.push(box(0.05, 4.5, 0.05, x, TOP + GANTRY_HEIGHT_M - 0.5 - 5.9, z, GALVANISED));
  }
  return parts;
}

/** The control house: a flat-roofed block with its door on the yard side. */
function controlHouseParts(): THREE.BufferGeometry[] {
  const { w, d, h, x, z } = CONTROL_HOUSE;
  const base = TOP + 0.2;
  return [
    box(w, h - 0.3, d, x, base, z, HOUSE_RGB),
    box(w + 0.3, 0.3, d + 0.3, x, base + h - 0.3, z, HOUSE_ROOF_RGB),
    box(0.06, 2.1, 1, x + w / 2 + 0.01, base, z + 1, DOOR_RGB),
  ];
}

/** The pole at the street side: crossarm, insulators and the riser conduit down its face. */
function riserParts(): THREE.BufferGeometry[] {
  const x = -6;
  const z = HALF - 0.8;
  const parts: THREE.BufferGeometry[] = [
    post(0.18, RISER_POLE_HEIGHT_M, x, TOP, z, WOOD, 10),
    box(2.4, 0.12, 0.12, x, TOP + RISER_POLE_HEIGHT_M - 0.9, z, WOOD),
    // The riser: a conduit down the pole's yard face to the ground.
    post(0.05, RISER_POLE_HEIGHT_M - 1.2, x, TOP, z - 0.22, GALVANISED),
  ];
  for (const dx of [-1, 0, 1]) {
    parts.push(post(0.06, 0.35, x + dx * 0.9, TOP + RISER_POLE_HEIGHT_M - 0.78, z, PORCELAIN));
  }
  return parts;
}

/** A yard light on a short pole. */
const LAMP = { x: -6, z: 4, height: 4.5 } as const;

function equipmentGeometry(): THREE.BufferGeometry {
  return merge([
    ...transformerParts(),
    ...switchgearParts(),
    ...gantryParts(),
    ...controlHouseParts(),
    ...riserParts(),
    post(0.07, LAMP.height, LAMP.x, TOP, LAMP.z, STEEL),
    box(0.8, 0.12, 0.3, LAMP.x, TOP + LAMP.height, LAMP.z, STEEL),
  ]);
}

/** What glows at night: the control house's window and the yard light's lamp. */
function litGeometry(): THREE.BufferGeometry {
  const { w, d, x, z } = CONTROL_HOUSE;
  return merge([
    box(0.04, 0.8, 1.2, x + w / 2 + 0.02, TOP + 0.2 + 1.2, z - 0.8, PANE_RGB),
    box(0.04, 0.8, 1.2, x - w / 2 - 0.02, TOP + 0.2 + 1.2, z - d / 4, PANE_RGB),
    box(0.6, 0.08, 0.22, LAMP.x, TOP + LAMP.height - 0.08, LAMP.z, PANE_RGB),
  ]);
}

/** One part of the kit, local to the lot's centre with y = 0 the highest ground under it. */
export function buildSubstationGeometry(part: SubstationPart): THREE.BufferGeometry {
  switch (part) {
    case 'substationYard':
      return yardGeometry();
    case 'substationEquipment':
      return equipmentGeometry();
    case 'substationLit':
      return litGeometry();
  }
}
