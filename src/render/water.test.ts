import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { MAP_SIZE, SEA_LEVEL, TILE_METERS } from '../shared/constants';
import { timeOfDayColors } from './scene';
import {
  DEFAULT_SKY_HORIZON_COLOR,
  DEFAULT_SKY_ZENITH_COLOR,
  FOUL_WATER_COLOR,
  MOON_GLINT_FRACTION,
  WATER_REBUILD_SETTLE_S,
  WATER_VERTEX_SPACING_M,
  SEA_OVERLAP_M,
  SEA_REACH_M,
  WaterRenderer,
  buildSeaSkirt,
  buildWaterGrid,
  riverShare,
  coveredTiles,
  foulMix,
  vertexFouling,
  vertexLook,
  blurWaterLooks,
  glintLobe,
  glintScale,
  glintShininess,
  glintSpecular,
  GLINT_BASE_VARIANCE,
  GLINT_MAX,
  GLINT_MAX_SHININESS,
  GLINT_MIN_SHININESS,
} from './water';
import {
  BED_LOST_TRANSMISSION,
  FRESNEL_F0,
  LAP_BREATH,
  LAP_BREATH_RATE,
  LAP_STRENGTH,
  LAP_WIDTH_M,
  NET_DEPTH_M,
  STREAK_STRENGTH,
  SURF_LINE_CENTRE_TURNS,
  SURF_LINE_STRENGTH,
  SURF_TRAIL_S,
  SURF_TRAIL_STRENGTH,
  WATER_IOR,
  bedNet,
  bedNetGain,
  gustScale,
  lapBreath,
  lapFoam,
  lookOf,
  schlick,
  seenThrough,
  shoreDistanceM,
  skyBlend,
  streakFoam,
  surfBreaking,
  surfCrest,
  surfFoam,
  transmission,
  waterPath,
} from './waterlook';
import { WaterKind, deriveWaterBodies, sampleWater } from '../shared/waterbodies';
import { WAVE_TRAINS } from '../shared/waves';

/** WebGPU's default maxVertexBuffers; a pipeline reading more fails to build and draws nothing. */
const WEBGPU_MAX_VERTEX_BUFFERS = 8;

describe('foulMix', () => {
  it('mixes by the square root of the fouling, so a quarter fouled is half brown and a smudge still shows', () => {
    expect(foulMix(0.25)).toBeCloseTo(0.5, 9);
    // Two units of 255 are under 1% of the scale and about 9% of the mix.
    expect(foulMix(2 / 255)).toBeGreaterThan(0.08);
    expect(foulMix(0)).toBe(0);
    expect(foulMix(1)).toBe(1);
  });

  it('reads as a brown: more red than green, more green than blue', () => {
    expect(FOUL_WATER_COLOR[0]).toBeGreaterThan(FOUL_WATER_COLOR[1]);
    expect(FOUL_WATER_COLOR[1]).toBeGreaterThan(FOUL_WATER_COLOR[2]);
  });
});

describe('vertexFouling', () => {
  it('takes the worst of the tiles meeting at the vertex, so a stain never falls between vertices', () => {
    const size = 4;
    const layer = new Uint8Array(size * size);
    layer[1 * size + 1] = 255; // tile (1, 1)
    layer[2 * size + 2] = 51; // tile (2, 2)
    expect(vertexFouling(layer, size, 1, 1)).toBe(1); // corner shared by tiles (0..1, 0..1)
    expect(vertexFouling(layer, size, 2, 2)).toBe(1); // shared by (1..2, 1..2): the worse wins
    expect(vertexFouling(layer, size, 3, 3)).toBeCloseTo(0.2, 9);
    expect(vertexFouling(layer, size, 0, 0)).toBe(0);
  });

  it('reads only the tile a half-tile vertex stands inside, and both tiles on a shared edge', () => {
    const size = 4;
    const layer = new Uint8Array(size * size);
    layer[1 * size + 1] = 255; // tile (1, 1)
    expect(vertexFouling(layer, size, 0.5, 0.5)).toBe(0);
    expect(vertexFouling(layer, size, 1.5, 1.5)).toBe(1);
    expect(vertexFouling(layer, size, 1, 1.5)).toBe(1); // edge between tiles (0,1) and (1,1)
    expect(vertexFouling(layer, size, 0.5, 1.5)).toBe(0);
  });

  it('clamps at the map edge instead of reading off it', () => {
    const size = 2;
    const layer = new Uint8Array([255, 0, 0, 0]);
    expect(vertexFouling(layer, size, 0, 0)).toBe(1);
    expect(vertexFouling(layer, size, 2, 2)).toBe(0);
  });
});

describe('DEFAULT_SKY_ZENITH_COLOR / DEFAULT_SKY_HORIZON_COLOR', () => {
  it('matches scene.ts noon (day) keyframe exactly, so the surface is never black before the first setSkyColors() call', () => {
    const noon = timeOfDayColors(0.5);
    expect(DEFAULT_SKY_ZENITH_COLOR[0]).toBeCloseTo(noon.skyZenithColor[0], 9);
    expect(DEFAULT_SKY_ZENITH_COLOR[1]).toBeCloseTo(noon.skyZenithColor[1], 9);
    expect(DEFAULT_SKY_ZENITH_COLOR[2]).toBeCloseTo(noon.skyZenithColor[2], 9);
    expect(DEFAULT_SKY_HORIZON_COLOR[0]).toBeCloseTo(noon.skyHorizonColor[0], 9);
    expect(DEFAULT_SKY_HORIZON_COLOR[1]).toBeCloseTo(noon.skyHorizonColor[1], 9);
    expect(DEFAULT_SKY_HORIZON_COLOR[2]).toBeCloseTo(noon.skyHorizonColor[2], 9);
  });
});

describe('Schlick reflection', () => {
  it('is 0.02 looking straight down (the index of water, 1.33) and 1 at grazing', () => {
    expect(WATER_IOR).toBe(1.33);
    expect(FRESNEL_F0).toBeCloseTo(0.02, 2);
    expect(schlick(1)).toBeCloseTo(FRESNEL_F0, 12);
    expect(schlick(0)).toBeCloseTo(1, 12);
  });

  it('rises monotonically toward grazing and clamps out-of-range cosines', () => {
    const vals = [1, 0.8, 0.6, 0.4, 0.2, 0].map(schlick);
    for (let i = 1; i < vals.length; i++) expect(vals[i]!).toBeGreaterThan(vals[i - 1]!);
    expect(schlick(-3)).toBe(schlick(0));
    expect(schlick(4)).toBe(schlick(1));
  });

  it('follows F0 + (1 - F0)(1 - cos)^5 at a hand-worked angle', () => {
    expect(schlick(0.5)).toBeCloseTo(FRESNEL_F0 + (1 - FRESNEL_F0) / 32, 12);
  });

  it('takes its sky tone from the reflected ray: the horizon at level, the zenith overhead', () => {
    expect(skyBlend(0)).toBe(0);
    expect(skyBlend(1)).toBe(1);
    expect(skyBlend(-0.5)).toBe(0);
    expect(skyBlend(0.25)).toBeGreaterThan(0.25);
  });
});

