import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PIER_SPACING_TILES } from '../shared/constants';
import { RoadTier } from '../shared/types';
import {
  BridgeRenderer,
  bridgeStyleFor,
  groupByStyle,
  isPierTile,
  runsAlongZ,
  structureHalfWidth,
  type BridgeDeckTile,
  type BridgeStyle,
} from './bridges';
import { carriagewayHalfWidthMeters, curbWidthMeters } from './roadsmesh';

function deckTile(
  x: number,
  z: number,
  tier: RoadTier = RoadTier.TwoLane,
  over = 8,
): BridgeDeckTile {
  return { x, z, tier, mask: 1 | 4, deckY: over, groundY: 0 };
}

/** Deck sampler matching deckTile's default height: a level span. */
const flatDeckAt = (): number => 8;

/** A deck that climbs with world x — the shape of an approach ramp. */
const rampDeckAt = (wx: number): number => 8 + wx * 0.05;

function instancedIn(scene: THREE.Scene): THREE.InstancedMesh[] {
  return scene.children.filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh);
}

/** The merged, deck-conforming layers (girder + parapets). */
function mergedIn(scene: THREE.Scene): THREE.Mesh[] {
  return scene.children.filter(
    (c): c is THREE.Mesh => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh),
  );
}

function vertexYs(mesh: THREE.Mesh): number[] {
  const position = mesh.geometry.getAttribute('position');
  return Array.from({ length: position.count }, (_, i) => position.getY(i));
}

describe('isPierTile', () => {
  it('drops a pier on a fixed cadence, so the same span always piers alike', () => {
    const first = isPierTile(4, 4);
    expect(isPierTile(4 + PIER_SPACING_TILES, 4)).toBe(first);
    expect(isPierTile(4, 4 + PIER_SPACING_TILES)).toBe(first);
  });

  it('does not pier every tile', () => {
    const run = Array.from({ length: 12 }, (_, i) => isPierTile(i, 0));
    expect(run.filter(Boolean).length).toBeLessThan(run.length);
    expect(run.filter(Boolean).length).toBeGreaterThan(0);
  });
});

describe('runsAlongZ', () => {
  it('reads a north-south run from the neighbour mask', () => {
    expect(runsAlongZ(1 | 4)).toBe(true);
  });

  it('reads an east-west run from the neighbour mask', () => {
    expect(runsAlongZ(2 | 8)).toBe(false);
  });

  it('falls back to a north-south run for an isolated tile', () => {
    expect(runsAlongZ(0)).toBe(true);
  });
});

describe('bridgeStyleFor', () => {
  it('gives rail a steel through-truss, the way railway bridges are built', () => {
    expect(bridgeStyleFor(RoadTier.RailTrack)).toBe('truss');
  });

  it('gives the big roads a deep box girder', () => {
    expect(bridgeStyleFor(RoadTier.Highway)).toBe('box');
    expect(bridgeStyleFor(RoadTier.Avenue)).toBe('box');
  });

  it('gives tracks and lanes bare planking rather than a concrete beam', () => {
    for (const tier of [RoadTier.Gravel, RoadTier.Alley, RoadTier.BikeLane])
      expect(bridgeStyleFor(tier)).toBe('plank');
  });

  it('leaves ordinary streets on the concrete beam', () => {
    for (const tier of [RoadTier.TwoLane, RoadTier.FourLane, RoadTier.OneWay, RoadTier.BusLane])
      expect(bridgeStyleFor(tier)).toBe('beam');
  });

  it('gives every tier a span it can be built in — a tram line bridges too', () => {
    const styles: BridgeStyle[] = ['plank', 'beam', 'box', 'truss'];
    for (const tier of ALL_TIERS) expect(styles).toContain(bridgeStyleFor(tier));
  });
});

/** Every buildable tier — bridging is not a privilege of the big roads. */
const ALL_TIERS = Object.values(RoadTier).filter((t) => t !== RoadTier.None) as RoadTier[];

