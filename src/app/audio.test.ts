import { describe, it, expect, vi } from 'vitest';
import { activityForHour, ambientMix, AudioEngine } from './audio';

/**
 * jsdom has no WebAudio, so the engine takes an injected context factory and
 * these tests drive a fake that records what was built and connected.
 */
function fakeParam(): AudioParam {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    setTargetAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  } as unknown as AudioParam;
}

interface FakeCtx {
  ctx: AudioContext;
  gains: { gain: AudioParam; connect: ReturnType<typeof vi.fn> }[];
  oscillators: { frequency: { value: number }; start: ReturnType<typeof vi.fn> }[];
  resumed: ReturnType<typeof vi.fn>;
  closed: ReturnType<typeof vi.fn>;
}

function fakeContext(): FakeCtx {
  const gains: FakeCtx['gains'] = [];
  const oscillators: FakeCtx['oscillators'] = [];
  const resumed = vi.fn();
  const closed = vi.fn();
  const ctx = {
    currentTime: 0,
    sampleRate: 48000,
    destination: {},
    state: 'suspended',
    resume: resumed,
    close: closed,
    createGain: () => {
      const node = { gain: fakeParam(), connect: vi.fn(), disconnect: vi.fn() };
      gains.push(node);
      return node;
    },
    createOscillator: () => {
      const node = {
        type: 'sine',
        frequency: { value: 0 },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(node);
      return node;
    },
    createBufferSource: () => ({ buffer: null, loop: false, connect: vi.fn(), start: vi.fn() }),
    createBiquadFilter: () => ({
      type: 'lowpass',
      frequency: { value: 0 },
      Q: { value: 0 },
      connect: vi.fn(),
    }),
    createBuffer: (_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    }),
  } as unknown as AudioContext;
  return { ctx, gains, oscillators, resumed, closed };
}

