/**
 * The garage a built-in form carries, drawn from its lot layout: a portal in a
 * side wall under a header and a blue P, and, where parking storeys stand
 * above ground, a garage band of slabs, spandrels and dark openings round the
 * storeys just above the ground floor. The parts are boxes in the lot's
 * frontage frame, metres, y up from the ground the body stands on; one
 * geometry per distinct form, merged, every building that has it one instance.
 */
import * as THREE from 'three';
import { FLOOR_HEIGHT_METERS } from '../shared/floorarea';
import {
  GARAGE_BAY_STALLS,
  GARAGE_SLAB_M,
  GARAGE_SPANDREL_M,
  GARAGE_WALL_M,
} from '../shared/garage';
import { PORTAL_CLEAR_M } from '../shared/builtinportal';
import type { LotLayout } from '../shared/lotlayout';
import { STALL_WIDTH_M } from '../shared/parkingcode';
import { COLUMN_RGB, LETTER_RGB, SIGN_RGB, SLAB_RGB, SPANDREL_RGB } from './garagekit';
import { materialUnit } from './palette';
import { mergeGeometryParts, paintVertexColor } from './trees';

type RGB = readonly [number, number, number];

/** The dark of a portal's recess and a garage opening. */
const OPENING_RGB: RGB = materialUnit('darkBitumen');

/** How far the band's faces and the portal's frame stand proud of the body's walls. */
export const BAND_PROUD_M = 0.06;
const PORTAL_PROUD_M = 0.12;
const JAMB_M = 0.3;
const HEADER_M = 0.45;
const COLUMN_M = 0.5;
/** The blue P over the header is a plate this wide and tall. */
const SIGN_W_M = 1;
const SIGN_H_M = 0.7;

export type BuiltInPartRole =
  | 'portal'
  | 'jamb'
  | 'header'
  | 'sign'
  | 'letter'
  | 'bandSpandrel'
  | 'bandOpening'
  | 'bandSlab'
  | 'bandColumn';

export interface BuiltInPart {
  role: BuiltInPartRole;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  y0: number;
  y1: number;
  rgb: RGB;
}

