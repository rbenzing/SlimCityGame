import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import catalogData from '../data/catalog.json';
import {
  CIVIC_ACCESS_BY_ID,
  CIVIC_DRIVE_WIDTH_M,
  CIVIC_WALK_WIDTH_M,
  civicAccessFor,
  type CivicSpan,
  type CivicSpanKind,
} from '../shared/civicaccess';
import { TILE_METERS } from '../shared/constants';
import {
  BuildingState,
  RoadTier,
  type BuildingCatalogEntry,
  type BuildingInstance,
} from '../shared/types';
import {
  civicCrossingRects,
  civicCutTiles,
  civicEdgeSide,
  civicSiteFor,
  type KitSensors,
} from './civiccrossing';
import { sidewalkDepthMeters, type StreetLookup } from './frontage';
import { LotRenderer } from './lots';
import { lotPointToWorld } from './lotplan';
import { CURB_CUT_Y_OFFSET } from './parked';
import {
  AMBULANCE_CANOPY,
  CLINIC_LANE_M,
  UTILITY_KIT_CATALOG_IDS,
  computeBusBaseLayout,
  computeCemeteryLayout,
  computeClinicLayout,
  computeCoalPlantLayout,
  computeCombinedCycleLayout,
  computeCrematoriumLayout,
  computeEducationLayout,
  computeGasTurbineLayout,
  computeHospitalLayout,
  computeIncineratorLayout,
  computeNuclearLayout,
  computeRecyclingDepotLayout,
  computeSolarLayout,
  computeStationLayout,
  computeWorksLayout,
  computeYardLayout,
  yardFrame,
  RAIL_YARD_SPEC,
  YARD_CARS,
} from './utilitykits';

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const byId = (id: string): BuildingCatalogEntry => catalog.find((e) => e.id === id)!;
const CIVIC_IDS = [...UTILITY_KIT_CATALOG_IDS, 'airport'];

const flat = (): number => 0;
const VERGE_M = 2.5;
const SIDEWALK_M = 3;
const rowStreet =
  (row: number): StreetLookup =>
  (_x, z) =>
    z === row ? { vergeM: VERGE_M, sidewalkM: SIDEWALK_M } : null;
const columnStreet =
  (column: number): StreetLookup =>
  (x) =>
    x === column ? { vergeM: VERGE_M, sidewalkM: SIDEWALK_M } : null;
const NO_STREET: StreetLookup = () => null;
const noSensors: KitSensors = { waterAt: () => false, railAt: () => false };

const at = (over: Partial<BuildingInstance> = {}): BuildingInstance =>
  ({
    id: 1,
    catalogId: 'fire-station',
    x: 10,
    z: 10,
    rotation: 0,
    state: BuildingState.Active,
    problems: 0,
    ...over,
  }) as BuildingInstance;

/** The span of a kind on a kit, the `nth` of that kind. */
function span(id: string, kind: CivicSpanKind, nth = 0): CivicSpan {
  return civicAccessFor({ id })!.spans.filter((s) => s.kind === kind)[nth]!;
}

/** A kit's layout x, from the middle of its footprint, as its u from the low-X corner. */
const uOf = (id: string, x: number): number => x + (byId(id).footprint.w * TILE_METERS) / 2;

