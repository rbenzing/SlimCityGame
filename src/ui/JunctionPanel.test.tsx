// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoadFlow } from '../shared/types';
import type { Command } from '../shared/types';
import { armAllowed, Movement, withArmAllowed } from '../shared/approach';
import { useCityStore } from './store';
import { resetCityStore } from './test-helpers';
import { JunctionPanel } from './JunctionPanel';

beforeEach(() => {
  resetCityStore();
});

afterEach(() => {
  cleanup();
});

/** Captures what the panel sends, the way the worker bridge would receive it. */
function bindSpy(): { sent: { label: string; commands: Command[] }[] } {
  const sent: { label: string; commands: Command[] }[] = [];
  useCityStore.getState().bindActions({
    sendCommands: (label: string, commands: Command[]) => sent.push({ label, commands }),
    undo: vi.fn(),
    redo: vi.fn(),
  } as never);
  return { sent };
}

describe('JunctionPanel', () => {
  it('renders nothing until a junction is picked', () => {
    const { container } = render(<JunctionPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names who gives way, and where', () => {
    useCityStore
      .getState()
      .setSelectedJunction({
        x: 12,
        z: 30,
        control: 'signal',
        warranted: 'signal',
        auto: true,
        turns: 0,
        arms: [],
      });
    render(<JunctionPanel />);
    expect(screen.getByTestId('junction-current')).toHaveTextContent('Signals');
    expect(screen.getByText(/12, 30/)).toBeInTheDocument();
  });

  it('shows a junction on its warrant as Automatic, not as the control it resolved to', () => {
    useCityStore
      .getState()
      .setSelectedJunction({
        x: 1,
        z: 1,
        control: 'stop',
        warranted: 'stop',
        auto: true,
        turns: 0,
        arms: [],
      });
    render(<JunctionPanel />);
    expect(screen.getByRole('button', { name: /Automatic/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    // The Stop chip is NOT pressed: the warrant chose it, the player did not.
    expect(screen.getByRole('button', { name: 'Stop' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('marks the chip the player actually chose', () => {
    useCityStore
      .getState()
      .setSelectedJunction({
        x: 1,
        z: 1,
        control: 'stop',
        warranted: 'stop',
        auto: false,
        turns: 0,
        arms: [],
      });
    render(<JunctionPanel />);
    expect(screen.getByRole('button', { name: 'Stop' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Automatic/ })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('sends the control the player picks, at the junction they picked it on', () => {
    const { sent } = bindSpy();
    useCityStore
      .getState()
      .setSelectedJunction({
        x: 4,
        z: 9,
        control: 'none',
        warranted: 'none',
        auto: true,
        turns: 0,
        arms: [],
      });
    render(<JunctionPanel />);

    fireEvent.click(screen.getByRole('button', { name: 'All-way stop' }));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.commands).toEqual([
      { kind: 'setJunctionControl', x: 4, z: 9, control: 'allWayStop' },
    ]);
    // And the panel shows the choice at once rather than waiting a snapshot.
    expect(useCityStore.getState().selectedJunction).toMatchObject({
      x: 4,
      z: 9,
      control: 'allWayStop',
      warranted: 'none',
      auto: false,
    });
  });

  it('hands a junction back to the warrant with a null', () => {
    const { sent } = bindSpy();
    useCityStore
      .getState()
      .setSelectedJunction({
        x: 4,
        z: 9,
        control: 'signal',
        warranted: 'signal',
        auto: false,
        turns: 0,
        arms: [],
      });
    render(<JunctionPanel />);

    fireEvent.click(screen.getByRole('button', { name: /Automatic/ }));
    expect(sent[0]!.commands).toEqual([{ kind: 'setJunctionControl', x: 4, z: 9, control: null }]);
    // Back on the warrant, showing what the warrant makes of it.
    expect(useCityStore.getState().selectedJunction).toMatchObject({
      control: 'signal',
      auto: true,
    });
  });

  it('says what handing the junction back would mean, even while it is overridden', () => {
    useCityStore
      .getState()
      .setSelectedJunction({
        x: 2,
        z: 2,
        control: 'none',
        warranted: 'signal',
        auto: false,
        turns: 0,
        arms: [],
      });
    render(<JunctionPanel />);
    // Not "Uncontrolled as it stands" — that is what the PLAYER set, not what
    // automatic would do.
    expect(screen.getByRole('button', { name: /Automatic/ })).toHaveTextContent(
      'Signals as it stands',
    );
  });

  it('offers the ladder least restrictive first, then the roundabout off the end of it', () => {
    useCityStore
      .getState()
      .setSelectedJunction({
        x: 0,
        z: 0,
        control: 'none',
        warranted: 'none',
        auto: true,
        turns: 0,
        arms: [],
      });
    render(<JunctionPanel />);
    const labels = ['Uncontrolled', 'Give way', 'Stop', 'All-way stop', 'Signals', 'Roundabout'];
    const rendered = screen
      .getAllByRole('button')
      .map((b) => b.textContent ?? '')
      .filter((t) => labels.includes(t));
    expect(rendered).toEqual(labels);
  });

  it('lists a row per arm the junction actually has, and none for the rest', () => {
    useCityStore.getState().setSelectedJunction({
      x: 5,
      z: 5,
      control: 'signal',
      warranted: 'signal',
      auto: true,
      turns: 0,
      arms: [RoadFlow.North, RoadFlow.South],
    });
    render(<JunctionPanel />);
    expect(screen.getByText('From the north')).toBeInTheDocument();
    expect(screen.getByText('From the south')).toBeInTheDocument();
    expect(screen.queryByText('From the east')).not.toBeInTheDocument();
  });

  it('shows every turn on by default, and sends the one the player takes away', () => {
    const { sent } = bindSpy();
    useCityStore.getState().setSelectedJunction({
      x: 5,
      z: 6,
      control: 'signal',
      warranted: 'signal',
      auto: true,
      turns: 0,
      arms: [RoadFlow.North],
    });
    render(<JunctionPanel />);
    const left = screen.getByRole('button', { name: 'From the north: Left' });
    expect(left).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(left);
    expect(sent[0]!.commands).toEqual([
      {
        kind: 'setJunctionTurns',
        x: 5,
        z: 6,
        arm: RoadFlow.North,
        allowed: Movement.Through | Movement.Right,
      },
    ]);
    expect(armAllowed(useCityStore.getState().selectedJunction!.turns, RoadFlow.North)).toBe(
      Movement.Through | Movement.Right,
    );
  });

  it('will not let the last turn an arm has be taken away', () => {
    const { sent } = bindSpy();
    useCityStore.getState().setSelectedJunction({
      x: 5,
      z: 6,
      control: 'signal',
      warranted: 'signal',
      auto: true,
      turns: withArmAllowed(0, RoadFlow.North, Movement.Through),
      arms: [RoadFlow.North],
    });
    render(<JunctionPanel />);
    const through = screen.getByRole('button', { name: 'From the north: Through' });
    expect(through).toBeDisabled();
    fireEvent.click(through);
    expect(sent).toHaveLength(0);
    // The turns it does not have are still offered, so they can be put back.
    expect(screen.getByRole('button', { name: 'From the north: Left' })).not.toBeDisabled();
  });

  it('closes on the X', () => {
    useCityStore
      .getState()
      .setSelectedJunction({
        x: 0,
        z: 0,
        control: 'none',
        warranted: 'none',
        auto: true,
        turns: 0,
        arms: [],
      });
    render(<JunctionPanel />);
    fireEvent.click(screen.getByRole('button', { name: /close junction inspector/i }));
    expect(useCityStore.getState().selectedJunction).toBeNull();
  });
});
