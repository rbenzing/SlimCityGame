/**
 * A suburban lot laid out to its parking code: where the body stands, its
 * stall rows in ULI modules off one drive from the curb cut, the accessible
 * spaces nearest the entrance, the loading berths at the side and rear, and
 * the planted islands and their trees. Pure and deterministic: the same lot
 * always lays out the same way.
 *
 * Everything is in the lot's frontage frame: `u` runs along the street edge
 * from 0 to `along`, `v` runs into the lot from the street (0) to `depth`.
 * The body keeps its size; only where it stands on the lot changes.
 */
import {
  ACCESSIBLE_AISLE_M,
  ACCESSIBLE_CAR_WIDTH_M,
  ACCESSIBLE_VAN_WIDTH_M,
  adaAccessibleSpaces,
  adaVanSpaces,
  AISLE_WIDTH_M,
  BERTH_LENGTH_M,
  BERTH_WIDTH_M,
  CURB_CUT_M,
  ISLAND_WIDTH_M,
  SPACES_BETWEEN_ISLANDS,
  STALL_LENGTH_M,
  STALL_WIDTH_M,
  treesFor,
} from './parkingcode';

export interface LotRect {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
}

export interface LotPoint {
  u: number;
  v: number;
}

/** Which way a parked car's nose points, along the frame's axes. */
export type StallNose = 'u+' | 'u-' | 'v+' | 'v-';

export interface LotStall {
  /** The painted space, not counting an accessible space's access aisle. */
  rect: LotRect;
  nose: StallNose;
  accessible: 'car' | 'van' | null;
}

export interface LotLayoutInput {
  /** The lot along the street, metres. */
  along: number;
  /** The lot into the block from the street, metres. */
  depth: number;
  bodyAlong: number;
  bodyDepth: number;
  /** Spaces the code asks for. */
  spaces: number;
  /** Loading berths the code asks for. */
  berths: number;
  /** Ground the body keeps clear in front of itself across its own width: a filling station's forecourt. */
  forecourtDepth?: number;
  /** Ground the body keeps behind itself: a plant's tank farm. */
  rearYard?: number;
}

export interface LotLayout {
  /** The lot itself: u from 0 to `along`, v from 0 to `depth`. */
  lot: LotRect;
  body: LotRect;
  forecourt: LotRect | null;
  /** Where people go in: the middle of the body's street face. */
  entrance: LotPoint;
  stalls: LotStall[];
  /** The hatched access aisle beside each accessible space. */
  accessAisles: LotRect[];
  /** The drive from the curb cut and every aisle that serves a drawn stall or berth. */
  aisles: LotRect[];
  berths: LotRect[];
  islands: LotRect[];
  trees: LotPoint[];
  curbCut: { u0: number; u1: number };
  required: number;
  provided: number;
  /** The most spaces this lot could hold, laid out the way it is. */
  capacity: number;
  accessible: number;
  vans: number;
  berthsRequired: number;
  fits: boolean;
  shortfall: number;
}

/** Measurements to the centimetre: a module that misses by a millimetre still fits. */
const EPS = 0.01;

// ---------------------------------------------------------------------------
// The engine works in (p, q): p along a stall row, q across the rows. Rows
// along the street are p = u; rows into the lot are p = v.
// ---------------------------------------------------------------------------

type RowsAlong = 'u' | 'v';

interface PQ {
  p0: number;
  p1: number;
  q0: number;
  q1: number;
}

function toUV(o: RowsAlong, r: PQ): LotRect {
  return o === 'u'
    ? { u0: r.p0, u1: r.p1, v0: r.q0, v1: r.q1 }
    : { u0: r.q0, u1: r.q1, v0: r.p0, v1: r.p1 };
}

function toPQ(o: RowsAlong, r: LotRect): PQ {
  return o === 'u'
    ? { p0: r.u0, p1: r.u1, q0: r.v0, q1: r.v1 }
    : { p0: r.v0, p1: r.v1, q0: r.u0, q1: r.u1 };
}

