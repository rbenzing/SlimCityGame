// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FieldId } from '../shared/types';
import { useCityStore } from './store';
import { resetCityStore } from './test-helpers';
import { ViewChip } from './ViewChip';

beforeEach(() => {
  resetCityStore();
});

afterEach(() => {
  cleanup();
});

const chip = (): HTMLElement => screen.getByRole('group', { name: 'Active view' });
const noChip = (): void => {
  expect(screen.queryByRole('group', { name: 'Active view' })).not.toBeInTheDocument();
};

describe('ViewChip', () => {
  it('renders nothing in the plain view', () => {
    render(<ViewChip />);
    noChip();
    expect(screen.queryByRole('button', { name: 'Exit view' })).not.toBeInTheDocument();
  });

  it('names a lens by its Infoviews label and shows the Esc hint', () => {
    useCityStore.getState().setOverlay(FieldId.FireRisk);
    render(<ViewChip />);
    expect(chip()).toHaveTextContent('Fire Risk lens');
    const exit = screen.getByRole('button', { name: 'Exit view' });
    expect(exit).toHaveTextContent('Exit');
    expect(exit).toHaveTextContent('Esc');
  });

  it('says "Underground view" when a tool keeps the city underground and no lens is on', () => {
    useCityStore.getState().setTool('water.pipe');
    render(<ViewChip />);
    expect(chip()).toHaveTextContent('Underground view');
  });

  it('adds "underground" to the Water and Sewer lenses', () => {
    useCityStore.getState().setOverlay('watered');
    render(<ViewChip />);
    expect(chip()).toHaveTextContent('Water lens · underground');
    cleanup();
    useCityStore.getState().setOverlay('sewered');
    render(<ViewChip />);
    expect(chip()).toHaveTextContent('Sewer lens · underground');
  });

  it('leaves a lens in one click and keeps the tool in hand', () => {
    const store = useCityStore.getState();
    store.setOverlay(FieldId.Pollution);
    store.setTool('road.two');
    render(<ViewChip />);
    fireEvent.click(screen.getByRole('button', { name: 'Exit view' }));
    expect(useCityStore.getState().overlay).toBeNull();
    expect(useCityStore.getState().selectedTool).toBe('road.two');
    noChip();
  });

  it('leaves the underground view held by a tool by dropping the tool', () => {
    useCityStore.getState().setTool('power.cable');
    render(<ViewChip />);
    fireEvent.click(screen.getByRole('button', { name: 'Exit view' }));
    expect(useCityStore.getState().selectedTool).toBe('select');
    noChip();
  });

  it('clears a water lens and the pipe tool together', () => {
    const store = useCityStore.getState();
    store.setOverlay('watered');
    store.setTool('water.pipe');
    render(<ViewChip />);
    fireEvent.click(screen.getByRole('button', { name: 'Exit view' }));
    expect(useCityStore.getState().overlay).toBeNull();
    expect(useCityStore.getState().selectedTool).toBe('select');
    noChip();
  });
});
