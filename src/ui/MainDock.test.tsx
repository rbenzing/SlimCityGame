// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createInitialStats, useCityStore } from './store';
import { resetCityStore } from './test-helpers';
import { MainDock } from './MainDock';

beforeEach(() => {
  resetCityStore();
});

afterEach(() => {
  cleanup();
});

const noop = (): void => {};

describe('MainDock — narrow window', () => {
  const dock = (): void => {
    render(
      <MainDock
        activeCategory={null}
        onToggleCategory={noop}
        infoviewOpen={false}
        onToggleInfoview={noop}
        onOpenMilestones={noop}
      />,
    );
  };

  it('lets the category strip shrink and scroll from its first button rather than sit under the clusters', () => {
    dock();
    const strip = screen.getByRole('group', { name: 'Build categories' });
    expect(strip.className).toContain('min-w-0');
    expect(strip.className).toContain('overflow-x-auto');
    // Centred overflow would hide the first buttons off the left edge.
    expect(strip.className).toContain('justify-start');
    expect(strip.className).toContain('sm:justify-center');
  });

  it('drops the decorative city glyph and the milestone name below the sm breakpoint', () => {
    dock();
    expect(screen.getByText('TINY VILLAGE').className).toContain('hidden');
    expect(screen.getByText('TINY VILLAGE').className).toContain('sm:inline');
    const milestone = screen.getByRole('button', { name: /Milestone progress/ });
    expect(milestone).toBeInTheDocument();
  });
});

describe('MainDock', () => {
  it('renders every dock category button (incl. Garbage + Landscaping), icon-only with a tooltip name', () => {
    render(
      <MainDock
        activeCategory={null}
        onToggleCategory={noop}
        infoviewOpen={false}
        onToggleInfoview={noop}
        onOpenMilestones={noop}
      />,
    );
    const labels = [
      'Zoning',
      'Roads',
      'Electricity',
      'Water',
      'Garbage',
      'Health',
      'Fire',
      'Police',
      'Education',
      'Parks',
      'Transit',
      'Districts',
      'Bulldoze',
      'Landscaping',
    ];
    for (const label of labels) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(
      screen.getByRole('group', { name: 'Build categories' }).querySelectorAll('button'),
    ).toHaveLength(labels.length);
  });

  it('calls onToggleCategory with the clicked category id', () => {
    const onToggleCategory = vi.fn();
    render(
      <MainDock
        activeCategory={null}
        onToggleCategory={onToggleCategory}
        infoviewOpen={false}
        onToggleInfoview={noop}
        onOpenMilestones={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Roads' }));
    expect(onToggleCategory).toHaveBeenCalledWith('roads');
  });

  it('calls onToggleCategory with "landscaping" when the Landscaping button is clicked (UI-SPEC §6.11)', () => {
    const onToggleCategory = vi.fn();
    render(
      <MainDock
        activeCategory={null}
        onToggleCategory={onToggleCategory}
        infoviewOpen={false}
        onToggleInfoview={noop}
        onOpenMilestones={noop}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Landscaping' }));
    expect(onToggleCategory).toHaveBeenCalledWith('landscaping');
  });

  it('highlights only the active category', () => {
    render(
      <MainDock
        activeCategory="water"
        onToggleCategory={noop}
        infoviewOpen={false}
        onToggleInfoview={noop}
        onOpenMilestones={noop}
      />,
    );
    expect(screen.getByRole('button', { name: 'Water' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Roads' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('renders RCI demand bar widths mapped from -1..1 to 0..100%', () => {
    useCityStore.setState((s) => ({ stats: { ...s.stats, demand: { res: 1, com: -1, ind: 0 } } }));
    render(
      <MainDock
        activeCategory={null}
        onToggleCategory={noop}
        infoviewOpen={false}
        onToggleInfoview={noop}
        onOpenMilestones={noop}
      />,
    );
    expect(screen.getByTestId('demand-res').style.width).toBe('100%');
    expect(screen.getByTestId('demand-com').style.width).toBe('0%');
    expect(screen.getByTestId('demand-ind').style.width).toBe('50%');
  });

  it('shows the current milestone name and progress, and opens the milestone popover on click', () => {
    const onOpenMilestones = vi.fn();
    useCityStore
      .getState()
      .applySnapshotStats({ ...createInitialStats(), milestoneLevel: 1, milestoneProgress: 0.5 });
    render(
      <MainDock
        activeCategory={null}
        onToggleCategory={noop}
        infoviewOpen={false}
        onToggleInfoview={noop}
        onOpenMilestones={onOpenMilestones}
      />,
    );
    const badge = screen.getByRole('button', { name: /Small Town/ });
    expect(badge).toBeInTheDocument();
    expect(within(badge).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '50');
    fireEvent.click(badge);
    expect(onOpenMilestones).toHaveBeenCalledTimes(1);
  });

  it('reflects infoviewOpen on the Infoviews toggle and calls onToggleInfoview when clicked', () => {
    const onToggleInfoview = vi.fn();
    render(
      <MainDock
        activeCategory={null}
        onToggleCategory={noop}
        infoviewOpen={true}
        onToggleInfoview={onToggleInfoview}
        onOpenMilestones={noop}
      />,
    );
    const toggle = screen.getByRole('button', { name: 'Infoviews' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(toggle);
    expect(onToggleInfoview).toHaveBeenCalledTimes(1);
  });

  it('reads the Infoviews button as on while a lens is active, grid closed or not', () => {
    const { rerender } = render(
      <MainDock
        activeCategory={null}
        onToggleCategory={noop}
        infoviewOpen={false}
        onToggleInfoview={noop}
        onOpenMilestones={noop}
      />,
    );
    expect(screen.getByRole('button', { name: 'Infoviews' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    act(() => useCityStore.getState().setOverlay(3));
    expect(screen.getByRole('button', { name: 'Infoviews' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    rerender(
      <MainDock
        activeCategory={null}
        onToggleCategory={noop}
        infoviewOpen={true}
        onToggleInfoview={noop}
        onOpenMilestones={noop}
      />,
    );
    expect(screen.getByRole('button', { name: 'Infoviews' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  describe('overlay-off shortcut', () => {
    it('is disabled while no lens is active', () => {
      render(
        <MainDock
          activeCategory={null}
          onToggleCategory={noop}
          infoviewOpen={false}
          onToggleInfoview={noop}
          onOpenMilestones={noop}
        />,
      );
      expect(screen.getByRole('button', { name: /turn off overlay/i })).toBeDisabled();
    });

    it('clears an active lens directly, without opening the grid', () => {
      useCityStore.getState().setOverlay(3);
      render(
        <MainDock
          activeCategory={null}
          onToggleCategory={noop}
          infoviewOpen={false}
          onToggleInfoview={noop}
          onOpenMilestones={noop}
        />,
      );
      const button = screen.getByRole('button', { name: /turn off overlay/i });
      expect(button).not.toBeDisabled();
      fireEvent.click(button);
      expect(useCityStore.getState().overlay).toBeNull();
    });
  });
});
