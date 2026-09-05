/**
 * SlimCity render-thread boot: creates the renderer,
 * builds the world from the procedural map, spawns the sim worker, and wires
 * snapshots/acks/fields into the renderers, the zustand UI store, the tool
 * manager + undo stack, and IndexedDB persistence.
 */
import * as THREE from 'three';
import {
  CLOCK_START_OFFSET_TICKS,
  MAP_SIZE,
  ROAD_ELEVATION_STEP_M,
  SNAPSHOT_HZ,
  TILE_METERS,
  VISUAL_DAY_TICKS,
  inBounds,
  tickToDate,
  tileToWorld,
  worldToTile,
} from './shared/constants';
import type {
  BuildingCatalogEntry,
  BuildingInstance,
  CityStats,
  Command,
  CommandAck,
  FieldId,
  LensId,
  MainToWorker,
  RoadSpec,
  SimSnapshot,
  TilePoint,
  ToolId,
  WorkerToMain,
} from './shared/types';
import { RoadTier, isStreetTier } from './shared/types';
import catalogData from './data/catalog.json';
import roadsData from './data/roads.json';
import { CommandQueue } from './core/commands';
import { generateProceduralMap } from './world/maps';
import { createRenderer, createWorldScene, timeOfDayColors } from './render/scene';
import { createBloomPipeline, type BloomPipeline } from './render/bloom';
import { CloudLayer } from './render/clouds';
import { TerrainRenderer } from './render/terrain';
import { WaterRenderer } from './render/water';
import { TreeRenderer } from './render/trees';
import { OverlayRenderer } from './render/overlays';
import { BuildingInstancer } from './render/buildings';
import { MassingRenderer } from './render/massing';
import { RoofPropRenderer } from './render/props';
import { HouseRoofRenderer } from './render/houses';
import {
  curbCutTileFor,
  ParkedCarRenderer,
  tierAllowsRoadsideParking,
  usesRoadsideParking,
} from './render/parked';
import { LotRenderer } from './render/lots';
import { BuildingKitRenderer } from './render/buildingkit';
import { LandmarkRenderer } from './render/landmarks';
import { RoadMeshRenderer } from './render/roadsmesh';
import { BridgeRenderer } from './render/bridges';
import { VehicleRenderer } from './render/vehicles';
import {
  TransitRenderer,
  computeShelterLayout,
  computeStopHeading,
  shelterSide,
  toWorldPoints,
} from './render/transit';
import { PedestrianRenderer, type StopIdleInput } from './render/pedestrians';
import { ServiceVehicleRenderer } from './render/servicevehicles';
import { DistrictsRenderer } from './render/districts';
import { LandfillRenderer } from './render/landfill';
import { PhotoModeController } from './render/photomode';
import { StatsHistory } from './ui/statshistory';
import { ADVISOR_REFRESH_SNAPSHOTS, cityIssues } from './ui/advisor';
import { GhostRenderer, type GhostKind, type SetPreviewOptions } from './render/ghosts';
import { UtilityKitRenderer } from './render/utilitykits';
import { ZoneGridRenderer } from './render/zonegrid';
import { LampRenderer } from './render/lamps';
import { RoadFurnitureRenderer } from './render/roadfurniture';
import { SelectionOutline } from './render/outline';
import { MapPin } from './render/pin';
import { CameraRig } from './render/camera';
import { IdPicker } from './render/picking';
import {
  ToolManager,
  footprintTiles,
  ROAD_TOOL_TO_TIER,
  ZONE_TOOL_TO_TYPE,
  type ToolEnv,
} from './tools/tools';
import { UndoStack } from './tools/undo';
import { useCityStore } from './ui/store';
import { mountUi } from './ui/App';
import { AutoSaver, getSaveById, loadLatest, saveNow, storeSave } from './app/persist';
import { CursorChipStack } from './app/cursorchip';
import { ClientGridMirror } from './app/clientgrid';
import { readAppSession, type AppSession, type GameSettings } from './app/session';
import { audioRuntime } from './app/audioruntime';
import { ambientMix } from './app/audio';

/** Cheap set equality, so an unchanged driveway set costs no lamp rebuild. */
function sameTileKeySet(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false;
  for (const key of a) if (!b.has(key)) return false;
  return true;
}

const MAP_NAME = 'Riverton';
const OVERLAY_REFRESH_MS = 500; // 2 Hz while an infoview lens is active
const SNAPSHOT_INTERVAL_MS = 1000 / SNAPSHOT_HZ;

const catalog = (catalogData as { buildings: BuildingCatalogEntry[] }).buildings;
const roadSpecs = (roadsData as { specs: RoadSpec[] }).specs;

/** Keyboard 1..6 jump to a representative tool of each toolbar category. */
const CATEGORY_HOTKEYS: Record<string, ToolId> = {
  Digit1: 'road.two',
  Digit2: 'zone.resLow',
  Digit3: 'plop.wind-turbine',
  Digit4: 'plop.police-station',
  Digit5: 'plop.small-park',
  Digit6: 'bulldoze',
  Digit7: 'terraform.raise', // Landscaping, appended past the original six
};

