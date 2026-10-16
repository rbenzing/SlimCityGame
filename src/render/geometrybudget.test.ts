import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import catalogData from '../data/catalog.json';
import { BuildingInstancer } from './buildings';
import { BuildingKitRenderer } from './buildingkit';
import { HouseRoofRenderer, buildPoolGeometry, buildTrampolineGeometry } from './houses';
import {
  buildBroadleafGeometry,
  buildPineGeometry,
  buildPoplarGeometry,
  buildShrubGeometry,
} from './trees';
import { MassingRenderer } from './massing';
import { RoofPropRenderer } from './props';
import { FarmRenderer } from './farms';
import { LotRenderer } from './lots';
import { UTILITY_KIT_CATALOG_IDS, UtilityKitRenderer, cemeteryPlots } from './utilitykits';
import { isHouseEntry, isWalkUpEntry } from './archetypes';
import { streetLookupOf } from './frontage';
import {
  BuildingState,
  RoadTier,
  type BuildingCatalogEntry,
  type BuildingDelta,
  type BuildingInstance,
  ZoneType,
} from '../shared/types';

const CATALOG = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;

/** Triangles over everything a building stands with: body, roof, parts, paving, yard, cars, interments. */
const KIT_TIER = 30000;
const BLOCK_TIER = 1500;
const HOUSE_TIER = 3000;
/** A mid-rise or a tower: a balcony at every floor is the type's read, and the two are the rarest kinds. */
const TALL_TIER = 4000;
/** A farm counts everything on its lot: an orchard of about 370 trees at 92 triangles each is the heaviest. */
const FARM_TIER = 40000;
/** The triangles a commercial block's own parts add: awnings, canopy, pylon, units, lane furniture. */
const COMMERCIAL_KIT_CEILING = 500;
const NORMAL_LOT_HOME_CEILING = 1300;
const ACRE_HOME_CEILING = 1800;
const SOLAR_FARM_CEILING = 2000;
/** A city builds bus stops by the dozen, so the stop stays well under the kit tier. */
const BUS_STOP_CEILING = 500;

const ORIGIN = { x: 10, z: 10 };
const HOME_IDS = 16;
const flat = (): number => 0;

/** The triangles a scene draws: indexed, one per instance, nothing hidden. */
function drawnTriangles(scene: THREE.Scene): number {
  let total = 0;
  scene.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.visible) return;
    const geometry = object.geometry as THREE.BufferGeometry;
    const vertices = geometry.index?.count ?? geometry.getAttribute('position').count;
    const copies = object instanceof THREE.InstancedMesh ? object.count : 1;
    total += (vertices / 3) * copies;
  });
  return total;
}

function instanceOf(entry: BuildingCatalogEntry, id: number): BuildingInstance {
  return {
    id,
    catalogId: entry.id,
    x: ORIGIN.x,
    z: ORIGIN.z,
    rotation: 0,
    level: entry.level ?? 1,
    state: BuildingState.Active,
    problems: 0,
  };
}

/** A two-lane street along the south edge of the lot, so the building fronts something. */
function southStreet(entry: BuildingCatalogEntry): (x: number, z: number) => boolean {
  const row = ORIGIN.z + entry.footprint.d;
  return (x, z) => z === row && x >= ORIGIN.x - 6 && x < ORIGIN.x + entry.footprint.w + 6;
}

interface ZonedParts {
  body: number;
  tiers: number;
  props: number;
  kit: number;
  home: number;
  total: number;
}

/** Triangles one renderer draws for one building, in a scene of its own. */
function drawnBy(apply: (scene: THREE.Scene) => void): number {
  const scene = new THREE.Scene();
  apply(scene);
  return drawnTriangles(scene);
}

/** Everything a zoned building puts on the ground, by renderer: body, setback tiers, roof props, archetype parts, and the home's roof, yard and cars. */
function zonedParts(entry: BuildingCatalogEntry, id: number): ZonedParts {
  const roadAt = southStreet(entry);
  const street = streetLookupOf(
    (x, z) => (roadAt(x, z) ? RoadTier.TwoLane : RoadTier.None),
    () => null,
  );
  const delta: BuildingDelta = { added: [instanceOf(entry, id)], updated: [], removed: [] };
  const parts = {
    body: drawnBy((s) =>
      new BuildingInstancer(s, CATALOG, flat, undefined, roadAt, street).apply(delta),
    ),
    tiers: drawnBy((s) => new MassingRenderer(s, flat, CATALOG, roadAt, street).apply(delta)),
    props: drawnBy((s) => new RoofPropRenderer(s, flat, CATALOG, roadAt).apply(delta)),
    kit: drawnBy((s) => new BuildingKitRenderer(s, flat, CATALOG, roadAt).apply(delta)),
    home: drawnBy((s) => new HouseRoofRenderer(s, flat, CATALOG, roadAt, street).apply(delta)),
  };
  return { ...parts, total: Object.values(parts).reduce((a, b) => a + b, 0) };
}

