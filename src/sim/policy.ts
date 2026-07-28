/**
 * SlimCity district policies: small,
 * explicit, tested economy/pathfind-cost effects applied per-district. Pure —
 * no GridState, no three.js/DOM, no hidden global state. A `PolicyStore`
 * instance is owned by the worker (Command 'setDistrictPolicy' flows into
 * `setPolicy`); the pure effect functions below are called wherever the sim
 * reads tax rates / pathfind edge cost / pollution emission, passed either
 * the whole store's `asMap()` snapshot (economy, which already has a
 * districtId per building tile) or a single district's own policy set
 * (pathfind, which resolves the district per-edge).
 */
import type { Policy } from '../shared/types';

/** lowTax district tax multiplier (< 1: a tax break). */
export const LOW_TAX_MULT = 0.7;
/** highTax district tax multiplier (> 1: a tax hike). */
export const HIGH_TAX_MULT = 1.3;
/** noHeavyTraffic pathfind-cost multiplier on a district's road edges (routes heavy/through traffic around it). */
export const NO_HEAVY_TRAFFIC_MULT = 1.6;
/** greenEnergy pollution-emission multiplier for a district's tiles (a reduction). */
export const GREEN_ENERGY_POLLUTION_MULT = 0.5;

export type DistrictPolicySet = ReadonlySet<Policy>;
export type DistrictPolicyMap = ReadonlyMap<number, DistrictPolicySet>;

const EMPTY_POLICIES: DistrictPolicySet = new Set<Policy>();

/**
 * The worker-owned per-district policy store. No hidden global state — one
 * instance per sim session, constructed by the worker and passed (or its
 * `asMap()` snapshot passed) into the effect functions below wherever a
 * policy is read.
 */
export class PolicyStore {
  private readonly byDistrict = new Map<number, Set<Policy>>();

  /** Toggles `policy` for `districtId` on/off (Command 'setDistrictPolicy'). */
  setPolicy(districtId: number, policy: Policy, on: boolean): void {
    let set = this.byDistrict.get(districtId);
    if (on) {
      if (!set) {
        set = new Set<Policy>();
        this.byDistrict.set(districtId, set);
      }
      set.add(policy);
    } else if (set) {
      set.delete(policy);
      if (set.size === 0) this.byDistrict.delete(districtId);
    }
  }

  /** True iff `policy` is currently enabled on `districtId`. */
  hasPolicy(districtId: number, policy: Policy): boolean {
    return this.byDistrict.get(districtId)?.has(policy) ?? false;
  }

  /** The live policy set for `districtId` (an empty, frozen set if none are enabled). */
  getPolicies(districtId: number): DistrictPolicySet {
    return this.byDistrict.get(districtId) ?? EMPTY_POLICIES;
  }

  /** A read-only view suitable for effectiveTaxRate's `districtPolicies` param. Live — reflects later setPolicy calls. */
  asMap(): DistrictPolicyMap {
    return this.byDistrict;
  }

  /**
   * The combined lowTax/highTax multiplier for `districtId` (1 when neither is
   * enabled, so an unassigned/unpolicied tile leaves tax income unchanged).
   * Both compose if somehow both are on, matching {@link effectiveTaxRate}.
   */
  taxMultiplierFor(districtId: number): number {
    const policies = this.byDistrict.get(districtId);
    if (!policies) return 1;
    let mult = 1;
    if (policies.has('lowTax')) mult *= LOW_TAX_MULT;
    if (policies.has('highTax')) mult *= HIGH_TAX_MULT;
    return mult;
  }
}

/**
 * `baseTax`, multiplied by LOW_TAX_MULT if `districtId`'s policies include
 * 'lowTax' and/or HIGH_TAX_MULT if they include 'highTax' — both multipliers
 * apply if somehow both are on (an explicit composition, not a special
 * case). `districtId` 0 (unassigned) or a district with no policies enabled
 * returns `baseTax` unchanged.
 */
export function effectiveTaxRate(
  baseTax: number,
  districtPolicies: DistrictPolicyMap,
  districtId: number,
): number {
  const policies = districtPolicies.get(districtId);
  if (!policies) return baseTax;
  let rate = baseTax;
  if (policies.has('lowTax')) rate *= LOW_TAX_MULT;
  if (policies.has('highTax')) rate *= HIGH_TAX_MULT;
  return rate;
}

/**
 * `base` pathfind edge cost, multiplied by NO_HEAVY_TRAFFIC_MULT when
 * `policies` includes 'noHeavyTraffic' (routes heavy/through traffic around
 * the district's roads) — otherwise unchanged. Takes the district's OWN
 * policy set directly (not the whole map): pathfind cost is evaluated
 * per-edge, with the district already resolved by the caller.
 * `policies === undefined` (e.g. an edge with no district) is a no-op.
 */
export function trafficWeight(base: number, policies: DistrictPolicySet | undefined): number {
  if (!policies) return base;
  return policies.has('noHeavyTraffic') ? base * NO_HEAVY_TRAFFIC_MULT : base;
}

/**
 * `basePollution` (a Pollution-field emission value), multiplied by
 * GREEN_ENERGY_POLLUTION_MULT when `policies` includes 'greenEnergy' —
 * otherwise unchanged. `policies === undefined` is a no-op.
 */
export function effectivePollution(
  basePollution: number,
  policies: DistrictPolicySet | undefined,
): number {
  if (!policies) return basePollution;
  return policies.has('greenEnergy') ? basePollution * GREEN_ENERGY_POLLUTION_MULT : basePollution;
}
