/**
 * The worker sim with no thread around it: boot it, send it commands, tick it,
 * and read back what it posts. Nothing here imports Vitest, so a page served
 * by the dev server can import it too — the screenshot harness grows the same
 * town the tests do.
 */
import { MAP_SIZE, MAP_TILES, SPEED_MULTIPLIERS, TICK_MS } from '../../src/shared/constants';
import { FieldId, RoadTier } from '../../src/shared/types';
import type {
  BuildingCatalogEntry,
  BuildingInstance,
  Command,
  CommandAck,
  GridState,
  MainToWorker,
  MapData,
  RoadSpec,
  SimSnapshot,
  TilePoint,
  WorkerToMain,
} from '../../src/shared/types';
import catalogData from '../../src/data/catalog.json';
import roadsData from '../../src/data/roads.json';
import { decodeSave, encodeSave } from '../../src/app/persist';
import type { ClientGridMirror } from '../../src/app/clientgrid';
import { loadGrid } from '../../src/world/roadnet';
import {
  composeProfile,
  FIRST_CUSTOM_PROFILE_ID,
  NO_EDITS,
  oneCarriagewayIds,
  presetProfileForTier,
} from '../../src/shared/roadprofile';
import type { MiddleChoice } from '../../src/shared/roadprofile';
import { corridorRunsFor } from '../../src/shared/corridor';
import { createWorkerSim, type WorkerSim } from '../../src/sim/worker.entry';

/**
 * The timeout for a test that grows a town for a thousand ticks or more. It
 * takes ten to twenty seconds on its own and longer with the rest of the suite
 * running beside it, so the default twenty would fail it on load rather than
 * on anything it checks.
 */
export const GROWTH_TIMEOUT_MS = 120_000;

export const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
export const roadSpecs = (roadsData as { specs: RoadSpec[] }).specs;
export const twoLaneSpec = roadSpecs.find((s) => s.tier === RoadTier.TwoLane)!;
export const windTurbine = catalog.find((e) => e.id === 'wind-turbine')!;
export const waterTowerEntry = catalog.find((e) => e.id === 'water-tower')!;

/** The catalog entry a building was grown or placed from. */
export function entryOf(b: { catalogId: string }): BuildingCatalogEntry {
  const entry = catalog.find((e) => e.id === b.catalogId);
  if (!entry) throw new Error(`no catalog entry ${b.catalogId}`);
  return entry;
}

/** Perfectly flat, dry, treeless map: every tile is buildable. */
export function flatMap(): MapData {
  return {
    name: 'Flatland',
    size: MAP_SIZE,
    height: new Float32Array(MAP_TILES).fill(5),
    water: new Uint8Array(MAP_TILES),
    trees: new Uint8Array(MAP_TILES),
    seaLevel: 0,
    spawn: { x: MAP_SIZE / 2, z: MAP_SIZE / 2 },
  };
}

export interface Harness {
  sim: WorkerSim;
  messages: WorkerToMain[];
  ticks: (n: number) => void;
  lastSnapshot: () => SimSnapshot | null;
  ackFor: (seq: number) => CommandAck | null;
}

/**
 * A worker sim with no thread around it, and every message it posts kept.
 * `onMessage`, when given, also sees each message as it is posted — which is
 * how a mirror is kept in step the way the main thread keeps it.
 */
export function makeHarness(onMessage?: (msg: WorkerToMain) => void): Harness {
  const messages: WorkerToMain[] = [];
  const sim = createWorkerSim((msg) => {
    messages.push(msg);
    onMessage?.(msg);
  });

  // Track the set speed so `ticks(n)` advances EXACTLY n sim ticks regardless
  // of the real-time pacing multiplier (speed 1 = 0.5×, so a
  // raw pump(TICK_MS) is only half a tick). Feeding TICK_MS / multiplier per
  // tick makes the sim's own `elapsed * SPEED_MULTIPLIERS[speed]` land on
  // exactly one tickMs. Tests care about tick COUNT, not wall-clock pacing.
  let currentSpeed: 0 | 1 | 2 | 4 = 1;
  const rawHandle = sim.handleMessage.bind(sim);
  sim.handleMessage = (msg: MainToWorker): void => {
    if (msg.type === 'setSpeed') currentSpeed = msg.speed;
    rawHandle(msg);
  };

  return {
    sim,
    messages,
    ticks: (n: number) => {
      const mult = SPEED_MULTIPLIERS[currentSpeed] || 1; // paused → treat as raw so callers still step the pump
      const perTick = TICK_MS / mult;
      for (let i = 0; i < n; i++) sim.pump(perTick);
    },
    lastSnapshot: () => {
      for (let i = messages.length - 1; i >= 0; i--) {
        const m = messages[i]!;
        if (m.type === 'snapshot') return m.snap;
      }
      return null;
    },
    ackFor: (seq: number) => {
      for (const m of messages) {
        if (m.type === 'ack' && m.ack.seq === seq) return m.ack;
      }
      return null;
    },
  };
}

