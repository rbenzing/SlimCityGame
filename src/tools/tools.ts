/**
 * Tool state machine: hover preview -> drag -> commit/cancel.
 * Pure logic only — no three.js/DOM here. `ToolEnv` is the injected boundary
 * to screen->tile picking, the road/catalog data, and the command channel;
 * `main` (render thread integration) supplies a real implementation and
 * relays keyboard shortcuts (Esc -> cancel(), R -> rotatePlop()).
 */
import {
  inBounds,
  TERRAFORM_BRUSH_MAX,
  TERRAFORM_BRUSH_MIN,
  TERRAFORM_COST_PER_METER_TILE,
  TERRAFORM_STRENGTH_MAX,
  TERRAFORM_STRENGTH_MIN,
  TILE_METERS,
} from '../shared/constants';
import type {
  BrushSettings,
  BuildingCatalogEntry,
  Command,
  CursorChip,
  RoadSpec,
  RoadTier,
  TilePoint,
  ToolFlags,
  ToolId,
  ZoneType,
} from '../shared/types';
import { RoadTier as RoadTierValue, ZoneType as ZoneTypeValue } from '../shared/types';

/**
 * The onPreview payload: every CursorChip field (cost/lengthMeters/
 * invalidReason) plus the geometry the render side needs.
 */
export interface ToolPreview extends CursorChip {
  tiles: TilePoint[];
  valid: boolean;
  label: string;
}

/** Zone tool paint mode (tool-options row): brush follows the
 * drag's actual path; rect fills the enclosing rectangle (existing/default). */
export type ZoneMode = 'brush' | 'rect';

export interface ToolEnv {
  /** Screen pixel -> tile coordinate, or null when off the playable grid. */
  screenToTile(sx: number, sy: number): TilePoint | null;
  /** Dispatches a forward command batch under a human-readable undo label. */
  send(label: string, commands: Command[]): void;
  roadSpec(tier: RoadTier): RoadSpec;
  entry(catalogId: string): BuildingCatalogEntry | undefined;
  onPreview(preview: ToolPreview | null): void;
  /**
   * Current available funds. Optional (additive contract): an env that omits
   * it never reports an "Insufficient funds" invalidReason.
   */
  funds?(): number;
  /**
   * Current reached MILESTONES index. Optional: an env that omits it never
   * reports a "Locked" invalidReason.
   */
  milestoneLevel?(): number;
  /**
   * Geometric placement check (grid overlap/water/etc. — beyond simple
   * in-bounds). Optional: an env that omits it never blocks on this check.
   */
  canPlace?(tiles: TilePoint[]): boolean;
  /**
   * Terrain height in meters at a tile. The Level terraform
   * tool samples this once at drag start for its flatten target. Optional:
   * an env that omits it samples a target height of 0 (still real terraform
   * behavior — just unsampled — never a crash).
   */
  heightAt?(tile: TilePoint): number;
  /**
   * True when a tile carries a road or building, i.e. is excluded from the
   * terraform kernel ("can't terraform under structures").
   * Optional: an env that omits it never excludes any tile, so a terraform
   * brush preview is always valid.
   */
  hasStructure?(tile: TilePoint): boolean;
}

export const ZONE_TOOL_TO_TYPE: Record<string, ZoneType> = {
  'zone.resLow': ZoneTypeValue.ResLow,
  'zone.resHigh': ZoneTypeValue.ResHigh,
  'zone.comLow': ZoneTypeValue.ComLow,
  'zone.comHigh': ZoneTypeValue.ComHigh,
  'zone.industrial': ZoneTypeValue.Industrial,
  'zone.dezone': ZoneTypeValue.None,
  // Zoning types expansion — additive, save-safe (ZoneType numbers 1–5 above
  // are unchanged; these map to the new appended values).
  'zone.resMediumRow': ZoneTypeValue.ResMediumRow,
  'zone.resMedium': ZoneTypeValue.ResMedium,
  'zone.mixed': ZoneTypeValue.Mixed,
};

const ZONE_TOOL_TO_LABEL: Record<string, string> = {
  'zone.resLow': 'Residential (Low)',
  'zone.resHigh': 'Residential (High)',
  'zone.comLow': 'Commercial (Low)',
  'zone.comHigh': 'Commercial (High)',
  'zone.industrial': 'Industrial',
  'zone.dezone': 'De-zone',
  // Zoning types expansion.
  'zone.resMediumRow': 'Residential (Medium Row)',
  'zone.resMedium': 'Residential (Medium)',
  'zone.mixed': 'Mixed-Use',
};

