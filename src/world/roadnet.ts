/**
 * The road network: nodes and segments, the one place a road is stored.
 *
 * Every road tile layer — tier, profile, flow, deck height, mask, and the
 * layers of a road passing over a crossing — is derived from the network by
 * `deriveRoadLayers`. The grid commands still plan on tiles, so after each one
 * `reconcileRoads` takes up what the plan laid, keeping the slot of every node
 * and segment that is still where it was, and the tiles are derived again.
 *
 * Only axis-aligned segments exist so far. A node sits on a tile centre and
 * carries the road on its own tile; a segment runs straight between two nodes
 * on one row or column and owns the tiles strictly between them.
 */

import { TILE_METERS } from '../shared/constants';
import { RoadTier } from '../shared/types';
import type { GridState } from '../shared/types';
import { deserializeGrid, savedRoadNetwork, serializeGrid } from './grid';
import { recomputeRoadMasks, roadKeyMask, roadStep } from './roads';
import type { RoadKey } from './roads';

/** Growable slot tables, structure-of-arrays like the rest of the world state. */
export interface RoadNetwork {
  /** Node slots in use, live or free: the high-water mark of the tables. */
  nodeSlots: number;
  nodeLive: Uint8Array;
  /** Tile centre, whole centimetres. */
  nodeX: Int32Array;
  nodeZ: Int32Array;
  /** Deck height above the ground, metres; 0 on the ground. */
  nodeHeight: Float32Array;
  nodeTier: Uint8Array;
  nodeProfile: Uint16Array;
  nodeFlow: Uint8Array;

  segSlots: number;
  segLive: Uint8Array;
  segA: Int32Array;
  segB: Int32Array;
  segTier: Uint8Array;
  segProfile: Uint16Array;
  segFlow: Uint8Array;
  /** Deck height at the first and last tile the segment owns, metres. */
  segH0: Float32Array;
  segH1: Float32Array;
  /** 1 where the centre line is a curve through the control point below. */
  segCurved: Uint8Array;
  segCX: Int32Array;
  segCZ: Int32Array;
}

const INITIAL_SLOTS = 64;
const CM_PER_M = 100;

export function createRoadNetwork(capacity = INITIAL_SLOTS): RoadNetwork {
  const cap = Math.max(1, capacity);
  return {
    nodeSlots: 0,
    nodeLive: new Uint8Array(cap),
    nodeX: new Int32Array(cap),
    nodeZ: new Int32Array(cap),
    nodeHeight: new Float32Array(cap),
    nodeTier: new Uint8Array(cap),
    nodeProfile: new Uint16Array(cap),
    nodeFlow: new Uint8Array(cap),
    segSlots: 0,
    segLive: new Uint8Array(cap),
    segA: new Int32Array(cap),
    segB: new Int32Array(cap),
    segTier: new Uint8Array(cap),
    segProfile: new Uint16Array(cap),
    segFlow: new Uint8Array(cap),
    segH0: new Float32Array(cap),
    segH1: new Float32Array(cap),
    segCurved: new Uint8Array(cap),
    segCX: new Int32Array(cap),
    segCZ: new Int32Array(cap),
  };
}

type Typed = Uint8Array | Uint16Array | Int32Array | Float32Array;

function grown<T extends Typed>(a: T, cap: number): T {
  if (a.length >= cap) return a;
  const next = new (a.constructor as new (n: number) => T)(Math.max(cap, a.length * 2));
  next.set(a);
  return next;
}

function ensureNodeCapacity(net: RoadNetwork, cap: number): void {
  net.nodeLive = grown(net.nodeLive, cap);
  net.nodeX = grown(net.nodeX, cap);
  net.nodeZ = grown(net.nodeZ, cap);
  net.nodeHeight = grown(net.nodeHeight, cap);
  net.nodeTier = grown(net.nodeTier, cap);
  net.nodeProfile = grown(net.nodeProfile, cap);
  net.nodeFlow = grown(net.nodeFlow, cap);
}

