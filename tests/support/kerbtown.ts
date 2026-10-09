/**
 * A town of parked streets, grown by the worker sim and drawn by the road
 * mesh fed its snapshots the way main.ts feeds it: every parking style, one-way
 * and two-way, a T at a minor-road stop, an all-way stop, a signal, an
 * uncontrolled T, a side road the warrant decides, and a long block that marks
 * several accessible stalls, along x and along z.
 */
import * as THREE from 'three';
import { ClientGridMirror } from '../../src/app/clientgrid';
import { RoadMeshRenderer } from '../../src/render/roadsmesh';
import {
  composeProfile,
  FIRST_CUSTOM_PROFILE_ID,
  isPresetProfileId,
  NO_EDITS,
  presetProfileForTier,
  type SideChoice,
} from '../../src/shared/roadprofile';
import { RoadTier } from '../../src/shared/types';
import type {
  Command,
  JunctionControl,
  ParkingStyle,
  RoadProfile,
  TilePoint,
} from '../../src/shared/types';
import { decodeSave } from '../../src/app/persist';
import type { KerbSurroundings } from '../../src/shared/kerblayout';
import { gridKerbSurroundings } from '../../src/sim/kerbsurroundings';
import { RoadNetwork } from '../../src/world/roadgraph';
import {
  column,
  feedMirror,
  flatMap,
  latestSaveData,
  latestSaveGrid,
  roadRow,
  run,
  sandboxed,
  type Harness,
} from './sim';

/** The parked profiles the town lays, by name, each with the preset it is composed from. */
const PROFILES: readonly {
  name: string;
  tier: RoadTier;
  parking: SideChoice;
  style: ParkingStyle;
}[] = [
  { name: 'parallel', tier: RoadTier.TwoLane, parking: 'both', style: 'parallel' },
  { name: 'angled', tier: RoadTier.TwoLane, parking: 'right', style: 'angled' },
  { name: 'headIn', tier: RoadTier.TwoLane, parking: 'right', style: 'headIn' },
  { name: 'oneWayParallel', tier: RoadTier.OneWay, parking: 'both', style: 'parallel' },
  { name: 'oneWayAngled', tier: RoadTier.OneWay, parking: 'left', style: 'angled' },
];

export interface KerbTown {
  h: Harness;
  renderer: RoadMeshRenderer;
  /** Every tile that carries a road, low z first, then low x. */
  roadTiles: TilePoint[];
  /** The composed profiles by id, as the save's table holds them. */
  profiles: ReadonlyMap<number, RoadProfile>;
}

/** The commands that lay `tiles` with the named parked profile, or with a preset tier. */
function lay(tiles: TilePoint[], road: string | RoadTier): Command {
  if (typeof road !== 'string') return { kind: 'buildRoad', tier: road, tiles };
  const i = PROFILES.findIndex((p) => p.name === road);
  return {
    kind: 'buildRoad',
    tier: PROFILES[i]!.tier,
    tiles,
    profile: FIRST_CUSTOM_PROFILE_ID + i,
  };
}

/** Grows the town in the worker and draws it. */
export function kerbTown(): KerbTown {
  const h = sandboxed();
  let seq = 1;
  const must = (commands: Command[]): void => {
    const ack = run(h, seq++, commands);
    if (!ack.ok) throw new Error(`kerbTown: refused ${JSON.stringify(commands)}: ${ack.reason}`);
  };
  const profiles = new Map<number, RoadProfile>();
  PROFILES.forEach((p, i) => {
    const profile = composeProfile(presetProfileForTier(p.tier), {
      ...NO_EDITS,
      parking: p.parking,
      parkingStyle: p.style,
    });
    profiles.set(FIRST_CUSTOM_PROFILE_ID + i, profile);
    must([{ kind: 'defineRoadProfile', id: FIRST_CUSTOM_PROFILE_ID + i, profile }]);
  });
  const control = (x: number, z: number, c: JunctionControl): void =>
    must([{ kind: 'setJunctionControl', x, z, control: c }]);

  // Two-way parallel: a T at a minor-road stop and an all-way stop crossroads.
  must([lay(roadRow(10, 20, 32), 'parallel')]);
  must([lay(column(20, 14, 6), RoadTier.TwoLane)]);
  must([lay(column(32, 14, 6), 'parallel'), lay(column(32, 21, 6), 'parallel')]);
  control(20, 20, 'stop');
  control(32, 20, 'allWayStop');

  // Two-way angled across a four-lane road at a signal.
  must([lay(roadRow(10, 50, 26), 'angled')]);
  must([lay(column(22, 44, 6), RoadTier.FourLane), lay(column(22, 51, 6), RoadTier.FourLane)]);
  control(22, 50, 'signal');

  // Two-way head-in: an uncontrolled T, and an avenue the warrant decides.
  must([lay(roadRow(10, 80, 26), 'headIn')]);
  must([lay(column(25, 81, 6), RoadTier.TwoLane)]);
  must([lay(column(15, 74, 6), RoadTier.Avenue)]);
  control(25, 80, 'none');

  // One-way parallel, drawn east, across an all-way stop.
  must([lay(roadRow(10, 110, 26), 'oneWayParallel')]);
  must([lay(column(22, 104, 6), 'parallel'), lay(column(22, 111, 6), 'parallel')]);
  control(22, 110, 'allWayStop');

  // One-way angled, drawn west, with a T at a signal.
  must([lay(roadRow(10, 140, 26).reverse(), 'oneWayAngled')]);
  must([lay(column(20, 134, 6), RoadTier.TwoLane)]);
  control(20, 140, 'signal');

  // Along z: a long block of parallel parking beyond a signal.
  must([lay(column(70, 10, 66), 'parallel')]);
  must([lay(roadRow(64, 20, 6), RoadTier.TwoLane), lay(roadRow(71, 20, 6), RoadTier.TwoLane)]);
  control(70, 20, 'signal');
  h.ticks(2);

  return { h, ...drawnRoads(h), profiles };
}