/** A kit as it stands in the city: its plinth and every part, a cemetery with every plot taken. */
function kitTriangles(entry: BuildingCatalogEntry): number {
  const scene = new THREE.Scene();
  const delta: BuildingDelta = { added: [instanceOf(entry, 1)], updated: [], removed: [] };
  new BuildingInstancer(scene, CATALOG, flat, new Set(UTILITY_KIT_CATALOG_IDS)).apply(delta);
  const kits = new UtilityKitRenderer(scene, flat, CATALOG);
  kits.apply(delta);
  if (entry.deathCare?.plots !== undefined) {
    kits.setInterments([{ id: 1, used: cemeteryPlots(entry) }]);
  }
  return drawnTriangles(scene);
}

const zoned = CATALOG.filter((e) => (e.zone ?? 0) > 0 && e.zone !== ZoneType.Agriculture);

type ZonedTier = 'house' | 'block' | 'tall';
const ZONED_TIERS: Readonly<Record<ZonedTier, number>> = {
  house: HOUSE_TIER,
  block: BLOCK_TIER,
  tall: TALL_TIER,
};

/** The tier a zoned building is held to: the homes, the mid-rise and the tower, and every other block. */
function tierNameOf(entry: BuildingCatalogEntry): ZonedTier {
  if (isHouseEntry(entry)) return 'house';
  if (entry.kind === 'midrise' || entry.kind === 'tower') return 'tall';
  return 'block';
}
const farms = CATALOG.filter((e) => e.zone === ZoneType.Agriculture);
const kits = UTILITY_KIT_CATALOG_IDS.map((id) => CATALOG.find((e) => e.id === id)!);

interface FarmParts {
  body: number;
  land: number;
  kit: number;
  total: number;
}

/** Everything a farm stands with on its lot: the barn's body, its ground, and the farm kit with every tree, post and part. */
function farmParts(entry: BuildingCatalogEntry): FarmParts {
  // A dirt road along the lot's north edge is the gate every farm opens onto.
  const dirtAt = (_x: number, z: number): boolean => z === ORIGIN.z - 1;
  const delta: BuildingDelta = { added: [instanceOf(entry, 1)], updated: [], removed: [] };
  const parts = {
    body: drawnBy((s) =>
      new BuildingInstancer(s, CATALOG, flat, undefined, undefined, undefined, dirtAt).apply(delta),
    ),
    land: drawnBy((s) =>
      new LotRenderer(s, flat, CATALOG, undefined, undefined, dirtAt).apply(delta),
    ),
    kit: drawnBy((s) => new FarmRenderer(s, flat, CATALOG, dirtAt).apply(delta)),
  };
  return { ...parts, total: Object.values(parts).reduce((a, b) => a + b, 0) };
}

/** The densest of a home's yards, which vary by id; every other building draws the same each time. */
const zonedCeiling = (entry: BuildingCatalogEntry): ZonedParts => {
  const ids = isHouseEntry(entry) ? HOME_IDS : 1;
  let densest = zonedParts(entry, 1);
  for (let id = 2; id <= ids; id++) {
    const next = zonedParts(entry, id);
    if (next.total > densest.total) densest = next;
  }
  return densest;
};

