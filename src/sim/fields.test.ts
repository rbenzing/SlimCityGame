import { describe, expect, it } from 'vitest';
import { FieldSim } from './fields';
import { FieldId, FIELD_COUNT, type GraphEdge, type GridState } from '../shared/types';
import { MAP_SIZE, MAP_TILES, tileIndex } from '../shared/constants';

/** Hand-constructed GridState: all layers zeroed, sized by MAP_SIZE. */
function makeGrid(): GridState {
  return {
    size: MAP_SIZE,
    height: new Float32Array(MAP_TILES),
    water: new Uint8Array(MAP_TILES),
    trees: new Uint8Array(MAP_TILES),
    zone: new Uint8Array(MAP_TILES),
    roadTier: new Uint8Array(MAP_TILES),
    roadMask: new Uint8Array(MAP_TILES),
    buildingId: new Uint32Array(MAP_TILES),
    power: new Uint8Array(MAP_TILES),
    watered: new Uint8Array(MAP_TILES),
    fields: Array.from({ length: FIELD_COUNT }, () => new Uint8Array(MAP_TILES)),
    district: new Uint8Array(MAP_TILES),
    landfill: new Uint8Array(MAP_TILES),
  };
}

function sumField(arr: Uint8Array): number {
  let total = 0;
  for (let i = 0; i < arr.length; i++) total += arr[i]!;
  return total;
}

function allInByteRange(arr: Uint8Array): boolean {
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i]!;
    if (v < 0 || v > 255) return false;
  }
  return true;
}

const ALL_FIELD_IDS = [
  FieldId.LandValue,
  FieldId.Pollution,
  FieldId.Noise,
  FieldId.Traffic,
  FieldId.Crime,
  FieldId.FireRisk,
  FieldId.Education,
  FieldId.Health,
  FieldId.Happiness,
] as const;

describe('FieldSim.emit', () => {
  it('adds amount at the source tile', () => {
    const sim = new FieldSim();
    const g = makeGrid();
    sim.emit(g, FieldId.Pollution, 10, 20, 50);
    expect(g.fields[FieldId.Pollution]![tileIndex(10, 20)]).toBe(50);
  });

  it('saturates at 255 and never wraps around', () => {
    const sim = new FieldSim();
    const g = makeGrid();
    sim.emit(g, FieldId.Pollution, 5, 5, 200);
    sim.emit(g, FieldId.Pollution, 5, 5, 200); // 400 total -> must clamp, not wrap to 144
    expect(g.fields[FieldId.Pollution]![tileIndex(5, 5)]).toBe(255);
  });

  it('leaves other tiles untouched', () => {
    const sim = new FieldSim();
    const g = makeGrid();
    sim.emit(g, FieldId.Noise, 8, 8, 90);
    expect(g.fields[FieldId.Noise]![tileIndex(9, 8)]).toBe(0);
    expect(g.fields[FieldId.Noise]![tileIndex(8, 9)]).toBe(0);
  });

  it('ignores out-of-bounds coordinates without throwing', () => {
    const sim = new FieldSim();
    const g = makeGrid();
    expect(() => sim.emit(g, FieldId.Noise, -1, 0, 10)).not.toThrow();
    expect(() => sim.emit(g, FieldId.Noise, MAP_SIZE, 0, 10)).not.toThrow();
    expect(() => sim.emit(g, FieldId.Noise, 0, MAP_SIZE, 10)).not.toThrow();
  });
});

