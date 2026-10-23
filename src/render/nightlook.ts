/**
 * The one night tint every sunlit surface reads.
 *
 * At full night the world is a shaded, slightly cool version of its day
 * colour, never black and never a dull afternoon: the facade box, the massing
 * tiers, every kit part (roof, garage, porch, dock, plant, prop), the
 * terrain, the roads, the lots' ground, the park plates and the trees all
 * multiply their colour toward NIGHT_TINT as the night factor rises. The
 * night sky's hemisphere and moon light (scene.ts NIGHT_KEYFRAME) and this
 * tint land the look together — a body at 03:00 reads at 18 to 30% of its
 * noon value and the ground at 12 to 25% in the harness
 * (tools/nightlook-shots.mjs) — so the two are tuned as one dial. Only
 * window panes, a kit's lit parts and the lamps glow; nothing here emits.
 */
import * as THREE from 'three';
import { MeshLambertNodeMaterial } from 'three/webgpu';
import type { Node, UniformNode } from 'three/webgpu';
import { materialColor, mix, vec3 } from 'three/tsl';

/** The night factor as a shader uniform: 0 by day, 1 at full night. */
export type NightFactorUniform = UniformNode<'float', number>;

/**
 * Blue channel highest, red lowest, so the shade reads cool. Relative
 * luminance (0.2126R+0.7152G+0.0722B) ~0.60; the night light does the rest.
 */
export const NIGHT_TINT: readonly [number, number, number] = [0.55, 0.6, 0.78];

/** The multiplier a surface's colour carries: 1 by day, NIGHT_TINT at full night. */
export function nightTintNode(nightFactor: NightFactorUniform): Node<'vec3'> {
  return mix(vec3(1, 1, 1), vec3(...NIGHT_TINT), nightFactor);
}

/**
 * A sunlit surface's Lambert material: its colour — the material's own,
 * a vertex's, an instance's — carried toward the night tint. The node
 * material multiplies vertex and instance colours into colorNode itself,
 * and the material's own `color` stays live through `materialColor`, so a
 * caller that paints by `material.color` (the trees' season) keeps working.
 */
export function nightBodyMaterial(
  nightFactor: NightFactorUniform,
  params: { color?: number; vertexColors?: boolean; flatShading?: boolean; side?: THREE.Side } = {},
): MeshLambertNodeMaterial {
  const material = new MeshLambertNodeMaterial({
    vertexColors: params.vertexColors ?? false,
    flatShading: params.flatShading ?? false,
    side: params.side ?? THREE.FrontSide,
  });
  const tint = nightTintNode(nightFactor);
  if (params.color === undefined) {
    material.colorNode = materialColor.mul(tint);
  } else {
    const c = new THREE.Color(params.color);
    material.colorNode = vec3(c.r, c.g, c.b).mul(tint);
  }
  return material;
}