const ROAD_TOOL_TO_TIER: Record<string, RoadTier> = {
  'road.two': RoadTierValue.TwoLane,
  'road.avenue': RoadTierValue.Avenue,
  'road.highway': RoadTierValue.Highway,
  // Roads catalog expansion — same preview/commit machinery,
  // ghost paths and cursor chips included, just four more tier mappings.
  'road.gravel': RoadTierValue.Gravel,
  'road.alley': RoadTierValue.Alley,
  'road.oneway': RoadTierValue.OneWay,
  'road.four': RoadTierValue.FourLane,
};

/** The 'terraform' Command's mode field (shared/types.ts), named locally for readability. */
type TerraformMode = Extract<Command, { kind: 'terraform' }>['mode'];

const TERRAFORM_TOOL_TO_MODE: Record<string, TerraformMode> = {
  'terraform.raise': 'raise',
  'terraform.lower': 'lower',
  'terraform.level': 'level',
  'terraform.smooth': 'smooth',
};

const TERRAFORM_TOOL_TO_LABEL: Record<string, string> = {
  'terraform.raise': 'Raise',
  'terraform.lower': 'Lower',
  'terraform.level': 'Level',
  'terraform.smooth': 'Smooth',
};

/**
 * Continuous-brushing cadence: sim ticks between throttled
 * terraform-command emissions while a drag is held. Deterministic game time
 * (the caller supplies the current tick — never Date.now()), so brushing
 * scales with sim speed rather than real seconds.
 */
export const TERRAFORM_EMIT_INTERVAL_TICKS = 6;

/** Tool-options defaults: the midpoint of each slider's range. */
export const DEFAULT_BRUSH_SETTINGS: BrushSettings = {
  radius: Math.round((TERRAFORM_BRUSH_MIN + TERRAFORM_BRUSH_MAX) / 2),
  strength: Math.round((TERRAFORM_STRENGTH_MIN + TERRAFORM_STRENGTH_MAX) / 2),
};

/**
 * Builds the road-drag L-path from `start` to `end` inclusive: the longer
 * axis is traversed first, then the shorter axis, with ties broken toward X.
 * The elbow tile is never duplicated.
 */
export function buildLPath(start: TilePoint, end: TilePoint): TilePoint[] {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const stepX = dx === 0 ? 0 : Math.sign(dx);
  const stepZ = dz === 0 ? 0 : Math.sign(dz);
  const xMajor = Math.abs(dx) >= Math.abs(dz);
  const tiles: TilePoint[] = [];
  if (xMajor) {
    for (let x = start.x; x !== end.x; x += stepX) tiles.push({ x, z: start.z });
    for (let z = start.z; z !== end.z; z += stepZ) tiles.push({ x: end.x, z });
  } else {
    for (let z = start.z; z !== end.z; z += stepZ) tiles.push({ x: start.x, z });
    for (let x = start.x; x !== end.x; x += stepX) tiles.push({ x, z: end.z });
  }
  tiles.push({ x: end.x, z: end.z });
  return tiles;
}

/**
 * The `Straight` tool mode / `90° lock` snapping chip: a direct
 * single-axis-locked segment from `start` along whichever axis dominates the
 * drag, ignoring the other axis entirely (unlike {@link buildLPath}, this
 * never doglegs to actually reach `end`'s off-axis coordinate). Ties break
 * toward X, matching buildLPath.
 */
export function straightPath(start: TilePoint, end: TilePoint): TilePoint[] {
  const dx = end.x - start.x;
  const dz = end.z - start.z;
  const xMajor = Math.abs(dx) >= Math.abs(dz);
  const tiles: TilePoint[] = [];
  if (xMajor) {
    const stepX = dx === 0 ? 0 : Math.sign(dx);
    for (let x = start.x; x !== end.x; x += stepX) tiles.push({ x, z: start.z });
    tiles.push({ x: end.x, z: start.z });
  } else {
    const stepZ = dz === 0 ? 0 : Math.sign(dz);
    for (let z = start.z; z !== end.z; z += stepZ) tiles.push({ x: start.x, z });
    tiles.push({ x: start.x, z: end.z });
  }
  return tiles;
}

