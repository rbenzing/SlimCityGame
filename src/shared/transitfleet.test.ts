import { describe, expect, it } from 'vitest';
import {
  allocate,
  COMMERCIAL_SPEED_MPS,
  cycleSeconds,
  defaultFleet,
  fieldsOf,
  headwayMin,
  RIDERS_PER_VEHICLE,
  RUNNING_COST_CENTS,
  runningCost,
  SPARE_RATIO,
} from './transitfleet';

describe('what a depot fields', () => {
  it('keeps a fifth as spares, floored: ten buses field eight, thirty-six field twenty-eight', () => {
    expect(SPARE_RATIO).toBe(0.2);
    expect(fieldsOf(10)).toBe(8);
    expect(fieldsOf(36)).toBe(28);
    expect(fieldsOf(8)).toBe(6);
    expect(fieldsOf(5)).toBe(4);
  });

  it('fields nothing from nothing', () => {
    expect(fieldsOf(0)).toBe(0);
    expect(fieldsOf(-3)).toBe(0);
  });
});

describe('cycle time and headway', () => {
  it('runs a bus and a tram at 20 km/h and a train at 48 km/h', () => {
    expect(COMMERCIAL_SPEED_MPS.bus).toBeCloseTo(5.56, 6);
    expect(COMMERCIAL_SPEED_MPS.tram).toBeCloseTo(5.56, 6);
    expect(COMMERCIAL_SPEED_MPS.rail).toBeCloseTo(13.3, 6);
  });

  it('gives a 60-tile bus line an 8.3-minute cycle, and two buses a 4.1-minute headway', () => {
    expect(cycleSeconds('bus', 60) / 60).toBeCloseTo(8.3, 1);
    expect(headwayMin('bus', 60, 2)).toBeCloseTo(4.14, 2);
  });

  it('doubles both when the route doubles', () => {
    expect(cycleSeconds('bus', 120)).toBeCloseTo(2 * cycleSeconds('bus', 60), 9);
    expect(headwayMin('bus', 120, 2)).toBeCloseTo(2 * headwayMin('bus', 60, 2), 9);
  });

  it('reads no headway where nothing runs, and no cycle for a line with no route', () => {
    expect(headwayMin('bus', 60, 0)).toBe(0);
    expect(cycleSeconds('bus', 0)).toBe(0);
  });
});

describe('the default fleet', () => {
  it('is the larger of the frequency and capacity figures', () => {
    // The worked example: 6,000 daily boardings over 150 tiles asks for five
    // buses to carry the peak hour against three to hold a ten-minute headway.
    expect(defaultFleet('bus', 6000, 150)).toBe(5);
    expect(defaultFleet('bus', 0, 150)).toBe(3);
  });

  it('asks for nothing on a line with no route', () => {
    expect(defaultFleet('bus', 6000, 0)).toBe(0);
  });

  it('asks for fewer sets of a bigger vehicle over the same riders', () => {
    expect(RIDERS_PER_VEHICLE).toEqual({ bus: 48, tram: 150, rail: 450 });
    expect(defaultFleet('rail', 60_000, 150)).toBeLessThan(defaultFleet('bus', 60_000, 150));
  });
});

describe('sharing a pool out', () => {
  it('gives every line what it asked for when the pool covers it', () => {
    expect(allocate([2, 3, 1], 8)).toEqual([2, 3, 1]);
    expect(allocate([2, 3, 1], 6)).toEqual([2, 3, 1]);
  });

  it('cuts lines back in proportion and sums to exactly the pool', () => {
    const served = allocate([4, 4, 2], 5);
    expect(served.reduce((a, b) => a + b, 0)).toBe(5);
    // Floors of 2, 2, 1 share the pool; nothing is lost or invented.
    expect(served).toEqual([2, 2, 1]);
  });

  it('hands the floors’ remainders down the list in order, one each', () => {
    // Floors of 1, 1, 1 leave two over; the first two lines take them.
    expect(allocate([3, 3, 3], 5)).toEqual([2, 2, 1]);
  });

  it('serves nobody from an empty pool', () => {
    expect(allocate([3, 2], 0)).toEqual([0, 0]);
    expect(allocate([], 0)).toEqual([]);
  });

  it('never gives a line more than it asked for, and nothing to a line asking for nothing', () => {
    expect(allocate([0, 5], 3)).toEqual([0, 3]);
    expect(allocate([0, 0], 3)).toEqual([0, 0]);
  });

  it('is deterministic for the same inputs', () => {
    expect(allocate([7, 5, 3, 1], 9)).toEqual(allocate([7, 5, 3, 1], 9));
  });
});

describe('the running charge', () => {
  it('charges ¢40 a bus, ¢70 a tram set and ¢142 a train set, per vehicle in service', () => {
    expect(RUNNING_COST_CENTS).toEqual({ bus: 40, tram: 70, rail: 142 });
    expect(runningCost('bus', 3)).toBe(120);
    expect(runningCost('tram', 2)).toBe(140);
    expect(runningCost('rail', 1)).toBe(142);
    expect(runningCost('bus', 0)).toBe(0);
  });
});
