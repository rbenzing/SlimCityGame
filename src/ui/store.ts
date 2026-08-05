/**
 * Central UI state. Pure zustand store — no DOM/three.js here.
 * The render/worker integration ("main") owns the actual ToolManager, the
 * UndoStack, and the worker connection; it wires them to this store via
 * `bindActions` and by calling the setter actions below (applySnapshotStats
 * on each SimSnapshot, setUndoState after every push/undo/redo, etc).
 */
import { create } from 'zustand';
import { DEFAULT_TAX_RATE, START_FUNDS, TICKS_PER_MONTH } from '../shared/constants';
import type {
  BrushSettings,
  BuildingInstance,
  CityNotification,
  CityStats,
  Command,
  District,
  LensId,
  Policy,
  SelectionInfo,
  SimSpeed,
  ToolFlags,
  ToolId,
  TransitLine,
} from '../shared/types';
import { DEFAULT_BRUSH_SETTINGS } from '../tools/tools';
import type { StatsSample } from './statshistory';
import { type GameSettings, loadSettings, saveSettings } from '../app/session';

const MAX_NOTIFICATIONS = 50;

/** Live cost/validity readout for the tool currently being hovered/dragged. */
export interface PreviewInfo {
  cost: number;
  label: string;
  valid: boolean;
}

/**
 * Imperative dispatch bridge from UI event handlers into the integration
 * layer that owns the worker connection and the UndoStack. Supplied once via
 * `bindActions`; until then, calls through it (e.g. `setSpeed`) are no-ops.
 */
export interface BoundActions {
  sendCommands: (label: string, commands: Command[]) => void;
  undo: () => void;
  redo: () => void;
  setSpeed: (speed: SimSpeed) => void;
  /** Photo mode: toggles the render-thread PhotoModeController + camera. */
  togglePhoto: () => void;
  /** Saves the current game (in-game menu "Save Game"); no-op with no worker. */
  saveGame: () => void;
  /** Applies side effects of a settings change (e.g. sandbox → worker command). Persistence itself is handled by the store. */
  onSettings: (patch: Partial<GameSettings>) => void;
}

/**
 * Segmented "Tool Mode" control, road tools only right now:
 * `L-path` is the existing two-leg drag; `Straight` locks to a single axis.
 * Changing it also mirrors into `toolFlags.straightMode`, the shape
 * ToolManager's contract (shared/types.ts `ToolFlags`) actually consumes.
 */
export type ToolMode = 'straight' | 'lpath';

export function createInitialToolFlags(): ToolFlags {
  return { angleLock: false, straightMode: false };
}

/** A sane, zeroed CityStats for the moment before the first worker snapshot arrives. */
export function createInitialStats(): CityStats {
  return {
    tick: 0,
    funds: START_FUNDS,
    monthlyIncome: 0,
    monthlyExpenses: 0,
    population: 0,
    jobs: 0,
    employed: 0,
    demand: { res: 0, com: 0, ind: 0 },
    happiness: 0,
    powerSupply: 0,
    powerDemand: 0,
    waterSupply: 0,
    waterDemand: 0,
    milestoneLevel: 0,
    milestoneProgress: 0,
    loanBalance: 0,
    taxRates: { res: DEFAULT_TAX_RATE, com: DEFAULT_TAX_RATE, ind: DEFAULT_TAX_RATE },
    serviceFunding: { police: 1, fire: 1, health: 1, education: 1, park: 1 },
  };
}

export interface CityStoreState {
  stats: CityStats;
  selectedTool: ToolId;
  /** Active infoview lens: every scalar field plus power/watered coverage. */
  overlay: LensId | null;
  speed: SimSpeed;
  notifications: CityNotification[];
  preview: PreviewInfo | null;
  selectedBuilding: BuildingInstance | null;
  canUndo: boolean;
  canRedo: boolean;
  bound: BoundActions | null;