async function startGame(session: Extract<AppSession, { screen: 'playing' }>): Promise<void> {
  const viewport = document.getElementById('viewport');
  const uiRoot = document.getElementById('ui-root');
  if (!viewport || !uiRoot) {
    throw new Error('SlimCity: #viewport / #ui-root missing from index.html');
  }

  // Seed + optional load payload: a Load Game intent carries no fresh seed of
  // its own (session.seed is 0 — see session.ts's startLoadGame), so the
  // stored save's header seed is what actually rebuilds the same terrain.
  let seed = session.seed;
  let loadData: ArrayBuffer | null = null;
  if (session.mode === 'load' && session.saveId != null) {
    const entry = await getSaveById(session.saveId);
    if (entry) {
      seed = entry.header.seed;
      loadData = entry.data;
    }
  }

  // --- renderer, scene, world ------------------------------------------------
  const handle = await createRenderer(viewport);
  const world = createWorldScene();

  const map = generateProceduralMap(seed, MAP_NAME);

  const terrain = new TerrainRenderer(world.scene);
  terrain.build(map);
  const heightAt = (x: number, z: number): number => terrain.heightAt(x, z);

  // Render-thread mirror of the worker's grid, fed from snapshot deltas —
  // backs the zoning grid, lamp placement, and the plop overlap check. The two
  // tile lookups over it are read by every frontage-aware renderer below
  // (parking bays, building setbacks, landfill entrances); onSnapshot updates
  // the mirror before it feeds buildings.
  const clientGrid = new ClientGridMirror(map);
  const roadAt = (x: number, z: number): boolean =>
    inBounds(x, z) && clientGrid.roadTier[z * clientGrid.size + x] !== RoadTier.None;
  const streetAt = (x: number, z: number): boolean =>
    inBounds(x, z) && isStreetTier((clientGrid.roadTier[z * clientGrid.size + x] ?? 0) as RoadTier);

  /**
   * Height of the road SURFACE, as opposed to the ground: the deck where one
   * governs the point, the terrain everywhere else. Everything that rides the
   * road — the road mesh, the bridge structure under it, traffic, pedestrians,
   * lamps, furniture — takes this instead of heightAt, so they cannot disagree
   * about where the road is.
   */
  const roadSurfaceAt = (wx: number, wz: number): number =>
    clientGrid.deckSurfaceAt(wx, wz) ?? heightAt(wx, wz);

  // Animated water surface and cumulus layer; both tick in the frame loop below.
  const water = new WaterRenderer(world.scene, heightAt);
  const clouds = new CloudLayer(world.scene);

  const trees = new TreeRenderer(world.scene, heightAt);
  trees.build(map, seed);

  // Utility detail kits: wind turbines, water towers,
  // coal plants, and small parks render as real modelled kits; the ids the
  // kit renderer claims are handed to BuildingInstancer as plinthIds so the
  // instancer draws only a low plinth slab under them (picking/outline/
  // bulldoze still flow through the instancer path).
  const utilityKits = new UtilityKitRenderer(world.scene, heightAt, catalog);
  const instancer = new BuildingInstancer(
    world.scene,
    catalog,
    heightAt,
    utilityKits.kitIds(),
    roadAt,
  );
  const roadsMesh = new RoadMeshRenderer(world.scene, roadSurfaceAt, (id) =>
    clientGrid.profileById(id),
  );
  const bridges = new BridgeRenderer(world.scene, roadSurfaceAt);
  const vehicles = new VehicleRenderer(world.scene, roadSurfaceAt);
  // Bus transit (stop posts + route ribbon + cosmetic buses), service vehicles
  // (fire/police/ambulance from the shared buffer + incident pins), and the
  // district tint/boundary overlay. All fed from the snapshot channels.
  const transitRenderer = new TransitRenderer(world.scene, heightAt);
  const serviceVehicles = new ServiceVehicleRenderer(world.scene, heightAt);
  const districtsRenderer = new DistrictsRenderer(world.scene, heightAt);
  const overlays = new OverlayRenderer(world.scene);
  const idPicker = new IdPicker();

  // World feedback & selection FX.
  const ghosts = new GhostRenderer(world.scene, heightAt);
  const zoneGrid = new ZoneGridRenderer(world.scene, heightAt);
  const lamps = new LampRenderer(world.scene, roadSurfaceAt);
  const roadFurniture = new RoadFurnitureRenderer(world.scene, roadSurfaceAt);
  const selectionOutline = new SelectionOutline(world.scene);
  const mapPin = new MapPin(world.scene);
  const cursorChip = new CursorChipStack(viewport);

  zoneGrid.rebuild(clientGrid); // primes its map size so zone patches apply

  // Landfill facility: dumping-ground tint + trash piles + the entrance office
  // kit. The entrance pick wants streets only (rail gives no frontage). It's a
  // physical facility, not a lens overlay — always visible once painted.
  const landfillRenderer = new LandfillRenderer(world.scene, heightAt, streetAt);
  landfillRenderer.setVisible(true);

  // Building dressing: setback massing tiers, roof props, and road-facing
  // parked cars, all fed the same BuildingDelta stream as BuildingInstancer.
  // They share roadAt so the body setback, its roof props, and the parking
  // bays all agree on which edge faces the street.
  // Lot pads go down before anything that stands on them: the building mass,
  // the parking apron, a driveway. They claim the whole footprint so a block of
  // lots meets edge to edge instead of leaving grass between properties.
  const lots = new LotRenderer(world.scene, heightAt, catalog);
  const massing = new MassingRenderer(world.scene, heightAt, catalog, roadAt);
  const roofProps = new RoofPropRenderer(world.scene, heightAt, catalog, roadAt);
  // Archetype kit: the parts that make a warehouse, a factory, a green works
  // and a shopfront read as different things rather than as boxes of different
  // heights — docks and doors, a monitor roof, a roof array, a canopy and a sign.
  const buildingKit = new BuildingKitRenderer(world.scene, heightAt, catalog, roadAt);
  const parkedCars = new ParkedCarRenderer(world.scene, heightAt, catalog, roadAt, (x, z) =>
    inBounds(x, z)
      ? ((clientGrid.roadTier[z * clientGrid.size + x] ?? 0) as RoadTier)
      : RoadTier.None,
  );
  // Residential house kit: pitched roofs on every detached/row home, plus a
  // garage + street-facing driveway on the larger detached lots (roadAt orients
  // them toward the frontage). Fed the same BuildingDelta stream.
  const houseRoofs = new HouseRoofRenderer(world.scene, heightAt, catalog, roadAt);
  // Cosmetic pedestrians: a few idlers at each bus-stop shelter + a sparse
  // deterministic walker scatter near Active buildings, strolling a small loop
  // on the frontage sidewalk (roadAt) near home. Fed the flattened transit stop
  // list + the same BuildingDelta stream the other renderers get.
  const pedestrianRenderer = new PedestrianRenderer(world.scene, roadSurfaceAt, roadAt);

  // Landmark detail kits: terminal roof monitors,
  // control tower + pulsing beacon, apron plate, parked planes — fed the same
  // BuildingDelta stream as BuildingInstancer, keyed by catalog id.
  const landmarks = new LandmarkRenderer(world.scene, heightAt, catalog);

  // --- camera ----------------------------------------------------------------
  const initialRect = viewport.getBoundingClientRect();
  const camera = new THREE.PerspectiveCamera(
    45,
    Math.max(1, initialRect.width) / Math.max(1, initialRect.height),
    2,
    MAP_SIZE * TILE_METERS * 4,
  );
  handle.onResize((w, h) => {
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  });

  const rig = new CameraRig(camera, heightAt);
  // Boot framing: start closer than the rig's 600m default so the first
  // frame is filled by readable terrain/city, not mostly sky.
  rig.state = {
    ...rig.state,
    targetX: (map.spawn.x + 0.5) * TILE_METERS,
    targetZ: (map.spawn.z + 0.5) * TILE_METERS,
    distance: 380,
  };
  rig.attach(viewport);

  // Dev-only handle for the visual smoke harness: exposes the
  // map layers and a deterministic camera setter so screenshot checks can
  // frame water/edges/regions exactly instead of navigating by dead
  // reckoning. Stripped from production builds by the DEV guard.
  // When set, pins the day/night phase (0..1) so lighting can be screenshotted
  // at an exact time instead of waiting on the sim clock; null = clock-driven.
  let devDayTOverride: number | null = null;
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__slimcity = {
      map,
      setDayT: (t: number | null): void => {
        devDayTOverride = t;
      },
      // yaw/pitch are optional and keep the current angle when omitted. A low
      // pitch is what a screenshot check needs to see a structure edge-on —
      // the default overhead angle hides exactly the faults (a deck sagging at
      // its edges, a prop floating off a kerb) that read instantly from the side.
      setCamera: (
        targetX: number,
        targetZ: number,
        distance: number,
        yaw?: number,
        pitch?: number,
      ): void => {
        rig.state = {
          ...rig.state,
          targetX,
          targetZ,
          distance,
          ...(yaw === undefined ? {} : { yaw }),
          ...(pitch === undefined ? {} : { pitch }),
        };
      },
      setTool: (tool: ToolId): void => {
        useCityStore.getState().setTool(tool);
      },
      setSpeed: (speed: 0 | 1 | 2 | 4): void => {
        useCityStore.getState().setSpeed(speed);
      },
      getStats: (): CityStats => useCityStore.getState().stats,
      setOverlay: (overlay: LensId | null): void => {
        useCityStore.getState().setOverlay(overlay);
      },
      // Deterministic tile-addressed dispatch + grid reader for the visual
      // harness: places roads/buildings/zones by exact tile (no screen
      // picking), and reads back the client grid to pick buildable tiles.
      // Goes through the same command path the tools use (funds/milestone/
      // canPlace all enforced).
      cmd: (label: string, commands: Command[]): void => env.send(label, commands),
      readGrid: (): {
        size: number;
        roadTier: number[];
        roadElevation: number[];
        buildingId: number[];
        zone: number[];
        water: number[];
        height: number[];
      } => ({
        size: clientGrid.size,
        roadTier: Array.from(clientGrid.roadTier),
        // Deck height per tile: lets a screenshot check confirm a span actually
        // rose before it reads anything into the picture of it.
        roadElevation: Array.from(clientGrid.roadElevation),
        buildingId: Array.from(clientGrid.buildingId),
        zone: Array.from(clientGrid.zone),
        water: Array.from(clientGrid.water),
        height: Array.from(clientGrid.height),
      }),
      // Every known building instance with its lifecycle state and problem
      // bits — tells a harness whether lots are failing to spawn, stuck
      // constructing, or spawning and then being abandoned.
      // Lines and their ridership as the worker last reported them: lets a
      // screenshot check confirm a line actually routed and carries anyone
      // before reading anything into a picture of a train.
      readTransit: (): { lines: unknown[]; ridership: number[] } => ({
        lines: useCityStore.getState().transitLines,
        ridership: useCityStore.getState().transitRidership,
      }),
      // Meshes the renderer would submit an empty draw for — no vertices, or
      // an instanced mesh with a count of zero. WebGPU warns on these, and the
      // warning names no object, so this finds the culprit.
      readEmptyDraws: (): { name: string; vertices: number; instances: number }[] => {
        const found: { name: string; vertices: number; instances: number }[] = [];
        world.scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh & { isMesh?: boolean };
          if (!mesh.isMesh) return;
          const position = mesh.geometry?.getAttribute('position');
          const vertices = position ? position.count : 0;
          const instanced = obj as THREE.InstancedMesh & { isInstancedMesh?: boolean };
          const instances = instanced.isInstancedMesh ? instanced.count : 1;
          if (vertices !== 0 && instances !== 0) return;
          // Only meshes that would actually be submitted: an invisible one, or
          // one under an invisible parent, is never drawn and never warns.
          for (let n: THREE.Object3D | null = obj; n; n = n.parent) {
            if (!n.visible) return;
          }
          found.push({ name: mesh.name || mesh.type || 'unnamed', vertices, instances });
        });
        return found;
      },
      // Which archetype parts the kit actually built. A silhouette claim is
      // exactly the kind a screenshot cannot settle on its own.
      readKit: (): Record<string, number> => ({
        loadingDock: buildingKit.instanceCount('loadingDock'),
        rollUpDoors: buildingKit.instanceCount('rollUpDoors'),
        monitorRoof: buildingKit.instanceCount('monitorRoof'),
        roofArray: buildingKit.instanceCount('roofArray'),
        canopy: buildingKit.instanceCount('canopy'),
        signageBand: buildingKit.instanceCount('signageBand'),
      }),
      /** Ids the kit holds parts for, to reconcile against the known buildings. */
      readKitIds: (): number[] => buildingKit.trackedIds(),
      // Where a building's cars actually stand. A parked car and a moving one
      // look alike in a shot, so a screenshot cannot tell whether the kerb rule
      // is being honoured; this can.
      readParking: (
        buildingId: number,
      ): { stalls: number; category: string; northTier: number } | null => {
        const b = knownBuildings.get(buildingId);
        if (!b) return null;
        const entry = catalogById.get(b.catalogId);
        return {
          stalls: parkedCars.stallSlotsFor(buildingId).length,
          category: entry?.category ?? '?',
          // Only the tile north of the origin — NOT the frontage the renderer
          // actually chose, which may be any of the four sides.
          northTier: inBounds(b.x, b.z - 1)
            ? (clientGrid.roadTier[(b.z - 1) * clientGrid.size + b.x] ?? 0)
            : 0,
        };
      },
      // Every piece of kerb furniture, re-derived from where it ACTUALLY
      // stands. Placement code and this audit share no helper on purpose: the
      // positions come from the rendered transforms and the tiles come from the
      // live grid, so a rule that is right about a fixture and wrong about the
      // city it is fed still fails here.
      readKerbAudit: (): {
        cars: {
          total: number;
          offRoad: number;
          junction: number;
          wrongTier: number;
          samples: { id: number; tx: number; tz: number; why: string }[];
        };
        lamps: { total: number; driveways: number; onDriveway: number; samples: number[][] };
        walkers: { total: number; noFrontage: number; wrongAxis: number };
      } => {
        const isRoad = (tx: number, tz: number): boolean =>
          inBounds(tx, tz) && (clientGrid.roadTier[tz * clientGrid.size + tx] ?? 0) !== RoadTier.None;
        const tierOf = (tx: number, tz: number): RoadTier =>
          inBounds(tx, tz)
            ? ((clientGrid.roadTier[tz * clientGrid.size + tx] ?? 0) as RoadTier)
            : RoadTier.None;

        const cars = { total: 0, offRoad: 0, junction: 0, wrongTier: 0 };
        const carSamples: { id: number; tx: number; tz: number; why: string }[] = [];
        for (const building of knownBuildings.values()) {
          const entry = catalogById.get(building.catalogId);
          if (!entry) continue;
          // Only kerbside cars are the street's business — a bay-row car stands
          // on its owner's lot and has no kerb rule to break.
          if (!usesRoadsideParking(entry, building.x, building.z, roadAt, tierOf)) continue;
          for (const stall of parkedCars.stallWorldPositions(building.id)) {
            const tx = worldToTile(stall.x);
            const tz = worldToTile(stall.z);
            cars.total += 1;
            let why = '';
            if (!isRoad(tx, tz)) why = 'off-road';
            else if (!tierAllowsRoadsideParking(tierOf(tx, tz))) why = 'tier';
            else if (
              (isRoad(tx - 1, tz) || isRoad(tx + 1, tz)) &&
              (isRoad(tx, tz - 1) || isRoad(tx, tz + 1))
            )
              why = 'junction';
            if (why === 'off-road') cars.offRoad += 1;
            if (why === 'tier') cars.wrongTier += 1;
            if (why === 'junction') cars.junction += 1;
            if (why && carSamples.length < 8) carSamples.push({ id: building.id, tx, tz, why });
          }
        }

        const lampSamples: number[][] = [];
        let onDriveway = 0;
        for (let slot = 0; slot < lamps.lampCount(); slot += 1) {
          const pole = lamps.polePosition(slot);
          const tx = worldToTile(pole.x);
          const tz = worldToTile(pole.z);
          if (drivewayTiles.has(tx * 100_000 + tz)) {
            onDriveway += 1;
            if (lampSamples.length < 8) lampSamples.push([tx, tz]);
          }
        }

        const walkers = { total: 0, noFrontage: 0, wrongAxis: 0 };
        for (const path of pedestrianRenderer.walkerPathsForAudit()) {
          walkers.total += 1;
          const ax = worldToTile(path.anchor.x);
          const az = worldToTile(path.anchor.z);
          // The anchor stands on the frontage tile, so the street it belongs to
          // is one of the four next door.
          const road = (
            [
              [ax, az - 1],
              [ax + 1, az],
              [ax, az + 1],
              [ax - 1, az],
            ] as const
          ).find(([rx, rz]) => isRoad(rx, rz));
          if (!road) {
            walkers.noFrontage += 1;
            continue;
          }
          const [rx, rz] = road;
          const runsEW = isRoad(rx - 1, rz) || isRoad(rx + 1, rz);
          const runsNS = isRoad(rx, rz - 1) || isRoad(rx, rz + 1);
          if (path.alongX !== (runsEW || !runsNS)) walkers.wrongAxis += 1;
        }

        return {
          cars: { ...cars, samples: carSamples },
          lamps: {
            total: lamps.lampCount(),
            driveways: drivewayTiles.size,
            onDriveway,
            samples: lampSamples,
          },
          walkers,
        };
      },
      // What the transit renderer actually built. A transit vehicle and a
      // traffic-spawned one look alike in a screenshot, so a shot cannot tell
      // whether a line's own vehicles are on the road; this can.
      readTransitRender: (): { lines: number; stops: number; vehicles: number } => ({
        lines: transitRenderer.lineCount(),
        stops: transitRenderer.stopCount(),
        vehicles: transitRenderer.busCount(),
      }),
      readBuildings: (): Array<{
        id: number;
        catalogId: string;
        x: number;
        z: number;
        state: number;
        problems: number;
      }> =>
        Array.from(knownBuildings.values()).map((b) => ({
          id: b.id,
          catalogId: b.catalogId,
          x: b.x,
          z: b.z,
          state: b.state,
          problems: b.problems,
        })),
    };
  }

  // --- sim worker --------------------------------------------------------------
  const worker = new Worker(new URL('./sim/worker.entry.ts', import.meta.url), { type: 'module' });
  const initMsg: MainToWorker = { type: 'init', seed, map };
  worker.postMessage(initMsg);
  if (loadData) {
    const loadMsg: MainToWorker = { type: 'loadSave', data: loadData };
    worker.postMessage(loadMsg, [loadData]);
  }

  const store = useCityStore;
  const queue = new CommandQueue();
  const undoStack = new UndoStack();
  // Stats history (recorded every snapshot) + photo-mode controller.
  const statsHistory = new StatsHistory();
  const photoMode = new PhotoModeController();

  // --- audio ----------------------------------------------------------------------------
  // Shared with the menu screen, so music carries across menu <-> game. The
  // engine stays inert (and silent) until the first gesture unlocks it.
  const { engine: audio, music } = audioRuntime();
  const applyAudioSettings = (settings: GameSettings): void => {
    audio.setMasterVolume(settings.masterVolume, settings.muted);
    audio.setMusicVolume(settings.musicVolume);
    music.setShuffle(settings.musicShuffle);
    music.setRepeat(settings.musicRepeat);
  };
  applyAudioSettings(store.getState().settings);
  const unlockAudio = (): void => audio.unlock();
  window.addEventListener('pointerdown', unlockAudio);
  window.addEventListener('keydown', unlockAudio);
  // Files dropped anywhere on the window join the playlist for this session.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    const files = e.dataTransfer?.files;
    if (!files || files.length === 0) return;
    e.preventDefault();
    if (music.addFiles(Array.from(files)) > 0) audio.play('notify');
  });
  /** The dedicated renderers show only when their lens/tool is live. */
  const refreshEpicVisibility = (): void => {
    const { overlay, selectedTool } = store.getState();
    transitRenderer.setVisible(overlay === 'transit' || selectedTool.startsWith('transit.'));
    districtsRenderer.setVisible(overlay === 'districts' || selectedTool === 'district.paint');
  };
  refreshEpicVisibility(); // start hidden until their lens/tool is selected
  /** seq -> the player edit awaiting its ack (drives the undo stack). */
  const pendingEdits = new Map<number, { label: string; forward: Command[] }>();
  /** seqs of undo/redo replays: acked, but never re-recorded as new edits. */
  const silentSeqs = new Set<number>();
  /** Client-side mirror of building instances, for select-tool info panels. */
  const knownBuildings = new Map<number, BuildingInstance>();
  /**
   * Road tiles a lot's driveway crosses, keyed the way lamps.ts keys tiles.
   * Kerb furniture keeps off these — a lamp in a car park entrance stands in
   * the middle of the way in. Rebuilt whenever the building set changes, which
   * is also when the lamps have to be rebuilt to notice.
   */
  let drivewayTiles: ReadonlySet<number> = new Set();
  let latestRoadTiles: ReturnType<typeof clientGrid.roadTiles> = [];
  /** Counts down to the next advisor re-rank (see ADVISOR_REFRESH_SNAPSHOTS). */
  let snapshotsSinceAdvice = 0;
  /** Latest flattened transit stop tile-points, mirrored so pedestrian
   * idlers can be re-applied on building-only deltas (PedestrianRenderer does
   * not cache stops itself — same pattern as knownBuildings above). */
  let latestStopPoints: StopIdleInput[] = [];
  const autoSaver = new AutoSaver(() => saveNow(worker));

  let snapshotAgeMs = 0;
  let overlayAgeMs = 0;
  /** Last calendar month pushed into TreeRenderer.setSeason (0 = never). */
  let lastSeasonMonth = 0;
  /** Latest snapshot-derived clock values, consumed by the frame loop's
   * water/cloud updates (WaterRenderer wants nightFactor; CloudLayer wants
   * the sim tick + time-of-day for its coverage/tint). */
  let lastTick = 0;
  let lastDayT = 0.5;
  let lastNightFactor = timeOfDayColors(lastDayT).nightFactor;

  const postCommands = (commands: Command[], silent: boolean): number => {
    const seq = queue.push(commands);
    if (silent) silentSeqs.add(seq);
    const msg: MainToWorker = { type: 'commands', seq, commands };
    worker.postMessage(msg);
    return seq;
  };

  // Sandbox setting is applied as a worker command (not init state), so it
  // takes effect immediately whether carried over from Options or toggled
  // live mid-game (see bindActions' onSettings below).
  if (store.getState().settings.sandboxUnlockAll) {
    postCommands([{ kind: 'setSandbox', on: true }], true);
  }
  if (store.getState().settings.unlimitedMoney) {
    postCommands([{ kind: 'setUnlimitedMoney', on: true }], true);
  }

  const syncUndoState = (): void => {
    store.getState().setUndoState(undoStack.canUndo(), undoStack.canRedo());
  };

  const undo = (): void => {
    const commands = undoStack.undo();
    if (commands && commands.length > 0) postCommands(commands, true);
    syncUndoState();
  };

  const redo = (): void => {
    const commands = undoStack.redo();
    if (commands && commands.length > 0) postCommands(commands, true);
    syncUndoState();
  };

  // --- screen -> world -> tile picking ----------------------------------------
  const groundPointAt = (px: number, py: number): { x: number; z: number } | null => {
    const rect = viewport.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    camera.updateMatrixWorld(true);
    const ndcX = (px / rect.width) * 2 - 1;
    const ndcY = -(py / rect.height) * 2 + 1;
    const near = new THREE.Vector3(ndcX, ndcY, -1).unproject(camera);
    const far = new THREE.Vector3(ndcX, ndcY, 1).unproject(camera);
    const dir = far.sub(near);

    // Iteratively refine a ray/heightfield intersection: start on the y=0
    // plane, then re-solve against the terrain height under each hit.
    let hitX = 0;
    let hitZ = 0;
    let groundY = 0;
    for (let i = 0; i < 3; i++) {
      const denom = Math.abs(dir.y) < 1e-6 ? (dir.y < 0 ? -1e-6 : 1e-6) : dir.y;
      const t = (groundY - near.y) / denom;
      if (t < 0) return null; // looking away from the ground
      hitX = near.x + dir.x * t;
      hitZ = near.z + dir.z * t;
      groundY = heightAt(hitX, hitZ);
    }
    return { x: hitX, z: hitZ };
  };

  const screenToTile = (sx: number, sy: number): TilePoint | null => {
    const p = groundPointAt(sx, sy);
    if (!p) return null;
    const x = worldToTile(p.x);
    const z = worldToTile(p.z);
    return inBounds(x, z) ? { x, z } : null;
  };

  // Second half of the dev-only __slimcity smoke hook (the first half is
  // declared above, before screenToTile exists): pixel->tile
  // picking so screenshot scripts can aim tools at exact tiles instead of
  // dead-reckoning the camera projection. Stripped from production builds.
  if (import.meta.env.DEV) {
    const hook = (window as unknown as Record<string, unknown>).__slimcity;
    if (hook && typeof hook === 'object') {
      (hook as Record<string, unknown>).screenToTile = screenToTile;
      // Audio can only be judged in a real browser (jsdom has no WebAudio and
      // no playback), so tools/audio-check.mjs drives it through here.
      (hook as Record<string, unknown>).audio = { engine: audio, music };
    }
  }

  // --- tools -------------------------------------------------------------------
  const roadSpecByTier = new Map<number, RoadSpec>(roadSpecs.map((s) => [s.tier, s]));
  const catalogById = new Map<string, BuildingCatalogEntry>(catalog.map((e) => [e.id, e]));

  /** Ghost tint/decoration family for the active tool. */
  /**
   * Road tiers where direction is a real property of the road rather than a
   * drawing artifact: a one-way street, and a highway whose carriageways run
   * opposite ways. These get flow arrows on the placement ghost.
   */
  const isDirectionalTier = (tier: RoadTier): boolean =>
    tier === RoadTier.Highway || roadSpecByTier.get(tier)?.oneWay === true;

  const ghostKindFor = (tool: ToolId): GhostKind => {
    if (tool === 'bulldoze') return 'bulldoze';
    if (tool.startsWith('road.')) return 'road';
    if (tool.startsWith('zone.')) return 'zone';
    // District paint reads as a zone-style tint; transit stops read as a road path.
    if (tool === 'district.paint') return 'zone';
    if (tool.startsWith('transit.')) return 'road';
    return 'plop';
  };

  const env: ToolEnv = {
    screenToTile,
    send: (label, commands) => {
      const seq = postCommands(commands, false);
      pendingEdits.set(seq, { label, forward: commands });
    },
    roadSpec: (tier: RoadTier): RoadSpec => {
      const spec = roadSpecByTier.get(tier);
      if (!spec) throw new Error(`No road spec for tier ${tier}`);
      return spec;
    },
    profileIdFor: (profile) => clientGrid.profileIdFor(profile),
    entry: (catalogId: string) => catalogById.get(catalogId),
    onPreview: (preview) => {
      store
        .getState()
        .setPreview(
          preview ? { cost: preview.cost, label: preview.label, valid: preview.valid } : null,
        );
      if (preview) {
        // Plop volume ghost: for plop tools, look up the catalog entry
        // and pass the rotation-aware footprint volume (the preview tiles ARE
        // footprintTiles(origin, entry, rotation), so their bounding rect is
        // the rotated w×d and its min corner is the origin tile).
        let opts: SetPreviewOptions | undefined;
        const tool = toolManager.tool;
        // Zone previews: tint the ghost with the zone being painted (R/C/I),
        // so the preview color matches the tiles it will lay down.
        if (tool.startsWith('zone.')) {
          const zone = ZONE_TOOL_TO_TYPE[tool];
          if (zone !== undefined) opts = { zone };
        }
        // Direction arrows while dragging a road whose direction is real. A
        // one-way or a highway laid the wrong way round is otherwise only
        // obvious once there is traffic on it.
        const previewTier = ROAD_TOOL_TO_TIER[tool];
        if (previewTier !== undefined && isDirectionalTier(previewTier)) {
          opts = { ...opts, flowArrows: true };
        }
        if (tool.startsWith('plop.') && preview.tiles.length > 0) {
          const entry = catalogById.get(tool.slice('plop.'.length));
          if (entry) {
            let minX = Infinity;
            let minZ = Infinity;
            let maxX = -Infinity;
            let maxZ = -Infinity;
            for (const t of preview.tiles) {
              if (t.x < minX) minX = t.x;
              if (t.x > maxX) maxX = t.x;
              if (t.z < minZ) minZ = t.z;
              if (t.z > maxZ) maxZ = t.z;
            }
            opts = {
              volume: {
                w: maxX - minX + 1,
                d: maxZ - minZ + 1,
                heightMeters: entry.height,
                originTile: { x: minX, z: minZ },
              },
            };
          }
        }
        ghosts.setPreview(preview.tiles, preview.valid, ghostKindFor(tool), opts);
        cursorChip.setChip({
          cost: preview.cost,
          lengthMeters: preview.lengthMeters,
          invalidReason: preview.invalidReason,
        });
      } else {
        ghosts.clear();
        cursorChip.setChip(null);
      }
    },
    // Cursor-chip invalid reasons: live funds/milestone from the
    // store; geometric overlap from the client grid mirror, plop tools only
    // (roads may overlap roads to upgrade, bulldoze/zones overlap by design).
    funds: () => store.getState().stats.funds,
    milestoneLevel: () => store.getState().stats.milestoneLevel,
    canPlace: (tiles) =>
      store.getState().selectedTool.startsWith('plop.') ? clientGrid.isFreeForPlop(tiles) : true,
    // Terraform hooks: the Level tool's drag-start height sample (tile
    // center, same anchor the camera/buildings use) and the road/building
    // structure-exclusion check backing the brush validity chip.
    heightAt: (tile) => heightAt(tileToWorld(tile.x), tileToWorld(tile.z)),
    hasStructure: (tile) => {
      if (!inBounds(tile.x, tile.z)) return false;
      const i = tile.z * clientGrid.size + tile.x;
      return clientGrid.roadTier[i] !== RoadTier.None || clientGrid.buildingId[i] !== 0;
    },
  };
  const toolManager = new ToolManager(env);
  toolManager.setBrush(store.getState().brushSettings);

  /** Committed edits also trim cosmetic trees locally (the sim owns g.trees). */
  const clearTreesFor = (commands: Command[]): void => {
    for (const command of commands) {
      if (command.kind === 'bulldoze' || command.kind === 'buildRoad') {
        trees.clearAt(command.tiles);
      } else if (command.kind === 'placeBuilding') {
        const entry = catalogById.get(command.catalogId);
        if (entry) {
          trees.clearAt(footprintTiles({ x: command.x, z: command.z }, entry, command.rotation));
        }
      }
    }
  };

  // --- worker messages -----------------------------------------------------------
  const onAck = (ack: CommandAck): void => {
    if (silentSeqs.has(ack.seq)) {
      silentSeqs.delete(ack.seq);
      syncUndoState();
      return;
    }
    const edit = pendingEdits.get(ack.seq);
    if (!edit) return;
    pendingEdits.delete(ack.seq);
    if (ack.ok) {
      undoStack.push({
        label: edit.label,
        forward: edit.forward,
        inverse: ack.inverse,
        cost: ack.cost,
      });
      clearTreesFor(edit.forward);
      syncUndoState();
      audio.play('build');
    } else {
      audio.play('denied');
      store.getState().pushNotification({
        id: -ack.seq,
        severity: 'warning',
        title: `${edit.label} failed`,
        body:
          ack.reason === 'funds'
            ? 'Not enough funds.'
            : ack.reason === 'locked'
              ? 'Not unlocked at this milestone yet.'
              : 'That cannot be built there.',
        tick: store.getState().stats.tick,
      });
    }
  };

  const onSnapshot = (snap: SimSnapshot): void => {
    const state = store.getState();
    state.applySnapshotStats(snap.stats);
    autoSaver.onSnapshotTick(snap.stats.tick);

    // Record every snapshot's stats into the ring buffer and publish the
    // oldest-first samples for the StatsPanel charts.
    statsHistory.record(snap.stats);
    state.setStatsSamples(statsHistory.samples());

    // The advisor re-ranks on a slow cadence: iterating the building mirror is
    // cheap, but a problem list that reshuffles ten times a second is unreadable.
    if (++snapshotsSinceAdvice >= ADVISOR_REFRESH_SNAPSHOTS) {
      snapshotsSinceAdvice = 0;
      state.setAdvisorIssues(cityIssues(knownBuildings.values(), snap.stats));
    }

    // Visual day/night runs on VISUAL_DAY_TICKS, decoupled
    // from the calendar day and consistent with the status-strip clock —
    // both shift by CLOCK_START_OFFSET_TICKS so tick 0 = 09:00 morning light
    // (ui/format.ts formatClock applies the identical offset).
    const dayT =
      devDayTOverride ??
      ((snap.stats.tick + CLOCK_START_OFFSET_TICKS) % VISUAL_DAY_TICKS) / VISUAL_DAY_TICKS;
    world.setTimeOfDay(dayT);
    const colors = timeOfDayColors(dayT);
    const nightFactor = colors.nightFactor;
    // The soundscape rides the same clock and city size the visuals do. The
    // engine glides between mixes, so updating per snapshot never steps.
    audio.setAmbient(
      ambientMix({ hour: dayT * 24, population: snap.stats.population, nightFactor }),
    );
    // The water surface mirrors the same sky ramp the dome uses.
    water.setSkyColors(colors.skyZenithColor, colors.skyHorizonColor);
    lastTick = snap.stats.tick;
    lastDayT = dayT;
    // Lot occupancy follows the clock: shops fill for trading hours, industry
    // keeps a late shift, and both empty out overnight.
    parkedCars.setDayFraction(dayT);
    lastNightFactor = nightFactor;
    instancer.setNightFactor(nightFactor);
    massing.setNightFactor(nightFactor);
    roofProps.setNightFactor(nightFactor);
    houseRoofs.setNightFactor(nightFactor);
    roadsMesh.setNightFactor(nightFactor); // dim the unlit road so lamp pools stay the bright spots
    lamps.setTimeOfDay(dayT); // lamps run their own dusk-to-dawn schedule, not the night ramp
    vehicles.setNightFactor(nightFactor);
    landmarks.setNightFactor(nightFactor);
    utilityKits.setNightFactor(nightFactor);

    // Seasonal foliage tint: only touch materials when the
    // calendar month actually changes.
    const month = tickToDate(snap.stats.tick).month;
    if (month !== lastSeasonMonth) {
      lastSeasonMonth = month;
      trees.setSeason(month);
    }

    // Terraform/undo/loadSave height patches -> terrain chunk rebuilds.
    // Auto-flatten: the client grid mirror must also absorb the
    // patches so ZoneGridRenderer.rebuild's slope-buildable check (which reads
    // clientGrid.height) conforms to the freshly flattened terrain. Rebuild
    // the zone grid here too, since a flatten can arrive in a snapshot with no
    // road/zone delta (e.g. a building footprint flatten).
    if (snap.heightPatches && snap.heightPatches.length > 0) {
      terrain.applyHeightPatches(snap.heightPatches);
      clientGrid.applyHeightPatches(snap.heightPatches);
      zoneGrid.rebuild(clientGrid);
      // Roads sample terrain height at build time: any height change under or
      // beside an existing road (terraform, building auto-flatten, a neighbor
      // run's grading) must rebuild the affected road chunks, or their
      // geometry keeps stale heights (buried edges / floating caps).
      roadsMesh.invalidateHeights(snap.heightPatches);
    }
    // The profile table lands before the road deltas that refer into it.
    if (snap.roadProfiles) clientGrid.applyRoadProfiles(snap.roadProfiles);
    if (snap.roads) {
      // The mirror goes first. The road mesh samples roadSurfaceAt, which reads
      // deck heights back out of the mirror — meshing before those land lays
      // the carriageway on the ground underneath its own bridge.
      const raised = clientGrid.applyRoadDeltas(snap.roads);
      roadsMesh.apply(snap.roads);
      // Tiles beside a deck sample the ramp blend but carry no delta of their
      // own, so their geometry only rebuilds if we ask for it.
      if (raised.length > 0)
        roadsMesh.invalidateHeights(raised.map((t) => ({ x: t.x, z: t.z, w: 1, h: 1 })));
      zoneGrid.rebuild(clientGrid);
      const roadTiles = clientGrid.roadTiles();
      latestRoadTiles = roadTiles;
      lamps.rebuild(roadTiles, drivewayTiles);
      roadFurniture.rebuild(roadTiles);
      bridges.rebuild(clientGrid.deckTiles());
      // Ground cover follows the road only where the road touches the ground —
      // a mown band under a bridge would be a stripe of lawn across a river.
      terrain.applyRoadTiles(roadTiles.filter((t) => !t.elevated));
    }
    if (snap.buildings) {
      lots.apply(snap.buildings);
      instancer.apply(snap.buildings);
      massing.apply(snap.buildings);
      roofProps.apply(snap.buildings);
      buildingKit.apply(snap.buildings);
      houseRoofs.apply(snap.buildings);
      parkedCars.apply(snap.buildings);
      landmarks.apply(snap.buildings);
      utilityKits.apply(snap.buildings);
      // Walker scatter tracks the Active-building set incrementally; feed it
      // the same delta (idlers ride the last-known stop list).
      pedestrianRenderer.apply({ stops: latestStopPoints, buildings: snap.buildings });
      clientGrid.applyBuildingDelta(snap.buildings, (catalogId) => catalogById.get(catalogId));
      for (const inst of snap.buildings.added) knownBuildings.set(inst.id, inst);
      for (const inst of snap.buildings.updated) knownBuildings.set(inst.id, inst);
      for (const id of snap.buildings.removed) knownBuildings.delete(id);

      // A lot's driveway is decided by its building, so the tiles kerb furniture
      // must avoid change with the building set, not with the roads.
      const nextDriveways = new Set<number>();
      for (const inst of knownBuildings.values()) {
        const entry = catalogById.get(inst.catalogId);
        if (!entry) continue;
        const cut = curbCutTileFor(entry, inst.x, inst.z, roadAt);
        if (cut) nextDriveways.add(cut.x * 100_000 + cut.z);
      }
      if (!sameTileKeySet(nextDriveways, drivewayTiles)) {
        drivewayTiles = nextDriveways;
        if (latestRoadTiles.length > 0) lamps.rebuild(latestRoadTiles, drivewayTiles);
      }

      const selected = state.selectedBuilding;
      if (selected) {
        const current = knownBuildings.get(selected.id) ?? null;
        if (current !== selected) state.setSelectedBuilding(current);
      }
    }
    if (snap.zones) {
      zoneGrid.applyZonePatches(snap.zones);
      clientGrid.applyZonePatches(snap.zones);
    }
    if (snap.power) overlays.setCoverage('power', snap.power);
    if (snap.watered) overlays.setCoverage('watered', snap.watered);
    if (snap.vehicles) {
      vehicles.setBuffer(snap.vehicles);
      // Service vehicles share the SAME buffer (kind-filtered), no copy.
      serviceVehicles.setBuffer(snap.vehicles);
      snapshotAgeMs = 0;
    }
    // Bus transit: rebuild stops/ribbon/buses + publish the line list.
    if (snap.transit) {
      transitRenderer.apply(snap.transit);
      state.setTransit(snap.transit.lines, snap.transit.ridership);
      // Refresh the idler crowd from the current stop set (walkers keep
      // their incrementally-tracked building set; an empty delta leaves it be).
      // Enrich each stop with its shelter's ground anchor (the same
      // heading/side the TransitRenderer builds the shelter from) so idle
      // pedestrians cluster at the shelter on the sidewalk instead of on the
      // carriageway.
      latestStopPoints = snap.transit.lines.flatMap((l) => {
        const pts = toWorldPoints(l.stops);
        return l.stops.map((s, i) => {
          const layout = computeShelterLayout(
            pts[i]!,
            computeStopHeading(pts, i),
            shelterSide(s.x, s.z),
          );
          return { x: s.x, z: s.z, anchor: layout.benchCenter };
        });
      });
      pedestrianRenderer.apply({
        stops: latestStopPoints,
        buildings: snap.buildings ?? { added: [], removed: [], updated: [] },
      });
    }
    // Incidents: place/clear the marker pins (empty array clears them).
    serviceVehicles.setIncidents(snap.incidents ?? []);
    // Districts: fold patches into the tint/boundary overlay + publish defs.
    if (snap.districts) {
      districtsRenderer.applyDistrictPatches(snap.districts.patches, snap.districts.defs);
      if (snap.districts.defs.length > 0) state.setDistricts(snap.districts.defs);
    }
    // Garbage: landfill-area tint + trash piles, and feed the 'trash' coverage lens.
    if (snap.garbage) {
      landfillRenderer.apply(snap.garbage);
      if (snap.garbage.trash) overlays.setCoverage('trash', snap.garbage.trash);
    }
  };

  worker.onmessage = (ev: MessageEvent<WorkerToMain>) => {
    const msg = ev.data;
    switch (msg.type) {
      case 'ready':
        break;
      case 'ack':
        onAck(msg.ack);
        break;
      case 'snapshot':
        onSnapshot(msg.snap);
        break;
      case 'field':
        overlays.setFieldData(msg.field, msg.data);
        break;
      case 'save':
        void storeSave(msg.data).then((header) => {
          store.getState().pushNotification({
            id: header.savedAt,
            severity: 'info',
            title: 'Game saved',
            body: `${header.mapName} — tick ${header.tick}`,
            tick: store.getState().stats.tick,
          });
        });
        break;
      case 'notify':
        store.getState().pushNotification(msg.note);
        break;
      case 'selection':
        store.getState().setSelectionInfo(msg.info);
        break;
    }
  };

  // --- UI store bridge -------------------------------------------------------------
  // Photo mode: flips the wider photo-mode camera bounds + hides chrome
  // (via the store flag App reads). Exit restores the captured gameplay state.
  const togglePhoto = (): void => {
    const result = photoMode.toggle(rig.state);
    if (result) rig.state = result;
    store.getState().setPhotoMode(photoMode.chromeHidden);
  };

  store.getState().bindActions({
    sendCommands: (label, commands) => env.send(label, commands),
    undo,
    redo,
    setSpeed: (speed) => {
      const msg: MainToWorker = { type: 'setSpeed', speed };
      worker.postMessage(msg);
    },
    togglePhoto,
    saveGame: () => saveNow(worker),
    onSettings: (patch) => {
      if (patch.sandboxUnlockAll !== undefined) {
        postCommands([{ kind: 'setSandbox', on: patch.sandboxUnlockAll }], true);
      }
      if (patch.unlimitedMoney !== undefined) {
        postCommands([{ kind: 'setUnlimitedMoney', on: patch.unlimitedMoney }], true);
      }
      applyAudioSettings(store.getState().settings);
    },
    // Advisor "show me": drop the camera on a tile, keeping the player's own
    // zoom. Render-side only — the sim never hears about it.
    focusTile: (x, z) => {
      rig.state = { ...rig.state, targetX: tileToWorld(x), targetZ: tileToWorld(z) };
    },
  });

  const requestField = (field: FieldId): void => {
    const msg: MainToWorker = { type: 'requestField', field };
    worker.postMessage(msg);
  };

  /**
   * Selection side effects: keep the worker's selection
   * stream, the green outline shell, and the roof map-pin in step with
   * store.selectedBuilding, however it changes (click, ESC, panel close,
   * demolition via snapshot).
   */
  const syncSelection = (
    building: BuildingInstance | null,
    previous: BuildingInstance | null,
  ): void => {
    if (!building) {
      if (previous) {
        const msg: MainToWorker = { type: 'clearSelect' };
        worker.postMessage(msg);
      }
      store.getState().setSelectionInfo(null);
      selectionOutline.highlight(null);
      mapPin.hide();
      return;
    }
    if (!previous || previous.id !== building.id) {
      if (previous) store.getState().setSelectionInfo(null); // drop the old building's rows
      const msg: MainToWorker = { type: 'select', buildingId: building.id };
      worker.postMessage(msg);
    }
    const entry = catalogById.get(building.catalogId);
    if (!entry) return;
    // Same ground-center anchor BuildingInstancer computes per instance
    // (outline.ts documents this contract).
    const centerX = (building.x + entry.footprint.w / 2) * TILE_METERS;
    const centerZ = (building.z + entry.footprint.d / 2) * TILE_METERS;
    const groundY = heightAt(centerX, centerZ);
    selectionOutline.highlight({
      position: { x: centerX, y: groundY, z: centerZ },
      footprint: entry.footprint,
      height: entry.height,
    });
    mapPin.showAt(centerX, groundY + entry.height, centerZ);
  };

  store.subscribe((state, prev) => {
    if (state.selectedTool !== prev.selectedTool) {
      toolManager.setTool(state.selectedTool);
      audio.play('click');
      // Zoning grid layer while a zone tool is in hand — and for the landfill
      // brush, which paints into the same road-frontage grid.
      zoneGrid.setVisible(
        state.selectedTool.startsWith('zone.') || state.selectedTool === 'landfill.paint',
      );
      // The dedicated overlays follow tool selection too.
      refreshEpicVisibility();
    }
    if (state.selectedDistrict !== prev.selectedDistrict) {
      toolManager.setDistrictId(state.selectedDistrict); // paint target
    }
    if (state.toolFlags !== prev.toolFlags) {
      toolManager.setFlags(state.toolFlags);
    }
    if (state.roadElevation !== prev.roadElevation) {
      toolManager.setRoadElevation(state.roadElevation); // viaduct height stepper
    }
    if (state.roadProfileEdits !== prev.roadProfileEdits) {
      toolManager.setProfileEdits(state.roadProfileEdits); // the Profile row's parking/bike/footway choices
    }
    if (state.brushSettings !== prev.brushSettings) {
      toolManager.setBrush(state.brushSettings); // Brush radius / Strength rows
    }
    if (state.overlay !== prev.overlay) {
      overlays.setActive(state.overlay);
      // Transit/district lenses drive their dedicated renderers, not the overlay quad.
      refreshEpicVisibility();
      // Only FieldId lenses use the requestField round trip; 'power'/'watered'
      // coverage arrives pushed in snapshots and repaints from its cache.
      if (typeof state.overlay === 'number') requestField(state.overlay);
    }
    if (state.selectedBuilding !== prev.selectedBuilding) {
      syncSelection(state.selectedBuilding, prev.selectedBuilding);
    }
  });

  // --- pointer routing ---------------------------------------------------------------
  const localXY = (e: PointerEvent): { x: number; y: number } => {
    const rect = viewport.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  // The current sim tick rides along on pointer events so continuous
  // terraform brushing throttles against deterministic game time.
  viewport.addEventListener('pointerdown', (e) => {
    const { x, y } = localXY(e);
    toolManager.pointerDown(x, y, e.button, store.getState().stats.tick);
  });

  viewport.addEventListener('pointermove', (e) => {
    const { x, y } = localXY(e);
    cursorChip.setPointer(x, y);
    toolManager.pointerMove(x, y, (e.buttons & 1) !== 0 ? 0 : -1, store.getState().stats.tick);
  });

  viewport.addEventListener('pointerup', (e) => {
    const { x, y } = localXY(e);
    const consumed = toolManager.pointerUp(x, y, e.button);
    if (consumed || e.button !== 0) return;

    // Select tool: pick a building under the cursor.
    const rect = viewport.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const ndc = new THREE.Vector2((x / rect.width) * 2 - 1, -(y / rect.height) * 2 + 1);
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);
    const id = idPicker.pickBuilding(raycaster, instancer);
    store.getState().setSelectedBuilding(id !== null ? (knownBuildings.get(id) ?? null) : null);
  });

  // --- keyboard -------------------------------------------------------------------------
  let lastRunningSpeed: 1 | 2 | 4 = 1;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      const { speed, setSpeed } = store.getState();
      if (speed === 0) {
        setSpeed(lastRunningSpeed);
      } else {
        lastRunningSpeed = speed;
        setSpeed(0);
      }
      return;
    }
    if (e.code === 'Escape') {
      // Photo mode owns Escape first: exit + restore the gameplay camera,
      // and consume the press so the staged escape stack below doesn't also run.
      const restored = photoMode.handleKeyDown(e);
      if (restored) {
        rig.state = restored;
        store.getState().setPhotoMode(photoMode.chromeHidden);
        e.preventDefault();
        return;
      }
      // Staged escape stack, stage 1: cancel an active drag and
      // consume the press (preventDefault marks it consumed for App.tsx's
      // later-registered listener, which owns stage 2 — close the drawer —
      // and stage 3 — deselect tool/building).
      if (toolManager.dragActive) {
        toolManager.cancel();
        e.preventDefault();
      }
      return;
    }
    if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) {
      toolManager.rotatePlop();
      return;
    }
    // Road elevation, on the keys every builder reaches for. Live mid-drag: the
    // ghost re-solves its profile on the next preview, so the span can be
    // raised or dropped while it is being drawn. Ground is the floor until
    // there is somewhere below it to go.
    if ((e.code === 'PageUp' || e.code === 'PageDown') && ROAD_TOOL_TO_TIER[toolManager.tool]) {
      e.preventDefault();
      const state = store.getState();
      const step = e.code === 'PageUp' ? ROAD_ELEVATION_STEP_M : -ROAD_ELEVATION_STEP_M;
      state.setRoadElevation(state.roadElevation + step);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') {
      e.preventDefault();
      redo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
      e.preventDefault();
      saveNow(worker);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyL') {
      e.preventDefault();
      void loadLatest(worker);
      return;
    }
    const tool = CATEGORY_HOTKEYS[e.code];
    if (tool && !e.ctrlKey && !e.metaKey && !e.altKey) {
      store.getState().setTool(tool);
    }
  });

  // --- UI ------------------------------------------------------------------------------
  mountUi(uiRoot);
  useCityStore.getState().setScreen('playing');

  // --- bloom post-process ------------------------------------------
  // Wraps the plain renderer.render(scene, camera) so emissive windows, lamp
  // heads, and vehicle lights bleed softly at night. createBloomPipeline
  // is self-degrading (it catches a failed node-graph build or first-frame
  // render and permanently falls back to a direct scene render), but we also
  // guard construction itself so a throw here can never abort boot — the frame
  // loop then renders straight through handle.renderer.
  let bloomPipeline: BloomPipeline | null = null;
  // DEV-only escape hatch: `?nobloom` skips the
  // post-process pipeline whose per-frame GPU readback destabilises headless
  // software rendering (swiftshader) during long screenshot sessions. Never
  // affects production — the query param is only read under import.meta.env.DEV.
  const bloomDisabled = import.meta.env.DEV && new URLSearchParams(location.search).has('nobloom');
  if (!bloomDisabled) {
    try {
      bloomPipeline = createBloomPipeline(handle.renderer, world.scene, camera);
    } catch (err) {
      console.warn('SlimCity: bloom pipeline unavailable, rendering without post-FX:', err);
      bloomPipeline = null;
    }
  }
  // Bloom intensity at full night; scales linearly with nightFactor so it
  // fades in on the same dusk ramp as the emissive materials it blooms. Kept
  // deliberately low: the additive bloom node (bloom.ts, scenePassColor + bloom)
  // is combined on top of already-bright emissive windows/lamp heads, so higher
  // values (1.0+) blow the whole night scene to white. Lamps get their heavier
  // glow from hotter emitters (lamps.ts), not from raising this — that would
  // blow out the windows this level is tuned for.
  const BLOOM_NIGHT_STRENGTH = 0.25;

  // --- frame loop -------------------------------------------------------------------------
  let visualSeconds = 0; // elapsed visual time for the outline pulse / pin bob
  handle.start((dtMs) => {
    rig.update(dtMs);
    // Shadow sweep: keep the limited-span sun shadow frustum centred on the
    // camera target so lamp/prop/pedestrian shadows stay resolved on screen.
    world.setShadowFocus(rig.state.targetX, rig.state.targetZ);
    terrain.update();
    water.update(dtMs, lastNightFactor);
    clouds.update(dtMs, lastTick, lastDayT);

    snapshotAgeMs += dtMs;
    const vehicleAlpha = Math.min(1, snapshotAgeMs / SNAPSHOT_INTERVAL_MS);
    vehicles.update(vehicleAlpha);
    serviceVehicles.update(vehicleAlpha); // same interpolation alpha as VehicleRenderer
    transitRenderer.update(dtMs / 1000); // buses run on real elapsed seconds

    visualSeconds += dtMs / 1000;
    selectionOutline.update(visualSeconds);
    mapPin.update(visualSeconds);
    landmarks.update(visualSeconds * 1000); // tower-beacon pulse (elapsed visual ms)
    utilityKits.update(visualSeconds * 1000); // wind-turbine rotor spin
    pedestrianRenderer.update(visualSeconds * 1000); // walker walk-cycle (same accumulated-tMs clock)

    overlayAgeMs += dtMs;
    if (overlayAgeMs >= OVERLAY_REFRESH_MS) {
      overlayAgeMs = 0;
      const overlay = store.getState().overlay;
      // FieldId lenses only — coverage lenses are push-fed (see subscription).
      if (typeof overlay === 'number') requestField(overlay);
    }

    if (bloomPipeline && useCityStore.getState().settings.bloom) {
      bloomPipeline.setStrength(lastNightFactor * BLOOM_NIGHT_STRENGTH);
      bloomPipeline.render();
    } else {
      handle.renderer.render(world.scene, camera);
    }
  });
}

async function main(): Promise<void> {
  const session = readAppSession();
  if (session.screen === 'playing') {
    await startGame(session);
    return;
  }
  // Menu-only boot: mount the UI (App renders the StartMenu when
  // screen === 'menu'); no world/worker exists until New/Load Game reloads
  // into startGame() above.
  const uiRoot = document.getElementById('ui-root');
  if (!uiRoot) throw new Error('SlimCity: #ui-root missing');
  const store = useCityStore.getState();
  store.setScreen('menu');
  store.bindActions({
    sendCommands: () => {},
    undo: () => {},
    redo: () => {},
    setSpeed: () => {},
    togglePhoto: () => {},
    saveGame: () => {},
    onSettings: () => {},
    focusTile: () => {},
  });
  mountUi(uiRoot);
}

void main().catch((err: unknown) => {
  console.error('SlimCity failed to boot:', err);
});
