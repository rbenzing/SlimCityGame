/**
 * The water system as the underground shows it: every carrier of water,
 * drawn as the pipe it is, on the ground under the glass surface.
 *
 * A pipe is buried, so nothing on the surface ever shows it. Underground,
 * each carrier is a strip through its tile's centre, joined to the orthogonal
 * neighbours that carry water, split lengthwise into a run for the water
 * going out and a run beside it for the sewage coming back: one pipe, both
 * flows. The water run is blue where the water reaches the tile and grey
 * where it does not; the sewer run brown where a drain reaches it and grey
 * where none does, so a break in the network reads as a run going grey.
 *
 * The town's own mains, under every street that carries water, are drawn
 * muted; the pipes the player laid are drawn bright, since they are the part
 * the player is responsible for. A served building hangs off the system by a
 * short lead from its street, and each water building shows a riser, the
 * point where the buried system comes up into it.
 *
 * The strips conform to the terrain the way the zone grid's lines do and sit
 * under the road plates, so at the surface a street covers its main, and
 * underground, with the plates gone to glass, the main shows through.
 * Visible only while the city is underground; `setVisible` is the only thing
 * that changes that.
 */
import * as THREE from 'three';
import type { TilePoint } from '../shared/types';
import { TILE_METERS } from '../shared/constants';

/** Under the road plates (0.15), the brown a hair over the blue so their crossings never fight. */
const WATER_Y_OFFSET = 0.05;
const SEWER_Y_OFFSET = 0.06;
/** Each flow's strip, and how far either side of the tile's centre line it runs. */
export const PIPE_STRIP_WIDTH_M = 1.2;
export const PIPE_STRIP_OFFSET_M = 0.9;
/** The hub every pipe tile draws, joined or not, so a lone tile still shows. */
const HUB_HALF_M = 1.5;
/** How far a building's lead runs into its lot past the road tile's edge. */
export const LEAD_INTO_LOT_M = 2;
const PIPE_OPACITY = 0.85;
/** A main is the town's, not the player's: drawn at a share of the pipe's opacity. */
export const MAIN_OPACITY_SHARE = 0.6;
/** The riser: a short square stub where the system comes up into a water building. */
export const RISER_SIDE_M = 3;
export const RISER_HEIGHT_M = 2.5;

/** The lens's water accent, a drain-brown beside it, and the grey of a run nothing reaches. */
const WATER_RGB = 0x38b6e3;
const SEWER_RGB = 0x8a5a2b;
const DRY_RGB = 0x6b6f73;

type HeightSampler = (x: number, z: number) => number;

const ORTHOGONAL: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** A building's connection to the system: from the road tile, one step into the lot. */
export interface PipeLead {
  /** The road tile the lead leaves from. */
  x: number;
  z: number;
  /** The step from the road tile into the lot: one of the four directions. */
  dx: number;
  dz: number;
}

/** A riser's run out to a carrier beyond its building's edge. */
export interface PipeConnection {
  run: readonly TilePoint[];
  /** The step from the run's last tile out to the carrier. */
  dx: number;
  dz: number;
}

/** What the renderer reads of the system; everything else is derived here. */
export interface PipeSystemView {
  /** The tiles the player laid pipe on. */
  pipes: readonly TilePoint[];
  /** The street tiles whose main carries water. */
  mains: readonly TilePoint[];
  /** The leads from the mains and pipes into the buildings they serve. */
  leads: readonly PipeLead[];
  /** The risers of the water buildings, at a tile each. */
  risers: readonly TilePoint[];
  /**
   * From each riser out through its building's footprint to an edge tile a
   * pipe or a main lies beyond: a run of tiles, the riser's first, the edge
   * tile last, and the step from that tile out to the carrier, which draws
   * its own arm in.
   */
  connections: readonly PipeConnection[];
  /** Whether the tile carries water at all: a pipe, a main, or a building it feeds. */
  carriesWater(x: number, z: number): boolean;
  /** Whether the water reaches the tile, and whether a drain does. */
  wet(x: number, z: number): boolean;
  drained(x: number, z: number): boolean;
}

/**
 * Two triangles over the quad (x0,z0)-(x1,z1), each corner sampled through
 * `heightAt` + yOffset, split on the terrain's own diagonal (see zonegrid.ts),
 * in one flat colour.
 */