/** Normalizes a drag between any two corners into the enclosed tile rectangle. */
export function rectTiles(start: TilePoint, end: TilePoint): TilePoint[] {
  const minX = Math.min(start.x, end.x);
  const maxX = Math.max(start.x, end.x);
  const minZ = Math.min(start.z, end.z);
  const maxZ = Math.max(start.z, end.z);
  const tiles: TilePoint[] = [];
  for (let z = minZ; z <= maxZ; z++) {
    for (let x = minX; x <= maxX; x++) tiles.push({ x, z });
  }
  return tiles;
}

/**
 * Footprint tiles for a ploppable at `origin` (its min-x/min-z corner).
 * Odd rotations (90°/270°) swap width and depth; the origin corner itself
 * never moves.
 */
export function footprintTiles(
  origin: TilePoint,
  entry: BuildingCatalogEntry,
  rotation: 0 | 1 | 2 | 3,
): TilePoint[] {
  const swapped = rotation === 1 || rotation === 3;
  const w = swapped ? entry.footprint.d : entry.footprint.w;
  const d = swapped ? entry.footprint.w : entry.footprint.d;
  const tiles: TilePoint[] = [];
  for (let dz = 0; dz < d; dz++) {
    for (let dx = 0; dx < w; dx++) {
      tiles.push({ x: origin.x + dx, z: origin.z + dz });
    }
  }
  return tiles;
}

/**
 * Terraform brush ring: the tile outline at exactly `radius`
 * tiles from `center` — a thin circle shell for the ghost preview, cheap
 * regardless of brush size (O(radius) tiles, not O(radius²)). This is NOT
 * the area the sim kernel edits (that's the filled {@link brushDiscTiles});
 * genre-standard brush cursors show only the outline, never the whole falloff
 * disc. A tile is on the ring when its rounded Euclidean distance from
 * `center` equals `radius`; out-of-bounds tiles are dropped.
 */
export function brushRingTiles(center: TilePoint, radius: number): TilePoint[] {
  const r = Math.max(0, Math.round(radius));
  const tiles: TilePoint[] = [];
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      if (Math.round(Math.hypot(dx, dz)) !== r) continue;
      const x = center.x + dx;
      const z = center.z + dz;
      if (inBounds(x, z)) tiles.push({ x, z });
    }
  }
  return tiles;
}

/**
 * The filled brush disc: every tile within `radius` tiles of
 * `center` — mirrors the sim kernel's effective falloff footprint (the
 * smoothstep falloff reaches exactly 0 at the radius, so nothing beyond it
 * ever changes). Used internally for the structure-exclusion validity check
 * and the cost estimate; the ghost preview itself only ever shows
 * {@link brushRingTiles}.
 */
export function brushDiscTiles(center: TilePoint, radius: number): TilePoint[] {
  const r = Math.max(0, Math.round(radius));
  const rSq = r * r;
  const tiles: TilePoint[] = [];
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      if (dx * dx + dz * dz > rSq) continue;
      const x = center.x + dx;
      const z = center.z + dz;
      if (inBounds(x, z)) tiles.push({ x, z });
    }
  }
  return tiles;
}

function isPlopTool(tool: ToolId): boolean {
  return tool.startsWith('plop.');
}

function isTerraformTool(tool: ToolId): boolean {
  return tool.startsWith('terraform.');
}

/** Bus-line tool: click stops in sequence, right-click to commit the line. */
function isTransitTool(tool: ToolId): boolean {
  return tool === 'transit.line';
}

/** District paint tool: brush/rect paint the selected district id onto tiles. */
function isDistrictTool(tool: ToolId): boolean {
  return tool === 'district.paint';
}

/** A minimum of 2 stops makes a routable bus line (mirrors sim/transit.ts). */
const MIN_TRANSIT_STOPS = 2;

/** Distinct packed-hex colors cycled for successive new bus lines. */
const TRANSIT_LINE_PALETTE: readonly number[] = [
  0xef5350, 0x42a5f5, 0x66bb6a, 0xffa726, 0xab47bc, 0x26c6da,
];

function catalogIdOf(tool: ToolId): string {
  return tool.slice('plop.'.length);
}