function ensureSegCapacity(net: RoadNetwork, cap: number): void {
  net.segLive = grown(net.segLive, cap);
  net.segA = grown(net.segA, cap);
  net.segB = grown(net.segB, cap);
  net.segTier = grown(net.segTier, cap);
  net.segProfile = grown(net.segProfile, cap);
  net.segFlow = grown(net.segFlow, cap);
  net.segH0 = grown(net.segH0, cap);
  net.segH1 = grown(net.segH1, cap);
  net.segCurved = grown(net.segCurved, cap);
  net.segCX = grown(net.segCX, cap);
  net.segCZ = grown(net.segCZ, cap);
}

/** The road on one grid position: what a node or a segment's tiles carry. */
interface RoadFacts {
  tier: number;
  profile: number;
  flow: number;
}

export interface NodeRecord extends RoadFacts {
  x: number;
  z: number;
  height: number;
}

export interface SegmentRecord extends RoadFacts {
  a: number;
  b: number;
  h0: number;
  h1: number;
}

function writeNode(net: RoadNetwork, slot: number, n: NodeRecord): void {
  ensureNodeCapacity(net, slot + 1);
  net.nodeLive[slot] = 1;
  net.nodeX[slot] = n.x;
  net.nodeZ[slot] = n.z;
  net.nodeHeight[slot] = n.height;
  net.nodeTier[slot] = n.tier;
  net.nodeProfile[slot] = n.profile;
  net.nodeFlow[slot] = n.flow;
  net.nodeSlots = Math.max(net.nodeSlots, slot + 1);
}

function writeSegment(net: RoadNetwork, slot: number, s: SegmentRecord): void {
  ensureSegCapacity(net, slot + 1);
  net.segLive[slot] = 1;
  net.segA[slot] = s.a;
  net.segB[slot] = s.b;
  net.segTier[slot] = s.tier;
  net.segProfile[slot] = s.profile;
  net.segFlow[slot] = s.flow;
  net.segH0[slot] = s.h0;
  net.segH1[slot] = s.h1;
  net.segCurved[slot] = 0;
  net.segCX[slot] = 0;
  net.segCZ[slot] = 0;
  net.segSlots = Math.max(net.segSlots, slot + 1);
}

/** Live node slots, in slot order. */
export function liveNodes(net: RoadNetwork): number[] {
  const out: number[] = [];
  for (let s = 0; s < net.nodeSlots; s++) if (net.nodeLive[s] === 1) out.push(s);
  return out;
}

/** Live segment slots, in slot order. */
export function liveSegments(net: RoadNetwork): number[] {
  const out: number[] = [];
  for (let s = 0; s < net.segSlots; s++) if (net.segLive[s] === 1) out.push(s);
  return out;
}

// ---------------------------------------------------------------------------
// Grid positions
// ---------------------------------------------------------------------------

/** A tile's centre along one axis, in whole centimetres. */
export const tileCentreCm = (t: number): number => (t * TILE_METERS + TILE_METERS / 2) * CM_PER_M;

/** The tile whose centre is at `cm` along one axis. */
const tileOfCm = (cm: number): number =>
  Math.round((cm / CM_PER_M - TILE_METERS / 2) / TILE_METERS);

/**
 * The deck height of the `j`th of `count` tiles a segment owns: an even grade
 * from `h0` to `h1`, rounded to the float the tile layer holds.
 */
export function segmentTileHeight(h0: number, h1: number, j: number, count: number): number {
  if (count <= 1 || h0 === h1) return h0;
  return Math.fround(h0 + ((h1 - h0) * j) / (count - 1));
}

// ---------------------------------------------------------------------------
// Deriving the tile layers
// ---------------------------------------------------------------------------

interface Claim extends RoadFacts {
  height: number;
}

/**
 * Rewrites every road tile layer of `g` from `net`: the road on each tile, the
 * road passing over a crossing (the higher of two decks), and the masks.
 * Returns a description of every tile the network could not say one thing
 * about — more than two roads, or two at one height — which is a bug in
 * whatever built the network, never a state to keep quietly.
 */