function pushConformingQuad(
  positions: number[],
  colors: number[],
  heightAt: HeightSampler,
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  yOffset: number,
  rgb: readonly [number, number, number],
): void {
  const y00 = heightAt(x0, z0) + yOffset;
  const y10 = heightAt(x1, z0) + yOffset;
  const y11 = heightAt(x1, z1) + yOffset;
  const y01 = heightAt(x0, z1) + yOffset;
  positions.push(x0, y00, z0, x0, y01, z1, x1, y10, z0);
  positions.push(x0, y01, z1, x1, y11, z1, x1, y10, z0);
  for (let i = 0; i < 6; i++) colors.push(rgb[0], rgb[1], rgb[2]);
}

function rgbOf(hex: number): readonly [number, number, number] {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
}

const WATER = rgbOf(WATER_RGB);
const SEWER = rgbOf(SEWER_RGB);
const DRY = rgbOf(DRY_RGB);

/**
 * The strips a carrier tile draws, in tile-local metres: a hub at the centre
 * and an arm out to each edge whose neighbour carries water. Each strip is
 * given as (x0, z0, x1, z1) for the blue run; the brown run is the same
 * rectangle shifted to the other side of the centre line. Pure and exported
 * for tests.
 */
export function pipeStrips(joins: {
  east: boolean;
  west: boolean;
  south: boolean;
  north: boolean;
}): Array<readonly [number, number, number, number]> {
  const mid = TILE_METERS / 2;
  const half = PIPE_STRIP_WIDTH_M / 2;
  const off = PIPE_STRIP_OFFSET_M;
  const out: Array<readonly [number, number, number, number]> = [];
  // Along X: the strip lies off the centre line in Z; along Z, off it in X.
  const alongX = (x0: number, x1: number): readonly [number, number, number, number] => [
    x0,
    mid - off - half,
    x1,
    mid - off + half,
  ];
  const alongZ = (z0: number, z1: number): readonly [number, number, number, number] => [
    mid - off - half,
    z0,
    mid - off + half,
    z1,
  ];
  // The hub lies along the axes the arms leave on, so a straight run is one
  // unbroken strip and never a run of cross ticks; a lone tile draws both.
  const alone = !joins.east && !joins.west && !joins.south && !joins.north;
  if (alone || joins.east || joins.west) out.push(alongX(mid - HUB_HALF_M, mid + HUB_HALF_M));
  if (alone || joins.south || joins.north) out.push(alongZ(mid - HUB_HALF_M, mid + HUB_HALF_M));
  if (joins.east) out.push(alongX(mid, TILE_METERS));
  if (joins.west) out.push(alongX(0, mid));
  if (joins.south) out.push(alongZ(mid, TILE_METERS));
  if (joins.north) out.push(alongZ(0, mid));
  return out;
}

/**
 * The strip a lead draws, in metres local to its road tile: from the tile's
 * centre out past the edge the lot lies beyond, `LEAD_INTO_LOT_M` into it.
 * Pure and exported for tests.
 */
export function leadStrip(dx: number, dz: number): readonly [number, number, number, number] {
  const mid = TILE_METERS / 2;
  const half = PIPE_STRIP_WIDTH_M / 2;
  const off = PIPE_STRIP_OFFSET_M;
  const reach = TILE_METERS + LEAD_INTO_LOT_M;
  if (dx === 1) return [mid, mid - off - half, reach, mid - off + half];
  if (dx === -1) return [TILE_METERS - reach, mid - off - half, mid, mid - off + half];
  if (dz === 1) return [mid - off - half, mid, mid - off + half, reach];
  return [mid - off - half, TILE_METERS - reach, mid - off + half, mid];
}

/** One of the four meshes: the two flows of the pipes, and the two of the mains. */
interface FlowMesh {
  mesh: THREE.Mesh;
  positions: number[];
  colors: number[];
}

export class PipeOverlayRenderer {
  private readonly pipeWater: FlowMesh;
  private readonly pipeSewer: FlowMesh;
  private readonly mainWater: FlowMesh;
  private readonly mainSewer: FlowMesh;
  private risers: THREE.InstancedMesh;
  private readonly heightAt: HeightSampler;
  private visible = false;

