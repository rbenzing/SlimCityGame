/**
 * CS2-style floating map-pin sprite: a canvas-drawn teardrop
 * billboard in accent blue, shown above a selected building's roof while its
 * info panel is open, gently bobbing over elapsed visual time. Consumes a
 * plain anchor point only — this file never imports buildings.ts;
 * integration passes the roof-top world point (e.g. an outline.ts
 * OutlineTarget's `position.y + height`).
 */
import * as THREE from 'three';

const PIN_WIDTH = 3.2; // meters, billboard sprite width
const PIN_HEIGHT = 4.4; // meters, billboard sprite height
/** Rest gap between the anchor (roof) point and the pin's tip, before bob. */
const HOVER_GAP = 2.5;
/** Accent blue — the pin, unlike the outline, is not green. */
const ACCENT_BLUE = '#38b6e3';

export const BOB_AMPLITUDE = 0.35; // meters
/** Full bob cycle length, in the same elapsed-visual-time units update(t) receives (see below). */
export const BOB_PERIOD_SECONDS = 2.2;

/**
 * Pure: vertical bob offset (meters), oscillating around 0 with period
 * BOB_PERIOD_SECONDS. Deterministic in `t` (elapsed visual time — a
 * caller-owned, deterministic clock derived from sim ticks, e.g.
 * tick / TICK_RATE; never Date.now()).
 */
export function bobOffset(t: number): number {
  return Math.sin((t / BOB_PERIOD_SECONDS) * Math.PI * 2) * BOB_AMPLITUDE;
}

/**
 * Canvas-drawn teardrop pin texture: a circular head with a tapered tip
 * pointing down at the anchor, accent-blue fill, soft dark outline, white
 * core dot (CS2's marker look). Falls back to a blank (but still valid)
 * canvas when a 2D context isn't available (e.g. jsdom without the optional
 * `canvas` npm package) — real browsers always have one.
 */
function drawPinCanvas(): HTMLCanvasElement {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const cx = size * 0.5;
  const headR = size * 0.28;
  const headCy = size * 0.34;
  const tipY = size * 0.96;

  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = ACCENT_BLUE;
  ctx.strokeStyle = 'rgba(8, 20, 32, 0.55)';
  ctx.lineWidth = size * 0.03;

  // Tapered tail first, so the head's fill/stroke cleanly covers the seam.
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.62, headCy + headR * 0.55);
  ctx.lineTo(cx + headR * 0.62, headCy + headR * 0.55);
  ctx.lineTo(cx, tipY);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx, headCy, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(cx, headCy, headR * 0.36, 0, Math.PI * 2);
  ctx.fill();

  return canvas;
}

export class MapPin {
  private readonly sprite: THREE.Sprite;
  private anchor: { x: number; y: number; z: number } | null = null;
  private shown = false;

  constructor(scene: THREE.Scene) {
    const texture = new THREE.CanvasTexture(drawPinCanvas());
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: true,
      depthWrite: false,
    });

    this.sprite = new THREE.Sprite(material);
    this.sprite.scale.set(PIN_WIDTH, PIN_HEIGHT, 1);
    this.sprite.visible = false;
    this.sprite.renderOrder = 20;
    scene.add(this.sprite);
  }

  /** Shows the pin floating above anchor (x,y,z) — y is the roof-top world height integration computed. */
  showAt(x: number, y: number, z: number): void {
    this.anchor = { x, y, z };
    this.shown = true;
    this.sprite.visible = true;
    this.applyPosition(0);
  }

  /** Hides the pin (selection cleared / panel closed). Further update() calls are a no-op until the next showAt(). */
  hide(): void {
    this.shown = false;
    this.sprite.visible = false;
    this.anchor = null;
  }

  /** Advances the bob animation. `t`: elapsed visual time, see {@link bobOffset}. No-op while hidden. */
  update(t: number): void {
    if (!this.shown) return;
    this.applyPosition(t);
  }

  private applyPosition(t: number): void {
    const anchor = this.anchor;
    if (!anchor) return;
    const y = anchor.y + HOVER_GAP + PIN_HEIGHT / 2 + bobOffset(t);
    this.sprite.position.set(anchor.x, y, anchor.z);
  }
}
