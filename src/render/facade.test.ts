import { describe, expect, it } from 'vitest';
import { BuildingCatalogEntry, ZoneType } from '../shared/types';
import { TILE_METERS } from '../shared/constants';
import {
  ACCENT_BLUE,
  ACCENT_RED,
  BAY_WIDTH_METERS,
  FLOOR_HEIGHT_METERS,
  GROUND_FLOOR_METERS,
  HUE_JITTER_FRACTION,
  INDUSTRIAL_ROOF_COLOR,
  INDUSTRIAL_WALL_PALETTE,
  MAX_WALL_SATURATION,
  MIN_ROOF_WALL_DISTANCE,
  PARAPET_METERS,
  ROOF_PALETTE,
  RGB,
  deriveFacadeParams,
  groundFloorBand,
  hslToRgb,
  industrialAccentColor,
  industrialWallBase,
  parapetBand,
  rgbToHsl,
} from './facade';

function entry(overrides: Partial<BuildingCatalogEntry> = {}): BuildingCatalogEntry {
  return {
    id: 'test-entry',
    name: 'Test Entry',
    category: 'res',
    footprint: { w: 1, d: 1 },
    height: 10,
    color: 0x8899aa,
    powerUse: 0,
    waterUse: 0,
    cost: 0,
    upkeep: 0,
    unlockMilestone: 0,
    ...overrides,
  };
}

/** Shortest distance between two hues on the circular [0,1) hue wheel. */
function circularHueDiff(a: number, b: number): number {
  const d = Math.abs(a - b) % 1;
  return Math.min(d, 1 - d);
}

function rgbDistance(a: RGB, b: RGB): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

describe('facade spec constants (UI-SPEC §6.5/§6.6)', () => {
  it('match the documented numeric values exactly', () => {
    expect(FLOOR_HEIGHT_METERS).toBe(3.2);
    expect(GROUND_FLOOR_METERS).toBe(3.2);
    expect(PARAPET_METERS).toBe(0.4);
    expect(HUE_JITTER_FRACTION).toBe(0.04);
    expect(BAY_WIDTH_METERS).toBeCloseTo(2.6, 9);
  });
});

describe('rgbToHsl / hslToRgb (pure color helpers)', () => {
  it('round-trips a variety of colors within floating point tolerance', () => {
    const samples: RGB[] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0.5, 0.5, 0.5],
      [0.2, 0.6, 0.9],
      [0.9, 0.2, 0.4],
      [0, 0, 0],
      [1, 1, 1],
      [0.93, 0.91, 0.87],
    ];
    for (const [r, g, b] of samples) {
      const { h, s, l } = rgbToHsl(r, g, b);
      const [r2, g2, b2] = hslToRgb(h, s, l);
      expect(r2).toBeCloseTo(r, 5);
      expect(g2).toBeCloseTo(g, 5);
      expect(b2).toBeCloseTo(b, 5);
    }
  });

  it('keeps h, s, l within their expected [0,1] ranges', () => {
    const { h, s, l } = rgbToHsl(0.9, 0.1, 0.3);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(1);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
    expect(l).toBeGreaterThanOrEqual(0);
    expect(l).toBeLessThanOrEqual(1);
  });

  it('is pure: repeated calls with the same input return the same output', () => {
    expect(rgbToHsl(0.3, 0.6, 0.2)).toEqual(rgbToHsl(0.3, 0.6, 0.2));
    expect(hslToRgb(0.4, 0.5, 0.6)).toEqual(hslToRgb(0.4, 0.5, 0.6));
  });
});

describe('deriveFacadeParams: floors', () => {
  it('is height/FLOOR_HEIGHT_METERS rounded', () => {
    expect(deriveFacadeParams(entry({ height: 3.2 }), 1).floors).toBe(1);
    expect(deriveFacadeParams(entry({ height: 32 }), 1).floors).toBe(10);
    expect(deriveFacadeParams(entry({ height: 10 }), 1).floors).toBe(3); // round(3.125)
  });

  it('is clamped to a minimum of 1 for very short buildings', () => {
    expect(deriveFacadeParams(entry({ height: 1 }), 1).floors).toBe(1);
    expect(deriveFacadeParams(entry({ height: 0 }), 1).floors).toBe(1);
  });

  it('is deterministic and pure', () => {
    const e = entry({ height: 46 });
    expect(deriveFacadeParams(e, 9).floors).toBe(deriveFacadeParams(e, 9).floors);
  });
});

