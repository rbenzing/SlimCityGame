// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetCityStore } from './test-helpers';
import { CornerButtons } from './CornerButtons';

beforeEach(() => {
  resetCityStore();
});

afterEach(() => {
  cleanup();
});

describe('CornerButtons', () => {
  it('renders the top-left City Info toggle and the top-right Help toggle', () => {
    render(
      <CornerButtons
        cityInfoOpen={false}
        onToggleCityInfo={vi.fn()}
        helpOpen={false}
        onToggleHelp={vi.fn()}
        statsOpen={false}
        onToggleStats={vi.fn()}
        photoActive={false}
        onTogglePhoto={vi.fn()}
      />,
    );
    expect(screen.getByRole('button', { name: /city info/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /help/i })).toBeInTheDocument();
  });

  it('reflects the open state and calls the toggle callbacks', () => {
    const onToggleCityInfo = vi.fn();
    const onToggleHelp = vi.fn();
    render(
      <CornerButtons
        cityInfoOpen={true}
        onToggleCityInfo={onToggleCityInfo}
        helpOpen={false}
        onToggleHelp={onToggleHelp}
        statsOpen={false}
        onToggleStats={vi.fn()}
        photoActive={false}
        onTogglePhoto={vi.fn()}
      />,
    );

    const infoButton = screen.getByRole('button', { name: /city info/i });
    expect(infoButton).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(infoButton);
    expect(onToggleCityInfo).toHaveBeenCalledTimes(1);

    const helpButton = screen.getByRole('button', { name: /help/i });
    expect(helpButton).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(helpButton);
    expect(onToggleHelp).toHaveBeenCalledTimes(1);
  });
});
