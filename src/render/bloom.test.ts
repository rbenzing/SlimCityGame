import * as THREE from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { describe, expect, it, vi } from 'vitest';
import {
  clampBloomStrength,
  createBloomPipeline,
  MAX_BLOOM_STRENGTH,
  MIN_BLOOM_STRENGTH,
} from './bloom';

/** A renderer stub complete enough for the real three/webgpu PostProcessing
 * pipeline to build AND run entirely off-GPU: RenderPipeline.render() only
 * ever touches `.toneMapping`, `.outputColorSpace`, `.xr.enabled`, and
 * finally hands off to `.render(mesh, camera)` (QuadMesh.render's one line),
 * so a plain object with those four members is enough — no real GPU. */
function capableRendererStub(): WebGPURenderer {
  return {
    toneMapping: THREE.NoToneMapping,
    outputColorSpace: THREE.SRGBColorSpace,
    xr: { enabled: false },
    render: vi.fn(),
  } as unknown as WebGPURenderer;
}

/** Missing `.xr`: real construction still succeeds (it's lazy), but the
 * first real `.render()` call throws inside RenderPipeline.render() when it
 * reads `renderer.xr.enabled` — a genuine, deterministic runtime failure
 * with no test-only mocking of three's internals. */
function incompleteRendererStub(): WebGPURenderer {
  return {
    toneMapping: THREE.NoToneMapping,
    outputColorSpace: THREE.SRGBColorSpace,
    render: vi.fn(),
  } as unknown as WebGPURenderer;
}

describe('clampBloomStrength (pure)', () => {
  it('passes values already inside [MIN_BLOOM_STRENGTH, MAX_BLOOM_STRENGTH] through unchanged', () => {
    expect(clampBloomStrength(1.2)).toBe(1.2);
  });

  it('clamps below MIN_BLOOM_STRENGTH up to MIN_BLOOM_STRENGTH', () => {
    expect(clampBloomStrength(-5)).toBe(MIN_BLOOM_STRENGTH);
  });

  it('clamps above MAX_BLOOM_STRENGTH down to MAX_BLOOM_STRENGTH', () => {
    expect(clampBloomStrength(999)).toBe(MAX_BLOOM_STRENGTH);
  });
});

describe('createBloomPipeline — real three/webgpu + TSL graph (no real GPU, capable stub)', () => {
  it('builds the real bloom node graph and reports isActive true', () => {
    const renderer = capableRendererStub();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();

    const pipeline = createBloomPipeline(renderer, scene, camera);

    expect(pipeline.isActive).toBe(true);
  });

  it('render() drives the real pipeline without touching renderer.render() directly, and never throws', () => {
    const renderer = capableRendererStub();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();

    const pipeline = createBloomPipeline(renderer, scene, camera);
    expect(() => pipeline.render()).not.toThrow();

    // The real graph ends up calling renderer.render(quadMesh, camera)
    // internally (RenderPipeline's full-screen composite quad) — it is
    // still the plain scene/camera passthrough that must never be called
    // directly by createBloomPipeline itself while the real graph is active.
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.render).not.toHaveBeenCalledWith(scene, camera);
  });

  it('setStrength clamps and never throws against the real graph', () => {
    const renderer = capableRendererStub();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();

    const pipeline = createBloomPipeline(renderer, scene, camera);
    expect(() => pipeline.setStrength(-5)).not.toThrow();
    expect(() => pipeline.setStrength(999)).not.toThrow();
    expect(() => pipeline.render()).not.toThrow();
  });

  it('dispose() frees the real pipeline and demotes isActive to false', () => {
    const renderer = capableRendererStub();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();

    const pipeline = createBloomPipeline(renderer, scene, camera);
    expect(pipeline.isActive).toBe(true);

    pipeline.dispose();
    expect(pipeline.isActive).toBe(false);

    // Safe to call render() after dispose: falls back to the plain scene render.
    expect(() => pipeline.render()).not.toThrow();
    expect(renderer.render).toHaveBeenCalledWith(scene, camera);
  });
});

