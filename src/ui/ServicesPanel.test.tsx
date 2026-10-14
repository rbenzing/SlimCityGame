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
  const zero: ServiceLoad = { load: 0, worst: 0, capped: 0 };
  return {
    police: partial.police ?? zero,
    fire: partial.fire ?? zero,
    health: partial.health ?? zero,
    education: partial.education ?? zero,
    'middle-education': partial['middle-education'] ?? zero,
    'high-education': partial['high-education'] ?? zero,
    'college-education': partial['college-education'] ?? zero,
    library: partial.library ?? zero,
    park: partial.park ?? zero,
  };
}

const KINDS: readonly ServiceKind[] = [
  'police',
  'fire',
  'health',
  'education',
  'middle-education',
  'high-education',
  'college-education',
  'library',
  'park',
];

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
        police: { load: 1.38, worst: 1.38, capped: 2 },
        fire: { load: 0.62, worst: 0.9, capped: 1 },
        health: { load: 1.0, worst: 1.2, capped: 3 },
        education: { load: 0.5, worst: 0.75, capped: 1 },
        'middle-education': { load: 3.1, worst: 3.4, capped: 1 },
        'high-education': { load: 0.8, worst: 0.9, capped: 1 },
        'college-education': { load: 0.05, worst: 0.05, capped: 1 },
        library: { load: 1.5, worst: 1.5, capped: 2 },
        park: { load: 0.25, worst: 0.3, capped: 1 },
      }),
    );
    render(<ServicesPanel />);

    const expected: Record<ServiceKind, string> = {
      police: '138%',
      fire: '62%',
      health: '100%',
      education: '50%',
      'middle-education': '310%',
      'high-education': '80%',
      'college-education': '5%',
      library: '150%',
      park: '25%',
    };
    for (const kind of KINDS) {
      expect(screen.getByTestId(`service-load-${kind}`)).toHaveTextContent(expected[kind]);
    }
  });

  it('splits Education into a row per rung and the library, each its own load, and funds them all from one slider', () => {
    open();
    useCityStore
      .getState()
      .setServiceLoad(loads({ 'middle-education': { load: 3.1, worst: 3.4, capped: 1 } }));
    render(<ServicesPanel />);

    for (const [kind, label] of [
      ['education', 'Elementary'],
      ['middle-education', 'Middle'],
      ['high-education', 'High'],
      ['college-education', 'College'],
      ['library', 'Library'],
    ] as const) {
      expect(screen.getByTestId(`service-load-${kind}`)).toBeInTheDocument();
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    // A rung that is leaned on is flagged without the others being touched.
    expect(screen.getByTestId('service-load-middle-education')).toHaveAttribute(
      'data-over',
      'true',
    );
    expect(screen.getByTestId('service-load-high-education')).toHaveAttribute('data-over', 'false');
    // One department, one slider: the rungs read its funding rather than own one.
    expect(screen.getAllByRole('slider', { name: /education funding/i })).toHaveLength(1);
    expect(screen.queryByRole('slider', { name: /middle funding/i })).toBeNull();
    expect(screen.getByTestId('service-funding-college-education')).toHaveTextContent('1.00');
  });

  it('moves every education row together when the one Education slider moves, and sends the department key', () => {
    open();
    const { sent } = bindSpy();
    render(<ServicesPanel />);

    fireEvent.change(screen.getByRole('slider', { name: /education funding/i }), {
      target: { value: '1.35' },
    });

    expect(sent[0]!.commands).toEqual([
      { kind: 'setServiceFunding', service: 'education', funding: 1.35 },
    ]);
    for (const kind of ['education', 'middle-education', 'high-education', 'college-education']) {
      expect(screen.getByTestId(`service-funding-${kind}`)).toHaveTextContent('1.35');
    }
    expect(screen.getByTestId('service-funding-library')).toHaveTextContent('1.35');
    expect(screen.getByTestId('service-funding-police')).toHaveTextContent('1.00');
  });

  it('opens on each rung’s own lens', () => {
    for (const field of [
      FieldId.MiddleEducation,
      FieldId.HighEducation,
      FieldId.CollegeEducation,
    ]) {
      cleanup();
      resetCityStore();
      useCityStore.getState().setOverlay(field);
      render(<ServicesPanel />);
      expect(screen.getByTestId('service-load-library')).toBeInTheDocument();
    }
  });

  it('renders a kind with no capped facility as an em dash, never as 0%', () => {
    open();
    useCityStore.getState().setServiceLoad(
      loads({
        health: { load: 1.2, worst: 1.4, capped: 1 },
        park: { load: 0, worst: 0, capped: 0 },
      }),
    );
    render(<ServicesPanel />);

    expect(screen.getByTestId('service-load-park')).toHaveTextContent('—');
    expect(screen.getByTestId('service-load-park')).not.toHaveTextContent('0%');
    expect(screen.getByTestId('service-worst-park')).toHaveTextContent('—');
  });

  it('reads a capped facility that reaches nobody as 0%, never as an em dash', () => {
    open();
    useCityStore.getState().setServiceLoad(loads({ health: { load: 0, worst: 0, capped: 1 } }));
    render(<ServicesPanel />);

    expect(screen.getByTestId('service-load-health')).toHaveTextContent('0%');
    expect(screen.getByTestId('service-load-health')).not.toHaveTextContent('—');
  });

  it('does not dress that 0% as an overloaded service — nobody depends on it', () => {
    open();
    useCityStore.getState().setServiceLoad(loads({ health: { load: 0, worst: 0, capped: 1 } }));
    render(<ServicesPanel />);

    const gauge = screen.getByTestId('service-load-health');
    expect(gauge).toHaveAttribute('data-over', 'false');
    expect(gauge).not.toHaveClass('text-danger');
  });

  it('reads an uncapped kind as an em dash whatever its facilities do', () => {
    open();
    useCityStore.getState().setServiceLoad(loads({ park: { load: 0, worst: 0, capped: 0 } }));
    render(<ServicesPanel />);

    expect(screen.getByTestId('service-load-park')).toHaveTextContent('—');
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
    useCityStore.getState().setServiceLoad(
      loads({
        police: { load: 1.38, worst: 2, capped: 1 },
        health: { load: 0.62, worst: 0.8, capped: 1 },
      }),
    );
    render(<ServicesPanel />);

    expect(screen.getByTestId('service-load-police')).toHaveAttribute('data-over', 'true');
    expect(screen.getByTestId('service-load-health')).toHaveAttribute('data-over', 'false');
  });

  it('shows the worst district beside the aggregate, and they are different numbers', () => {
    open();
    useCityStore
      .getState()
      .setServiceLoad(loads({ education: { load: 0.95, worst: 2.4, capped: 1 } }));
    render(<ServicesPanel />);

    expect(screen.getByTestId('service-load-education')).toHaveTextContent('95%');
    expect(screen.getByTestId('service-worst-education')).toHaveTextContent('240%');
  });

  it('reads the calls a kind has in flight over the calls it can run, apart from its load', () => {
    open();
    useCityStore.getState().setServiceLoad(loads({ fire: { load: 0.62, worst: 0.9, capped: 1 } }));
    useCityStore.getState().setResponders({
      fire: { inFlight: 1, total: 1 },
      police: { inFlight: 2, total: 6 },
    });
    render(<ServicesPanel />);

    expect(screen.getByTestId('service-responders-fire')).toHaveTextContent('1/1');
    expect(screen.getByTestId('service-responders-police')).toHaveTextContent('2/6');
    // The load is its own number: it never moves with the responders.
    expect(screen.getByTestId('service-load-fire')).toHaveTextContent('62%');
    // Only a kind with every responder out is flagged.
    expect(screen.getByTestId('service-responders-fire')).toHaveAttribute('data-busy', 'true');
    expect(screen.getByTestId('service-responders-police')).toHaveAttribute('data-busy', 'false');
  });

  it('reads an em dash for a kind with no responders figure, and for every kind before any arrive', () => {
    open();
    useCityStore.getState().setResponders({ fire: { inFlight: 0, total: 1 } });
    render(<ServicesPanel />);

    expect(screen.getByTestId('service-responders-fire')).toHaveTextContent('0/1');
    expect(screen.getByTestId('service-responders-health')).toHaveTextContent('—');
    cleanup();

    useCityStore.getState().setResponders(null);
    render(<ServicesPanel />);
    for (const kind of KINDS) {
      expect(screen.getByTestId(`service-responders-${kind}`)).toHaveTextContent('—');
    }
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
