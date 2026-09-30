// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { RoadTier } from '../shared/types';
import { InterchangeToolOptions } from './InterchangeToolOptions';
import { RoadToolOptions } from './RoadToolOptions';
import { useCityStore } from './store';
import { resetCityStore } from './test-helpers';

beforeEach(() => {
  resetCityStore();
});

afterEach(() => {
  cleanup();
});

describe('InterchangeToolOptions', () => {
  it('shows only while the Interchange tool is in hand', () => {
    useCityStore.getState().setTool('road.two');
    const { container } = render(<InterchangeToolOptions />);
    expect(container).toBeEmptyDOMElement();
  });

  it('starts on a diamond carrying a two-lane road', () => {
    useCityStore.getState().setTool('interchange');
    render(<InterchangeToolOptions />);
    expect(screen.getByRole('button', { name: 'Diamond' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Two-lane' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('sets the form and the crossing road the tool lays', () => {
    useCityStore.getState().setTool('interchange');
    render(<InterchangeToolOptions />);
    fireEvent.click(screen.getByRole('button', { name: 'Cloverleaf' }));
    fireEvent.click(screen.getByRole('button', { name: 'Four-lane' }));
    expect(useCityStore.getState().interchange).toEqual({
      form: 'cloverleaf',
      streetTier: RoadTier.FourLane,
    });
    expect(screen.getByRole('button', { name: 'Cloverleaf' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('offers none of a drawn road’s options, which do not apply to it', () => {
    useCityStore.getState().setTool('interchange');
    const { container } = render(<RoadToolOptions />);
    expect(container).toBeEmptyDOMElement();
  });
});