describe('what shows through the water', () => {
  it('loses red first, then green, then blue, with the pure-water absorption', () => {
    const t = transmission(5, 0);
    expect(t[0]).toBeCloseTo(Math.exp(-0.34 * 5), 12);
    expect(t[1]).toBeCloseTo(Math.exp(-0.0565 * 5), 12);
    expect(t[2]).toBeCloseTo(Math.exp(-0.0092 * 5), 12);
    expect(t[0]).toBeLessThan(t[1]);
    expect(t[1]).toBeLessThan(t[2]);
    expect(transmission(0, 3)).toEqual([1, 1, 1]);
  });

  it('loses the bed where each kind says: blue is down to BED_LOST_TRANSMISSION at 8 m (ocean), 4 m (lake), 1.5 m (river)', () => {
    for (const [kind, lostAt] of [
      [WaterKind.Ocean, 8],
      [WaterKind.Lake, 4],
      [WaterKind.River, 1.5],
    ] as const) {
      const blue = transmission(lostAt, lookOf(kind).murk)[2];
      expect(blue).toBeCloseTo(BED_LOST_TRANSMISSION, 9);
      expect(transmission(lostAt / 2, lookOf(kind).murk)[2]).toBeGreaterThan(blue);
    }
    // A muddier water loses the bed sooner.
    expect(lookOf(WaterKind.River).murk).toBeGreaterThan(lookOf(WaterKind.Lake).murk);
    expect(lookOf(WaterKind.Lake).murk).toBeGreaterThan(lookOf(WaterKind.Ocean).murk);
  });

  it('takes the path along the refracted ray: longer slanted, never past 10 times the depth', () => {
    expect(waterPath(2, 1)).toBe(2);
    expect(waterPath(2, 0.5)).toBe(4);
    expect(waterPath(2, 0)).toBe(20);
    expect(waterPath(-1, 1)).toBe(0);
  });

  it('shows the bed in the shallows and the kind scatter colour where the light is lost', () => {
    const bed: [number, number, number] = [0.8, 0.7, 0.5];
    const scatter = lookOf(WaterKind.Ocean).scatter;
    expect(seenThrough(bed, transmission(0, 0.5), scatter)).toEqual(bed);
    const deep = seenThrough(bed, transmission(40, lookOf(WaterKind.Ocean).murk), scatter);
    for (let i = 0; i < 3; i++) expect(deep[i]).toBeCloseTo(scatter[i]!, 3);
  });

  it('gives each kind its own scatter: ocean blue, lake green-blue, river olive', () => {
    const [or, og, ob] = lookOf(WaterKind.Ocean).scatter;
    const [lr, lg, lb] = lookOf(WaterKind.Lake).scatter;
    const [rr, rg, rb] = lookOf(WaterKind.River).scatter;
    expect(ob).toBeGreaterThan(og);
    expect(og).toBeGreaterThan(or);
    expect(lg).toBeGreaterThanOrEqual(lb);
    expect(lg).toBeGreaterThan(lr);
    // A river is a dark green-teal, so brown fouling still shows on it.
    expect(rg).toBeGreaterThan(rb);
    expect(rb).toBeGreaterThan(rr);
    expect(FOUL_WATER_COLOR[0]).toBeGreaterThan(rr * 3);
    expect(lookOf(WaterKind.None)).toEqual(lookOf(WaterKind.Ocean));
  });
});

describe('gusts and the net of light on the bed', () => {
  it('scales the wind waves between 0.5 and 1.5 and leaves a still field alone', () => {
    expect(gustScale(0)).toBe(1);
    expect(gustScale(-5)).toBe(0.5);
    expect(gustScale(5)).toBe(1.5);
  });

  it('widens the glint in a ruffled patch and narrows it in a calm one', () => {
    expect(glintSpecular(0.99, 0.8, 0, 1.5)).toBeGreaterThan(glintSpecular(0.99, 0.8, 0, 1));
    expect(glintSpecular(0.99, 0.8, 0, 0.5)).toBeLessThan(glintSpecular(0.99, 0.8, 0, 1));
    expect(glintShininess(0, 1.5)).toBeLessThan(glintShininess(0, 1));
  });

  it('draws the net only in the shallows, by day: gone at NET_DEPTH_M and at night, moving with time', () => {
    expect(bedNetGain(1, NET_DEPTH_M, 0)).toBe(1);
    expect(bedNetGain(1, NET_DEPTH_M + 2, 0)).toBe(1);
    expect(bedNetGain(1, 0.5, 1)).toBe(1);
    expect(bedNetGain(1, 0.5, 0, 0)).toBe(1); // lines under a few pixels are faded out
    expect(bedNetGain(1, 0.5, 0)).toBeGreaterThan(1);
    expect(bedNetGain(1, 0.5, 0)).toBeGreaterThan(bedNetGain(1, 2, 0));
    expect(bedNetGain(0, 0.5, 0)).toBe(1);
    const at = new Set<string>();
    for (let t = 0; t < 6; t += 0.7) at.add(bedNet(3, 4, t, 0.3, -0.2).toFixed(5));
    expect(at.size).toBeGreaterThan(1);
    const across = new Set<string>();
    for (let x = 0; x < 20; x += 0.9) across.add(bedNet(x, 2, 1, 0.3, -0.2).toFixed(5));
    expect(across.size).toBeGreaterThan(5);
    for (let x = 0; x < 20; x += 0.37) {
      expect(bedNet(x, 5, 2, Math.sin(x), Math.cos(x))).toBeGreaterThanOrEqual(0);
      expect(bedNet(x, 5, 2, Math.sin(x), Math.cos(x))).toBeLessThanOrEqual(1);
    }
  });
});