/** A worker's roads as the sim holds them: its saved grid, its road graph and its profile table. */
export function simKerb(h: Harness): KerbSurroundings {
  h.sim.handleMessage({ type: 'requestSave' });
  const table = new Map(
    (decodeSave(latestSaveData(h)).meta.roadProfiles ?? []).map((e) => [e.id, e.profile]),
  );
  const profileById = (id: number): RoadProfile | null =>
    isPresetProfileId(id) ? presetProfileForTier(id as RoadTier) : (table.get(id) ?? null);
  const grid = latestSaveGrid(h);
  const network = new RoadNetwork();
  network.setProfileResolver((id) => table.get(id) ?? null);
  network.rebuild(grid);
  return gridKerbSurroundings(grid, network.getNodes(), profileById);
}

/** A worker's roads fed to the road mesh the way main.ts feeds it, and every tile that carries one. */
export function drawnRoads(h: Harness): Pick<KerbTown, 'renderer' | 'roadTiles'> {
  const mirror = new ClientGridMirror(flatMap());
  const toMirror = feedMirror(mirror);
  const renderer = new RoadMeshRenderer(
    new THREE.Scene(),
    () => 0,
    (id) => mirror.profileById(id),
  );
  const roads = new Map<number, TilePoint>();
  for (const msg of h.messages) {
    toMirror(msg);
    if (msg.type !== 'snapshot') continue;
    const snap = msg.snap;
    if (snap.roundabouts) renderer.setRoundabouts(snap.roundabouts);
    if (snap.junctions) renderer.setJunctionControls(snap.junctions);
    if (snap.roads) {
      renderer.apply(snap.roads);
      for (const d of snap.roads) {
        if (d.tier === RoadTier.None) roads.delete(d.z * 1000 + d.x);
        else roads.set(d.z * 1000 + d.x, { x: d.x, z: d.z });
      }
    }
  }
  const roadTiles = [...roads.entries()].sort((a, b) => a[0] - b[0]).map(([, t]) => t);
  return { renderer, roadTiles };
}

const round = (v: number): number => Number(v.toFixed(6));

/**
 * What the road mesh says about parking at every road tile of the town: the
 * no-parking setbacks at its two ends, and the stalls it marks on each kerb —
 * where each meets the travel edge, its middle, whether it is accessible, its
 * access aisle and the yaw of a car in it. Tiles that say nothing are left out.
 */
export function renderedKerbs(town: KerbTown): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { x, z } of town.roadTiles) {
    const setbacks = town.renderer.parkingSetbacksAt(x, z);
    const stalls = (side: 'low' | 'high'): unknown =>
      town.renderer
        .parkingStallsAt(x, z, side)
        ?.map((s) => [
          round(s.from),
          round(s.to),
          round(s.centre),
          s.accessible ? 1 : 0,
          s.aisle ? [round(s.aisle.from), round(s.aisle.to)] : null,
          s.yaw === null ? null : round(s.yaw),
        ]) ?? null;
    const entry = {
      setbacks: setbacks && {
        alongX: setbacks.alongX,
        lo: setbacks.lo?.map(round) ?? null,
        hi: setbacks.hi?.map(round) ?? null,
      },
      low: stalls('low'),
      high: stalls('high'),
    };
    if (entry.setbacks || entry.low || entry.high) out[`${x},${z}`] = entry;
  }
  return out;
}