  constructor(scene: THREE.Scene, heightAt: HeightSampler) {
    this.heightAt = heightAt;
    const flow = (opacity: number): FlowMesh => {
      const mesh = new THREE.Mesh(
        new THREE.BufferGeometry(),
        new THREE.MeshBasicMaterial({
          vertexColors: true,
          transparent: true,
          opacity,
          depthWrite: false,
        }),
      );
      mesh.visible = false;
      mesh.renderOrder = 2;
      mesh.userData['underground'] = 'keep';
      scene.add(mesh);
      return { mesh, positions: [], colors: [] };
    };
    this.pipeWater = flow(PIPE_OPACITY);
    this.pipeSewer = flow(PIPE_OPACITY);
    this.mainWater = flow(PIPE_OPACITY * MAIN_OPACITY_SHARE);
    this.mainSewer = flow(PIPE_OPACITY * MAIN_OPACITY_SHARE);
    this.risers = new THREE.InstancedMesh(
      new THREE.BoxGeometry(RISER_SIDE_M, RISER_HEIGHT_M, RISER_SIDE_M),
      new THREE.MeshBasicMaterial({ color: WATER_RGB, transparent: true, opacity: PIPE_OPACITY }),
      1,
    );
    this.risers.count = 0;
    this.risers.visible = false;
    this.risers.renderOrder = 2;
    this.risers.userData['underground'] = 'keep';
    scene.add(this.risers);
  }

  /** Rebuilds every strip and riser from what the system view says. */
  rebuild(view: PipeSystemView): void {
    for (const f of [this.pipeWater, this.pipeSewer, this.mainWater, this.mainSewer]) {
      f.positions = [];
      f.colors = [];
    }
    for (const { x, z } of view.pipes) this.pushCarrier(view, x, z, this.pipeWater, this.pipeSewer);
    for (const { x, z } of view.mains) this.pushCarrier(view, x, z, this.mainWater, this.mainSewer);
    for (const lead of view.leads) this.pushLead(view, lead);
    for (const run of view.connections) this.pushConnection(view, run);
    for (const f of [this.pipeWater, this.pipeSewer, this.mainWater, this.mainSewer]) {
      this.replace(f);
    }
    this.placeRisers(view.risers);
  }

  /** The only thing that shows or hides the overlay, so a rebuild never undoes it. */
  setVisible(visible: boolean): void {
    this.visible = visible;
    for (const f of [this.pipeWater, this.pipeSewer, this.mainWater, this.mainSewer]) {
      f.mesh.visible = visible;
    }
    this.risers.visible = visible;
  }

  isVisible(): boolean {
    return this.visible;
  }

  /** Triangles drawn for each flow, pipes and mains apart — for tests and read-backs. */
  triangleCount(): { water: number; sewer: number; mainWater: number; mainSewer: number } {
    const count = (f: FlowMesh): number =>
      (f.mesh.geometry.getAttribute('position')?.count ?? 0) / 3;
    return {
      water: count(this.pipeWater),
      sewer: count(this.pipeSewer),
      mainWater: count(this.mainWater),
      mainSewer: count(this.mainSewer),
    };
  }

  /** How many risers stand — for tests and read-backs. */
  riserCount(): number {
    return this.risers.count;
  }

  /** The colour of the water run's first vertex over tile (x, z), or null when none is drawn. */
  waterColorAt(x: number, z: number): [number, number, number] | null {
    for (const f of [this.pipeWater, this.mainWater]) {
      const pos = f.mesh.geometry.getAttribute('position');
      const col = f.mesh.geometry.getAttribute('color');
      if (!pos || !col) continue;
      // An arm ends exactly on the tile line; nudged back, it counts for its own tile.
      const tileOf = (m: number): number => Math.floor((m - 0.5) / TILE_METERS);
      for (let i = 0; i < pos.count; i++) {
        if (tileOf(pos.getX(i)) === x && tileOf(pos.getZ(i)) === z) {
          return [col.getX(i), col.getY(i), col.getZ(i)];
        }
      }
    }
    return null;
  }

  dispose(): void {
    for (const f of [this.pipeWater, this.pipeSewer, this.mainWater, this.mainSewer]) {
      f.mesh.geometry.dispose();
      (f.mesh.material as THREE.Material).dispose();
      f.mesh.parent?.remove(f.mesh);
    }
    this.risers.geometry.dispose();
    (this.risers.material as THREE.Material).dispose();
    this.risers.parent?.remove(this.risers);
  }

  private pushCarrier(
    view: PipeSystemView,
    x: number,
    z: number,
    water: FlowMesh,
    sewer: FlowMesh,
  ): void {
    const [east, west, south, north] = ORTHOGONAL.map(([dx, dz]) =>
      view.carriesWater(x + dx, z + dz),
    ) as [boolean, boolean, boolean, boolean];
    const waterRgb = view.wet(x, z) ? WATER : DRY;
    const sewerRgb = view.drained(x, z) ? SEWER : DRY;
    for (const strip of pipeStrips({ east, west, south, north })) {
      this.pushFlows(x, z, strip, water, waterRgb, sewer, sewerRgb);
    }
  }