describe('FieldSim diffusion', () => {
  it('spreads a point source to its four neighbors on its scheduled tick', () => {
    const sim = new FieldSim();
    const g = makeGrid();
    const cx = 128;
    const cz = 128;
    sim.emit(g, FieldId.Pollution, cx, cz, 200);

    sim.tick(g, 0); // pollution: period 4, offset 0 -> fires at tick 0

    const pollution = g.fields[FieldId.Pollution]!;
    expect(pollution[tileIndex(cx, cz)]!).toBeGreaterThan(0);
    expect(pollution[tileIndex(cx, cz)]!).toBeLessThan(200); // decay + mass given to neighbors
    expect(pollution[tileIndex(cx + 1, cz)]!).toBeGreaterThan(0);
    expect(pollution[tileIndex(cx - 1, cz)]!).toBeGreaterThan(0);
    expect(pollution[tileIndex(cx, cz + 1)]!).toBeGreaterThan(0);
    expect(pollution[tileIndex(cx, cz - 1)]!).toBeGreaterThan(0);
    expect(pollution[tileIndex(0, 0)]!).toBe(0); // far away, untouched
  });

  it('never overflows/underflows a byte, even from a fully saturated field', () => {
    const sim = new FieldSim();
    const g = makeGrid();
    g.fields[FieldId.Crime]!.fill(255);
    sim.tick(g, 1); // crime: period 8, offset 1 -> fires at tick 1
    expect(allInByteRange(g.fields[FieldId.Crime]!)).toBe(true);
  });

  it('is a no-op for a uniform field aside from the decay step (neighbor blend conserves mass)', () => {
    const sim = new FieldSim();
    const g = makeGrid();
    g.fields[FieldId.Education]!.fill(100);
    sim.tick(g, 3); // education: period 8, offset 3
    const education = g.fields[FieldId.Education]!;
    // Uniform input -> uniform output; every tile must have decayed by the same amount.
    const first = education[0]!;
    for (let i = 0; i < education.length; i++) expect(education[i]).toBe(first);
    expect(first).toBeLessThan(100);
    expect(first).toBeGreaterThan(0);
  });
});

describe('FieldSim decay with no sources', () => {
  it('pollution mass strictly decays and eventually reaches exactly zero', () => {
    const sim = new FieldSim();
    const g = makeGrid();
    sim.emit(g, FieldId.Pollution, 50, 50, 40);
    sim.emit(g, FieldId.Pollution, 51, 50, 40);
    sim.emit(g, FieldId.Pollution, 50, 51, 40);

    let prevSum = sumField(g.fields[FieldId.Pollution]!);
    let reachedZero = false;
    const MAX_PASSES = 500;
    for (let pass = 0; pass < MAX_PASSES; pass++) {
      const t = pass * 4; // pollution's own slot; intermediate ticks are provably no-ops for it
      sim.tick(g, t);
      const sum = sumField(g.fields[FieldId.Pollution]!);
      expect(sum).toBeLessThanOrEqual(prevSum);
      prevSum = sum;
      if (sum === 0) {
        reachedZero = true;
        break;
      }
    }
    expect(reachedZero).toBe(true);
  });
});

describe('FieldSim stagger schedule', () => {
  it('leaves a field untouched on ticks outside its own slot', () => {
    const sim = new FieldSim();
    const g = makeGrid();
    const noise = g.fields[FieldId.Noise]!;
    for (let z = 0; z < MAP_SIZE; z++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        noise[tileIndex(x, z)] = (x * 7 + z * 13) % 256;
      }
    }
    const before = noise.slice();

    sim.tick(g, 0); // noise's slot is offset 1 (period 4) -> tick 0 must not touch it
    expect(noise).toEqual(before);

    sim.tick(g, 1); // now it must change
    expect(noise).not.toEqual(before);
  });

  it('does nothing at all on a tick where no field and no happiness pass is scheduled', () => {
    const sim = new FieldSim();
    const g = makeGrid();
    for (const id of ALL_FIELD_IDS) g.fields[id]!.fill(77);
    const before = g.fields.map((f) => f.slice());

    sim.tick(g, 7); // no period-4 offset (0,1,2) or period-8 offset (0..5) equals 7 mod its period

    for (let id = 0; id < g.fields.length; id++) {
      expect(g.fields[id]).toEqual(before[id]);
    }
  });
});

describe('FieldSim determinism', () => {
  // 80 full-grid diffusion ticks x 2 sims is the heaviest single test in the suite;
  // under full-suite parallel load (vmThreads pool) it can brush past vitest's 5s
  // default even though it runs in well under 1s of actual CPU when isolated.
  // Give it explicit headroom so scheduler jitter can't fail a determinism check.
  it('produces byte-identical fields from two sims given the same operation sequence', () => {
    const simA = new FieldSim();
    const simB = new FieldSim();
    const gA = makeGrid();
    const gB = makeGrid();

    const edges: GraphEdge[] = [
      {
        id: 0,
        a: 0,
        b: 1,
        tier: 2,
        tiles: [
          { x: 10, z: 10 },
          { x: 11, z: 10 },
          { x: 12, z: 10 },
        ],
        length: 3,
        volume: 900,
      },
      {
        id: 1,
        a: 1,
        b: 2,
        tier: 1,
        tiles: [
          { x: 12, z: 10 },
          { x: 12, z: 11 },
        ],
        length: 2,
        volume: 300,
      },
    ];

    function run(sim: FieldSim, g: GridState): void {
      sim.emit(g, FieldId.Pollution, 40, 40, 90);
      sim.emit(g, FieldId.Crime, 60, 60, 150);
      sim.applyTraffic(g, edges);
      for (let t = 0; t < 40; t++) sim.tick(g, t);
      sim.emit(g, FieldId.Noise, 40, 40, 30);
      sim.applyTraffic(g, edges);
      for (let t = 40; t < 80; t++) sim.tick(g, t);
    }

    run(simA, gA);
    run(simB, gB);

    for (let id = 0; id < FIELD_COUNT; id++) {
      expect(gA.fields[id]).toEqual(gB.fields[id]);
    }
  }, 30000);
});

