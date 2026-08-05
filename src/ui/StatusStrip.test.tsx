// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TICKS_PER_DAY, TICKS_PER_MONTH, VISUAL_DAY_TICKS } from '../shared/constants';
import { FieldId } from '../shared/types';
import { createInitialStats, useCityStore } from './store';
import { resetCityStore } from './test-helpers';
import { StatusStrip } from './StatusStrip';

beforeEach(() => {
  resetCityStore();
});

afterEach(() => {
  cleanup();
});

describe('StatusStrip', () => {
  describe('sim controls', () => {
    it('shows Pause while running (default speed 1x) and pauses on click', () => {
      render(<StatusStrip />);
      const button = screen.getByRole('button', { name: 'Pause' });
      fireEvent.click(button);
      expect(useCityStore.getState().speed).toBe(0);
    });

    it('shows Play while paused and resumes at 1x on click', () => {
      useCityStore.setState({ speed: 0 });
      render(<StatusStrip />);
      fireEvent.click(screen.getByRole('button', { name: 'Play' }));
      expect(useCityStore.getState().speed).toBe(1);
    });

    it('speed chevrons set the speed directly and highlight the active tier', () => {
      render(<StatusStrip />);
      fireEvent.click(screen.getByRole('button', { name: '4×' }));
      expect(useCityStore.getState().speed).toBe(4);
      expect(screen.getByRole('button', { name: '4×' })).toHaveAttribute('aria-pressed', 'true');
      expect(screen.getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'false');
    });

    it('undo/redo are disabled until canUndo/canRedo flip, then call the bound actions', () => {
      render(<StatusStrip />);
      expect(screen.getByRole('button', { name: /undo/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /redo/i })).toBeDisabled();

      const undo = vi.fn();
      const redo = vi.fn();
      useCityStore.getState().bindActions({
        sendCommands: vi.fn(),
        undo,
        redo,
        setSpeed: vi.fn(),
        togglePhoto: vi.fn(),
        saveGame: vi.fn(),
        onSettings: vi.fn(),
      });
      useCityStore.setState({ canUndo: true, canRedo: true });
      cleanup();
      render(<StatusStrip />);
      fireEvent.click(screen.getByRole('button', { name: /undo/i }));
      fireEvent.click(screen.getByRole('button', { name: /redo/i }));
      expect(undo).toHaveBeenCalledTimes(1);
      expect(redo).toHaveBeenCalledTimes(1);
    });

    it('clicking undo/redo is a no-op when enabled but nothing has bound the dispatch bridge yet', () => {
      useCityStore.setState({ canUndo: true, canRedo: true });
      render(<StatusStrip />);
      expect(() => fireEvent.click(screen.getByRole('button', { name: /undo/i }))).not.toThrow();
      expect(() => fireEvent.click(screen.getByRole('button', { name: /redo/i }))).not.toThrow();
    });
  });

  describe('clock + date', () => {
    it('formats HH:MM from the visual day cycle and MMM YYYY from the calendar tick', () => {
      useCityStore
        .getState()
        .applySnapshotStats({ ...createInitialStats(), tick: VISUAL_DAY_TICKS / 2 });
      render(<StatusStrip />);
      // Half a visual day past the 09:00 boot offset = 21:00.
      expect(screen.getByText('21:00')).toBeInTheDocument();
      expect(screen.getByText(/Jan 2025/)).toBeInTheDocument();
    });

    it('advances the displayed year using the 2025 + (year-1) offset', () => {
      useCityStore
        .getState()
        .applySnapshotStats({ ...createInitialStats(), tick: TICKS_PER_DAY * 30 * 12 });
      render(<StatusStrip />);
      expect(screen.getByText(/Jan 2026/)).toBeInTheDocument();
    });
  });

  describe('season chip', () => {
    it.each([
      [0, 'Winter'],
      [2, 'Spring'],
      [5, 'Summer'],
      [8, 'Fall'],
    ])('%i months in shows season %s, derived from the game month', (monthsIn, label) => {
      useCityStore
        .getState()
        .applySnapshotStats({ ...createInitialStats(), tick: TICKS_PER_DAY * 30 * monthsIn });
      render(<StatusStrip />);
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('shows the wave-1 city name', () => {
    render(<StatusStrip />);
    expect(screen.getByText('Riverton')).toBeInTheDocument();
  });

  it('renders the population and funds figures from the store', () => {
    useCityStore
      .getState()
      .applySnapshotStats({ ...createInitialStats(), population: 4_200, funds: 15_000 });
    render(<StatusStrip />);
    expect(screen.getByText('4,200')).toBeInTheDocument();
    expect(screen.getByTestId('funds-amount')).toHaveTextContent('¢15,000');
  });

  describe('population trend', () => {
    it('shows no arrow before any month has rolled over (flat)', () => {
      render(<StatusStrip />);
      expect(screen.queryByTestId('population-trend')).not.toBeInTheDocument();
    });

    it('shows an up arrow once population has grown since the last month rollover', () => {
      useCityStore
        .getState()
        .applySnapshotStats({ ...createInitialStats(), tick: 100, population: 50 });
      useCityStore
        .getState()
        .applySnapshotStats({ ...createInitialStats(), tick: TICKS_PER_MONTH + 5, population: 80 });
      render(<StatusStrip />);
      expect(screen.getByTestId('population-trend')).toHaveTextContent('▲');
    });

    it('shows a down arrow once population has fallen since the last month rollover', () => {
      useCityStore
        .getState()
        .applySnapshotStats({ ...createInitialStats(), tick: 100, population: 80 });
      useCityStore
        .getState()
        .applySnapshotStats({ ...createInitialStats(), tick: TICKS_PER_MONTH + 5, population: 50 });
      render(<StatusStrip />);
      expect(screen.getByTestId('population-trend')).toHaveTextContent('▼');
    });
  });

  describe('funds', () => {
    it('tints the funds figure negative and shows the leading minus sign', () => {
      useCityStore.getState().applySnapshotStats({ ...createInitialStats(), funds: -500 });
      render(<StatusStrip />);
      const el = screen.getByTestId('funds-amount');
      expect(el).toHaveTextContent('-¢500');
      expect(el).toHaveClass('funds-negative');
    });

    it('does not tint the funds figure when non-negative', () => {
      useCityStore.getState().applySnapshotStats({ ...createInitialStats(), funds: 500 });
      render(<StatusStrip />);
      const el = screen.getByTestId('funds-amount');
      expect(el).toHaveTextContent('¢500');
      expect(el).not.toHaveClass('funds-negative');
    });

    it('shows a positive /mo delta chip when income exceeds expenses', () => {
      useCityStore.getState().applySnapshotStats({
        ...createInitialStats(),
        monthlyIncome: 2_000,
        monthlyExpenses: 800,
      });
      render(<StatusStrip />);
      expect(screen.getByTestId('funds-delta')).toHaveTextContent('+¢1,200/mo');
    });

    it('shows a negative /mo delta chip when expenses exceed income', () => {
      useCityStore
        .getState()
        .applySnapshotStats({ ...createInitialStats(), monthlyIncome: 500, monthlyExpenses: 900 });
      render(<StatusStrip />);
      expect(screen.getByTestId('funds-delta')).toHaveTextContent('-¢400/mo');
    });

    it('shows a funds trend arrow vs. the previous month rollover, independent of the /mo rate', () => {
      useCityStore
        .getState()
        .applySnapshotStats({ ...createInitialStats(), tick: 100, funds: 40_000 });
      useCityStore
        .getState()
        .applySnapshotStats({ ...createInitialStats(), tick: TICKS_PER_MONTH + 5, funds: 60_000 });
      render(<StatusStrip />);
      expect(screen.getByTestId('funds-trend')).toHaveTextContent('▲');
    });
  });

  describe('happiness face', () => {
    it.each([
      [10, '😞'],
      [40, '😐'],
      [60, '🙂'],
      [90, '😄'],
    ])('maps happiness %d onto the %s face', (happiness, face) => {
      useCityStore.getState().applySnapshotStats({ ...createInitialStats(), happiness });
      render(<StatusStrip />);
      expect(screen.getByRole('button', { name: /happiness/i })).toHaveTextContent(face);
    });

    it('opens the Happiness infoview lens on click', () => {
      render(<StatusStrip />);
      fireEvent.click(screen.getByRole('button', { name: /happiness/i }));
      expect(useCityStore.getState().overlay).toBe(FieldId.Happiness);
    });
  });
});
