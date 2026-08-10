import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { PIER_SPACING_TILES } from '../shared/constants';
import { RoadTier } from '../shared/types';
import { BridgeRenderer, isPierTile, runsAlongZ, type BridgeDeckTile } from './bridges';

function deckTile(x: number, z: number, over = 8): BridgeDeckTile {
  return { x, z, tier: RoadTier.TwoLane, mask: 1 | 4, deckY: over, groundY: 0 };
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

    const instanced = scene.children.filter(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    );
    const counts = instanced.map((m) => m.count).sort((a, b) => a - b);
    expect(counts).toContain(tiles.length); // girders
    expect(counts).toContain(tiles.length * 2); // parapets
    renderer.dispose();
  });

  it('leaves a deck lying on the ground without piers', () => {
    const scene = new THREE.Scene();
    const renderer = new BridgeRenderer(scene);
    // deckY == groundY: nothing to hold up.
    renderer.rebuild([{ ...deckTile(0, 0), deckY: 0, groundY: 0 }]);

    const instanced = scene.children.filter(
      (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh,
    );
    // Girder + two parapets only — no pier or footing mesh was created.
    expect(instanced).toHaveLength(2);
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