type Dir = 'p+' | 'p-' | 'q+' | 'q-';

function noseOf(o: RowsAlong, dir: Dir): StallNose {
  const axis = dir[0] === 'p' ? (o === 'u' ? 'u' : 'v') : o === 'u' ? 'v' : 'u';
  return `${axis}${dir[1]}` as StallNose;
}

const overlaps = (a: PQ, b: PQ): boolean =>
  a.p0 < b.p1 - EPS && b.p0 < a.p1 - EPS && a.q0 < b.q1 - EPS && b.q0 < a.q1 - EPS;

const rectsOverlap = (a: LotRect, b: LotRect): boolean =>
  a.u0 < b.u1 - EPS && b.u0 < a.u1 - EPS && a.v0 < b.v1 - EPS && b.v0 < a.v1 - EPS;

/** A straight run of stalls: along `axis` from a0 to a1, in a band of the other axis. */
interface Run {
  axis: 'p' | 'q';
  a0: number;
  a1: number;
  b0: number;
  b1: number;
  nose: Dir;
  aisle: PQ;
}

function runBand(run: Run, a0: number, a1: number): PQ {
  return run.axis === 'p'
    ? { p0: a0, p1: a1, q0: run.b0, q1: run.b1 }
    : { p0: run.b0, p1: run.b1, q0: a0, q1: a1 };
}

/** One slot as laid: a space (with an access aisle after it, for an accessible one) or an island. */
interface Laid {
  kind: 'stall' | 'car' | 'van' | 'island';
  from: number;
  to: number;
  /** An accessible space's access aisle, beyond the space. */
  aisleFrom?: number;
  aisleTo?: number;
}

const widthOf = (kind: 'stall' | 'car' | 'van'): number =>
  kind === 'stall'
    ? STALL_WIDTH_M
    : (kind === 'car' ? ACCESSIBLE_CAR_WIDTH_M : ACCESSIBLE_VAN_WIDTH_M) + ACCESSIBLE_AISLE_M;

/**
 * Lays a run from one end: an island, then spaces with an island after every
 * ten, and an island to close it. The accessible spaces come first. Stops at
 * `max` spaces or when the next space and its closing island no longer fit.
 */
function layRun(length: number, accessible: readonly ('car' | 'van')[], max: number): Laid[] {
  const laid: Laid[] = [];
  if (length < ISLAND_WIDTH_M * 2 + STALL_WIDTH_M - EPS || max <= 0) return laid;
  laid.push({ kind: 'island', from: 0, to: ISLAND_WIDTH_M });
  let at = ISLAND_WIDTH_M;
  let spaces = 0;
  let sinceIsland = 0;
  while (spaces < max) {
    const kind = spaces < accessible.length ? accessible[spaces]! : 'stall';
    const w = widthOf(kind);
    const islandBefore = sinceIsland === SPACES_BETWEEN_ISLANDS ? ISLAND_WIDTH_M : 0;
    if (at + islandBefore + w + ISLAND_WIDTH_M > length + EPS) break;
    if (islandBefore > 0) {
      laid.push({ kind: 'island', from: at, to: at + islandBefore });
      at += islandBefore;
      sinceIsland = 0;
    }
    if (kind === 'stall') {
      laid.push({ kind, from: at, to: at + w });
    } else {
      const space = w - ACCESSIBLE_AISLE_M;
      laid.push({ kind, from: at, to: at + space, aisleFrom: at + space, aisleTo: at + w });
    }
    at += w;
    spaces += 1;
    sinceIsland += 1;
  }
  if (spaces === 0) return [];
  laid.push({ kind: 'island', from: at, to: at + ISLAND_WIDTH_M });
  return laid;
}

const spacesIn = (laid: readonly Laid[]): number => laid.filter((l) => l.kind !== 'island').length;