describe('activityForHour', () => {
  it('peaks at the commutes and bottoms out overnight', () => {
    const morning = activityForHour(8);
    const evening = activityForHour(17.5);
    const midday = activityForHour(13);
    const night = activityForHour(3);

    expect(morning).toBeGreaterThan(midday);
    expect(evening).toBeGreaterThan(midday);
    expect(midday).toBeGreaterThan(night);
    expect(night).toBeLessThan(0.15); // 3am is nearly silent
  });

  it('is continuous around the clock and stays in 0..1', () => {
    for (let h = 0; h < 24; h += 0.25) {
      const value = activityForHour(h);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    // Wrapping is handled, so a negative or >24 hour is not a special case.
    expect(activityForHour(25)).toBeCloseTo(activityForHour(1), 10);
    expect(activityForHour(-1)).toBeCloseTo(activityForHour(23), 10);
  });
});

describe('ambientMix', () => {
  it('scales traffic with city size but never to silence in a small town', () => {
    const empty = ambientMix({ hour: 8, population: 0, nightFactor: 0 });
    const town = ambientMix({ hour: 8, population: 2000, nightFactor: 0 });
    const city = ambientMix({ hour: 8, population: 50000, nightFactor: 0 });

    expect(empty.traffic).toBeGreaterThan(0);
    expect(town.traffic).toBeGreaterThan(empty.traffic);
    expect(city.traffic).toBeGreaterThan(town.traffic);
    expect(city.traffic).toBeLessThanOrEqual(1);
  });

  it('is quieter at 3am than at rush hour for the same city', () => {
    const rush = ambientMix({ hour: 8, population: 5000, nightFactor: 0 });
    const small = ambientMix({ hour: 3, population: 5000, nightFactor: 1 });
    expect(small.traffic).toBeLessThan(rush.traffic * 0.3);
  });

  it('brings insects out at night, and thins them as the city fills in', () => {
    const day = ambientMix({ hour: 12, population: 1000, nightFactor: 0 });
    const rural = ambientMix({ hour: 1, population: 200, nightFactor: 1 });
    const downtown = ambientMix({ hour: 1, population: 40000, nightFactor: 1 });

    expect(day.night).toBe(0);
    expect(rural.night).toBeGreaterThan(0.5);
    expect(downtown.night).toBeLessThan(rural.night);
  });

  it('keeps a wind floor at all hours', () => {
    for (const hour of [0, 6, 12, 18]) {
      expect(ambientMix({ hour, population: 0, nightFactor: 0 }).wind).toBeGreaterThan(0);
    }
  });
});

describe('AudioEngine', () => {
  it('stays inert until unlocked — no context is built at construction', () => {
    const createContext = vi.fn(() => fakeContext().ctx);
    const engine = new AudioEngine({ createContext });

    engine.setAmbient({ traffic: 1, night: 1, wind: 1 });
    engine.play('click');

    expect(createContext).not.toHaveBeenCalled();
    expect(engine.unlocked).toBe(false);
    expect(engine.musicBus()).toBeNull();
  });

  it('unlock builds the graph once and is safe to call on every gesture', () => {
    const fake = fakeContext();
    const createContext = vi.fn(() => fake.ctx);
    const engine = new AudioEngine({ createContext });

    engine.unlock();
    const afterFirst = fake.gains.length;
    engine.unlock();
    engine.unlock();

    expect(createContext).toHaveBeenCalledTimes(1);
    expect(fake.gains.length).toBe(afterFirst); // no stacked nodes
    expect(fake.resumed).toHaveBeenCalledTimes(3); // but every gesture retries resume
    expect(engine.unlocked).toBe(true);
    expect(engine.musicBus()).not.toBeNull();
  });

  it('applies the mix set while inert once it unlocks', () => {
    const fake = fakeContext();
    const engine = new AudioEngine({ createContext: () => fake.ctx });

    engine.setAmbient({ traffic: 1, night: 0, wind: 0 });
    engine.unlock();

    const scheduled = fake.gains.flatMap((g) =>
      (g.gain.setTargetAtTime as unknown as { mock: { calls: number[][] } }).mock.calls.map(
        (call) => call[0]!,
      ),
    );
    expect(scheduled.some((value) => value > 0)).toBe(true);
  });

  it('mute drops the master gain to zero and unmuting restores the volume', () => {
    const fake = fakeContext();
    const engine = new AudioEngine({ createContext: () => fake.ctx });
    engine.unlock();
    const master = fake.gains[0]!; // built first, feeds the destination

    engine.setMasterVolume(0.5, false);
    expect(master.gain.value).toBeCloseTo(0.5, 6);

    engine.setMasterVolume(0.5, true);
    expect(master.gain.value).toBe(0);

    engine.setMasterVolume(0.5, false);
    expect(master.gain.value).toBeCloseTo(0.5, 6);
  });

  it('volume set before unlock survives into the built graph', () => {
    const fake = fakeContext();
    const engine = new AudioEngine({ createContext: () => fake.ctx });
    engine.setMasterVolume(0.25, false);
    engine.unlock();
    expect(fake.gains[0]!.gain.value).toBeCloseTo(0.25, 6);
  });

  it('plays a UI cue as short-lived oscillator voices', () => {
    const fake = fakeContext();
    const engine = new AudioEngine({ createContext: () => fake.ctx });
    engine.unlock();
    const before = fake.oscillators.length;

    engine.play('click');
    expect(fake.oscillators.length).toBe(before + 1);

    engine.play('build'); // two-tone
    expect(fake.oscillators.length).toBe(before + 3);
  });

  it('survives a browser that refuses to give us a context', () => {
    const engine = new AudioEngine({
      createContext: () => {
        throw new Error('no audio');
      },
    });
    expect(() => engine.unlock()).not.toThrow();
    expect(engine.unlocked).toBe(false);
    expect(() => engine.play('build')).not.toThrow();
  });

  it('dispose closes the context and can be called twice', () => {
    const fake = fakeContext();
    const engine = new AudioEngine({ createContext: () => fake.ctx });
    engine.unlock();

    engine.dispose();
    engine.dispose();

    expect(fake.closed).toHaveBeenCalledTimes(1);
    expect(engine.unlocked).toBe(false);
  });
});
