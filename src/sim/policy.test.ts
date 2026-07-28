import { describe, expect, it } from 'vitest';
import {
  effectivePollution,
  effectiveTaxRate,
  GREEN_ENERGY_POLLUTION_MULT,
  HIGH_TAX_MULT,
  LOW_TAX_MULT,
  NO_HEAVY_TRAFFIC_MULT,
  PolicyStore,
  trafficWeight,
} from './policy';

describe('PolicyStore', () => {
  it('starts with no policies enabled anywhere', () => {
    const store = new PolicyStore();
    expect(store.getPolicies(1).size).toBe(0);
    expect(store.hasPolicy(1, 'lowTax')).toBe(false);
  });

  it('setPolicy(on) enables a policy for a district, reflected by getPolicies/hasPolicy', () => {
    const store = new PolicyStore();
    store.setPolicy(1, 'lowTax', true);
    expect(store.hasPolicy(1, 'lowTax')).toBe(true);
    expect(store.getPolicies(1).has('lowTax')).toBe(true);
  });

  it('setPolicy(off) disables a previously-enabled policy', () => {
    const store = new PolicyStore();
    store.setPolicy(1, 'lowTax', true);
    store.setPolicy(1, 'lowTax', false);
    expect(store.hasPolicy(1, 'lowTax')).toBe(false);
    expect(store.getPolicies(1).size).toBe(0);
  });

  it('setPolicy(off) on a district/policy that was never on is a harmless no-op', () => {
    const store = new PolicyStore();
    store.setPolicy(1, 'highTax', false);
    expect(store.hasPolicy(1, 'highTax')).toBe(false);
  });

  it('a district can carry multiple simultaneous policies', () => {
    const store = new PolicyStore();
    store.setPolicy(3, 'noHeavyTraffic', true);
    store.setPolicy(3, 'greenEnergy', true);
    const policies = store.getPolicies(3);
    expect(policies.has('noHeavyTraffic')).toBe(true);
    expect(policies.has('greenEnergy')).toBe(true);
    expect(policies.size).toBe(2);
  });

  it('districts are independent — toggling one never affects another', () => {
    const store = new PolicyStore();
    store.setPolicy(1, 'lowTax', true);
    store.setPolicy(2, 'highTax', true);
    expect(store.hasPolicy(1, 'highTax')).toBe(false);
    expect(store.hasPolicy(2, 'lowTax')).toBe(false);
    expect(store.hasPolicy(1, 'lowTax')).toBe(true);
    expect(store.hasPolicy(2, 'highTax')).toBe(true);
  });

  it('asMap() is a live view reflecting later setPolicy calls', () => {
    const store = new PolicyStore();
    const map = store.asMap();
    expect(map.get(4)).toBeUndefined();
    store.setPolicy(4, 'lowTax', true);
    expect(map.get(4)?.has('lowTax')).toBe(true);
  });
});

describe('effectiveTaxRate', () => {
  const emptyMap = new Map<number, ReadonlySet<import('../shared/types').Policy>>();

  it('returns baseTax unchanged for a district with no entry in the map', () => {
    expect(effectiveTaxRate(0.1, emptyMap, 1)).toBe(0.1);
  });

  it('returns baseTax unchanged for districtId 0 (unassigned)', () => {
    const store = new PolicyStore();
    store.setPolicy(1, 'lowTax', true);
    expect(effectiveTaxRate(0.1, store.asMap(), 0)).toBe(0.1);
  });

  it('applies LOW_TAX_MULT when lowTax is enabled', () => {
    const store = new PolicyStore();
    store.setPolicy(2, 'lowTax', true);
    expect(effectiveTaxRate(0.2, store.asMap(), 2)).toBeCloseTo(0.2 * LOW_TAX_MULT);
  });

  it('applies HIGH_TAX_MULT when highTax is enabled', () => {
    const store = new PolicyStore();
    store.setPolicy(2, 'highTax', true);
    expect(effectiveTaxRate(0.2, store.asMap(), 2)).toBeCloseTo(0.2 * HIGH_TAX_MULT);
  });

  it('composes both multipliers if both lowTax and highTax are somehow enabled at once', () => {
    const store = new PolicyStore();
    store.setPolicy(2, 'lowTax', true);
    store.setPolicy(2, 'highTax', true);
    expect(effectiveTaxRate(0.2, store.asMap(), 2)).toBeCloseTo(0.2 * LOW_TAX_MULT * HIGH_TAX_MULT);
  });

  it('is unaffected by unrelated policies (noHeavyTraffic, greenEnergy)', () => {
    const store = new PolicyStore();
    store.setPolicy(2, 'noHeavyTraffic', true);
    store.setPolicy(2, 'greenEnergy', true);
    expect(effectiveTaxRate(0.2, store.asMap(), 2)).toBe(0.2);
  });
});

describe('trafficWeight', () => {
  it('returns base unchanged when policies is undefined', () => {
    expect(trafficWeight(10, undefined)).toBe(10);
  });

  it('returns base unchanged when the set has no noHeavyTraffic entry', () => {
    const store = new PolicyStore();
    store.setPolicy(1, 'lowTax', true);
    expect(trafficWeight(10, store.getPolicies(1))).toBe(10);
  });

  it('applies NO_HEAVY_TRAFFIC_MULT when noHeavyTraffic is enabled', () => {
    const store = new PolicyStore();
    store.setPolicy(1, 'noHeavyTraffic', true);
    expect(trafficWeight(10, store.getPolicies(1))).toBeCloseTo(10 * NO_HEAVY_TRAFFIC_MULT);
  });
});

describe('effectivePollution', () => {
  it('returns basePollution unchanged when policies is undefined', () => {
    expect(effectivePollution(100, undefined)).toBe(100);
  });

  it('returns basePollution unchanged when greenEnergy is not enabled', () => {
    const store = new PolicyStore();
    store.setPolicy(1, 'highTax', true);
    expect(effectivePollution(100, store.getPolicies(1))).toBe(100);
  });

  it('applies GREEN_ENERGY_POLLUTION_MULT when greenEnergy is enabled', () => {
    const store = new PolicyStore();
    store.setPolicy(1, 'greenEnergy', true);
    expect(effectivePollution(100, store.getPolicies(1))).toBeCloseTo(
      100 * GREEN_ENERGY_POLLUTION_MULT,
    );
  });
});
