import { describe, expect, it } from 'vitest';
import { RoadFlow, RoadTier } from '../shared/types';
import { Movement, withArmAllowed } from '../shared/approach';
import type { GraphEdge, GridState, TilePoint } from '../shared/types';
import { applyRoad, RoadNetwork } from './roads';
import { approachSaturation, armsAt, capacityForTier, junctionDelay } from './pathfind';
import { MERGE_BASE_S, mergeDelaySeconds } from '../shared/junction';
import { presetProfileForTier, withTurnPocket } from '../shared/roadprofile';
import { createGrid } from './grid';

function makeGrid(size: number): GridState {
  return createGrid(size);
}

const row = (z: number, from: number, to: number): TilePoint[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ x: from + i, z }));
const column = (x: number, from: number, to: number): TilePoint[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ({ x, z: from + i }));

/** A crossroads of `across` running east-west through the middle of `down`. */
function crossroads(across: RoadTier, down: RoadTier, size = 13): RoadNetwork {
  const g = makeGrid(size);
  const mid = Math.floor(size / 2);
  applyRoad(g, row(mid, 0, size - 1), across);
  applyRoad(g, column(mid, 0, size - 1), down);
  const net = new RoadNetwork();
  net.rebuild(g);
  return net;
}

/** The control at the middle of the map, where the two roads cross. */
function controlAtCentre(net: RoadNetwork, size = 13): string | undefined {
  const mid = Math.floor(size / 2);
  return net.getNodes().find((n) => n.x === mid && n.z === mid)?.control;
}

describe('a junction works out who gives way from the roads that meet there', () => {
  it('two two-lane streets cross with nothing, as a quiet grid does', () => {
    expect(controlAtCentre(crossroads(RoadTier.TwoLane, RoadTier.TwoLane))).toBe('none');
  });

  it('a two-lane street running onto a four-lane one stops', () => {
    expect(controlAtCentre(crossroads(RoadTier.FourLane, RoadTier.TwoLane))).toBe('stop');
  });

  it('an avenue signalises every junction it touches', () => {
    expect(controlAtCentre(crossroads(RoadTier.Avenue, RoadTier.TwoLane))).toBe('signal');
  });

  it('two four-lane streets have no minor road, so every arm stops', () => {
    expect(controlAtCentre(crossroads(RoadTier.FourLane, RoadTier.FourLane))).toBe('allWayStop');
  });

  it('a gravel track crossing a gravel track is left alone', () => {
    expect(controlAtCentre(crossroads(RoadTier.Gravel, RoadTier.Gravel))).toBe('none');
  });

  it('nothing that touches a motorway takes a control', () => {
    expect(controlAtCentre(crossroads(RoadTier.Highway, RoadTier.Highway))).toBe('none');
  });

  it('the end of a road is not a junction', () => {
    const size = 11;
    const g = makeGrid(size);
    applyRoad(g, row(5, 2, 8), RoadTier.TwoLane);
    const net = new RoadNetwork();
    net.rebuild(g);
    expect(net.getNodes().every((n) => n.control === 'none')).toBe(true);
  });
});

