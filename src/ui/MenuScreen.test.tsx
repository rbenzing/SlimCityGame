// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MenuScreen } from './MenuScreen';
import { useCityStore } from './store';

// The save-slot list is the only thing MenuScreen reaches out for on open.
vi.mock('../app/persist', () => ({
  listSaves: () => Promise.resolve([]),
  deleteSave: () => Promise.resolve(),
}));

afterEach(() => {
  cleanup();
});

beforeEach(() => {
  const store = useCityStore.getState();
  store.setScreen('playing');
  store.setMenuOpen(false);
  store.setSpeed(1);
});

/** Opens the in-game overlay at `speed`, the way the ☰ button does. */
function openOverlayAt(speed: 0 | 1 | 2 | 4): void {
  act(() => {
    useCityStore.getState().setSpeed(speed);
    useCityStore.getState().setMenuOpen(true);
  });
  render(<MenuScreen />);
}

describe('MenuScreen pause overlay', () => {
  it('pauses the city while the overlay is open', () => {
    openOverlayAt(2);
    expect(useCityStore.getState().speed).toBe(0);
  });

  it('Resume Game closes the overlay and puts the clock back where it was', () => {
    openOverlayAt(4);
    expect(useCityStore.getState().speed).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Resume Game' }));

    expect(useCityStore.getState().menuOpen).toBe(false);
    expect(useCityStore.getState().speed).toBe(4); // not just "unpaused" — the speed they were playing at
  });

  it('Escape does exactly what Resume Game does', () => {
    openOverlayAt(2);
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' });
    });
    expect(useCityStore.getState().menuOpen).toBe(false);
    expect(useCityStore.getState().speed).toBe(2);
  });

  it('a city that was already paused stays paused on resume, rather than being started for you', () => {
    openOverlayAt(0);
    fireEvent.click(screen.getByRole('button', { name: 'Resume Game' }));
    expect(useCityStore.getState().menuOpen).toBe(false);
    expect(useCityStore.getState().speed).toBe(0);
  });

  it('shows no Resume Game on the start screen, and does not touch the clock there', () => {
    act(() => {
      useCityStore.getState().setScreen('menu');
      useCityStore.getState().setSpeed(1);
    });
    render(<MenuScreen />);

    expect(screen.queryByRole('button', { name: 'Resume Game' })).not.toBeInTheDocument();
    expect(useCityStore.getState().speed).toBe(1);
  });
});
