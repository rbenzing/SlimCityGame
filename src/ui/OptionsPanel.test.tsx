// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OptionsPanel, type GameSettings } from './OptionsPanel';

afterEach(() => {
  cleanup();
});

const SETTINGS: GameSettings = {
  bloom: true,
  sandboxUnlockAll: false,
  masterVolume: 0.5,
  muted: false,
};

describe('OptionsPanel', () => {
  it('reflects the current settings in each control', () => {
    render(<OptionsPanel settings={SETTINGS} onChange={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Bloom' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Sandbox: unlock all build items' })).not.toBeChecked();
    expect(screen.getByRole('slider', { name: 'Master Volume' })).toHaveValue('0.5');
    expect(screen.getByRole('checkbox', { name: 'Mute' })).not.toBeChecked();
  });

  it('toggling Bloom calls onChange with only the bloom field', () => {
    const onChange = vi.fn();
    render(<OptionsPanel settings={SETTINGS} onChange={onChange} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bloom' }));
    expect(onChange).toHaveBeenCalledWith({ bloom: false });
  });

  it('toggling the sandbox unlock-all switch calls onChange with only that field', () => {
    const onChange = vi.fn();
    render(<OptionsPanel settings={SETTINGS} onChange={onChange} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sandbox: unlock all build items' }));
    expect(onChange).toHaveBeenCalledWith({ sandboxUnlockAll: true });
  });

  it('dragging the Master Volume slider calls onChange with only masterVolume', () => {
    const onChange = vi.fn();
    render(<OptionsPanel settings={SETTINGS} onChange={onChange} onBack={vi.fn()} />);
    fireEvent.change(screen.getByRole('slider', { name: 'Master Volume' }), {
      target: { value: '0.8' },
    });
    expect(onChange).toHaveBeenCalledWith({ masterVolume: 0.8 });
  });

  it('toggling Mute calls onChange with only the muted field', () => {
    const onChange = vi.fn();
    render(<OptionsPanel settings={SETTINGS} onChange={onChange} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Mute' }));
    expect(onChange).toHaveBeenCalledWith({ muted: true });
  });

  it('fires onBack when Back is clicked', () => {
    const onBack = vi.fn();
    render(<OptionsPanel settings={SETTINGS} onChange={vi.fn()} onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