describe('a control has teeth', () => {
  const size = 13;
  const mid = 6;

  /** Two ways across the same grid: a plain street, and one crossing a bigger road. */
  function withCrossing(crossTier: RoadTier): RoadNetwork {
    const g = makeGrid(size);
    applyRoad(g, row(mid, 0, size - 1), RoadTier.TwoLane);
    applyRoad(g, column(mid, 0, size - 1), crossTier);
    const net = new RoadNetwork();
    net.rebuild(g);
    return net;
  }

  it('crossing a signalised avenue costs a driver more than crossing a quiet street', () => {
    const quiet = withCrossing(RoadTier.TwoLane);
    const signalised = withCrossing(RoadTier.Avenue);
    const from = { x: 0, z: mid };
    const to = { x: size - 1, z: mid };
    const a = quiet.findPath(from, to);
    const b = signalised.findPath(from, to);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    // The same tiles, the same road, the same speed — the difference is the
    // seconds lost at the signal in the middle.
    expect(b!.points.length).toBe(a!.points.length);
    expect(b!.cost).toBeGreaterThan(a!.cost);
  });

  it('the road that runs through pays nothing at a minor road stop', () => {
    // A two-lane street crossing a four-lane one: the four-lane runs through.
    const g = makeGrid(size);
    applyRoad(g, row(mid, 0, size - 1), RoadTier.FourLane);
    applyRoad(g, column(mid, 0, size - 1), RoadTier.TwoLane);
    const net = new RoadNetwork();
    net.rebuild(g);
    expect(controlAtCentre(net, size)).toBe('stop');

    const along = net.findPath({ x: 0, z: mid }, { x: size - 1, z: mid });
    const across = net.findPath({ x: mid, z: 0 }, { x: mid, z: size - 1 });
    expect(along).not.toBeNull();
    expect(across).not.toBeNull();
    // Both runs are the same length in tiles; only the one that stops pays.
    expect(across!.points.length).toBe(along!.points.length);
    expect(across!.cost).toBeGreaterThan(along!.cost);
  });

  it('a quiet crossroads earns a give-way once it carries enough traffic', () => {
    const net = crossroads(RoadTier.TwoLane, RoadTier.TwoLane);
    expect(controlAtCentre(net)).toBe('none');

    // A two-lane run saturates at 600; a twentieth of that on each of the four
    // arms is a fifth of capacity between them, which is what a give-way asks
    // for. The control is worked out again when the volumes next settle.
    net.addVolume(
      net.getEdges().map((e) => e.id),
      30,
    );
    net.decayVolumes(1);
    expect(controlAtCentre(net)).toBe('yield');

    // And it goes away again when the traffic does.
    net.decayVolumes(0);
    expect(controlAtCentre(net)).toBe('none');
  });

  it('the give-way it earned is what a driver then pays for', () => {
    const busy = crossroads(RoadTier.TwoLane, RoadTier.TwoLane);
    const quiet = crossroads(RoadTier.TwoLane, RoadTier.TwoLane);
    busy.addVolume(
      busy.getEdges().map((e) => e.id),
      30,
    );
    busy.decayVolumes(1);
    // Take the volume back off, so the only thing left is the control it won.
    for (const e of busy.getEdges()) e.volume = 0;
    expect(controlAtCentre(busy)).toBe('yield');

    const from = { x: 0, z: mid };
    const to = { x: size - 1, z: mid };
    expect(busy.findPath(from, to)!.cost).toBeGreaterThan(quiet.findPath(from, to)!.cost);
  });
});

describe('a banned turn is not a path', () => {
  const size = 13;
  const mid = 6;

  /** A crossroads of two-lane streets, with the middle reachable four ways. */
  function grid(): GridState {
    const g = makeGrid(size);
    applyRoad(g, row(mid, 0, size - 1), RoadTier.TwoLane);
    applyRoad(g, column(mid, 0, size - 1), RoadTier.TwoLane);
    return g;
  }

  it('routes a left turn until the left turn is taken away', () => {
    const g = grid();
    const net = new RoadNetwork();
    net.rebuild(g);
    // Arriving from the west heading east, turning north is a left.
    const from = { x: 0, z: mid };
    const to = { x: mid, z: 0 };
    expect(net.findPath(from, to)).not.toBeNull();

    // Ban the left from the arm lying to the WEST of the junction.
    g.junctionTurns[mid * size + mid] = withArmAllowed(
      0,
      RoadFlow.West,
      Movement.Through | Movement.Right,
    );
    const banned = new RoadNetwork();
    banned.rebuild(g);
    // The only way there was through that junction, so there is now no way.
    expect(banned.findPath(from, to)).toBeNull();
    // And the movements that are still allowed still route.
    expect(banned.findPath(from, { x: size - 1, z: mid })).not.toBeNull();
    expect(banned.findPath(from, { x: mid, z: size - 1 })).not.toBeNull();
  });

  it('leaves the other arms alone when one is restricted', () => {
    const g = grid();
    g.junctionTurns[mid * size + mid] = withArmAllowed(0, RoadFlow.West, Movement.Through);
    const net = new RoadNetwork();
    net.rebuild(g);
    // From the east, every turn is still open.
    expect(net.findPath({ x: size - 1, z: mid }, { x: mid, z: 0 })).not.toBeNull();
    expect(net.findPath({ x: size - 1, z: mid }, { x: mid, z: size - 1 })).not.toBeNull();
  });

  it('never doubles back at a junction, since a U-turn is not offered', () => {
    const g = grid();
    const net = new RoadNetwork();
    net.rebuild(g);
    const path = net.findPath({ x: 0, z: mid }, { x: size - 1, z: mid });
    expect(path).not.toBeNull();
    // No edge is walked twice, which is what a U-turn at the middle would do.
    expect(new Set(path!.edges).size).toBe(path!.edges.length);
  });
});

