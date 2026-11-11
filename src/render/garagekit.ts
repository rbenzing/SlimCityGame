/**
 * The garage kit: a dense building's parking deck as one merged geometry, laid
 * from the shared garage layout (shared/garage.ts). Tiers of open floor between
 * 0.84 m spandrels, columns on the structural bay, a ramp between tiers, one
 * entry on the drive under a clearance bar, a gate arm and a blue P sign, a
 * closed stair tower a tier taller than the deck, painted stalls on every tier
 * and a lamp pole a bay on the roof tier.
 *
 * The geometry is built in the lot's frame turned to world by the one yaw that
 * points local +Z into the lot (frontage.inwardYaw): local x is the lot's `u`
 * on a frame that is not mirrored, and its reverse on one that is, so a mirrored
 * lot is a second geometry and never a negative scale. Local origin: the lot's
 * centre, on the ground.
 */
import * as THREE from 'three';
import {
  GARAGE_BAY_STALLS,
  GARAGE_ENTRY_CLEAR_M,
  GARAGE_GROUND_M,
  GARAGE_SLAB_M,
  GARAGE_SPANDREL_M,
  GARAGE_TIER_M,
  GARAGE_WALL_M,
  type Garage,
} from '../shared/garage';
import { STALL_WIDTH_M } from '../shared/parkingcode';
import { maxHeightOverRect } from './footprint';
import { inwardYaw, type EdgeFrame } from './frontage';
import { lotPointToWorld } from './lotplan';
import { mergeGeometryParts, paintVertexColor } from './trees';

type RGB = readonly [number, number, number];

const SLAB_RGB: RGB = [0.5, 0.5, 0.48];
const GROUND_SLAB_RGB: RGB = [0.42, 0.43, 0.44];
const SPANDREL_RGB: RGB = [0.72, 0.71, 0.67];
const COLUMN_RGB: RGB = [0.58, 0.58, 0.56];
const RAMP_RGB: RGB = [0.62, 0.62, 0.6];
const STAIR_RGB: RGB = [0.6, 0.62, 0.65];
const GLASS_RGB: RGB = [0.18, 0.26, 0.33];
const LINE_RGB: RGB = [0.93, 0.93, 0.9];
const BAR_RGB: RGB = [0.92, 0.74, 0.1];
const ARM_RGB: RGB = [0.85, 0.15, 0.1];
const POST_RGB: RGB = [0.42, 0.44, 0.46];
const SIGN_RGB: RGB = [0.04, 0.24, 0.62];
const LETTER_RGB: RGB = [0.96, 0.96, 0.96];
const LAMP_RGB: RGB = [0.3, 0.32, 0.34];

/** How far below the ground the deck's footing runs, so a slope never shows a gap under it. */
const SKIRT_M = 1.5;
const COLUMN_M = 0.5;
/** A stall line is 6 in wide and rides a hand's breadth over the floor. */
const LINE_M = 6 * 0.0254;
const LINE_LIFT_M = 0.02;
const LAMP_HEIGHT_M = 4.5;
const SIGN_M = 1.2;

/** The height of tier `k`'s floor above the ground. */
export function tierFloorY(k: number): number {
  return GARAGE_GROUND_M + k * GARAGE_TIER_M;
}

/** How many of a deck's lowest tiers stand wholly behind a body `bodyH` tall: their rear face is the body's wall. */
export function closedTiersFor(bodyH: number): number {
  return Math.max(0, Math.floor((bodyH - GARAGE_GROUND_M) / GARAGE_TIER_M + 1e-9));
}

/** The ground level the deck stands on: the highest ground under its footprint. */
export function garageGroundY(
  heightAt: (x: number, z: number) => number,
  frame: EdgeFrame,
  garage: Garage,
): number {
  const { deck } = garage;
  const corners = [
    lotPointToWorld(frame, deck.u0, deck.v0),
    lotPointToWorld(frame, deck.u1, deck.v0),
    lotPointToWorld(frame, deck.u0, deck.v1),
    lotPointToWorld(frame, deck.u1, deck.v1),
  ];
  const xs = corners.map((c) => c.x);
  const zs = corners.map((c) => c.z);
  return maxHeightOverRect(
    heightAt,
    Math.min(...xs),
    Math.min(...zs),
    Math.max(...xs),
    Math.max(...zs),
  );
}

