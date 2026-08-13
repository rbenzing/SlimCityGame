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
  useCityStore.setState({ transitLines: LINES, transitRidership: [40, 300, 120] });
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
});