export function deriveRoadLayers(g: GridState, net: RoadNetwork): string[] {
  const size = g.size;
  const claims = new Map<number, Claim[]>();
  const claim = (x: number, z: number, c: Claim): void => {
    if (x < 0 || z < 0 || x >= size || z >= size) return;
    const idx = z * size + x;
    const list = claims.get(idx);
    if (list) list.push(c);
    else claims.set(idx, [c]);
  };

  for (let s = 0; s < net.nodeSlots; s++) {
    if (net.nodeLive[s] !== 1) continue;
    claim(tileOfCm(net.nodeX[s]!), tileOfCm(net.nodeZ[s]!), {
      tier: net.nodeTier[s]!,
      profile: net.nodeProfile[s]!,
      flow: net.nodeFlow[s]!,
      height: net.nodeHeight[s]!,
    });
  }
  for (let s = 0; s < net.segSlots; s++) {
    if (net.segLive[s] !== 1) continue;
    const a = net.segA[s]!;
    const b = net.segB[s]!;
    const ax = tileOfCm(net.nodeX[a]!);
    const az = tileOfCm(net.nodeZ[a]!);
    const bx = tileOfCm(net.nodeX[b]!);
    const bz = tileOfCm(net.nodeZ[b]!);
    const dx = Math.sign(bx - ax);
    const dz = Math.sign(bz - az);
    const count = Math.max(Math.abs(bx - ax), Math.abs(bz - az)) - 1;
    for (let j = 0; j < count; j++) {
      claim(ax + dx * (j + 1), az + dz * (j + 1), {
        tier: net.segTier[s]!,
        profile: net.segProfile[s]!,
        flow: net.segFlow[s]!,
        height: segmentTileHeight(net.segH0[s]!, net.segH1[s]!, j, count),
      });
    }
  }

  g.roadTier.fill(0);
  g.roadProfile.fill(0);
  g.roadFlow.fill(0);
  g.roadElevation.fill(0);
  g.roadMask.fill(0);
  g.overTier.fill(0);
  g.overProfile.fill(0);
  g.overFlow.fill(0);
  g.overElevation.fill(0);

  const problems: string[] = [];
  for (const [idx, list] of claims) {
    const x = idx % size;
    const z = (idx - x) / size;
    if (list.length > 2) {
      problems.push(`tile (${x}, ${z}) holds ${list.length} roads`);
      continue;
    }
    const [first, second] = list;
    let under = first!;
    let over = second;
    if (over !== undefined) {
      if (over.height === under.height) {
        problems.push(`tile (${x}, ${z}) holds two roads at one height`);
        continue;
      }
      if (over.height < under.height) [under, over] = [over, under];
    }
    g.roadTier[idx] = under.tier;
    g.roadProfile[idx] = under.profile;
    g.roadFlow[idx] = under.flow;
    g.roadElevation[idx] = under.height;
    if (over !== undefined) {
      g.overTier[idx] = over.tier;
      g.overProfile[idx] = over.profile;
      g.overFlow[idx] = over.flow;
      g.overElevation[idx] = over.height;
    }
  }
  recomputeRoadMasks(g);
  return problems;
}

// ---------------------------------------------------------------------------
// Converting the tile layers
// ---------------------------------------------------------------------------

/** The run directions a straight tile can take, as mask bits. */
const NORTH_SOUTH = 1 | 4;
const EAST_WEST = 2 | 8;

const STEPS: readonly { dx: number; dz: number; bit: number; back: number }[] = [
  { dx: 0, dz: -1, bit: 1, back: 4 },
  { dx: 1, dz: 0, bit: 2, back: 8 },
  { dx: 0, dz: 1, bit: 4, back: 1 },
  { dx: -1, dz: 0, bit: 8, back: 2 },
];