export class ToolManager {
  private readonly env: ToolEnv;
  private _tool: ToolId = 'select';
  private rotation: 0 | 1 | 2 | 3 = 0;
  private hoverTile: TilePoint | null = null;
  private dragStart: TilePoint | null = null;
  private armed = false;
  private flags: ToolFlags = { angleLock: false, straightMode: false };
  private zoneMode: ZoneMode = 'rect';
  /** Zone brush mode: the deduped, drag-ordered path of tiles painted so far. */
  private brushTiles: TilePoint[] = [];
  private brushSeen = new Set<string>();
  /** Terrain-brush radius/strength, consumed by the terraform tools. */
  private brushSettings: BrushSettings = DEFAULT_BRUSH_SETTINGS;
  /** Level tool: the height sampled at drag start, flattened toward for the whole stroke. */
  private terraformLevelTarget: number | null = null;
  /** The sim tick (caller-supplied, deterministic) at which the last terraform dab fired. */
  private terraformLastEmitTick = 0;
  /** Running estimated cost of the in-progress terraform stroke (cursor chip). */
  private terraformStrokeCost = 0;
  /** District id the paint tool stamps (set from the UI store's selectedDistrict). */
  private districtId = 1;
  /** Pending bus-line stops accumulated by successive clicks. */
  private transitStops: TilePoint[] = [];
  /** Index into TRANSIT_LINE_PALETTE for the next committed line's color. */
  private transitColorIndex = 0;

  constructor(env: ToolEnv) {
    this.env = env;
  }

  get tool(): ToolId {
    return this._tool;
  }

  /**
   * True while a primary-button drag is in progress (staged ESC):
   * main.ts consumes an Escape press at stage 1 (cancel the drag) only when
   * this is set, letting the UI layer handle the later stages otherwise.
   */
  get dragActive(): boolean {
    return this.armed && this.dragStart !== null;
  }

  setTool(t: ToolId): void {
    this._tool = t;
    this.dragStart = null;
    this.hoverTile = null;
    this.armed = false;
    this.brushTiles = [];
    this.brushSeen.clear();
    this.terraformLevelTarget = null;
    this.terraformStrokeCost = 0;
    this.transitStops = [];
    this.env.onPreview(null);
  }

  /** The district id the paint tool stamps (from the UI store). */
  setDistrictId(id: number): void {
    this.districtId = id;
    if (this.hoverTile) this.emitPreview(this.hoverTile);
  }

  /** Live tool-behavior flags from the tool-options panel. */
  setFlags(flags: ToolFlags): void {
    this.flags = flags;
    if (this.hoverTile) this.emitPreview(this.hoverTile);
  }

  /** Zone tool paint mode: `brush` (drag path) or `rect` (enclosing rectangle). */
  setZoneMode(mode: ZoneMode): void {
    this.zoneMode = mode;
    if (this.hoverTile) this.emitPreview(this.hoverTile);
  }

  /** Live terrain-brush radius/strength (tool-options rows). */
  setBrush(settings: BrushSettings): void {
    this.brushSettings = settings;
    if (this.hoverTile) this.emitPreview(this.hoverTile);
  }

  /**
   * `nowTick` is the current deterministic sim tick (e.g. CityStats.tick),
   * supplied by the caller — never Date.now() — so continuous terraform
   * brushing throttles against game time. Tools other than
   * the terraform family ignore it entirely.
   */
  pointerDown(sx: number, sy: number, button: number, nowTick = 0): boolean {
    // Bus line: left-click appends a stop; right-click commits the line.
    if (isTransitTool(this._tool)) {
      if (button === 2) {
        this.commitTransitLine();
        return true;
      }
      if (button === 0) {
        const tile = this.env.screenToTile(sx, sy);
        if (tile) {
          this.transitStops.push(tile);
          this.hoverTile = tile;
          this.emitPreview(tile);
        }
        return true;
      }
      return false;
    }
    if (button === 2) {
      this.cancel();
      return false;
    }
    if (button !== 0 || this._tool === 'select') return false;
    const tile = this.env.screenToTile(sx, sy);
    this.hoverTile = tile;
    this.dragStart = tile;
    this.armed = tile !== null;
    this.brushTiles = [];
    this.brushSeen.clear();
    if (tile && isTerraformTool(this._tool)) {
      this.startTerraformStroke(tile, nowTick);
    }
    if (tile) this.emitPreview(tile);
    return true;
  }