describe('a turn pocket is a lane the approach has at the junction and nowhere else', () => {
  const SIZE = 13;
  const MID = Math.floor(SIZE / 2);

  /**
   * The delay off the south arm of a crossroads whose side road is `minor`,
   * for each way out of it. Driving on the right, a driver coming up from the
   * south turns LEFT to the west and right to the east.
   */
  function delaysFromTheSouth(
    across: RoadTier,
    minor: RoadTier,
  ): { left: number; through: number; right: number } {
    const net = crossroads(across, minor, SIZE);
    const edges = net.getEdges();
    const node = net.getNodes().find((n) => n.x === MID && n.z === MID)!;
    const byId = (id: number): GraphEdge | undefined => edges.find((e) => e.id === id);
    const arm = (dx: number, dz: number): GraphEdge =>
      edges.find(
        (e) =>
          node.edges.includes(e.id) && e.tiles.some((t) => t.x === MID + dx && t.z === MID + dz),
      )!;
    const from = arm(0, 1);
    return {
      left: junctionDelay(node, from, arm(-1, 0), byId),
      through: junctionDelay(node, from, arm(0, -1), byId),
      right: junctionDelay(node, from, arm(1, 0), byId),
    };
  }

  it('shortens the left turn it was built for, where the road can find the width', () => {
    // This used to contrast a street with verge to spare against one whose
    // width belonged to somebody else. On a tile that can afford it BOTH find
    // the room, which is what the bigger tile bought: a turn bay stopped being
    // something only a wide-verged street could have.
    const street = presetProfileForTier(RoadTier.TwoLane);
    const withBikes = presetProfileForTier(RoadTier.BikeLane);
    expect(withTurnPocket(street, 1)).not.toBeNull();
    expect(withTurnPocket(withBikes, 1)).not.toBeNull();
    // And the bay does its job: the turn it was built for is served, and the
    // bike lanes beside it were not taken to build it.
    const pocketed = delaysFromTheSouth(RoadTier.FourLane, RoadTier.TwoLane);
    expect(pocketed.left).toBeGreaterThan(0);
    expect(withTurnPocket(withBikes, 1)!.pieces.filter((p) => p.kind === 'bike')).toHaveLength(
      withBikes.pieces.filter((p) => p.kind === 'bike').length,
    );
  });

  it('serves the left turn better than the right, which stays on the kerbside lane', () => {
    const { left, right } = delaysFromTheSouth(RoadTier.FourLane, RoadTier.TwoLane);
    expect(left).toBeLessThan(right);
  });

  it('is only cut where the junction holds the traffic', () => {
    // Two plain streets crossing are uncontrolled, so nobody queues and there
    // is nothing for a pocket to take out of the way.
    const net = crossroads(RoadTier.TwoLane, RoadTier.TwoLane, SIZE);
    expect(net.getNodes().find((n) => n.x === MID && n.z === MID)?.control).toBe('none');
    const quiet = delaysFromTheSouth(RoadTier.TwoLane, RoadTier.TwoLane);
    expect(quiet).toEqual({ left: 0, through: 0, right: 0 });
  });

  it('reads the width off the run, so a road with none carries no pocket', () => {
    const net = crossroads(RoadTier.FourLane, RoadTier.TwoLane, SIZE);
    const node = net.getNodes().find((n) => n.x === MID && n.z === MID)!;
    const edges = net.getEdges();
    const arms = armsAt(node, (id) => edges.find((e) => e.id === id));
    // The four-lane road fills its tile; the two-lane street has verge to give.
    const canPocket = arms.map((a) => a.canPocket);
    expect(canPocket).toContain(true);
    expect(canPocket).toContain(false);
  });
});

