/**
 * City audio: an ambient soundscape, short UI cues, and the mixing bus the
 * music player hangs off.
 *
 * App layer, like session.ts: it reads snapshots and settings and is never
 * imported by src/sim or src/render, so it cannot touch determinism. Every
 * built-in sound is SYNTHESIZED from WebAudio primitives — there is no audio
 * asset pipeline and binaries do not belong in the repo, so oscillators and
 * filtered noise stand in for samples at zero bytes and zero load time.
 *
 * Nothing is constructed at import time: an AudioContext created outside a
 * user gesture starts suspended (and warns), so the graph is built on the
 * first unlock() and every call before that is a no-op instead of an error.
 */

/** Layer gains, 0..1, for one moment of city life. */
export interface AmbientMix {
  traffic: number;
  night: number;
  wind: number;
}

export interface AmbientInput {
  /** Clock hour 0..24, the same one the status strip shows. */
  hour: number;
  population: number;
  /** 0 (full day) .. 1 (full night), the render nightFactor. */
  nightFactor: number;
}

/** Population at which the traffic bed is as loud as it gets. */
const POP_FULL_TRAFFIC = 8000;
/** How loud the city is with almost nobody in it — a town is not silent. */
const TRAFFIC_FLOOR = 0.15;

/**
 * Share of peak street activity at a given hour: morning and evening commute
 * peaks over a daytime plateau, falling to a low overnight floor. Deliberately
 * a local copy of the shape sim/traffic.ts uses for trip budgets — the app
 * layer stays free of sim imports, and the two serve different masters (this
 * one only has to sound right).
 */
export function activityForHour(hour: number): number {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 21 || h < 5) return 0.08; // overnight floor
  if (h < 7) return 0.08 + ((h - 5) / 2) * 0.5; // pre-dawn ramp
  if (h < 9) return 0.58 + (1 - Math.abs(h - 8)) * 0.42; // morning commute peak
  if (h < 16) return 0.62; // daytime plateau
  if (h < 19) return 0.62 + (1 - Math.abs(h - 17.5) / 1.5) * 0.38; // evening peak
  return Math.max(0.08, 0.6 - (h - 19) * 0.26); // wind-down into the night
}

/**
 * Ambient layer gains for the city's current state. Pure — the whole mix is a
 * function of clock, size and light, so it is testable without any audio stack.
 */
export function ambientMix(input: AmbientInput): AmbientMix {
  const activity = activityForHour(input.hour);
  const size = Math.min(1, Math.max(0, input.population) / POP_FULL_TRAFFIC);
  const night = Math.min(1, Math.max(0, input.nightFactor));
  return {
    traffic: activity * (TRAFFIC_FLOOR + (1 - TRAFFIC_FLOOR) * size),
    // Insect shimmer belongs to the dark, and to the quiet edges of a city
    // rather than a downtown — it thins out as the place fills up.
    night: night * (1 - 0.6 * size),
    // Always there, a touch stronger after dark when nothing masks it.
    wind: 0.55 + 0.45 * night,
  };
}

/** The short cues the UI fires. */
export type UiSound = 'click' | 'build' | 'denied' | 'notify';

/** Per-layer ceilings — the bed sits under the game, never on top of it. */
const LAYER_GAIN: AmbientMix = { traffic: 0.32, night: 0.16, wind: 0.07 };
/** Seconds for a layer to glide to a new gain, so the mix never steps. */
const MIX_GLIDE_S = 1.5;

export interface AudioEngineOptions {
  /** Injected so tests can drive a fake; defaults to the browser's context. */
  createContext?: () => AudioContext;
}

/**
 * Owns the context, the master gain and the three sub-buses (ambient / ui /
 * music). Safe to construct before any user gesture — it stays inert until
 * unlock().
 */
export class AudioEngine {
  private readonly createContext: () => AudioContext;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambientBus: GainNode | null = null;
  private uiBus: GainNode | null = null;
  private music: GainNode | null = null;
  private layers: { [K in keyof AmbientMix]?: GainNode } = {};
  private volume = 0.7;
  private muted = false;
  private musicVolume = 0.7;
  /** Remembered while inert so the first unlock() starts at the right mix. */
  private pendingMix: AmbientMix = { traffic: 0, night: 0, wind: 0 };

  constructor(options: AudioEngineOptions = {}) {
    this.createContext =
      options.createContext ??
      ((): AudioContext => {
        // Safari still only exposes the prefixed constructor.
        const Ctor =
          window.AudioContext ??
          (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) throw new Error('WebAudio unavailable');
        return new Ctor();
      });
  }

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  /**
   * Builds the graph and resumes the context. Idempotent: safe to call on
   * every gesture, which is exactly how main.ts wires it.
   */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    let ctx: AudioContext;
    try {
      ctx = this.createContext();
    } catch {
      return; // no audio available — the game plays on in silence
    }
    if (!ctx) return;
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : this.volume;
    this.master.connect(ctx.destination);