function factsOfKey(g: GridState, key: RoadKey): Claim {
  const n = g.size * g.size;
  if (key >= n) {
    const i = key - n;
    return {
      tier: g.overTier[i] ?? 0,
      profile: g.overProfile[i] ?? 0,
      flow: g.overFlow[i] ?? 0,
      height: g.overElevation[i] ?? 0,
    };
  }
  return {
    tier: g.roadTier[key] ?? 0,
    profile: g.roadProfile[key] ?? 0,
    flow: g.roadFlow[key] ?? 0,
    height: g.roadElevation[key] ?? 0,
  };
}

const sameRoad = (a: RoadFacts, b: RoadFacts): boolean =>
  a.tier === b.tier && a.profile === b.profile && a.flow === b.flow;

/** A network before slots are assigned: nodes by key, segments by node key. */
interface Canonical {
  nodes: Map<RoadKey, NodeRecord>;
  segments: { a: RoadKey; b: RoadKey; facts: SegmentRecord }[];
}

/**
 * The network the tile layers describe, with nodes named by their RoadKey.
 *
 * A node stands on every road that is not the body of a straight run: a
 * junction, a bend, a dead end, a road with a one-sided join, and any tile
 * where the tier, profile, flow or grade changes along a run. What remains is
 * straight runs of identical road climbing at an even grade, and each becomes
 * one segment.
 */
function canonicalFromGrid(g: GridState): Canonical {
  const n = g.size * g.size;
  const keys: RoadKey[] = [];
  for (let i = 0; i < n; i++) if ((g.roadTier[i] ?? 0) !== RoadTier.None) keys.push(i);
  for (let i = 0; i < n; i++) if ((g.overTier[i] ?? 0) !== RoadTier.None) keys.push(n + i);

  const masks = new Map<RoadKey, number>();
  for (const k of keys) masks.set(k, roadKeyMask(g, k));

  const stepOf = (key: RoadKey, bit: number): RoadKey | null => {
    const step = STEPS.find((s) => s.bit === bit)!;
    const next = roadStep(g, key, step.dx, step.dz);
    return next !== null && masks.has(next) ? next : null;
  };

  // The body of a straight run: two arms in line, each joined back.
  const isBody = (key: RoadKey): boolean => {
    const mask = masks.get(key)!;
    if (mask !== NORTH_SOUTH && mask !== EAST_WEST) return false;
    for (const s of STEPS) {
      if ((mask & s.bit) === 0) continue;
      const next = stepOf(key, s.bit);
      if (next === null || ((masks.get(next) ?? 0) & s.back) === 0) return false;
    }
    return true;
  };

  const nodeKeys = new Set<RoadKey>();
  for (const k of keys) if (!isBody(k)) nodeKeys.add(k);

  const out: Canonical = { nodes: new Map(), segments: [] };
  const recordOf = (key: RoadKey): NodeRecord => {
    const idx = key >= n ? key - n : key;
    const x = idx % g.size;
    const facts = factsOfKey(g, key);
    return {
      x: tileCentreCm(x),
      z: tileCentreCm((idx - x) / g.size),
      height: facts.height,
      tier: facts.tier,
      profile: facts.profile,
      flow: facts.flow,
    };
  };
  const addNode = (key: RoadKey): void => {
    nodeKeys.add(key);
    if (!out.nodes.has(key)) out.nodes.set(key, recordOf(key));
  };

  const visited = new Set<RoadKey>();
  const linked = new Set<string>();

  // A run with a body is walked once: its body is marked visited. Two nodes
  // side by side have no body to mark, and are found from both ends.
  const emit = (a: RoadKey, b: RoadKey, body: readonly RoadKey[]): void => {
    if (body.length === 0) {
      const pair = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (linked.has(pair)) return;
      linked.add(pair);
    }
    const facts = body.length > 0 ? factsOfKey(g, body[0]!) : factsOfKey(g, a);
    const last = body.length > 0 ? factsOfKey(g, body[body.length - 1]!) : facts;
    out.segments.push({
      a,
      b,
      facts: { a: -1, b: -1, ...facts, h0: facts.height, h1: last.height },
    });
  };

  // Whether a run body keeps reproducing exactly when `next` joins it.
  const evenGrade = (body: readonly RoadKey[], next: RoadKey): boolean => {
    const h0 = factsOfKey(g, body[0]!).height;
    const h1 = factsOfKey(g, next).height;
    const count = body.length + 1;
    for (let j = 0; j < body.length; j++) {
      if (segmentTileHeight(h0, h1, j, count) !== factsOfKey(g, body[j]!).height) return false;
    }
    return true;
  };

  const walkFrom = (start: RoadKey): void => {
    const mask = masks.get(start)!;
    for (const s of STEPS) {
      if ((mask & s.bit) === 0) continue;
      let next = stepOf(start, s.bit);
      if (next === null) continue;
      if (!nodeKeys.has(next) && visited.has(next)) continue;

      let from = start;
      let body: RoadKey[] = [];
      while (next !== null && !nodeKeys.has(next)) {
        visited.add(next);
        const here = factsOfKey(g, next);
        if (
          body.length === 0 ||
          (sameRoad(here, factsOfKey(g, body[0]!)) && evenGrade(body, next))
        ) {
          body.push(next);
        } else {
          addNode(next);
          emit(from, next, body);
          from = next;
          body = [];
        }
        next = stepOf(next, s.bit);
      }
      if (next !== null) {
        emit(from, next, body);
      } else if (body.length > 0) {
        // Cannot happen — a body tile is joined both ways — but a run that
        // stopped short would otherwise lose its body.
        const end = body.pop()!;
        addNode(end);
        emit(from, end, body);
      }
    }
  };

  for (const k of keys) if (nodeKeys.has(k)) addNode(k);
  for (const k of [...out.nodes.keys()]) walkFrom(k);
  // A body never reached from a node cannot happen on a grid — a straight run
  // cannot close on itself — but if it ever did, it would be lost; a node
  // there keeps it.
  for (const k of keys) {
    if (nodeKeys.has(k) || visited.has(k)) continue;
    addNode(k);
    walkFrom(k);
  }
  return out;
}