describe('foam', () => {
  it('surf only where the cap bites: none for a swell far under the breaking depth, all of it past', () => {
    // 1 m of swell meets the cap (0.8 of the depth) in water 1.25 m deep.
    expect(surfBreaking(1, 10)).toBe(0);
    expect(surfBreaking(1, 2)).toBe(0);
    expect(surfBreaking(1, 1.25)).toBeGreaterThan(0);
    expect(surfBreaking(1, 1.25)).toBeLessThan(1);
    expect(surfBreaking(1, 1)).toBe(1);
    expect(surfBreaking(1, 0.1)).toBe(1);
  });

  it('no surf on a lake: no swell, no breaking, whatever the depth', () => {
    for (const depth of [0.01, 0.1, 0.5, 2]) expect(surfBreaking(0, depth)).toBe(0);
    expect(surfFoam(surfBreaking(0, 0.1), 1, 1, 1)).toBe(0);
  });

  it('puts the surf line just past the crest and a fainter trail behind it, gone after SURF_TRAIL_S', () => {
    const top = Math.PI / 2; // the sine's crest
    const turns = (t: number): number => top + t * Math.PI * 2;
    const atTop = surfCrest(top, 8);
    const justPast = surfCrest(turns(SURF_LINE_CENTRE_TURNS), 8);
    expect(justPast.line).toBeCloseTo(1, 6);
    expect(justPast.line).toBeGreaterThan(atTop.line);
    // 1 s behind the crest on an 8 s swell is 0.125 turns.
    const behind = surfCrest(turns(-0.125), 8);
    expect(behind.line).toBeLessThan(0.01);
    expect(behind.trail).toBeGreaterThan(0);
    expect(behind.trail).toBeLessThan(justPast.line);
    expect(behind.trail).toBeCloseTo(SURF_TRAIL_STRENGTH * (1 - 1 / SURF_TRAIL_S), 6);
    // 4 s behind (half a period) it has faded out.
    expect(surfCrest(turns(-0.5), 8).trail).toBeCloseTo(0, 6);
    // Ahead of the line there is neither.
    const ahead = surfCrest(turns(0.2), 8);
    expect(ahead.line).toBeLessThan(0.01);
    expect(ahead.trail).toBe(0);
  });

  it('breaks the surf line up with noise: ragged, never a ruled stripe', () => {
    expect(surfFoam(1, 1, 0, 0.1)).toBe(0);
    expect(surfFoam(1, 1, 0, 0.9)).toBe(SURF_LINE_STRENGTH);
    expect(SURF_LINE_STRENGTH).toBeLessThan(1);
    expect(surfFoam(1, 1, 0, 0.4)).toBeGreaterThan(0);
    expect(surfFoam(1, 1, 0, 0.4)).toBeLessThan(SURF_LINE_STRENGTH);
    // Nothing breaks, nothing shows.
    expect(surfFoam(0, 1, 1, 0.9)).toBe(0);
  });

  it('laps only inside the band: full at the waterline, none from LAP_WIDTH_M of ground out, soft between', () => {
    expect(lapFoam(0, 0)).toBeCloseTo(LAP_STRENGTH, 9);
    expect(lapFoam(0, 1)).toBeCloseTo(LAP_STRENGTH, 9);
    expect(lapFoam(LAP_WIDTH_M, 1)).toBe(0);
    expect(lapFoam(LAP_WIDTH_M * 3, 0.5)).toBe(0);
    // Inner edge soft: a steady fall, not a ruled strip.
    const mid = lapFoam(LAP_WIDTH_M * 0.5, 1);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(LAP_STRENGTH);
    for (let d = 0; d < LAP_WIDTH_M; d += 0.01) {
      expect(lapFoam(d + 0.01, 0.5)).toBeLessThanOrEqual(lapFoam(d, 0.5) + 1e-9);
    }
  });

  it('shore distance is the bed depth over its slope: the same ground width on a gentle shelf and a steep bank', () => {
    for (const slope of [0.002, 0.1, 0.8, 50]) {
      const d = LAP_WIDTH_M * 0.5;
      expect(shoreDistanceM(d * slope, slope)).toBeCloseTo(d, 9);
      expect(lapFoam(shoreDistanceM(d * slope, slope), 1)).toBeCloseTo(lapFoam(d, 1), 9);
      expect(lapFoam(shoreDistanceM(LAP_WIDTH_M * 1.01 * slope, slope), 1)).toBe(0);
    }
    expect(shoreDistanceM(-1, 0.3)).toBe(0);
    expect(Number.isFinite(shoreDistanceM(1, 0))).toBe(true);
  });

  it('fades with pixel size instead of widening: a pixel wider than the line shows it at the share it fills', () => {
    expect(lapFoam(0, 1, LAP_WIDTH_M)).toBeCloseTo(LAP_STRENGTH, 9);
    expect(lapFoam(0, 1, LAP_WIDTH_M * 4)).toBeCloseTo(LAP_STRENGTH / 4, 9);
    expect(lapFoam(0, 1, LAP_WIDTH_M * 40)).toBeLessThan(lapFoam(0, 1, LAP_WIDTH_M * 4));
    // The line's reach on the ground does not grow with the pixel.
    expect(lapFoam(LAP_WIDTH_M * 1.01, 1, 50)).toBe(0);
  });

  it('never reaches past LAP_WIDTH_M of ground at any breath or pixel size', () => {
    for (const breath of [0, 0.5, 1]) {
      for (const pixelM of [0, 0.1, 5, 80]) {
        for (let d = LAP_WIDTH_M; d < 10; d += 0.05) {
          expect(lapFoam(d, breath, pixelM)).toBe(0);
        }
      }
    }
  });

  it('breathes in and out with time, out of step by place', () => {
    const at = (n: number, t: number): number => lapBreath(n, t);
    const period = (2 * Math.PI) / LAP_BREATH_RATE;
    expect(at(0.2, 0)).toBeCloseTo(at(0.2, period), 9);
    expect(Math.abs(at(0.2, 0) - at(0.2, period / 2))).toBeGreaterThan(0.5);
    expect(at(0.1, 0)).not.toBeCloseTo(at(0.3, 0), 2);
    for (let t = 0; t < 20; t += 0.7) {
      expect(at(0.3, t)).toBeGreaterThanOrEqual(0);
      expect(at(0.3, t)).toBeLessThanOrEqual(1);
    }
  });

  it('breathes: the band is narrower when the breath is low than when it is high', () => {
    const d = LAP_WIDTH_M * (1 - LAP_BREATH) * 0.9;
    expect(lapFoam(d, 0)).toBeGreaterThan(0);
    expect(lapFoam(LAP_WIDTH_M * 0.9, 0)).toBe(0);
    expect(lapFoam(LAP_WIDTH_M * 0.9, 1)).toBeGreaterThan(0);
  });

  it('river streaks are zero where the flow is zero, and strongest in the current', () => {
    expect(streakFoam(0, 1)).toBe(0);
    expect(streakFoam(1, 0.5)).toBe(0);
    expect(streakFoam(1, 1)).toBeCloseTo(STREAK_STRENGTH, 9);
    expect(streakFoam(0.5, 1)).toBeLessThan(streakFoam(1, 1));
    expect(streakFoam(1, 1)).toBeLessThan(LAP_STRENGTH);
  });
});

describe('glintScale', () => {
  it('is 1 at full day (nightFactor=0)', () => {
    expect(glintScale(0)).toBe(1);
  });

  it('is exactly MOON_GLINT_FRACTION at full night (nightFactor=1)', () => {
    expect(glintScale(1)).toBeCloseTo(MOON_GLINT_FRACTION, 9);
  });

  it('decreases monotonically as nightFactor rises', () => {
    const vals = [0, 0.25, 0.5, 0.75, 1].map((n) => glintScale(n));
    for (let i = 1; i < vals.length; i++) expect(vals[i]!).toBeLessThanOrEqual(vals[i - 1]!);
  });

  it('clamps out-of-range nightFactor', () => {
    expect(glintScale(-2)).toBe(1);
    expect(glintScale(3)).toBeCloseTo(MOON_GLINT_FRACTION, 9);
  });
});

