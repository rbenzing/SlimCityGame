// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useCityStore } from './store';
import { resetCityStore } from './test-helpers';
import { AssetDrawer } from './AssetDrawer';

beforeEach(() => {
  resetCityStore();
});

afterEach(() => {
  cleanup();
});

describe('AssetDrawer', () => {
  it('renders nothing when no category is active', () => {
    const { container } = render(<AssetDrawer category={null} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<AssetDrawer category="water" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close asset drawer/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('sub-tabs render only non-empty groups', () => {
    it('Zoning shows all five real sub-tabs, Residential active by default', () => {
      // A Mixed-Use sub-tab sits alongside the residential zone cards
      // (Medium Row/Medium), so Zoning has five sub-tabs.
      render(<AssetDrawer category="zoning" onClose={vi.fn()} />);
      const tabs = screen.getAllByRole('tab');
      expect(tabs.map((t) => t.textContent)).toEqual([
        'Residential',
        'Commercial',
        'Industrial',
        'Mixed-Use',
        'De-zone',
      ]);
      expect(screen.getByRole('tab', { name: 'Residential' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.getByText('Residential (Low)')).toBeInTheDocument();
      expect(screen.getByText('Residential (Medium Row)')).toBeInTheDocument();
      expect(screen.getByText('Residential (Medium)')).toBeInTheDocument();
      expect(screen.getByText('Residential (High)')).toBeInTheDocument();
    });

    it('switching Zoning sub-tabs swaps the visible cards', () => {
      render(<AssetDrawer category="zoning" onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('tab', { name: 'Commercial' }));
      expect(screen.getByText('Commercial (Low)')).toBeInTheDocument();
      expect(screen.queryByText('Residential (Low)')).not.toBeInTheDocument();
    });

    it('Roads drops the empty Maintenance sub-tab, keeping only Small/Large Roads', () => {
      render(<AssetDrawer category="roads" onClose={vi.fn()} />);
      const tabs = screen.getAllByRole('tab');
      expect(tabs.map((t) => t.textContent)).toEqual(['Small Roads', 'Large Roads']);
      expect(screen.queryByRole('tab', { name: /maintenance/i })).not.toBeInTheDocument();
    });

    it('categories with a single natural group render no sub-tab row at all', () => {
      render(<AssetDrawer category="electricity" onClose={vi.fn()} />);
      expect(screen.queryAllByRole('tab')).toHaveLength(0);
      expect(screen.getByText('Coal Power Plant')).toBeInTheDocument();
      expect(screen.getByText('Wind Turbine')).toBeInTheDocument();
    });

    it('Landscaping (UI-SPEC §6.11) shows all four terraform cards with no sub-tab row', () => {
      render(<AssetDrawer category="landscaping" onClose={vi.fn()} />);
      expect(screen.queryAllByRole('tab')).toHaveLength(0);
      for (const name of ['Raise', 'Lower', 'Level', 'Smooth']) {
        expect(screen.getByRole('button', { name })).toBeInTheDocument();
      }
    });
  });

  describe('cost chips', () => {
    it('shows a ¢ cost chip for roads and ploppables', () => {
      render(<AssetDrawer category="roads" onClose={vi.fn()} />);
      const card = screen.getByRole('button', { name: /Two-Lane Road/ });
      expect(within(card).getByText('¢20')).toBeInTheDocument();
    });

    it('omits the cost chip for zone cards (free)', () => {
      render(<AssetDrawer category="zoning" onClose={vi.fn()} />);
      const card = screen.getByRole('button', { name: /Residential \(Low\)/ });
      expect(within(card).queryByText(/¢/)).not.toBeInTheDocument();
    });

    it('omits the cost chip for terraform cards too (live cursor-chip cost, not a flat price)', () => {
      render(<AssetDrawer category="landscaping" onClose={vi.fn()} />);
      const card = screen.getByRole('button', { name: 'Raise' });
      expect(within(card).queryByText(/¢/)).not.toBeInTheDocument();
    });
  });

  describe('locked cards', () => {
    it('locks a card whose unlockMilestone exceeds the current milestone level, with a tooltip and no tool change', () => {
      render(<AssetDrawer category="roads" onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('tab', { name: 'Large Roads' }));
      const avenue = screen.getByRole('button', { name: /Avenue/ });
      expect(avenue).toBeDisabled();
      expect(avenue).toHaveAttribute('title', 'Unlocks at Small Town');
      fireEvent.click(avenue);
      expect(useCityStore.getState().selectedTool).toBe('select');
    });

    it('unlocks once the milestone level is high enough, and selecting it sets the tool', () => {
      useCityStore.setState((s) => ({ stats: { ...s.stats, milestoneLevel: 1 } }));
      render(<AssetDrawer category="roads" onClose={vi.fn()} />);
      fireEvent.click(screen.getByRole('tab', { name: 'Large Roads' }));
      const avenue = screen.getByRole('button', { name: /Avenue/ });
      expect(avenue).not.toBeDisabled();
      fireEvent.click(avenue);
      expect(useCityStore.getState().selectedTool).toBe('road.avenue');
    });
  });

  it('clicking a zone card selects it, mapping De-zone to zone.dezone', () => {
    render(<AssetDrawer category="zoning" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'De-zone' }));
    fireEvent.click(screen.getByRole('button', { name: 'De-zone' }));
    expect(useCityStore.getState().selectedTool).toBe('zone.dezone');
  });

  it('clicking the §6.7 Gravel Road card selects road.gravel and shows its ¢8 cost, unlocked at M0', () => {
    render(<AssetDrawer category="roads" onClose={vi.fn()} />);
    const gravel = screen.getByRole('button', { name: /Gravel Road/ });
    expect(gravel).not.toBeDisabled();
    expect(within(gravel).getByText('¢8')).toBeInTheDocument();
    fireEvent.click(gravel);
    expect(useCityStore.getState().selectedTool).toBe('road.gravel');
  });

  it('the §6.7 M1 roads (Alley/One-Way) start locked at milestone 0 and unlock at 1', () => {
    render(<AssetDrawer category="roads" onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Alley/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /One-Way Road/ })).toBeDisabled();

    useCityStore.setState((s) => ({ stats: { ...s.stats, milestoneLevel: 1 } }));
    render(<AssetDrawer category="roads" onClose={vi.fn()} />);
    const oneWay = screen.getAllByRole('button', { name: /One-Way Road/ }).at(-1)!;
    expect(oneWay).not.toBeDisabled();
    fireEvent.click(oneWay);
    expect(useCityStore.getState().selectedTool).toBe('road.oneway');
  });

  it('the §6.7 Four-Lane Road card sits under Large Roads and selects road.four once unlocked', () => {
    useCityStore.setState((s) => ({ stats: { ...s.stats, milestoneLevel: 1 } }));
    render(<AssetDrawer category="roads" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Large Roads' }));
    const four = screen.getByRole('button', { name: /Four-Lane Road/ });
    expect(four).not.toBeDisabled();
    fireEvent.click(four);
    expect(useCityStore.getState().selectedTool).toBe('road.four');
  });

  it('clicking a ploppable utility card selects its plop.<id> tool', () => {
    render(<AssetDrawer category="water" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Water Tower/ }));
    expect(useCityStore.getState().selectedTool).toBe('plop.water-tower');
  });

  it.each([
    ['Raise', 'terraform.raise'],
    ['Lower', 'terraform.lower'],
    ['Level', 'terraform.level'],
    ['Smooth', 'terraform.smooth'],
  ] as const)(
    'clicking the %s card selects the %s tool (UI-SPEC §6.11), never locked',
    (name, toolId) => {
      render(<AssetDrawer category="landscaping" onClose={vi.fn()} />);
      const card = screen.getByRole('button', { name });
      expect(card).not.toBeDisabled();
      fireEvent.click(card);
      expect(useCityStore.getState().selectedTool).toBe(toolId);
    },
  );

  it.each(['raise', 'lower', 'level', 'smooth'] as const)(
    'gives the %s card its own pictogram (not the generic grey fallback silhouette)',
    (mode) => {
      render(<AssetDrawer category="landscaping" onClose={vi.fn()} />);
      const card = screen.getByRole('button', { name: new RegExp(`^${mode}$`, 'i') });
      expect(within(card).getByTestId(`terraform-pictogram-${mode}`)).toBeInTheDocument();
    },
  );

  it('marks the currently-selected tool card as pressed', () => {
    useCityStore.getState().setTool('road.two');
    render(<AssetDrawer category="roads" onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Two-Lane Road/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('Bulldoze is a single unlocked card that selects the bulldoze tool', () => {
    render(<AssetDrawer category="bulldoze" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Bulldoze' }));
    expect(useCityStore.getState().selectedTool).toBe('bulldoze');
  });

  it('resets to the first sub-tab when the category changes', () => {
    const { rerender } = render(<AssetDrawer category="zoning" onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: 'Industrial' }));
    expect(screen.getByRole('tab', { name: 'Industrial' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    rerender(<AssetDrawer category="roads" onClose={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Small Roads' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: 'Large Roads' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });
});