describe('deriveFacadeParams: bays', () => {
  it('is footprint width (meters) / BAY_WIDTH_METERS rounded', () => {
    const oneTile = deriveFacadeParams(entry({ footprint: { w: 1, d: 1 } }), 1).bays;
    expect(oneTile).toBe(Math.round((1 * TILE_METERS) / BAY_WIDTH_METERS));

    const twoTile = deriveFacadeParams(entry({ footprint: { w: 2, d: 2 } }), 1).bays;
    expect(twoTile).toBe(Math.round((2 * TILE_METERS) / BAY_WIDTH_METERS));
  });

  it('is clamped to a minimum of 1 for zero/negligible footprint width', () => {
    expect(deriveFacadeParams(entry({ footprint: { w: 0, d: 1 } }), 1).bays).toBe(1);
  });

  it('grows with footprint width', () => {
    const small = deriveFacadeParams(entry({ footprint: { w: 1, d: 1 } }), 1).bays;
    const big = deriveFacadeParams(entry({ footprint: { w: 4, d: 4 } }), 1).bays;
    expect(big).toBeGreaterThan(small);
  });
});

describe('deriveFacadeParams: family (from category + zone + level)', () => {
  it('assigns plaster to low-density residential at every level', () => {
    for (const level of [1, 2, 3]) {
      const e = entry({ category: 'res', zone: ZoneType.ResLow, level });
      expect(deriveFacadeParams(e, 1).family).toBe('plaster');
    }
  });

  it('assigns masonry to high-density residential below level 3', () => {
    expect(
      deriveFacadeParams(entry({ category: 'res', zone: ZoneType.ResHigh, level: 1 }), 1).family,
    ).toBe('masonry');
    expect(
      deriveFacadeParams(entry({ category: 'res', zone: ZoneType.ResHigh, level: 2 }), 1).family,
    ).toBe('masonry');
  });

  it('assigns glass to high-density residential at level 3+', () => {
    expect(
      deriveFacadeParams(entry({ category: 'res', zone: ZoneType.ResHigh, level: 3 }), 1).family,
    ).toBe('glass');
  });

  it('assigns masonry to low-density commercial and glass to high-density commercial', () => {
    expect(deriveFacadeParams(entry({ category: 'com', zone: ZoneType.ComLow }), 1).family).toBe(
      'masonry',
    );
    expect(deriveFacadeParams(entry({ category: 'com', zone: ZoneType.ComHigh }), 1).family).toBe(
      'glass',
    );
  });

  it('assigns concrete to industrial and civic/utility/park ploppables', () => {
    expect(
      deriveFacadeParams(entry({ category: 'ind', zone: ZoneType.Industrial }), 1).family,
    ).toBe('concrete');
    expect(deriveFacadeParams(entry({ category: 'service', zone: undefined }), 1).family).toBe(
      'concrete',
    );
    expect(deriveFacadeParams(entry({ category: 'utility', zone: undefined }), 1).family).toBe(
      'concrete',
    );
    expect(deriveFacadeParams(entry({ category: 'park', zone: undefined }), 1).family).toBe(
      'concrete',
    );
  });

  it('is deterministic and pure', () => {
    const e = entry({ category: 'com', zone: ZoneType.ComHigh });
    expect(deriveFacadeParams(e, 3).family).toBe(deriveFacadeParams(e, 3).family);
  });
});

describe('deriveFacadeParams: windowInset / spandrel flags per family', () => {
  it('glass: flush curtain wall, no spandrel', () => {
    const { windowInset, spandrel } = deriveFacadeParams(
      entry({ category: 'com', zone: ZoneType.ComHigh }),
      1,
    );
    expect(windowInset).toBe(false);
    expect(spandrel).toBe(false);
  });

  it('masonry: punched windows with visible spandrel bands', () => {
    const { windowInset, spandrel } = deriveFacadeParams(
      entry({ category: 'com', zone: ZoneType.ComLow }),
      1,
    );
    expect(windowInset).toBe(true);
    expect(spandrel).toBe(true);
  });

  it('concrete: punched (narrow) windows, no spandrel', () => {
    const { windowInset, spandrel } = deriveFacadeParams(
      entry({ category: 'ind', zone: ZoneType.Industrial }),
      1,
    );
    expect(windowInset).toBe(true);
    expect(spandrel).toBe(false);
  });

  it('plaster: punched windows, no spandrel', () => {
    const { windowInset, spandrel } = deriveFacadeParams(
      entry({ category: 'res', zone: ZoneType.ResLow }),
      1,
    );
    expect(windowInset).toBe(true);
    expect(spandrel).toBe(false);
  });
});