/** Lays these spaces in order from 0: an island, an island after every ten, and one to close. */
function laySequence(kinds: readonly ('stall' | 'car' | 'van')[]): {
  laid: Laid[];
  length: number;
} {
  const laid: Laid[] = [{ kind: 'island', from: 0, to: ISLAND_WIDTH_M }];
  let at = ISLAND_WIDTH_M;
  kinds.forEach((kind, i) => {
    if (i > 0 && i % SPACES_BETWEEN_ISLANDS === 0) {
      laid.push({ kind: 'island', from: at, to: at + ISLAND_WIDTH_M });
      at += ISLAND_WIDTH_M;
    }
    const w = widthOf(kind);
    if (kind === 'stall') {
      laid.push({ kind, from: at, to: at + w });
    } else {
      const space = w - ACCESSIBLE_AISLE_M;
      laid.push({ kind, from: at, to: at + space, aisleFrom: at + space, aisleTo: at + w });
    }
    at += w;
  });
  laid.push({ kind: 'island', from: at, to: at + ISLAND_WIDTH_M });
  return { laid, length: at + ISLAND_WIDTH_M };
}

/**
 * Lays as many of `max` spaces as the run holds, as a block centred on the
 * door's place along the run (held inside it), with the accessible spaces
 * where they come nearest the door. Offsets are from the run's start.
 */
function placeRun(
  length: number,
  accessible: readonly ('car' | 'van')[],
  max: number,
  door: number,
): Laid[] {
  const n = spacesIn(layRun(length, accessible, max));
  if (n === 0) return [];
  const mine = accessible.slice(0, n);
  const regular = n - mine.length;
  let best: { laid: Laid[]; score: number } | null = null;
  for (let k = 0; k <= regular; k++) {
    const kinds = [
      ...Array<'stall'>(k).fill('stall'),
      ...mine,
      ...Array<'stall'>(regular - k).fill('stall'),
    ];
    const { laid, length: block } = laySequence(kinds);
    const shift = Math.max(0, Math.min(door - block / 2, length - block));
    const group = laid.filter((l) => l.kind === 'car' || l.kind === 'van');
    const last = group[group.length - 1];
    const score =
      group.length > 0 && last
        ? Math.abs(shift + (group[0]!.from + (last.aisleTo ?? last.to)) / 2 - door)
        : 0;
    if (!best || score < best.score - EPS) {
      best = {
        laid: laid.map((l) => ({
          ...l,
          from: l.from + shift,
          to: l.to + shift,
          ...(l.aisleFrom !== undefined && l.aisleTo !== undefined
            ? { aisleFrom: l.aisleFrom + shift, aisleTo: l.aisleTo + shift }
            : {}),
        })),
        score,
      };
    }
    if (group.length === 0) break;
  }
  return best!.laid;
}

interface Candidate {
  rowsAlong: RowsAlong;
  outerRow: boolean;
  body: LotRect;
}

interface Built {
  runs: Run[];
  berths: LotRect[];
  berthsOk: boolean;
  forecourt: LotRect | null;
  curbCut: { u0: number; u1: number };
  connector: PQ;
}