/** The yaw the deck instance stands at, and whether its frame is mirrored. */
export function garageTurn(frame: EdgeFrame): { yaw: number; mirror: boolean } {
  return { yaw: inwardYaw(frame), mirror: frame.mirror === -1 };
}

/** The key one variant of the deck is cached under: what changes its shape. */
export function garageVariantKey(
  garage: Garage,
  tiers: number,
  closedTiers: number,
  mirror: boolean,
): string {
  return `${garage.lotW}:${tiers}:${Math.min(closedTiers, tiers)}:${mirror ? 'm' : 'n'}`;
}

/** The unit each part's local frame is built from: lot metres to local metres. */
interface Frame2 {
  /** Local x of lot `u`. */
  x(u: number): number;
  /** Local z of lot `v`. */
  z(v: number): number;
}

/**
 * The deck of `tiers` tiers for `garage`, the lowest `closedTiers` backed by the
 * body's own wall. Local Y = 0 is the ground the deck stands on.
 */
export function buildGarageGeometry(
  garage: Garage,
  tiers: number,
  closedTiers: number,
  mirror: boolean,
): THREE.BufferGeometry {
  const sgn = mirror ? -1 : 1;
  const f: Frame2 = {
    x: (u) => sgn * (u - garage.lotW / 2),
    z: (v) => v - garage.lotD / 2,
  };
  const { deck, body, drive, stair, ramp, rows, aisle } = garage;
  const parts: THREE.BufferGeometry[] = [];

  /** A box over a lot rectangle, from `y0` to `y1`. */
  const box = (
    u0: number,
    u1: number,
    v0: number,
    v1: number,
    y0: number,
    y1: number,
    rgb: RGB,
  ): void => {
    if (u1 - u0 <= 1e-6 || v1 - v0 <= 1e-6 || y1 - y0 <= 1e-6) return;
    const g = new THREE.BoxGeometry(Math.abs(u1 - u0), y1 - y0, v1 - v0);
    g.translate(f.x((u0 + u1) / 2), (y0 + y1) / 2, f.z((v0 + v1) / 2));
    parts.push(paintVertexColor(g, new THREE.Color(rgb[0], rgb[1], rgb[2]).getHex()));
  };

  // The ground slab, footed below the ground, and each upper tier's slab.
  box(deck.u0, deck.u1, deck.v0, deck.v1, -SKIRT_M, tierFloorY(0), GROUND_SLAB_RGB);
  for (let k = 1; k < tiers; k++) {
    const top = tierFloorY(k);
    const bottom = top - GARAGE_SLAB_M;
    // Open over the ramp's lane, where the ramp from the tier below comes up.
    box(deck.u0, ramp.u0, deck.v0, deck.v1, bottom, top, SLAB_RGB);
    box(ramp.u1, deck.u1, deck.v0, deck.v1, bottom, top, SLAB_RGB);
    box(ramp.u0, ramp.u1, deck.v0, ramp.v0, bottom, top, SLAB_RGB);
    box(ramp.u0, ramp.u1, ramp.v1, deck.v1, bottom, top, SLAB_RGB);
  }

  // Columns on the structural bay, along the row boundaries and the rear wall.
  const bay = GARAGE_BAY_STALLS * STALL_WIDTH_M;
  const colUs: number[] = [];
  for (let u = GARAGE_WALL_M; u < garage.lotW - GARAGE_WALL_M; u += bay) colUs.push(u);
  colUs.push(garage.lotW - COLUMN_M / 2);
  const rowLines = new Set<number>([aisle.v1, deck.v1 - COLUMN_M / 2]);
  if (rows.length > 1) rowLines.add(aisle.v0);
  const topY = tierFloorY(tiers - 1);
  for (const v of tiers > 1 ? rowLines : []) {
    for (const u of colUs) {
      const inStair = u < stair.u1 && v < stair.v1 + 0.01 && v > stair.v0 - 0.01;
      const inEntry = u >= drive.u0 - 0.01 && v < aisle.v1 - 0.01 && v >= deck.v0;
      if (inStair || inEntry) continue;
      box(
        u - COLUMN_M / 2,
        u + COLUMN_M / 2,
        v - COLUMN_M / 2,
        v + COLUMN_M / 2,
        0,
        topY,
        COLUMN_RGB,
      );
    }
  }
  // Front columns where the deck's front face stands clear of the body.
  for (const u of tiers > 1 ? colUs : []) {
    if ((u > body.u0 - COLUMN_M && u < body.u1 + COLUMN_M) || u < stair.u1 || u >= drive.u0)
      continue;
    box(u - COLUMN_M / 2, u + COLUMN_M / 2, deck.v0, deck.v0 + COLUMN_M, 0, topY, COLUMN_RGB);
  }

  // The spandrels: a slab edge and a barrier on every open side of every tier.
  const t = GARAGE_WALL_M;
  for (let k = 0; k < tiers; k++) {
    const floor = tierFloorY(k);
    const y0 = k === 0 ? 0 : floor - GARAGE_SLAB_M;
    const y1 = floor + GARAGE_SPANDREL_M;
    const span = (u0: number, u1: number, v0: number, v1: number): void =>
      box(u0, u1, v0, v1, y0, y1, SPANDREL_RGB);
    span(deck.u0, deck.u1, deck.v1 - t, deck.v1);
    span(deck.u0, deck.u0 + t, deck.v0, deck.v1);
    span(deck.u1 - t, deck.u1, deck.v0, deck.v1);
    span(stair.u1, body.u0, deck.v0, deck.v0 + t);
    span(body.u1, k === 0 ? drive.u0 : deck.u1, deck.v0, deck.v0 + t);
    if (k >= closedTiers) span(body.u0, body.u1, deck.v0, deck.v0 + t);
  }

  // The entry: a fascia over the opening, a clearance bar hung before it, a
  // gate arm and the blue P.
  const entryTop = tierFloorY(1);
  const lintelBottom = GARAGE_GROUND_M + GARAGE_ENTRY_CLEAR_M + 0.35;
  box(drive.u0, drive.u1, deck.v0, deck.v0 + t, lintelBottom, entryTop, SPANDREL_RGB);
  const mouthV = deck.v0 - 0.6;
  const barY = GARAGE_GROUND_M + GARAGE_ENTRY_CLEAR_M;
  box(drive.u0 + 0.05, drive.u0 + 0.25, mouthV - 0.1, mouthV + 0.1, 0, barY + 0.3, POST_RGB);
  box(drive.u1 - 0.25, drive.u1 - 0.05, mouthV - 0.1, mouthV + 0.1, 0, barY + 0.3, POST_RGB);
  box(drive.u0 + 0.05, drive.u1 - 0.05, mouthV - 0.06, mouthV + 0.06, barY, barY + 0.2, BAR_RGB);
  const gateV = deck.v0 - 1.8;
  box(drive.u1 - 0.5, drive.u1 - 0.1, gateV - 0.2, gateV + 0.2, 0, 1.1, POST_RGB);
  box(drive.u0 + 0.6, drive.u1 - 0.5, gateV - 0.06, gateV + 0.06, 1.05, 1.17, ARM_RGB);
  // The sign: a blue plate on a pole at the drive's mouth, a white P in boxes
  // read from the street, whose right is local -x.
  const poleU = drive.u0 + 0.3;
  const poleV = 1.2;
  const plateY = 2.3;
  const plate = (
    w: number,
    h: number,
    d: number,
    dx: number,
    dy: number,
    dz: number,
    rgb: RGB,
  ): void => {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(f.x(poleU) + dx, plateY + SIGN_M / 2 + dy, f.z(poleV) + dz);
    parts.push(paintVertexColor(g, new THREE.Color(rgb[0], rgb[1], rgb[2]).getHex()));
  };
  box(poleU - 0.06, poleU + 0.06, poleV - 0.06, poleV + 0.06, 0, plateY, POST_RGB);
  plate(SIGN_M, SIGN_M, 0.06, 0, 0, 0, SIGN_RGB);
  const z = -0.05;
  plate(0.16, 0.7, 0.05, 0.2, 0, z, LETTER_RGB);
  plate(0.4, 0.14, 0.05, 0, 0.28, z, LETTER_RGB);
  plate(0.4, 0.14, 0.05, 0, 0.02, z, LETTER_RGB);
  plate(0.14, 0.4, 0.05, -0.2, 0.15, z, LETTER_RGB);

  // The stair tower, a tier taller than the deck, glazed down its end and its street face.
  const stairTop = tierFloorY(tiers + 1);
  const pane = 0.05;
  box(stair.u0 + pane, stair.u1, stair.v0 + pane, stair.v1, 0, stairTop, STAIR_RGB);
  box(
    stair.u0,
    stair.u1 + 0.1,
    stair.v0 - 0.1,
    stair.v1 + 0.1,
    stairTop,
    stairTop + 0.25,
    SPANDREL_RGB,
  );
  const glassU = (stair.u0 + stair.u1) / 2;
  box(glassU - 0.7, glassU + 0.7, stair.v0, stair.v0 + pane, 0.6, stairTop - 0.6, GLASS_RGB);
  const glassV = (stair.v0 + stair.v1) / 2;
  box(stair.u0, stair.u0 + pane, glassV - 0.7, glassV + 0.7, 0.6, stairTop - 0.6, GLASS_RGB);

  // The ramps between tiers, alternating the way they climb.
  const run = ramp.u1 - ramp.u0;
  for (let k = 0; k < tiers - 1; k++) {
    const up = k % 2 === 0;
    const base = tierFloorY(k);
    const g = new THREE.BoxGeometry(run, GARAGE_SLAB_M, ramp.v1 - ramp.v0);
    g.translate(f.x((ramp.u0 + ramp.u1) / 2), 0, f.z((ramp.v0 + ramp.v1) / 2));
    const position = g.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const u = garage.lotW / 2 + sgn * position.getX(i);
      const along = (u - ramp.u0) / run;
      const top = base + (up ? along : 1 - along) * GARAGE_TIER_M;
      position.setY(i, top + (position.getY(i) - GARAGE_SLAB_M / 2));
    }
    g.computeVertexNormals();
    parts.push(
      paintVertexColor(g, new THREE.Color(RAMP_RGB[0], RAMP_RGB[1], RAMP_RGB[2]).getHex()),
    );
  }

  // The paint: a line either side of every stall on every tier.
  for (let k = 0; k < tiers; k++) {
    const y = tierFloorY(k) + LINE_LIFT_M;
    for (const row of rows) {
      for (let i = 0; i <= row.count; i++) {
        const u = row.rect.u0 + GARAGE_WALL_M + i * STALL_WIDTH_M;
        if (row.skipped > 0 && u < stair.u1 + 1e-6) continue;
        box(u - LINE_M / 2, u + LINE_M / 2, row.rect.v0, row.rect.v1, y, y + 0.01, LINE_RGB);
      }
    }
  }

  // A lamp pole a bay on the roof tier, along the rear wall.
  for (const u of colUs) {
    if (u < stair.u1) continue;
    const v = deck.v1 - 0.5;
    box(u - 0.06, u + 0.06, v - 0.06, v + 0.06, topY, topY + LAMP_HEIGHT_M, LAMP_RGB);
    box(
      u - 0.2,
      u + 0.2,
      v - 0.55,
      v + 0.05,
      topY + LAMP_HEIGHT_M,
      topY + LAMP_HEIGHT_M + 0.15,
      LAMP_RGB,
    );
  }

  return mergeGeometryParts(parts);
}