describe('the civic access table', () => {
  it('names an access for every civic catalog id and for nothing else', () => {
    for (const id of CIVIC_IDS) expect(CIVIC_ACCESS_BY_ID[id], id).toBeDefined();
    expect(Object.keys(CIVIC_ACCESS_BY_ID).sort()).toEqual([...CIVIC_IDS].sort());
    expect(civicAccessFor({ id: 'house' })).toBeNull();
  });

  it('keeps every span inside its kit’s edge, and leaves only the tram depot without one', () => {
    for (const id of CIVIC_IDS) {
      const { footprint } = byId(id);
      const access = CIVIC_ACCESS_BY_ID[id]!;
      // A station's frame takes its width from the track, so its spans hold to the narrower.
      const width =
        access.turn === 'station'
          ? Math.min(footprint.w, footprint.d)
          : access.turn === 'yard'
            ? Math.max(footprint.w, footprint.d)
            : footprint.w;
      const edgeM = width * TILE_METERS;
      for (const s of access.spans) {
        expect(s.u1, id).toBeGreaterThan(s.u0);
        if (access.centred) {
          expect(s.u0, id).toBeGreaterThanOrEqual(-edgeM / 2);
          expect(s.u1, id).toBeLessThanOrEqual(edgeM / 2);
        } else {
          expect(s.u0, id).toBeGreaterThanOrEqual(0);
          expect(s.u1, id).toBeLessThanOrEqual(edgeM);
        }
      }
    }
    expect(CIVIC_IDS.filter((id) => CIVIC_ACCESS_BY_ID[id]!.spans.length === 0)).toEqual([
      'tram-depot',
    ]);
  });
});