    this.ambientBus = ctx.createGain();
    this.uiBus = ctx.createGain();
    this.music = ctx.createGain();
    this.music.gain.value = this.musicVolume;
    this.ambientBus.connect(this.master);
    this.uiBus.connect(this.master);
    this.music.connect(this.master);

    this.buildAmbientBed(ctx, this.ambientBus);
    this.setAmbient(this.pendingMix);
    void ctx.resume();
  }

  /** Master volume + mute, applied live from the Options panel. */
  setMasterVolume(volume: number, muted: boolean): void {
    this.volume = Math.min(1, Math.max(0, volume));
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : this.volume;
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = Math.min(1, Math.max(0, volume));
    if (this.music) this.music.gain.value = this.musicVolume;
  }

  /**
   * The node the music player connects its media source to. Null while inert —
   * the player re-attaches once the engine unlocks.
   */
  musicBus(): GainNode | null {
    return this.music;
  }

  context(): AudioContext | null {
    return this.ctx;
  }

  /** Current master gain — what mute/volume actually did. Harness introspection. */
  masterGainValue(): number {
    return this.master ? this.master.gain.value : 0;
  }

  /** Glides the ambient bed to a new mix; cheap enough to call per snapshot. */
  setAmbient(mix: AmbientMix): void {
    this.pendingMix = mix;
    const ctx = this.ctx;
    if (!ctx) return;
    for (const layer of ['traffic', 'night', 'wind'] as const) {
      const node = this.layers[layer];
      if (!node) continue;
      const target = Math.min(1, Math.max(0, mix[layer])) * LAYER_GAIN[layer];
      node.gain.setTargetAtTime(target, ctx.currentTime, MIX_GLIDE_S);
    }
  }

  /** Fires a one-shot UI cue. No-op while inert. */
  play(sound: UiSound): void {
    const ctx = this.ctx;
    const bus = this.uiBus;
    if (!ctx || !bus) return;
    switch (sound) {
      case 'click':
        this.blip(ctx, bus, 880, 0.05, 'triangle', 0.16);
        break;
      case 'build':
        // Two rising tones — the "that worked" shape.
        this.blip(ctx, bus, 523, 0.07, 'triangle', 0.2);
        this.blip(ctx, bus, 784, 0.1, 'triangle', 0.18, 0.06);
        break;
      case 'denied':
        this.blip(ctx, bus, 155, 0.18, 'sawtooth', 0.14);
        break;
      case 'notify':
        this.blip(ctx, bus, 1046, 0.12, 'sine', 0.14);
        this.blip(ctx, bus, 1318, 0.16, 'sine', 0.1, 0.08);
        break;
    }
  }

  /** Releases the context. Called on teardown; safe to call twice. */
  dispose(): void {
    const ctx = this.ctx;
    this.ctx = null;
    this.master = null;
    this.ambientBus = null;
    this.uiBus = null;
    this.music = null;
    this.layers = {};
    if (ctx) void ctx.close();
  }

  /** One oscillator with a short percussive envelope, self-cleaning. */
  private blip(
    ctx: AudioContext,
    bus: GainNode,
    frequency: number,
    duration: number,
    type: OscillatorType,
    peak: number,
    delay = 0,
  ): void {
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = type;
    osc.frequency.value = frequency;
    env.gain.value = 0;
    env.gain.setValueAtTime(0, start);
    env.gain.linearRampToValueAtTime(peak, start + 0.008); // fast attack, no click
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(env);
    env.connect(bus);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  /**
   * The three looping layers. All are shaped noise: a lowpassed rumble for
   * traffic, a near-DC hiss for wind, and a bandpassed shimmer slowly
   * modulated by an LFO for the night insects — which avoids a JS timer
   * scheduling individual chirps.
   */
  private buildAmbientBed(ctx: AudioContext, bus: GainNode): void {
    const noise = this.noiseBuffer(ctx);

    this.layers.traffic = this.noiseLayer(ctx, bus, noise, 'lowpass', 420, 0.7);
    this.layers.wind = this.noiseLayer(ctx, bus, noise, 'lowpass', 180, 0.4);

    const night = this.noiseLayer(ctx, bus, noise, 'bandpass', 4200, 9);
    this.layers.night = night;
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();
    lfo.frequency.value = 5.5; // the pulse of a cricket chorus
    lfoDepth.gain.value = 0.5;
    lfo.connect(lfoDepth);
    lfoDepth.connect(night.gain); // rides on top of the layer's own gain
    lfo.start();
  }

  private noiseLayer(
    ctx: AudioContext,
    bus: GainNode,
    buffer: AudioBuffer,
    type: BiquadFilterType,
    frequency: number,
    q: number,
  ): GainNode {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(bus);
    source.start();
    return gain;
  }

  /** A couple of seconds of noise, looped by every layer. */
  private noiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Deterministic hash noise rather than Math.random: identical every run,
    // and white enough once it is filtered.
    let seed = 0x9e3779b9;
    for (let i = 0; i < length; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      data[i] = (seed / 0xffffffff) * 2 - 1;
    }
    return buffer;
  }
}
