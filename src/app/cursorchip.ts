/**
 * DOM cursor-chip stack: a small absolutely-positioned element
 * that follows the pointer, offset {@link CHIP_POINTER_OFFSET_X}px to the
 * right of the cursor. Renders the CursorChip contract from shared/types —
 * live cost (`¢202`), an optional road length line (`137 m`), and an orange
 * invalid-reason line ("Overlapping items" | "Insufficient funds" | "Locked")
 * beneath the cost. Pure DOM, no React — it updates on every pointer move,
 * far hotter than the store/React render path.
 */
import type { CursorChip } from '../shared/types';

export const CHIP_POINTER_OFFSET_X = 24;

/** Style tokens used inline (this element lives outside the React tree). */
const PANEL_BG = 'rgba(13, 22, 33, 0.85)';
const PANEL_BORDER = '1px solid rgba(255, 255, 255, 0.08)';
const TEXT_COLOR = 'rgba(255, 255, 255, 0.92)';
const WARNING_ORANGE = '#f0a13c';

/** `¢202` — rounded, thousands-separated live cost. */
export function formatChipCost(cost: number): string {
  return `¢${Math.round(cost).toLocaleString('en-US')}`;
}

/** `137 m` — rounded road path length (tiles × TILE_METERS, computed upstream). */
export function formatChipLength(meters: number): string {
  return `${Math.round(meters)} m`;
}

export class CursorChipStack {
  private readonly root: HTMLDivElement;
  private readonly costLine: HTMLDivElement;
  private readonly lengthLine: HTMLDivElement;
  private readonly reasonLine: HTMLDivElement;
  private pointerX = 0;
  private pointerY = 0;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.dataset.cursorChip = '';
    const s = this.root.style;
    s.position = 'absolute';
    s.display = 'none';
    s.pointerEvents = 'none';
    s.zIndex = '30';
    s.left = '0px';
    s.top = '0px';
    s.padding = '4px 8px';
    s.borderRadius = '6px';
    s.background = PANEL_BG;
    s.border = PANEL_BORDER;
    s.boxShadow = '0 4px 24px rgba(0, 0, 0, 0.53)';
    s.font = '600 12px/1.4 system-ui, sans-serif';
    s.color = TEXT_COLOR;
    s.whiteSpace = 'nowrap';

    this.costLine = document.createElement('div');
    this.costLine.dataset.chipCost = '';

    this.lengthLine = document.createElement('div');
    this.lengthLine.dataset.chipLength = '';
    this.lengthLine.style.display = 'none';
    this.lengthLine.style.fontWeight = '400';
    this.lengthLine.style.opacity = '0.8';

    this.reasonLine = document.createElement('div');
    this.reasonLine.dataset.chipReason = '';
    this.reasonLine.style.display = 'none';
    this.reasonLine.style.color = WARNING_ORANGE;

    this.root.append(this.costLine, this.lengthLine, this.reasonLine);
    container.appendChild(this.root);
  }

  /** Renders `chip`, or hides the whole stack when null (no active preview). */
  setChip(chip: CursorChip | null): void {
    if (!chip) {
      this.root.style.display = 'none';
      return;
    }
    this.costLine.textContent = formatChipCost(chip.cost);

    if (chip.lengthMeters !== undefined) {
      this.lengthLine.textContent = formatChipLength(chip.lengthMeters);
      this.lengthLine.style.display = '';
    } else {
      this.lengthLine.style.display = 'none';
    }

    if (chip.invalidReason !== undefined) {
      this.reasonLine.textContent = chip.invalidReason;
      this.reasonLine.style.display = '';
    } else {
      this.reasonLine.style.display = 'none';
    }

    this.root.style.display = '';
    this.applyPosition();
  }

  /** Tracks the pointer in the container's local coordinates. */
  setPointer(x: number, y: number): void {
    this.pointerX = x;
    this.pointerY = y;
    this.applyPosition();
  }

  private applyPosition(): void {
    this.root.style.left = `${this.pointerX + CHIP_POINTER_OFFSET_X}px`;
    this.root.style.top = `${this.pointerY}px`;
  }
}
