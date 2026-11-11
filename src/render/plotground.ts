/**
 * The thin band of height over the terrain that every surface a lot lays lives
 * in. A pad, plinth, yard, lawn, court or pond has its top inside it, so a
 * drive, a walk and a civic crossing meet a plot without a step.
 */

/** The lowest top a lot's ground has: the zoned lots' pads, and a building's plinth. */
export const LOT_Y_OFFSET = 0.08;
/** The highest top a lot's ground has (the lane paint), and the ceiling for anything a kit lays flat. */
export const PLOT_BAND_TOP = 0.12;
/** The top of the instancer's pad under a plinth-designated body: the bottom of the band. */
export const PLINTH_TOP = LOT_Y_OFFSET;
/** The top of a kit's paved yard, lawn or plate: above the plinth so the two never z-fight, with room under the band's top for a thin surface laid on it. */
export const PLOT_YARD_TOP = 0.09;
/** The thickest surface (asphalt, a patch) a kit lays flat on its yard; yard top plus this stays in the band. */
export const PLOT_SURFACE_M = PLOT_BAND_TOP - PLOT_YARD_TOP;
