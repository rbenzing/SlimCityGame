// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LENS_RAMP_STOPS } from '../shared/lenses';
import { FieldId } from '../shared/types';
import { useCityStore } from './store';
import { resetCityStore } from './test-helpers';
import { ViewChip } from './ViewChip';

beforeEach(() => {
  resetCityStore();
});

afterEach(() => {
  cleanup();
});

const chip = (): HTMLElement => screen.getByRole('group', { name: 'Active view' });
const noChip = (): void => {
  expect(screen.queryByRole('group', { name: 'Active view' })).not.toBeInTheDocument();
};

describe('ViewChip', () => {
  it('renders nothing in the plain view', () => {
    render(<ViewChip />);
    noChip();
    expect(screen.queryByRole('button', { name: 'Exit view' })).not.toBeInTheDocument();
  });

  it('names a lens by its Infoviews label and shows the Esc hint', () => {
    useCityStore.getState().setOverlay(FieldId.FireRisk);
    render(<ViewChip />);
    expect(chip()).toHaveTextContent('Fire Risk lens');
    const exit = screen.getByRole('button', { name: 'Exit view' });
    expect(exit).toHaveTextContent('Exit');
    expect(exit).toHaveTextContent('Esc');
  });

  it('says "Underground view" when a tool keeps the city underground and no lens is on', () => {
    useCityStore.getState().setTool('water.pipe');
    render(<ViewChip />);
    expect(chip()).toHaveTextContent('Underground view');
  });

  it('adds "underground" to the Water and Sewer lenses', () => {
    useCityStore.getState().setOverlay('watered');
    render(<ViewChip />);
    expect(chip()).toHaveTextContent('Water lens · underground');
    cleanup();
    useCityStore.getState().setOverlay('sewered');
    render(<ViewChip />);
    expect(chip()).toHaveTextContent('Sewer lens · underground');
  });

  it('leaves a lens in one click and keeps the tool in hand', () => {
    const store = useCityStore.getState();
    store.setOverlay(FieldId.Pollution);
    store.setTool('road.two');
    render(<ViewChip />);
    fireEvent.click(screen.getByRole('button', { name: 'Exit view' }));
    expect(useCityStore.getState().overlay).toBeNull();
    expect(useCityStore.getState().selectedTool).toBe('road.two');
    noChip();
  });

  it('leaves the underground view held by a tool by dropping the tool', () => {
    useCityStore.getState().setTool('power.cable');
    render(<ViewChip />);
    fireEvent.click(screen.getByRole('button', { name: 'Exit view' }));
    expect(useCityStore.getState().selectedTool).toBe('select');
    noChip();
  });

  describe('legend', () => {
    const legend = (): HTMLElement => screen.getByRole('region', { name: 'Legend' });

    it('names a graded lens and labels both ends of its scale in words and units', () => {
      useCityStore.getState().setOverlay(FieldId.LandValue);
      render(<ViewChip />);
      expect(legend()).toHaveTextContent('Land Value');
      expect(legend()).toHaveTextContent('0 Cheap');
      expect(legend()).toHaveTextContent('Dear 255');
      expect(legend()).toHaveTextContent('land value, 0 to 255');
    });

    it('paints the scale from the same stops the renderer ramps through', () => {
      useCityStore.getState().setOverlay(FieldId.Noise);
      render(<ViewChip />);
      const bar = legend().querySelector<HTMLElement>('[style*="linear-gradient"]')!;
      const [, [r, g, b]] = LENS_RAMP_STOPS.worse[0]!;
      const first = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
      expect(bar.style.backgroundImage).toContain(first);
    });

    it('lists the named categories of a categorical lens', () => {
      useCityStore.getState().setOverlay('power');
      render(<ViewChip />);
      expect(legend()).toHaveTextContent('Powered');
      expect(legend()).toHaveTextContent('No power');
    });

    it('says what an empty lens is missing', () => {
      useCityStore.getState().setOverlay(FieldId.Pollution);
      useCityStore.getState().setLensEmpty(true);
      render(<ViewChip />);
      expect(legend()).toHaveTextContent('Nothing to show yet: no polluters built');
    });

    it('shows the scale, not the empty sentence, while the lens has data', () => {
      useCityStore.getState().setOverlay(FieldId.Pollution);
      render(<ViewChip />);
      expect(legend()).not.toHaveTextContent('Nothing to show yet');
      expect(legend()).toHaveTextContent('Clean');
    });

    it('lists the transit lines by name, and says so when there are none', () => {
      useCityStore.getState().setOverlay('transit');
      render(<ViewChip />);
      expect(legend()).toHaveTextContent('Nothing to show yet: no transit lines built');
      cleanup();
      useCityStore.setState({
        transitLines: [{ id: 3, stops: [], color: 0x2288cc, mode: 'tram' }],
      });
      render(<ViewChip />);
      expect(legend()).toHaveTextContent('Tram 3');
      expect(legend()).not.toHaveTextContent('Nothing to show yet');
    });

    it('names every thing the underground view draws', () => {
      useCityStore.getState().setTool('power.cable');
      render(<ViewChip />);
      for (const name of ['Water pipe', 'Sewer', 'Buried cable', 'Junction box or riser foot']) {
        expect(legend()).toHaveTextContent(name);
      }
    });

    it('says what the Water and Sewer lenses each add to the one pipe network', () => {
      useCityStore.getState().setOverlay('watered');
      render(<ViewChip />);
      expect(legend()).toHaveTextContent('where the water reaches');
      cleanup();
      useCityStore.getState().setOverlay('sewered');
      render(<ViewChip />);
      expect(legend()).toHaveTextContent('where a drain reaches');
    });

    it('is absent in the plain view', () => {
      render(<ViewChip />);
      expect(screen.queryByRole('region', { name: 'Legend' })).not.toBeInTheDocument();
    });
  });

  it('clears a water lens and the pipe tool together', () => {
    const store = useCityStore.getState();
    store.setOverlay('watered');
    store.setTool('water.pipe');
    render(<ViewChip />);
    fireEvent.click(screen.getByRole('button', { name: 'Exit view' }));
    expect(useCityStore.getState().overlay).toBeNull();
    expect(useCityStore.getState().selectedTool).toBe('select');
    noChip();
  });
});
