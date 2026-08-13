import { describe, expect, it } from 'vitest';
import {
  MATERIALS,
  MAX_MATERIAL_CHANNEL,
  MAX_SNOW_CHANNEL,
  calibrate,
  calibrateHex,
  hexToRgb255,
  material,
  materialHex,
  materialUnit,
  rgb255ToHex,
} from './palette';
import {
  ACCENT_BLUE,
  ACCENT_RED,
  INDUSTRIAL_ROOF_COLOR,
  INDUSTRIAL_WALL_PALETTE,
  ROOF_PALETTE,
} from './facade';
import { roofColorHex } from './houses';
import { CAR_PALETTE as PARKED_CAR_PALETTE } from './parked';
import { VEHICLE_PALETTE, VEHICLE_PALETTE_HEX } from './vehicles';

describe('the calibrated palette', () => {
  it('keeps every material inside the chart, with snow the only exception', () => {
    for (const [name, rgb] of Object.entries(MATERIALS)) {
      const ceiling = name === 'snow' ? MAX_SNOW_CHANNEL : MAX_MATERIAL_CHANNEL;
      for (const channel of rgb) {
        expect(
          channel,
          `${name} channel ${channel} exceeds ${ceiling} — albedo needs lighting headroom`,
        ).toBeLessThanOrEqual(ceiling);
      }
    }
  });

  it('makes snow the brightest material there is', () => {
    const peak = (rgb: readonly number[]): number => Math.max(...rgb);
    const snow = peak(MATERIALS.snow);
    for (const [name, rgb] of Object.entries(MATERIALS)) {
      if (name === 'snow') continue;
      expect(peak(rgb), `${name} is brighter than snow`).toBeLessThan(snow);
    }
  });

  // Measured by peak channel, the same way snow is the brightest: dark
  // vegetation dips to 22 in blue but peaks at 34, well above coal's flat 23.
  it('keeps coal the darkest', () => {
    const peak = (rgb: readonly number[]): number => Math.max(...rgb);
    const coal = peak(MATERIALS.coal);
    for (const [name, rgb] of Object.entries(MATERIALS)) {
      if (name === 'coal') continue;
      expect(peak(rgb), `${name} is darker than coal`).toBeGreaterThan(coal);
    }
  });
});

describe('calibrate', () => {
  it('leaves a colour already in range untouched', () => {
    expect(calibrate([71, 68, 65])).toEqual([71, 68, 65]);
    expect(calibrate([140, 0, 0])).toEqual([140, 0, 0]);
  });

  it('scales an over-bright colour down to the ceiling', () => {
    expect(Math.max(...calibrate([216, 212, 200]))).toBeCloseTo(MAX_MATERIAL_CHANNEL, 6);
  });

  // Clipping the one channel that is over drags a warm grey toward a cold one;
  // scaling keeps it the same colour, dimmer.
  it('preserves hue: channel ratios survive the correction', () => {
    const before: readonly [number, number, number] = [207, 199, 182];
    const after = calibrate(before);
    expect(after[1] / after[0]).toBeCloseTo(before[1] / before[0], 6);
    expect(after[2] / after[0]).toBeCloseTo(before[2] / before[0], 6);
  });

  it('does not divide by zero on black', () => {
    expect(calibrate([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('round-trips through packed hex', () => {
    expect(hexToRgb255(rgb255ToHex([71, 68, 65]))).toEqual([71, 68, 65]);
    expect(Math.max(...hexToRgb255(calibrateHex(0xd8d4c8)))).toBeLessThanOrEqual(
      MAX_MATERIAL_CHANNEL,
    );
  });
});

describe('material accessors', () => {
  it('reads a swatch by name', () => {
    expect(material('slateRoof')).toEqual([47, 47, 46]);
    expect(materialHex('coal')).toBe(0x171717);
  });

  it('converts to the 0..1 floats three.js wants', () => {
    const [r, g, b] = materialUnit('snow');
    expect(r).toBeCloseTo(140 / 255, 6);
    expect(g).toBeCloseTo(142 / 255, 6);
    expect(b).toBeCloseTo(144 / 255, 6);
  });
});

// ---------------------------------------------------------------------------
// The rule has to bind the palettes the renderers actually draw with, not just
// the chart module. Before this, five modules each kept their own colours and
// the building surfaces most visible in the game — roof plates at 237,232,222
// and industrial walls at 230,227,219 — sat far outside the calibration.
// ---------------------------------------------------------------------------

describe('the renderers stay inside the calibration', () => {
  const peak255 = (rgb: readonly number[]): number => Math.max(...rgb) * 255;

  it('keeps every facade wall and roof colour in range', () => {
    const named: [string, readonly (readonly number[])[]][] = [
      ['ROOF_PALETTE', ROOF_PALETTE],
      ['INDUSTRIAL_WALL_PALETTE', INDUSTRIAL_WALL_PALETTE],
      ['INDUSTRIAL_ROOF_COLOR', [INDUSTRIAL_ROOF_COLOR]],
      ['accents', [ACCENT_RED, ACCENT_BLUE]],
    ];
    for (const [label, colors] of named) {
      for (const rgb of colors) {
        expect(peak255(rgb), `${label} exceeds the albedo ceiling`).toBeLessThanOrEqual(
          MAX_MATERIAL_CHANNEL,
        );
      }
    }
  });

  it('keeps every house roof colour in range, for any building id', () => {
    for (let id = 1; id <= 400; id += 1) {
      const rgb = hexToRgb255(roofColorHex(id));
      expect(Math.max(...rgb), `house roof for id ${id} exceeds the ceiling`).toBeLessThanOrEqual(
        MAX_MATERIAL_CHANNEL,
      );
    }
  });

  // Vehicle paint is the documented exception: a car is meant to read as a
  // saturated dot against the concrete. It just has to be ONE list.
  it('paints every car from one list', () => {
    expect(PARKED_CAR_PALETTE).toBe(VEHICLE_PALETTE_HEX);
    expect(VEHICLE_PALETTE.length).toBe(VEHICLE_PALETTE_HEX.length);
  });
});