  /** Live tool-behavior flags, consumed by ToolManager. */
  toolFlags: ToolFlags;
  /** The tool-options "Tool Mode" segmented control, road tools only so far. */
  toolMode: ToolMode;
  /** Population as of the last monthly rollover — feeds the status-strip trend arrow. */
  previousMonthPopulation: number;
  /** Funds as of the last monthly rollover — feeds the status-strip trend arrow. */
  previousMonthFunds: number;
  /**
   * Richer per-building selection payload: occupancy/tax/
   * happiness-at-tile. Populated by the Integrate-phase worker wiring; the
   * InfoPanel renders its enrichment rows only while this is present and
   * matches `selectedBuilding`.
   */
  selectionInfo: SelectionInfo | null;
  /** Terrain-brush radius/strength ("Brush radius"/"Strength" rows), consumed by ToolManager.setBrush. */
  brushSettings: BrushSettings;

  // --- Bus transit ---------------------------------------------------------
  /** Worker's authoritative bus lines (from SimSnapshot.transit.lines). */
  transitLines: TransitLine[];
  /** Per-line ridership, aligned index-for-index with transitLines. */
  transitRidership: number[];
  // --- Districts & policies ------------------------------------------------
  /** Worker's authoritative district defs (from SimSnapshot.districts.defs). */
  districts: District[];
  /** District id the district.paint tool stamps (1..255). */
  selectedDistrict: number;
  /** Optimistic per-district enabled-policy sets (worker owns the truth; not persisted). */
  districtPolicies: Record<number, Policy[]>;
  // --- Stats charts + Photo mode -------------------------------------------
  /** Live stats history samples (pushed by main.ts each snapshot). */
  statsSamples: StatsSample[];
  /** Whether the stats charts panel is open. */
  statsOpen: boolean;
  /** Whether photo mode is active (drives chrome hiding). */
  photoMode: boolean;

  // --- Start menu ----------------------------------------------------------
  /** 'menu' = start screen (no world booted); 'playing' = a game is live. */
  screen: 'menu' | 'playing';
  /** In-game pause overlay: the start menu shown over a paused running game. */
  menuOpen: boolean;
  /** Persisted user options (bloom / sandbox / audio). */
  settings: GameSettings;

  applySnapshotStats: (stats: CityStats) => void;
  setTool: (tool: ToolId) => void;
  setOverlay: (overlay: LensId | null) => void;
  /** Updates the local speed readout and forwards it to the bound worker bridge. */
  setSpeed: (speed: SimSpeed) => void;
  pushNotification: (note: CityNotification) => void;
  dismissNotification: (id: number) => void;
  setSelectedBuilding: (building: BuildingInstance | null) => void;
  setUndoState: (canUndo: boolean, canRedo: boolean) => void;
  setPreview: (preview: PreviewInfo | null) => void;
  bindActions: (actions: BoundActions) => void;
  /** Merges a partial patch into toolFlags (e.g. the 90° lock snapping chip). */
  setToolFlags: (flags: Partial<ToolFlags>) => void;
  /** Sets the Tool Mode segmented control and mirrors toolFlags.straightMode. */
  setToolMode: (mode: ToolMode) => void;
  setSelectionInfo: (info: SelectionInfo | null) => void;
  /** Merges a partial patch into brushSettings (the Brush radius / Strength sliders). */
  setBrushSettings: (settings: Partial<BrushSettings>) => void;
  /** Replaces the transit line list + ridership from a snapshot. */
  setTransit: (lines: TransitLine[], ridership: number[]) => void;
  /** Deletes a bus line (emits deleteTransitLine via the bound bridge). */
  deleteTransitLine: (id: number) => void;
  /** Replaces the district def list from a snapshot (never shrinks selectedDistrict). */
  setDistricts: (districts: District[]) => void;
  /** Sets the district id the paint tool stamps. */
  setSelectedDistrict: (id: number) => void;
  /** Toggles a policy for a district — updates local state and emits setDistrictPolicy. */
  toggleDistrictPolicy: (districtId: number, policy: Policy) => void;
  /** Replaces the live stats-history samples. */
  setStatsSamples: (samples: StatsSample[]) => void;
  /** Opens/closes the stats charts panel. */
  setStatsOpen: (open: boolean) => void;
  /** Sets the photo-mode active flag (chrome hiding). */
  setPhotoMode: (active: boolean) => void;
  /** Sets the top-level screen ('menu' before a game boots, 'playing' once live). */
  setScreen: (screen: 'menu' | 'playing') => void;
  /** Opens/closes the in-game pause menu overlay. */
  setMenuOpen: (open: boolean) => void;
  /** Merges a partial patch into settings and persists it to localStorage. */
  setSettings: (settings: Partial<GameSettings>) => void;
}