describe('a lane drop is a bottleneck the traffic can feel', () => {
  const SIZE = 13;

  /** A four-lane road running north-south that becomes a two-lane street. */
  function narrowingRun(): RoadNetwork {
    const g = makeGrid(SIZE);
    applyRoad(g, column(6, 0, 6), RoadTier.FourLane);
    applyRoad(g, column(6, 7, SIZE - 1), RoadTier.TwoLane);
    const net = new RoadNetwork();
    net.rebuild(g);
    return net;
  }

  it('tells the wide run what it drops into, and only at the end that drops', () => {
    const edges = narrowingRun().getEdges();
    const wide = edges.find((e) => e.tier === RoadTier.FourLane)!;
    const narrow = edges.find((e) => e.tier === RoadTier.TwoLane)!;
    // The four-lane road learns the street's capacity at the end that meets it.
    const drop = wide.narrowsAtA ?? wide.narrowsAtB;
    expect(drop).toBe(capacityForTier(RoadTier.TwoLane));
    expect(wide.narrowsAtA === undefined || wide.narrowsAtB === undefined).toBe(true);
    // The street learns nothing: a road widening ahead never held anyone up.
    expect(narrow.narrowsAtA).toBeUndefined();
    expect(narrow.narrowsAtB).toBeUndefined();
  });

  it('queues the traffic heading into the drop, and not the traffic leaving it', () => {
    const net = narrowingRun();
    const wide = net.getEdges().find((e) => e.tier === RoadTier.FourLane)!;
    // Enough traffic to fill the street but not the four-lane road.
    wide.volume = capacityForTier(RoadTier.TwoLane);
    const into = wide.narrowsAtB !== undefined ? wide.a : wide.b;
    const away = into === wide.a ? wide.b : wide.a;
    expect(approachSaturation(wide, into)).toBe(1);
    expect(approachSaturation(wide, away)).toBeLessThan(1);
  });

  it('leaves a road that drops into nothing exactly as it was', () => {
    const g = makeGrid(SIZE);
    applyRoad(g, column(6, 0, SIZE - 1), RoadTier.FourLane);
    const net = new RoadNetwork();
    net.rebuild(g);
    const edge = net.getEdges()[0]!;
    edge.volume = capacityForTier(RoadTier.TwoLane);
    expect(edge.narrowsAtA).toBeUndefined();
    expect(approachSaturation(edge, edge.a)).toBeLessThan(1);
  });
});

describe('a slip road meets a motorway at a merge, not a junction', () => {
  const SIZE = 15;
  const MID = Math.floor(SIZE / 2);

  /** A motorway running east-west with a ramp coming up to it from the south. */
  function interchange(): RoadNetwork {
    const g = makeGrid(SIZE);
    applyRoad(g, row(MID, 0, SIZE - 1), RoadTier.Highway);
    applyRoad(g, column(MID, MID, SIZE - 1), RoadTier.Ramp);
    const net = new RoadNetwork();
    net.rebuild(g);
    return net;
  }

  /** Every way out of the merge node, for a driver arriving from the south. */
  function fromTheRamp(net: RoadNetwork): { east: number; west: number } {
    const edges = net.getEdges();
    const node = net.getNodes().find((n) => n.x === MID && n.z === MID)!;
    const byId = (id: number): GraphEdge | undefined => edges.find((e) => e.id === id);
    const arm = (dx: number, dz: number): GraphEdge =>
      edges.find(
        (e) =>
          node.edges.includes(e.id) && e.tiles.some((t) => t.x === MID + dx && t.z === MID + dz),
      )!;
    const ramp = arm(0, 1);
    return {
      east: junctionDelay(node, ramp, arm(1, 0), byId),
      west: junctionDelay(node, ramp, arm(-1, 0), byId),
    };
  }

  it('holds nobody: traffic is never stopped on a motorway', () => {
    expect(controlAtCentre(interchange(), SIZE)).toBe('none');
  });

  it('still costs the driver coming up it something — a merge is finding a gap', () => {
    const merge = fromTheRamp(interchange());
    expect(merge.east).toBeGreaterThan(0);
    expect(merge.west).toBeGreaterThan(0);
    // An empty motorway is the cheapest merge there is: the time to come up
    // the slip road and match the speed of what is already there.
    expect(merge.east).toBeCloseTo(MERGE_BASE_S, 6);
  });

  it('charges nothing to the traffic already on the motorway, or to one leaving it', () => {
    const net = interchange();
    const edges = net.getEdges();
    const node = net.getNodes().find((n) => n.x === MID && n.z === MID)!;
    const byId = (id: number): GraphEdge | undefined => edges.find((e) => e.id === id);
    const arm = (dx: number, dz: number): GraphEdge =>
      edges.find(
        (e) =>
          node.edges.includes(e.id) && e.tiles.some((t) => t.x === MID + dx && t.z === MID + dz),
      )!;
    // Running through: grade separation is exactly the thing that makes this free.
    expect(junctionDelay(node, arm(-1, 0), arm(1, 0), byId)).toBe(0);
    // Diverging off it is a decision, not a negotiation.
    expect(junctionDelay(node, arm(-1, 0), arm(0, 1), byId)).toBe(0);
  });

  it('gets dearer the fuller the motorway is, and steeply', () => {
    const empty = mergeDelaySeconds(0);
    const half = mergeDelaySeconds(0.5);
    const full = mergeDelaySeconds(1);
    expect(empty).toBeCloseTo(MERGE_BASE_S, 6);
    expect(half).toBeGreaterThan(empty);
    expect(full).toBeGreaterThan(half);
    // Gaps run out faster than capacity does: the second half of the motorway
    // filling up costs far more than the first half did.
    expect(full - half).toBeGreaterThan(half - empty);
  });
});
