import { describe, expect, it } from 'vitest';
import { allCardsFor, CATEGORY_DEFS, catalogEntryForTool, subTabsFor } from './categories';
import { LANDFILL_PAINT_COST_PER_TILE } from '../shared/constants';

describe('CATEGORY_DEFS', () => {
  it('lists the ten UI-SPEC §2 categories plus §6.11 Landscaping and the §11/§13 Transit + Districts categories, in order', () => {
    expect(CATEGORY_DEFS.map((c) => c.label)).toEqual([
      'Zoning',
      'Roads',
      'Electricity',
      'Water',
      'Health',
      'Fire',
      'Police',
      'Education',
      'Parks',
      'Transit',
      'Districts',
      'Bulldoze',
      'Landscaping',
    ]);
  });

  it('gives Landscaping the shovel icon (UI-SPEC §6.11)', () => {
    expect(CATEGORY_DEFS.find((c) => c.id === 'landscaping')?.icon).toBe('landscaping');
  });
});

describe('subTabsFor', () => {
  // Residential runs Low / Medium Row / Medium / High in city-size
  // progression order, and Mixed gets its own sub-tab. ResHigh's
  // unlockMilestone is 4 (large towers arrive at Small City, not Busy
  // Township) — covered in its own describe block below.
  it('splits Zoning into residential/commercial/industrial/mixed/de-zone, all non-empty', () => {
    const tabs = subTabsFor('zoning');
    expect(tabs.map((t) => t.label)).toEqual([
      'Residential',
      'Commercial',
      'Industrial',
      'Mixed-Use',
      'De-zone',
    ]);
    expect(tabs.every((t) => t.cards.length > 0)).toBe(true);
    expect(tabs.find((t) => t.id === 'residential')?.cards.map((c) => c.id)).toEqual([
      'zone.resLow',
      'zone.resMediumRow',
      'zone.resMedium',
      'zone.resHigh',
    ]);
    expect(tabs.find((t) => t.id === 'mixed')?.cards.map((c) => c.id)).toEqual(['zone.mixed']);
    expect(tabs.find((t) => t.id === 'dezone')?.cards.map((c) => c.id)).toEqual(['zone.dezone']);
  });

  it('§6.21: gives every new/retuned zone card its correct unlockMilestone', () => {
    const cards = allCardsFor('zoning');
    const byId = (id: string) => cards.find((c) => c.id === id);
    expect(byId('zone.resLow')?.unlockMilestone).toBe(0);
    expect(byId('zone.resMediumRow')?.unlockMilestone).toBe(1);
    expect(byId('zone.resMedium')?.unlockMilestone).toBe(2);
    expect(byId('zone.mixed')?.unlockMilestone).toBe(3);
    // High-density housing/business arrive at Small City (M4), not day one.
    expect(byId('zone.resHigh')?.unlockMilestone).toBe(4);
    expect(byId('zone.comHigh')?.unlockMilestone).toBe(4);
    expect(byId('zone.comLow')?.unlockMilestone).toBe(0);
    expect(byId('zone.industrial')?.unlockMilestone).toBe(0);
  });

  it('drops the empty Maintenance sub-tab for Roads, keeping only Small/Large', () => {
    // The four extra roads join the two tabs in cost order —
    // gravel/alley/one-way with the two-lane under Small,
    // four-lane with avenue/highway under Large.
    const tabs = subTabsFor('roads');
    expect(tabs.map((t) => t.label)).toEqual(['Small Roads', 'Large Roads']);
    expect(tabs.find((t) => t.id === 'small')?.cards.map((c) => c.id)).toEqual([
      'road.gravel',
      'road.alley',
      'road.two',
      'road.oneway',
    ]);
    expect(tabs.find((t) => t.id === 'large')?.cards.map((c) => c.id)).toEqual([
      'road.four',
      'road.avenue',
      'road.highway',
    ]);
  });

  it('the §6.7 Roads v3 cards carry their roads.json costs and unlock milestones', () => {
    const cards = subTabsFor('roads').flatMap((t) => t.cards);
    expect(cards.find((c) => c.id === 'road.gravel')).toEqual({
      id: 'road.gravel',
      name: 'Gravel Road',
      cost: 8,
      unlockMilestone: 0,
    });
    expect(cards.find((c) => c.id === 'road.alley')).toEqual({
      id: 'road.alley',
      name: 'Alley',
      cost: 14,
      unlockMilestone: 1,
    });
    expect(cards.find((c) => c.id === 'road.oneway')).toEqual({
      id: 'road.oneway',
      name: 'One-Way Road',
      cost: 24,
      unlockMilestone: 1,
    });
    expect(cards.find((c) => c.id === 'road.four')).toEqual({
      id: 'road.four',
      name: 'Four-Lane Road',
      cost: 32,
      unlockMilestone: 1,
    });
  });

  it('returns a single group for categories with no natural sub-split (no sub-tab row should render)', () => {
    expect(subTabsFor('electricity')).toHaveLength(1);
    expect(
      subTabsFor('electricity')[0]
        ?.cards.map((c) => c.id)
        .sort(),
    ).toEqual(['plop.coal-plant', 'plop.wind-turbine'].sort());
    expect(subTabsFor('water')).toHaveLength(1);
    expect(subTabsFor('water')[0]?.cards.map((c) => c.id)).toEqual(['plop.water-tower']);
    expect(subTabsFor('bulldoze')).toHaveLength(1);
    expect(subTabsFor('bulldoze')[0]?.cards.map((c) => c.id)).toEqual(['bulldoze']);
  });

  it('maps each service category to only its own catalog entries', () => {
    expect(subTabsFor('health')[0]?.cards.map((c) => c.id)).toEqual(['plop.clinic']);
    expect(subTabsFor('fire')[0]?.cards.map((c) => c.id)).toEqual(['plop.fire-station']);
    expect(subTabsFor('police')[0]?.cards.map((c) => c.id)).toEqual(['plop.police-station']);
    expect(subTabsFor('education')[0]?.cards.map((c) => c.id)).toEqual(['plop.school']);
    // The airport landmark is a park-category ploppable, so it joins
    // the Parks drawer alongside the pocket park (catalog order).
    expect(subTabsFor('parks')[0]?.cards.map((c) => c.id)).toEqual([
      'plop.small-park',
      'plop.airport',
    ]);
  });

  it('every card carries a real cost + unlockMilestone sourced from the data files', () => {
    const avenue = subTabsFor('roads')
      .flatMap((t) => t.cards)
      .find((c) => c.id === 'road.avenue');
    expect(avenue).toEqual({ id: 'road.avenue', name: 'Avenue', cost: 45, unlockMilestone: 1 });
  });

  it('the §6.10 airport card carries the landmark price and stays milestone-5 locked', () => {
    const airport = subTabsFor('parks')
      .flatMap((t) => t.cards)
      .find((c) => c.id === 'plop.airport');
    expect(airport).toEqual({
      id: 'plop.airport',
      name: 'International Airport',
      cost: 60000,
      unlockMilestone: 5,
    });
  });

  it('Landscaping (UI-SPEC §6.11) is a single flat group of the four terraform tools + the landfill brush', () => {
    const tabs = subTabsFor('landscaping');
    expect(tabs).toHaveLength(1);
    expect(tabs[0]?.cards).toEqual([
      { id: 'terraform.raise', name: 'Raise', cost: 0, unlockMilestone: 0 },
      { id: 'terraform.lower', name: 'Lower', cost: 0, unlockMilestone: 0 },
      { id: 'terraform.level', name: 'Level', cost: 0, unlockMilestone: 0 },
      { id: 'terraform.smooth', name: 'Smooth', cost: 0, unlockMilestone: 0 },
      // §21 garbage: the landfill-area brush lives in Landscaping for now.
      { id: 'landfill.paint', name: 'Landfill', cost: LANDFILL_PAINT_COST_PER_TILE, unlockMilestone: 1 },
    ]);
  });
});

describe('catalogEntryForTool', () => {
  it('resolves a plop.* tool id back to its catalog entry', () => {
    expect(catalogEntryForTool('plop.water-tower')?.name).toBe('Water Tower');
  });

  it('returns undefined for non-catalog tools', () => {
    expect(catalogEntryForTool('bulldoze')).toBeUndefined();
    expect(catalogEntryForTool('zone.resLow')).toBeUndefined();
    expect(catalogEntryForTool('road.two')).toBeUndefined();
  });
});