/** The network the tile layers of `g` describe, in fresh slots. */
export function networkFromGrid(g: GridState): RoadNetwork {
  return reconcileRoads(createRoadNetwork(), g);
}

/**
 * Brings `net` up to date with the tile layers of `g`, in place, and returns
 * it. A node still standing at the same place, on the same deck, keeps its
 * slot; so does a segment still between the same two nodes. Everything new
 * takes the lowest free slot.
 */
export function reconcileRoads(net: RoadNetwork, g: GridState): RoadNetwork {
  const canon = canonicalFromGrid(g);

  const nodeAt = new Map<string, number>();
  const placeKey = (x: number, z: number, height: number): string => `${x},${z},${height}`;
  for (let s = 0; s < net.nodeSlots; s++) {
    if (net.nodeLive[s] === 1)
      nodeAt.set(placeKey(net.nodeX[s]!, net.nodeZ[s]!, net.nodeHeight[s]!), s);
  }
  const oldSegments = new Map<string, number>();
  const pairKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`);
  for (let s = 0; s < net.segSlots; s++) {
    if (net.segLive[s] === 1) oldSegments.set(pairKey(net.segA[s]!, net.segB[s]!), s);
  }

  const slotOfKey = new Map<RoadKey, number>();
  const keptNodes = new Set<number>();
  const newNodes: [RoadKey, NodeRecord][] = [];
  for (const [key, rec] of canon.nodes) {
    const slot = nodeAt.get(placeKey(rec.x, rec.z, rec.height));
    if (slot !== undefined && !keptNodes.has(slot)) {
      keptNodes.add(slot);
      slotOfKey.set(key, slot);
      writeNode(net, slot, rec);
    } else {
      newNodes.push([key, rec]);
    }
  }
  for (let s = 0; s < net.nodeSlots; s++) if (!keptNodes.has(s)) net.nodeLive[s] = 0;
  let freeNode = 0;
  for (const [key, rec] of newNodes) {
    while (freeNode < net.nodeSlots && net.nodeLive[freeNode] === 1) freeNode++;
    writeNode(net, freeNode, rec);
    slotOfKey.set(key, freeNode);
  }

  const keptSegs = new Set<number>();
  const newSegs: SegmentRecord[] = [];
  for (const seg of canon.segments) {
    const rec = { ...seg.facts, a: slotOfKey.get(seg.a)!, b: slotOfKey.get(seg.b)! };
    const slot = oldSegments.get(pairKey(rec.a, rec.b));
    if (slot !== undefined && !keptSegs.has(slot)) {
      keptSegs.add(slot);
      writeSegment(net, slot, rec);
    } else {
      newSegs.push(rec);
    }
  }
  for (let s = 0; s < net.segSlots; s++) if (!keptSegs.has(s)) net.segLive[s] = 0;
  let freeSeg = 0;
  for (const rec of newSegs) {
    while (freeSeg < net.segSlots && net.segLive[freeSeg] === 1) freeSeg++;
    writeSegment(net, freeSeg, rec);
  }
  return net;
}

// ---------------------------------------------------------------------------
// Saving
// ---------------------------------------------------------------------------

const NODE_BYTES = 17; // live 1, x 4, z 4, height 4, tier 1, profile 2, flow 1
const SEG_BYTES = 30; // live 1, a 4, b 4, tier 1, profile 2, flow 1, h0 4, h1 4, curved 1, cx 4, cz 4
const COUNTS_BYTES = 8;

/** The network as bytes, every slot included so that slots survive a save. */
export function encodeRoadNetwork(net: RoadNetwork): Uint8Array {
  const buf = new ArrayBuffer(COUNTS_BYTES + net.nodeSlots * NODE_BYTES + net.segSlots * SEG_BYTES);
  const view = new DataView(buf);
  view.setUint32(0, net.nodeSlots, true);
  view.setUint32(4, net.segSlots, true);
  let o = COUNTS_BYTES;
  for (let s = 0; s < net.nodeSlots; s++) {
    view.setUint8(o, net.nodeLive[s]!);
    view.setInt32(o + 1, net.nodeX[s]!, true);
    view.setInt32(o + 5, net.nodeZ[s]!, true);
    view.setFloat32(o + 9, net.nodeHeight[s]!, true);
    view.setUint8(o + 13, net.nodeTier[s]!);
    view.setUint16(o + 14, net.nodeProfile[s]!, true);
    view.setUint8(o + 16, net.nodeFlow[s]!);
    o += NODE_BYTES;
  }
  for (let s = 0; s < net.segSlots; s++) {
    view.setUint8(o, net.segLive[s]!);
    view.setInt32(o + 1, net.segA[s]!, true);
    view.setInt32(o + 5, net.segB[s]!, true);
    view.setUint8(o + 9, net.segTier[s]!);
    view.setUint16(o + 10, net.segProfile[s]!, true);
    view.setUint8(o + 12, net.segFlow[s]!);
    view.setFloat32(o + 13, net.segH0[s]!, true);
    view.setFloat32(o + 17, net.segH1[s]!, true);
    view.setUint8(o + 21, net.segCurved[s]!);
    view.setInt32(o + 22, net.segCX[s]!, true);
    view.setInt32(o + 26, net.segCZ[s]!, true);
    o += SEG_BYTES;
  }
  return new Uint8Array(buf);
}

export function decodeRoadNetwork(bytes: Uint8Array): RoadNetwork {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < COUNTS_BYTES) throw new Error('decodeRoadNetwork: truncated counts');
  const nodeSlots = view.getUint32(0, true);
  const segSlots = view.getUint32(4, true);
  const expected = COUNTS_BYTES + nodeSlots * NODE_BYTES + segSlots * SEG_BYTES;
  if (bytes.byteLength !== expected) {
    throw new Error(`decodeRoadNetwork: ${bytes.byteLength} bytes, expected ${expected}`);
  }
  const net = createRoadNetwork(Math.max(nodeSlots, segSlots, INITIAL_SLOTS));
  net.nodeSlots = nodeSlots;
  net.segSlots = segSlots;
  let o = COUNTS_BYTES;
  for (let s = 0; s < nodeSlots; s++) {
    net.nodeLive[s] = view.getUint8(o);
    net.nodeX[s] = view.getInt32(o + 1, true);
    net.nodeZ[s] = view.getInt32(o + 5, true);
    net.nodeHeight[s] = view.getFloat32(o + 9, true);
    net.nodeTier[s] = view.getUint8(o + 13);
    net.nodeProfile[s] = view.getUint16(o + 14, true);
    net.nodeFlow[s] = view.getUint8(o + 16);
    o += NODE_BYTES;
  }
  for (let s = 0; s < segSlots; s++) {
    net.segLive[s] = view.getUint8(o);
    net.segA[s] = view.getInt32(o + 1, true);
    net.segB[s] = view.getInt32(o + 5, true);
    net.segTier[s] = view.getUint8(o + 9);
    net.segProfile[s] = view.getUint16(o + 10, true);
    net.segFlow[s] = view.getUint8(o + 12);
    net.segH0[s] = view.getFloat32(o + 13, true);
    net.segH1[s] = view.getFloat32(o + 17, true);
    net.segCurved[s] = view.getUint8(o + 21);
    net.segCX[s] = view.getInt32(o + 22, true);
    net.segCZ[s] = view.getInt32(o + 26, true);
    o += SEG_BYTES;
  }
  return net;
}

// ---------------------------------------------------------------------------
// Loading and saving a grid with its roads
// ---------------------------------------------------------------------------

/** The grid and its road network as one save buffer. */
export function saveGrid(g: GridState, net: RoadNetwork): ArrayBuffer {
  return serializeGrid(g, encodeRoadNetwork(net));
}

export interface LoadedGrid {
  grid: GridState;
  roads: RoadNetwork;
  /** Tiles the roads could not be derived onto; empty unless something is wrong. */
  problems: string[];
}

/**
 * A save buffer's grid with its road layers derived from its road network. A
 * save from before the network existed has its roads converted from its tile
 * layers, and the derived layers are checked against the ones it held.
 */
export function loadGrid(buf: ArrayBuffer): LoadedGrid {
  const grid = deserializeGrid(buf);
  const saved = savedRoadNetwork(buf);
  if (saved !== null) {
    const roads = decodeRoadNetwork(saved);
    return { grid, roads, problems: deriveRoadLayers(grid, roads) };
  }
  recomputeRoadMasks(grid);
  const roads = networkFromGrid(grid);
  return { grid, roads, problems: syncRoadLayers(grid, roads) };
}

const ROAD_LAYER_NAMES = [
  'roadTier',
  'roadProfile',
  'roadFlow',
  'roadElevation',
  'roadMask',
  'overTier',
  'overProfile',
  'overFlow',
  'overElevation',
] as const;

/**
 * Derives the road layers of `g` from `net` and reports every tile where they
 * come out different from what `g` held. What a tile without a road held in
 * its other road layers is not compared: nothing reads it, and the derived
 * layers clear it.
 */
export function syncRoadLayers(g: GridState, net: RoadNetwork): string[] {
  const before = ROAD_LAYER_NAMES.map((name) => g[name].slice());
  const problems = deriveRoadLayers(g, net);
  const n = g.size * g.size;
  for (let i = 0; i < n; i++) {
    const hadRoad = before[0]![i] !== 0 || before[5]![i] !== 0;
    const hasRoad = g.roadTier[i] !== 0 || g.overTier[i] !== 0;
    if (!hadRoad && !hasRoad) continue;
    const differs = ROAD_LAYER_NAMES.filter((name, l) => before[l]![i] !== g[name][i]);
    if (differs.length > 0) {
      const x = i % g.size;
      problems.push(`tile (${x}, ${(i - x) / g.size}) derived a different ${differs.join(', ')}`);
    }
  }
  return problems;
}
