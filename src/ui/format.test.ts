import { describe, expect, it } from 'vitest';
import { CLOCK_START_OFFSET_TICKS, VISUAL_DAY_TICKS } from '../shared/constants';
import {
  demandPct,
  formatClock,
  formatFunds,
  formatPopulation,
  happinessFace,
  seasonForMonth,
  trendOf,
} from './format';

describe('formatClock', () => {
  it('boots at 09:00 — tick 0 renders the §6.5 morning start, not midnight', () => {
    expect(formatClock(0)).toBe('09:00');
  });

  it('shifts by exactly CLOCK_START_OFFSET_TICKS (9/24 of the visual day)', () => {
    expect(CLOCK_START_OFFSET_TICKS).toBe(Math.round((VISUAL_DAY_TICKS * 9) / 24));
    // The tick that cancels the offset renders midnight.
    expect(formatClock(VISUAL_DAY_TICKS - CLOCK_START_OFFSET_TICKS)).toBe('00:00');
  });

  it('maps the midpoint of the visual day to 21:00 (09:00 + 12h)', () => {
    expect(formatClock(VISUAL_DAY_TICKS / 2)).toBe('21:00');
  });

  it('wraps around after a full visual day (decoupled from calendar ticks)', () => {
    expect(formatClock(VISUAL_DAY_TICKS)).toBe('09:00');
    expect(formatClock(VISUAL_DAY_TICKS + 30)).toBe(formatClock(30));
  });

  it('pads single-digit hours and minutes', () => {
    // 16/24 of the way through the day is 09:00 + 16h = 01:00 next morning.
    expect(formatClock(Math.round((VISUAL_DAY_TICKS * 16) / 24))).toBe('01:00');
  });
});

describe('seasonForMonth', () => {
  it('maps December, January, February to Winter', () => {
    expect(seasonForMonth(12)).toBe('Winter');
    expect(seasonForMonth(1)).toBe('Winter');
    expect(seasonForMonth(2)).toBe('Winter');
  });

  it('maps March-May to Spring', () => {
    expect(seasonForMonth(3)).toBe('Spring');
    expect(seasonForMonth(4)).toBe('Spring');
    expect(seasonForMonth(5)).toBe('Spring');
  });

  it('maps June-August to Summer', () => {
    expect(seasonForMonth(6)).toBe('Summer');
    expect(seasonForMonth(7)).toBe('Summer');
    expect(seasonForMonth(8)).toBe('Summer');
  });

  it('maps September-November to Fall', () => {
    expect(seasonForMonth(9)).toBe('Fall');
    expect(seasonForMonth(10)).toBe('Fall');
    expect(seasonForMonth(11)).toBe('Fall');
  });
});

describe('happinessFace', () => {
  it('steps through the four faces at the documented thresholds', () => {
    expect(happinessFace(0)).toBe('😞');
    expect(happinessFace(34.9)).toBe('😞');
    expect(happinessFace(35)).toBe('😐');
    expect(happinessFace(54.9)).toBe('😐');
    expect(happinessFace(55)).toBe('🙂');
    expect(happinessFace(74.9)).toBe('🙂');
    expect(happinessFace(75)).toBe('😄');
    expect(happinessFace(100)).toBe('😄');
  });
});

describe('trendOf', () => {
  it('reports up/down/flat relative to the previous value', () => {
    expect(trendOf(10, 5)).toBe('up');
    expect(trendOf(5, 10)).toBe('down');
    expect(trendOf(5, 5)).toBe('flat');
  });
});

describe('demandPct', () => {
  it('maps the -1..1 demand range onto 0..100', () => {
    expect(demandPct(-1)).toBe(0);
    expect(demandPct(0)).toBe(50);
    expect(demandPct(1)).toBe(100);
  });

  it('clamps out-of-range values', () => {
    expect(demandPct(-5)).toBe(0);
    expect(demandPct(5)).toBe(100);
  });
});

describe('formatPopulation', () => {
  it('rounds and comma-formats', () => {
    expect(formatPopulation(4200)).toBe('4,200');
    expect(formatPopulation(0)).toBe('0');
    expect(formatPopulation(1234.6)).toBe('1,235');
  });
});

describe('formatFunds', () => {
  it('formats a positive amount with the cents-sign prefix', () => {
    expect(formatFunds(50_000)).toBe('¢50,000');
  });

  it("formats the magnitude only (sign is the caller's responsibility)", () => {
    expect(formatFunds(-500)).toBe('¢500');
  });
});
