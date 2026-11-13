// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialStats, useCityStore } from './store';
import { resetCityStore } from './test-helpers';
import { CATEGORY_DEFS, CATEGORY_HOTKEYS } from './categories';
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
    expect(screen.getByText('60 MW made, 45 MW used')).toBeInTheDocument();
    expect(screen.getByText('400 kL made, 300 kL used')).toBeInTheDocument();
    expect(screen.getByText('¢5,000')).toBeInTheDocument();
    expect(screen.queryByText(/short/i)).not.toBeInTheDocument();
  });

  it('shows a small supply to its places, so a wind turbine does not read as nothing', () => {
    useCityStore.getState().applySnapshotStats({
      ...createInitialStats(),
      powerSupply: 0.2,
      powerDemand: 0.05,
    });
    render(<CityInfoPopover />);
    expect(screen.getByText('0.2 MW made, 0.05 MW used')).toBeInTheDocument();
    expect(screen.queryByText('0/0 MW')).not.toBeInTheDocument();
  });

  it('says in words, with the gap, where use exceeds supply', () => {
    useCityStore.getState().applySnapshotStats({
      ...createInitialStats(),
      powerSupply: 0.2,
      powerDemand: 0.8,
      waterSupply: 25,
      waterDemand: 379,
      sewerSupply: 100,
      sewerDemand: 130,
    });
    render(<CityInfoPopover />);
    expect(screen.getByText('Short by 0.6 MW: some buildings go dark')).toBeInTheDocument();
    expect(screen.getByText('Short by 354 kL: some buildings go dry')).toBeInTheDocument();
    expect(screen.getByText('Short by 30 kL: sewage backs up')).toBeInTheDocument();
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
  it('lists every toolbar category, each with the key main.ts binds to it', () => {
    render(<HelpPopover />);
    for (const def of CATEGORY_DEFS) {
      const code = Object.entries(CATEGORY_HOTKEYS).find(([, b]) => b.category === def.id)?.[0];
      const row = screen.getByTestId(`help-category-${def.id}`);
      expect(row).toHaveTextContent(def.label);
      expect(row).toHaveTextContent(code ? code.replace('Digit', '') : 'Click');
    }
    expect(screen.getAllByTestId(/^help-category-/)).toHaveLength(CATEGORY_DEFS.length);
  });

  it('no longer claims one key range covers the toolbar', () => {
    render(<HelpPopover />);
    expect(screen.queryByText('1–7')).not.toBeInTheDocument();
  });
});
