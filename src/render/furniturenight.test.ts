import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { BusStopRenderer } from './busstops';
import { LampRenderer } from './lamps';
import { LandfillRenderer } from './landfill';
import { PowerLineRenderer } from './powerlines';
import { RoadFurnitureRenderer } from './roadfurniture';
import { SoundWallRenderer } from './soundwalls';

type NodeMaterial = THREE.Material & { colorNode?: unknown };
type Inner = Record<string, unknown>;

const flat = (): number => 0;
const flatRoad = (): number => 0;

/** Each renderer, the material fields that carry its sunlit colour, and the uniform they share. */
const cases: { name: string; make: () => unknown; materials: string[] }[] = [
  {
    name: 'bus stops',
    make: () => new BusStopRenderer(new THREE.Scene(), flat),
    materials: ['material'],
  },
  {
    name: 'sound walls',
    make: () => new SoundWallRenderer(new THREE.Scene(), flat),
    materials: ['baseMaterial', 'panelMaterial', 'postMaterial'],
  },
  {
    name: 'power lines',
    make: () => new PowerLineRenderer(new THREE.Scene(), flat),
    materials: ['timber', 'wire', 'boxMaterial', 'doorMaterial', 'guardMaterial'],
  },
  {
    name: 'road furniture',
    make: () => new RoadFurnitureRenderer(new THREE.Scene(), flatRoad),
    materials: [
      'manholeMaterial',
      'boxMaterial',
      'meterMaterial',
      'signMaterial',
      'tramPoleMaterial',
    ],
  },
  {
    name: 'lamp poles',
    make: () => new LampRenderer(new THREE.Scene(), flatRoad),
    materials: ['poleMaterial'],
  },
  {
    name: 'landfill mound and pad',
    make: () => new LandfillRenderer(new THREE.Scene(), flat),
    materials: ['pileMaterial', 'officeMaterial'],
  },
];

describe('roadside furniture and the landfill take the shared night tint', () => {
  for (const c of cases) {
    it(`${c.name}: every sunlit material reads its colour through the night factor`, () => {
      const renderer = c.make() as Inner & { setNightFactor(n: number): void };
      for (const key of c.materials) {
        expect((renderer[key] as NodeMaterial).colorNode, key).toBeDefined();
      }
      const uniform = renderer.nightFactorUniform as { value: number };
      expect(uniform.value).toBe(0);
      renderer.setNightFactor(1);
      expect(uniform.value).toBe(1);
      renderer.setNightFactor(7);
      expect(uniform.value).toBe(1);
      renderer.setNightFactor(-2);
      expect(uniform.value).toBe(0);
    });
  }
});
