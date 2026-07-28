// @vitest-environment jsdom
/**
 * DOM cursor-chip stack: one chip stack follows the pointer,
 * offset right of the cursor — live cost, optional road length line, and an
 * orange invalid-reason line.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CHIP_POINTER_OFFSET_X,
  CursorChipStack,
  formatChipCost,
  formatChipLength,
} from './cursorchip';

describe('formatChipCost / formatChipLength', () => {
  it('formats cost as ¢ with thousands separators, rounded', () => {
    expect(formatChipCost(202)).toBe('¢202');
    expect(formatChipCost(1234.6)).toBe('¢1,235');
    expect(formatChipCost(0)).toBe('¢0');
  });

  it('formats length as rounded meters', () => {
    expect(formatChipLength(137)).toBe('137 m');
    expect(formatChipLength(136.6)).toBe('137 m');
  });
});

describe('CursorChipStack', () => {
  let container: HTMLElement;
  let stack: CursorChipStack;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    stack = new CursorChipStack(container);
  });

  const root = (): HTMLElement => container.querySelector('[data-cursor-chip]') as HTMLElement;

  it('mounts hidden inside the container', () => {
    expect(root()).not.toBeNull();
    expect(root().style.display).toBe('none');
    expect(root().style.pointerEvents).toBe('none');
  });

  it('shows the cost line when a chip is set', () => {
    stack.setChip({ cost: 202 });
    expect(root().style.display).not.toBe('none');
    const cost = root().querySelector('[data-chip-cost]') as HTMLElement;
    expect(cost.textContent).toBe('¢202');
  });

  it('shows a length line for road chips and hides it otherwise', () => {
    stack.setChip({ cost: 500, lengthMeters: 137 });
    const length = root().querySelector('[data-chip-length]') as HTMLElement;
    expect(length.textContent).toBe('137 m');
    expect(length.style.display).not.toBe('none');

    stack.setChip({ cost: 500 });
    expect((root().querySelector('[data-chip-length]') as HTMLElement).style.display).toBe('none');
  });

  it('shows the invalid reason line in orange beneath the cost', () => {
    stack.setChip({ cost: 100, invalidReason: 'Overlapping items' });
    const reason = root().querySelector('[data-chip-reason]') as HTMLElement;
    expect(reason.textContent).toBe('Overlapping items');
    expect(reason.style.display).not.toBe('none');
    // Warning orange.
    expect(reason.style.color).toBe('rgb(240, 161, 60)');

    stack.setChip({ cost: 100 });
    expect((root().querySelector('[data-chip-reason]') as HTMLElement).style.display).toBe('none');
  });

  it('hides the whole stack when the chip is cleared', () => {
    stack.setChip({ cost: 100 });
    stack.setChip(null);
    expect(root().style.display).toBe('none');
  });

  it('follows the pointer offset 24px right of the cursor', () => {
    expect(CHIP_POINTER_OFFSET_X).toBe(24);
    stack.setChip({ cost: 100 });
    stack.setPointer(300, 180);
    expect(root().style.left).toBe(`${300 + CHIP_POINTER_OFFSET_X}px`);
    expect(root().style.top).toBe('180px');
  });

  it('keeps the last pointer position when a new chip replaces the old one', () => {
    stack.setPointer(50, 60);
    stack.setChip({ cost: 7 });
    expect(root().style.left).toBe(`${50 + CHIP_POINTER_OFFSET_X}px`);
    expect(root().style.top).toBe('60px');
  });
});
