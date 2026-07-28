/**
 * Building instancing: one InstancedMesh per catalog entry ("bucket"),
 * capacity-doubling storage, and swap-with-last removal so ids always
 * resolve to a live, contiguous instance slot.
 */
import * as THREE from 'three';
import { MeshStandardNodeMaterial } from 'three/webgpu';
import type { Node } from 'three/webgpu';
import {
  abs,
  attribute,
  distance,
  float,
  floor,
  fract,
  hash,
  hue,
  mix,
  normalLocal,
  saturation,
  select,
  sin,
  uniform,
  uv,
  vec3,
} from 'three/tsl';
import {
  BuildingCatalogEntry,
  BuildingDelta,
  BuildingInstance,
  BuildingState,
  ZoneType,
} from '../shared/types';
import { NIGHT_WINDOW_LIT_MAX, NIGHT_WINDOW_LIT_MIN, TILE_METERS } from '../shared/constants';
import { encodeId, buildIdColorArray } from './picking';
import {
  ACCENT_BLUE,
  ACCENT_RED,
  FACADE_HASH_SLOT_MULTIPLIER,
  HASH_SLOT_HUE_JITTER,
  HASH_SLOT_INDUSTRIAL_ACCENT,
  HASH_SLOT_INDUSTRIAL_WALL,
  HASH_SLOT_ROOF_ROTATION,
  HUE_JITTER_FRACTION,
  INDUSTRIAL_ACCENT_HEIGHT_FRACTION,
  INDUSTRIAL_ROOF_COLOR,
  INDUSTRIAL_WALL_PALETTE,
  MAX_WALL_SATURATION,
  MIN_ROOF_WALL_DISTANCE,
  ROOF_PALETTE,
  RGB,
  deriveFacadeParams,
  groundFloorBand,
  parapetBand,
  rgbToHsl,
} from './facade';

const INITIAL_CAPACITY = 64;
/** Footprint tiles are shrunk by this factor so neighboring buildings don't touch. */
const FOOTPRINT_SHRINK = 0.85;
/** Constructing buildings render at this fraction of their final height. */
const CONSTRUCTING_HEIGHT_SCALE = 0.25;
/**
 * Catalog ids whose visual identity comes from a utilitykits.ts detail kit
 * render as a low PLINTH instead of the full facade box — ≈8% of catalog
 * height, clamped to this floor so even a short catalog entry (e.g. a 2m park
 * slab) still reads as a real, pickable slab.
 */
const PLINTH_HEIGHT_FRACTION = 0.08;
const PLINTH_MIN_HEIGHT = 0.4;

const TINT_ACTIVE: readonly [number, number, number] = [1, 1, 1];
const TINT_CONSTRUCTING: readonly [number, number, number] = [0.55, 0.55, 0.55];
const TINT_ABANDONED: readonly [number, number, number] = [0.25, 0.25, 0.25];

/** Problems are surfaced by the UI (icons); the mesh tint only reflects lifecycle state. */
function tintFor(state: BuildingState): readonly [number, number, number] {
  if (state === BuildingState.Constructing) return TINT_CONSTRUCTING;
  if (state === BuildingState.Abandoned) return TINT_ABANDONED;
  return TINT_ACTIVE;
}

// ---------------------------------------------------------------------------
// Night cycle: per-instance emissive windows (pure parts).
// Window grid (rows/cols) is derived from footprint x height; a
// hash(buildingId, windowIndex) decides each window's lit threshold so
// ~NIGHT_WINDOW_LIT_MIN..MAX of a building's windows glow, warm with an
// occasional cool one, switching on progressively as nightFactor sweeps
// through dusk. Abandoned (and Constructing) buildings stay dark — lit
// windows are an Active-state signal.
// ---------------------------------------------------------------------------

/**
 * Per-building seed multiplier for combining (buildingId, windowIndex) into
 * one hash seed. Keeps `buildingId * WINDOW_SEED_SLOTS` exactly representable
 * in float32 (the shader's native precision) up to buildingId ~131,072 —
 * enormous headroom for this game's building counts.
 */
const WINDOW_SEED_SLOTS = 128;
/** Reserved seed slot (never a real grid cell — grids are clamped below this) used to derive a building's own lit fraction. */
const WINDOW_FRACTION_SLOT = WINDOW_SEED_SLOTS - 1;
/** Fraction of a building's windows that are the occasional cool tone rather than warm. */
const WINDOW_COOL_PROBABILITY = 0.18;
export const WARM_WINDOW_COLOR = 0xffd9a0;
export const COOL_WINDOW_COLOR = 0xcfe4ff;
/**
 * Building base color multiplies toward this tint at night. Keeps a wall at
 * full night a clearly SHADED (dimmed, slightly cool — blue channel highest,
 * red lowest) version of its day color: relative luminance
 * (0.2126R+0.7152G+0.0722B) of this tint is ~0.377, comfortably above the
 * >0.3 floor that keeps facades recognizable, while still well under 1.0 so
 * night reads as dimmer + cooler than day.
 */
export const NIGHT_BODY_TINT: readonly [number, number, number] = [0.34, 0.38, 0.46];
const WINDOW_EMISSIVE_STRENGTH = 2.2;

