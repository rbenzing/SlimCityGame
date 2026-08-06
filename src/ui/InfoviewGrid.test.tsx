// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FieldId } from '../shared/types';
import { useCityStore } from './store';
import { resetCityStore } from './test-helpers';
import { InfoviewGrid } from './InfoviewGrid';

beforeEach(() => {
  resetCityStore();
});

afterEach(() => {
  cleanup();
});

describe('InfoviewGrid', () => {
  it('renders a button per FieldId lens (9) plus Power, Watered, Trash, Transit, Districts and None (15 total), None active by default', () => {
    render(<InfoviewGrid />);
    expect(screen.getAllByRole('button')).toHaveLength(15);
    expect(screen.getByRole('button', { name: /None/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Traffic/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('gains Power and Water lens buttons alongside the nine scalar fields (UI-SPEC §2)', () => {
    render(<InfoviewGrid />);
    expect(screen.getByRole('button', { name: /^Power$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Water$/ })).toBeInTheDocument();
  });

  it('clicking the Power lens sets overlay to the "power" LensId', () => {
    render(<InfoviewGrid />);
    fireEvent.click(screen.getByRole('button', { name: /^Power$/ }));
    expect(useCityStore.getState().overlay).toBe('power');
    expect(screen.getByRole('button', { name: /^Power$/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking the Water lens sets overlay to the "watered" LensId', () => {
    render(<InfoviewGrid />);
    fireEvent.click(screen.getByRole('button', { name: /^Water$/ }));
    expect(useCityStore.getState().overlay).toBe('watered');
  });

  it('renders a Trash lens button that sets overlay to the "trash" LensId (SPEC §21)', () => {
    render(<InfoviewGrid />);
    const trash = screen.getByRole('button', { name: /^Trash$/ });
    expect(trash).toBeInTheDocument();
    fireEvent.click(trash);
    expect(useCityStore.getState().overlay).toBe('trash');
    expect(screen.getByRole('button', { name: /^Trash$/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('clicking a lens activates that overlay and highlights it', () => {
    render(<InfoviewGrid />);
    fireEvent.click(screen.getByRole('button', { name: /Traffic/ }));
    expect(useCityStore.getState().overlay).toBe(FieldId.Traffic);
    expect(screen.getByRole('button', { name: /Traffic/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /None/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('clicking the active lens again toggles it back off to None', () => {
    render(<InfoviewGrid />);
    fireEvent.click(screen.getByRole('button', { name: /Crime/ }));
    expect(useCityStore.getState().overlay).toBe(FieldId.Crime);
    fireEvent.click(screen.getByRole('button', { name: /Crime/ }));
    expect(useCityStore.getState().overlay).toBeNull();
  });

  it('switching directly from one active lens to another replaces it', () => {
    render(<InfoviewGrid />);
    fireEvent.click(screen.getByRole('button', { name: /Crime/ }));
    fireEvent.click(screen.getByRole('button', { name: /Happiness/ }));
    expect(useCityStore.getState().overlay).toBe(FieldId.Happiness);
    expect(screen.getByRole('button', { name: /Crime/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('switching from the Power lens to a scalar-field lens replaces it too', () => {
    render(<InfoviewGrid />);
    fireEvent.click(screen.getByRole('button', { name: /^Power$/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Water$/ }));
    expect(useCityStore.getState().overlay).toBe('watered');
    expect(screen.getByRole('button', { name: /^Power$/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('clicking None clears an already-active overlay', () => {
    useCityStore.getState().setOverlay(FieldId.Happiness);
    render(<InfoviewGrid />);
    fireEvent.click(screen.getByRole('button', { name: /None/ }));
    expect(useCityStore.getState().overlay).toBeNull();
  });
});