/** The parts of the garage of a form on `layout` with `aboveStoreys` parking storeys above ground. */
export function builtInParts(layout: LotLayout, aboveStoreys: number): BuiltInPart[] {
  const parts: BuiltInPart[] = [];
  const add = (
    role: BuiltInPartRole,
    [u0, u1]: [number, number],
    [v0, v1]: [number, number],
    [y0, y1]: [number, number],
    rgb: RGB,
  ): void => {
    parts.push({
      role,
      u0: Math.min(u0, u1),
      u1: Math.max(u0, u1),
      v0: Math.min(v0, v1),
      v1: Math.max(v0, v1),
      y0,
      y1,
      rgb,
    });
  };

  const { body, portal } = layout;
  const storey = FLOOR_HEIGHT_METERS;
  const p = BAND_PROUD_M;
  // Each parking storey above the ground floor: a spandrel, a dark opening and the slab over it, on every face.
  for (let k = 1; k <= aboveStoreys; k++) {
    const y0 = k * storey;
    const rows: [BuiltInPartRole, [number, number], RGB][] = [
      ['bandSpandrel', [y0, y0 + GARAGE_SPANDREL_M], SPANDREL_RGB],
      ['bandOpening', [y0 + GARAGE_SPANDREL_M, y0 + storey - GARAGE_SLAB_M], OPENING_RGB],
      ['bandSlab', [y0 + storey - GARAGE_SLAB_M, y0 + storey], SLAB_RGB],
    ];
    // Each face: the wall it stands on, which way is out, and its run along the wall.
    const faces: { wall: number; dir: 1 | -1; alongU: boolean; run: [number, number] }[] = [
      { wall: body.v0, dir: -1, alongU: true, run: [body.u0 - p, body.u1 + p] },
      { wall: body.v1, dir: 1, alongU: true, run: [body.u0 - p, body.u1 + p] },
      { wall: body.u0, dir: -1, alongU: false, run: [body.v0 - p, body.v1 + p] },
      { wall: body.u1, dir: 1, alongU: false, run: [body.v0 - p, body.v1 + p] },
    ];
    const bay = GARAGE_BAY_STALLS * STALL_WIDTH_M;
    for (const { wall, dir, alongU, run } of faces) {
      const onFace = (
        along: [number, number],
        proud: number,
        y: [number, number],
        role: BuiltInPartRole,
        rgb: RGB,
      ): void => {
        const across: [number, number] = [wall, wall + dir * proud];
        add(role, alongU ? along : across, alongU ? across : along, y, rgb);
      };
      for (const [role, y, rgb] of rows) onFace(run, p, y, role, rgb);
      // Columns on the structural bay, one at each end of the face.
      const at: number[] = [];
      for (let a = run[0] + GARAGE_WALL_M; a < run[1] - GARAGE_WALL_M; a += bay) at.push(a);
      at.push(run[1] - GARAGE_WALL_M);
      for (const a of at) {
        onFace(
          [a - COLUMN_M / 2, a + COLUMN_M / 2],
          p + 0.04,
          rows[1]![1],
          'bandColumn',
          COLUMN_RGB,
        );
      }
    }
  }

  if (!portal) return parts;
  const side = portal.face === 'u+' ? 1 : -1;
  const wall = portal.rect.u0;
  const out = (m: number): [number, number] => [wall, wall + side * m];
  const [v0, v1] = [portal.rect.v0, portal.rect.v1];
  // The opening stands at grade, 2.5 m clear; any ramp down is inside the body.
  const top = PORTAL_CLEAR_M;
  add('portal', out(PORTAL_PROUD_M), [v0, v1], [0, top], OPENING_RGB);
  add('jamb', out(PORTAL_PROUD_M + 0.04), [v0 - JAMB_M, v0], [0, top + HEADER_M], SPANDREL_RGB);
  add('jamb', out(PORTAL_PROUD_M + 0.04), [v1, v1 + JAMB_M], [0, top + HEADER_M], SPANDREL_RGB);
  add(
    'header',
    out(PORTAL_PROUD_M + 0.04),
    [v0 - JAMB_M, v1 + JAMB_M],
    [top, top + HEADER_M],
    SPANDREL_RGB,
  );
  // The blue P on a plate over the header.
  const mid = (v0 + v1) / 2;
  const plateY: [number, number] = [top + HEADER_M + 0.25, top + HEADER_M + 0.25 + SIGN_H_M];
  add(
    'sign',
    out(PORTAL_PROUD_M + 0.04),
    [mid - SIGN_W_M / 2, mid + SIGN_W_M / 2],
    plateY,
    SIGN_RGB,
  );
  const lu = PORTAL_PROUD_M + 0.08;
  const ly = plateY[0];
  // A P read from the drive: a stem, a bowl's top and its middle bar, and its right side.
  add('letter', out(lu), [mid - 0.2, mid - 0.04], [ly + 0.12, ly + 0.58], LETTER_RGB);
  add('letter', out(lu), [mid - 0.2, mid + 0.18], [ly + 0.46, ly + 0.58], LETTER_RGB);
  add('letter', out(lu), [mid - 0.2, mid + 0.18], [ly + 0.28, ly + 0.4], LETTER_RGB);
  add('letter', out(lu), [mid + 0.06, mid + 0.18], [ly + 0.28, ly + 0.58], LETTER_RGB);

  return parts;
}

/** The key one variant of the geometry is cached under: what changes its shape. */
export function builtInVariantKey(
  layout: LotLayout,
  aboveStoreys: number,
  mirror: boolean,
): string {
  const { body, portal, lot } = layout;
  const r = (n: number): string => n.toFixed(2);
  return [
    r(lot.u1),
    r(lot.v1),
    r(body.u0),
    r(body.u1),
    r(body.v0),
    r(body.v1),
    portal ? `${portal.face}${r(portal.rect.v0)}` : '-',
    aboveStoreys,
    mirror ? 'm' : 'n',
  ].join(':');
}

/** The merged geometry of a form's garage, local to the lot's centre on the ground, mirrored for a mirrored frame. */
export function buildBuiltInGeometry(
  layout: LotLayout,
  aboveStoreys: number,
  mirror: boolean,
): THREE.BufferGeometry {
  const sgn = mirror ? -1 : 1;
  const lotW = layout.lot.u1;
  const lotD = layout.lot.v1;
  const geometries = builtInParts(layout, aboveStoreys).map((part) => {
    const g = new THREE.BoxGeometry(part.u1 - part.u0, part.y1 - part.y0, part.v1 - part.v0);
    g.translate(
      sgn * ((part.u0 + part.u1) / 2 - lotW / 2),
      (part.y0 + part.y1) / 2,
      (part.v0 + part.v1) / 2 - lotD / 2,
    );
    return paintVertexColor(g, new THREE.Color(part.rgb[0], part.rgb[1], part.rgb[2]).getHex());
  });
  return mergeGeometryParts(geometries);
}