describe('the spans sit where the kits draw their own way in', () => {
  const near = (actual: number, expected: number): void => {
    expect(actual).toBeCloseTo(expected, 1);
  };

  it('puts a fire station’s apron across its bays and its walk at the door', () => {
    for (const id of ['fire-station', 'fire-station-district']) {
      const [walk, apron] = computeStationLayout(byId(id)).paving;
      near(span(id, 'apron').u0, uOf(id, apron!.x0));
      near(span(id, 'apron').u1, uOf(id, apron!.x1));
      near(span(id, 'walk').u0, uOf(id, walk!.x0));
      near(span(id, 'walk').u1, uOf(id, walk!.x1));
    }
  });

  it('puts a police station’s drive at its sally port and its walk at the entrance', () => {
    for (const id of ['police-station', 'police-station-district']) {
      const [walk, sally] = computeStationLayout(byId(id)).paving;
      near(span(id, 'walk').u0, uOf(id, walk!.x0));
      near(span(id, 'drive').u0, uOf(id, sally!.x0));
      near(span(id, 'drive').u1, uOf(id, sally!.x1));
    }
  });

  it('puts the gated plants’ drives in their gates', () => {
    const gates: [string, { x0: number; x1: number }][] = [
      ['coal-plant', computeCoalPlantLayout(byId('coal-plant').footprint).gate],
      ['incinerator', computeIncineratorLayout(byId('incinerator').footprint).gate],
      ['recycling-depot', computeRecyclingDepotLayout(byId('recycling-depot').footprint).gate],
      ['gas-turbine', computeGasTurbineLayout(byId('gas-turbine').footprint).gate],
      ['combined-cycle', computeCombinedCycleLayout(byId('combined-cycle').footprint).gate],
      ['nuclear-plant', computeNuclearLayout(byId('nuclear-plant').footprint).gate],
      ['solar-farm', computeSolarLayout(byId('solar-farm').footprint, 0).gate],
    ];
    for (const [id, gate] of gates) {
      near(span(id, 'drive').u0, uOf(id, gate.x0));
      near(span(id, 'drive').u1, uOf(id, gate.x1));
    }
  });

  it('puts a bus base’s drive on its gate and a rail yard’s on its drive', () => {
    for (const id of ['bus-depot', 'bus-garage']) {
      const { gate } = computeBusBaseLayout(byId(id).footprint);
      near(span(id, 'drive').u0, uOf(id, gate.x0));
      near(span(id, 'drive').u1, uOf(id, gate.x1));
    }
    const yard = byId('rail-yard');
    const frame = yardFrame(yard, 0, 0);
    const layout = computeYardLayout(
      frame.footprint,
      RAIL_YARD_SPEC,
      frame.fromEnd,
      YARD_CARS.rail,
    );
    const halfW = (frame.footprint.w * TILE_METERS) / 2;
    near(span('rail-yard', 'drive').u0, layout.drive!.x0 + halfW);
    near(span('rail-yard', 'drive').u1, layout.drive!.x1 + halfW);
  });

  it('puts a clinic’s two one-way drives on its loop’s legs', () => {
    const [left, , right] = computeClinicLayout(byId('clinic').footprint).lane;
    const drives = civicAccessFor({ id: 'clinic' })!.spans;
    near(drives[0]!.u0, uOf('clinic', left!.x0));
    near(drives[0]!.u1, uOf('clinic', left!.x1));
    near(drives[1]!.u0, uOf('clinic', right!.x0));
    near(drives[1]!.u1, uOf('clinic', right!.x1));
    near(left!.x1 - left!.x0, CLINIC_LANE_M);
  });

  it('puts a hospital’s apron under its ambulance canopy and its walk at the door', () => {
    const layout = computeHospitalLayout(byId('hospital').footprint);
    near(span('hospital', 'apron').u0, uOf('hospital', layout.ambulanceCanopy.x0));
    near(span('hospital', 'apron').u1 - span('hospital', 'apron').u0, AMBULANCE_CANOPY.w);
    const door = span('hospital', 'walk');
    near((door.u0 + door.u1) / 2, uOf('hospital', layout.entrance.x));
    // The drive is the deck's first aisle, between its first two rows of stalls.
    const aisleX0 = layout.deck.x0 + 5.486;
    near(span('hospital', 'drive').u0, uOf('hospital', aisleX0));
  });

  it('puts a cemetery’s drive on its gate, a crematorium’s on its forecourt and a works’ on its inlet', () => {
    const cemetery = computeCemeteryLayout(byId('cemetery').footprint, 0).gate;
    near(span('cemetery', 'drive').u0, uOf('cemetery', cemetery.x0));
    near(span('cemetery', 'drive').u1, uOf('cemetery', cemetery.x1));
    const forecourt = computeCrematoriumLayout(byId('crematorium').footprint).forecourt;
    near(span('crematorium', 'drive').u0, uOf('crematorium', forecourt.x0));
    near(span('crematorium', 'drive').u1, uOf('crematorium', forecourt.x1));
    const house = computeWorksLayout(byId('sewage-works').footprint).screenHouse;
    near(span('sewage-works', 'drive').u0, uOf('sewage-works', house.x0));
    near(span('sewage-works', 'drive').u1, uOf('sewage-works', house.x1));
  });

  it('puts a school’s walk at its door and its drive on the asphalt that reaches its front', () => {
    const school = byId('school');
    const layout = computeEducationLayout(school);
    const halfD = (school.footprint.d * TILE_METERS) / 2;
    const [path] = layout.concrete;
    const [asphalt] = layout.asphalt;
    near(span('school', 'walk').u0, uOf('school', path!.x0));
    near(span('school', 'drive').u0, uOf('school', asphalt!.x0));
    near(span('school', 'drive').u1, uOf('school', asphalt!.x1));
    expect(path!.z1).toBe(halfD);
    expect(asphalt!.z1).toBe(halfD);
    const library = byId('library');
    const reading = computeEducationLayout(library);
    near(span('library', 'walk').u0, uOf('library', reading.concrete[0]!.x0));
    near(span('library', 'drive').u0, uOf('library', reading.asphalt[0]!.x0));
    near(span('library', 'drive').u1, uOf('library', reading.asphalt[0]!.x1));
  });
});

