import { describe, expect, it } from 'vitest';
import { FIELD_COUNT, RoadFlow, RoadTier } from '../shared/types';
import { Movement, withArmAllowed } from '../shared/approach';
import type { GridState, TilePoint } from '../shared/types';
import { applyRoad, RoadNetwork } from './roads';

function makeGrid(size: number): GridState {
  const n = size * size;
  return {
    size,
    height: new Float32Array(n),
    water: new Uint8Array(n),
    trees: new Uint8Array(n),
    zone: new Uint8Array(n),
    roadTier: new Uint8Array(n),
    roadMask: new Uint8Array(n),
    buildingId: new Uint32Array(n),
    power: new Uint8Array(n),
    watered: new Uint8Array(n),
    fields: Array.from({ length: FIELD_COUNT }, () => new Uint8Array(n)),
    district: new Uint8Array(n),
    landfill: new Uint8Array(n),
    roadElevation: new Float32Array(n),
    roadProfile: new Uint16Array(n),
    roadFlow: new Uint8Array(n),
    junctionControl: new Uint8Array(n),
    junctionTurns: new Uint16Array(n),
  };
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