const MIN_WINDOW_COLS = 2;
const MAX_WINDOW_COLS = 8;
const MIN_WINDOW_ROWS = 1;
const MAX_WINDOW_ROWS = 15; // MAX_WINDOW_COLS * MAX_WINDOW_ROWS stays < WINDOW_FRACTION_SLOT
const WINDOW_FLOOR_HEIGHT_METERS = 3.2;
const WINDOW_COLS_PER_TILE = 2;
/**
 * Row-house massing: ResMediumRow's narrow attached-row footprints (1x2..1x6)
 * are a single stretched box like any other archetype — with the generic
 * per-tile window density a 1x6 "Townhouse Terrace" reads as one big building
 * with a sparse, over-wide window grid, not a row of attached houses. A
 * tighter per-tile column density (vs the general WINDOW_COLS_PER_TILE) gives
 * each unit its own narrower window bay so the repeating rhythm reads as
 * separate houses. Still bounded by MAX_WINDOW_COLS, so the WINDOW_SEED_SLOTS
 * budget invariant below holds.
 */
const ROW_HOUSE_WINDOW_COLS_PER_TILE = 3;

/**
 * Is this catalog entry the ResMediumRow attached-row-house archetype? Keyed
 * directly off the catalog's own `zone` field — the hint the
 * data already carries — rather than a footprint-shape heuristic, so it can
 * never accidentally fire for an unrelated narrow ploppable that happens to
 * share a 1-tile-wide footprint. Pure, exported for tests.
 */
export function isRowHouseArchetype(entry: BuildingCatalogEntry): boolean {
  return entry.zone === ZoneType.ResMediumRow;
}

/** Window grid (cols x rows) derived from a catalog entry's footprint x height. Pure. */
export function windowGridSize(entry: BuildingCatalogEntry): { cols: number; rows: number } {
  const avgFootprintTiles = (entry.footprint.w + entry.footprint.d) / 2;
  const colsPerTile = isRowHouseArchetype(entry)
    ? ROW_HOUSE_WINDOW_COLS_PER_TILE
    : WINDOW_COLS_PER_TILE;
  const cols = Math.min(
    MAX_WINDOW_COLS,
    Math.max(MIN_WINDOW_COLS, Math.round(avgFootprintTiles * colsPerTile)),
  );
  const rows = Math.min(
    MAX_WINDOW_ROWS,
    Math.max(MIN_WINDOW_ROWS, Math.round(entry.height / WINDOW_FLOOR_HEIGHT_METERS)),
  );
  return { cols, rows };
}

/**
 * 32-bit avalanche mix ("triple32", public domain) -> [0,1). Deterministic;
 * never Math.random.
 */