describe('createBloomPipeline — graceful degradation (never crashes the frame loop)', () => {
  it('demotes to a passthrough immediately when the node graph fails to build', () => {
    const renderer = capableRendererStub();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const throwingBuilder = vi.fn(() => {
      throw new Error('node graph construction failed');
    });

    const pipeline = createBloomPipeline(renderer, scene, camera, throwingBuilder);

    expect(throwingBuilder).toHaveBeenCalledWith(renderer, scene, camera);
    expect(pipeline.isActive).toBe(false);

    expect(() => pipeline.render()).not.toThrow();
    expect(renderer.render).toHaveBeenCalledWith(scene, camera);
  });

  it('setStrength() and dispose() are safe no-ops in the fallback path', () => {
    const renderer = capableRendererStub();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const throwingBuilder = (): never => {
      throw new Error('boom');
    };

    const pipeline = createBloomPipeline(renderer, scene, camera, throwingBuilder);

    expect(() => pipeline.setStrength(1.5)).not.toThrow();
    expect(() => pipeline.dispose()).not.toThrow();
    expect(pipeline.isActive).toBe(false);
  });

  it('demotes to a passthrough after a genuine runtime render failure (real graph, incomplete renderer)', () => {
    const renderer = incompleteRendererStub(); // no `.xr` — RenderPipeline.render() will throw
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();

    const pipeline = createBloomPipeline(renderer, scene, camera);
    expect(pipeline.isActive).toBe(true); // construction is lazy, always succeeds here

    expect(() => pipeline.render()).not.toThrow(); // first render() hits the real throw, caught internally
    expect(pipeline.isActive).toBe(false);
    expect(renderer.render).toHaveBeenCalledWith(scene, camera); // fell back within the same call

    // Subsequent frames stay on the passthrough — no repeated attempts to
    // rebuild or re-run the broken graph.
    (renderer.render as ReturnType<typeof vi.fn>).mockClear();
    expect(() => pipeline.render()).not.toThrow();
    expect(renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.render).toHaveBeenCalledWith(scene, camera);
  });
});

describe('createBloomPipeline — strength forwarding via an injected fake graph', () => {
  function fakeGraphBuilder(): {
    postProcessing: {
      render: ReturnType<typeof vi.fn<() => void>>;
      dispose: ReturnType<typeof vi.fn<() => void>>;
    };
    strengthUniform: { value: number };
  } {
    return {
      postProcessing: { render: vi.fn<() => void>(), dispose: vi.fn<() => void>() },
      strengthUniform: { value: 0 },
    };
  }

  it('forwards a clamped setStrength() value onto the bloom node strength uniform', () => {
    const renderer = capableRendererStub();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const graph = fakeGraphBuilder();

    const pipeline = createBloomPipeline(renderer, scene, camera, () => graph);

    pipeline.setStrength(1.75);
    expect(graph.strengthUniform.value).toBe(1.75);

    pipeline.setStrength(-10);
    expect(graph.strengthUniform.value).toBe(MIN_BLOOM_STRENGTH);

    pipeline.setStrength(50);
    expect(graph.strengthUniform.value).toBe(MAX_BLOOM_STRENGTH);
  });

  it('render() calls the injected graph postProcessing.render(), not renderer.render()', () => {
    const renderer = capableRendererStub();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const graph = fakeGraphBuilder();

    const pipeline = createBloomPipeline(renderer, scene, camera, () => graph);
    pipeline.render();

    expect(graph.postProcessing.render).toHaveBeenCalledTimes(1);
    expect(renderer.render).not.toHaveBeenCalled();
  });

  it('dispose() calls the injected graph postProcessing.dispose()', () => {
    const renderer = capableRendererStub();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const graph = fakeGraphBuilder();

    const pipeline = createBloomPipeline(renderer, scene, camera, () => graph);
    pipeline.dispose();

    expect(graph.postProcessing.dispose).toHaveBeenCalledTimes(1);
  });
});
