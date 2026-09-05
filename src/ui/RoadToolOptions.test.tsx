// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BRIDGE_MAX_ELEVATION, ROAD_ELEVATION_STEP_M } from '../shared/constants';
import { composeProfile, presetProfileForTier, profileWidth } from '../shared/roadprofile';
import { RoadTier } from '../shared/types';
import { useCityStore } from './store';
import { resetCityStore } from './test-helpers';
import { RoadToolOptions } from './RoadToolOptions';

beforeEach(() => {
  resetCityStore();
});

afterEach(() => {
  cleanup();
});

describe('RoadToolOptions — the Profile row', () => {
  it('offers parking, bike and footways on a two-lane and reads its width against the tile', () => {
    useCityStore.getState().setTool('road.two');
    render(<RoadToolOptions />);
    expect(screen.getByRole('group', { name: 'Parking lanes' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Bike lanes' })).toBeInTheDocument();
    expect(screen.getByLabelText('Profile width')).toHaveTextContent('11.3 / 16 m');

    const parking = screen.getByRole('group', { name: 'Parking lanes' });
    fireEvent.click(within(parking).getByRole('button', { name: 'Both' }));
    expect(useCityStore.getState().roadProfileEdits.parking).toBe('both');
    expect(within(parking).getByRole('button', { name: 'Both' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText('Profile width')).toHaveTextContent('15.8 / 16 m');
  });

  it('marks a composition the tile cannot hold', () => {
    useCityStore.getState().setTool('road.two');
    render(<RoadToolOptions />);
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Parking lanes' })).getByRole('button', {
        name: 'Both',
      }),
    );
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Bike lanes' })).getByRole('button', {
        name: 'Both',
      }),
    );
    const width = screen.getByLabelText('Profile width');
    expect(width).toHaveAttribute('title', 'Too wide for the tile');
    // 7.5 m of lanes + two footways + two parking lanes + two bike lanes, past the 16 m tile.
    const expected = profileWidth(
      composeProfile(presetProfileForTier(RoadTier.TwoLane), {
        parking: 'both',
        bike: 'both',
        footways: null,
      }),
    );
    expect(expected).toBeGreaterThan(16);
    expect(width).toHaveTextContent(`${expected.toFixed(1)} / 16 m`);
  });

  it('toggles footways, and drops the kerbs with them', () => {
    useCityStore.getState().setTool('road.two');
    render(<RoadToolOptions />);
    const footways = screen.getByRole('button', { name: 'On' });
    fireEvent.click(footways);
    expect(useCityStore.getState().roadProfileEdits.footways).toBe(false);
    expect(screen.getByRole('button', { name: 'Off' })).toBeInTheDocument();
    expect(screen.getByLabelText('Profile width')).toHaveTextContent('7.5 / 16 m');
  });

  it('never asks a motorway or a railway about parking, bike lanes or footways', () => {
    useCityStore.getState().setTool('road.highway');
    const { unmount } = render(<RoadToolOptions />);
    expect(screen.queryByRole('group', { name: 'Parking lanes' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Bike lanes' })).toBeNull();
    expect(screen.queryByLabelText('Profile width')).toBeNull();
    unmount();
    useCityStore.getState().setTool('road.rail');
    render(<RoadToolOptions />);
    expect(screen.queryByLabelText('Profile width')).toBeNull();
  });

  it('starts every road fresh: switching tools puts the edits back to the preset', () => {
    useCityStore.getState().setTool('road.two');
    useCityStore.getState().setRoadProfileEdits({ parking: 'both' });
    useCityStore.getState().setTool('road.four');
    expect(useCityStore.getState().roadProfileEdits).toEqual({
      parking: null,
      bike: null,
      footways: null,
    });
  });
});

describe('RoadToolOptions', () => {
  describe.each([
    'road.two',
    'road.avenue',
    'road.highway',
    // The four extra road tools get the same options rows.
    'road.gravel',
    'road.alley',
    'road.oneway',
    'road.four',
    // Roads-epic transit lane variants get the same options rows.
    'road.bus',
    'road.bike',
    'road.tram',
    'road.rail',
  ] as const)('for road tool %s', (tool) => {
    beforeEach(() => {
      useCityStore.getState().setTool(tool);
    });

    it('shows the Tool Mode row (Straight | L-path) and the 90° lock snapping chip', () => {
      render(<RoadToolOptions />);
      expect(screen.getByRole('button', { name: 'Straight' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'L-path' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /90°/ })).toBeInTheDocument();
    });

    it('defaults to L-path selected and the lock chip off', () => {
      render(<RoadToolOptions />);
      expect(screen.getByRole('button', { name: 'L-path' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByRole('button', { name: 'Straight' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      expect(screen.getByRole('button', { name: /90°/ })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('clicking Straight writes toolMode and the mirrored straightMode contract flag', () => {
      render(<RoadToolOptions />);
      fireEvent.click(screen.getByRole('button', { name: 'Straight' }));
      expect(useCityStore.getState().toolMode).toBe('straight');
      expect(useCityStore.getState().toolFlags.straightMode).toBe(true);
      expect(screen.getByRole('button', { name: 'Straight' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByRole('button', { name: 'L-path' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('clicking L-path after Straight switches back and clears straightMode', () => {
      useCityStore.getState().setToolMode('straight');
      render(<RoadToolOptions />);
      fireEvent.click(screen.getByRole('button', { name: 'L-path' }));
      expect(useCityStore.getState().toolMode).toBe('lpath');
      expect(useCityStore.getState().toolFlags.straightMode).toBe(false);
    });

    it('toggles the 90° lock chip on and off, independent of tool mode', () => {
      render(<RoadToolOptions />);
      const chip = screen.getByRole('button', { name: /90°/ });
      fireEvent.click(chip);
      expect(useCityStore.getState().toolFlags.angleLock).toBe(true);
      expect(chip).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(chip);
      expect(useCityStore.getState().toolFlags.angleLock).toBe(false);
      expect(chip).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe('elevation', () => {
    beforeEach(() => {
      useCityStore.getState().setTool('road.two');
    });

    it('starts at ground, where a road follows the terrain', () => {
      render(<RoadToolOptions />);
      expect(screen.getByText('Ground')).toBeInTheDocument();
      expect(useCityStore.getState().roadElevation).toBe(0);
    });

    it('raises and lowers a step at a time', () => {
      render(<RoadToolOptions />);
      const raise = screen.getByRole('button', { name: /raise the road/i });
      fireEvent.click(raise);
      expect(useCityStore.getState().roadElevation).toBe(ROAD_ELEVATION_STEP_M);
      fireEvent.click(raise);
      expect(useCityStore.getState().roadElevation).toBe(ROAD_ELEVATION_STEP_M * 2);

      fireEvent.click(screen.getByRole('button', { name: /lower the road/i }));
      expect(useCityStore.getState().roadElevation).toBe(ROAD_ELEVATION_STEP_M);
    });

    it('will not go below ground — there is nowhere under it to build yet', () => {
      render(<RoadToolOptions />);
      expect(screen.getByRole('button', { name: /lower the road/i })).toBeDisabled();
      useCityStore.getState().setRoadElevation(-10);
      expect(useCityStore.getState().roadElevation).toBe(0);
    });

    it('will not go past the ceiling', () => {
      useCityStore.getState().setRoadElevation(BRIDGE_MAX_ELEVATION);
      render(<RoadToolOptions />);
      expect(screen.getByRole('button', { name: /raise the road/i })).toBeDisabled();
      useCityStore.getState().setRoadElevation(BRIDGE_MAX_ELEVATION + 50);
      expect(useCityStore.getState().roadElevation).toBe(BRIDGE_MAX_ELEVATION);
    });

    it('reads out the height once it is off the ground', () => {
      useCityStore.getState().setRoadElevation(8);
      render(<RoadToolOptions />);
      expect(screen.getByText('8 m')).toBeInTheDocument();
      expect(screen.queryByText('Ground')).not.toBeInTheDocument();
    });
  });
});

describe('elevation does not leak between tools', () => {
  it('drops back to ground when the road tool is put down', () => {
    useCityStore.getState().setTool('road.two');
    useCityStore.getState().setRoadElevation(12);
    expect(useCityStore.getState().roadElevation).toBe(12);

    // Left sticky, a height set for one viaduct silently turns the next short
    // drag into a stray hump with a bridge under it.
    useCityStore.getState().setTool('zone.resLow');
    expect(useCityStore.getState().roadElevation).toBe(0);
  });

  it('survives switching between road tools, which is one continuous job', () => {
    useCityStore.getState().setTool('road.two');
    useCityStore.getState().setRoadElevation(6);
    useCityStore.getState().setTool('road.avenue');
    expect(useCityStore.getState().roadElevation).toBe(6);
  });
});