/** The runs, berths and drive a candidate yields, before any stall is chosen. */
function build(input: LotLayoutInput, c: Candidate): Built {
  const o = c.rowsAlong;
  const L = STALL_LENGTH_M;
  const P = o === 'u' ? input.along : input.depth;
  const Q = o === 'u' ? input.depth : input.along;
  const forecourt =
    input.forecourtDepth !== undefined
      ? { u0: c.body.u0, u1: c.body.u1, v0: 0, v1: c.body.v0 }
      : null;
  const pStart = c.outerRow ? L + AISLE_WIDTH_M : AISLE_WIDTH_M;
  const connP0 = c.outerRow ? L : 0;
  const curbAt = o === 'u' ? connP0 : L;
  const curbCut = { u0: curbAt, u1: curbAt + CURB_CUT_M };

  // Berths stand at the rear of the lot along its low-u side, each 12 ft wide
  // and 50 ft long into the lot, beside the aisle a truck backs out into.
  const berthU0 = o === 'u' && !c.outerRow ? AISLE_WIDTH_M : L - BERTH_WIDTH_M;
  const berths: LotRect[] = [];
  const rearEnd = input.depth;
  for (let i = 0; i < input.berths; i++) {
    berths.push({
      u0: berthU0,
      u1: berthU0 + BERTH_WIDTH_M,
      v0: rearEnd - (i + 1) * BERTH_LENGTH_M,
      v1: rearEnd - i * BERTH_LENGTH_M,
    });
  }

  const fixed: LotRect[] = [c.body];
  if (forecourt) fixed.push(forecourt);
  if (input.rearYard) {
    fixed.push({ ...c.body, v0: c.body.v1, v1: Math.min(input.depth, c.body.v1 + input.rearYard) });
  }
  if (o === 'v' && c.outerRow) {
    fixed.push({ u0: curbCut.u0, u1: curbCut.u1, v0: 0, v1: L });
  }
  const obstacles = [...fixed, ...berths].map((r) => toPQ(o, r));
  const fixedPQ = fixed.map((r) => toPQ(o, r));

  // The drive runs across the rows from the street, until the body stops it.
  let connEnd = Q;
  const connBand: PQ = { p0: connP0, p1: connP0 + AISLE_WIDTH_M, q0: 0, q1: Q };
  for (const r of fixedPQ) if (overlaps(r, connBand)) connEnd = Math.min(connEnd, r.q0);
  const connector: PQ = { ...connBand, q1: connEnd };

  const runs: Run[] = [];
  const moduleAisles: PQ[] = [];
  /** An aisle off the drive, as far as the body or the forecourt lets it run; null where the drive never reaches it. */
  const aisleAt = (q0: number): PQ | null => {
    const q1 = q0 + AISLE_WIDTH_M;
    if (q1 > connEnd + EPS) return null;
    let end = P;
    const band: PQ = { p0: pStart, p1: P, q0, q1 };
    for (const r of fixedPQ) if (overlaps(r, band)) end = Math.min(end, r.p0);
    if (end - pStart <= EPS) return null;
    const aisle = { ...band, p1: end };
    moduleAisles.push(aisle);
    return aisle;
  };
  /** A row's free stretch along its aisle, up to whatever stands in it. */
  const pRun = (b0: number, b1: number, nose: Dir, aisle: PQ | null): void => {
    if (!aisle) return;
    let end = aisle.p1;
    const band: PQ = { p0: pStart, p1: P, q0: b0, q1: b1 };
    for (const r of obstacles) if (overlaps(r, band)) end = Math.min(end, r.p0);
    if (end - pStart > EPS) runs.push({ axis: 'p', a0: pStart, a1: end, b0, b1, nose, aisle });
  };

  if (c.outerRow) {
    // The row along the drive's outer side, split wherever something stands in it.
    const cuts = obstacles
      .filter((r) => r.p0 < L - EPS && r.p1 > EPS)
      .map((r) => [Math.max(0, r.q0), Math.min(connEnd, r.q1)] as const)
      .filter(([a, b]) => b > a)
      .sort((a, b) => a[0] - b[0]);
    let from = 0;
    for (const [a, b] of [...cuts, [connEnd, connEnd] as const]) {
      if (a - from > EPS) {
        runs.push({
          axis: 'q',
          a0: from,
          a1: Math.min(a, connEnd),
          b0: 0,
          b1: L,
          nose: 'p-',
          aisle: { ...connector, q0: from, q1: Math.min(a, connEnd) },
        });
      }
      from = Math.max(from, b);
    }
  }

  // ULI modules across the rest: row, aisle, row; a last row and aisle where a whole module will not go.
  let q = 0;
  while (q + 2 * L + AISLE_WIDTH_M <= Q + EPS) {
    const aisle = aisleAt(q + L);
    pRun(q, q + L, 'q-', aisle);
    pRun(q + L + AISLE_WIDTH_M, q + 2 * L + AISLE_WIDTH_M, 'q+', aisle);
    q += 2 * L + AISLE_WIDTH_M;
  }
  if (q + L + AISLE_WIDTH_M <= Q + EPS) pRun(q, q + L, 'q-', aisleAt(q + L));

  // Every berth must stand clear of the body and be reached from an aisle.
  const reach: PQ[] = [connector, ...moduleAisles];
  const berthsOk = berths.every((b) => {
    if (b.v0 < -EPS || b.u0 < -EPS) return false;
    if (fixed.some((f) => rectsOverlap(f, b))) return false;
    const pq = toPQ(o, b);
    return reach.some((a) => touchesAlong(a, pq));
  });

  return { runs, berths, berthsOk, forecourt, curbCut, connector };
}