describe('deriveFacadeParams: wallColor', () => {
  it('is deterministic: same entry + id always derives the identical color', () => {
    const e = entry({ color: 0xaa5533 });
    expect(deriveFacadeParams(e, 777).wallColor).toEqual(deriveFacadeParams(e, 777).wallColor);
  });

  it('clamps saturation to at most MAX_WALL_SATURATION regardless of catalog vividness', () => {
    const vividColors = [0xff0000, 0x00ff00, 0x0000ff, 0xff00ff, 0xffff00, 0x00ffff, 0xff8800];
    for (const color of vividColors) {
      for (let id = 0; id < 15; id++) {
        const { wallColor } = deriveFacadeParams(entry({ color }), id);
        const { s } = rgbToHsl(...wallColor);
        expect(s).toBeLessThanOrEqual(MAX_WALL_SATURATION + 1e-9);
      }
    }
  });

  it('leaves already-low-saturation catalog colors near their own saturation (never raises it)', () => {
    const [r, g, b] = [0.6, 0.62, 0.61]; // already nearly grey
    const { s: originalS } = rgbToHsl(r, g, b);
    const hex = (Math.round(r * 255) << 16) | (Math.round(g * 255) << 8) | Math.round(b * 255);
    const { wallColor } = deriveFacadeParams(entry({ color: hex }), 5);
    const { s } = rgbToHsl(...wallColor);
    expect(s).toBeLessThanOrEqual(originalS + 0.02);
  });

  it('applies a deterministic hue jitter bounded by +/-HUE_JITTER_FRACTION of the catalog hue', () => {
    const e = entry({ color: 0x3355bb });
    const { h: catalogHue } = rgbToHsl(
      ((e.color >> 16) & 0xff) / 255,
      ((e.color >> 8) & 0xff) / 255,
      (e.color & 0xff) / 255,
    );
    let sawNonZeroJitter = false;
    for (let id = 0; id < 80; id++) {
      const { wallColor } = deriveFacadeParams(e, id);
      const { h } = rgbToHsl(...wallColor);
      const diff = circularHueDiff(h, catalogHue);
      expect(diff).toBeLessThanOrEqual(HUE_JITTER_FRACTION + 1e-6);
      if (diff > 1e-4) sawNonZeroJitter = true;
    }
    expect(sawNonZeroJitter).toBe(true);
  });

  it('varies across building ids for the same catalog entry (jitter has a real effect)', () => {
    const e = entry({ color: 0x557799 });
    const seen = new Set<string>();
    for (let id = 0; id < 40; id++) seen.add(deriveFacadeParams(e, id).wallColor.join(','));
    expect(seen.size).toBeGreaterThan(10);
  });

  it('industrial buildings draw their wall base from the industrial palette, not the catalog color', () => {
    const e = entry({ category: 'ind', zone: ZoneType.Industrial, color: 0xff00ff }); // absurd catalog color
    for (let id = 0; id < 20; id++) {
      const { wallColor } = deriveFacadeParams(e, id);
      const base = industrialWallBase(id);
      const { h: baseHue } = rgbToHsl(...base);
      const { h } = rgbToHsl(...wallColor);
      expect(circularHueDiff(h, baseHue)).toBeLessThanOrEqual(HUE_JITTER_FRACTION + 1e-6);
    }
  });
});