  /**
   * A connection runs tile to tile from the riser and, at its last tile, on
   * out to the edge the carrier beyond it joins across; it is coloured by
   * what reaches the riser.
   */
  private pushConnection(view: PipeSystemView, { run, dx, dz }: PipeConnection): void {
    const riser = run[0];
    if (!riser) return;
    const waterRgb = view.wet(riser.x, riser.z) ? WATER : DRY;
    const sewerRgb = view.drained(riser.x, riser.z) ? SEWER : DRY;
    run.forEach((tile, i) => {
      const prev = run[i - 1];
      // Past the last tile the run steps out to the carrier.
      const next = run[i + 1] ?? { x: tile.x + dx, z: tile.z + dz };
      const toward = (t: TilePoint | undefined, sx: number, sz: number): boolean =>
        t !== undefined && t.x - tile.x === sx && t.z - tile.z === sz;
      const joins = {
        east: toward(prev, 1, 0) || toward(next, 1, 0),
        west: toward(prev, -1, 0) || toward(next, -1, 0),
        south: toward(prev, 0, 1) || toward(next, 0, 1),
        north: toward(prev, 0, -1) || toward(next, 0, -1),
      };
      for (const strip of pipeStrips(joins)) {
        this.pushFlows(tile.x, tile.z, strip, this.pipeWater, waterRgb, this.pipeSewer, sewerRgb);
      }
    });
  }

  private pushLead(view: PipeSystemView, lead: PipeLead): void {
    const lotX = lead.x + lead.dx;
    const lotZ = lead.z + lead.dz;
    const waterRgb = view.wet(lotX, lotZ) ? WATER : DRY;
    const sewerRgb = view.drained(lotX, lotZ) ? SEWER : DRY;
    this.pushFlows(
      lead.x,
      lead.z,
      leadStrip(lead.dx, lead.dz),
      this.pipeWater,
      waterRgb,
      this.pipeSewer,
      sewerRgb,
    );
  }

  /** The blue run, and the brown run mirrored across the centre line: an X strip moves in Z, a Z strip in X. */
  private pushFlows(
    x: number,
    z: number,
    [x0, z0, x1, z1]: readonly [number, number, number, number],
    water: FlowMesh,
    waterRgb: readonly [number, number, number],
    sewer: FlowMesh,
    sewerRgb: readonly [number, number, number],
  ): void {
    const baseX = x * TILE_METERS;
    const baseZ = z * TILE_METERS;
    pushConformingQuad(
      water.positions,
      water.colors,
      this.heightAt,
      baseX + x0,
      baseZ + z0,
      baseX + x1,
      baseZ + z1,
      WATER_Y_OFFSET,
      waterRgb,
    );
    const alongX = x1 - x0 > z1 - z0;
    const shift = 2 * PIPE_STRIP_OFFSET_M;
    pushConformingQuad(
      sewer.positions,
      sewer.colors,
      this.heightAt,
      baseX + x0 + (alongX ? 0 : shift),
      baseZ + z0 + (alongX ? shift : 0),
      baseX + x1 + (alongX ? 0 : shift),
      baseZ + z1 + (alongX ? shift : 0),
      SEWER_Y_OFFSET,
      sewerRgb,
    );
  }

  private placeRisers(tiles: readonly TilePoint[]): void {
    if (tiles.length > this.risers.instanceMatrix.count) {
      // Grow by doubling, as every instanced pool does.
      let capacity = Math.max(1, this.risers.instanceMatrix.count);
      while (capacity < tiles.length) capacity *= 2;
      const grown = new THREE.InstancedMesh(this.risers.geometry, this.risers.material, capacity);
      grown.renderOrder = this.risers.renderOrder;
      grown.userData['underground'] = 'keep';
      grown.visible = this.visible;
      this.risers.parent?.add(grown);
      this.risers.parent?.remove(this.risers);
      this.risers = grown;
    }
    const m = new THREE.Matrix4();
    tiles.forEach(({ x, z }, i) => {
      const cx = (x + 0.5) * TILE_METERS;
      const cz = (z + 0.5) * TILE_METERS;
      m.makeTranslation(cx, this.heightAt(cx, cz) + RISER_HEIGHT_M / 2, cz);
      this.risers.setMatrixAt(i, m);
    });
    this.risers.count = tiles.length;
    this.risers.instanceMatrix.needsUpdate = true;
  }

  private replace(f: FlowMesh): void {
    f.mesh.geometry.dispose();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(f.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(f.colors, 3));
    geometry.computeBoundingSphere();
    f.mesh.geometry = geometry;
    f.mesh.visible = this.visible;
  }
}