/** Whether a berth lies side by side with an aisle along the whole of the berth's length. */
function touchesAlong(aisle: PQ, berth: PQ): boolean {
  const besideP = Math.abs(aisle.p0 - berth.p1) < EPS || Math.abs(aisle.p1 - berth.p0) < EPS;
  const besideQ = Math.abs(aisle.q0 - berth.q1) < EPS || Math.abs(aisle.q1 - berth.q0) < EPS;
  if (besideP) return aisle.q0 <= berth.q0 + EPS && aisle.q1 >= berth.q1 - EPS;
  if (besideQ) return aisle.p0 <= berth.p0 + EPS && aisle.p1 >= berth.p1 - EPS;
  return false;
}

const distanceTo = (pt: LotPoint, r: LotRect): number => {
  const du = Math.max(r.u0 - pt.u, 0, pt.u - r.u1);
  const dv = Math.max(r.v0 - pt.v, 0, pt.v - r.v1);
  return Math.hypot(du, dv);
};

interface Filled {
  stalls: LotStall[];
  accessAisles: LotRect[];
  islands: LotRect[];
  aisles: LotRect[];
  capacity: number;
  provided: number;
  accessible: number;
  vans: number;
}

/** The accessible spaces in the order they are laid: cars, then vans. */
function accessibleKinds(total: number): ('car' | 'van')[] {
  const vans = adaVanSpaces(total);
  return [...Array<'car'>(total - vans).fill('car'), ...Array<'van'>(vans).fill('van')];
}

/**
 * Chooses the stalls: the runs nearest the entrance first, each laid from
 * its end nearest the entrance, the accessible spaces first of all. The
 * accessible count follows the spaces provided, so it is settled by trying.
 */
function fill(o: RowsAlong, built: Built, entrance: LotPoint, required: number): Filled {
  const sorted = built.runs
    .map((run, i) => {
      const band = toUV(o, runBand(run, run.a0, run.a1));
      return { run, i, d: distanceTo(entrance, band) };
    })
    .sort((a, b) => a.d - b.d || a.i - b.i)
    .map((r) => r.run);
  return fillRuns(o, built, entrance, required, sorted);
}