  pointerMove(sx: number, sy: number, button: number, nowTick = 0): boolean {
    if (this._tool === 'select') return false;
    const tile = this.env.screenToTile(sx, sy);
    this.hoverTile = tile;
    if (tile) {
      if (
        this.armed &&
        isTerraformTool(this._tool) &&
        nowTick - this.terraformLastEmitTick >= TERRAFORM_EMIT_INTERVAL_TICKS
      ) {
        this.terraformLastEmitTick = nowTick;
        this.sendTerraformDab(tile);
      }
      this.emitPreview(tile);
    } else {
      this.env.onPreview(null);
    }
    return button === 0;
  }

  pointerUp(sx: number, sy: number, button: number): boolean {
    if (this._tool === 'select') return false;
    if (button !== 0) return false;
    if (this.armed && this.dragStart) {
      const end = this.env.screenToTile(sx, sy) ?? this.hoverTile ?? this.dragStart;
      this.commit(this.dragStart, end);
    }
    this.armed = false;
    this.dragStart = null;
    this.brushTiles = [];
    this.brushSeen.clear();
    return true;
  }

  /** Aborts any in-progress drag/hover gesture and clears the preview. */
  cancel(): void {
    this.dragStart = null;
    this.armed = false;
    this.brushTiles = [];
    this.brushSeen.clear();
    this.terraformLevelTarget = null;
    this.terraformStrokeCost = 0;
    this.env.onPreview(null);
  }

  /** Advances the ploppable's rotation a quarter turn and refreshes its preview. */
  rotatePlop(): void {
    this.rotation = ((this.rotation + 1) % 4) as 0 | 1 | 2 | 3;
    if (isPlopTool(this._tool) && this.hoverTile) {
      this.emitPreview(this.hoverTile);
    }
  }

  /** Road path for the current flags: single-axis-locked when either the
   * `90° lock` snapping chip or `Straight` tool mode is on, else the L-path. */
  private roadPath(start: TilePoint, end: TilePoint): TilePoint[] {
    return this.flags.angleLock || this.flags.straightMode
      ? straightPath(start, end)
      : buildLPath(start, end);
  }

  /** Brush mode's accumulated path, growing (deduped) on every call while a
   * drag is in progress; a plain hover (no drag yet) always collapses to the
   * single hovered tile, matching rect mode's hover behavior. */
  private brushTilesFor(current: TilePoint): TilePoint[] {
    if (this.dragStart === null) return [current];
    const key = `${current.x},${current.z}`;
    if (!this.brushSeen.has(key)) {
      this.brushSeen.add(key);
      this.brushTiles.push(current);
    }
    return this.brushTiles;
  }

  private zoneTiles(start: TilePoint, current: TilePoint): TilePoint[] {
    return this.zoneMode === 'brush' ? this.brushTilesFor(current) : rectTiles(start, current);
  }

  /**
   * Shared validity/invalidReason computation (cursor chip):
   * `Locked` (unlockMilestone beyond the injected milestone level) takes
   * priority over `Overlapping items` (geometry/canPlace), which takes
   * priority over `Insufficient funds`. Any check whose supporting ToolEnv
   * hook is absent is skipped entirely (never contributes a false positive).
   */
  private evaluate(
    tiles: TilePoint[],
    cost: number,
    unlockMilestone: number,
    geometryOk: boolean,
  ): { valid: boolean; invalidReason?: string } {
    const milestoneLevel = this.env.milestoneLevel?.();
    if (milestoneLevel !== undefined && unlockMilestone > milestoneLevel) {
      return { valid: false, invalidReason: 'Locked' };
    }
    const placementOk = geometryOk && (this.env.canPlace?.(tiles) ?? true);
    if (!placementOk) {
      return { valid: false, invalidReason: 'Overlapping items' };
    }
    const funds = this.env.funds?.();
    if (funds !== undefined && cost > funds) {
      return { valid: false, invalidReason: 'Insufficient funds' };
    }
    return { valid: true };
  }

