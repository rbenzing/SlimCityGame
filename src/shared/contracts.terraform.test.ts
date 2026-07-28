/**
 * Landscaping & water contract additions: the terraform command pair, the
 * snapshot height-patch channel, BrushSettings, and the terrain/water tuning
 * constants.
 *
 * Type-level guarantees are enforced by `npx tsc --noEmit` over this file
 * (vitest transpiles without type-checking); runtime asserts pin the
 * prescribed constant values.
 */
import { describe, expect, it } from 'vitest';

import type { BrushSettings, CityStats, Command, CommandAck, SimSnapshot } from './types';
import {
  MAX_WATER_DEPTH_VIS,
  SEA_LEVEL,
  SHORELINE_BAND_METERS,
  TERRAFORM_BRUSH_MAX,
  TERRAFORM_BRUSH_MIN,
  TERRAFORM_COST_PER_METER_TILE,
  TERRAFORM_STRENGTH_MAX,
  TERRAFORM_STRENGTH_MIN,
} from './constants';

/**
 * Narrowing helper: proves the discriminated union routes both new kinds and
 * leaves every other command flowing through the default arm untouched.
 */
const describeCommand = (cmd: Command): string => {
  switch (cmd.kind) {
    case 'terraform': {
      const target = cmd.targetHeight === undefined ? '' : `->${cmd.targetHeight}m`;
      return `${cmd.mode} @${cmd.center.x},${cmd.center.z} r=${cmd.radius} s=${cmd.strength}${target}`;
    }
    case 'terraformSet':
      return `set ${cmd.w}x${cmd.h} @${cmd.x},${cmd.z} n=${cmd.heights.length}`;
    default:
      return cmd.kind;
  }
};

describe('terraform command (UI-SPEC §6.11)', () => {
  it('carries mode, center, radius and strength', () => {
    expect(
      describeCommand({
        kind: 'terraform',
        mode: 'raise',
        center: { x: 8, z: 120 },
        radius: 4,
        strength: 3,
      }),
    ).toBe('raise @8,120 r=4 s=3');
  });

  it('level mode carries the sampled targetHeight; other modes omit it', () => {
    expect(
      describeCommand({
        kind: 'terraform',
        mode: 'level',
        center: { x: 10, z: 10 },
        radius: TERRAFORM_BRUSH_MIN,
        strength: TERRAFORM_STRENGTH_MIN,
        targetHeight: 6.5,
      }),
    ).toBe('level @10,10 r=2 s=1->6.5m');
  });

  it('accepts exactly the four §6.11 modes', () => {
    const modes = ['raise', 'lower', 'level', 'smooth'] as const;
    const rendered = modes.map((mode) =>
      describeCommand({ kind: 'terraform', mode, center: { x: 0, z: 0 }, radius: 2, strength: 1 }),
    );
    expect(rendered).toEqual([
      'raise @0,0 r=2 s=1',
      'lower @0,0 r=2 s=1',
      'level @0,0 r=2 s=1',
      'smooth @0,0 r=2 s=1',
    ]);
    // Slope is a stretch goal — deliberately NOT in the contract.
    const slope: Command = {
      kind: 'terraform',
      // @ts-expect-error 'slope' is not a terraform mode
      mode: 'slope',
      center: { x: 0, z: 0 },
      radius: 2,
      strength: 1,
    };
    expect(describeCommand(slope)).toBe('slope @0,0 r=2 s=1');
  });

  it('requires strength — a brush without it is not a Command', () => {
    // @ts-expect-error strength is required
    const weak: Command = { kind: 'terraform', mode: 'raise', center: { x: 0, z: 0 }, radius: 4 };
    expect(describeCommand(weak)).toContain('raise');
  });

  it('leaves existing command kinds narrowing as before', () => {
    expect(describeCommand({ kind: 'takeLoan', amount: 500 })).toBe('takeLoan');
    expect(describeCommand({ kind: 'bulldoze', tiles: [{ x: 1, z: 1 }] })).toBe('bulldoze');
  });
});