function fillRuns(
  o: RowsAlong,
  built: Built,
  entrance: LotPoint,
  required: number,
  runs: readonly Run[],
): Filled {
  const lengthOf = (run: Run): number => run.a1 - run.a0;
  const plan = (accessible: number): { counts: number[]; perRun: ('car' | 'van')[][] } => {
    const kinds = accessibleKinds(accessible);
    const perRun: ('car' | 'van')[][] = [];
    const counts: number[] = [];
    let next = 0;
    for (const run of runs) {
      const length = lengthOf(run);
      let mine: ('car' | 'van')[] = [];
      // As many of the remaining accessible spaces as this run will hold.
      for (let take = kinds.length - next; take > 0; take--) {
        const trial = kinds.slice(next, next + take);
        if (spacesIn(layRun(length, trial, take)) === take) {
          mine = trial;
          break;
        }
      }
      next += mine.length;
      perRun.push(mine);
      counts.push(spacesIn(layRun(length, mine, Infinity)));
    }
    return { counts, perRun };
  };

  let accessible = adaAccessibleSpaces(required);
  let layoutPlan = plan(accessible);
  for (let i = 0; i < 6; i++) {
    const capacity = layoutPlan.counts.reduce((a, b) => a + b, 0);
    const provided = Math.min(capacity, required);
    const want = adaAccessibleSpaces(provided);
    if (want === accessible) break;
    accessible = want;
    layoutPlan = plan(accessible);
  }
  const capacity = layoutPlan.counts.reduce((a, b) => a + b, 0);
  // Every lot's accessible spaces are on the lot: one that cannot lay them
  // provides fewer spaces, none at all if not even one accessible space fits.
  const planned = layoutPlan.perRun.reduce((sum, mine) => sum + mine.length, 0);
  let provided = Math.min(capacity, required);
  while (provided > 0 && adaAccessibleSpaces(provided) > Math.min(planned, provided)) provided -= 1;

  const stalls: LotStall[] = [];
  const accessAisles: LotRect[] = [];
  const islands: LotRect[] = [];
  const aisles: LotRect[] = [];
  let remaining = provided;
  let farConnector = 0;
  const door = toPQ(o, { u0: entrance.u, u1: entrance.u, v0: entrance.v, v1: entrance.v });
  runs.forEach((run, r) => {
    if (remaining <= 0) return;
    const mine = layoutPlan.perRun[r]!;
    const take = Math.min(layoutPlan.counts[r]!, remaining);
    const doorAlong = (run.axis === 'p' ? door.p0 : door.q0) - run.a0;
    const laid = placeRun(lengthOf(run), mine.slice(0, take), take, doorAlong);
    const n = spacesIn(laid);
    if (n === 0) return;
    remaining -= n;
    const at = (from: number, to: number): [number, number] => [run.a0 + from, run.a0 + to];
    let reachTo = run.a0;
    for (const l of laid) {
      const [a0, a1] = at(l.from, l.to);
      reachTo = Math.max(reachTo, a1);
      const rect = toUV(o, runBand(run, a0, a1));
      if (l.kind === 'island') {
        islands.push(rect);
        continue;
      }
      stalls.push({
        rect,
        nose: noseOf(o, run.nose),
        accessible: l.kind === 'stall' ? null : l.kind,
      });
      if (l.aisleFrom !== undefined && l.aisleTo !== undefined) {
        const [x0, x1] = at(l.aisleFrom, l.aisleTo);
        accessAisles.push(toUV(o, runBand(run, x0, x1)));
      }
    }
    if (run.axis === 'p') {
      aisles.push(toUV(o, { ...run.aisle, p1: reachTo }));
      farConnector = Math.max(farConnector, run.aisle.q1);
    } else {
      farConnector = Math.max(farConnector, reachTo);
    }
  });
  const accessibleDrawn = stalls.filter((s) => s.accessible !== null).length;
  for (const b of built.berths) farConnector = Math.max(farConnector, toPQ(o, b).q1);
  if (farConnector > 0) {
    aisles.unshift(toUV(o, { ...built.connector, q1: Math.min(built.connector.q1, farConnector) }));
  }
  return {
    stalls,
    accessAisles,
    islands,
    aisles,
    capacity,
    provided,
    accessible: accessibleDrawn,
    vans: stalls.filter((s) => s.accessible === 'van').length,
  };
}

/** Where the body may stand across one axis: centred, held off the lot line by an island's width, or on it. */
function slides(body: number, low: number, high: number): number[] {
  const room = Math.max(0, high - low - body);
  const out = [low + room / 2, high - body - Math.min(ISLAND_WIDTH_M, room / 2), high - body];
  return out.filter((x, i) => out.findIndex((y) => Math.abs(y - x) < EPS) === i && x >= -EPS);
}

const ORDER: readonly { rowsAlong: RowsAlong; outerRow: boolean }[] = [
  { rowsAlong: 'u', outerRow: true },
  { rowsAlong: 'v', outerRow: true },
  { rowsAlong: 'u', outerRow: false },
  { rowsAlong: 'v', outerRow: false },
];