describe('geometry budget: triangles per building, every part', () => {
  const kitRows = kits.map((entry) => ({ entry, triangles: kitTriangles(entry) }));
  const zonedRows = zoned.map((entry) => {
    const parts = zonedCeiling(entry);
    return { entry, parts, triangles: parts.total };
  });
  const farmRows = farms.map((entry) => ({ entry, parts: farmParts(entry) }));

  it('reports every kit, zoned building and farm against its tier', () => {
    const table: Record<string, Record<string, number | string>> = {};
    for (const { entry, triangles } of kitRows) table[entry.id] = { tier: 'kit', total: triangles };
    for (const { entry, parts } of zonedRows) {
      table[entry.id] = { tier: tierNameOf(entry), ...parts };
    }
    for (const { entry, parts } of farmRows) table[entry.id] = { tier: 'farm', ...parts };
    // eslint-disable-next-line no-console
    console.table(table);
    expect(Object.keys(table).length).toBe(kits.length + zoned.length + farms.length);
  });

  it.each(farmRows.map((r) => [r.entry.id, r.parts.total] as const))(
    'farm %s stays within the farm tier',
    (_id, triangles) => {
      expect(triangles).toBeGreaterThan(0);
      expect(triangles).toBeLessThanOrEqual(FARM_TIER);
    },
  );

  it('stands an orchard in trees by the hundred and still inside its tier', () => {
    const orchard = farmRows.find((r) => r.entry.id === 'farm-orchard-3')!;
    expect(orchard.parts.kit).toBeGreaterThan(10000);
    expect(orchard.parts.total).toBeLessThanOrEqual(FARM_TIER);
  });

  it('names every kit in the registry', () => {
    expect(kits.every((e) => e !== undefined)).toBe(true);
  });

  it.each(kitRows.map((r) => [r.entry.id, r.triangles] as const))(
    'kit %s stays within its tier',
    (_id, triangles) => {
      expect(triangles).toBeGreaterThan(0);
      expect(triangles).toBeLessThanOrEqual(KIT_TIER);
    },
  );

  it.each(zonedRows.map((r) => [r.entry.id, r.triangles, tierNameOf(r.entry)] as const))(
    'zoned %s stays within its tier',
    (_id, triangles, tier) => {
      expect(triangles).toBeGreaterThan(0);
      expect(triangles).toBeLessThanOrEqual(ZONED_TIERS[tier]);
    },
  );

  it('holds the two walk-ups, car park and cars included, in the block tier', () => {
    const walkUps = zonedRows.filter((r) => isWalkUpEntry(r.entry));
    expect(walkUps).toHaveLength(6);
    for (const r of walkUps) expect(r.triangles, r.entry.id).toBeLessThanOrEqual(BLOCK_TIER);
  });

  it.each(
    zonedRows
      .filter((r) => /^res-normal-\d$/.test(r.entry.id))
      .map((r) => [r.entry.id, r.triangles] as const),
  )('detached home %s on a normal lot stays under its ceiling', (_id, triangles) => {
    expect(triangles).toBeLessThanOrEqual(NORMAL_LOT_HOME_CEILING);
  });

  it.each(
    zonedRows
      .filter((r) => /^res-acre-\d$/.test(r.entry.id))
      .map((r) => [r.entry.id, r.triangles] as const),
  )('detached home %s on an acre stays under its ceiling', (_id, triangles) => {
    expect(triangles).toBeLessThanOrEqual(ACRE_HOME_CEILING);
  });

  it.each(
    zonedRows
      .filter((r) => r.entry.category === 'com')
      .map((r) => [r.entry.id, r.parts.kit, r.triangles] as const),
  )('commercial %s stands its storefront parts in a few hundred triangles', (_id, kit, total) => {
    expect(kit).toBeGreaterThan(0);
    expect(kit).toBeLessThanOrEqual(COMMERCIAL_KIT_CEILING);
    expect(total).toBeLessThanOrEqual(BLOCK_TIER);
  });

  it('holds a solar farm to its ceiling', () => {
    const farm = kitRows.find((r) => r.entry.id === 'solar-farm')!;
    expect(farm.triangles).toBeLessThanOrEqual(SOLAR_FARM_CEILING);
  });

  it('holds a bus stop to its ceiling', () => {
    const stop = kitRows.find((r) => r.entry.id === 'bus-stop')!;
    expect(stop.triangles).toBeGreaterThan(0);
    expect(stop.triangles).toBeLessThanOrEqual(BUS_STOP_CEILING);
  });
});

describe('geometry budget: triangles per tree species and yard part', () => {
  const triangles = (geometry: THREE.BufferGeometry): number =>
    (geometry.index?.count ?? geometry.getAttribute('position').count) / 3;

  const species = [
    ['broadleaf', buildBroadleafGeometry, 100],
    ['pine', buildPineGeometry, 40],
    ['poplar', buildPoplarGeometry, 50],
    ['shrub', buildShrubGeometry, 30],
    ['pool', buildPoolGeometry, 60],
    ['trampoline', buildTrampolineGeometry, 110],
  ] as const;

  it.each(species)('%s stays within its ceiling', (_name, build, ceiling) => {
    const count = triangles(build());
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThanOrEqual(ceiling);
  });
});
