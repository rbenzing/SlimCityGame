/**
 * The garage a dense building parks in, laid on its own lot: where the body
 * stands, where the deck stands behind it, the stall rows of one tier, how many
 * tiers the building's requirement asks for and how many spaces they hold. One
 * layout for the deck the renderer draws, the cars in it, the body's seat and
 * the tests. Coordinates are lot metres: `u` along the street, `v` from the
 * street line into the lot. Pure.
 */
import { TILE_METERS } from './constants';
import { bodyMetresFor, grossFloorM2, SQ_FT_PER_M2, storeysOf } from './floorarea';
import type { LotRect } from './lotlayout';
import { AISLE_WIDTH_M, FOOT_M, STALL_LENGTH_M, STALL_WIDTH_M, stallsInRow } from './parkingcode';
import type { BuildingCatalogEntry } from './types';

/** A tier's floor-to-floor height, 11 ft: what a parking structure is built to. */
export const GARAGE_TIER_M = 3.35;
/** The slab under a tier's floor. */
export const GARAGE_SLAB_M = 0.3;
/** How far the ground tier's floor stands above the ground. */
export const GARAGE_GROUND_M = 0.15;
/** The vehicle barrier along an open tier's edge, 33 in. */
export const GARAGE_SPANDREL_M = 0.84;
/** The thickness of a spandrel and of the wall round a tier. */
export const GARAGE_WALL_M = 0.25;
/** The most tiers a deck is built to; a requirement beyond them is the kerb's. */
export const GARAGE_MAX_TIERS = 6;
/** An express ramp's grade between tiers, the most a ramp is cut to. */
export const GARAGE_RAMP_GRADE = 0.15;
/** A ramp's one lane, 12 ft. */
export const GARAGE_RAMP_LANE_M = 12 * FOOT_M;
/** Clear height over an entry's lane. */
export const GARAGE_ENTRY_CLEAR_M = 2.13;
/** A structural bay along a row: 36 ft, four stalls. */
export const GARAGE_BAY_STALLS = 4;
/** The stair tower's side: two stalls wide and a stall deep. */
export const GARAGE_STAIR_M = 2 * STALL_WIDTH_M;
/** How far a podium stands proud of the body on each side of it. */
export const PODIUM_OVERHANG_M = 0.05;
/** The side margin the drive keeps clear of the body. */
const DRIVE_BODY_GAP_M = 0.4;
/** The least aisle a deck keeps between its rows, a one-way 90° aisle of 17.7 ft: a dial. */
export const GARAGE_MIN_AISLE_M = 5.4;
/**
 * How far each kind's street-face parts stand proud of its body: an office's
 * lobby portal, a hotel's porte-cochère, a mid-rise's and a tower's balconies.
 * The body stands this far behind the street line so every part stays on its
 * lot; the kit's own constants hold these figures to the same numbers.
 */
export const GARAGE_FRONT_PROJECTION_M: Readonly<Record<string, number>> = {
  office: 1.5,
  hotel: 6,
  mixed: 0,
  midrise: 1.8,
  tower: 1.8,
};

/** Spaces a downtown building holds on site: office per 1,000 sq ft of floor. */
export const GARAGE_OFFICE_PER_1000_SQ_FT = 1;
/** Spaces a downtown home holds on site. */
export const GARAGE_SPACES_PER_HOME = 0.71;
/** Spaces a downtown hotel room holds on site. */
export const GARAGE_SPACES_PER_ROOM = 0.5;
/** A hotel room's floor, a dial until the catalog counts rooms. */
export const HOTEL_ROOM_M2 = 45;

export type GarageNose = 'v+' | 'v-';

/** One row of stalls along `u`, nose to the wall or to the aisle's far side. */
export interface GarageRow {
  rect: LotRect;
  nose: GarageNose;
  /** What the run holds, by the shared row count. */
  count: number;
  /** Stalls of the run the stair tower stands on. */
  skipped: number;
}

export interface GarageStall {
  u: number;
  v: number;
  nose: GarageNose;
}