function hash1(n: number): number {
  let h = n >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** Deterministic hash(buildingId, windowIndex) -> [0,1); this *is* the window's lit threshold. */
export function windowHash(buildingId: number, windowIndex: number): number {
  return hash1(buildingId * WINDOW_SEED_SLOTS + windowIndex);
}

/**
 * The fraction of a building's windows that end up lit at full night — a
 * per-building constant in [NIGHT_WINDOW_LIT_MIN, NIGHT_WINDOW_LIT_MAX)
 * derived from the building's own id, so the mix is stable per building
 * rather than identical across the whole city.
 */
export function windowLitFraction(buildingId: number): number {
  const h = windowHash(buildingId, WINDOW_FRACTION_SLOT);
  return NIGHT_WINDOW_LIT_MIN + h * (NIGHT_WINDOW_LIT_MAX - NIGHT_WINDOW_LIT_MIN);
}

/**
 * Is this window lit at the given nightFactor? Each window's hash IS its lit
 * threshold; comparing it against `nightFactor * windowLitFraction(id)` means
 * more windows cross the threshold as nightFactor rises (progressive dusk
 * sweep, "the city wakes up over ~20s"), the set of lit windows only grows
 * as nightFactor increases (monotonic — no flicker-off), and at nightFactor=1
 * the lit fraction converges on windowLitFraction(id).
 */
export function isWindowLit(buildingId: number, windowIndex: number, nightFactor: number): boolean {
  return windowHash(buildingId, windowIndex) < nightFactor * windowLitFraction(buildingId);
}

/** Occasional cool `#cfe4ff` window among the otherwise-warm `#ffd9a0` majority. Salted apart from windowHash so color choice doesn't correlate with lit-order. */
export function isWindowCool(buildingId: number, windowIndex: number): boolean {
  return hash1(buildingId * WINDOW_SEED_SLOTS * 2 + windowIndex * 2 + 1) < WINDOW_COOL_PROBABILITY;
}

/** Abandoned (and mid-construction) buildings stay dark — lit windows are an Active-state signal only. */
export function isBuildingLitEligible(state: BuildingState): boolean {
  return state === BuildingState.Active;
}

// ---------------------------------------------------------------------------
// Day facade: extends the window grid above into a full day-time facade on
// the SAME instanced material — mullions, window panes (glass tint +
// per-window reflectance from the existing per-window hash), a family wall
// base (facade.ts's deriveFacadeParams), a ground-floor storefront band with
// a rotation-aware entrance, a parapet lip, a distinct roof plate, and the
// industrial specifics. Per-instance jitter/rotation (wallColor/roofColor)
// can't be pre-baked into a material shared by every instance of an
// archetype, so it's mirrored here as TSL hash nodes reading the real
// per-instance aBuildingId attribute — the same way the night code above
// already mirrors windowHash's CPU formula with the TSL `hash()` node. The
// night emissive (emissiveNode, above) is independent.
// ---------------------------------------------------------------------------

/** Punched-window inset margin as a fraction of a grid cell; larger = smaller pane, more visible frame. */
const MULLION_MARGIN_CURTAIN = 0.06; // glass family: glazing dominates, thin mullions
const MULLION_MARGIN_PUNCHED = 0.22; // masonry/concrete/plaster: punched openings
const MULLION_MARGIN_INDUSTRIAL = 0.34; // "sparse small windows"
const MULLION_MARGIN_GROUND_FLOOR = 0.03; // storefront: taller glazing, thin frame

const GLASS_TINT_CURTAIN: RGB = [0.55, 0.68, 0.8];
const GLASS_TINT_PUNCHED: RGB = [0.22, 0.26, 0.3]; // deep-set punched glass, in shadow
const GLASS_REFLECTANCE_MIN = 0.85;
const GLASS_REFLECTANCE_MAX = 1.15;
/** Salts a fresh draw off the existing per-window seed, decorrelated from the lit-threshold/warm-cool draws already taken from it. */
const WINDOW_REFLECTANCE_SALT_MUL = 11.0;
const WINDOW_REFLECTANCE_SALT_ADD = 5.0;
/** Sparse-window existence draw — a different salt again; only consulted for industrial archetypes, and never touches the night lit-gate. */
const WINDOW_EXISTS_SALT_MUL = 17.0;
const WINDOW_EXISTS_SALT_ADD = 7.0;
const INDUSTRIAL_WINDOW_DENSITY = 0.32;

const FRAME_DARKEN = 0.55; // upper-floor mullion/frame color: a darkened wall color
const DARK_STOREFRONT_FRAME: RGB = [0.09, 0.09, 0.1];
const DOOR_COLOR: RGB = [0.1, 0.08, 0.07];
const ENTRANCE_HALF_WIDTH = 0.12; // fraction of the entrance face's width
const ENTRANCE_HEIGHT_FRACTION = 0.85; // fraction of the ground-floor band height

const SPANDREL_DARKEN = 0.6; // masonry spandrel band: a darkened wall color
const SPANDREL_BAND_FRACTION = 0.14; // fraction of one floor's height, at each row edge

const PARAPET_DARKEN = 0.6; // non-industrial parapet: a darkened wall color
const ROOF_CAP_DARKEN = 0.85; // industrial "roof cap band": a darkened roof color

const CORRUGATION_FREQUENCY = 40 * Math.PI * 2; // ~40 fine vertical ribs across the facade width
const CORRUGATION_MIN = 0.9;
const CORRUGATION_MAX = 1.1;
const INDUSTRIAL_ACCENT_HALF_THICKNESS = 0.035; // fraction of total height

/**
 * Builds a `select` cascade that picks one of a small fixed RGB palette by a
 * runtime float index (expected to already be an integral float in
 * [0, options.length)) — used for the roof white/grey/tan rotation and the
 * industrial wall palette.
 */
function selectFromPalette(indexNode: Node<'float'>, options: readonly RGB[]): Node<'vec3'> {
  function build(i: number): Node<'vec3'> {
    const color = options[i];
    if (!color) throw new RangeError(`selectFromPalette: empty palette at index ${i}`);
    if (i === options.length - 1) return vec3(...color);
    return select(indexNode.equal(i), vec3(...color), build(i + 1));
  }
  return build(0);
}

/**
 * Per-instance wall base color: industrial rotates among its own
 * steel-blue/light-grey/off-white palette; everything else
 * desaturates the catalog color down to MAX_WALL_SATURATION (via three's own
 * `saturation()` color-adjustment node — a cheap, robust luminance-lerp
 * desaturation rather than a hand-rolled HSL round-trip in the shader).
 * Both paths finish with the same deterministic ±HUE_JITTER_FRACTION hue
 * rotation (three's `hue()` node), mirroring facade.ts's deriveWallColor
 * formula.
 */
function buildWallColorNode(
  entry: BuildingCatalogEntry,
  buildingIdAttr: Node<'float'>,
  isIndustrial: boolean,
): Node<'vec3'> {
  const hueSeed = buildingIdAttr.mul(FACADE_HASH_SLOT_MULTIPLIER).add(HASH_SLOT_HUE_JITTER);
  const hueJitterRadians = hash(hueSeed)
    .mul(2)
    .sub(1)
    .mul(HUE_JITTER_FRACTION * Math.PI * 2);

  let base: Node<'vec3'>;
  if (isIndustrial) {
    const rotationSeed = buildingIdAttr
      .mul(FACADE_HASH_SLOT_MULTIPLIER)
      .add(HASH_SLOT_INDUSTRIAL_WALL);
    const index = floor(hash(rotationSeed).mul(INDUSTRIAL_WALL_PALETTE.length));
    base = selectFromPalette(index, INDUSTRIAL_WALL_PALETTE);
  } else {
    const catalogColor = new THREE.Color(entry.color);
    const { s: originalSaturation } = rgbToHsl(catalogColor.r, catalogColor.g, catalogColor.b);
    const saturationAdjustment =
      originalSaturation > MAX_WALL_SATURATION ? MAX_WALL_SATURATION / originalSaturation : 1;
    base = saturation(vec3(catalogColor.r, catalogColor.g, catalogColor.b), saturationAdjustment);
  }

  return hue(base, hueJitterRadians);
}

/**
 * White/grey/tan rotation by id hash, retried once against the next
 * palette entry if the hash pick lands too close to the wall color
 * ("distinct from walls"). facade.ts's rotateRoofColor does the full
 * 3-attempt cycle for its CPU-tested reference; a single retry is enough
 * here since the 3 palette entries already sit >0.2 apart pairwise.
 * Industrial always gets the fixed grey roof plate instead.
 */
function buildRoofColorNode(
  buildingIdAttr: Node<'float'>,
  wallColorNode: Node<'vec3'>,
  isIndustrial: boolean,
): Node<'vec3'> {
  if (isIndustrial) return vec3(...INDUSTRIAL_ROOF_COLOR);

  const rotationSeed = buildingIdAttr.mul(FACADE_HASH_SLOT_MULTIPLIER).add(HASH_SLOT_ROOF_ROTATION);
  const baseIndex = floor(hash(rotationSeed).mul(ROOF_PALETTE.length));
  const nextIndex = baseIndex.add(1).mod(ROOF_PALETTE.length);

  const candidate = selectFromPalette(baseIndex, ROOF_PALETTE);
  const alternate = selectFromPalette(nextIndex, ROOF_PALETTE);
  const tooClose = distance(candidate, wallColorNode).lessThan(MIN_ROOF_WALL_DISTANCE);
  return select(tooClose, alternate, candidate);
}

interface Bucket {
  entry: BuildingCatalogEntry;
  material: MeshStandardNodeMaterial;
  mesh: THREE.InstancedMesh;
  capacity: number;
  count: number;
  /** slot -> building id, valid for indices [0, count). */
  slotToId: number[];
  /** building id -> slot, inverse of slotToId. */
  idToSlot: Map<number, number>;
  /** slot -> normalized (0..1) RGB, encodeId(id)/255. Not yet GPU-uploaded. */
  idColor: Float32Array;
  /** Per-instance building id (float), read by the window-emissive shader. */
  windowSeed: THREE.InstancedBufferAttribute;
  /** Per-instance 1=Active/0=Constructing|Abandoned; gates window emissive so only Active buildings light up. */
  windowActive: THREE.InstancedBufferAttribute;
}

interface BucketMesh {
  mesh: THREE.InstancedMesh;
  windowSeed: THREE.InstancedBufferAttribute;
  windowActive: THREE.InstancedBufferAttribute;
}

// Reused scratch objects: apply()/copySlot() run synchronously and never
// interleave, so a single shared instance per type avoids per-call allocation.
const _matrix = new THREE.Matrix4();
const _position = new THREE.Vector3();
const _quaternion = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _color = new THREE.Color();
const _yAxis = new THREE.Vector3(0, 1, 0);

export class BuildingInstancer {
  private readonly scene: THREE.Scene;
  private readonly heightAt: (x: number, z: number) => number;
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly buckets = new Map<string, Bucket>();
  /** building id -> catalogId, tracks which bucket currently holds an id (levels migrate buckets). */
  private readonly idLocation = new Map<number, string>();
  /**
   * Shared across every bucket's material graph: one uniform update from
   * setNightFactor() drives every archetype's window/body-tint shader at
   * once, no per-bucket bookkeeping needed.
   */
  private readonly nightFactorUniform = uniform(0);
  /** Catalog ids rendered as a low plinth (see createPlinthMaterial/writeInstance) instead of the full facade box. Empty unless the 4th constructor arg is passed. */
  private readonly plinthIds: ReadonlySet<string>;

  constructor(
    scene: THREE.Scene,
    catalog: BuildingCatalogEntry[],
    heightAt: (x: number, z: number) => number,
    plinthIds?: Set<string>,
  ) {
    this.scene = scene;
    this.heightAt = heightAt;
    this.plinthIds = plinthIds ?? new Set();
    for (const entry of catalog) {
      this.buckets.set(entry.id, this.createBucket(entry));
    }
  }

  apply(delta: BuildingDelta): void {
    const touched = new Set<Bucket>();
    for (const instance of delta.added) this.upsert(instance, touched);
    for (const instance of delta.updated) this.upsert(instance, touched);
    for (const id of delta.removed) this.removeId(id, touched);

    for (const bucket of touched) {
      bucket.mesh.count = bucket.count;
      bucket.mesh.instanceMatrix.needsUpdate = true;
      if (bucket.mesh.instanceColor) bucket.mesh.instanceColor.needsUpdate = true;
      bucket.windowSeed.needsUpdate = true;
      bucket.windowActive.needsUpdate = true;
      // Invalidate the frustum-culling sphere so three.js recomputes it from
      // the new instance set on the next cull pass (it caches the sphere the
      // first time it's null — a bucket first rendered empty would otherwise
      // stay culled forever once buildings appear).
      bucket.mesh.boundingSphere = null;
    }
  }

  /** 0 (day) .. 1 (night) — drives every archetype's window emissive + night body tint at once. */
  setNightFactor(nightFactor: number): void {
    this.nightFactorUniform.value = Math.min(1, Math.max(0, nightFactor));
  }

  /** Current nightFactor, for tests/introspection. */
  nightFactor(): number {
    return this.nightFactorUniform.value;
  }

  /** 1 if the instance at this slot is eligible for lit windows (Active), else 0. For tests/introspection. */
  activeAt(catalogId: string, instanceIndex: number): number | null {
    const bucket = this.buckets.get(catalogId);
    if (!bucket) return null;
    if (instanceIndex < 0 || instanceIndex >= bucket.count) return null;
    return bucket.windowActive.array[instanceIndex] ?? null;
  }

  instanceCount(): number {
    let total = 0;
    for (const bucket of this.buckets.values()) total += bucket.count;
    return total;
  }

  buildingIdAt(instancePick: { catalogId: string; instanceIndex: number }): number | null {
    const bucket = this.buckets.get(instancePick.catalogId);
    if (!bucket) return null;
    if (instancePick.instanceIndex < 0 || instancePick.instanceIndex >= bucket.count) return null;
    return bucket.slotToId[instancePick.instanceIndex] ?? null;
  }

  /** Live view of the meshes currently worth raycasting against, for IdPicker. */
  getPickables(): { catalogId: string; mesh: THREE.InstancedMesh }[] {
    const result: { catalogId: string; mesh: THREE.InstancedMesh }[] = [];
    for (const bucket of this.buckets.values()) {
      if (bucket.count > 0) result.push({ catalogId: bucket.entry.id, mesh: bucket.mesh });
    }
    return result;
  }

  /** Decoded-back-to-bytes id-color at a slot, for IdPicker's cross-check. */
  idColorAt(catalogId: string, instanceIndex: number): [number, number, number] | null {
    const bucket = this.buckets.get(catalogId);
    if (!bucket) return null;
    if (instanceIndex < 0 || instanceIndex >= bucket.count) return null;
    const base = instanceIndex * 3;
    const r = bucket.idColor[base];
    const g = bucket.idColor[base + 1];
    const b = bucket.idColor[base + 2];
    if (r === undefined || g === undefined || b === undefined) return null;
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  private createBucket(entry: BuildingCatalogEntry): Bucket {
    const material = this.plinthIds.has(entry.id)
      ? this.createPlinthMaterial(entry)
      : this.createMaterial(entry);
    const { mesh, windowSeed, windowActive } = this.createMesh(material, INITIAL_CAPACITY);
    this.scene.add(mesh);
    return {
      entry,
      material,
      mesh,
      capacity: INITIAL_CAPACITY,
      count: 0,
      slotToId: new Array(INITIAL_CAPACITY).fill(0),
      idToSlot: new Map(),
      idColor: new Float32Array(INITIAL_CAPACITY * 3),
      windowSeed,
      windowActive,
    };
  }

  /**
   * One MeshStandardNodeMaterial per archetype (TSL), so window-emissive +
   * day facade + night body tint cost zero extra draw calls. emissiveNode
   * is the night system. colorNode is the day facade — family wall base,
   * mullions/window panes reading the SAME col/row/windowSeed grid the night
   * code derives (so a cell that can glow at night is the same rectangle that
   * reads as glass by day), ground-floor storefront + entrance,
   * spandrel/corrugation/accent per family, and a parapet lip over a distinct
   * roof plate — multiplied by the nightFactor-driven dark blue-grey lerp.
   */
  private createMaterial(entry: BuildingCatalogEntry): MeshStandardNodeMaterial {
    const material = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
    const { cols, rows } = windowGridSize(entry);
    const isIndustrial = entry.category === 'ind';

    // Archetype-level facade parameters: family/windowInset/spandrel
    // never vary per instance, so buildingId is an unused placeholder here.
    // (wallColor/roofColor from this SAME call are per-instance in spirit —
    // they need a real buildingId — so they're not read from this result;
    // the per-instance jitter/rotation is instead mirrored below as TSL hash
    // nodes reading the real aBuildingId attribute, exactly like the night
    // code already mirrors windowHash's CPU formula with the TSL `hash()`.)
    const { family, windowInset, spandrel } = deriveFacadeParams(entry, 0);
    const groundBandThreshold = groundFloorBand(entry.height);
    const parapetThreshold = parapetBand(entry.height);

    const buildingIdAttr = attribute<'float'>('aBuildingId', 'float');
    const activeAttr = attribute<'float'>('aActive', 'float');

    const uvNode = uv();
    const col = floor(uvNode.x.mul(cols));
    const row = floor(uvNode.y.mul(rows));
    const windowIndex = row.mul(cols).add(col);
    const windowSeed = buildingIdAttr.mul(WINDOW_SEED_SLOTS).add(windowIndex);

    const litThreshold = hash(windowSeed);
    const fractionSeed = buildingIdAttr.mul(WINDOW_SEED_SLOTS).add(WINDOW_FRACTION_SLOT);
    const litFraction = float(NIGHT_WINDOW_LIT_MIN).add(
      hash(fractionSeed).mul(NIGHT_WINDOW_LIT_MAX - NIGHT_WINDOW_LIT_MIN),
    );
    const isLit = litThreshold.lessThan(this.nightFactorUniform.mul(litFraction));

    const isWall = abs(normalLocal.y).lessThan(0.5); // roof/floor caps never show windows
    const colorSeed = windowSeed.mul(7.0).add(3.0); // decorrelated from the lit threshold above
    const isCool = hash(colorSeed).lessThan(WINDOW_COOL_PROBABILITY);
    const warmColor = new THREE.Color(WARM_WINDOW_COLOR);
    const coolColor = new THREE.Color(COOL_WINDOW_COLOR);
    const windowColorNode = select(
      isCool,
      vec3(coolColor.r, coolColor.g, coolColor.b),
      vec3(warmColor.r, warmColor.g, warmColor.b),
    );

    // --- night emissive ---------------------------------------------------
    const gate = isWall.and(isLit).and(activeAttr.greaterThan(0.5));
    const emissiveOn = windowColorNode.mul(this.nightFactorUniform).mul(WINDOW_EMISSIVE_STRENGTH);
    material.emissiveNode = select(gate, emissiveOn, vec3(0, 0, 0));

    // --- day facade -------------------------------------------------------
    const wallColorNode = buildWallColorNode(entry, buildingIdAttr, isIndustrial);
    const roofColorNode = buildRoofColorNode(buildingIdAttr, wallColorNode, isIndustrial);

    const isGroundFloor = uvNode.y.lessThan(groundBandThreshold);
    const isParapet = uvNode.y.greaterThan(1 - parapetThreshold);

    // Solid wall base (the frame/mullion color where there is no pane):
    // industrial gets a fine corrugated stripe ripple; masonry gets
    // a darker spandrel band at every floor edge.
    let solidWall: Node<'vec3'> = wallColorNode;
    if (isIndustrial) {
      const corrugation = sin(uvNode.x.mul(CORRUGATION_FREQUENCY)).mul(0.5).add(0.5);
      solidWall = wallColorNode.mul(mix(CORRUGATION_MIN, CORRUGATION_MAX, corrugation));
    }
    if (spandrel) {
      const rowFrac = fract(uvNode.y.mul(rows));
      const nearRowEdge = rowFrac
        .lessThan(SPANDREL_BAND_FRACTION)
        .or(rowFrac.greaterThan(1 - SPANDREL_BAND_FRACTION));
      solidWall = select(nearRowEdge, wallColorNode.mul(SPANDREL_DARKEN), solidWall);
    }

    // Window pane vs frame: windowInset (punched vs curtain-wall) and the
    // ground floor's taller storefront glazing both just change the inset
    // margin; industrial additionally thins the pane population itself
    // ("sparse small windows") via an independently-salted hash, so the
    // night lit-gate above is never touched.
    const cellU = fract(uvNode.x.mul(cols));
    const cellV = fract(uvNode.y.mul(rows));
    const baseMargin = isIndustrial
      ? MULLION_MARGIN_INDUSTRIAL
      : windowInset
        ? MULLION_MARGIN_PUNCHED
        : MULLION_MARGIN_CURTAIN;
    const margin = select(isGroundFloor, float(MULLION_MARGIN_GROUND_FLOOR), float(baseMargin));
    const insidePaneX = cellU.greaterThan(margin).and(cellU.lessThan(float(1).sub(margin)));
    const insidePaneY = cellV.greaterThan(margin).and(cellV.lessThan(float(1).sub(margin)));
    let isPane: Node<'bool'> = insidePaneX.and(insidePaneY);
    if (isIndustrial) {
      const existsSeed = windowSeed.mul(WINDOW_EXISTS_SALT_MUL).add(WINDOW_EXISTS_SALT_ADD);
      isPane = isPane.and(hash(existsSeed).lessThan(INDUSTRIAL_WINDOW_DENSITY));
    }

    const reflectanceSeed = windowSeed
      .mul(WINDOW_REFLECTANCE_SALT_MUL)
      .add(WINDOW_REFLECTANCE_SALT_ADD);
    const reflectance = hash(reflectanceSeed);
    const glassBase = family === 'glass' ? GLASS_TINT_CURTAIN : GLASS_TINT_PUNCHED;
    const glassColor = vec3(...glassBase).mul(
      mix(GLASS_REFLECTANCE_MIN, GLASS_REFLECTANCE_MAX, reflectance),
    );
    const frameColor = select(
      isGroundFloor,
      vec3(...DARK_STOREFRONT_FRAME),
      solidWall.mul(FRAME_DARKEN),
    );

    // Boarded/plain look for Constructing/Abandoned instances reuses the
    // EXISTING aActive attribute (no new per-instance data): glazing only
    // renders for Active buildings ("Abandoned: boarded dark cells"),
    // layering on top of instanceColor's existing dark/grey state tint.
    const paneColor = select(activeAttr.greaterThan(0.5), glassColor, frameColor);
    let wallWithWindows: Node<'vec3'> = select(isPane, paneColor, frameColor);

    // Industrial accent stripe band at 2/3 height, red or blue by hash.
    if (isIndustrial) {
      const accentSeed = buildingIdAttr
        .mul(FACADE_HASH_SLOT_MULTIPLIER)
        .add(HASH_SLOT_INDUSTRIAL_ACCENT);
      const accentColor = select(
        hash(accentSeed).lessThan(0.5),
        vec3(...ACCENT_RED),
        vec3(...ACCENT_BLUE),
      );
      const isAccentBand = uvNode.y
        .greaterThan(INDUSTRIAL_ACCENT_HEIGHT_FRACTION - INDUSTRIAL_ACCENT_HALF_THICKNESS)
        .and(
          uvNode.y.lessThan(INDUSTRIAL_ACCENT_HEIGHT_FRACTION + INDUSTRIAL_ACCENT_HALF_THICKNESS),
        );
      wallWithWindows = select(isAccentBand, accentColor, wallWithWindows);
    }

    // Entrance rectangle: one fixed local face. `normalLocal` is the
    // per-instance ROTATED normal for InstancedMesh (three.js's node
    // material auto-wires an `instance()` vertex stage that reassigns
    // normalLocal by the instance matrix before any material graph runs —
    // see three's nodes/accessors/Instance.js), so "local -Z" here means
    // "whichever physical face THIS instance's rotation turned to face
    // world -Z" — correct for any of the 4 rotation values without needing
    // to read rotation directly (rotation-aware).
    const isEntranceFace = normalLocal.z.lessThan(-0.5);
    const isEntranceX = uvNode.x
      .greaterThan(0.5 - ENTRANCE_HALF_WIDTH)
      .and(uvNode.x.lessThan(0.5 + ENTRANCE_HALF_WIDTH));
    const isEntranceY = uvNode.y.lessThan(groundBandThreshold * ENTRANCE_HEIGHT_FRACTION);
    const isEntrance = isEntranceFace.and(isEntranceX).and(isEntranceY);
    const withEntrance = select(isEntrance, vec3(...DOOR_COLOR), wallWithWindows);

    // Parapet lip always wins at the very top edge.
    const parapetColor = isIndustrial
      ? roofColorNode.mul(ROOF_CAP_DARKEN)
      : solidWall.mul(PARAPET_DARKEN);
    const wallExpression = select(isParapet, parapetColor, withEntrance);

    const dayColorNode = select(isWall, wallExpression, roofColorNode);
    const nightTint = mix(vec3(1, 1, 1), vec3(...NIGHT_BODY_TINT), this.nightFactorUniform);
    material.colorNode = dayColorNode.mul(nightTint);

    return material;
  }

  /**
   * For plinth-designated catalog ids (utilitykits.ts owns their real visual
   * identity), the facade box collapses to a low slab — this is the material
   * that goes with it: a PLAIN, flat, desaturated concrete tone from the
   * catalog color, with only the shared night body-tint multiply on top.
   * Deliberately NO window/facade graph at all (no attribute()/hash() reads,
   * no emissiveNode assignment) — a plinth must never show glowing office
   * windows. emissiveNode therefore stays at NodeMaterial's own default
   * (null), unlike createMaterial's buckets above.
   */
  private createPlinthMaterial(entry: BuildingCatalogEntry): MeshStandardNodeMaterial {
    const material = new MeshStandardNodeMaterial({ roughness: 1, metalness: 0 });
    const catalogColor = new THREE.Color(entry.color);
    const { s: originalSaturation } = rgbToHsl(catalogColor.r, catalogColor.g, catalogColor.b);
    const saturationAdjustment =
      originalSaturation > MAX_WALL_SATURATION ? MAX_WALL_SATURATION / originalSaturation : 1;
    const desaturated = saturation(
      vec3(catalogColor.r, catalogColor.g, catalogColor.b),
      saturationAdjustment,
    );
    const nightTint = mix(vec3(1, 1, 1), vec3(...NIGHT_BODY_TINT), this.nightFactorUniform);
    material.colorNode = desaturated.mul(nightTint);
    return material;
  }

  private createMesh(material: MeshStandardNodeMaterial, capacity: number): BucketMesh {
    const geometry = this.geometry.clone(); // per-bucket: each archetype's window-seed attribute is its own
    const windowSeed = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    const windowActive = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    geometry.setAttribute('aBuildingId', windowSeed);
    geometry.setAttribute('aActive', windowActive);

    const mesh = new THREE.InstancedMesh(geometry, material, capacity);
    mesh.count = 0;
    // Shadow sweep: building bodies both receive the sun's shadow
    // (props/lamps/trees fall onto their walls) and cast their own onto
    // the streets — one instanced draw per archetype bucket keeps it cheap.
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const colorArray = new Float32Array(capacity * 3).fill(1);
    mesh.instanceColor = new THREE.InstancedBufferAttribute(colorArray, 3);
    return { mesh, windowSeed, windowActive };
  }

  private grow(bucket: Bucket): void {
    const oldCapacity = bucket.capacity;
    const newCapacity = oldCapacity * 2;
    const {
      mesh: newMesh,
      windowSeed: newWindowSeed,
      windowActive: newWindowActive,
    } = this.createMesh(bucket.material, newCapacity);

    newMesh.instanceMatrix.array.set(bucket.mesh.instanceMatrix.array);
    if (bucket.mesh.instanceColor && newMesh.instanceColor) {
      newMesh.instanceColor.array.set(bucket.mesh.instanceColor.array);
    }
    newWindowSeed.array.set(bucket.windowSeed.array);
    newWindowActive.array.set(bucket.windowActive.array);
    newMesh.count = bucket.mesh.count;

    this.scene.remove(bucket.mesh);
    this.scene.add(newMesh);
    bucket.mesh = newMesh;
    bucket.windowSeed = newWindowSeed;
    bucket.windowActive = newWindowActive;
    bucket.capacity = newCapacity;

    bucket.slotToId.length = newCapacity;
    bucket.slotToId.fill(0, oldCapacity, newCapacity);
    bucket.idColor = buildIdColorArray(bucket.slotToId);
  }

  private upsert(instance: BuildingInstance, touched: Set<Bucket>): void {
    const currentCatalogId = this.idLocation.get(instance.id);
    if (currentCatalogId !== undefined && currentCatalogId !== instance.catalogId) {
      // Leveled up / down into a different catalog entry: migrate buckets.
      this.removeId(instance.id, touched);
    }

    const bucket = this.buckets.get(instance.catalogId);
    if (!bucket) {
      throw new Error(`BuildingInstancer: unknown catalogId "${instance.catalogId}"`);
    }

    let slot = bucket.idToSlot.get(instance.id);
    if (slot === undefined) {
      if (bucket.count === bucket.capacity) this.grow(bucket);
      slot = bucket.count;
      bucket.count += 1;
      bucket.idToSlot.set(instance.id, slot);
      bucket.slotToId[slot] = instance.id;
      this.idLocation.set(instance.id, instance.catalogId);
    }

    this.writeInstance(bucket, slot, instance);
    touched.add(bucket);
  }

  private removeId(id: number, touched: Set<Bucket>): void {
    const catalogId = this.idLocation.get(id);
    if (catalogId === undefined) return;
    const bucket = this.buckets.get(catalogId);
    if (!bucket) {
      this.idLocation.delete(id);
      return;
    }
    const slot = bucket.idToSlot.get(id);
    if (slot === undefined) {
      this.idLocation.delete(id);
      return;
    }

    const lastSlot = bucket.count - 1;
    if (slot !== lastSlot) {
      this.copySlot(bucket, lastSlot, slot);
      const movedId = this.slotId(bucket, lastSlot);
      bucket.idToSlot.set(movedId, slot);
      bucket.slotToId[slot] = movedId;
    }

    bucket.idToSlot.delete(id);
    bucket.count -= 1;
    this.idLocation.delete(id);
    touched.add(bucket);
  }

  private slotId(bucket: Bucket, slot: number): number {
    const id = bucket.slotToId[slot];
    if (id === undefined) throw new RangeError(`BuildingInstancer: slot ${slot} has no id`);
    return id;
  }

  private copySlot(bucket: Bucket, from: number, to: number): void {
    bucket.mesh.getMatrixAt(from, _matrix);
    bucket.mesh.setMatrixAt(to, _matrix);
    bucket.mesh.getColorAt(from, _color);
    bucket.mesh.setColorAt(to, _color);
    bucket.idColor[to * 3] = bucket.idColor[from * 3] ?? 0;
    bucket.idColor[to * 3 + 1] = bucket.idColor[from * 3 + 1] ?? 0;
    bucket.idColor[to * 3 + 2] = bucket.idColor[from * 3 + 2] ?? 0;
    bucket.windowSeed.array[to] = bucket.windowSeed.array[from] ?? 0;
    bucket.windowActive.array[to] = bucket.windowActive.array[from] ?? 0;
  }

  private writeInstance(bucket: Bucket, slot: number, instance: BuildingInstance): void {
    const entry = bucket.entry;
    const heightScale =
      instance.state === BuildingState.Constructing ? CONSTRUCTING_HEIGHT_SCALE : 1;
    // Plinth-designated ids collapse to a low slab (picking/outline/bulldoze
    // keep working through this same instancer path) while utilitykits.ts
    // carries the real visual identity beside it.
    const baseHeight = this.plinthIds.has(entry.id)
      ? Math.max(PLINTH_MIN_HEIGHT, entry.height * PLINTH_HEIGHT_FRACTION)
      : entry.height;
    const height = baseHeight * heightScale;
    const spanX = entry.footprint.w * TILE_METERS * FOOTPRINT_SHRINK;
    const spanZ = entry.footprint.d * TILE_METERS * FOOTPRINT_SHRINK;
    const centerX = (instance.x + entry.footprint.w / 2) * TILE_METERS;
    const centerZ = (instance.z + entry.footprint.d / 2) * TILE_METERS;
    const groundY = this.heightAt(centerX, centerZ);

    _position.set(centerX, groundY + height / 2, centerZ);
    _quaternion.setFromAxisAngle(_yAxis, instance.rotation * (Math.PI / 2));
    _scale.set(spanX, height, spanZ);
    _matrix.compose(_position, _quaternion, _scale);
    bucket.mesh.setMatrixAt(slot, _matrix);

    const [tr, tg, tb] = tintFor(instance.state);
    _color.setRGB(tr, tg, tb);
    bucket.mesh.setColorAt(slot, _color);

    const [r, g, b] = encodeId(instance.id);
    bucket.idColor[slot * 3] = r / 255;
    bucket.idColor[slot * 3 + 1] = g / 255;
    bucket.idColor[slot * 3 + 2] = b / 255;

    bucket.windowSeed.array[slot] = instance.id;
    bucket.windowActive.array[slot] = isBuildingLitEligible(instance.state) ? 1 : 0;
  }
}
