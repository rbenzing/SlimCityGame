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
      '1 of 1 vehicle · every 12.5 min · ¢142/mo',
    );
    expect(screen.getByTestId('line-3-service')).toHaveTextContent(
      '2 of 3 vehicles · every 4.1 min · ¢140/mo',
    );
  });

  it('names the depot a served line runs from, and none for a line the worker gave no depot', () => {
    useCityStore.setState({
      selectedTool: 'transit.line',
      transitFleet: {
        served: [0, 1, 2],
        requested: [2, 1, 3],
        headwayMin: [0, 12.5, 4.1],
        runningCost: [0, 142, 140],
        depotId: [null, 7, null],
      },
    });
    render(<TransitLinesPanel />);
    expect(screen.getByTestId('line-2-service')).toHaveTextContent(
      '1 of 1 vehicle · every 12.5 min · ¢142/mo · from Rail Yard',
    );
    expect(screen.getByTestId('line-3-service')).not.toHaveTextContent('from');
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

  it('shows the shelter advertising income when the stats carry it, and no line when they do not', () => {
    useCityStore.setState({ selectedTool: 'transit.line' });
    const { unmount } = render(<TransitLinesPanel />);
    expect(screen.queryByTestId('shelter-advertising')).not.toBeInTheDocument();
    unmount();
    useCityStore.setState((s) => ({ stats: { ...s.stats, advertising: 21 } }));
    render(<TransitLinesPanel />);
    expect(screen.getByTestId('shelter-advertising')).toHaveTextContent('+¢21/mo');
  });

  it('states no service before a snapshot carries fleet figures, rather than a made-up zero', () => {
    useCityStore.setState({ selectedTool: 'transit.line' });
    useCityStore.getState().setTransit(LINES, [40, 300, 120]);
    render(<TransitLinesPanel />);
    expect(screen.queryByTestId('line-1-no-depot')).not.toBeInTheDocument();
    expect(screen.queryByTestId('line-1-service')).not.toBeInTheDocument();
    expect(screen.queryByTestId('line-1-idle')).not.toBeInTheDocument();
  });

  it('says a line that asks for no vehicles is not running, and why', () => {
    useCityStore.setState({
      selectedTool: 'transit.line',
      transitLines: [
        { id: 1, stops: [], color: 0xef5350 },
        { id: 2, stops: [], color: 0x42a5f5, vehicles: 0 },
      ],
      transitRidership: [0, 0],
      transitFleet: {
        served: [0, 0],
        requested: [0, 0],
        headwayMin: [0, 0],
        runningCost: [0, 0],
      },
    });
    render(<TransitLinesPanel />);
    expect(screen.getByTestId('line-1-idle')).toHaveTextContent(
      'Not running — its stops are not joined by a route',
    );
    expect(screen.getByTestId('line-2-idle')).toHaveTextContent(
      'Not running — set to run no vehicles',
    );
    expect(screen.queryByTestId('line-1-service')).not.toBeInTheDocument();
    expect(screen.queryByText(/0 of 0/)).not.toBeInTheDocument();
  });

  it('reads one rider and one vehicle in the singular', () => {
    useCityStore.setState({
      selectedTool: 'transit.line',
      transitRidership: [1, 300, 120],
      transitFleet: {
        served: [1, 1, 2],
        requested: [1, 1, 3],
        headwayMin: [12, 12.5, 4.1],
        runningCost: [40, 142, 140],
      },
    });
    render(<TransitLinesPanel />);
    expect(screen.getByText('1 rider')).toBeInTheDocument();
    expect(screen.getByTestId('line-2-service')).toHaveTextContent('1 of 1 vehicle · every');
  });

  it('does not claim a headway under a minute to a tenth of one', () => {
    useCityStore.setState({
      selectedTool: 'transit.line',
      transitFleet: {
        served: [1, 1, 1],
        requested: [1, 1, 1],
        headwayMin: [0.1, 12.5, 0.96],
        runningCost: [40, 142, 70],
      },
    });
    render(<TransitLinesPanel />);
    expect(screen.getByTestId('line-1-service')).toHaveTextContent('every under 1 min');
    expect(screen.getByTestId('line-1-service')).not.toHaveTextContent('0.1');
    expect(screen.getByTestId('line-3-service')).toHaveTextContent('every under 1 min');
  });
});