export interface Garage {
  /** The lot, in metres. */
  lotW: number;
  lotD: number;
  body: LotRect;
  deck: LotRect;
  /** The body stands on a podium that overhangs it. */
  podium: boolean;
  rows: GarageRow[];
  aisle: { v0: number; v1: number };
  /** The drive down the lot's high-`u` side, from the street to the deck's entry. */
  drive: LotRect;
  stair: LotRect;
  /** The ramp's zone along the aisle: its run and its lane. */
  ramp: LotRect;
  /** One tier's stalls. */
  stalls: GarageStall[];
  stallsPerTier: number;
  required: number;
  tiers: number;
  provided: number;
  shortfall: number;
}

/** Whether a kind parks in a garage: a tower always, the other dense kinds from level 2. */
export function parksInGarage(entry: BuildingCatalogEntry): boolean {
  switch (entry.kind) {
    case 'tower':
      return true;
    case 'office':
    case 'hotel':
    case 'mixed':
    case 'midrise':
      return (entry.level ?? 1) >= 2;
    default:
      return false;
  }
}

/** Whether the body stands on a podium: a mid-rise and a tower do. */
export function hasPodium(entry: BuildingCatalogEntry): boolean {
  return entry.kind === 'tower' || entry.kind === 'midrise';
}

/**
 * Spaces the kind holds on site at levels 2 and 3 and for a tower: an office
 * its floor at the office rate, apartments their homes, a hotel its rooms, a
 * mixed-use block its homes and its shop floor, the ground storey's plate.
 */
export function garageRequirement(entry: BuildingCatalogEntry): number {
  const floorM2 = grossFloorM2(entry);
  const homes = (entry.units ?? 0) * GARAGE_SPACES_PER_HOME;
  let spaces: number;
  switch (entry.kind) {
    case 'office':
      spaces = (floorM2 * SQ_FT_PER_M2 * GARAGE_OFFICE_PER_1000_SQ_FT) / 1000;
      break;
    case 'hotel':
      spaces = (floorM2 / HOTEL_ROOM_M2) * GARAGE_SPACES_PER_ROOM;
      break;
    case 'mixed': {
      const shopM2 = floorM2 / storeysOf(entry);
      spaces = homes + (shopM2 * SQ_FT_PER_M2 * GARAGE_OFFICE_PER_1000_SQ_FT) / 1000;
      break;
    }
    default:
      spaces = homes;
  }
  return Math.max(0, Math.ceil(spaces - 1e-9));
}

/** The tiers a requirement asks for at `perTier` stalls a tier, at least one and at most the kit's six. */
export function garageTiers(required: number, perTier: number): number {
  if (perTier <= 0) return 0;
  return Math.min(GARAGE_MAX_TIERS, Math.max(1, Math.ceil(required / perTier - 1e-9)));
}

const cache = new WeakMap<BuildingCatalogEntry, Garage | null>();

/**
 * The garage of a dense building on its square lot, or null for a kind that
 * parks otherwise or a lot with no room behind the body. The body slides to
 * the street line, so the rear margin of the lot is the deck: one single-loaded
 * row where it is 42 ft, one double-loaded module from 60 ft.
 */
export function garageFor(entry: BuildingCatalogEntry): Garage | null {
  if (!parksInGarage(entry)) return null;
  const cached = cache.get(entry);
  if (cached !== undefined) return cached;
  const garage = layGarage(entry);
  cache.set(entry, garage);
  return garage;
}

