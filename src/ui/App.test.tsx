// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useCityStore } from './store';
import { resetCityStore } from './test-helpers';
import App, { mountUi } from './App';

beforeEach(() => {
  resetCityStore();
});

afterEach(() => {
  cleanup();
});

describe('App', () => {
  it('renders the main dock, status strip, and corner buttons as siblings', () => {
    render(<App />);
    expect(screen.getByRole('toolbar', { name: 'Main dock' })).toBeInTheDocument();
    expect(screen.getByRole('contentinfo', { name: 'Status strip' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Roads' })).toBeInTheDocument();
    expect(screen.getByText('Riverton')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /city info/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /help/i })).toBeInTheDocument();
  });

  it('shows a toast pushed onto the store', () => {
    useCityStore.getState().pushNotification({
      id: 1,
      severity: 'info',
      title: 'Welcome',
      body: 'to SlimCity',
      tick: 0,
    });
    render(<App />);
    expect(screen.getByText('Welcome')).toBeInTheDocument();
  });

  it('shows the info panel once a building is selected', () => {
    useCityStore.getState().setSelectedBuilding({
      id: 1,
      catalogId: 'res-low-1',
      x: 0,
      z: 0,
      rotation: 0,
      level: 1,
      state: 1,
      problems: 0,
    });
    render(<App />);
    expect(screen.getByText('Small House')).toBeInTheDocument();
  });

  describe('category / drawer navigation', () => {
    it('opens the asset drawer for a category and closes it on a second click', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Roads' }));
      expect(screen.getByText('Two-Lane Road')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Roads' }));
      expect(screen.queryByText('Two-Lane Road')).not.toBeInTheDocument();
    });

    it('switching categories swaps the drawer contents without a second click', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Roads' }));
      fireEvent.click(screen.getByRole('button', { name: 'Water' }));
      expect(screen.getByText('Water Tower')).toBeInTheDocument();
      expect(screen.queryByText('Two-Lane Road')).not.toBeInTheDocument();
    });

    it('selecting a road tool from the drawer reveals the tool options panel', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Roads' }));
      fireEvent.click(screen.getByText('Two-Lane Road'));
      expect(screen.getByRole('button', { name: 'Straight' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'L-path' })).toBeInTheDocument();
    });

    it('closes the drawer on Escape', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Roads' }));
      expect(screen.getByText('Two-Lane Road')).toBeInTheDocument();

      act(() => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }),
        );
      });
      expect(screen.queryByText('Two-Lane Road')).not.toBeInTheDocument();
    });

    it("the drawer's ✕ exits placement mode: closes the drawer AND resets the tool to select (hides the zoning grid) — playtest round 6", () => {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Roads' }));
      fireEvent.click(screen.getByText('Two-Lane Road'));
      expect(useCityStore.getState().selectedTool).toBe('road.two');

      fireEvent.click(screen.getByRole('button', { name: /close asset drawer/i }));

      expect(screen.queryByText('Two-Lane Road')).not.toBeInTheDocument(); // drawer closed
      expect(useCityStore.getState().selectedTool).toBe('select'); // placement mode exited
    });

    it('closing the drawer via the dock category toggle also exits placement mode (no sticky tool)', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Water' }));
      fireEvent.click(screen.getByText('Water Tower'));
      expect(useCityStore.getState().selectedTool).toBe('plop.water-tower');

      // Second click on the same category button closes the drawer — previously
      // this left the ploppable "in hand" so clicks kept placing it.
      fireEvent.click(screen.getByRole('button', { name: 'Water' }));
      expect(screen.queryByText('Water Tower')).not.toBeInTheDocument();
      expect(useCityStore.getState().selectedTool).toBe('select');
    });

    it('switching categories drops the previously-held tool (must pick a new asset to place)', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Water' }));
      fireEvent.click(screen.getByText('Water Tower'));
      expect(useCityStore.getState().selectedTool).toBe('plop.water-tower');

      fireEvent.click(screen.getByRole('button', { name: 'Roads' }));
      expect(useCityStore.getState().selectedTool).toBe('select');
    });
  });

  describe('staged Escape stack (UI-SPEC §4)', () => {
    const pressEscape = (prevented = false): void => {
      const e = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        bubbles: true,
        cancelable: true,
      });
      if (prevented) e.preventDefault(); // stage 1: main.ts consumed it to cancel a drag
      act(() => {
        window.dispatchEvent(e);
      });
    };

    it('a defaultPrevented Escape (drag cancelled at stage 1) leaves the drawer open', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Roads' }));
      pressEscape(true);
      expect(screen.getByText('Two-Lane Road')).toBeInTheDocument();
    });

    it('stage 2: Escape closes the drawer but keeps the selected tool in hand', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Roads' }));
      fireEvent.click(screen.getByText('Two-Lane Road'));
      expect(useCityStore.getState().selectedTool).toBe('road.two');

      pressEscape();
      expect(screen.queryByText('Two-Lane Road')).not.toBeInTheDocument();
      expect(useCityStore.getState().selectedTool).toBe('road.two');
    });

    it('stage 3: with the drawer closed, Escape deselects the tool and the building', () => {
      useCityStore.getState().setTool('road.two');
      useCityStore.getState().setSelectedBuilding({
        id: 1,
        catalogId: 'res-low-1',
        x: 0,
        z: 0,
        rotation: 0,
        level: 1,
        state: 1,
        problems: 0,
      });
      render(<App />);
      pressEscape();
      expect(useCityStore.getState().selectedTool).toBe('select');
      expect(useCityStore.getState().selectedBuilding).toBeNull();
    });

    it('the full stack takes one press per stage: close drawer, then deselect', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Roads' }));
      fireEvent.click(screen.getByText('Two-Lane Road'));

      pressEscape(); // stage 2: drawer closes, tool survives
      expect(screen.queryByText('Two-Lane Road')).not.toBeInTheDocument();
      expect(useCityStore.getState().selectedTool).toBe('road.two');

      pressEscape(); // stage 3: tool deselected
      expect(useCityStore.getState().selectedTool).toBe('select');
    });
  });

  describe('infoviews grid toggle', () => {
    it('opens on the Infoviews dock button and closes on a second click', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: 'Infoviews' }));
      expect(screen.getByRole('button', { name: /Land Value/ })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Infoviews' }));
      expect(screen.queryByRole('button', { name: /Land Value/ })).not.toBeInTheDocument();
    });
  });

  describe('milestone popover', () => {
    it('opens from the milestone badge and closes itself', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: /Milestone progress/ }));
      expect(screen.getByRole('dialog', { name: 'Milestones' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /close milestones/i }));
      expect(screen.queryByRole('dialog', { name: 'Milestones' })).not.toBeInTheDocument();
    });
  });

  describe('corner popovers', () => {
    it('opens City Info from the top-left corner button', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: /city info/i }));
      expect(screen.getByRole('dialog', { name: 'City Info' })).toBeInTheDocument();
    });

    it('opens Help from the top-right corner button', () => {
      render(<App />);
      fireEvent.click(screen.getByRole('button', { name: /^help$/i }));
      expect(screen.getByRole('dialog', { name: 'Keyboard Shortcuts' })).toBeInTheDocument();
    });
  });
});

describe('mountUi', () => {
  it('mounts the App into the given root element', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);

    act(() => {
      mountUi(root);
    });

    expect(root.textContent).toContain('Riverton');
    document.body.removeChild(root);
  });
});