/**
 * Keeps `mirror` in step with the worker the way main.ts keeps its own: every
 * layer a snapshot carries, in the order main.ts applies them (the profile
 * table before the road deltas that refer into it, and so on).
 */
export function feedMirror(mirror: ClientGridMirror): (msg: WorkerToMain) => void {
  const byId = new Map(catalog.map((e) => [e.id, e] as const));
  return (msg) => {
    if (msg.type !== 'snapshot') return;
    const snap = msg.snap;
    if (snap.heightPatches && snap.heightPatches.length > 0)
      mirror.applyHeightPatches(snap.heightPatches);
    if (snap.roadProfiles) mirror.applyRoadProfiles(snap.roadProfiles);
    if (snap.roadNet) mirror.applyRoadNetwork(snap.roadNet);
    if (snap.junctions) mirror.applyJunctions(snap.junctions);
    if (snap.roads) mirror.applyRoadDeltas(snap.roads);
    if (snap.buildings) mirror.applyBuildingDelta(snap.buildings, (id) => byId.get(id));
    if (snap.zones) mirror.applyZonePatches(snap.zones);
    if (snap.powerLines) mirror.applyPowerLinePatches(snap.powerLines);
    if (snap.power) mirror.applyPowerPatches(snap.power);
  };
}

export function initialized(): Harness {
  const h = makeHarness();
  h.sim.handleMessage({ type: 'init', seed: 1337, map: flatMap() });
  return h;
}

export function send(h: Harness, seq: number, commands: Command[]): void {
  const msg: MainToWorker = { type: 'commands', seq, commands };
  h.sim.handleMessage(msg);
}

/** Sends one batch, lets it drain, and returns its ack. */
export function run(h: Harness, seq: number, commands: Command[]): CommandAck {
  send(h, seq, commands);
  h.ticks(2);
  const ack = h.ackFor(seq);
  if (!ack) throw new Error(`no ack for batch ${seq}`);
  return ack;
}

/** A fresh sim in the sandbox, where every road and building is unlocked. */
export function sandboxed(): Harness {
  const h = initialized();
  run(h, 0, [{ kind: 'setSandbox', on: true }]);
  return h;
}

/**
 * Boots a sim whose treasury and milestone level allow the latest unlocks
 * (¢100,000 at milestone 5): save a fresh sim, patch the persisted stats, and
 * loadSave it back — milestoneLevel only ever ratchets up in EconomySystem,
 * so the patched level sticks across subsequent ticks.
 */
export function initializedAtMilestone5(): Harness {
  const h = initialized();
  h.sim.handleMessage({ type: 'requestSave' });
  const saveMsg = h.messages.find((m) => m.type === 'save');
  if (!saveMsg || saveMsg.type !== 'save') throw new Error('no save message');
  const payload = decodeSave(saveMsg.data);
  payload.meta.stats.milestoneLevel = 5;
  payload.meta.stats.funds = 100_000;
  h.sim.handleMessage({ type: 'loadSave', data: encodeSave(payload) });
  return h;
}

/** The bytes of the most recent 'save' message in the harness. */
export function latestSaveData(h: Harness): ArrayBuffer {
  const saves = h.messages.filter(
    (m): m is Extract<WorkerToMain, { type: 'save' }> => m.type === 'save',
  );
  const last = saves[saves.length - 1];
  if (!last) throw new Error('latestSaveData: no save message found');
  return last.data;
}

