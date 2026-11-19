import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import { isModernTall } from '../shared/modernlook';
import { BuildingCatalogEntry } from '../shared/types';
import {
  CURTAIN_BAND_M,
  CURTAIN_MODULE_M,
  CURTAIN_MODULE_MAX_M,
  CURTAIN_MODULE_MIN_M,
  curtainBays,
  curtainWallCut,
  isVisionGlass,
} from './curtainwall';
import { floorToFloorOf } from './facade';
import { computeSetbacks, tierHeightOf } from './massing';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const modern = catalog.filter(isModernTall);

describe('curtainBays', () => {
  it('cuts a wall into equal modules between 1.2 and 1.8 m, whatever its length', () => {
    for (let wall = 3.6; wall <= 130; wall += 0.1) {
      const width = wall / curtainBays(wall);
      expect(width, `${wall.toFixed(1)} m`).toBeGreaterThanOrEqual(CURTAIN_MODULE_MIN_M - 1e-9);
      expect(width, `${wall.toFixed(1)} m`).toBeLessThanOrEqual(CURTAIN_MODULE_MAX_M + 1e-9);
    }
  });

  it('takes the count nearest the 1.5 m module', () => {
    expect(curtainBays(40.8)).toBe(27);
    expect(curtainBays(13.6)).toBe(9);
    expect(curtainBays(27.2)).toBe(18);
    expect(Math.abs(40.8 / 27 - CURTAIN_MODULE_M)).toBeLessThan(0.02);
  });

  it('holds on every tier of every modern building, with the setbacks a tier takes', () => {
    expect(modern.length).toBeGreaterThan(20);
    for (const e of modern) {
      for (const id of [1, 2, 3, 17, 40, 255]) {
        for (const box of computeSetbacks(e, id).boxes) {
          for (const wall of [box.w, box.d]) {
            const width = wall / curtainBays(wall);
            expect(width, `${e.id} #${id} ${wall.toFixed(1)} m`).toBeGreaterThanOrEqual(1.2 - 1e-9);
            expect(width, `${e.id} #${id} ${wall.toFixed(1)} m`).toBeLessThanOrEqual(1.8 + 1e-9);
          }
        }
      }
    }
  });
});

describe('curtainWallCut', () => {
  it('puts a band 0.9 m tall across every floor line of every modern building', () => {
    for (const e of modern) {
      const cut = curtainWallCut(e);
      expect(cut.bandHalf * 2 * cut.floorM, e.id).toBeCloseTo(CURTAIN_BAND_M, 9);
      expect(cut.bandHalf, e.id).toBeLessThan(0.5);
    }
  });

  it('cuts a tier into floors of about the body own floor height', () => {
    for (const e of modern) {
      const cut = curtainWallCut(e);
      const own = floorToFloorOf(e.kind);
      expect(cut.rows * cut.floorM, e.id).toBeCloseTo(tierHeightOf(e), 9);
      expect(cut.floorM, e.id).toBeGreaterThanOrEqual(own * 0.85);
      expect(cut.floorM, e.id).toBeLessThanOrEqual(own * 1.15);
    }
  });

  it('draws a tower on 3.6 m floors and any other body on 3.2 m storeys', () => {
    const tower = catalog.find((e) => e.id === 'res-tower-3')!;
    expect(curtainWallCut(tower).rows).toBe(22);
    expect(curtainWallCut(tower).floorM).toBeCloseTo(80 / 22, 9);
    const office = catalog.find((e) => e.id === 'com-office-2')!;
    expect(curtainWallCut(office).floorM).toBeCloseTo(3.2, 9);
  });
});

describe('isVisionGlass', () => {
  it('is glass between the bands and nothing inside one, so a lit pane never lies on a band', () => {
    for (const e of modern) {
      const cut = curtainWallCut(e);
      let vision = 0;
      const steps = 2000;
      for (let i = 0; i < steps; i++) {
        const v = (i + 0.5) / steps;
        const glass = isVisionGlass(cut, v);
        const inBand = v <= cut.bandHalf || v >= 1 - cut.bandHalf;
        expect(glass, `${e.id} v=${v}`).toBe(!inBand);
        if (glass) vision += 1;
      }
      const visionM = (vision / steps) * cut.floorM;
      expect(visionM, e.id).toBeCloseTo(cut.floorM - CURTAIN_BAND_M, 1);
      expect(visionM, e.id).toBeGreaterThan(1.5);
    }
  });
});
