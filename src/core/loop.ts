/** Spiral-of-death guard: at most this many ticks run in a single `advance`. */
const MAX_CATCHUP_TICKS = 10;

/**
 * Fixed-timestep sim driver: the simulation advances in
 * discrete ticks of `tickMs` regardless of render frame rate. `advance` is
 * called once per render frame with the elapsed real time and the current
 * game speed; it runs zero or more ticks (via `onTick`) and returns an
 * interpolation alpha in [0, 1) the render thread can use to blend between
 * the previous and current tick's state.
 *
 * Speed 0 pauses the sim entirely: no ticks run, no time is accumulated, and
 * the previously computed alpha is held (frozen) until the sim resumes.
 *
 * A "spiral of death" guard clamps catch-up to at most `MAX_CATCHUP_TICKS`
 * ticks per `advance` call — if the sim has fallen further behind than that
 * (e.g. the tab was backgrounded), the surplus time is dropped rather than
 * attempting to run thousands of ticks in one frame.
 */
export class FixedTimestep {
  private accumulatorMs = 0;
  private tickCounter = 0;
  private alpha = 0;

  constructor(
    private readonly tickMs: number,
    private readonly onTick: (tick: number) => void,
  ) {
    if (!(tickMs > 0)) {
      throw new Error(`FixedTimestep: tickMs must be > 0, got ${tickMs}`);
    }
  }

  /** Total number of ticks that have run since construction. */
  get tick(): number {
    return this.tickCounter;
  }

  /**
   * Advance the sim by `elapsedMs` of real time scaled by `speedMultiplier`
   * (a pure real-time factor: 1.0 = TICK_RATE ticks/second, 0 = paused; the
   * caller maps the player-facing SimSpeed button through SPEED_MULTIPLIERS
   * first — see shared/constants.ts). Render FPS never couples to sim rate.
   * Runs `onTick(tick)` once per completed tick, in order, passing the
   * absolute tick counter, then returns the render-interpolation alpha.
   */
  advance(elapsedMs: number, speedMultiplier: number): number {
    if (speedMultiplier <= 0) {
      return this.alpha;
    }

    this.accumulatorMs += elapsedMs * speedMultiplier;

    const maxAccumulatorMs = MAX_CATCHUP_TICKS * this.tickMs;
    if (this.accumulatorMs > maxAccumulatorMs) {
      this.accumulatorMs = maxAccumulatorMs;
    }

    let ticksRun = 0;
    while (this.accumulatorMs >= this.tickMs && ticksRun < MAX_CATCHUP_TICKS) {
      this.accumulatorMs -= this.tickMs;
      this.tickCounter += 1;
      this.onTick(this.tickCounter);
      ticksRun += 1;
    }

    this.alpha = this.accumulatorMs / this.tickMs;
    return this.alpha;
  }
}
