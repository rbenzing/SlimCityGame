// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialStats, useCityStore } from './store';
import { resetCityStore } from './test-helpers';
import { CityInfoPopover, HelpPopover, MilestonePopover } from './Popovers';

beforeEach(() => {
  resetCityStore();
});

afterEach(() => {
  cleanup();
});

describe('MilestonePopover', () => {
  it('lists every milestone and marks the reached ones up to the current level', () => {
    useCityStore.getState().applySnapshotStats({ ...createInitialStats(), milestoneLevel: 2 });
    render(<MilestonePopover onClose={vi.fn()} />);
    expect(screen.getByText('Tiny Village')).toBeInTheDocument();
    expect(screen.getByText('Small Town')).toBeInTheDocument();
    expect(screen.getByText('Busy Township')).toBeInTheDocument();
    expect(screen.getByText('Metropolis')).toBeInTheDocument();
    // Reached (<=2) vs. still-locked milestones read differently.
    expect(screen.getAllByText('Reached')).toHaveLength(3);
  });

  it('calls onClose when dismissed', () => {
    const onClose = vi.fn();
    render(<MilestonePopover onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('CityInfoPopover', () => {
  it('shows real, live CityStats figures (jobs, power, water, loan)', () => {
    useCityStore.getState().applySnapshotStats({
      ...createInitialStats(),
      jobs: 100,
      employed: 80,
      powerSupply: 60,
      powerDemand: 45,
      waterSupply: 400,
      waterDemand: 300,
      loanBalance: 5_000,
    });
    render(<CityInfoPopover />);
    expect(screen.getByText('80/100')).toBeInTheDocument();
    expect(screen.getByText('60/45 MW')).toBeInTheDocument();
    expect(screen.getByText('400/300 kL')).toBeInTheDocument();
    expect(screen.getByText('¢5,000')).toBeInTheDocument();
  });
});

describe('HelpPopover', () => {
  it('lists only shortcuts actually wired in main.ts (no aspirational bindings)', () => {
    render(<HelpPopover />);
    expect(screen.getByText(/Pause/)).toBeInTheDocument();
    expect(screen.getByText(/Undo/)).toBeInTheDocument();
    expect(screen.getByText(/Redo/)).toBeInTheDocument();
    expect(screen.getByText(/Rotate/)).toBeInTheDocument();
    expect(screen.getByText(/Cancel/)).toBeInTheDocument();
  });
});

describe('HelpPopover category hotkeys', () => {
  it('lists the 1–7 toolbar category jump keys wired in main.ts', () => {
    render(<HelpPopover />);
    expect(screen.getByText('1–7')).toBeInTheDocument();
    expect(screen.getByText(/toolbar categor/i)).toBeInTheDocument();
  });
});
