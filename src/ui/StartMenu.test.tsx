// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StartMenu } from './StartMenu';
import pkg from '../../package.json' with { type: 'json' };

afterEach(() => {
  cleanup();
});

function renderMenu(overrides: Partial<Parameters<typeof StartMenu>[0]> = {}) {
  const handlers = {
    onNewGame: vi.fn(),
    onSaveGame: vi.fn(),
    onLoadGame: vi.fn(),
    onOptions: vi.fn(),
    onQuit: vi.fn(),
  };
  render(<StartMenu hasActiveGame={false} hasSaves={false} {...handlers} {...overrides} />);
  return handlers;
}

describe('StartMenu', () => {
  it('renders the fallback "SlimCity" heading when no logoSlot is provided', () => {
    renderMenu();
    expect(screen.getByRole('heading', { name: 'SlimCity' })).toBeInTheDocument();
  });

  it('renders a supplied logoSlot instead of the fallback heading', () => {
    renderMenu({ logoSlot: <div data-testid="custom-logo">Logo</div> });
    expect(screen.getByTestId('custom-logo')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'SlimCity' })).not.toBeInTheDocument();
  });

  it('renders all five buttons in order', () => {
    renderMenu();
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual([
      'New Game',
      'Save Game',
      'Load Game',
      'Options',
      'Quit',
    ]);
  });

  it('offers Resume Game first when it is opened over a running city', () => {
    renderMenu({ hasActiveGame: true, onResume: vi.fn() });
    const buttons = screen.getAllByRole('button');
    expect(buttons.map((b) => b.textContent)).toEqual([
      'Resume Game',
      'New Game',
      'Save Game',
      'Load Game',
      'Options',
      'Quit',
    ]);
  });

  it('has no Resume Game on the start screen — there is nothing to resume', () => {
    renderMenu({ hasActiveGame: false, onResume: vi.fn() });
    expect(screen.queryByRole('button', { name: 'Resume Game' })).not.toBeInTheDocument();
  });

  it('fires onResume when Resume Game is clicked', () => {
    const onResume = vi.fn();
    renderMenu({ hasActiveGame: true, onResume });
    fireEvent.click(screen.getByRole('button', { name: 'Resume Game' }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });

  it('disables Save Game and Quit when !hasActiveGame, but keeps New Game/Options enabled', () => {
    renderMenu({ hasActiveGame: false, hasSaves: true });
    expect(screen.getByRole('button', { name: 'Save Game' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Quit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'New Game' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Options' })).toBeEnabled();
  });

  it('enables Save Game and Quit when hasActiveGame is true', () => {
    renderMenu({ hasActiveGame: true, hasSaves: true });
    expect(screen.getByRole('button', { name: 'Save Game' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Quit' })).toBeEnabled();
  });

  it('disables Load Game when !hasSaves', () => {
    renderMenu({ hasSaves: false });
    expect(screen.getByRole('button', { name: 'Load Game' })).toBeDisabled();
  });

  it('enables Load Game when hasSaves is true', () => {
    renderMenu({ hasSaves: true });
    expect(screen.getByRole('button', { name: 'Load Game' })).toBeEnabled();
  });

  it('fires onNewGame and onOptions on click (always enabled)', () => {
    const handlers = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'New Game' }));
    expect(handlers.onNewGame).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Options' }));
    expect(handlers.onOptions).toHaveBeenCalledTimes(1);
  });

  it('fires onSaveGame/onLoadGame/onQuit when enabled', () => {
    const handlers = renderMenu({ hasActiveGame: true, hasSaves: true });
    fireEvent.click(screen.getByRole('button', { name: 'Save Game' }));
    expect(handlers.onSaveGame).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Load Game' }));
    expect(handlers.onLoadGame).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Quit' }));
    expect(handlers.onQuit).toHaveBeenCalledTimes(1);
  });

  it('does not fire callbacks when disabled buttons are clicked', () => {
    const handlers = renderMenu({ hasActiveGame: false, hasSaves: false });
    fireEvent.click(screen.getByRole('button', { name: 'Save Game' }));
    fireEvent.click(screen.getByRole('button', { name: 'Load Game' }));
    fireEvent.click(screen.getByRole('button', { name: 'Quit' }));
    expect(handlers.onSaveGame).not.toHaveBeenCalled();
    expect(handlers.onLoadGame).not.toHaveBeenCalled();
    expect(handlers.onQuit).not.toHaveBeenCalled();
  });
});

describe('StartMenu — the build it is', () => {
  it('shows the released version under the buttons, from the one place it is written', () => {
    renderMenu({});
    // Asserted against package.json rather than a literal, so a release bump
    // never has to be chased into a test — and a stale `define` still fails.
    const shown = screen.getByText(/^v\d+\.\d+\.\d+/);
    expect(shown).toBeInTheDocument();
    expect(shown.textContent).toBe(`v${pkg.version}`);
  });

  it('is a label, not another button in the run', () => {
    renderMenu({ hasActiveGame: true, hasSaves: true });
    for (const button of screen.getAllByRole('button')) {
      expect(button.textContent).not.toMatch(/^v\d/);
    }
  });
});
