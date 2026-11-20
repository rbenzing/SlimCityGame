/** Where a building is drawn higher than its catalog `height`: a stack, mast or turbine blade
 * stands above the box, so a view framed on the catalog height cuts it. Metres above the ground,
 * read off the frames; a subject's own `top` overrides one. */
export const DRAWN_TOPS = {
  'heavy-chem-1': 33,
  'heavy-chem-2': 36,
  'heavy-chem-3': 38,
  'heavy-metals-1': 36,
  'heavy-metals-2': 43,
  'heavy-metals-3': 48,
  'coal-plant': 90,
  'combined-cycle': 42,
  'gas-turbine': 32,
  'wind-turbine': 105,
  incinerator: 70,
};
