import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  MATERIALS,
  SATURATED,
  litHex,
  materialHex,
  materialUnit,
  paletteHex,
  saturatedHex,
  saturatedUnit,
  type MaterialName,
  type SaturatedName,
} from './palette';
import { buildTrampolineGeometry } from './houses';
import { MANHOLE_PLATE_COLOR, MANHOLE_RIM_COLOR } from './roadfurniture';

/** One 8-bit step of sRGB encoding, in linear units at its steepest. */
const TOLERANCE = 0.006;

describe('a palette colour reaches the renderer one way', () => {
  it('makes the same working-space colour from a hex as the vertex path makes from number / 255', () => {
    for (const name of Object.keys(MATERIALS) as MaterialName[]) {
      const [r, g, b] = materialUnit(name);
      const c = new THREE.Color(materialHex(name));
      expect(Math.abs(c.r - r), `${name} red`).toBeLessThan(TOLERANCE);
      expect(Math.abs(c.g - g), `${name} green`).toBeLessThan(TOLERANCE);
      expect(Math.abs(c.b - b), `${name} blue`).toBeLessThan(TOLERANCE);
    }
    for (const name of Object.keys(SATURATED) as SaturatedName[]) {
      const [r, g, b] = saturatedUnit(name);
      const c = new THREE.Color(saturatedHex(name));
      expect(Math.abs(c.r - r), `${name} red`).toBeLessThan(TOLERANCE);
      expect(Math.abs(c.g - g), `${name} green`).toBeLessThan(TOLERANCE);
      expect(Math.abs(c.b - b), `${name} blue`).toBeLessThan(TOLERANCE);
    }
  });

  it('keeps black and white where they are', () => {
    expect(paletteHex([0, 0, 0])).toBe(0x000000);
    expect(paletteHex([255, 255, 255])).toBe(0xffffff);
  });

  it('leaves a glowing part on the decoded value it always had', () => {
    const c = new THREE.Color(litHex('whiteBrick'));
    expect(c.r).toBeCloseTo(new THREE.Color(0x7b7a78).r, 6);
  });

  it('paints a trampoline mat with the same colour the vertex path gives its swatch', () => {
    const colours = buildTrampolineGeometry().getAttribute('color');
    const [r] = materialUnit('coal');
    const found = Array.from({ length: colours.count }, (_, i) => colours.getX(i));
    expect(found.some((v) => Math.abs(v - r) < TOLERANCE)).toBe(true);
  });

  // Measured at noon on the raw path: a surface of palette number p reads about
  // 1.9 p, so charcoal at 47 reads in the 85 to 110 band beside a road at 148.
  it('keeps charcoal shingle the darkest roof, at the number that reads 85 or more', () => {
    const peak = (m: MaterialName): number => Math.max(...MATERIALS[m]);
    expect(peak('shingleCharcoal')).toBeGreaterThanOrEqual(45);
    for (const roof of ['shingleWeathered', 'shinglePewter', 'shingleBarkwood'] as const) {
      expect(peak(roof)).toBeGreaterThan(peak('shingleCharcoal'));
    }
  });

  it('draws a manhole cover lighter than a hole, plate over rim', () => {
    const rim = new THREE.Color(MANHOLE_RIM_COLOR);
    const plate = new THREE.Color(MANHOLE_PLATE_COLOR);
    expect(rim.g).toBeGreaterThanOrEqual(0.12);
    expect(plate.g).toBeGreaterThan(rim.g);
  });

  // The only other way to turn a palette entry into a packed hex is to pack it
  // raw, which a Color then decodes from sRGB and lands several times darker.
  it('lets no renderer pack a palette entry into a hex except the palette itself', () => {
    const dir = __dirname;
    const offenders = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'palette.ts')
      .filter((f) => /\b(rgb255ToHex|hexToRgb255)\(/.test(readFileSync(join(dir, f), 'utf8')));
    expect(offenders).toEqual([]);
  });
});
