// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  TERRAFORM_BRUSH_MAX,
  TERRAFORM_BRUSH_MIN,
  TERRAFORM_STRENGTH_MAX,
  TERRAFORM_STRENGTH_MIN,
} from '../shared/constants';
import { DEFAULT_BRUSH_SETTINGS } from '../tools/tools';
import { useCityStore } from './store';
import { resetCityStore } from './test-helpers';
import { ToolOptionsPanel } from './ToolOptionsPanel';

beforeEach(() => {
  resetCityStore();
});

afterEach(() => {
  cleanup();
});

describe('ToolOptionsPanel', () => {
  it('renders nothing for the select tool (rule zero: no real toggles apply)', () => {
    const { container } = render(<ToolOptionsPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for zone tools (only Rect exists; no real mode toggle)', () => {
    useCityStore.getState().setTool('zone.resLow');
    const { container } = render(<ToolOptionsPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for bulldoze (UI-SPEC §5: "Rect only -> row hidden")', () => {
    useCityStore.getState().setTool('bulldoze');
    const { container } = render(<ToolOptionsPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for ploppable tools', () => {
    useCityStore.getState().setTool('plop.police-station');
    const { container } = render(<ToolOptionsPanel />);
    expect(container).toBeEmptyDOMElement();
  });

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
      render(<ToolOptionsPanel />);
      expect(screen.getByRole('button', { name: 'Straight' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'L-path' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /90.*lock/ })).toBeInTheDocument();
    });

    it('defaults to L-path selected and the lock chip off', () => {
      render(<ToolOptionsPanel />);
      expect(screen.getByRole('button', { name: 'L-path' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByRole('button', { name: 'Straight' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
      expect(screen.getByRole('button', { name: /90.*lock/ })).toHaveAttribute(
        'aria-pressed',
        'false',
      );
    });

    it('clicking Straight writes toolMode and the mirrored straightMode contract flag', () => {
      render(<ToolOptionsPanel />);
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
      render(<ToolOptionsPanel />);
      fireEvent.click(screen.getByRole('button', { name: 'L-path' }));
      expect(useCityStore.getState().toolMode).toBe('lpath');
      expect(useCityStore.getState().toolFlags.straightMode).toBe(false);
    });

    it('toggles the 90° lock chip on and off, independent of tool mode', () => {
      render(<ToolOptionsPanel />);
      const chip = screen.getByRole('button', { name: /90.*lock/ });
      fireEvent.click(chip);
      expect(useCityStore.getState().toolFlags.angleLock).toBe(true);
      expect(chip).toHaveAttribute('aria-pressed', 'true');
      fireEvent.click(chip);
      expect(useCityStore.getState().toolFlags.angleLock).toBe(false);
      expect(chip).toHaveAttribute('aria-pressed', 'false');
    });
  });

  describe.each([
    'terraform.raise',
    'terraform.lower',
    'terraform.level',
    'terraform.smooth',
  ] as const)('for terraform tool %s (UI-SPEC §6.11)', (tool) => {
    beforeEach(() => {
      useCityStore.getState().setTool(tool);
    });

    it('shows the Brush radius and Strength slider rows, not the road Tool Mode/90° lock rows', () => {
      render(<ToolOptionsPanel />);
      expect(screen.getByRole('slider', { name: /brush radius/i })).toBeInTheDocument();
      expect(screen.getByRole('slider', { name: /strength/i })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Straight' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'L-path' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /90.*lock/ })).not.toBeInTheDocument();
    });

    it('bounds the sliders to the UI-SPEC §6.11 ranges', () => {
      render(<ToolOptionsPanel />);
      const radius = screen.getByRole('slider', { name: /brush radius/i });
      expect(radius).toHaveAttribute('min', String(TERRAFORM_BRUSH_MIN));
      expect(radius).toHaveAttribute('max', String(TERRAFORM_BRUSH_MAX));
      const strength = screen.getByRole('slider', { name: /strength/i });
      expect(strength).toHaveAttribute('min', String(TERRAFORM_STRENGTH_MIN));
      expect(strength).toHaveAttribute('max', String(TERRAFORM_STRENGTH_MAX));
    });

    it('reflects the current store brushSettings as slider values', () => {
      useCityStore.getState().setBrushSettings({ radius: 11, strength: 4 });
      render(<ToolOptionsPanel />);
      expect(screen.getByRole('slider', { name: /brush radius/i })).toHaveValue('11');
      expect(screen.getByRole('slider', { name: /strength/i })).toHaveValue('4');
    });

    it('defaults to DEFAULT_BRUSH_SETTINGS when untouched', () => {
      render(<ToolOptionsPanel />);
      expect(screen.getByRole('slider', { name: /brush radius/i })).toHaveValue(
        String(DEFAULT_BRUSH_SETTINGS.radius),
      );
      expect(screen.getByRole('slider', { name: /strength/i })).toHaveValue(
        String(DEFAULT_BRUSH_SETTINGS.strength),
      );
    });

    it('dragging the Brush radius slider calls setBrushSettings with only radius', () => {
      render(<ToolOptionsPanel />);
      fireEvent.change(screen.getByRole('slider', { name: /brush radius/i }), {
        target: { value: '14' },
      });
      expect(useCityStore.getState().brushSettings).toEqual({
        radius: 14,
        strength: DEFAULT_BRUSH_SETTINGS.strength,
      });
    });

    it('dragging the Strength slider calls setBrushSettings with only strength', () => {
      render(<ToolOptionsPanel />);
      fireEvent.change(screen.getByRole('slider', { name: /strength/i }), {
        target: { value: '5' },
      });
      expect(useCityStore.getState().brushSettings).toEqual({
        radius: DEFAULT_BRUSH_SETTINGS.radius,
        strength: 5,
      });
    });
  });

  describe('Level sampled-height readout (UI-SPEC §5/§6.11, fed from preview.label)', () => {
    it('shows the plain tool name before any preview has arrived', () => {
      useCityStore.getState().setTool('terraform.level');
      render(<ToolOptionsPanel />);
      expect(screen.getByText('Level')).toBeInTheDocument();
    });

    it('renders the live preview.label verbatim once a preview exists', () => {
      useCityStore.getState().setTool('terraform.level');
      useCityStore.getState().setPreview({ cost: 12, label: 'Level → 42.3m', valid: true });
      render(<ToolOptionsPanel />);
      expect(screen.getByText('Level → 42.3m')).toBeInTheDocument();
    });

    it.each(['terraform.raise', 'terraform.lower', 'terraform.smooth'] as const)(
      'never appears for %s, even with a preview set',
      (tool) => {
        useCityStore.getState().setTool(tool);
        useCityStore.getState().setPreview({ cost: 12, label: 'Level → 42.3m', valid: true });
        render(<ToolOptionsPanel />);
        expect(screen.queryByText('Level → 42.3m')).not.toBeInTheDocument();
      },
    );
  });
});
