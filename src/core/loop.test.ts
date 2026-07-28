import { describe, it, expect } from 'vitest';
import { FixedTimestep } from './loop';

describe('FixedTimestep', () => {
  const TICK_MS = 50; // 20 Hz, the default sim tick rate

  it('exposes a running tick counter starting at 0', () => {
    const fx = new FixedTimestep(TICK_MS, () => undefined);
    expect(fx.tick).toBe(0);
  });

  it('runs no ticks and returns a partial alpha for a frame shorter than one tick', () => {
    const ticks: number[] = [];
    const fx = new FixedTimestep(TICK_MS, (t) => ticks.push(t));

    const alpha = fx.advance(20, 1);

    expect(ticks).toEqual([]);
    expect(fx.tick).toBe(0);
    expect(alpha).toBeCloseTo(20 / 50, 10);
  });

  it('runs exactly one tick once the accumulator reaches tickMs, passing the absolute tick number', () => {
    const ticks: number[] = [];
    const fx = new FixedTimestep(TICK_MS, (t) => ticks.push(t));

    fx.advance(25, 1); // 25ms accumulated, still short of a tick
    expect(ticks).toEqual([]);

    const alpha = fx.advance(25, 1); // 50ms total -> exactly 1 tick

    expect(ticks).toEqual([1]);
    expect(fx.tick).toBe(1);
    expect(alpha).toBeCloseTo(0, 10);
  });

  it('runs multiple ticks in a single advance when enough time has accumulated', () => {
    const ticks: number[] = [];
    const fx = new FixedTimestep(TICK_MS, (t) => ticks.push(t));

    fx.advance(TICK_MS * 3, 1);

    expect(ticks).toEqual([1, 2, 3]);
    expect(fx.tick).toBe(3);
  });

  it('accumulates correctly across many fractional (sub-tick) frames', () => {
    const ticks: number[] = [];
    const fx = new FixedTimestep(TICK_MS, (t) => ticks.push(t));
    const frameMs = TICK_MS / 5; // 5 frames per tick

    for (let i = 0; i < 5 * 4; i++) {
      fx.advance(frameMs, 1);
    }

    expect(ticks).toEqual([1, 2, 3, 4]);
    expect(fx.tick).toBe(4);
  });

  it('speed 2 accumulates twice as fast as speed 1', () => {
    const ticksAt1: number[] = [];
    const fxAt1 = new FixedTimestep(TICK_MS, (t) => ticksAt1.push(t));
    fxAt1.advance(TICK_MS, 1);

    const ticksAt2: number[] = [];
    const fxAt2 = new FixedTimestep(TICK_MS, (t) => ticksAt2.push(t));
    fxAt2.advance(TICK_MS, 2);

    expect(ticksAt1).toEqual([1]);
    expect(ticksAt2).toEqual([1, 2]);
  });

  it('speed 4 accumulates four times as fast as speed 1', () => {
    const ticks: number[] = [];
    const fx = new FixedTimestep(TICK_MS, (t) => ticks.push(t));

    fx.advance(TICK_MS, 4);

    expect(ticks).toEqual([1, 2, 3, 4]);
  });

  it('speed 0 pauses: no ticks run and alpha is frozen at its pre-pause value', () => {
    const ticks: number[] = [];
    const fx = new FixedTimestep(TICK_MS, (t) => ticks.push(t));

    const alphaBeforePause = fx.advance(30, 1); // partial tick, alpha = 0.6
    const tickBeforePause = fx.tick;

    const alphaDuringPause1 = fx.advance(1000, 0);
    const alphaDuringPause2 = fx.advance(2000, 0);

    expect(ticks).toEqual([]);
    expect(fx.tick).toBe(tickBeforePause);
    expect(alphaDuringPause1).toBe(alphaBeforePause);
    expect(alphaDuringPause2).toBe(alphaBeforePause);
  });

  it('resuming after a pause continues accumulating from where it left off', () => {
    const ticks: number[] = [];
    const fx = new FixedTimestep(TICK_MS, (t) => ticks.push(t));

    fx.advance(30, 1); // 30ms in, 20ms short of a tick
    fx.advance(1000, 0); // paused; must not accumulate this time
    fx.advance(20, 1); // resumes: 30 + 20 = 50ms -> exactly 1 tick

    expect(ticks).toEqual([1]);
  });

  it('clamps catch-up to at most 10 ticks per advance call (spiral-of-death guard)', () => {
    const ticks: number[] = [];
    const fx = new FixedTimestep(TICK_MS, (t) => ticks.push(t));

    // A huge stall: far more than 10 ticks' worth of elapsed time in one frame.
    fx.advance(TICK_MS * 1000, 1);

    expect(ticks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(fx.tick).toBe(10);
  });

  it('drops surplus time beyond the catch-up clamp instead of queuing it for later', () => {
    const ticks: number[] = [];
    const fx = new FixedTimestep(TICK_MS, (t) => ticks.push(t));

    fx.advance(TICK_MS * 1000, 1); // clamped to 10 ticks; huge surplus dropped
    fx.advance(TICK_MS * 9, 1); // only this frame's own 9 ticks' worth should run

    expect(fx.tick).toBe(19);
  });

  it('alpha stays within [0, 1) across arbitrary elapsed times', () => {
    const fx = new FixedTimestep(TICK_MS, () => undefined);
    for (let i = 0; i < 200; i++) {
      const alpha = fx.advance(7, 1);
      expect(alpha).toBeGreaterThanOrEqual(0);
      expect(alpha).toBeLessThan(1);
    }
  });

  it('throws if constructed with a non-positive tickMs', () => {
    expect(() => new FixedTimestep(0, () => undefined)).toThrow();
    expect(() => new FixedTimestep(-5, () => undefined)).toThrow();
  });
});