function layGarage(entry: BuildingCatalogEntry): Garage | null {
  const { w: tilesW, d: tilesD } = entry.footprint;
  if (tilesW !== tilesD) return null;
  const lotW = tilesW * TILE_METERS;
  const lotD = tilesD * TILE_METERS;
  const bodyM = bodyMetresFor(entry);
  const podium = hasPodium(entry);
  const bodyV0 = GARAGE_FRONT_PROJECTION_M[entry.kind ?? ''] ?? 0;
  const body: LotRect = {
    u0: (lotW - bodyM.w) / 2,
    u1: (lotW + bodyM.w) / 2,
    v0: bodyV0,
    v1: bodyV0 + bodyM.d,
  };
  const deckV0 = body.v1 + (podium ? PODIUM_OVERHANG_M : 0);
  const deck: LotRect = { u0: 0, u1: lotW, v0: deckV0, v1: lotD };
  const margin = lotD - deckV0;

  const double = margin >= 2 * STALL_LENGTH_M + GARAGE_MIN_AISLE_M - 1e-6;
  if (!double && margin < STALL_LENGTH_M + GARAGE_MIN_AISLE_M - 1e-6) return null;
  const aisleM = Math.min(
    AISLE_WIDTH_M,
    double ? margin - 2 * STALL_LENGTH_M : margin - STALL_LENGTH_M,
  );

  const driveW = Math.min(AISLE_WIDTH_M, (lotW - bodyM.w) / 2 - DRIVE_BODY_GAP_M);
  const drive: LotRect = { u0: lotW - driveW, u1: lotW, v0: 0, v1: deckV0 };
  const rowRects: { rect: LotRect; nose: GarageNose }[] = [];
  let aisle: { v0: number; v1: number };
  if (double) {
    const frontRow: LotRect = { u0: 0, u1: lotW - driveW, v0: deckV0, v1: deckV0 + STALL_LENGTH_M };
    aisle = { v0: frontRow.v1, v1: frontRow.v1 + aisleM };
    const rearRow: LotRect = { u0: 0, u1: lotW, v0: aisle.v1, v1: aisle.v1 + STALL_LENGTH_M };
    rowRects.push({ rect: frontRow, nose: 'v-' }, { rect: rearRow, nose: 'v+' });
  } else {
    aisle = { v0: deckV0, v1: deckV0 + aisleM };
    rowRects.push({
      rect: { u0: 0, u1: lotW, v0: aisle.v1, v1: aisle.v1 + STALL_LENGTH_M },
      nose: 'v+',
    });
  }

  // The stair tower stands in the deck's front corner on the far side from the drive:
  // on a stall row's end on a double module, in the aisle's end on a single row.
  const stair: LotRect = {
    u0: 0,
    u1: GARAGE_STAIR_M,
    v0: deckV0,
    v1: double ? deckV0 + STALL_LENGTH_M : aisle.v1,
  };

  const rows: GarageRow[] = [];
  const stalls: GarageStall[] = [];
  for (const { rect, nose } of rowRects) {
    const run = rect.u1 - rect.u0 - 2 * GARAGE_WALL_M;
    const count = stallsInRow(run);
    let skipped = 0;
    for (let i = 0; i < count; i++) {
      const u0 = rect.u0 + GARAGE_WALL_M + i * STALL_WIDTH_M;
      const onStair = rect.v0 < stair.v1 && rect.v1 > stair.v0 && u0 < stair.u1 - 1e-6;
      if (onStair) {
        skipped += 1;
        continue;
      }
      stalls.push({ u: u0 + STALL_WIDTH_M / 2, v: (rect.v0 + rect.v1) / 2, nose });
    }
    rows.push({ rect, nose, count, skipped });
  }

  const rampRun = GARAGE_TIER_M / GARAGE_RAMP_GRADE;
  const aisleMid = (aisle.v0 + aisle.v1) / 2;
  const ramp: LotRect = {
    u0: stair.u1 + 1,
    u1: stair.u1 + 1 + rampRun,
    v0: aisleMid - GARAGE_RAMP_LANE_M / 2,
    v1: aisleMid + GARAGE_RAMP_LANE_M / 2,
  };

  const required = garageRequirement(entry);
  const tiers = garageTiers(required, stalls.length);
  const provided = tiers * stalls.length;
  return {
    lotW,
    lotD,
    body,
    deck,
    podium,
    rows,
    aisle,
    drive,
    stair,
    ramp,
    stalls,
    stallsPerTier: stalls.length,
    required,
    tiers,
    provided,
    shortfall: Math.max(0, required - provided),
  };
}

/**
 * How open a tier is to the weather: the share of its perimeter that is open
 * (not the body's wall or the stair tower's), and the share of its wall area
 * that is opening, the band between the spandrel and the slab above.
 */
export function garageOpenness(garage: Garage): { perimeter: number; wall: number } {
  const { deck, body, stair } = garage;
  const depth = deck.v1 - deck.v0;
  const total = 2 * (garage.lotW + depth);
  const closed = Math.min(body.u1, garage.lotW) - body.u0 + (stair.u1 - stair.u0) * 2;
  const open = Math.max(0, total - closed);
  const bandM = GARAGE_TIER_M - GARAGE_SLAB_M - GARAGE_SPANDREL_M;
  return { perimeter: open / total, wall: (open * bandM) / (total * GARAGE_TIER_M) };
}
