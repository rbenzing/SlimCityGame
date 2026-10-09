/**
 * A building's floor: the body it is drawn as, and the storeys stacked on it.
 * One implementation for the body the renderer draws, the jobs and draw the
 * catalog derives from that floor, and the parking a lot's code asks of it,
 * so a building is never drawn with a floor its figures do not come from.
 * Pure.
 */
import { TILE_METERS } from './constants';
import type { BuildingCatalogEntry, BuildingKind } from './types';

/** A storey: the window rows, the floor count and the floor area all count it. */
export const FLOOR_HEIGHT_METERS = 3.2;

/** Square feet in a square metre, which the codes count floor and parking in. */
export const SQ_FT_PER_M2 = 10.764;

/**
 * A detached home is 9–14 m across the front depending on which of the three
 * ResLow sizes grew, since the smallest of them stands on a two-tile lot: the
 * per-tile figure is half a frontage, not a whole one. Measured against the
 * 4.0 m car at the kerb and the 3.2 m storey, a house wider than about 14 m
 * stops reading as a house and starts reading as a hall.
 */
export const RES_LOW_BODY_M_PER_TILE = 4.75;
/** A house on a half or a normal lot is as wide as one on a double lot: the lot is what shrinks. */
export const DETACHED_BODY_MIN_M = 2 * RES_LOW_BODY_M_PER_TILE;
export const DEFAULT_BODY_M_PER_TILE = 13.6;
/** No body fills its lot outright, so neighbouring buildings never touch. */
export const MAX_FOOTPRINT_FILL = 0.85;

/**
 * How a kind's body is sized on each lot axis: so many metres per lot tile,
 * or a share of the lot, either way no more than a cap. The missing-middle
 * kinds are fixed-size buildings on whatever lot they got; a block fills its
 * plate.
 */
interface BodyRule {
  perTileM?: number;
  fill?: number;
  capM?: number;
  /** A body is never narrower than this, within the 85% of its lot. */
  minM?: number;
  /** Replaces the usual 85% ceiling for a kind that builds closer to its lot lines. */
  maxFill?: number;
}

/** A townhouse row's body: three 6 m homes, a lot wide and as deep, on a 20 m frontage. */
const TOWNHOUSE_BODY_CAP_M = 18;
const TOWNHOUSE_MAX_FILL = 0.9;

const DEFAULT_BODY_RULE: BodyRule = { perTileM: DEFAULT_BODY_M_PER_TILE };

/**
 * The duplex, fourplex and multiplex sizes are the types' own building
 * dimensions; a restaurant is a box on a lot that is mostly car park, and a
 * filling station a kiosk behind its forecourt. A flex building sits in its
 * car park at the type's 25–40% site coverage, and a chemical plant leaves
 * half its site to its tank farm and yards.
 */
const BODY_RULES: Partial<Record<BuildingKind, BodyRule>> = {
  detached: { perTileM: RES_LOW_BODY_M_PER_TILE, minM: DETACHED_BODY_MIN_M },
  duplex: { fill: 0.6, capM: 16 },
  fourplex: { fill: 0.7, capM: 18 },
  townhouse: { fill: TOWNHOUSE_MAX_FILL, maxFill: TOWNHOUSE_MAX_FILL, capM: TOWNHOUSE_BODY_CAP_M },
  multiplex: { perTileM: DEFAULT_BODY_M_PER_TILE, capM: 24 },
  restaurant: { perTileM: DEFAULT_BODY_M_PER_TILE, capM: 24 },
  fuel: { fill: 0.35, capM: 16 },
  flex: { fill: 0.55 },
  chemical: { fill: 0.5 },
};

function bodyAxisMetres(tiles: number, rule: BodyRule): number {
  const lotM = tiles * TILE_METERS;
  const sized =
    rule.perTileM !== undefined ? rule.perTileM * tiles : (rule.fill ?? MAX_FOOTPRINT_FILL) * lotM;
  const wanted = Math.max(sized, rule.minM ?? 0);
  return Math.min(wanted, rule.capM ?? Infinity, (rule.maxFill ?? MAX_FOOTPRINT_FILL) * lotM);
}

/**
 * The body's size in metres on each lot axis, by the entry's kind, before any
 * turn. The single source of truth shared by the body instancer, the massing
 * tiers, the lot plans, the pitched-roof kit and the floor area. Pure.
 */
export function bodyMetresFor(entry: BuildingCatalogEntry): { w: number; d: number } {
  const rule = (entry.kind && BODY_RULES[entry.kind]) || DEFAULT_BODY_RULE;
  // A larger lot for the same building keeps the body, and so the floor, it was sized on.
  const sizedOn = entry.bodyFootprint ?? entry.footprint;
  return {
    w: bodyAxisMetres(sizedOn.w, rule),
    d: bodyAxisMetres(sizedOn.d, rule),
  };
}

/** The body's plate: what one storey of it covers, in m². */
export function bodyPlateM2(entry: BuildingCatalogEntry): number {
  const body = bodyMetresFor(entry);
  return body.w * body.d;
}

/**
 * How many floors of the plate a building has. A commercial or office-like
 * building counts one per 3.2 m storey; a works is one high-bay floor however
 * tall its clear height, except flex space, which is offices over the bays.
 */
export function storeysOf(entry: BuildingCatalogEntry): number {
  if (entry.category === 'ind' && entry.kind !== 'flex') return 1;
  return Math.max(1, Math.round(entry.height / FLOOR_HEIGHT_METERS));
}

/** Gross floor area in m²: the plate times its storeys. */
export function grossFloorM2(entry: BuildingCatalogEntry): number {
  return bodyPlateM2(entry) * storeysOf(entry);
}

/** Gross floor area in square feet, as the codes state their ratios. */
export function grossFloorSqFt(entry: BuildingCatalogEntry): number {
  return grossFloorM2(entry) * SQ_FT_PER_M2;
}
