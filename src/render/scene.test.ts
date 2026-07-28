// @vitest-environment jsdom
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorldScene, sunDirection, timeOfDayColors } from './scene';

// createWorldScene() wires in sky.ts's SunBillboard, which
// draws a canvas texture once at construction — jsdom has no canvas 2D
// backend (no optional `canvas` npm package installed): getContext('2d')
// returns null but first logs a benign "Not implemented" notice straight to
// the terminal. The sky/sun/cloud classes all guard a null context correctly
// (same fallback pin.ts already relies on); stub getContext so test output
// stays readable without changing what's under test.
let getContextSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  getContextSpy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  getContextSpy.mockRestore();
});

describe('timeOfDayColors (pure)', () => {
  it('is dim and blue-tinted at midnight (t=0)', () => {
    const midnight = timeOfDayColors(0);
    expect(midnight.sunDirection.y).toBeLessThan(-0.8);
    expect(midnight.sunIntensity).toBeLessThan(0.2);
    // moonlight-blue: blue channel should dominate red in the background
    expect(midnight.backgroundColor[2]).toBeGreaterThan(midnight.backgroundColor[0]);
  });

  it('is bright, near-zenith and sky-colored at noon (t=0.5)', () => {
    const noon = timeOfDayColors(0.5);
    expect(noon.sunDirection.y).toBeGreaterThan(0.8);
    expect(noon.sunIntensity).toBeGreaterThan(1.0);
    // sky blue: green and blue both well above red-only dominance, overall bright
    expect(
      noon.backgroundColor[0] + noon.backgroundColor[1] + noon.backgroundColor[2],
    ).toBeGreaterThan(1.5);
  });

  it('noon is substantially brighter than midnight', () => {
    const midnight = timeOfDayColors(0);
    const noon = timeOfDayColors(0.5);
    expect(noon.sunIntensity).toBeGreaterThan(midnight.sunIntensity * 5);
    expect(noon.hemiIntensity).toBeGreaterThan(midnight.hemiIntensity);
  });

  it('lifts the midnight ambient floor for legibility yet keeps it below dusk', () => {
    const midnight = timeOfDayColors(0);
    const dusk = timeOfDayColors(Math.acos(0.4) / (Math.PI * 2)); // elevation -0.4
    expect(midnight.hemiIntensity).toBeGreaterThan(0.2);
    expect(midnight.hemiIntensity).toBeLessThan(dusk.hemiIntensity);
  });

  it('warms the sun color near the horizon (dawn/dusk) relative to noon', () => {
    const noon = timeOfDayColors(0.5);
    const dawn = timeOfDayColors(0.25);
    const dusk = timeOfDayColors(0.75);
    // warm = red channel high relative to blue, compared to noon's more neutral color
    const warmthAt = (c: readonly [number, number, number]): number => c[0] - c[2];
    expect(warmthAt(dawn.sunColor)).toBeGreaterThan(warmthAt(noon.sunColor));
    expect(warmthAt(dusk.sunColor)).toBeGreaterThan(warmthAt(noon.sunColor));
  });

  it('is periodic: t=0 and t=1 produce the same result', () => {
    const a = timeOfDayColors(0);
    const b = timeOfDayColors(1);
    expect(b.sunDirection.y).toBeCloseTo(a.sunDirection.y, 9);
    expect(b.sunIntensity).toBeCloseTo(a.sunIntensity, 9);
    expect(b.backgroundColor).toEqual(a.backgroundColor);
  });

  it('keeps every color channel within [0,1]', () => {
    for (let i = 0; i <= 20; i++) {
      const t = i / 20;
      const c = timeOfDayColors(t);
      const channels = [
        ...c.sunColor,
        ...c.hemiSkyColor,
        ...c.hemiGroundColor,
        ...c.fogColor,
        ...c.backgroundColor,
      ];
      for (const ch of channels) {
        expect(ch).toBeGreaterThanOrEqual(0);
        expect(ch).toBeLessThanOrEqual(1);
      }
    }
  });

  it('returns a unit-length-ish sun direction (non-degenerate) for every t', () => {
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const d = timeOfDayColors(t).sunDirection;
      const len = Math.hypot(d.x, d.y, d.z);
      expect(len).toBeCloseTo(1, 5);
    }
  });

  // 4-keyframe ramp: day -> golden hour -> dusk -> night.
  // `elevation = -cos(2*PI*t)` so t=0 is exactly the night keyframe (elevation
  // -1) and t=0.5 is exactly the day keyframe (elevation +1); golden hour and
  // dusk sit at elevation 0.15 / -0.4 respectively, inverted here via acos to
  // land test samples exactly on those keyframes without hardcoding a `t`.
  const tForElevation = (elevation: number): number => Math.acos(-elevation) / (Math.PI * 2);

  it('matches the night keyframe at t=0: deep navy #0a1224, dim moonlight, nightFactor=1', () => {
    const c = timeOfDayColors(0);
    expect(c.nightFactor).toBeCloseTo(1, 9);
    expect(c.sunIntensity).toBeCloseTo(0.12, 9);
    expect(c.backgroundColor[0]).toBeCloseTo(0x0a / 0xff, 5);
    expect(c.backgroundColor[1]).toBeCloseTo(0x12 / 0xff, 5);
    expect(c.backgroundColor[2]).toBeCloseTo(0x24 / 0xff, 5);
  });

  it('matches the day keyframe at t=0.5: nightFactor=0, bright neutral sun', () => {
    const c = timeOfDayColors(0.5);
    expect(c.nightFactor).toBeCloseTo(0, 9);
    expect(c.sunIntensity).toBeCloseTo(1.8, 9);
  });

  it('matches the golden-hour keyframe: warm orange horizon, low-mid nightFactor', () => {
    const t = tForElevation(0.15);
    const c = timeOfDayColors(t);
    expect(c.nightFactor).toBeCloseTo(0.2, 5);
    // Orange horizon: red > green > blue.
    expect(c.backgroundColor[0]).toBeGreaterThan(c.backgroundColor[1]);
    expect(c.backgroundColor[1]).toBeGreaterThan(c.backgroundColor[2]);
  });

  it('matches the dusk keyframe: violet sky, high-mid nightFactor', () => {
    const t = tForElevation(-0.4);
    const c = timeOfDayColors(t);
    expect(c.nightFactor).toBeCloseTo(0.65, 5);
    // Violet: green recedes below both red and blue.
    expect(c.backgroundColor[1]).toBeLessThan(c.backgroundColor[0]);
    expect(c.backgroundColor[1]).toBeLessThan(c.backgroundColor[2]);
  });

  it('golden hour and dusk mirror across both the morning and evening transition', () => {
    const goldenElevationT = tForElevation(0.15);
    const duskElevationT = tForElevation(-0.4);
    // The descending (evening) side is the reflection of the ascending
    // (morning) side around noon (t=0.5).
    const eveningGolden = timeOfDayColors(1 - goldenElevationT);
    const eveningDusk = timeOfDayColors(1 - duskElevationT);
    const morningGolden = timeOfDayColors(goldenElevationT);
    const morningDusk = timeOfDayColors(duskElevationT);
    expect(eveningGolden.nightFactor).toBeCloseTo(morningGolden.nightFactor, 9);
    expect(eveningDusk.nightFactor).toBeCloseTo(morningDusk.nightFactor, 9);
    for (let i = 0; i < 3; i++) {
      expect(eveningGolden.backgroundColor[i]).toBeCloseTo(morningGolden.backgroundColor[i]!, 9);
      expect(eveningDusk.backgroundColor[i]).toBeCloseTo(morningDusk.backgroundColor[i]!, 9);
    }
  });

  it('nightFactor and shadowIntensity move in lockstep with the same ramp (opposite directions)', () => {
    const samples = [0, tForElevation(-0.4), tForElevation(0.15), 0.5].map((t) =>
      timeOfDayColors(t),
    );
    for (let i = 1; i < samples.length; i++) {
      // As the ramp brightens (night -> dusk -> golden -> day), nightFactor
      // strictly falls and shadowIntensity strictly rises.
      expect(samples[i]!.nightFactor).toBeLessThan(samples[i - 1]!.nightFactor);
      expect(samples[i]!.shadowIntensity).toBeGreaterThan(samples[i - 1]!.shadowIntensity);
    }
    for (const c of samples) {
      expect(c.shadowIntensity).toBeGreaterThanOrEqual(0);
      expect(c.shadowIntensity).toBeLessThanOrEqual(1);
    }
  });

  it('nightFactor stays within [0,1] for every t', () => {
    for (let i = 0; i <= 40; i++) {
      const c = timeOfDayColors(i / 40);
      expect(c.nightFactor).toBeGreaterThanOrEqual(0);
      expect(c.nightFactor).toBeLessThanOrEqual(1);
    }
  });
});