describe('terraformSet — the float-exact undo patch (UI-SPEC §6.11)', () => {
  it('carries row-major w*h heights: local (col, row) at row * w + col', () => {
    const w = 3;
    const h = 2;
    const heights = new Float32Array([0, 0.5, 1, 1.5, 2, 2.5]);
    const cmd = { kind: 'terraformSet', x: 10, z: 20, w, h, heights } satisfies Command;
    expect(describeCommand(cmd)).toBe('set 3x2 @10,20 n=6');
    expect(cmd.heights).toHaveLength(w * h);
    // World tile (x + 2, z + 1) reads local (col=2, row=1) = index 1*w + 2.
    expect(cmd.heights[1 * w + 2]).toBe(2.5);
  });

  it('preserves float32 values exactly, so undo restores to the bit', () => {
    const heights = new Float32Array([Math.fround(1.1), Math.fround(-2.3)]);
    const cmd = { kind: 'terraformSet', x: 0, z: 0, w: 2, h: 1, heights } satisfies Command;
    expect(cmd.heights[0]).toBe(Math.fround(1.1));
    expect(cmd.heights[1]).toBe(Math.fround(-2.3));
    // @ts-expect-error heights must be a Float32Array, not number[]
    const loose: Command = { kind: 'terraformSet', x: 0, z: 0, w: 1, h: 1, heights: [1] };
    expect(loose.kind).toBe('terraformSet');
  });

  it('serves as the CommandAck inverse of a terraform stroke', () => {
    const ack: CommandAck = {
      seq: 12,
      ok: true,
      cost: 24,
      inverse: [{ kind: 'terraformSet', x: 4, z: 4, w: 9, h: 9, heights: new Float32Array(81) }],
    };
    const first = ack.inverse[0];
    expect(first && describeCommand(first)).toBe('set 9x9 @4,4 n=81');
  });
});

describe('SimSnapshot.heightPatches (worker -> render terrain updates)', () => {
  const stats: CityStats = {
    tick: 0,
    funds: 50_000,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    population: 0,
    jobs: 0,
    employed: 0,
    demand: { res: 0, com: 0, ind: 0 },
    happiness: 50,
    powerSupply: 0,
    powerDemand: 0,
    waterSupply: 0,
    waterDemand: 0,
    milestoneLevel: 0,
    milestoneProgress: 0,
    loanBalance: 0,
    taxRates: { res: 0.09, com: 0.09, ind: 0.09 },
    serviceFunding: { police: 1, fire: 1, health: 1, education: 1, park: 1 },
  };

  it('is optional — pre-terraform snapshots remain valid', () => {
    const snap: SimSnapshot = { stats };
    expect(snap.heightPatches).toBeUndefined();
  });

  it('carries region patches shaped exactly like the terraformSet payload', () => {
    const region = { x: 32, z: 64, w: 4, h: 3, heights: new Float32Array(12) };
    // One shape, both directions: undo command payload and snapshot channel.
    const cmd: Command = { kind: 'terraformSet', ...region };
    const snap: SimSnapshot = { stats, heightPatches: [region] };
    expect(cmd.kind).toBe('terraformSet');
    const patch = snap.heightPatches?.[0];
    expect(patch?.x).toBe(32);
    expect(patch?.z).toBe(64);
    expect(patch?.heights).toHaveLength(patch ? patch.w * patch.h : -1);
  });
});

describe('BrushSettings (tool options -> tools, UI-SPEC §6.11/§5)', () => {
  it('carries radius + strength, both required', () => {
    const brush: BrushSettings = { radius: 8, strength: 3 };
    expect(brush).toEqual({ radius: 8, strength: 3 });
    // @ts-expect-error strength missing — a partial object is not a BrushSettings
    const partial: BrushSettings = { radius: 8 };
    expect(partial.strength).toBeUndefined();
  });
});

describe('terraform & water constants (UI-SPEC §6.11)', () => {
  it('brush radius runs 2–16 tiles', () => {
    expect(TERRAFORM_BRUSH_MIN).toBe(2);
    expect(TERRAFORM_BRUSH_MAX).toBe(16);
    expect(TERRAFORM_BRUSH_MIN).toBeLessThan(TERRAFORM_BRUSH_MAX);
  });

  it('strength runs 1–5', () => {
    expect(TERRAFORM_STRENGTH_MIN).toBe(1);
    expect(TERRAFORM_STRENGTH_MAX).toBe(5);
    expect(TERRAFORM_STRENGTH_MIN).toBeLessThan(TERRAFORM_STRENGTH_MAX);
  });

  it('terraform costs ¢0.5 per meter of |Δheight| per tile', () => {
    expect(TERRAFORM_COST_PER_METER_TILE).toBe(0.5);
    expect(TERRAFORM_COST_PER_METER_TILE).toBeGreaterThan(0);
  });

  it('seabed tint saturates 12 m below the surface', () => {
    expect(MAX_WATER_DEPTH_VIS).toBe(12);
    expect(MAX_WATER_DEPTH_VIS).toBeGreaterThan(0);
  });

  it('shoreline foam band is a ±0.4 m sliver around sea level', () => {
    expect(SHORELINE_BAND_METERS).toBe(0.4);
    expect(SHORELINE_BAND_METERS).toBeGreaterThan(0);
    expect(SHORELINE_BAND_METERS).toBeLessThan(MAX_WATER_DEPTH_VIS);
    // The band brackets SEA_LEVEL: |height − SEA_LEVEL| < SHORELINE_BAND_METERS.
    expect(SEA_LEVEL).toBe(0);
  });
});