describe('the crossing on the lot edge', () => {
  const fire = byId('fire-station');

  it('lays a fire apron across the verge and the footway at the width of its bays', () => {
    // A 2x2 at (10, 10) with its street along row 12, just south of it.
    const site = civicSiteFor(fire, at(), rowStreet(12), noSensors)!;
    expect(site.edge.side).toBe('S');
    const apron = site.crossings.find((c) => c.kind === 'apron')!;
    expect(apron.u0).toBeCloseTo(3, 6);
    expect(apron.u1 - apron.u0).toBeCloseTo(span('fire-station', 'apron').u1 - 3, 6);

    const rects = civicCrossingRects([apron], VERGE_M, SIDEWALK_M);
    const verge = rects.find((r) => r.layer === 'verge')!.rect;
    const footway = rects.find((r) => r.layer === 'footway')!.rect;
    // Verge from the footprint's edge, then the footway out to the kerb line.
    expect([verge.v0, verge.v1]).toEqual([-VERGE_M, 0]);
    expect([footway.v0, footway.v1]).toEqual([-VERGE_M - SIDEWALK_M, -VERGE_M]);
    const south = (10 + 2) * TILE_METERS;
    expect(lotPointToWorld(site.frame, apron.u0, 0).z).toBeCloseTo(south, 6);
    expect(lotPointToWorld(site.frame, apron.u0, footway.v0).z).toBeCloseTo(
      south + VERGE_M + SIDEWALK_M,
      6,
    );
    expect(lotPointToWorld(site.frame, apron.u0, 0).x).toBeCloseTo(10 * TILE_METERS + 3, 6);
  });

  it('cuts a drive 7.3 m, a walk 1.8 m and an apron to its span, however wide the span', () => {
    const hospital = byId('hospital');
    const site = civicSiteFor(
      hospital,
      at({ catalogId: 'hospital', x: 10, z: 10 }),
      rowStreet(13),
    )!;
    const widths = Object.fromEntries(site.crossings.map((c) => [c.kind, c.u1 - c.u0]));
    expect(widths.drive).toBeCloseTo(CIVIC_DRIVE_WIDTH_M, 6);
    expect(widths.walk).toBeCloseTo(CIVIC_WALK_WIDTH_M, 6);
    expect(widths.apron).toBeCloseTo(
      span('hospital', 'apron').u1 - span('hospital', 'apron').u0,
      6,
    );
  });

  it('keeps a drive inside a footprint narrower than the cut beside its edge', () => {
    // The clinic’s two legs are 6.1 m lanes on a 20 m edge; each cut stays on the lot.
    const clinic = byId('clinic');
    const site = civicSiteFor(clinic, at({ catalogId: 'clinic' }), rowStreet(12))!;
    expect(site.crossings).toHaveLength(2);
    for (const c of site.crossings) {
      expect(c.u1 - c.u0).toBeCloseTo(CIVIC_DRIVE_WIDTH_M, 6);
      expect(c.u0).toBeGreaterThanOrEqual(0);
      expect(c.u1).toBeLessThanOrEqual(TILE_METERS);
    }
    expect(site.crossings[0]!.u0).toBeCloseTo(0, 6);
    expect(site.crossings[1]!.u1).toBeCloseTo(TILE_METERS, 6);
  });

  it('turns the spans with the building: a front to the north runs the edge the other way', () => {
    // The same station turned half a turn, its street along row 9.
    const site = civicSiteFor(fire, at({ rotation: 2 }), rowStreet(9), noSensors)!;
    expect(site.edge.side).toBe('N');
    const apron = site.crossings.find((c) => c.kind === 'apron')!;
    const local = span('fire-station', 'apron');
    expect(apron.u0).toBeCloseTo(TILE_METERS * 2 - local.u1, 6);
    expect(apron.u1).toBeCloseTo(TILE_METERS * 2 - local.u0, 6);
    // Local u 3 is its west end; half a turn puts that at the lot's east side.
    expect(lotPointToWorld(site.frame, apron.u1, 0).x).toBeCloseTo(10 * TILE_METERS + 40 - 3, 6);
  });

  it('draws nothing where the street is not along the edge its spans lie on', () => {
    expect(civicSiteFor(fire, at(), rowStreet(9), noSensors)).toBeNull();
    expect(civicSiteFor(fire, at(), NO_STREET, noSensors)).toBeNull();
    expect(civicSiteFor(fire, at({ rotation: 1 }), rowStreet(12), noSensors)).toBeNull();
  });

  it('leaves every entry that is not civic to its own lot', () => {
    const shop = catalog.find((e) => e.category === 'com')!;
    expect(civicSiteFor(shop, at({ catalogId: shop.id }), rowStreet(12))).toBeNull();
  });

  it('follows the turn of a quarter: a front to the east crosses the east edge', () => {
    const site = civicSiteFor(fire, at({ rotation: 1 }), columnStreet(12), noSensors)!;
    expect(site.edge.side).toBe('E');
    const apron = site.crossings.find((c) => c.kind === 'apron')!;
    // Rotation 1 carries local +X north, so the edge, which runs south, is read from the far end.
    const local = span('fire-station', 'apron');
    expect(apron.u0).toBeCloseTo(TILE_METERS * 2 - local.u1, 6);
  });

  it('crosses a framed parcel’s front, its verge none and its footway the free road’s', () => {
    const frame = { x: 200, z: 300, heading: 0 };
    const framed = at({ frame });
    const lookup: StreetLookup = () => null;
    const site = civicSiteFor(fire, framed, lookup, noSensors)!;
    expect(site.framed).toBe(true);
    const apron = site.crossings.find((c) => c.kind === 'apron')!;
    const local = span('fire-station', 'apron');
    expect(apron.u0).toBeCloseTo(TILE_METERS * 2 - local.u1, 6);
    const sidewalk = sidewalkDepthMeters(RoadTier.TwoLane);
    const [rect] = civicCrossingRects([apron], 0, sidewalk);
    // The footway lies outward of the parcel's front line, the kerb line sidewalk out.
    expect(lotPointToWorld(site.frame, apron.u0, rect!.rect.v0).z).toBeCloseTo(300 - sidewalk, 6);
    expect(lotPointToWorld(site.frame, apron.u0, rect!.rect.v1).z).toBeCloseTo(300, 6);
  });

  it('puts a shore kit’s way in on its land side, opposite the water it faces', () => {
    const pump = byId('water-pump');
    const waterSouth: KitSensors = { waterAt: (_x, z) => z === 12, railAt: () => false };
    const north = civicSiteFor(pump, at({ catalogId: 'water-pump' }), rowStreet(9), waterSouth)!;
    expect(north.edge.side).toBe('N');
    expect(north.crossings[0]!.u0).toBeCloseTo(24 - CIVIC_DRIVE_WIDTH_M / 2, 6);
    // With the water to the south and the street there too, it faces the water: nothing.
    expect(
      civicSiteFor(pump, at({ catalogId: 'water-pump' }), rowStreet(12), waterSouth),
    ).toBeNull();

    const waterNorth: KitSensors = { waterAt: (_x, z) => z === 9, railAt: () => false };
    const south = civicSiteFor(pump, at({ catalogId: 'water-pump' }), rowStreet(12), waterNorth)!;
    expect(south.edge.side).toBe('S');
    expect(south.crossings[0]!.u0).toBeCloseTo(TILE_METERS * 2 - 24 - CIVIC_DRIVE_WIDTH_M / 2, 6);
  });

  it('puts a station’s way in on the side away from its track', () => {
    const station = byId('rail-station');
    // The 2x3 lot at (10, 10): rail along row 13 to the south, the street along row 9.
    const sensors: KitSensors = { waterAt: () => false, railAt: (_x, z) => z === 13 };
    const site = civicSiteFor(station, at({ catalogId: 'rail-station' }), rowStreet(9), sensors)!;
    expect(site.edge.side).toBe('N');
    const [drive] = site.crossings;
    expect(drive!.u0 + (drive!.u1 - drive!.u0) / 2).toBeCloseTo(TILE_METERS, 6);
    // The street on the track's own side is no way in.
    expect(
      civicSiteFor(station, at({ catalogId: 'rail-station' }), rowStreet(13), sensors),
    ).toBeNull();
  });

  it('knows which map side each turn puts a kit’s front and back on', () => {
    const front = { spans: [] };
    const back = { spans: [], edge: 'back' as const };
    expect([0, 1, 2, 3].map((t) => civicEdgeSide(front, t as 0 | 1 | 2 | 3))).toEqual([
      'S',
      'E',
      'N',
      'W',
    ]);
    expect([0, 1, 2, 3].map((t) => civicEdgeSide(back, t as 0 | 1 | 2 | 3))).toEqual([
      'N',
      'W',
      'S',
      'E',
    ]);
  });
});