// sunDirection(t) is exposed standalone (factored out of
// timeOfDayColors) so sky.ts/clouds.ts can place the sun/moon billboard
// without recomputing the whole ramp.
describe('sunDirection (pure, standalone export)', () => {
  it('matches timeOfDayColors(t).sunDirection exactly for a range of t', () => {
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      const standalone = sunDirection(t);
      const viaRamp = timeOfDayColors(t).sunDirection;
      expect(standalone.x).toBeCloseTo(viaRamp.x, 12);
      expect(standalone.y).toBeCloseTo(viaRamp.y, 12);
      expect(standalone.z).toBeCloseTo(viaRamp.z, 12);
    }
  });

  it('is unit-length for every t', () => {
    for (let i = 0; i <= 8; i++) {
      const d = sunDirection(i / 8);
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 6);
    }
  });

  it('points near-straight-up at noon and near-straight-down at midnight', () => {
    expect(sunDirection(0.5).y).toBeGreaterThan(0.8);
    expect(sunDirection(0).y).toBeLessThan(-0.8);
  });
});

// sky dome gradient endpoints, extended onto the existing
// pure ramp function so sky.ts never re-derives its own color math.
describe('timeOfDayColors sky-dome gradient fields (UI-SPEC §6.14)', () => {
  const sum = (c: readonly [number, number, number]): number => c[0] + c[1] + c[2];

  it('zenith stays blue-dominant (blue >= red) across a full day/night cycle', () => {
    for (let i = 0; i <= 24; i++) {
      const c = timeOfDayColors(i / 24);
      expect(c.skyZenithColor[2]).toBeGreaterThanOrEqual(c.skyZenithColor[0]);
    }
  });

  it('horizon reads paler (brighter, summed channels) than zenith across a full cycle', () => {
    for (let i = 0; i <= 24; i++) {
      const c = timeOfDayColors(i / 24);
      expect(sum(c.skyHorizonColor)).toBeGreaterThan(sum(c.skyZenithColor));
    }
  });

  it('collapses the horizon haze to the exact flat night background (deep navy) at t=0', () => {
    const c = timeOfDayColors(0);
    expect(c.skyHorizonColor[0]).toBeCloseTo(c.backgroundColor[0], 9);
    expect(c.skyHorizonColor[1]).toBeCloseTo(c.backgroundColor[1], 9);
    expect(c.skyHorizonColor[2]).toBeCloseTo(c.backgroundColor[2], 9);
  });

  it('pales the noon horizon toward white relative to the flat background color', () => {
    const c = timeOfDayColors(0.5);
    expect(c.skyHorizonColor[0]).toBeGreaterThan(c.backgroundColor[0]);
    expect(c.skyHorizonColor[1]).toBeGreaterThan(c.backgroundColor[1]);
    expect(c.skyHorizonColor[2]).toBeGreaterThan(c.backgroundColor[2]);
  });

  it('keeps the golden-hour horizon warm (red > green > blue), same ordering as the flat ramp', () => {
    const tForElevation = (elevation: number): number => Math.acos(-elevation) / (Math.PI * 2);
    const c = timeOfDayColors(tForElevation(0.15));
    expect(c.skyHorizonColor[0]).toBeGreaterThan(c.skyHorizonColor[1]);
    expect(c.skyHorizonColor[1]).toBeGreaterThan(c.skyHorizonColor[2]);
  });

  it('zenith is brighter at noon than at midnight', () => {
    expect(sum(timeOfDayColors(0.5).skyZenithColor)).toBeGreaterThan(
      sum(timeOfDayColors(0).skyZenithColor),
    );
  });

  it('keeps every sky-dome channel within [0,1]', () => {
    for (let i = 0; i <= 20; i++) {
      const c = timeOfDayColors(i / 20);
      for (const ch of [...c.skyZenithColor, ...c.skyHorizonColor]) {
        expect(ch).toBeGreaterThanOrEqual(0);
        expect(ch).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('createWorldScene', () => {
  it('builds a scene with a hemisphere light, a shadow-casting directional sun, fog and a gradient sky dome', () => {
    const { scene } = createWorldScene();
    const hemi = scene.children.find(
      (c): c is THREE.HemisphereLight => c instanceof THREE.HemisphereLight,
    );
    const sun = scene.children.find(
      (c): c is THREE.DirectionalLight => c instanceof THREE.DirectionalLight,
    );
    // the sky dome (a Mesh) is the sole background visual — the flat
    // scene.background assignment is removed (single owner) in favor of
    // sky.ts's gradient dome.
    const dome = scene.children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh);

    expect(hemi).toBeDefined();
    expect(sun).toBeDefined();
    expect(sun!.castShadow).toBe(true);
    expect(sun!.shadow.camera.left).toBeLessThan(sun!.shadow.camera.right);
    expect(sun!.shadow.camera.near).toBeLessThan(sun!.shadow.camera.far);
    expect(sun!.shadow.mapSize.x).toBeGreaterThan(0);

    expect(scene.fog).toBeInstanceOf(THREE.Fog);
    expect(dome).toBeDefined();
    expect(scene.background).toBeNull();
  });

  it('renders the sky dome behind everything with depth-write disabled (UI-SPEC §6.14 z-order)', () => {
    const { scene } = createWorldScene();
    const dome = scene.children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh)!;
    const material = dome.material as THREE.Material;
    expect(material.depthWrite).toBe(false);
    expect(dome.renderOrder).toBeLessThan(0);
  });

  it('wires the sun/moon billboard sprite(s) into the scene, along the same direction as the sun light', () => {
    const { scene, setTimeOfDay } = createWorldScene();
    const sun = scene.children.find(
      (c): c is THREE.DirectionalLight => c instanceof THREE.DirectionalLight,
    )!;
    const sprites = scene.children.filter((c): c is THREE.Sprite => c instanceof THREE.Sprite);
    expect(sprites.length).toBeGreaterThanOrEqual(1);

    setTimeOfDay(0.3); // clearly off-horizon (elevation != 0) so the y-sign comparison below is unambiguous
    const sprite = sprites[0]!;
    expect(Math.sign(sprite.position.y)).toBe(Math.sign(sun.position.y));
  });

  it('setTimeOfDay(0.5) drives the sun near-zenith, bright, and setTimeOfDay(0) dims it toward moonlight', () => {
    const { scene, setTimeOfDay } = createWorldScene();
    const sun = scene.children.find(
      (c): c is THREE.DirectionalLight => c instanceof THREE.DirectionalLight,
    )!;
    const hemi = scene.children.find(
      (c): c is THREE.HemisphereLight => c instanceof THREE.HemisphereLight,
    )!;
    // the day/night read lives on the sky dome's gradient,
    // not a flat scene.background. Index 0 is THREE.SphereGeometry's north
    // pole (zenith), guaranteed regardless of segment counts.
    const dome = scene.children.find((c): c is THREE.Mesh => c instanceof THREE.Mesh)!;
    const domeColor = dome.geometry.getAttribute('color');

    setTimeOfDay(0.5);
    const noonIntensity = sun.intensity;
    const noonY = sun.position.y;

    setTimeOfDay(0);
    const midnightIntensity = sun.intensity;
    const midnightY = sun.position.y;

    expect(noonIntensity).toBeGreaterThan(midnightIntensity * 5);
    expect(noonY).toBeGreaterThan(midnightY);
    expect(hemi.intensity).toBeGreaterThanOrEqual(0);

    // At midnight the dome's zenith should read as dark and blue-tinted.
    const zenithR = domeColor.getX(0);
    const zenithG = domeColor.getY(0);
    const zenithB = domeColor.getZ(0);
    expect(zenithB).toBeGreaterThan(zenithR);
    expect(zenithR + zenithG + zenithB).toBeLessThan(0.6);
  });

  it('keeps the sun target fixed at the map center across setTimeOfDay calls', () => {
    const { scene, setTimeOfDay } = createWorldScene();
    const sun = scene.children.find(
      (c): c is THREE.DirectionalLight => c instanceof THREE.DirectionalLight,
    )!;
    setTimeOfDay(0.1);
    const targetA = sun.target.position.clone();
    setTimeOfDay(0.9);
    const targetB = sun.target.position.clone();
    expect(targetA.equals(targetB)).toBe(true);
  });

  it('lerps the sun shadow intensity on the same day/night ramp', () => {
    const { scene, setTimeOfDay } = createWorldScene();
    const sun = scene.children.find(
      (c): c is THREE.DirectionalLight => c instanceof THREE.DirectionalLight,
    )!;

    setTimeOfDay(0.5);
    const dayShadow = sun.shadow.intensity;
    setTimeOfDay(0);
    const nightShadow = sun.shadow.intensity;

    expect(dayShadow).toBeCloseTo(1, 9);
    expect(nightShadow).toBeCloseTo(0.2, 9);
    expect(dayShadow).toBeGreaterThan(nightShadow);
  });

  it('adds a static star point-cloud layer that fades with the same nightFactor ramp', () => {
    const { scene, setTimeOfDay } = createWorldScene();
    const stars = scene.children.find((c): c is THREE.Points => c instanceof THREE.Points);
    expect(stars).toBeDefined();

    setTimeOfDay(0.5); // noon: stars invisible
    const dayOpacity = (stars!.material as THREE.PointsMaterial).opacity;
    setTimeOfDay(0); // midnight: stars fully visible
    const nightOpacity = (stars!.material as THREE.PointsMaterial).opacity;

    expect(dayOpacity).toBeCloseTo(0, 9);
    expect(nightOpacity).toBeCloseTo(1, 9);
  });
});
