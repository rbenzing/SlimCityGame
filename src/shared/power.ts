/**
 * What a generator is worth to the grid.
 *
 * A plant's catalog entry carries its nameplate, the rating on the machine,
 * and its capacity factor, the published share of the year a plant of its
 * kind actually runs at that rating. The grid is sized on the product, never
 * on the nameplate: a wind turbine rated at 3.4 MW that turns a third of the
 * time lights a third of the homes its rating suggests.
 */
import type { UtilitySpec } from './types';

/** A plant's average output over a year, MW: nameplate × capacity factor (1 when the entry carries none). Pure. */
export function averageOutputMW(utility: UtilitySpec): number {
  return (utility.powerMW ?? 0) * (utility.capacityFactor ?? 1);
}

/** Megawatts for a label: whole above ten, one decimal below, two below one. Pure. */
export function formatMW(mw: number): string {
  if (mw >= 10) return String(Math.round(mw));
  if (mw >= 1) return (Math.round(mw * 10) / 10).toString();
  return (Math.round(mw * 100) / 100).toString();
}