describe('glintSpecular', () => {
  it('is zero where the half-vector is far from the normal and peaks at the mirror direction', () => {
    expect(glintSpecular(0, 0.7)).toBe(0);
    expect(glintSpecular(0.9, 0.7)).toBeLessThan(1e-6);
    const vals = [0.9, 0.99, 0.999, 1].map((n) => glintSpecular(n, 0.7));
    for (let i = 1; i < vals.length; i++) expect(vals[i]!).toBeGreaterThanOrEqual(vals[i - 1]!);
    expect(glintSpecular(1, 0.7)).toBeGreaterThan(0.1);
  });

  it('is deterministic and clamps out-of-range inputs', () => {
    expect(glintSpecular(0.99, 0.5)).toBe(glintSpecular(0.99, 0.5));
    expect(glintSpecular(-3, 0.5)).toBe(glintSpecular(0, 0.5));
    expect(glintSpecular(7, 0.5)).toBeCloseTo(glintSpecular(1, 0.5), 9);
  });

  it('never exceeds GLINT_MAX, at the sharpest lobe and the grazing view', () => {
    expect(glintSpecular(1, 0, 0, 0.5)).toBeLessThanOrEqual(GLINT_MAX);
    expect(glintSpecular(1, 0, 0, 0.5)).toBe(GLINT_MAX);
  });

  it('is zero at the night scale of zero and follows the scale otherwise', () => {
    expect(glintSpecular(1, 0.7, 0, 1, 0)).toBe(0);
    expect(glintSpecular(1, 0.7, 0, 1, 0.2)).toBeCloseTo(0.2 * glintSpecular(1, 0.7), 9);
  });

  it('reflects more at a grazing view than from straight above (Schlick)', () => {
    expect(glintSpecular(0.999, 0.1)).toBeGreaterThan(glintSpecular(0.999, 1));
  });

  it('keeps its energy as it narrows: the lobe integrates to about the same over the half-vector sphere', () => {
    const energy = (n: number): number => {
      let sum = 0;
      const steps = 20000;
      for (let i = 0; i < steps; i++) {
        const theta = ((i + 0.5) / steps) * (Math.PI / 2);
        sum +=
          glintLobe(Math.cos(theta), n) * Math.sin(theta) * (Math.PI / 2 / steps) * 2 * Math.PI;
      }
      return sum;
    };
    const wide = energy(glintShininess(0.05, 1));
    const narrow = energy(glintShininess(0, 1));
    expect(glintShininess(0, 1)).toBeGreaterThan(glintShininess(0.05, 1) * 4);
    expect(narrow / wide).toBeGreaterThan(0.7);
    expect(narrow / wide).toBeLessThan(1.3);
    expect(energy(GLINT_MAX_SHININESS)).toBeLessThan(2);
  });

  it('narrows with a calmer surface and widens with the slope variance the pixel fade removed', () => {
    expect(glintShininess(0.05)).toBeLessThan(glintShininess(0.01));
    expect(glintShininess(0.01)).toBeLessThan(glintShininess(0));
    expect(glintShininess(10)).toBe(GLINT_MIN_SHININESS);
    expect(glintShininess(0, 0.01)).toBe(GLINT_MAX_SHININESS);
    expect(glintShininess(0)).toBeCloseTo(2 / GLINT_BASE_VARIANCE, 9);
  });
});

