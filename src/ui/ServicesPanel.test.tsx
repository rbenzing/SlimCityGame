// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SERVICE_FUNDING_MAX, SERVICE_FUNDING_MIN } from '../shared/constants';
import { FieldId } from '../shared/types';
import type { Command, ServiceKind, ServiceLoad } from '../shared/types';
import { useCityStore } from './store';
import { resetCityStore } from './test-helpers';
import { ServicesPanel } from './ServicesPanel';

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

/** The panel is gated like the district/transit ones; a service lens opens it. */
function open(): void {
  useCityStore.getState().setOverlay(FieldId.Health);
}

function loads(
  partial: Partial<Record<ServiceKind, ServiceLoad>>,
): Record<ServiceKind, ServiceLoad> {
  const zero: ServiceLoad = { load: 0, worst: 0 };
  return {
    police: partial.police ?? zero,
    fire: partial.fire ?? zero,
    health: partial.health ?? zero,
    education: partial.education ?? zero,
    park: partial.park ?? zero,
  };
}

const KINDS: readonly ServiceKind[] = ['police', 'fire', 'health', 'education', 'park'];

describe('ServicesPanel', () => {
  it('stays shut until a service tool is in hand or a service lens is on', () => {
    const { container } = render(<ServicesPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens with a service ploppable in hand', () => {
    useCityStore.getState().setTool('plop.police-station');
    render(<ServicesPanel />);
    expect(screen.getByRole('slider', { name: /police funding/i })).toBeInTheDocument();
  });

  it('shows a row per service kind, each reading its load as a percentage', () => {
    open();
    useCityStore.getState().setServiceLoad(
      loads({
        police: { load: 1.38, worst: 1.38 },
        fire: { load: 0.62, worst: 0.9 },
        health: { load: 1.0, worst: 1.2 },
        education: { load: 0.5, worst: 0.75 },
        park: { load: 0.25, worst: 0.3 },
      }),
    );
    render(<ServicesPanel />);

    const expected: Record<ServiceKind, string> = {
      police: '138%',
      fire: '62%',
      health: '100%',
      education: '50%',
      park: '25%',
    };
    for (const kind of KINDS) {
      expect(screen.getByTestId(`service-load-${kind}`)).toHaveTextContent(expected[kind]);
    }
  });

  it('renders a kind with no capped facility as an em dash, never as 0%', () => {
    open();
    useCityStore
      .getState()
      .setServiceLoad(loads({ health: { load: 1.2, worst: 1.4 }, park: { load: 0, worst: 0 } }));
    render(<ServicesPanel />);

    expect(screen.getByTestId('service-load-park')).toHaveTextContent('—');
    expect(screen.getByTestId('service-load-park')).not.toHaveTextContent('0%');
    expect(screen.getByTestId('service-worst-park')).toHaveTextContent('—');
  });

  it('reads every row as an em dash when the snapshot carries no serviceLoad at all', () => {
    open();
    render(<ServicesPanel />);
    for (const kind of KINDS) {
      expect(screen.getByTestId(`service-load-${kind}`)).toHaveTextContent('—');
      expect(screen.getByTestId(`service-worst-${kind}`)).toHaveTextContent('—');
    }
  });

  it('marks a load over 100% differently from one under it', () => {
    open();
    useCityStore
      .getState()
      .setServiceLoad(
        loads({ police: { load: 1.38, worst: 2 }, health: { load: 0.62, worst: 0.8 } }),
      );
    render(<ServicesPanel />);

    expect(screen.getByTestId('service-load-police')).toHaveAttribute('data-over', 'true');
    expect(screen.getByTestId('service-load-health')).toHaveAttribute('data-over', 'false');
  });

  it('shows the worst district beside the aggregate, and they are different numbers', () => {
    open();
    useCityStore.getState().setServiceLoad(loads({ education: { load: 0.95, worst: 2.4 } }));
    render(<ServicesPanel />);

    expect(screen.getByTestId('service-load-education')).toHaveTextContent('95%');
    expect(screen.getByTestId('service-worst-education')).toHaveTextContent('240%');
  });

  it('sends setServiceFunding and shows the new value before the worker confirms', () => {
    open();
    const { sent } = bindSpy();
    render(<ServicesPanel />);

    fireEvent.change(screen.getByRole('slider', { name: /police funding/i }), {
      target: { value: '1.2' },
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]!.commands).toEqual([
      { kind: 'setServiceFunding', service: 'police', funding: 1.2 },
    ]);
    // No snapshot has arrived: the reading is the panel's own optimistic one.
    expect(screen.getByTestId('service-funding-police')).toHaveTextContent('1.2');
    expect(screen.getByRole('slider', { name: /police funding/i })).toHaveValue('1.2');
  });

  it('cannot send a funding value outside what the command accepts', () => {
    open();
    const { sent } = bindSpy();
    render(<ServicesPanel />);

    const slider = screen.getByRole('slider', { name: /fire funding/i });
    expect(slider).toHaveAttribute('min', String(SERVICE_FUNDING_MIN));
    expect(slider).toHaveAttribute('max', String(SERVICE_FUNDING_MAX));

    fireEvent.change(slider, { target: { value: '9' } });
    fireEvent.change(slider, { target: { value: '-4' } });
    // The DOM sanitizes a range input's own value, so the guard that actually
    // protects the command is the one on the dispatch the slider calls.
    useCityStore.getState().setServiceFunding('fire', 9);
    useCityStore.getState().setServiceFunding('fire', -4);

    for (const { commands } of sent) {
      const command = commands[0]!;
      expect(command.kind).toBe('setServiceFunding');
      const funding = (command as { funding: number }).funding;
      expect(funding).toBeGreaterThanOrEqual(SERVICE_FUNDING_MIN);
      expect(funding).toBeLessThanOrEqual(SERVICE_FUNDING_MAX);
    }
  });
});