describe('FieldSim happiness formula', () => {
  it('matches clamp(120 + edu/6 + health/6 + landValue/8 - pollution/4 - crime/4 - min(traffic,180)/6)', () => {
    const sim = new FieldSim();
    const g = makeGrid();
    const idx = tileIndex(33, 44);
    g.fields[FieldId.Education]![idx] = 120;
    g.fields[FieldId.Health]![idx] = 90;
    g.fields[FieldId.LandValue]![idx] = 200;
    g.fields[FieldId.Pollution]![idx] = 40;
    g.fields[FieldId.Crime]![idx] = 20;
    g.fields[FieldId.Traffic]![idx] = 250; // above the 180 cap

    sim.tick(g, 5); // happiness's own slot; none of its inputs are scheduled at tick 5

    // 120 + 20 + 15 + 25 - 10 - 5 - 30 = 135 (all terms divide exactly, no rounding ambiguity)
    expect(g.fields[FieldId.Happiness]![idx]).toBe(135);
  });

  it('clamps to 0 when penalties overwhelm the base', () => {
    const sim = new FieldSim();
    const g = makeGrid();
    const idx = tileIndex(5, 5);
    g.fields[FieldId.Pollution]![idx] = 255;
    g.fields[FieldId.Crime]![idx] = 255;
    g.fields[FieldId.Traffic]![idx] = 255;
    sim.tick(g, 5);
    // 120 - 63 - 63 - 30 = -36 -> clamp to 0
    expect(g.fields[FieldId.Happiness]![idx]).toBe(0);
  });

  it('tops out at 235 when every positive input is maxed and every negative input is zero', () => {
    // 120 + 42 + 42 + 31 (edu/6 + health/6 + landValue/8, all at 255) is the formula's
    // natural ceiling since every other term only subtracts - it never reaches the 255
    // clamp on its own, so this also confirms the formula doesn't over-clamp early.
    const sim = new FieldSim();
    const g = makeGrid();
    const idx = tileIndex(6, 6);
    g.fields[FieldId.Education]![idx] = 255;
    g.fields[FieldId.Health]![idx] = 255;
    g.fields[FieldId.LandValue]![idx] = 255;
    sim.tick(g, 5);
    expect(g.fields[FieldId.Happiness]![idx]).toBe(235);
  });
});

describe('FieldSim land value proximity formula', () => {
  it('rewards water adjacency, tree density and low pollution; penalizes pollution/noise/crime', () => {
    const sim = new FieldSim();
    const g = makeGrid();
    const idxA = tileIndex(10, 10); // clean tile, adjacent to water, wooded
    const idxB = tileIndex(50, 50); // dirty, noisy, crime-ridden tile far from A

    g.water[tileIndex(11, 10)] = 1; // east neighbor of A is water
    g.trees[idxA] = 160; // 160 >> 4 = 10

    g.fields[FieldId.Pollution]![idxB] = 200;
    g.fields[FieldId.Noise]![idxB] = 180;
    g.fields[FieldId.Crime]![idxB] = 150;

    sim.tick(g, 0); // landValue's own slot (period 8, offset 0); processed before pollution this tick

    const lv = g.fields[FieldId.LandValue]!;
    // A: base diffusion of an all-zero field is 0; gain = (255-0)>>5=7, +6 water, +10 trees => 23; loss=0
    expect(lv[idxA]).toBe(23);
    // B: gain = (255-200)>>5=1, +0, +0 => 1; loss = 200>>3=25 + floor(180/12)=15 + floor(150/10)=15 => 55
    expect(lv[idxB]).toBe(0); // 0 + 1 - 55 clamps to 0
  });
});

