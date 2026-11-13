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

  it('draws a series that never changed along the Mid line, not hugging Low', () => {
    const flat = makeSamples().map((s) => ({ ...s, population: 80 }));
    render(<StatsPanel open={true} onClose={vi.fn()} samples={flat} />);
    const ys = screen
      .getByTestId('chart-series-population')
      .getAttribute('points')!
      .trim()
      .split(/\s+/)
      .map((p) => Number(p.split(',')[1]));
    expect(new Set(ys).size).toBe(1);
    expect(ys[0]).toBeCloseTo(50, 1);
  });

  it('does not crash and shows no lines with an empty history', () => {
    render(<StatsPanel open={true} onClose={vi.fn()} samples={[]} />);
    expect(screen.queryByTestId('chart-series-population')).not.toBeInTheDocument();
  });

  describe('axes and legend', () => {
    it('draws both axes, titled, with labelled ticks, from the first frame', () => {
      render(<StatsPanel open={true} onClose={vi.fn()} samples={[]} />);
      const axes = screen.getByRole('group', { name: 'Chart axes' });
      expect(axes).toHaveTextContent('High');
      expect(axes).toHaveTextContent('Mid');
      expect(axes).toHaveTextContent('Low');
      expect(axes).toHaveTextContent('Each line is scaled to its own range');
      expect(axes).toHaveTextContent('Game date');
      expect(screen.getByTestId('x-tick-start')).toHaveTextContent('Start');
      expect(screen.getByTestId('x-tick-end')).toHaveTextContent('Now');
    });

    it('says in words that there is nothing to plot, for no samples and for one', () => {
      const { unmount } = render(<StatsPanel open={true} onClose={vi.fn()} samples={[]} />);
      expect(screen.getByText(/Nothing to plot yet/)).toBeInTheDocument();
      unmount();
      render(<StatsPanel open={true} onClose={vi.fn()} samples={makeSamples().slice(0, 1)} />);
      expect(screen.getByText(/Nothing to plot yet/)).toBeInTheDocument();
    });

    it('drops the empty message once a line can be drawn, and dates the x ticks', () => {
      render(<StatsPanel open={true} onClose={vi.fn()} samples={makeSamples()} />);
      expect(screen.queryByText(/Nothing to plot yet/)).not.toBeInTheDocument();
      expect(screen.getByTestId('x-tick-start')).toHaveTextContent('Jan 2025');
      expect(screen.getByTestId('x-tick-end')).toHaveTextContent('Jan 2025');
    });

    it('names each series with its unit and gives every one its own marker and dash', () => {
      render(<StatsPanel open={true} onClose={vi.fn()} samples={makeSamples()} />);
      expect(screen.getByRole('button', { name: /Population.*people/ })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Funds \/ mo.*per month/ })).toBeInTheDocument();
      const markers = screen.getAllByTestId(/^series-marker-/);
      expect(markers).toHaveLength(7);
      const looks = markers.map(
        (m) => `${m.getAttribute('data-shape')}|${m.getAttribute('data-dash')}`,
      );
      expect(new Set(looks).size).toBe(7);
      expect(new Set(markers.map((m) => m.getAttribute('data-shape'))).size).toBe(7);
    });

    it('shows the latest value and range of a series in the key', () => {
      render(<StatsPanel open={true} onClose={vi.fn()} samples={makeSamples()} />);
      const population = screen.getByRole('button', { name: /Population/ });
      expect(population).toHaveTextContent('150');
      expect(population).toHaveTextContent('100 to 150');
    });

    it('marks the last point of a plotted line with its shape, not by colour alone', () => {
      render(<StatsPanel open={true} onClose={vi.fn()} samples={makeSamples()} />);
      expect(screen.getByTestId('chart-end-population')).toBeInTheDocument();
      expect(screen.getByTestId('chart-series-population')).toHaveAttribute('stroke-dasharray');
    });
  });
});
