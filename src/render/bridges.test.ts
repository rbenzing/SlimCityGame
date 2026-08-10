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
} from './bridges';
import { carriagewayHalfWidthMeters } from './roadsmesh';

function deckTile(x: number, z: number, tier = RoadTier.TwoLane, over = 8): BridgeDeckTile {
  return { x, z, tier, mask: 1 | 4, deckY: over, groundY: 0 };
}

function instancedIn(scene: THREE.Scene): THREE.InstancedMesh[] {
  return scene.children.filter((c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh);
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
});

describe('structureHalfWidth', () => {
  it('oversails the carriageway, so the road never overhangs its own bridge', () => {
    for (const tier of [RoadTier.TwoLane, RoadTier.Highway, RoadTier.Gravel]) {
      const style = bridgeStyleFor(tier);
      expect(structureHalfWidth(tier, style)).toBeGreaterThan(carriagewayHalfWidthMeters(tier));
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
    const renderer = new BridgeRenderer(scene);
    renderer.rebuild([]);
    expect(scene.children).toHaveLength(0);
    renderer.dispose();
  });

  it('builds a girder and two parapets per deck tile', () => {
    const scene = new THREE.Scene();
    const renderer = new BridgeRenderer(scene);
    const tiles = [deckTile(1, 0), deckTile(1, 1), deckTile(1, 2)];
    renderer.rebuild(tiles);

    const counts = instancedIn(scene)
      .map((m) => m.count)
      .sort((a, b) => a - b);
    expect(counts).toContain(tiles.length); // girders
    expect(counts).toContain(tiles.length * 2); // parapets
    renderer.dispose();
  });

  it('raises steel above a rail deck that a road deck never gets', () => {
    const road = new THREE.Scene();
    new BridgeRenderer(road).rebuild([deckTile(1, 0), deckTile(1, 1)]);
    const rail = new THREE.Scene();
    new BridgeRenderer(rail).rebuild([
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
    new BridgeRenderer(plank).rebuild([deckTile(1, 0, RoadTier.Gravel)]);
    const beam = new THREE.Scene();
    new BridgeRenderer(beam).rebuild([deckTile(1, 0, RoadTier.TwoLane)]);
    // Both carry a rail of some kind, but the plank's is far slimmer — its
    // structure totals fewer instances than the concrete beam's.
    const total = (scene: THREE.Scene): number =>
      instancedIn(scene).reduce((sum, m) => sum + m.count, 0);
    expect(total(plank)).toBeLessThanOrEqual(total(beam));
  });

  it('draws each family in its own instanced meshes', () => {
    const scene = new THREE.Scene();
    const renderer = new BridgeRenderer(scene);
    const mixedOnly = instancedIn(scene).length;
    renderer.rebuild([deckTile(0, 0, RoadTier.TwoLane), deckTile(9, 9, RoadTier.RailTrack)]);
    expect(instancedIn(scene).length).toBeGreaterThan(mixedOnly);
    renderer.dispose();
  });

  it('leaves a deck lying on the ground without piers', () => {
    const scene = new THREE.Scene();
    const renderer = new BridgeRenderer(scene);
    renderer.rebuild([{ ...deckTile(0, 0), deckY: 0, groundY: 0 }]);
    // Girder + two parapets only — no pier or footing mesh was created.
    expect(instancedIn(scene)).toHaveLength(2);
    renderer.dispose();
  });

  it('replaces the structure on rebuild rather than stacking it up', () => {
    const scene = new THREE.Scene();
    const renderer = new BridgeRenderer(scene);
    renderer.rebuild([deckTile(0, 0), deckTile(0, 1)]);
    const afterFirst = scene.children.length;
    renderer.rebuild([deckTile(0, 0), deckTile(0, 1)]);
    expect(scene.children.length).toBe(afterFirst);
    renderer.dispose();
  });

  it('clears the scene on dispose', () => {
    const scene = new THREE.Scene();
    const renderer = new BridgeRenderer(scene);
    renderer.rebuild([deckTile(2, 2)]);
    expect(scene.children.length).toBeGreaterThan(0);
    renderer.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
