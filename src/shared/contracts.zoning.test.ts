/**
 * Zoning types expansion contract: the three appended ZoneType values
 * (ResMediumRow=6, ResMedium=7, Mixed=8) and
 * the catalog entries that let them grow real buildings, plus the ResHigh/
 * ComHigh milestone retune that turns the 5-zone model into the fuller CS
 * progression.
 *
 * SAVE-SAFETY is the load-bearing invariant here: ZoneType numbers 1–5 are
 * serialized into grid.zone bytes, saves, and ZonePatch — this suite pins
 * them so a future reorder can never silently corrupt saves. New zones only
 * ever APPEND.
 *
 * Type-level guarantees are enforced by `npx tsc --noEmit` over this file
 * (vitest transpiles without type-checking); runtime asserts pin the
 * prescribed values.
 */
import { describe, expect, it } from 'vitest';

import type { BuildingCatalogEntry } from './types';
import { ZoneType } from './types';
import { MILESTONES } from './constants';
import catalogData from '../data/catalog.json';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const byId = (id: string) => catalog.find((e) => e.id === id);

/** RGB channel split of a packed 0xRRGGBB catalog color. */
function rgb(color: number): { r: number; g: number; b: number } {
  return { r: (color >> 16) & 0xff, g: (color >> 8) & 0xff, b: color & 0xff };
}

describe('ZoneType expansion (UI-SPEC §6.21) — SAVE-SAFE append', () => {
  it('keeps the persisted zone numbers 1–5 EXACTLY (grid.zone bytes / saves / ZonePatch)', () => {
    expect(ZoneType.None).toBe(0);
    expect(ZoneType.ResLow).toBe(1);
    expect(ZoneType.ResHigh).toBe(2);
    expect(ZoneType.ComLow).toBe(3);
    expect(ZoneType.ComHigh).toBe(4);
    expect(ZoneType.Industrial).toBe(5);
  });

  it('appends the three new zones at 6/7/8', () => {
    expect(ZoneType.ResMediumRow).toBe(6);
    expect(ZoneType.ResMedium).toBe(7);
    expect(ZoneType.Mixed).toBe(8);
  });

  it('assigns every zone a unique number (no collision after the append)', () => {
    const values = Object.values(ZoneType);
    expect(new Set(values).size).toBe(values.length);
    // All fit in a Uint8 zone byte.
    for (const v of values) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
  });
});

describe('Medium Density Row Housing catalog (zone 6, §6.21)', () => {
  const rows = catalog.filter((e) => e.zone === ZoneType.ResMediumRow);

  it('has exactly 3 levels, res category, M1 gated', () => {
    expect(rows).toHaveLength(3);
    expect(rows.map((e) => e.level).sort()).toEqual([1, 2, 3]);
    for (const e of rows) {
      expect(e.category).toBe('res');
      expect(e.unlockMilestone).toBe(1);
    }
  });

  it('grows real residents and draws power/water — no dead zone', () => {
    for (const e of rows) {
      expect(e.residents).toBeGreaterThan(0);
      expect(e.jobs ?? 0).toBe(0); // pure residential
      expect(e.powerUse).toBeGreaterThan(0);
      expect(e.waterUse).toBeGreaterThan(0);
    }
  });

  it('reads as NARROW attached rows: width 1, depth 2..6, low height 7..11m', () => {
    for (const e of rows) {
      expect(e.footprint.w).toBe(1);
      expect(e.footprint.d).toBeGreaterThanOrEqual(2);
      expect(e.footprint.d).toBeLessThanOrEqual(6);
      expect(e.height).toBeGreaterThanOrEqual(7);
      expect(e.height).toBeLessThanOrEqual(11);
    }
  });

  it('scales residents monotonically with level', () => {
    const sorted = [...rows].sort((a, b) => (a.level ?? 0) - (b.level ?? 0));
    expect(sorted[0]!.residents!).toBeLessThan(sorted[1]!.residents!);
    expect(sorted[1]!.residents!).toBeLessThan(sorted[2]!.residents!);
  });
});

describe('Medium Density Housing catalog (zone 7, §6.21)', () => {
  const meds = catalog.filter((e) => e.zone === ZoneType.ResMedium);

  it('has exactly 3 levels, res category, M2 gated', () => {
    expect(meds).toHaveLength(3);
    expect(meds.map((e) => e.level).sort()).toEqual([1, 2, 3]);
    for (const e of meds) {
      expect(e.category).toBe('res');
      expect(e.unlockMilestone).toBe(2);
    }
  });

  it('reads as small apartment blocks: 2×2..3×3 footprint, mid-rise 14..24m', () => {
    for (const e of meds) {
      expect(e.footprint.w).toBeGreaterThanOrEqual(2);
      expect(e.footprint.w).toBeLessThanOrEqual(3);
      expect(e.footprint.d).toBeGreaterThanOrEqual(2);
      expect(e.footprint.d).toBeLessThanOrEqual(3);
      expect(e.height).toBeGreaterThanOrEqual(14);
      expect(e.height).toBeLessThanOrEqual(24);
    }
  });

  it('carries MORE residents than row housing at the same level', () => {
    const rowsL1 = byId('res-medium-row-1')!;
    const medL1 = byId('res-medium-1')!;
    expect(medL1.residents!).toBeGreaterThan(rowsL1.residents!);
    for (const e of meds) {
      expect(e.jobs ?? 0).toBe(0);
      expect(e.residents).toBeGreaterThan(0);
    }
  });
});

