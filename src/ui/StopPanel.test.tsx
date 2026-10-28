// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHELTER_WARRANT_BOARDINGS } from '../shared/types';
import type { BusStopState, Command } from '../shared/types';
import { useCityStore } from './store';
import { resetCityStore } from './test-helpers';
import { StopPanel } from './StopPanel';

beforeEach(() => {
  resetCityStore();
});

afterEach(() => {
  cleanup();
});

function bindSpy(): { sent: { label: string; commands: Command[] }[] } {
  const sent: { label: string; commands: Command[] }[] = [];
  useCityStore.getState().bindActions({
    sendCommands: (label: string, commands: Command[]) => sent.push({ label, commands }),
    undo: vi.fn(),
    redo: vi.fn(),
  } as never);
  return { sent };
}

function open(stop: BusStopState): void {
  useCityStore.getState().setStops([stop]);
  useCityStore.getState().setSelectedStop({ x: stop.x, z: stop.z, side: stop.side });
}

const SHELTER: BusStopState = {
  x: 4,
  z: 9,
  side: 1,
  kind: 'shelter',
  boardingsPerDay: SHELTER_WARRANT_BOARDINGS + 3,
  warranted: true,
};

describe('StopPanel', () => {
  it('renders nothing until a stop is picked', () => {
    const { container } = render(<StopPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows a shelter with its boardings a day and that it is warranted', () => {
    open(SHELTER);
    render(<StopPanel />);
    expect(screen.getByText(/Bus shelter/)).toBeInTheDocument();
    expect(screen.getByTestId('stop-boardings')).toHaveTextContent(
      String(SHELTER_WARRANT_BOARDINGS + 3),
    );
    expect(screen.getByTestId('stop-warranted')).toHaveTextContent('Yes');
  });

  it('says a shelter below the warrant is not warranted', () => {
    open({ ...SHELTER, boardingsPerDay: SHELTER_WARRANT_BOARDINGS - 1, warranted: false });
    render(<StopPanel />);
    expect(screen.getByTestId('stop-warranted')).toHaveTextContent('No');
  });

  it('offers a sign the upgrade, and says whether a shelter would be warranted there', () => {
    const { sent } = bindSpy();
    open({ ...SHELTER, kind: 'sign' });
    render(<StopPanel />);
    expect(screen.getByText(/Bus stop sign/)).toBeInTheDocument();
    expect(screen.getByText(/Shelter would be warranted/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Upgrade to a shelter'));
    expect(sent[0]?.commands).toEqual([
      { kind: 'placeStop', stop: { x: 4, z: 9, side: 1, kind: 'shelter' } },
    ]);
  });

  it('gives a shelter no upgrade', () => {
    open(SHELTER);
    render(<StopPanel />);
    expect(screen.queryByText('Upgrade to a shelter')).not.toBeInTheDocument();
  });

  it('removes the stop and closes', () => {
    const { sent } = bindSpy();
    open(SHELTER);
    render(<StopPanel />);
    fireEvent.click(screen.getByText('Remove the stop'));
    expect(sent[0]?.commands).toEqual([{ kind: 'removeStop', x: 4, z: 9, side: 1 }]);
    expect(useCityStore.getState().selectedStop).toBeNull();
  });

  it('closes when the stop is taken off the snapshot', () => {
    open(SHELTER);
    useCityStore.getState().setStops([]);
    expect(useCityStore.getState().selectedStop).toBeNull();
  });
});
