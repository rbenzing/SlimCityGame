// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useCityStore } from './store';
import { resetCityStore } from './test-helpers';
import { TransitLinesPanel } from './TransitLinesPanel';
import type { TransitLine } from '../shared/types';

const LINES: TransitLine[] = [
  { id: 1, stops: [], color: 0xef5350 },
  { id: 2, stops: [], color: 0x42a5f5, mode: 'rail' },
  { id: 3, stops: [], color: 0x66bb6a, mode: 'tram' },
];

beforeEach(() => {
  resetCityStore();
  useCityStore.setState({
    transitLines: LINES,
    transitRidership: [40, 300, 120],
    transitFleet: {
      served: [0, 1, 2],
      requested: [2, 1, 3],
      headwayMin: [0, 12.5, 4.1],
      runningCost: [0, 142, 140],
    },
  });
});

afterEach(() => {
  cleanup();
});

describe('TransitLinesPanel', () => {
  it('opens for every line tool, not only the bus one', () => {
    for (const tool of ['transit.line', 'transit.rail', 'transit.tram'] as const) {
      useCityStore.setState({ selectedTool: tool });
      const { unmount } = render(<TransitLinesPanel />);
      expect(screen.getByText(/Click stops in order/)).toBeInTheDocument();
      unmount();
    }
  });

  it('stays shut for a tool that draws no line', () => {
    useCityStore.setState({ selectedTool: 'road.two', overlay: null });
    const { container } = render(<TransitLinesPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names each line by its mode, so a swatch is not the only way to tell them apart', () => {
    useCityStore.setState({ selectedTool: 'transit.tram' });
    render(<TransitLinesPanel />);
    expect(screen.getByText('Bus 1')).toBeInTheDocument();
    expect(screen.getByText('Rail 2')).toBeInTheDocument();
    expect(screen.getByText('Tram 3')).toBeInTheDocument();
  });

  it('shows each line its own ridership', () => {
    useCityStore.setState({ selectedTool: 'transit.line' });
    render(<TransitLinesPanel />);
    expect(screen.getByText('300 riders')).toBeInTheDocument();
    expect(screen.getByText('120 riders')).toBeInTheDocument();
  });

  it('shows a served line its vehicles over its request, its headway and the month’s running cost', () => {
    useCityStore.setState({ selectedTool: 'transit.line' });
    render(<TransitLinesPanel />);
    expect(screen.getByTestId('line-2-service')).toHaveTextContent(
      '1 of 1 vehicles · every 12.5 min · ¢142/mo',
    );
    expect(screen.getByTestId('line-3-service')).toHaveTextContent(
      '2 of 3 vehicles · every 4.1 min · ¢140/mo',
    );
  });

  it('tells a line no depot fields which depot to build, by its mode', () => {
    useCityStore.setState({ selectedTool: 'transit.line' });
    render(<TransitLinesPanel />);
    expect(screen.getByTestId('line-1-no-depot')).toHaveTextContent('No depot — build a Bus Depot');
    expect(screen.queryByTestId('line-1-service')).not.toBeInTheDocument();

    cleanup();
    useCityStore.setState({
      transitFleet: {
        served: [0, 0, 0],
        requested: [2, 1, 3],
        headwayMin: [0, 0, 0],
        runningCost: [0, 0, 0],
      },
    });
    render(<TransitLinesPanel />);
    expect(screen.getByTestId('line-2-no-depot')).toHaveTextContent('build a Rail Yard');
    expect(screen.getByTestId('line-3-no-depot')).toHaveTextContent('build a Tram Depot');
  });

  it('sums the running cost the budget is charged', () => {
    useCityStore.setState({ selectedTool: 'transit.line' });
    render(<TransitLinesPanel />);
    expect(screen.getByTestId('transit-running-total')).toHaveTextContent('¢282/mo');
  });

  it('reads every line as running nothing before a snapshot carries fleet figures', () => {
    useCityStore.setState({ selectedTool: 'transit.line' });
    useCityStore.getState().setTransit(LINES, [40, 300, 120]);
    render(<TransitLinesPanel />);
    expect(screen.queryByTestId('line-1-no-depot')).not.toBeInTheDocument();
    expect(screen.getByTestId('line-1-service')).toHaveTextContent('0 of 0 vehicles');
  });
});