  private emitPreview(current: TilePoint): void {
    const tool = this._tool;
    if (isPlopTool(tool)) {
      const entry = this.env.entry(catalogIdOf(tool));
      if (!entry) {
        this.env.onPreview(null);
        return;
      }
      const tiles = footprintTiles(current, entry, this.rotation);
      const geometryOk = tiles.every((t) => inBounds(t.x, t.z));
      const { valid, invalidReason } = this.evaluate(
        tiles,
        entry.cost,
        entry.unlockMilestone,
        geometryOk,
      );
      this.env.onPreview({ tiles, valid, cost: entry.cost, label: entry.name, invalidReason });
      return;
    }
    if (isTerraformTool(tool)) {
      this.emitTerraformPreview(current);
      return;
    }
    if (isTransitTool(tool)) {
      // Ghost the committed stops plus the tentative next stop under the cursor.
      const tiles = [...this.transitStops, current];
      this.env.onPreview({
        tiles,
        valid: tiles.length >= MIN_TRANSIT_STOPS,
        cost: 0,
        label: `Bus line (${this.transitStops.length} stop${this.transitStops.length === 1 ? '' : 's'})`,
      });
      return;
    }
    if (isDistrictTool(tool)) {
      const startTile = this.dragStart ?? current;
      const tiles = this.zoneTiles(startTile, current);
      const { valid, invalidReason } = this.evaluate(tiles, 0, 0, true);
      this.env.onPreview({
        tiles,
        valid,
        cost: 0,
        label: `District ${this.districtId}`,
        invalidReason,
      });
      return;
    }

    const start = this.dragStart ?? current;
    if (tool === 'bulldoze') {
      const tiles = rectTiles(start, current);
      const { valid, invalidReason } = this.evaluate(tiles, 0, 0, true);
      this.env.onPreview({ tiles, valid, cost: 0, label: 'Bulldoze', invalidReason });
    } else if (tool in ROAD_TOOL_TO_TIER) {
      const tier = ROAD_TOOL_TO_TIER[tool] as RoadTier;
      const spec = this.env.roadSpec(tier);
      const tiles = this.roadPath(start, current);
      const cost = tiles.length * spec.costPerTile;
      const { valid, invalidReason } = this.evaluate(tiles, cost, spec.unlockMilestone, true);
      this.env.onPreview({
        tiles,
        valid,
        cost,
        label: spec.name,
        lengthMeters: tiles.length * TILE_METERS,
        invalidReason,
      });
    } else if (tool in ZONE_TOOL_TO_TYPE) {
      const label = ZONE_TOOL_TO_LABEL[tool] ?? 'Zone';
      const tiles = this.zoneTiles(start, current);
      const { valid, invalidReason } = this.evaluate(tiles, 0, 0, true);
      this.env.onPreview({ tiles, valid, cost: 0, label, invalidReason });
    }
  }

  /** Drag-start setup for a terraform stroke: samples the
   * Level target height once, resets the running cost, and fires the first
   * "dab" immediately (a lone click still edits, matching every other
   * brush tool's committed-on-click feel). */
  private startTerraformStroke(tile: TilePoint, nowTick: number): void {
    this.terraformLevelTarget =
      this._tool === 'terraform.level' ? (this.env.heightAt?.(tile) ?? 0) : null;
    this.terraformStrokeCost = 0;
    this.terraformLastEmitTick = nowTick;
    this.sendTerraformDab(tile);
  }

  /** Disc tiles the sim kernel would actually edit (excludes anything the env reports as structure-covered). */
  private editableTileCount(disc: TilePoint[]): number {
    const hasStructure = this.env.hasStructure;
    return hasStructure ? disc.filter((t) => !hasStructure(t)).length : disc.length;
  }

  /**
   * A deliberate client-side ESTIMATE, not the sim's exact charge (which
   * depends on the smoothstep falloff and the current heights under the
   * brush — data this pure, env-injected tool layer has no bulk access to):
   * editable-tile count * strength * the shared ¢/m/tile rate. Good enough
   * for a live running-cost readout; the worker ack remains the
   * authoritative charge ("funds-gated like every edit").
   */
  private estimateCost(disc: TilePoint[], strength: number): number {
    return this.editableTileCount(disc) * strength * TERRAFORM_COST_PER_METER_TILE;
  }

