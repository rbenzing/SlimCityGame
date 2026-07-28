// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StatsSample } from './statshistory';
import { StatsPanel } from './StatsPanel';

afterEach(() => {
  cleanup();
});

function makeSamples(): StatsSample[] {
  return [
    {
      tick: 0,
      population: 100,
      funds: 10_000,
      monthlyDelta: 50,
      demandRes: 0.2,
      demandCom: -0.1,
      demandInd: 0.05,
      happiness: 60,
    },
    {
      tick: 1,
      population: 120,
      funds: 10_050,
      monthlyDelta: 60,
      demandRes: 0.3,
      demandCom: -0.05,
      demandInd: 0.1,
      happiness: 65,
    },
    {
      tick: 2,
      population: 150,
      funds: 10_110,
      monthlyDelta: 70,
      demandRes: 0.1,
      demandCom: 0.0,
      demandInd: 0.15,
      happiness: 70,
    },
  ];
}

describe('StatsPanel', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <StatsPanel open={false} onClose={vi.fn()} samples={makeSamples()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('plots a line for each default-enabled series from the fed history', () => {
    render(<StatsPanel open={true} onClose={vi.fn()} samples={makeSamples()} />);
    // Population is on by default and has 3 samples -> a 3-point polyline.
    const populationLine = screen.getByTestId('chart-series-population');
    expect(populationLine.tagName.toLowerCase()).toBe('polyline');
    const points = populationLine.getAttribute('points')!.trim().split(/\s+/);
    expect(points).toHaveLength(3);
  });

  it('renders a toggle button per plottable series', () => {
    render(<StatsPanel open={true} onClose={vi.fn()} samples={makeSamples()} />);
    expect(screen.getByRole('button', { name: /population/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: /happiness/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('toggling a series off removes its plotted line, and toggling again restores it', () => {
    render(<StatsPanel open={true} onClose={vi.fn()} samples={makeSamples()} />);
    expect(screen.queryByTestId('chart-series-population')).toBeInTheDocument();

    const toggle = screen.getByRole('button', { name: /population/i });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('chart-series-population')).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.queryByTestId('chart-series-population')).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<StatsPanel open={true} onClose={onClose} samples={makeSamples()} />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not plot a line (and does not crash) for a series toggled on with fewer than 2 samples', () => {
    const oneSample = makeSamples().slice(0, 1);
    render(<StatsPanel open={true} onClose={vi.fn()} samples={oneSample} />);
    expect(screen.queryByTestId('chart-series-population')).not.toBeInTheDocument();
  });

  it('does not crash and shows no lines with an empty history', () => {
    render(<StatsPanel open={true} onClose={vi.fn()} samples={[]} />);
    expect(screen.queryByTestId('chart-series-population')).not.toBeInTheDocument();
  });
});