/** Decodes the most recent 'save' message in the harness into a live GridState. */
export function latestSaveGrid(h: Harness): GridState {
  const payload = decodeSave(latestSaveData(h));
  const table = (payload.meta.roadProfiles ?? []).map((e) => [e.id, e.profile] as const);
  return loadGrid(payload.grid, oneCarriagewayIds(table)).grid;
}

/** Latest full-map Noise field posted by the harness, or null. */
export function latestNoiseField(h: Harness): Uint8Array | null {
  for (let i = h.messages.length - 1; i >= 0; i--) {
    const m = h.messages[i]!;
    if (m.type === 'field' && m.field === FieldId.Noise) return m.data;
  }
  return null;
}

/**
 * Every building standing after the last snapshot, as the mirror would hold
 * it: each snapshot's building log replayed in order.
 */
export function standingBuildings(h: Harness): Map<number, BuildingInstance> {
  const standing = new Map<number, BuildingInstance>();
  for (const m of h.messages) {
    if (m.type !== 'snapshot' || !m.snap.buildings) continue;
    for (const b of [...m.snap.buildings.added, ...m.snap.buildings.updated]) standing.set(b.id, b);
    for (const id of m.snap.buildings.removed) standing.delete(id);
  }
  return standing;
}

/**
 * The uncollected trash on every tile after the last snapshot, as the trash
 * lens holds it: each snapshot's changed patches replayed in order.
 */
export function latestTrash(h: Harness): Uint8Array {
  const trash = new Uint8Array(MAP_TILES);
  for (const m of h.messages) {
    if (m.type !== 'snapshot') continue;
    for (const p of m.snap.garbage?.trash ?? []) {
      for (let dz = 0; dz < p.h; dz++) {
        for (let dx = 0; dx < p.w; dx++) {
          trash[(p.z + dz) * MAP_SIZE + p.x + dx] = p.data[dz * p.w + dx] ?? 0;
        }
      }
    }
  }
  return trash;
}

/** The landfill's fill fraction as the last snapshot that carried it said. */
export function latestLandfillFill(h: Harness): number {
  for (let i = h.messages.length - 1; i >= 0; i--) {
    const m = h.messages[i]!;
    if (m.type === 'snapshot' && m.snap.garbage?.landfillFill !== undefined) {
      return m.snap.garbage.landfillFill;
    }
  }
  return 0;
}

export const roadRow = (x0: number, z: number, len: number): TilePoint[] =>
  Array.from({ length: len }, (_, i) => ({ x: x0 + i, z }));

export const column = (x: number, z0: number, count: number): TilePoint[] =>
  Array.from({ length: count }, (_, i) => ({ x, z: z0 + i }));

/**
 * The commands the road tool sends for a six-lane avenue along `path`: too wide
 * for one tile, it is laid as two carriageways side by side, one run a half.
 * `middle` is what runs down between them: the preset's median unless said.
 */
export function sixLaneCommands(
  path: TilePoint[],
  profileId = FIRST_CUSTOM_PROFILE_ID,
  middle: MiddleChoice | null = null,
): Command[] {
  const profile = composeProfile(presetProfileForTier(RoadTier.Avenue), {
    ...NO_EDITS,
    lanes: 3,
    middle,
  });
  const runs = corridorRunsFor(path);
  if (!runs) throw new Error('sixLaneCommands: a corridor is a straight run');
  return [
    { kind: 'defineRoadProfile', id: profileId, profile },
    {
      kind: 'buildRoad',
      tier: RoadTier.Avenue,
      tiles: runs.near,
      profile: profileId,
      flows: runs.near.map(() => runs.nearFlow),
    },
    {
      kind: 'buildRoad',
      tier: RoadTier.Avenue,
      tiles: runs.far,
      profile: profileId,
      flows: runs.far.map(() => runs.farFlow),
    },
  ];
}

/** A w×d block of tiles, row by row. */
export const rows = (x0: number, z0: number, w: number, d: number): TilePoint[] =>
  Array.from({ length: d }, (_, dz) => roadRow(x0, z0 + dz, w)).flat();