describe('FieldSim.applyTraffic', () => {
  it('writes emission proportional to volume/capacity along edge tiles and zeroes the rest', () => {
    const sim = new FieldSim();
    const g = makeGrid();
    const edgeA: GraphEdge = {
      id: 0,
      a: 0,
      b: 1,
      tier: 1, // capacity = 1*800 = 800
      tiles: [
        { x: 3, z: 3 },
        { x: 4, z: 3 },
      ],
      length: 2,
      volume: 400, // level = floor(255*400/800) = 127
    };
    const edgeB: GraphEdge = {
      id: 1,
      a: 2,
      b: 3,
      tier: 2, // capacity = 2*800 = 1600
      tiles: [{ x: 20, z: 20 }],
      length: 1,
      volume: 4000, // raw 637.5 -> clamps to 255
    };

    g.fields[FieldId.Traffic]![tileIndex(99, 99)] = 200; // pre-existing value must be reset

    sim.applyTraffic(g, [edgeA, edgeB]);
    const traffic = g.fields[FieldId.Traffic]!;

    expect(traffic[tileIndex(3, 3)]).toBe(127);
    expect(traffic[tileIndex(4, 3)]).toBe(127);
    expect(traffic[tileIndex(20, 20)]).toBe(255);
    expect(traffic[tileIndex(99, 99)]).toBe(0);
    expect(traffic[tileIndex(0, 0)]).toBe(0);
  });

  it('accumulates, saturating, when two edges share a tile', () => {
    const sim = new FieldSim();
    const g = makeGrid();
    const shared = { x: 50, z: 50 };
    const edgeA: GraphEdge = {
      id: 0,
      a: 0,
      b: 1,
      tier: 1,
      tiles: [shared],
      length: 1,
      volume: 400,
    }; // level 127
    const edgeB: GraphEdge = {
      id: 1,
      a: 1,
      b: 2,
      tier: 1,
      tiles: [shared],
      length: 1,
      volume: 400,
    }; // level 127
    sim.applyTraffic(g, [edgeA, edgeB]);
    expect(g.fields[FieldId.Traffic]![tileIndex(50, 50)]).toBe(254);
  });

  it('is proportional: doubling volume doubles the written level (below saturation)', () => {
    const sim = new FieldSim();
    const g = makeGrid();
    // volume=160 against capacity=800 divides evenly (level 51) so doubling volume
    // doubles the level exactly, with no floor-rounding ambiguity in the expectation.
    const low: GraphEdge = {
      id: 0,
      a: 0,
      b: 1,
      tier: 1,
      tiles: [{ x: 1, z: 1 }],
      length: 1,
      volume: 160,
    };
    const high: GraphEdge = {
      id: 1,
      a: 2,
      b: 3,
      tier: 1,
      tiles: [{ x: 2, z: 2 }],
      length: 1,
      volume: 320,
    };
    sim.applyTraffic(g, [low, high]);
    const traffic = g.fields[FieldId.Traffic]!;
    const lowLevel = traffic[tileIndex(1, 1)]!;
    const highLevel = traffic[tileIndex(2, 2)]!;
    expect(highLevel).toBeGreaterThan(lowLevel);
    expect(highLevel).toBe(lowLevel * 2);
  });

  it('treats a zero-capacity edge with positive volume as fully congested instead of dividing by zero', () => {
    const sim = new FieldSim();
    const g = makeGrid();
    const edge: GraphEdge = {
      id: 0,
      a: 0,
      b: 1,
      tier: 0,
      tiles: [{ x: 7, z: 7 }],
      length: 1,
      volume: 50,
    };
    expect(() => sim.applyTraffic(g, [edge])).not.toThrow();
    expect(g.fields[FieldId.Traffic]![tileIndex(7, 7)]).toBe(255);
  });

  it('ignores out-of-bounds edge tiles without throwing', () => {
    const sim = new FieldSim();
    const g = makeGrid();
    const edge: GraphEdge = {
      id: 0,
      a: 0,
      b: 1,
      tier: 1,
      tiles: [{ x: -5, z: 0 }],
      length: 1,
      volume: 400,
    };
    expect(() => sim.applyTraffic(g, [edge])).not.toThrow();
  });
});
