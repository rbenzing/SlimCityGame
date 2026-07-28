/**
 * Pure, deterministic display formatters for the status strip and friends.
 * No Math.random/Date.now — everything is a function of sim state
 * (stats.tick, stats.happiness, ...).
 */
import { CLOCK_START_OFFSET_TICKS, VISUAL_DAY_TICKS } from '../shared/constants';

/**
 * `HH:MM` from the visual day/night cycle (decoupled from the calendar day).
 * Shifted by CLOCK_START_OFFSET_TICKS so tick 0 reads 09:00, matching the
 * lighting rig's identically-offset dayT in main.ts (boot-at-09:00).
 */
export function formatClock(tick: number): string {
  const shifted = tick + CLOCK_START_OFFSET_TICKS;
  const dayFraction =
    (((shifted % VISUAL_DAY_TICKS) + VISUAL_DAY_TICKS) % VISUAL_DAY_TICKS) / VISUAL_DAY_TICKS;
  const totalMinutes = Math.floor(dayFraction * 24 * 60);
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export type Season = 'Winter' | 'Spring' | 'Summer' | 'Fall';

/** Display-only season flavor derived from the real game month. */
export function seasonForMonth(month: number): Season {
  if (month === 12 || month <= 2) return 'Winter';
  if (month <= 5) return 'Spring';
  if (month <= 8) return 'Summer';
  return 'Fall';
}

/** Single emoji-style face stepped from city happiness (exact thresholds). */
export function happinessFace(happiness: number): string {
  if (happiness < 35) return '😞';
  if (happiness < 55) return '😐';
  if (happiness < 75) return '🙂';
  return '😄';
}

export type Trend = 'up' | 'down' | 'flat';

/** Trend arrow direction vs. a previous-month snapshot. */
export function trendOf(current: number, previous: number): Trend {
  if (current > previous) return 'up';
  if (current < previous) return 'down';
  return 'flat';
}

/** Maps a -1..1 demand level onto a 0..100 bar-fill percentage. */
export function demandPct(value: number): number {
  return Math.max(0, Math.min(1, (value + 1) / 2)) * 100;
}

export function formatPopulation(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** ¢-prefixed, comma-formatted magnitude. Sign/tinting is the caller's job. */
export function formatFunds(amount: number): string {
  return `¢${Math.round(Math.abs(amount)).toLocaleString('en-US')}`;
}