  /** Sends one throttled terraform command at `tile` with the current brush settings, and folds its cost estimate into the stroke's running total. */
  private sendTerraformDab(tile: TilePoint): void {
    const mode = TERRAFORM_TOOL_TO_MODE[this._tool];
    if (!mode) return;
    const { radius, strength } = this.brushSettings;
    const disc = brushDiscTiles(tile, radius);
    this.terraformStrokeCost += this.estimateCost(disc, strength);
    const command: Command = {
      kind: 'terraform',
      mode,
      center: tile,
      radius,
      strength,
      ...(mode === 'level' ? { targetHeight: this.terraformLevelTarget ?? 0 } : {}),
    };
    this.env.send(TERRAFORM_TOOL_TO_LABEL[this._tool] ?? 'Terraform', [command]);
  }

  /** The cursor-chip label: the plain tool name, except
   * Level mid-drag, which embeds its drag-start-sampled flatten target. */
  private terraformLabel(tool: ToolId): string {
    const base = TERRAFORM_TOOL_TO_LABEL[tool] ?? 'Terraform';
    if (
      tool === 'terraform.level' &&
      this.dragStart !== null &&
      this.terraformLevelTarget !== null
    ) {
      return `${base} → ${this.terraformLevelTarget.toFixed(1)}m`;
    }
    return base;
  }

  /** Terraform ghost preview: a brush-radius ring at the
   * hovered tile, invalid only when the whole underlying disc is
   * structure-excluded; cost is a running stroke total while dragging, or a
   * single-dab estimate while only hovering. */
  private emitTerraformPreview(current: TilePoint): void {
    const tool = this._tool;
    const { radius, strength } = this.brushSettings;
    const ring = brushRingTiles(current, radius);
    const disc = brushDiscTiles(current, radius);
    const hasStructure = this.env.hasStructure;
    const structureExcluded = hasStructure ? disc.every((t) => hasStructure(t)) : false;
    const cost =
      this.dragStart !== null ? this.terraformStrokeCost : this.estimateCost(disc, strength);
    const { valid, invalidReason } = this.evaluate(disc, cost, 0, !structureExcluded);
    this.env.onPreview({
      tiles: ring,
      valid,
      cost,
      label: this.terraformLabel(tool),
      invalidReason,
    });
  }

  private commit(start: TilePoint, end: TilePoint): void {
    const tool = this._tool;
    if (isPlopTool(tool)) {
      const catalogId = catalogIdOf(tool);
      const entry = this.env.entry(catalogId);
      if (entry) {
        this.env.send(entry.name, [
          { kind: 'placeBuilding', catalogId, x: end.x, z: end.z, rotation: this.rotation },
        ]);
      }
    } else if (tool === 'bulldoze') {
      this.env.send('Bulldoze', [{ kind: 'bulldoze', tiles: rectTiles(start, end) }]);
    } else if (tool in ROAD_TOOL_TO_TIER) {
      const tier = ROAD_TOOL_TO_TIER[tool] as RoadTier;
      const spec = this.env.roadSpec(tier);
      this.env.send(spec.name, [{ kind: 'buildRoad', tier, tiles: this.roadPath(start, end) }]);
    } else if (tool in ZONE_TOOL_TO_TYPE) {
      const zone = ZONE_TOOL_TO_TYPE[tool] as ZoneType;
      const label = ZONE_TOOL_TO_LABEL[tool] ?? 'Zone';
      this.env.send(label, [{ kind: 'paintZone', zone, tiles: this.zoneTiles(start, end) }]);
    } else if (isDistrictTool(tool)) {
      // Stamp the selected district id over the brushed/rect tiles.
      this.env.send(`District ${this.districtId}`, [
        { kind: 'paintDistrict', districtId: this.districtId, tiles: this.zoneTiles(start, end) },
      ]);
    }
    this.env.onPreview(null);
  }

  /**
   * Commits the pending bus line (>= MIN_TRANSIT_STOPS stops) as a
   * createTransitLine command with the next palette color, then resets the
   * pending-stop list. A right-click with too few stops just clears them.
   */
  private commitTransitLine(): void {
    if (this.transitStops.length >= MIN_TRANSIT_STOPS) {
      const color = TRANSIT_LINE_PALETTE[this.transitColorIndex % TRANSIT_LINE_PALETTE.length]!;
      this.transitColorIndex += 1;
      this.env.send('Bus line', [
        { kind: 'createTransitLine', line: { id: 0, stops: [...this.transitStops], color } },
      ]);
    }
    this.transitStops = [];
    this.env.onPreview(null);
  }
}