describe('deriveFacadeParams: roofColor', () => {
  it('is deterministic per building id', () => {
    const e = entry({ color: 0x336699 });
    expect(deriveFacadeParams(e, 55).roofColor).toEqual(deriveFacadeParams(e, 55).roofColor);
  });

  it('is always one of the white/grey/tan palette entries for non-industrial buildings', () => {
    const e = entry({ color: 0x336699 });
    for (let id = 0; id < 60; id++) {
      const { roofColor } = deriveFacadeParams(e, id);
      expect(ROOF_PALETTE).toContainEqual(roofColor);
    }
  });

  it('rotates: many distinct ids produce more than one palette entry', () => {
    const e = entry({ color: 0x336699 });
    const seen = new Set<string>();
    for (let id = 0; id < 60; id++) seen.add(deriveFacadeParams(e, id).roofColor.join(','));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('always stays at least MIN_ROOF_WALL_DISTANCE away from that instance wallColor', () => {
    for (let id = 0; id < 300; id++) {
      const color = (id * 4111 + 17) & 0xffffff;
      const e = entry({ color });
      const { wallColor, roofColor } = deriveFacadeParams(e, id);
      expect(rgbDistance(wallColor, roofColor)).toBeGreaterThanOrEqual(
        MIN_ROOF_WALL_DISTANCE - 1e-9,
      );
    }
  });

  it('industrial buildings always get the fixed grey roof plate color (no rotation)', () => {
    const e = entry({ category: 'ind', zone: ZoneType.Industrial, color: 0x112233 });
    for (let id = 0; id < 12; id++) {
      expect(deriveFacadeParams(e, id).roofColor).toEqual(INDUSTRIAL_ROOF_COLOR);
    }
  });
});

describe('groundFloorBand (pure)', () => {
  it('returns 1 when the building is at most the ground-floor band height', () => {
    expect(groundFloorBand(GROUND_FLOOR_METERS)).toBe(1);
    expect(groundFloorBand(1)).toBe(1);
  });

  it('returns the band thickness as a fraction of total height otherwise', () => {
    expect(groundFloorBand(32)).toBeCloseTo(GROUND_FLOOR_METERS / 32, 9);
    expect(groundFloorBand(3.2 * 10)).toBeCloseTo(0.1, 9);
  });

  it('is pure and handles non-positive/NaN heights defensively (clamped to 1, never NaN/Infinity)', () => {
    expect(groundFloorBand(0)).toBe(1);
    expect(groundFloorBand(-5)).toBe(1);
    expect(Number.isFinite(groundFloorBand(0))).toBe(true);
    expect(groundFloorBand(10)).toBe(groundFloorBand(10));
  });

  it('shrinks monotonically as height grows', () => {
    expect(groundFloorBand(20)).toBeGreaterThan(groundFloorBand(40));
  });
});

describe('parapetBand (pure)', () => {
  it('returns 1 when the building is at most the parapet band height', () => {
    expect(parapetBand(PARAPET_METERS)).toBe(1);
    expect(parapetBand(0.1)).toBe(1);
  });

  it('returns the band thickness as a fraction of total height otherwise', () => {
    expect(parapetBand(40)).toBeCloseTo(PARAPET_METERS / 40, 9);
  });

  it('is pure and handles non-positive heights defensively (clamped to 1, never NaN/Infinity)', () => {
    expect(parapetBand(0)).toBe(1);
    expect(parapetBand(-1)).toBe(1);
    expect(Number.isFinite(parapetBand(0))).toBe(true);
  });

  it('shrinks monotonically as height grows', () => {
    expect(parapetBand(20)).toBeGreaterThan(parapetBand(40));
  });
});

describe('industrialAccentColor (pure, §6.6b)', () => {
  it('is deterministic', () => {
    expect(industrialAccentColor(9)).toEqual(industrialAccentColor(9));
  });

  it('is always exactly the red or blue accent constant', () => {
    for (let id = 0; id < 60; id++) {
      expect([ACCENT_RED, ACCENT_BLUE]).toContainEqual(industrialAccentColor(id));
    }
  });

  it('produces both colors across many ids (not constant)', () => {
    const seen = new Set<string>();
    for (let id = 0; id < 60; id++) seen.add(industrialAccentColor(id).join(','));
    expect(seen.size).toBe(2);
  });
});

describe('industrialWallBase (pure, §6.6b)', () => {
  it('is deterministic and always one of the industrial wall palette entries', () => {
    for (let id = 0; id < 60; id++) {
      const c = industrialWallBase(id);
      expect(industrialWallBase(id)).toEqual(c);
      expect(INDUSTRIAL_WALL_PALETTE).toContainEqual(c);
    }
  });

  it('rotates across many ids (not constant)', () => {
    const seen = new Set<string>();
    for (let id = 0; id < 60; id++) seen.add(industrialWallBase(id).join(','));
    expect(seen.size).toBeGreaterThan(1);
  });
});

describe('day/night derivation stays pure (no THREE/DOM dependency, no Math.random/Date.now)', () => {
  it('produces identical FacadeParams across repeated calls for a large batch of (entry, id) pairs', () => {
    const categories: BuildingCatalogEntry['category'][] = [
      'res',
      'com',
      'ind',
      'service',
      'utility',
      'park',
    ];
    for (let i = 0; i < 40; i++) {
      const category = categories[i % categories.length]!;
      const e = entry({
        category,
        zone:
          category === 'res' ? ZoneType.ResLow : category === 'com' ? ZoneType.ComHigh : undefined,
        level: (i % 3) + 1,
        height: 4 + i * 3,
        footprint: { w: 1 + (i % 4), d: 1 + (i % 3) },
        color: (i * 92821) & 0xffffff,
      });
      expect(deriveFacadeParams(e, i)).toEqual(deriveFacadeParams(e, i));
    }
  });
});
