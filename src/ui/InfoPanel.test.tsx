// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BuildingState, Problem } from '../shared/types';
import type { SelectionInfo } from '../shared/types';
import { useCityStore } from './store';
import { resetCityStore } from './test-helpers';
import { InfoPanel } from './InfoPanel';

beforeEach(() => {
  resetCityStore();
});

afterEach(() => {
  cleanup();
});

describe('InfoPanel', () => {
  it('renders nothing when no building is selected', () => {
    const { container } = render(<InfoPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('closing with the X clears the selection AND returns the neutral select tool (no placement possible)', () => {
    // A build tool is in hand and a building is selected.
    useCityStore.getState().setTool('plop.wind-turbine');
    useCityStore.getState().setSelectedBuilding({
      id: 7,
      catalogId: 'police-station',
      x: 0,
      z: 0,
      rotation: 0,
      level: 1,
      state: BuildingState.Active,
      problems: 0,
    });
    render(<InfoPanel />);

    fireEvent.click(screen.getByRole('button', { name: /close building info/i }));

    // Selection cleared and the neutral 'select' tool is in hand, so only
    // camera pan/zoom + picking work — nothing can be placed.
    expect(useCityStore.getState().selectedBuilding).toBeNull();
    expect(useCityStore.getState().selectedTool).toBe('select');
  });

  it('shows the building name resolved from the catalog with its stable #id, and its level', () => {
    useCityStore.getState().setSelectedBuilding({
      id: 1,
      catalogId: 'police-station',
      x: 0,
      z: 0,
      rotation: 0,
      level: 2,
      state: BuildingState.Active,
      problems: 0,
    });
    render(<InfoPanel />);
    expect(screen.getByText('Police Station')).toBeInTheDocument();
    expect(screen.getByText('#1', { exact: false })).toBeInTheDocument();
  });

  describe('status word (UI-SPEC §7: Content/Constructing/Abandoned)', () => {
    it('shows "Content" for the Active building state (not the raw enum name)', () => {
      useCityStore.getState().setSelectedBuilding({
        id: 1,
        catalogId: 'res-low-1',
        x: 0,
        z: 0,
        rotation: 0,
        level: 1,
        state: BuildingState.Active,
        problems: 0,
      });
      render(<InfoPanel />);
      expect(screen.getByText('Content')).toBeInTheDocument();
      expect(screen.queryByText('Active')).not.toBeInTheDocument();
    });

    it('shows "Constructing" and no problem chips when there are no active problems', () => {
      useCityStore.getState().setSelectedBuilding({
        id: 1,
        catalogId: 'res-low-1',
        x: 0,
        z: 0,
        rotation: 0,
        level: 1,
        state: BuildingState.Constructing,
        problems: 0,
      });
      render(<InfoPanel />);
      expect(screen.getByText('Constructing')).toBeInTheDocument();
      expect(screen.queryByText('No Power')).not.toBeInTheDocument();
    });

    it('shows "Abandoned"', () => {
      useCityStore.getState().setSelectedBuilding({
        id: 1,
        catalogId: 'res-low-1',
        x: 0,
        z: 0,
        rotation: 0,
        level: 1,
        state: BuildingState.Abandoned,
        problems: 0,
      });
      render(<InfoPanel />);
      expect(screen.getByText('Abandoned')).toBeInTheDocument();
    });
  });

  it('shows a chip for each active problem flag and omits inactive ones', () => {
    useCityStore.getState().setSelectedBuilding({
      id: 2,
      catalogId: 'res-low-1',
      x: 0,
      z: 0,
      rotation: 0,
      level: 1,
      state: BuildingState.Active,
      problems: Problem.NoPower | Problem.HighCrime,
    });
    render(<InfoPanel />);
    expect(screen.getByText('No Power')).toBeInTheDocument();
    expect(screen.getByText('High Crime')).toBeInTheDocument();
    expect(screen.queryByText('No Water')).not.toBeInTheDocument();
    expect(screen.queryByText('No Road')).not.toBeInTheDocument();
    expect(screen.queryByText('High Pollution')).not.toBeInTheDocument();
    expect(screen.queryByText('Low Demand')).not.toBeInTheDocument();
  });

  it('the close button clears the selected building', () => {
    useCityStore.getState().setSelectedBuilding({
      id: 4,
      catalogId: 'res-low-1',
      x: 0,
      z: 0,
      rotation: 0,
      level: 1,
      state: BuildingState.Active,
      problems: 0,
    });
    render(<InfoPanel />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(useCityStore.getState().selectedBuilding).toBeNull();
  });

  describe('ZONE row', () => {
    it('shows the zone display name for a grown residential building', () => {
      useCityStore.getState().setSelectedBuilding({
        id: 1,
        catalogId: 'res-low-1',
        x: 0,
        z: 0,
        rotation: 0,
        level: 1,
        state: BuildingState.Active,
        problems: 0,
      });
      render(<InfoPanel />);
      expect(screen.getByText('Low Density Residential')).toBeInTheDocument();
    });

    it('falls back to a category label for non-zoned buildings', () => {
      useCityStore.getState().setSelectedBuilding({
        id: 1,
        catalogId: 'police-station',
        x: 0,
        z: 0,
        rotation: 0,
        level: 1,
        state: BuildingState.Active,
        problems: 0,
      });
      render(<InfoPanel />);
      expect(screen.getByText('Service')).toBeInTheDocument();
    });
  });

  it('renders LEVEL as pips filled up to the building level', () => {
    useCityStore.getState().setSelectedBuilding({
      id: 1,
      catalogId: 'res-low-2',
      x: 0,
      z: 0,
      rotation: 0,
      level: 2,
      state: BuildingState.Active,
      problems: 0,
    });
    render(<InfoPanel />);
    const pips = screen.getAllByTestId('level-pip');
    expect(pips).toHaveLength(3);
    expect(pips.map((p) => p.dataset.filled)).toEqual(['true', 'true', 'false']);
  });

  it('shows a COVERAGE row (kind + range) for service buildings, unconditionally from the catalog', () => {
    useCityStore.getState().setSelectedBuilding({
      id: 1,
      catalogId: 'police-station',
      x: 0,
      z: 0,
      rotation: 0,
      level: 1,
      state: BuildingState.Active,
      problems: 0,
    });
    render(<InfoPanel />);
    expect(screen.getByText(/police/)).toBeInTheDocument();
    expect(screen.getByText(/48/)).toBeInTheDocument();
  });

  it('shows an OUTPUT row (MW/kL) for utility buildings, unconditionally from the catalog', () => {
    useCityStore.getState().setSelectedBuilding({
      id: 1,
      catalogId: 'water-tower',
      x: 0,
      z: 0,
      rotation: 0,
      level: 1,
      state: BuildingState.Active,
      problems: 0,
    });
    render(<InfoPanel />);
    expect(screen.getByText('400 kL')).toBeInTheDocument();
  });

  it('shows UPKEEP unconditionally from the catalog', () => {
    useCityStore.getState().setSelectedBuilding({
      id: 1,
      catalogId: 'police-station',
      x: 0,
      z: 0,
      rotation: 0,
      level: 1,
      state: BuildingState.Active,
      problems: 0,
    });
    render(<InfoPanel />);
    expect(screen.getByText('¢300/mo')).toBeInTheDocument();
  });

  describe('selectionInfo enrichment (only while present and matching the selected building)', () => {
    const building = {
      id: 9,
      catalogId: 'res-low-1',
      x: 0,
      z: 0,
      rotation: 0 as const,
      level: 1,
      state: BuildingState.Active,
      problems: 0,
    };
    const info: SelectionInfo = {
      building,
      happiness: 60,
      monthlyTax: 42,
      monthlyUpkeep: 0,
      occupancy: { residents: 4, households: { occupied: 1, capacity: 1 } },
    };

    it('renders nothing extra (no happiness face, occupancy, or tax) without selectionInfo', () => {
      useCityStore.getState().setSelectedBuilding(building);
      render(<InfoPanel />);
      expect(screen.queryByText(/RESIDENTS|Residents/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Tax/)).not.toBeInTheDocument();
    });

    it('renders happiness face, households/residents, and tax once selectionInfo matches the selected building', () => {
      useCityStore.getState().setSelectedBuilding(building);
      useCityStore.getState().setSelectionInfo(info);
      render(<InfoPanel />);
      expect(screen.getByText('1/1')).toBeInTheDocument();
      expect(screen.getByText('4')).toBeInTheDocument();
      expect(screen.getByText('¢42/mo')).toBeInTheDocument();
      expect(screen.getByText('🙂')).toBeInTheDocument();
    });

    it('ignores stale selectionInfo left over from a different building', () => {
      useCityStore.getState().setSelectedBuilding({ ...building, id: 123 });
      useCityStore.getState().setSelectionInfo(info); // still tagged building.id 9
      render(<InfoPanel />);
      expect(screen.queryByText('¢42/mo')).not.toBeInTheDocument();
      expect(screen.queryByText('🙂')).not.toBeInTheDocument();
    });

    it('does not show a TAX row for non-zoned buildings even with selectionInfo present', () => {
      const serviceBuilding = { ...building, id: 55, catalogId: 'police-station' };
      useCityStore.getState().setSelectedBuilding(serviceBuilding);
      useCityStore.getState().setSelectionInfo({ ...info, building: serviceBuilding });
      render(<InfoPanel />);
      expect(screen.queryByTestId('tax-row')).not.toBeInTheDocument();
    });
  });
});