const cache = new Map<string, LotLayout>();
const CACHE_LIMIT = 512;

/**
 * Lays a lot out to code. The body stands where the least slide from the
 * lot's centre lets the lot meet its code; a lot that cannot holds as many
 * spaces as it will, and says how many it is short.
 */
export function layoutLot(input: LotLayoutInput): LotLayout {
  const key = JSON.stringify(input);
  const hit = cache.get(key);
  if (hit) return hit;
  const result = computeLotLayout(input);
  if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  cache.set(key, result);
  return result;
}

/** The layout itself, uncached; `layoutLot` is what callers use. */
export function computeLotLayout(input: LotLayoutInput): LotLayout {
  const { along, depth, bodyAlong, bodyDepth } = input;
  const rear = input.rearYard ?? 0;
  const front = input.forecourtDepth ?? 0;
  const centreU = (along - bodyAlong) / 2;
  const centreV = (depth - bodyDepth) / 2;
  const us = slides(bodyAlong, 0, along);
  const vs = slides(bodyDepth, front, depth - rear);

  const candidates: { c: Candidate; cost: number; order: number }[] = [];
  for (const u0 of us) {
    for (const v0 of vs) {
      const body = { u0, u1: u0 + bodyAlong, v0, v1: v0 + bodyDepth };
      ORDER.forEach((o, order) => {
        candidates.push({
          c: { ...o, body },
          cost: Math.abs(u0 - centreU) + Math.abs(v0 - centreV),
          order,
        });
      });
    }
  }
  candidates.sort((a, b) => a.cost - b.cost || a.order - b.order);

  let best: {
    c: Candidate;
    built: Built;
    filled: Filled;
    fits: boolean;
    loads?: boolean;
  } | null = null;
  // A short lot keeps its berths where it can, but never at the cost of
  // every space it could have drawn: it is also tried without them.
  const tries = input.berths > 0 ? [input, { ...input, berths: 0 }] : [input];
  for (const { c } of candidates) {
    for (const trial of tries) {
      const built = build(trial, c);
      const entrance = { u: (c.body.u0 + c.body.u1) / 2, v: c.body.v0 };
      const filled = fill(c.rowsAlong, built, entrance, input.spaces);
      const fits = trial === input && built.berthsOk && filled.provided >= input.spaces;
      if (fits) {
        best = { c, built, filled, fits };
        break;
      }
      const loads = trial === input && built.berthsOk && filled.provided > 0;
      const better =
        !best ||
        (loads && !best.loads) ||
        (loads === best.loads && filled.provided > best.filled.provided);
      if (better) best = { c, built, filled, fits, loads };
    }
    if (best?.fits) break;
  }
  const { c, built, filled, fits } = best!;
  return {
    lot: { u0: 0, u1: along, v0: 0, v1: depth },
    body: c.body,
    forecourt: built.forecourt,
    entrance: { u: (c.body.u0 + c.body.u1) / 2, v: c.body.v0 },
    stalls: filled.stalls,
    accessAisles: filled.accessAisles,
    aisles: filled.aisles,
    berths: built.berthsOk ? built.berths : [],
    islands: filled.islands,
    trees: treePoints(filled.islands, treesFor(filled.provided)),
    curbCut: built.curbCut,
    required: input.spaces,
    provided: filled.provided,
    capacity: filled.capacity,
    accessible: filled.accessible,
    vans: filled.vans,
    berthsRequired: input.berths,
    fits,
    shortfall: Math.max(0, input.spaces - filled.provided),
  };
}

/** One tree in each of `count` islands, spread evenly over the islands in the order they were laid. */
function treePoints(islands: readonly LotRect[], count: number): LotPoint[] {
  const n = Math.min(count, islands.length);
  const out: LotPoint[] = [];
  for (let i = 0; i < n; i++) {
    const island = islands[Math.floor(((i + 0.5) * islands.length) / n)]!;
    out.push({ u: (island.u0 + island.u1) / 2, v: (island.v0 + island.v1) / 2 });
  }
  return out;
}
