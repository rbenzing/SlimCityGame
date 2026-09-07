// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BRIDGE_MAX_ELEVATION, ROAD_ELEVATION_STEP_M } from '../shared/constants';
import {
  composeProfile,
  NO_EDITS,
  presetProfileForTier,
  profileWidth,
} from '../shared/roadprofile';
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
        ...NO_EDITS,
        parking: 'both',
        bike: 'both',
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
    unmount();
    useCityStore.getState().setTool('road.rail');
    render(<RoadToolOptions />);
    expect(screen.queryByRole('group', { name: 'Parking lanes' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Bike lanes' })).toBeNull();
    // A railway has no road lanes to count and nothing to put between them.
    expect(screen.queryByRole('group', { name: 'Lanes' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Between the directions' })).toBeNull();
  });

  it('offers a two-lane street no lane count at all, since a local street is two lanes', () => {
    useCityStore.getState().setTool('road.two');
    render(<RoadToolOptions />);
    // A local street runs two lanes and a turn lane between them; four lanes
    // is a town street, which is a different kind of road. A control with one
    // possible answer is not shown, rather than offered and then refused.
    expect(screen.queryByRole('group', { name: 'Lanes' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Profile width')).toHaveAttribute('title', 'Fits the tile');
  });

  it('offers a four-lane street the lane counts its class is built in, and lays the one picked', () => {
    useCityStore.getState().setTool('road.four'); // a town street: two or four
    render(<RoadToolOptions />);
    const lanes = screen.getByRole('group', { name: 'Lanes' });
    expect(
      within(lanes)
        .getAllByRole('button')
        .map((b) => b.textContent),
    ).toEqual(['2', '4']);
    expect(within(lanes).getByRole('button', { name: '4' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    fireEvent.click(within(lanes).getByRole('button', { name: '2' }));
    expect(useCityStore.getState().roadProfileEdits).toMatchObject({ lanes: 1, lanesBack: 1 });
    // Two 11 ft lanes: 6.7 m of carriageway between the kerbs.
    expect(screen.getByLabelText('Profile width')).toHaveTextContent('6.7 / 16 m');
  });

  it('never offers a lane count it will then refuse for width', () => {
    // Eight 12 ft lanes are 28.8 m and six are 21.6 m; a tile is 16 m across
    // and a corridor 32. A motorway earns a corridor, so all four counts are
    // real offers — and each says which it is rather than reading as broken.
    useCityStore.getState().setTool('road.highway');
    render(<RoadToolOptions />);
    const lanes = screen.getByRole('group', { name: 'Lanes' });
    const offered = within(lanes)
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(offered).toEqual(['2', '4', '6', '8']);
    for (const count of offered) {
      fireEvent.click(within(lanes).getByRole('button', { name: count! }));
      const title = screen.getByLabelText('Profile width').getAttribute('title');
      expect(['Fits the tile', 'Two tiles wide — a corridor']).toContain(title);
    }
  });

  it('says a corridor is a corridor, and a street a street', () => {
    // A two-lane motorway is 7.2 m and sits on one tile; an eight-lane one is
    // 28.8 m and takes two.
    useCityStore.getState().setTool('road.highway');
    render(<RoadToolOptions />);
    const lanes = screen.getByRole('group', { name: 'Lanes' });
    fireEvent.click(within(lanes).getByRole('button', { name: '2' }));
    expect(screen.getByLabelText('Profile width')).toHaveAttribute('title', 'Fits the tile');
    fireEvent.click(within(lanes).getByRole('button', { name: '8' }));
    expect(screen.getByLabelText('Profile width')).toHaveAttribute(
      'title',
      'Two tiles wide — a corridor',
    );
  });

  it('counts a one-way road’s lanes the one way they run', () => {
    useCityStore.getState().setTool('road.oneway');
    render(<RoadToolOptions />);
    const lanes = screen.getByRole('group', { name: 'Lanes' });
    expect(within(lanes).getByRole('button', { name: '2' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(lanes.textContent).toContain('one way');
    expect(screen.queryByRole('group', { name: 'Between the directions' })).toBeNull();
  });

  it('puts a median or a turn lane down the middle of the roads whose class admits one', () => {
    useCityStore.getState().setTool('road.four');
    const { unmount } = render(<RoadToolOptions />);
    const middle = screen.getByRole('group', { name: 'Between the directions' });
    expect(within(middle).getByRole('button', { name: 'None' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    fireEvent.click(within(middle).getByRole('button', { name: 'Median' }));
    expect(useCityStore.getState().roadProfileEdits.middle).toBe('median');
    // Four 11 ft lanes plus a 6 ft median: 15.2 m, which still fits the tile
    // where four of the preset's wider lanes plus a median would not.
    expect(screen.getByLabelText('Profile width')).toHaveTextContent('15.2 / 16 m');
    expect(screen.getByLabelText('Profile width')).toHaveAttribute('title', 'Fits the tile');
    unmount();

    // A local street takes a two-way turn lane but never a median.
    resetCityStore();
    useCityStore.getState().setTool('road.two');
    render(<RoadToolOptions />);
    const localMiddle = screen.getByRole('group', { name: 'Between the directions' });
    expect(within(localMiddle).queryByRole('button', { name: 'Median' })).toBeNull();
    fireEvent.click(within(localMiddle).getByRole('button', { name: 'Turn lane' }));
    expect(useCityStore.getState().roadProfileEdits.middle).toBe('turn');
  });

  it('posts a speed inside the class range, and stops at each end of it', () => {
    useCityStore.getState().setTool('road.avenue');
    render(<RoadToolOptions />);
    const posted = screen.getByLabelText('Posted speed');
    expect(posted).toHaveTextContent('65 km/h');
    expect(posted).toHaveAttribute('title', '60–80 km/h for an arterial');
    fireEvent.click(screen.getByRole('button', { name: 'Post a lower speed' }));
    expect(useCityStore.getState().roadProfileEdits.postedKmh).toBe(60);
    expect(screen.getByRole('button', { name: 'Post a lower speed' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Post a higher speed' }));
    expect(useCityStore.getState().roadProfileEdits.postedKmh).toBe(65);
  });

  it('starts every road fresh: switching tools puts the edits back to the preset', () => {
    useCityStore.getState().setTool('road.two');
    useCityStore.getState().setRoadProfileEdits({ ...NO_EDITS, parking: 'both' });
    useCityStore.getState().setTool('road.four');
    expect(useCityStore.getState().roadProfileEdits).toEqual(NO_EDITS);
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
      expect(screen.getByRole('button', { name: /90°/ })).toHaveAttribute('aria-pressed', 'false');
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

describe('RoadToolOptions — replace mode', () => {
  it('is off until asked for, and flips the contract flag the tool reads', () => {
    useCityStore.getState().setTool('road.two');
    render(<RoadToolOptions />);
    const chip = screen.getByRole('button', { name: 'Replace' });
    expect(chip).toHaveAttribute('aria-pressed', 'false');
    expect(useCityStore.getState().toolFlags.replaceRoad).toBe(false);
    fireEvent.click(chip);
    expect(useCityStore.getState().toolFlags.replaceRoad).toBe(true);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(chip).toHaveAttribute('title', 'A drag lays this road over whatever is already there');
    fireEvent.click(chip);
    expect(useCityStore.getState().toolFlags.replaceRoad).toBe(false);
  });
});
