/**
 * What the player is told when a building cannot be placed. One table, read by
 * the worker's placement command and by the ghost, so the cursor and the
 * refusal say the same sentence. 'funds' and 'locked' stay the codes they are.
 */
export const PLACEMENT_REFUSALS = {
  offMap: 'It would stand off the map.',
  water: 'Part of it would stand in water.',
  steep: 'The ground is too steep here.',
  occupied: 'Something already stands here.',
  needsStreet: 'It needs a street beside it.',
  frontsAway: 'Its front must face a street.',
  needsRail: 'It must stand beside a railway.',
  needsTram: 'It must stand beside a tram track.',
  needsShore: 'It must stand on a shore.',
  crowded: 'It stands too close to another of its kind.',
  blocked: 'It cannot be placed there.',
} as const;

/**
 * What the player is told when a power line cannot be strung. One table, read
 * by the worker's command and by the cursor, so both say the same sentence.
 */
export const POWER_LINE_REFUSALS = {
  alongStreet: 'The street already carries power.',
  mustStartAtSource: 'A line must start at a power station, a substation or a live line.',
  cableMustStartAtSource:
    'A cable must start at a power station, a substation or a live line or cable.',
} as const;

/** The refusal for each thing a kind can need beside it besides a street. */
export const PLACEMENT_NEEDS = {
  rail: 'needsRail',
  tram: 'needsTram',
  water: 'needsShore',
} as const;
