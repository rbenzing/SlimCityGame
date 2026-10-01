/**
 * A motorway noise wall: the heights it is built to, the noise it cuts, and
 * what it costs. Pure figures, each from a published source; where a wall
 * stands on the grid is `soundwallsites.ts`.
 */
import roadsData from '../data/roads.json';
import type { RoadSpec } from './types';
import { RoadTier } from './types';

/**
 * The heights the road tool offers. The US average is 14 ft (4.3 m), states
 * running 7–18 ft (FHWA noise barrier inventory); WSDOT builds 6–20 ft,
 * normally 12–15 ft. Six metres is 20 ft, the top of what a state builds as
 * routine, inside FHWA's "usually limited to eight meters".
 */
export const SOUND_WALL_HEIGHTS_M = [3, 4.5, 6] as const;

/** The height a wall is laid at until the player picks another: the middle, near the US average. */
export const DEFAULT_SOUND_WALL_HEIGHT_M = 4.5;

/**
 * The concrete safety barrier the wall stands on. A wall inside a motorway's
 * clear zone stands behind or on one (FHWA Noise Barrier Design Handbook §9),
 * and it is the width of the barrier piece the road model already has.
 */
export const SOUND_WALL_BASE_WIDTH_M = 0.6;

/** The barrier's own height: the 32-inch safety shape. */
export const SOUND_WALL_BASE_HEIGHT_M = 0.81;

/** A precast panel: about 125 mm, a cast wall 150–200 mm (Handbook §5.1.1). */
export const SOUND_WALL_PANEL_THICKNESS_M = 0.15;

/** Posts between panels, which ship about 4.5 m long (Handbook §5.1.1); four to a tile. */
export const SOUND_WALL_POST_SPACING_M = 5;

/**
 * Where a wall just breaks the line of sight: from a heavy truck's exhaust
 * stack, 3.66 m up (FHWA TNM), to a ground-floor window 1.5 m up, across a
 * wall at the shoulder, the line crosses the wall at about 3.1 m.
 */
export const LINE_OF_SIGHT_HEIGHT_M = 3;

/** A wall's insertion loss when it just breaks the line of sight (Handbook §3.5.1). */
export const LOSS_AT_LINE_OF_SIGHT_DB = 5;

/** What each metre above that adds (Handbook §3.5.1). */
export const LOSS_PER_METRE_DB = 1.5;

/** The noise a wall of `heightM` cuts, in dB: 5 at 3 m, 7.25 at 4.5 m, 9.5 at 6 m. */
export function insertionLossDb(heightM: number): number {
  return (
    LOSS_AT_LINE_OF_SIGHT_DB + LOSS_PER_METRE_DB * Math.max(0, heightM - LINE_OF_SIGHT_HEIGHT_M)
  );
}

/** Fixed-point one: an edge nothing stands on passes everything. */
export const OPEN_EDGE = 256;

/**
 * How much noise each tile edge lets through, out of `OPEN_EDGE`: the edge
 * between a tile and its east neighbour, and its south one. Derived from the
 * roads' walls, never saved.
 */
export interface NoiseWalls {
  east: Uint16Array;
  south: Uint16Array;
}

/**
 * The share of noise a wall lets across, out of `OPEN_EDGE`. The noise field
 * adds up like sound energy, since a road's emission is proportional to its
 * traffic, so a cut of L dB passes 10^(−L/10) of it: 81, 48 and 29 for the
 * three heights.
 */
export function noiseTransmission(heightM: number): number {
  return Math.round(OPEN_EDGE * 10 ** (-insertionLossDb(heightM) / 10));
}

/** $48.76 a square foot, the 2020–22 national average (FHWA noise barrier inventory). */
export const WALL_USD_PER_M2 = 48.76 / 0.09290304;

/** A rural freeway on new alignment, flat ground, 2014 dollars (FHWA C&P Exhibit A-1). */
export const MOTORWAY_USD_PER_LANE_MILE = 3_551_000;

const METRES_PER_MILE = 1609.344;

function catalogueMotorway(): RoadSpec {
  const spec = (roadsData as { specs: RoadSpec[] }).specs.find((s) => s.tier === RoadTier.Highway);
  if (!spec?.profile) throw new Error('soundwall: no motorway in the road catalogue');
  return spec;
}

const MOTORWAY_PRICE = catalogueMotorway();

/** The lanes the catalogue's motorway is built with, which its price is for. */
const MOTORWAY_LANES = MOTORWAY_PRICE.profile!.pieces.filter((p) => p.kind === 'travel').length;

/**
 * What one side of wall adds to a tile of road, to build and to keep: the
 * motorway's own price per tile, scaled by a wall's cost per metre against
 * the motorway's. The two dollar figures are of different years (2014 and
 * 2020–22), which makes a wall a little dear rather than cheap.
 */
export function soundWallPrice(heightM: number): { cost: number; upkeep: number } {
  const motorwayPerMetre = (MOTORWAY_LANES * MOTORWAY_USD_PER_LANE_MILE) / METRES_PER_MILE;
  const share = (WALL_USD_PER_M2 * heightM) / motorwayPerMetre;
  const cost = MOTORWAY_PRICE.costPerTile * share;
  return {
    cost,
    upkeep: cost * (MOTORWAY_PRICE.upkeepPerTile / MOTORWAY_PRICE.costPerTile),
  };
}