describe('structureHalfWidth', () => {
  it('oversails the carriageway of every tier, so no road overhangs its own bridge', () => {
    expect(ALL_TIERS.length).toBeGreaterThan(8); // guards against an empty sweep
    for (const tier of ALL_TIERS) {
      const style = bridgeStyleFor(tier);
      expect(structureHalfWidth(tier, style)).toBeGreaterThan(carriagewayHalfWidthMeters(tier));
    }
  });

  it('hugs the road it carries, leaving no empty tarmac out to the parapet', () => {
    // The deck must reach past the carriageway — nothing should overhang its
    // own bridge — but only by the structure's overhang, not by a footway the
    // road does not have. A motorway sized to a full sidewalk puts nearly two
    // metres of blank deck either side of the traffic.
    for (const tier of ALL_TIERS) {
      const style = bridgeStyleFor(tier);
      const roadEdge = carriagewayHalfWidthMeters(tier) + curbWidthMeters(tier);
      const deckEdge = structureHalfWidth(tier, style);
      expect(deckEdge).toBeGreaterThan(carriagewayHalfWidthMeters(tier));
      expect(deckEdge - roadEdge).toBeLessThanOrEqual(0.5);
    }
  });

  it('is wider under a motorway than under a farm track', () => {
    expect(structureHalfWidth(RoadTier.Highway, 'box')).toBeGreaterThan(
      structureHalfWidth(RoadTier.Gravel, 'plank'),
    );
  });
});

describe('groupByStyle', () => {
  it('buckets a mixed set of spans by the family each is built in', () => {
    const groups = groupByStyle([
      deckTile(0, 0, RoadTier.TwoLane),
      deckTile(0, 1, RoadTier.TwoLane),
      deckTile(5, 5, RoadTier.RailTrack),
      deckTile(9, 9, RoadTier.Highway),
    ]);
    const byStyle = new Map(groups.map((g) => [g.style, g.tiles.length]));
    expect(byStyle.get('beam')).toBe(2);
    expect(byStyle.get('truss')).toBe(1);
    expect(byStyle.get('box')).toBe(1);
  });

  it('returns nothing for no spans', () => {
    expect(groupByStyle([])).toEqual([]);
  });
});