describe('Mixed Housing catalog (zone 8, §6.21)', () => {
  const mixed = catalog.filter((e) => e.zone === ZoneType.Mixed);

  it('has exactly 3 levels, res category (res-sector demand), M3 gated', () => {
    expect(mixed).toHaveLength(3);
    expect(mixed.map((e) => e.level).sort()).toEqual([1, 2, 3]);
    for (const e of mixed) {
      expect(e.category).toBe('res');
      expect(e.unlockMilestone).toBe(3);
    }
  });

  it('carries BOTH residents AND jobs (commercial ground floor + apartments)', () => {
    for (const e of mixed) {
      expect(e.residents).toBeGreaterThan(0);
      expect(e.jobs).toBeGreaterThan(0);
    }
  });

  it('reads as mid/high-rise mixed-use: 2×2..3×3 footprint, 18..30m', () => {
    for (const e of mixed) {
      expect(e.footprint.w).toBeGreaterThanOrEqual(2);
      expect(e.footprint.w).toBeLessThanOrEqual(3);
      expect(e.height).toBeGreaterThanOrEqual(18);
      expect(e.height).toBeLessThanOrEqual(30);
    }
  });

  it('wears a distinct teal — between residential green and commercial blue', () => {
    for (const e of mixed) {
      const { r, g, b } = rgb(e.color);
      // Teal: green is the dominant channel, blue is strong, red is lowest.
      expect(g).toBeGreaterThan(r);
      expect(b).toBeGreaterThan(r);
      // Not pure green (blue present) and not pure blue (green >= blue).
      expect(g).toBeGreaterThanOrEqual(b);
      expect(b).toBeGreaterThan(g * 0.5);
    }
  });
});

describe('Residential zone families read as distinct greens (§6.21 tints)', () => {
  it('the NEW medium residential families (Row / Medium) wear residential greens', () => {
    // The "residential greens" rule applies to the newly-added families; the
    // pre-existing ResLow/ResHigh entries keep their frozen cool tones
    // (save-safe continuity — their colors are not retinted here).
    const greenZones: ZoneType[] = [ZoneType.ResMediumRow, ZoneType.ResMedium];
    const greens = catalog.filter((e) => e.zone !== undefined && greenZones.includes(e.zone));
    expect(greens.length).toBe(6);
    for (const e of greens) {
      const { r, g, b } = rgb(e.color);
      expect(g).toBeGreaterThan(r);
      expect(g).toBeGreaterThan(b);
    }
  });

  it('the three medium/row families are visually distinguishable from one another', () => {
    const row1 = byId('res-medium-row-1')!.color;
    const med1 = byId('res-medium-1')!.color;
    const mix1 = byId('mixed-1')!.color;
    expect(new Set([row1, med1, mix1]).size).toBe(3);
  });
});

describe('ResHigh / ComHigh milestone retune (§6.21 progression)', () => {
  it('gates the ENTIRE ResHigh family to M4 (was 2/3) — large towers arrive at Small City', () => {
    for (const e of catalog.filter((c) => c.zone === ZoneType.ResHigh)) {
      expect(e.unlockMilestone).toBe(4);
    }
  });

  it('gates the ENTIRE ComHigh family to M4 (was 2/3)', () => {
    for (const e of catalog.filter((c) => c.zone === ZoneType.ComHigh)) {
      expect(e.unlockMilestone).toBe(4);
    }
  });

  it('leaves ResLow / ComLow / Industrial low-tier unlocks untouched', () => {
    expect(byId('res-low-1')!.unlockMilestone).toBe(0);
    expect(byId('com-low-1')!.unlockMilestone).toBe(0);
    expect(byId('ind-1')!.unlockMilestone).toBe(0);
  });

  it('every retuned milestone is a valid MILESTONES index', () => {
    for (const e of catalog) {
      expect(e.unlockMilestone).toBeGreaterThanOrEqual(0);
      expect(e.unlockMilestone).toBeLessThan(MILESTONES.length);
    }
  });
});

describe('New grown zones obey grown-building catalog invariants', () => {
  const newIds = [
    'res-medium-row-1',
    'res-medium-row-2',
    'res-medium-row-3',
    'res-medium-1',
    'res-medium-2',
    'res-medium-3',
    'mixed-1',
    'mixed-2',
    'mixed-3',
  ];

  it('all nine new entries exist exactly once', () => {
    for (const id of newIds) {
      expect(catalog.filter((e) => e.id === id)).toHaveLength(1);
    }
  });

  it('are free to grow (cost 0, upkeep 0) like every other zoned building', () => {
    for (const id of newIds) {
      const e = byId(id)!;
      expect(e.cost).toBe(0);
      expect(e.upkeep).toBe(0);
      expect(e.zone).toBeDefined();
      expect(e.level).toBeGreaterThanOrEqual(1);
      expect(e.level).toBeLessThanOrEqual(3);
    }
  });

  it('carry a valid 0xRRGGBB color and a positive height/footprint', () => {
    for (const id of newIds) {
      const e = byId(id)!;
      expect(Number.isInteger(e.color)).toBe(true);
      expect(e.color).toBeGreaterThanOrEqual(0);
      expect(e.color).toBeLessThanOrEqual(0xffffff);
      expect(e.height).toBeGreaterThan(0);
      expect(e.footprint.w).toBeGreaterThan(0);
      expect(e.footprint.d).toBeGreaterThan(0);
    }
  });
});