describe('the road tiles a civic cut crosses', () => {
  it('names the tile across a drive so kerb furniture keeps off it, and none for a walk', () => {
    const garage = byId('bus-garage');
    // A 3x4 at (10, 10): its street along row 14; the 7.3 m cut about the drive's gate
    // fills the middle tile and runs a quarter metre into the next.
    const site = civicSiteFor(garage, at({ catalogId: 'bus-garage' }), rowStreet(14))!;
    expect(civicCutTiles(site, rowStreet(14))).toEqual([
      { x: 11, z: 14 },
      { x: 12, z: 14 },
    ]);

    const park = civicSiteFor(byId('small-park'), at({ catalogId: 'small-park' }), rowStreet(11))!;
    expect(park.crossings).toHaveLength(1);
    expect(civicCutTiles(park, rowStreet(11))).toEqual([]);
  });

  it('names every tile a wide apron touches', () => {
    const district = byId('fire-station-district');
    // 3x2 at (10, 10): the apron runs u 3 to 20.46, across two tiles of the edge.
    const site = civicSiteFor(district, at({ catalogId: 'fire-station-district' }), rowStreet(12))!;
    expect(civicCutTiles(site, rowStreet(12))).toEqual([
      { x: 10, z: 12 },
      { x: 11, z: 12 },
    ]);
  });
});

