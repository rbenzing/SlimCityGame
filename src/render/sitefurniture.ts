/**
 * The loose furniture of a building site: a site cabin, a skip, a portable
 * toilet and, on a big lot, a heap of spoil. Pure planning on the lot and the
 * body's footprint, so a test reads it without a scene.
 */

/** An axis-aligned rectangle in world metres. */
export interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

export type FurnitureKind = 'cabin' | 'skip' | 'toilet' | 'heap';

/** A piece standing on the ground: its centre, its size (`w` along its own x, `d` along its own z) and a turn of 0 or a quarter. */
export interface FurniturePiece {
  kind: FurnitureKind;
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  yaw: number;
}

export interface FurnitureSite {
  /** The lot rectangle; the fence stands inside it. */
  lot: Rect;
  /** The body's footprint, axis-aligned. */
  body: Rect;
  /** The axis the street face looks along, as a unit vector. */
  front: { x: number; z: number };
  /** A house's site lays no cabin. */
  house: boolean;
  /** Extra clearance round the body for scaffold and hoist, metres. */
  standoff?: number;
}

/** Clear ground a piece keeps from the fence, the body, the gate and every other piece. */
export const FURNITURE_CLEAR_M = 1;
/** The gate and the drive behind it run this far each side of the body's centre line. */
export const GATE_HALF_WIDTH_M = 3;
/** The fence stands this far in from the lot line. */
export const FENCE_INSET_M = 0.5;
/** A lot's fenced ground over this many square metres also holds a spoil heap. */
export const HEAP_MIN_LOT_M2 = 2000;
/** Candidate centres are tried this far apart. */
const SCAN_STEP_M = 0.5;

const SIZES = {
  cabin: { w: 6.1, d: 2.4, h: 2.6 },
  skip: { w: 6.7, d: 2.4, h: 1.4 },
  toilet: { w: 1.2, d: 1.2, h: 2.3 },
  heap: { w: 6, d: 4, h: 1.5 },
} as const;

function hash1(n: number): number {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

const grow = (r: Rect, by: number): Rect => ({
  x0: r.x0 - by,
  z0: r.z0 - by,
  x1: r.x1 + by,
  z1: r.z1 + by,
});

const overlaps = (a: Rect, b: Rect): boolean =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.z0 < b.z1 && a.z1 > b.z0;

/** The ground between the street face of the fence and the body, as wide as the gate. */
function gateStrip(site: FurnitureSite): Rect {
  const { lot, body, front } = site;
  const cx = (body.x0 + body.x1) / 2;
  const cz = (body.z0 + body.z1) / 2;
  if (front.z !== 0) {
    return {
      x0: cx - GATE_HALF_WIDTH_M,
      x1: cx + GATE_HALF_WIDTH_M,
      z0: front.z > 0 ? body.z1 : lot.z0,
      z1: front.z > 0 ? lot.z1 : body.z0,
    };
  }
  return {
    z0: cz - GATE_HALF_WIDTH_M,
    z1: cz + GATE_HALF_WIDTH_M,
    x0: front.x > 0 ? body.x1 : lot.x0,
    x1: front.x > 0 ? lot.x1 : body.x0,
  };
}

/**
 * Places the site's loose pieces, largest first, on ground free of the body
 * and the gate and clear of the fence and of each other. Cabin, skip and
 * toilet gather in one back corner of the fenced ground, chosen from the id;
 * a heap, on a big lot only, stands as near the body as the clearances allow.
 * A piece that does not fit is not laid.
 */
export function planFurniture(site: FurnitureSite, id: number): FurniturePiece[] {
  const { lot, body, front } = site;
  const inner = grow(lot, -(FENCE_INSET_M + FURNITURE_CLEAR_M));
  if (inner.x1 <= inner.x0 || inner.z1 <= inner.z0) return [];
  const blocked: Rect[] = [
    grow(body, FURNITURE_CLEAR_M + (site.standoff ?? 0)),
    grow(gateStrip(site), FURNITURE_CLEAR_M),
  ];
  const pieces: FurniturePiece[] = [];

  const fenced = grow(lot, -FENCE_INSET_M);
  const bigLot = (fenced.x1 - fenced.x0) * (fenced.z1 - fenced.z0) >= HEAP_MIN_LOT_M2;
  const kinds: FurnitureKind[] = site.house ? ['skip', 'toilet'] : ['cabin', 'skip', 'toilet'];
  if (bigLot) kinds.push('heap');

  // The back corner the first pieces gather in: far from the street face, on a side the id picks.
  const side = hash1(id) < 0.5 ? 0 : 1;
  const alongZ = front.z !== 0;
  const corner = alongZ
    ? { x: side === 0 ? inner.x0 : inner.x1, z: front.z > 0 ? inner.z0 : inner.z1 }
    : { x: front.x > 0 ? inner.x0 : inner.x1, z: side === 0 ? inner.z0 : inner.z1 };
  const bodyCentre = { x: (body.x0 + body.x1) / 2, z: (body.z0 + body.z1) / 2 };

  for (const kind of kinds) {
    const size = SIZES[kind];
    const target = kind === 'heap' ? bodyCentre : corner;
    let best: FurniturePiece | null = null;
    let bestDistance = Infinity;
    for (const yaw of [0, Math.PI / 2]) {
      const hx = (yaw === 0 ? size.w : size.d) / 2;
      const hz = (yaw === 0 ? size.d : size.w) / 2;
      for (let x = inner.x0 + hx; x <= inner.x1 - hx + 1e-9; x += SCAN_STEP_M) {
        for (let z = inner.z0 + hz; z <= inner.z1 - hz + 1e-9; z += SCAN_STEP_M) {
          const d = (x - target.x) ** 2 + (z - target.z) ** 2;
          if (d >= bestDistance) continue;
          const r: Rect = { x0: x - hx, z0: z - hz, x1: x + hx, z1: z + hz };
          if (blocked.some((b) => overlaps(r, b))) continue;
          bestDistance = d;
          best = { kind, x, z, w: size.w, d: size.d, h: size.h, yaw };
        }
      }
    }
    if (!best) continue;
    pieces.push(best);
    const turned = best.yaw !== 0;
    blocked.push(
      grow(
        {
          x0: best.x - (turned ? best.d : best.w) / 2,
          x1: best.x + (turned ? best.d : best.w) / 2,
          z0: best.z - (turned ? best.w : best.d) / 2,
          z1: best.z + (turned ? best.w : best.d) / 2,
        },
        FURNITURE_CLEAR_M,
      ),
    );
  }
  return pieces;
}
