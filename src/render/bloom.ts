/**
 * Bloom/glow post-process pass: builds a three/webgpu PostProcessing pipeline with a
 * bloom TSL node over the rendered scene, so emissive windows, lamp heads,
 * and vehicle lights bleed softly at night. All cheap post-FX, no per-pixel
 * tracing. Strength is driven by the caller from the shared nightFactor
 * ramp (scene.ts's timeOfDayColors) — this module owns no time-of-day logic
 * itself.
 *
 * Never crashes the frame loop: whether the node graph fails to *build* or
 * fails on its first real *render* (e.g. a backend that can't run this
 * particular node chain), createBloomPipeline permanently demotes itself to
 * a passthrough that renders the scene directly with no post-FX.
 */
import type * as THREE from 'three';
import { PostProcessing, type WebGPURenderer } from 'three/webgpu';
import { pass } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';

export interface BloomPipeline {
  /** Renders one frame: the full bloom pipeline, or a plain scene render in fallback. */
  render(): void;
  /** Sets bloom strength, clamped to [MIN_BLOOM_STRENGTH, MAX_BLOOM_STRENGTH]. A no-op visually while in fallback. */
  setStrength(strength: number): void;
  /** Frees GPU resources owned by the pipeline. Safe to call more than once; a no-op in fallback. */
  dispose(): void;
  /** True while the real bloom node graph is active; false once built (or demoted) to the passthrough fallback. */
  readonly isActive: boolean;
}

export const MIN_BLOOM_STRENGTH = 0;
export const MAX_BLOOM_STRENGTH = 3;

const BLOOM_RADIUS = 0.4;
const BLOOM_LUMINANCE_THRESHOLD = 0.35;

/** Clamps a caller-supplied bloom strength into the supported range. Pure, exported for reuse/testing. */
export function clampBloomStrength(strength: number): number {
  return Math.min(MAX_BLOOM_STRENGTH, Math.max(MIN_BLOOM_STRENGTH, strength));
}

/**
 * The minimal shape createBloomPipeline needs from a built node graph —
 * deliberately narrower than the real `PostProcessing`/`UniformNode` types
 * so a test can inject a plain stand-in object without constructing real
 * three/webgpu nodes.
 */
interface BloomGraph {
  postProcessing: { render(): void; dispose(): void };
  strengthUniform: { value: number };
}

type BloomGraphBuilder = (
  renderer: WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
) => BloomGraph;

/**
 * Builds the real three/webgpu + TSL bloom node graph. Per the bloom TSL
 * node's own documented usage: a scene pass feeds both the direct output
 * and, threshold-filtered, the bloom node; the two are additively combined
 * as the pipeline's output.
 */
function buildBloomGraph(
  renderer: WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): BloomGraph {
  const postProcessing = new PostProcessing(renderer);
  const scenePass = pass(scene, camera);
  const scenePassColor = scenePass.getTextureNode('output');
  const bloomPass = bloom(scenePassColor, 0, BLOOM_RADIUS, BLOOM_LUMINANCE_THRESHOLD);
  postProcessing.outputNode = scenePassColor.add(bloomPass);
  return { postProcessing, strengthUniform: bloomPass.strength };
}

/**
 * Factory for the bloom post-process pipeline. The
 * integrator drives `setStrength` from nightFactor and calls `render()`
 * once per frame in place of `renderer.render(scene, camera)`.
 *
 * `buildGraph` is an injection point for tests only (defaults to the real
 * three/webgpu + TSL graph builder above) so the graceful-degradation
 * fallback is exercisable deterministically without a real GPU.
 */
export function createBloomPipeline(
  renderer: WebGPURenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  buildGraph: BloomGraphBuilder = buildBloomGraph,
): BloomPipeline {
  let strength = 0;
  let graph: BloomGraph | null = null;

  try {
    graph = buildGraph(renderer, scene, camera);
    graph.strengthUniform.value = strength;
  } catch {
    graph = null;
  }

  const renderPassthrough = (): void => {
    renderer.render(scene, camera);
  };

  return {
    get isActive(): boolean {
      return graph !== null;
    },
    render(): void {
      if (graph === null) {
        renderPassthrough();
        return;
      }
      try {
        graph.postProcessing.render();
      } catch {
        // A real-graph failure at render time (not just construction) —
        // demote permanently so every later frame takes the cheap
        // passthrough path instead of re-throwing every frame.
        graph = null;
        renderPassthrough();
      }
    },
    setStrength(next: number): void {
      strength = clampBloomStrength(next);
      if (graph) graph.strengthUniform.value = strength;
    },
    dispose(): void {
      if (graph) {
        graph.postProcessing.dispose();
        graph = null;
      }
    },
  };
}