describe('WaterRenderer', () => {
  const flatHeightAt = (): number => -5; // uniformly 5m underwater
  const mixedHeightAt = (x: number): number => (x < 32 ? -5 : 20);
  const allWet = (): Uint8Array => new Uint8Array(16).fill(1);
  /** The water mask a height field implies: a tile is water where its centre is below sea level. */
  const maskOf = (height: (x: number, z: number) => number, size: number): Uint8Array => {
    const mask = new Uint8Array(size * size);
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        mask[z * size + x] =
          height((x + 0.5) * TILE_METERS, (z + 0.5) * TILE_METERS) < SEA_LEVEL ? 1 : 0;
      }
    }
    return mask;
  };

  it('adds the surface mesh and the sea past the edge, named, at SEA_LEVEL', () => {
    const scene = new THREE.Scene();
    new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    expect(scene.children.length).toBe(2);
    const mesh = scene.children[0] as THREE.Mesh;
    expect(mesh.name).toBe('water-surface');
    expect(mesh.position.y).toBe(SEA_LEVEL);
    expect((scene.children[1] as THREE.Mesh).name).toBe('water-sea');
  });

  it('sizes the plane to mapSizeTiles * TILE_METERS', () => {
    const scene = new THREE.Scene();
    new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    const mesh = scene.children[0] as THREE.Mesh;
    const position = mesh.geometry.attributes.position!;
    let maxX = -Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < position.count; i++) {
      maxX = Math.max(maxX, position.getX(i));
      maxZ = Math.max(maxZ, position.getZ(i));
    }
    expect(maxX).toBeCloseTo(4 * TILE_METERS, 5);
    expect(maxZ).toBeCloseTo(4 * TILE_METERS, 5);
  });

  it('retints its vertices from the fouling layer, and only the ones a fouled tile meets', () => {
    const scene = new THREE.Scene();
    const renderer = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    const mesh = scene.children[0] as THREE.Mesh;
    const foul = mesh.geometry.getAttribute('waterFoul');
    expect(foul).toBeDefined();
    const layer = new Uint8Array(16);
    layer[1 * 4 + 1] = 255; // tile (1, 1)
    renderer.setFouling(layer);
    const position = mesh.geometry.attributes.position!;
    let atCorner = -1;
    let atOrigin = -1;
    for (let i = 0; i < position.count; i++) {
      const tx = Math.round(position.getX(i) / TILE_METERS);
      const tz = Math.round(position.getZ(i) / TILE_METERS);
      const onCorner =
        Math.abs(position.getX(i) - TILE_METERS) < 1e-6 &&
        Math.abs(position.getZ(i) - TILE_METERS) < 1e-6;
      if (onCorner && tx === 1 && tz === 1) atCorner = i;
      if (position.getX(i) === 0 && position.getZ(i) === 0) atOrigin = i;
    }
    expect(atCorner).toBeGreaterThanOrEqual(0);
    expect(renderer.foulingAtVertex(atCorner)).toBe(1);
    expect(renderer.foulingAtVertex(atOrigin)).toBe(0);
  });

  it('defaults mapSizeTiles to MAP_SIZE when omitted', () => {
    const scene = new THREE.Scene();
    const mask = new Uint8Array(MAP_SIZE * MAP_SIZE);
    mask[MAP_SIZE * MAP_SIZE - 1] = 1; // the last tile
    new WaterRenderer(scene, flatHeightAt, mask);
    const mesh = scene.children[0] as THREE.Mesh;
    const position = mesh.geometry.attributes.position!;
    let maxX = -Infinity;
    for (let i = 0; i < position.count; i++) maxX = Math.max(maxX, position.getX(i));
    expect(maxX).toBeCloseTo(MAP_SIZE * TILE_METERS, 5);
  });

  it('covers wet tiles and the ring of tiles round them, and nothing else', () => {
    const size = 12;
    const mask = new Uint8Array(size * size);
    mask[5 * size + 5] = 1;
    const covered = coveredTiles(mask, size);
    for (let z = 0; z < size; z++) {
      for (let x = 0; x < size; x++) {
        const near = Math.abs(x - 5) <= 1 && Math.abs(z - 5) <= 1;
        expect(covered[z * size + x]).toBe(near ? 1 : 0);
      }
    }
    // 3 x 3 tiles of 2 x 2 squares: 6 x 6 squares, 7 x 7 vertices, two triangles a square.
    const grid = buildWaterGrid(mask, size);
    expect(grid.positions.length / 3).toBe(49);
    expect(grid.indices.length / 3).toBe(72);
    for (let i = 0; i < grid.positions.length; i += 3) {
      expect(grid.positions[i]! % WATER_VERTEX_SPACING_M).toBe(0);
      expect(grid.positions[i]!).toBeGreaterThanOrEqual(4 * TILE_METERS);
      expect(grid.positions[i]!).toBeLessThanOrEqual(7 * TILE_METERS);
      expect(grid.positions[i + 2]!).toBeGreaterThanOrEqual(4 * TILE_METERS);
      expect(grid.positions[i + 2]!).toBeLessThanOrEqual(7 * TILE_METERS);
    }
  });

  it('draws no mesh where there is no water', () => {
    const grid = buildWaterGrid(new Uint8Array(64), 8);
    expect(grid.positions.length).toBe(0);
    expect(grid.indices.length).toBe(0);
  });

  it('faces every triangle up', () => {
    const mask = new Uint8Array(36);
    mask[2 * 6 + 3] = 1;
    const grid = buildWaterGrid(mask, 6);
    for (let t = 0; t < grid.indices.length; t += 3) {
      const [a, b, c] = [grid.indices[t]!, grid.indices[t + 1]!, grid.indices[t + 2]!];
      const ux = grid.positions[b * 3]! - grid.positions[a * 3]!;
      const uz = grid.positions[b * 3 + 2]! - grid.positions[a * 3 + 2]!;
      const vx = grid.positions[c * 3]! - grid.positions[a * 3]!;
      const vz = grid.positions[c * 3 + 2]! - grid.positions[a * 3 + 2]!;
      // y of cross(u, v) is uz*vx - ux*vz; positive faces up.
      expect(uz * vx - ux * vz).toBeGreaterThan(0);
    }
  });

  describe('the sea past the map edge', () => {
    const size = 12;
    const kindOf = (tiles: Array<[number, number]>): Uint8Array => {
      const kind = new Uint8Array(size * size);
      for (const [x, z] of tiles) kind[z * size + x] = WaterKind.Ocean;
      return kind;
    };
    const bounds = (positions: Float32Array): { x: number[]; z: number[] } => {
      const x: number[] = [];
      const z: number[] = [];
      for (let i = 0; i < positions.length; i += 3) {
        x.push(positions[i]!);
        z.push(positions[i + 2]!);
      }
      return { x, z };
    };

    it('adds nothing where no ocean touches an edge', () => {
      const kind = kindOf([[5, 5]]);
      kind[5 * size + 4] = WaterKind.Lake;
      kind[0 * size + 3] = WaterKind.Lake;
      expect(buildSeaSkirt(kind, size).positions.length).toBe(0);
    });

    it('runs on from the edge to the reach, starting a hair inside the edge so the meshes overlap', () => {
      const skirt = buildSeaSkirt(
        kindOf([
          [0, 4],
          [0, 5],
          [0, 6],
        ]),
        size,
      );
      const { x, z } = bounds(skirt.positions);
      expect(Math.max(...x)).toBe(SEA_OVERLAP_M);
      expect(Math.min(...x)).toBe(-SEA_REACH_M);
      // Along that first row the vertices sit on the main mesh's own spacing, all along the edge.
      const onEdge = z
        .filter((_, i) => x[i] === SEA_OVERLAP_M)
        .filter((v) => v >= 0 && v <= size * TILE_METERS);
      expect(onEdge).toHaveLength(size * 2 + 1);
      onEdge.forEach((v, i) => expect(v).toBe(i * WATER_VERTEX_SPACING_M));
      // Every vertex looks to the nearest ocean tile of the edge for its water.
      for (let i = 0; i < skirt.anchors.length; i += 2) {
        expect(skirt.anchors[i]).toBe(0);
        expect(skirt.anchors[i + 1]!).toBeGreaterThanOrEqual(4 * TILE_METERS);
        expect(skirt.anchors[i + 1]!).toBeLessThanOrEqual(7 * TILE_METERS);
      }
    });

    it('faces every triangle up on every edge', () => {
      const tiles: Array<[number, number]> = [
        [0, 5],
        [size - 1, 5],
        [5, 0],
        [5, size - 1],
      ];
      const skirt = buildSeaSkirt(kindOf(tiles), size);
      expect(skirt.indices.length).toBeGreaterThan(0);
      for (let t = 0; t < skirt.indices.length; t += 3) {
        const [a, b, c] = [skirt.indices[t]!, skirt.indices[t + 1]!, skirt.indices[t + 2]!];
        const ux = skirt.positions[b * 3]! - skirt.positions[a * 3]!;
        const uz = skirt.positions[b * 3 + 2]! - skirt.positions[a * 3 + 2]!;
        const vx = skirt.positions[c * 3]! - skirt.positions[a * 3]!;
        const vz = skirt.positions[c * 3 + 2]! - skirt.positions[a * 3 + 2]!;
        expect(uz * vx - ux * vz).toBeGreaterThan(0);
      }
    });

    it('runs along the whole edge and past both corners, taking its water from the nearest ocean tile', () => {
      const run = buildSeaSkirt(
        kindOf([
          [0, 4],
          [0, 5],
        ]),
        size,
      );
      const { x, z } = bounds(run.positions);
      expect(Math.min(...z)).toBe(-SEA_REACH_M);
      expect(Math.max(...z)).toBe(size * TILE_METERS + SEA_REACH_M);
      // Two stretches of ocean on one edge are one strip, not two laid over each other.
      const two = buildSeaSkirt(
        kindOf([
          [0, 2],
          [0, 9],
        ]),
        size,
      );
      expect(two.positions.length).toBe(run.positions.length);
      expect(x.length).toBe(run.positions.length / 3);
      for (let i = 0; i < two.anchors.length; i += 2) {
        expect(
          [2, 9].some(
            (t) =>
              two.anchors[i + 1]! >= t * TILE_METERS &&
              two.anchors[i + 1]! <= (t + 1) * TILE_METERS,
          ),
        ).toBe(true);
      }
    });

    it('is a mesh of its own with its own cheap material and few vertex buffers', () => {
      const scene = new THREE.Scene();
      const mask = new Uint8Array(MAP_SIZE * MAP_SIZE);
      for (let z = 10; z < 30; z++) for (let x = 0; x < 6; x++) mask[z * MAP_SIZE + x] = 1;
      const water = new WaterRenderer(scene, () => -10, mask);
      const main = scene.children[0] as THREE.Mesh;
      const sea = scene.children[1] as THREE.Mesh;
      expect(sea.name).toBe('water-sea');
      expect(sea.visible).toBe(true);
      expect(sea.material).not.toBe(main.material);
      expect(sea.material).not.toBe(water.blendedSurfaceMaterial());
      const position = sea.geometry.attributes.position!;
      let minX = Infinity;
      for (let i = 0; i < position.count; i++) minX = Math.min(minX, position.getX(i));
      expect(minX).toBe(-SEA_REACH_M);
      // The main mesh keeps the map's own extent.
      const mainPosition = main.geometry.attributes.position!;
      let mainMinX = Infinity;
      for (let i = 0; i < mainPosition.count; i++)
        mainMinX = Math.min(mainMinX, mainPosition.getX(i));
      expect(mainMinX).toBe(0);
      // position, seaSwell, seaScatter; the main mesh's six: both under WebGPU's 8.
      expect(Object.keys(sea.geometry.attributes)).toHaveLength(3);
      expect(Object.keys(main.geometry.attributes)).toHaveLength(6);
    });

    it('is hidden where no ocean touches an edge', () => {
      const scene = new THREE.Scene();
      const mask = new Uint8Array(MAP_SIZE * MAP_SIZE);
      for (let z = 100; z < 104; z++) for (let x = 100; x < 104; x++) mask[z * MAP_SIZE + x] = 1;
      new WaterRenderer(scene, () => -10, mask);
      expect((scene.children[1] as THREE.Mesh).visible).toBe(false);
    });
  });

  it('carries fetch, swell and flow attributes equal to the sampled water bodies', () => {
    // A 3-wide strait with open sea on the west edge of a 40-tile map.
    const size = 40;
    const height = (x: number, z: number): number => {
      const tx = Math.floor(x / TILE_METERS);
      const tz = Math.floor(z / TILE_METERS);
      return tx < 8 || (tx < 38 && tz >= 18 && tz <= 20) ? -4 : 10;
    };
    const mask = maskOf(height, size);
    const scene = new THREE.Scene();
    new WaterRenderer(scene, height, mask, size);
    const geometry = (scene.children[0] as THREE.Mesh).geometry;
    const position = geometry.attributes.position!;
    const shape = geometry.attributes.waterShape!;
    const swell = geometry.attributes.waterSwell!;
    const flow = geometry.attributes.waterFlow!;
    expect(shape.count).toBe(position.count);
    expect(shape.itemSize).toBe(4);
    expect(swell.itemSize).toBe(4);
    expect(flow.itemSize).toBe(3);
    const bodies = deriveWaterBodies(mask, size, (tx, tz) =>
      height((tx + 0.5) * TILE_METERS, (tz + 0.5) * TILE_METERS),
    );
    let sawSwell = false;
    let sawFlow = false;
    for (let i = 0; i < position.count; i++) {
      // The sea past the edge takes its look from the edge point: it is checked on its own. (the edge line itself is the strip's first row)
      const inMap = [position.getX(i), position.getZ(i)].every(
        (c) => c > 0 && c < size * TILE_METERS,
      );
      if (!inMap) continue;
      const s = sampleWater(bodies, position.getX(i), position.getZ(i));
      expect(Math.abs(shape.getZ(i) - s.fetchM)).toBeLessThanOrEqual(s.fetchM * 1e-6 + 1e-6);
      expect(swell.getX(i)).toBeCloseTo(s.swellTau, 3);
      expect(swell.getY(i)).toBeCloseTo(s.swellSlowX, 6);
      expect(swell.getZ(i)).toBeCloseTo(s.swellSlowZ, 6);
      expect(swell.getW(i)).toBeCloseTo(s.swellAmp, 5);
      if (shape.getX(i) > 0) {
        expect(flow.getX(i)).toBeCloseTo(s.flowX, 5);
        expect(flow.getY(i)).toBeCloseTo(s.flowZ, 5);
      } else {
        expect(flow.getX(i)).toBe(0);
        expect(flow.getY(i)).toBe(0);
      }
      if (swell.getW(i) > 0.5 && swell.getY(i) > 0) sawSwell = true;
      if (Math.hypot(flow.getX(i), flow.getY(i)) > 0.1) sawFlow = true;
    }
    expect(sawSwell).toBe(true);
    expect(sawFlow).toBe(true);
  });

  it('weights the lapping line out of a river and only a river: the share rides the flow attribute', () => {
    // The strait of the test above: sea on the west, lake in the east, a river between.
    const size = 40;
    const height = (x: number, z: number): number => {
      const tx = Math.floor(x / TILE_METERS);
      const tz = Math.floor(z / TILE_METERS);
      return tx < 8 || (tx < 38 && tz >= 18 && tz <= 20) ? -4 : 10;
    };
    const mask = maskOf(height, size);
    const scene = new THREE.Scene();
    new WaterRenderer(scene, height, mask, size);
    const geometry = (scene.children[0] as THREE.Mesh).geometry;
    const position = geometry.attributes.position!;
    const flow = geometry.attributes.waterFlow!;
    const bodies = deriveWaterBodies(mask, size, (tx, tz) =>
      height((tx + 0.5) * TILE_METERS, (tz + 0.5) * TILE_METERS),
    );
    let inRiver = 0;
    let inOcean = 0;
    for (let i = 0; i < position.count; i++) {
      const tx = position.getX(i) / TILE_METERS;
      const tz = position.getZ(i) / TILE_METERS;
      expect(flow.getZ(i)).toBeCloseTo(riverShare(bodies.kind, size, tx, tz), 6);
      const tile = Math.min(size - 1, Math.floor(tz)) * size + Math.min(size - 1, Math.floor(tx));
      if (bodies.kind[tile] === WaterKind.River && Number.isInteger(tx) === false) {
        if (flow.getZ(i) === 1) inRiver++;
      }
      if (bodies.kind[tile] === WaterKind.Ocean && tx < 6) {
        expect(flow.getZ(i)).toBe(0);
        inOcean++;
      }
    }
    expect(inRiver).toBeGreaterThan(0);
    expect(inOcean).toBeGreaterThan(0);
    expect(riverShare(new Uint8Array(4), 2, 1, 1)).toBe(0);
  });

  it('blurs murk and scatter over the water tiles so one kind runs into the next', () => {
    // A row of 12 tiles: river on the left, ocean on the right, one dry tile beside them.
    const size = 12;
    const kind = new Uint8Array(size * size);
    for (let x = 0; x < size; x++) kind[x] = x < 6 ? WaterKind.River : WaterKind.Ocean;
    kind[size] = WaterKind.None;
    const looks = blurWaterLooks(kind, size, 3);
    const river = lookOf(WaterKind.River);
    const ocean = lookOf(WaterKind.Ocean);
    // Far from the join a tile keeps its own look; at the join it is between the two.
    expect(looks.murk[0]).toBeCloseTo(river.murk, 6);
    expect(looks.murk[size - 1]).toBeCloseTo(ocean.murk, 6);
    expect(looks.murk[5]!).toBeLessThan(river.murk);
    expect(looks.murk[5]!).toBeGreaterThan(looks.murk[6]!);
    expect(looks.murk[6]!).toBeGreaterThan(ocean.murk);
    for (let x = 0; x < size - 1; x++)
      expect(looks.murk[x]!).toBeGreaterThanOrEqual(looks.murk[x + 1]! - 1e-5);
    // A dry tile carries no look and never darkens its neighbours.
    expect(looks.wet[size]).toBe(0);
    expect(looks.murk[size]).toBe(0);
    // Vertices average the wet tiles that meet there, and open water where there is none.
    const mid = vertexLook(looks, size, 6, 1);
    expect(mid.murk).toBeCloseTo((looks.murk[5]! + looks.murk[6]!) / 2, 6);
    expect(vertexLook(looks, size, 0.5, 6.5).murk).toBeCloseTo(ocean.murk, 6);

    const scene = new THREE.Scene();
    new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    const geometry = (scene.children[0] as THREE.Mesh).geometry;
    const shape = geometry.attributes.waterShape!;
    const scatter = geometry.attributes.waterScatter!;
    expect(shape.count).toBe(geometry.attributes.position!.count);
    for (let i = 0; i < shape.count; i++) {
      expect(shape.getW(i)).toBeCloseTo(ocean.murk, 6);
      expect(scatter.getZ(i)).toBeCloseTo(ocean.scatter[2], 6);
    }
  });

  it('draws from at most 8 vertex buffers, the most a WebGPU pipeline accepts', () => {
    const scene = new THREE.Scene();
    new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    const geometry = (scene.children[0] as THREE.Mesh).geometry;
    const buffers = new Set(
      Object.values(geometry.attributes).map(
        (a) => (a as THREE.InterleavedBufferAttribute).data ?? a,
      ),
    );
    expect(buffers.size).toBeLessThanOrEqual(WEBGPU_MAX_VERTEX_BUFFERS);
  });

  it('builds its node graph from the exported train list, every train once', () => {
    const scene = new THREE.Scene();
    const renderer = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    expect(renderer.graphTrains()).toEqual([...WAVE_TRAINS]);
  });

  describe('the material for each way the frame is drawn', () => {
    const readsViewport = (material: THREE.Material): boolean => {
      const m = material as unknown as Record<
        string,
        { traverse?: (f: (n: object) => void) => void }
      >;
      let found = false;
      for (const key of [
        'colorNode',
        'emissiveNode',
        'opacityNode',
        'normalNode',
        'positionNode',
      ]) {
        m[key]?.traverse?.((n) => {
          if (/Viewport/.test(n.constructor.name)) found = true;
        });
      }
      return found;
    };

    it('draws with the screen-reading material while a pipeline draws the frame, and the blended one when none does', () => {
      const renderer = new WaterRenderer(new THREE.Scene(), flatHeightAt, allWet(), 4);
      const screenMaterial = renderer.activeMaterial();
      expect(renderer.blendedSurfaceMaterial()).not.toBe(screenMaterial);

      renderer.setScreenRead(false);
      expect(renderer.activeMaterial()).toBe(renderer.blendedSurfaceMaterial());
      renderer.setScreenRead(true);
      expect(renderer.activeMaterial()).toBe(screenMaterial);
      renderer.setScreenRead(true);
      expect(renderer.activeMaterial()).toBe(screenMaterial);
    });

    it('reads the frame behind the water only in the screen-reading material', () => {
      const renderer = new WaterRenderer(new THREE.Scene(), flatHeightAt, allWet(), 4);
      expect(readsViewport(renderer.activeMaterial())).toBe(true);
      expect(readsViewport(renderer.blendedSurfaceMaterial())).toBe(false);
    });

    it('lays the blended material over the frame by an alpha, not opaque', () => {
      const blended = new WaterRenderer(
        new THREE.Scene(),
        flatHeightAt,
        allWet(),
        4,
      ).blendedSurfaceMaterial();
      expect(blended.transparent).toBe(true);
      expect(blended.depthWrite).toBe(false);
      expect(blended.opacityNode).toBeTruthy();
    });
  });

  describe('when the terrain changes the water', () => {
    const size = 12;
    let ground: Float32Array;
    const heightOf = (x: number, z: number): number =>
      ground[Math.floor(z / TILE_METERS) * size + Math.floor(x / TILE_METERS)] ?? 0;
    const setup = (): { renderer: WaterRenderer; mask: Uint8Array; mesh: THREE.Mesh } => {
      ground = new Float32Array(size * size).fill(5);
      for (let z = 4; z < 8; z++) for (let x = 0; x < size; x++) ground[z * size + x] = -4;
      const mask = maskOf(heightOf, size);
      const scene = new THREE.Scene();
      const renderer = new WaterRenderer(scene, heightOf, mask, size);
      return { renderer, mask, mesh: scene.children[0] as THREE.Mesh };
    };
    /** Depth of the vertex standing on a tile's centre. */
    const depthAtTile = (mesh: THREE.Mesh, tx: number, tz: number): number | undefined => {
      const position = mesh.geometry.attributes.position!;
      const depth = mesh.geometry.attributes.waterShape!;
      for (let i = 0; i < position.count; i++) {
        if (
          position.getX(i) === (tx + 0.5) * TILE_METERS &&
          position.getZ(i) === (tz + 0.5) * TILE_METERS
        )
          return depth.getX(i);
      }
      return undefined;
    };
    /** A player digs the bank tile (6, 3) down to 6 m below sea level, as clientgrid does to heights and mask. */
    const dig = (mask: Uint8Array): void => {
      ground[3 * size + 6] = -6;
      mask[3 * size + 6] = 1;
    };

    const dug = [{ x: 6, z: 3, w: 1, h: 1 }];

    it('does not rebuild for a patch with no water in or beside it', () => {
      const { renderer, mesh } = setup();
      const before = mesh.geometry;
      renderer.markTerrainChanged([{ x: 0, z: 0, w: 3, h: 2 }]);
      renderer.update(5000, 0);
      expect(mesh.geometry).toBe(before);
    });

    it('rebuilds for a patch beside water, and for one over water that has just become land', () => {
      const { renderer, mask, mesh } = setup();
      const before = mesh.geometry;
      renderer.markTerrainChanged([{ x: 0, z: 3, w: 1, h: 1 }]);
      renderer.update(600, 0);
      expect(mesh.geometry).not.toBe(before);

      const filled = mesh.geometry;
      ground[5 * size + 5] = 5;
      mask[5 * size + 5] = 0;
      renderer.markTerrainChanged([{ x: 5, z: 5, w: 1, h: 1 }]);
      renderer.update(600, 0);
      expect(mesh.geometry).not.toBe(filled);
    });

    it('keeps the old depth until the edits settle, then draws the dug tile with its new depth and kind', () => {
      const { renderer, mask, mesh } = setup();
      expect(renderer.kindAt(6, 3)).toBe(WaterKind.None);
      expect(depthAtTile(mesh, 6, 3)).toBe(0);

      dig(mask);
      renderer.markTerrainChanged(dug);
      renderer.update(WATER_REBUILD_SETTLE_S * 1000 * 0.9, 0);
      expect(renderer.kindAt(6, 3)).toBe(WaterKind.None);
      expect(depthAtTile(mesh, 6, 3)).toBe(0);

      renderer.update(WATER_REBUILD_SETTLE_S * 1000 * 0.2, 0);
      expect(renderer.kindAt(6, 3)).toBe(WaterKind.Lake);
      expect(depthAtTile(mesh, 6, 3)).toBeCloseTo(6, 5);
    });

    it('waits for a further edit to settle too: each edit restarts the wait', () => {
      const { renderer, mask, mesh } = setup();
      dig(mask);
      renderer.markTerrainChanged(dug);
      renderer.update(400, 0);
      renderer.markTerrainChanged(dug);
      renderer.update(400, 0);
      expect(depthAtTile(mesh, 6, 3)).toBe(0);
      renderer.update(150, 0);
      expect(depthAtTile(mesh, 6, 3)).toBeCloseTo(6, 5);
    });

    it('does not rebuild when nothing changed', () => {
      const { renderer, mesh } = setup();
      const before = mesh.geometry;
      renderer.update(5000, 0);
      expect(mesh.geometry).toBe(before);
    });

    it('keeps the fouling it was given across a rebuild', () => {
      const { renderer, mask, mesh } = setup();
      const foul = new Uint8Array(size * size);
      foul[5 * size + 5] = 255;
      renderer.setFouling(foul);
      dig(mask);
      renderer.markTerrainChanged(dug);
      renderer.update(600, 0);
      const position = mesh.geometry.attributes.position!;
      let stained = 0;
      for (let i = 0; i < position.count; i++) {
        if (renderer.foulingAtVertex(i) !== 1) continue;
        stained++;
        // Every stained vertex lies on the fouled tile, its boundary included.
        expect(position.getX(i)).toBeGreaterThanOrEqual(5 * TILE_METERS);
        expect(position.getX(i)).toBeLessThanOrEqual(6 * TILE_METERS);
        expect(position.getZ(i)).toBeGreaterThanOrEqual(5 * TILE_METERS);
        expect(position.getZ(i)).toBeLessThanOrEqual(6 * TILE_METERS);
      }
      expect(stained).toBe(9); // the tile's 3 x 3 vertices at half-tile spacing
    });
  });

  it('carries the depth, in the first slot of waterShape, from the injected heightAt sampler', () => {
    const scene = new THREE.Scene();
    new WaterRenderer(scene, mixedHeightAt, maskOf(mixedHeightAt, 4), 4);
    const mesh = scene.children[0] as THREE.Mesh;
    const position = mesh.geometry.attributes.position!;
    const depth = mesh.geometry.attributes.waterShape!;
    expect(depth.count).toBe(position.count);

    let sawDeep = false;
    let sawDry = false;
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i);
      const d = depth.getX(i);
      if (x < 32) {
        expect(d).toBeCloseTo(5, 5); // SEA_LEVEL(0) - (-5)
        sawDeep = true;
      } else {
        expect(d).toBe(0); // dry land clamps to 0 (occluded by terrain anyway)
        sawDry = true;
      }
    }
    expect(sawDeep).toBe(true);
    expect(sawDry).toBe(true);
  });

  it('setVisible toggles the mesh visibility', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    const mesh = scene.children[0] as THREE.Mesh;
    expect(mesh.visible).toBe(true);
    water.setVisible(false);
    expect(mesh.visible).toBe(false);
    water.setVisible(true);
    expect(mesh.visible).toBe(true);
  });

  it('hides a surface with nothing to draw, even when asked to show it', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, new Uint8Array(MAP_SIZE * MAP_SIZE), 4);
    const mesh = scene.children[0] as THREE.Mesh;
    expect(mesh.visible).toBe(false);
    water.setVisible(true);
    expect(mesh.visible).toBe(false);
  });

  it('update() accumulates elapsed time from dtMs (in seconds)', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    expect(water.elapsedSeconds()).toBe(0);
    water.update(500, 0);
    expect(water.elapsedSeconds()).toBeCloseTo(0.5, 9);
    water.update(250, 0);
    expect(water.elapsedSeconds()).toBeCloseTo(0.75, 9);
  });

  it('pinClock holds the clock at a time, whatever frames pass, until it is released', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    water.pinClock(12.5);
    water.update(1000, 0);
    water.update(1000, 0);
    expect(water.elapsedSeconds()).toBe(12.5);
    water.pinClock(null);
    water.update(500, 0);
    expect(water.elapsedSeconds()).toBeCloseTo(13, 9);
  });

  it('update() ignores negative dtMs rather than rewinding the clock', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    water.update(1000, 0);
    const before = water.elapsedSeconds();
    water.update(-500, 0);
    expect(water.elapsedSeconds()).toBe(before);
  });

  it('update() does not throw across in-range and out-of-range nightFactor values', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    for (const nf of [-3, 0, 0.4, 1, 6]) {
      expect(() => water.update(16, nf)).not.toThrow();
    }
  });

  it('works without any DirectionalLight in the scene (falls back gracefully)', () => {
    const scene = new THREE.Scene();
    expect(() => {
      const water = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
      water.update(16, 0.5);
    }).not.toThrow();
  });

  it('tracks a DirectionalLight already present in the scene without throwing', () => {
    const scene = new THREE.Scene();
    const sun = new THREE.DirectionalLight(0xffffff, 1);
    sun.position.set(10, 20, 5);
    scene.add(sun.target);
    scene.add(sun);
    const water = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    expect(() => water.update(16, 0.1)).not.toThrow();
  });

  it('material is translucent and does not write depth (matches the flat-plane water it replaces)', () => {
    const scene = new THREE.Scene();
    new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    const mesh = scene.children[0] as THREE.Mesh;
    const material = mesh.material as THREE.Material;
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(false);
  });

  it('does not leak meshes across repeated update() calls', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    for (let i = 0; i < 20; i++) water.update(16, 0.3);
    expect(scene.children.length).toBe(2);
  });

  it('setSkyColors accepts zenith/horizon RGB tuples without throwing', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    expect(() => water.setSkyColors([0.1, 0.2, 0.9], [0.8, 0.85, 0.95])).not.toThrow();
  });

  it('setSkyColors can be called every frame alongside update() without throwing or leaking meshes', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    for (let i = 0; i < 10; i++) {
      water.setSkyColors([0.05 * i, 0.2, 0.3], [0.5, 0.6, 0.05 * i]);
      water.update(16, i / 10);
    }
    expect(scene.children.length).toBe(2);
  });

  it('setSkyColors does not throw for out-of-range (unclamped) color components', () => {
    const scene = new THREE.Scene();
    const water = new WaterRenderer(scene, flatHeightAt, allWet(), 4);
    expect(() => water.setSkyColors([-1, 2, 0], [3, -2, 1])).not.toThrow();
  });
});