export const useCityStore = create<CityStoreState>((set, get) => ({
  stats: createInitialStats(),
  selectedTool: 'select',
  overlay: null,
  speed: 1,
  notifications: [],
  preview: null,
  selectedBuilding: null,
  canUndo: false,
  canRedo: false,
  bound: null,
  toolFlags: createInitialToolFlags(),
  toolMode: 'lpath',
  previousMonthPopulation: createInitialStats().population,
  previousMonthFunds: createInitialStats().funds,
  selectionInfo: null,
  brushSettings: DEFAULT_BRUSH_SETTINGS,
  transitLines: [],
  transitRidership: [],
  districts: [],
  selectedDistrict: 1,
  districtPolicies: {},
  statsSamples: [],
  statsOpen: false,
  photoMode: false,
  screen: 'menu',
  menuOpen: false,
  settings: loadSettings(),

  applySnapshotStats: (stats) =>
    set((state) => {
      // Roll the trend baseline forward only when the tick advances into a
      // new calendar month (never on a backward jump, e.g. a fresh load) —
      // the status strip compares the live figure against this snapshot.
      const priorMonthIndex = Math.floor(state.stats.tick / TICKS_PER_MONTH);
      const nextMonthIndex = Math.floor(stats.tick / TICKS_PER_MONTH);
      if (nextMonthIndex > priorMonthIndex) {
        return {
          stats,
          previousMonthPopulation: state.stats.population,
          previousMonthFunds: state.stats.funds,
        };
      }
      return { stats };
    }),
  setTool: (tool) => set({ selectedTool: tool }),
  setOverlay: (overlay) => set({ overlay }),
  setSpeed: (speed) => {
    set({ speed });
    get().bound?.setSpeed(speed);
  },
  pushNotification: (note) =>
    set((state) => {
      const next = [...state.notifications, note];
      return {
        notifications:
          next.length > MAX_NOTIFICATIONS ? next.slice(next.length - MAX_NOTIFICATIONS) : next,
      };
    }),
  dismissNotification: (id) =>
    set((state) => ({ notifications: state.notifications.filter((n) => n.id !== id) })),
  setSelectedBuilding: (building) => set({ selectedBuilding: building }),
  setUndoState: (canUndo, canRedo) => set({ canUndo, canRedo }),
  setPreview: (preview) => set({ preview }),
  bindActions: (actions) => set({ bound: actions }),
  setToolFlags: (flags) => set((state) => ({ toolFlags: { ...state.toolFlags, ...flags } })),
  setToolMode: (mode) =>
    set((state) => ({
      toolMode: mode,
      toolFlags: { ...state.toolFlags, straightMode: mode === 'straight' },
    })),
  setSelectionInfo: (info) => set({ selectionInfo: info }),
  setBrushSettings: (settings) =>
    set((state) => ({ brushSettings: { ...state.brushSettings, ...settings } })),
  setTransit: (lines, ridership) => set({ transitLines: lines, transitRidership: ridership }),
  deleteTransitLine: (id) =>
    get().bound?.sendCommands('Delete bus line', [{ kind: 'deleteTransitLine', id }]),
  setDistricts: (districts) => set({ districts }),
  setSelectedDistrict: (id) => set({ selectedDistrict: id }),
  toggleDistrictPolicy: (districtId, policy) =>
    set((state) => {
      const current = state.districtPolicies[districtId] ?? [];
      const on = !current.includes(policy);
      const next = on ? [...current, policy] : current.filter((p) => p !== policy);
      state.bound?.sendCommands(`${on ? 'Enable' : 'Disable'} policy`, [
        { kind: 'setDistrictPolicy', districtId, policy, on },
      ]);
      return { districtPolicies: { ...state.districtPolicies, [districtId]: next } };
    }),
  setStatsSamples: (samples) => set({ statsSamples: samples }),
  setStatsOpen: (open) => set({ statsOpen: open }),
  setPhotoMode: (active) => set({ photoMode: active }),
  setScreen: (screen) => set({ screen }),
  setMenuOpen: (open) => set({ menuOpen: open }),
  setSettings: (patch) => {
    set((state) => {
      const settings = { ...state.settings, ...patch };
      saveSettings(settings);
      return { settings };
    });
    get().bound?.onSettings(patch);
  },
}));