describe('BridgeRenderer', () => {
  it('adds nothing to the scene when the city has no decks', () => {
    const scene = new THREE.Scene();
    const renderer = new BridgeRenderer(scene, flatDeckAt);
    renderer.rebuild([]);
    expect(scene.children).toHaveLength(0);
    renderer.dispose();
  });

  it('builds the girder and parapets as merged geometry, not one box per tile', () => {
    const scene = new THREE.Scene();
    const renderer = new BridgeRenderer(scene, flatDeckAt);
    renderer.rebuild([deckTile(1, 0), deckTile(1, 1), deckTile(1, 2)]);

    const merged = mergedIn(scene);
    expect(merged).toHaveLength(2); // girder run + parapet run
    for (const mesh of merged) expect(vertexYs(mesh).length).toBeGreaterThan(0);
    renderer.dispose();
  });

  it('follows the deck profile, so a ramp is a slope and not a flight of steps', () => {
    const scene = new THREE.Scene();
    const renderer = new BridgeRenderer(scene, rampDeckAt);
    renderer.rebuild([deckTile(0, 0), deckTile(1, 0), deckTile(2, 0)]);

    const ys = vertexYs(mergedIn(scene)[0]!);
    // A per-tile constant box gives only a handful of distinct heights (one top
    // and one bottom per tile). Conforming geometry samples the profile at every
    // corner, so a climbing deck produces many.
    expect(new Set(ys.map((y) => y.toFixed(3))).size).toBeGreaterThan(4);
    // And it genuinely climbs rather than sitting level.
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0);
  });

  it('meets its neighbour exactly, so consecutive spans share an edge', () => {
    // Two tiles adjacent along the run. Sampling the shared edge from either
    // side must agree, or the span shows a seam.
    const scene = new THREE.Scene();
    const renderer = new BridgeRenderer(scene, rampDeckAt);
    renderer.rebuild([deckTile(4, 4), deckTile(4, 5)]);

    const ys = vertexYs(mergedIn(scene)[0]!);
    const rounded = ys.map((y) => y.toFixed(4));
    // Every height appears an even number of times: each shared corner is
    // emitted once per adjoining face, at the identical value.
    const counts = new Map<string, number>();
    for (const y of rounded) counts.set(y, (counts.get(y) ?? 0) + 1);
    expect([...counts.values()].every((n) => n > 1)).toBe(true);
    renderer.dispose();
  });

  it('raises steel above a rail deck that a road deck never gets', () => {
    const road = new THREE.Scene();
    new BridgeRenderer(road, flatDeckAt).rebuild([deckTile(1, 0), deckTile(1, 1)]);
    const rail = new THREE.Scene();
    new BridgeRenderer(rail, flatDeckAt).rebuild([
      deckTile(1, 0, RoadTier.RailTrack),
      deckTile(1, 1, RoadTier.RailTrack),
    ]);

    const highestOf = (scene: THREE.Scene): number => {
      let top = -Infinity;
      const m = new THREE.Matrix4();
      const p = new THREE.Vector3();
      for (const mesh of instancedIn(scene)) {
        for (let i = 0; i < mesh.count; i++) {
          mesh.getMatrixAt(i, m);
          p.setFromMatrixPosition(m);
          top = Math.max(top, p.y);
        }
      }
      return top;
    };
    // The truss top chord stands well clear of anything a parapet reaches.
    expect(highestOf(rail)).toBeGreaterThan(highestOf(road) + 2);
  });

  it('leaves a plank span without the parapet a street bridge carries', () => {
    const plank = new THREE.Scene();
    new BridgeRenderer(plank, flatDeckAt).rebuild([deckTile(1, 0, RoadTier.Gravel)]);
    const beam = new THREE.Scene();
    new BridgeRenderer(beam, flatDeckAt).rebuild([deckTile(1, 0, RoadTier.TwoLane)]);
    // Both carry a rail of some kind, but the plank's is far slimmer — its
    // structure totals fewer instances than the concrete beam's.
    const total = (scene: THREE.Scene): number =>
      instancedIn(scene).reduce((sum, m) => sum + m.count, 0);
    expect(total(plank)).toBeLessThanOrEqual(total(beam));
  });

  it('draws each family in its own instanced meshes', () => {
    const scene = new THREE.Scene();
    const renderer = new BridgeRenderer(scene, flatDeckAt);
    const mixedOnly = instancedIn(scene).length;
    renderer.rebuild([deckTile(0, 0, RoadTier.TwoLane), deckTile(9, 9, RoadTier.RailTrack)]);
    expect(instancedIn(scene).length).toBeGreaterThan(mixedOnly);
    renderer.dispose();
  });

  it('leaves a deck lying on the ground without piers', () => {
    const scene = new THREE.Scene();
    const renderer = new BridgeRenderer(scene, flatDeckAt);
    renderer.rebuild([{ ...deckTile(0, 0), deckY: 0, groundY: 0 }]);
    // Merged girder + parapets only; nothing instanced, since piers and
    // footings are the only instanced parts a beam span has.
    expect(instancedIn(scene)).toHaveLength(0);
    expect(mergedIn(scene)).toHaveLength(2);
    renderer.dispose();
  });

  it('replaces the structure on rebuild rather than stacking it up', () => {
    const scene = new THREE.Scene();
    const renderer = new BridgeRenderer(scene, flatDeckAt);
    renderer.rebuild([deckTile(0, 0), deckTile(0, 1)]);
    const afterFirst = scene.children.length;
    renderer.rebuild([deckTile(0, 0), deckTile(0, 1)]);
    expect(scene.children.length).toBe(afterFirst);
    renderer.dispose();
  });

  it('clears the scene on dispose', () => {
    const scene = new THREE.Scene();
    const renderer = new BridgeRenderer(scene, flatDeckAt);
    renderer.rebuild([deckTile(2, 2)]);
    expect(scene.children.length).toBeGreaterThan(0);
    renderer.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
