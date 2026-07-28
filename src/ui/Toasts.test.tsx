// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useCityStore } from './store';
import { resetCityStore } from './test-helpers';
import { Toasts } from './Toasts';

beforeEach(() => {
  resetCityStore();
});

afterEach(() => {
  cleanup();
});

describe('Toasts', () => {
  it('renders the title and body of each notification', () => {
    useCityStore
      .getState()
      .pushNotification({ id: 1, severity: 'info', title: 'Hello', body: 'World', tick: 0 });
    render(<Toasts />);
    expect(screen.getByText('Hello')).toBeInTheDocument();
    expect(screen.getByText('World')).toBeInTheDocument();
  });

  it('the close button dismisses a notification immediately regardless of severity', () => {
    useCityStore
      .getState()
      .pushNotification({ id: 3, severity: 'critical', title: 'Crit', body: 'b', tick: 0 });
    render(<Toasts />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(useCityStore.getState().notifications).toHaveLength(0);
  });

  it('does not auto-dismiss an info toast before the 6s-equivalent tick threshold', () => {
    useCityStore
      .getState()
      .pushNotification({ id: 1, severity: 'info', title: 'Info', body: 'body', tick: 0 });
    useCityStore.setState((s) => ({ stats: { ...s.stats, tick: 50 } }));
    render(<Toasts />);
    expect(screen.getByText('Info')).toBeInTheDocument();
    expect(useCityStore.getState().notifications).toHaveLength(1);
  });

  it('auto-dismisses an info toast once stats.tick passes the 6s-equivalent threshold', () => {
    useCityStore
      .getState()
      .pushNotification({ id: 1, severity: 'info', title: 'Info', body: 'body', tick: 0 });
    useCityStore.setState((s) => ({ stats: { ...s.stats, tick: 50 } }));
    render(<Toasts />);

    act(() => {
      useCityStore.setState((s) => ({ stats: { ...s.stats, tick: 130 } }));
    });

    expect(screen.queryByText('Info')).not.toBeInTheDocument();
    expect(useCityStore.getState().notifications).toHaveLength(0);
  });

  it('does not auto-dismiss warning/critical toasts even after the threshold passes', () => {
    useCityStore
      .getState()
      .pushNotification({ id: 2, severity: 'warning', title: 'Warn', body: 'body', tick: 0 });
    useCityStore
      .getState()
      .pushNotification({ id: 4, severity: 'critical', title: 'Crit2', body: 'body', tick: 0 });
    render(<Toasts />);

    act(() => {
      useCityStore.setState((s) => ({ stats: { ...s.stats, tick: 500 } }));
    });

    expect(screen.getByText('Warn')).toBeInTheDocument();
    expect(screen.getByText('Crit2')).toBeInTheDocument();
    expect(useCityStore.getState().notifications).toHaveLength(2);
  });
});

describe('Toasts placeholder markers (UI-SPEC §8)', () => {
  it('marks the severity emoji and the dismiss glyph with data-placeholder', () => {
    useCityStore
      .getState()
      .pushNotification({ id: 9, severity: 'warning', title: 'W', body: 'b', tick: 0 });
    render(<Toasts />);
    expect(screen.getByText('⚠️')).toHaveAttribute('data-placeholder', 'emoji');
    expect(screen.getByRole('button', { name: /dismiss/i })).toHaveAttribute(
      'data-placeholder',
      'glyph',
    );
  });
});