describe('the lot renderer’s crossing', () => {
  const extent = (scene: THREE.Scene): Record<'x0' | 'x1' | 'z0' | 'z1' | 'top', number> => {
    const position = (scene.children[0] as THREE.Mesh).geometry.getAttribute('position');
    const out = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity, top: -Infinity };
    for (let i = 0; i < position.count; i += 1) {
      out.x0 = Math.min(out.x0, position.getX(i));
      out.x1 = Math.max(out.x1, position.getX(i));
      out.z0 = Math.min(out.z0, position.getZ(i));
      out.z1 = Math.max(out.z1, position.getZ(i));
      out.top = Math.max(out.top, position.getY(i));
    }
    return out;
  };
  const add = (building: BuildingInstance, street: StreetLookup): THREE.Scene => {
    const scene = new THREE.Scene();
    new LotRenderer(scene, flat, catalog, () => false, street).apply({
      added: [building],
      updated: [],
      removed: [],
    });
    return scene;
  };

  it('paves a fire apron from the footprint edge out to the kerb line, over the footway’s cut', () => {
    const scene = add(at(), rowStreet(12));
    const e = extent(scene);
    const apron = span('fire-station', 'apron');
    const walk = span('fire-station', 'walk');
    expect(e.x0).toBeCloseTo(10 * TILE_METERS + apron.u0, 4);
    // The entrance walk is the last crossing along the edge, cut to 1.8 m about its middle.
    expect(e.x1).toBeCloseTo(
      10 * TILE_METERS + (walk.u0 + walk.u1) / 2 + CIVIC_WALK_WIDTH_M / 2,
      4,
    );
    expect(e.z0).toBeCloseTo(12 * TILE_METERS, 4);
    expect(e.z1).toBeCloseTo(12 * TILE_METERS + VERGE_M + SIDEWALK_M, 4);
    expect(e.top).toBeCloseTo(CURB_CUT_Y_OFFSET, 6);
  });

  it('lays nothing for a civic building with no street along its front', () => {
    expect(add(at(), NO_STREET).children).toHaveLength(0);
    expect(add(at(), rowStreet(9)).children).toHaveLength(0);
  });

  it('lays a clinic’s two drives as separate crossings of 7.3 m', () => {
    const scene = add(at({ catalogId: 'clinic' }), rowStreet(12));
    const e = extent(scene);
    expect(e.x0).toBeCloseTo(10 * TILE_METERS, 4);
    expect(e.x1).toBeCloseTo(11 * TILE_METERS, 4);
  });
});
