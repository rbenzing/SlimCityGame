// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SaveBrowser, type SaveRow } from './SaveBrowser';

afterEach(() => {
  cleanup();
});

const RIVERSIDE: SaveRow = {
  id: 1,
  name: 'Riverside',
  timestamp: 1_700_000_000_000,
  population: 12_345,
  funds: 98_765,
};
const HILLVIEW: SaveRow = { id: 'slot-2', name: 'Hillview', timestamp: 1_710_000_000_000 };
const SAVES: SaveRow[] = [RIVERSIDE, HILLVIEW];

function expectedDate(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(ms),
  );
}

describe('SaveBrowser', () => {
  it('shows the empty state when there are no saves', () => {
    render(<SaveBrowser saves={[]} onLoad={vi.fn()} onDelete={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText('No saved cities yet.')).toBeInTheDocument();
  });

  it('renders a row per save with name, formatted date, and optional pop/funds', () => {
    render(<SaveBrowser saves={SAVES} onLoad={vi.fn()} onDelete={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText('Riverside')).toBeInTheDocument();
    expect(screen.getByText('Hillview')).toBeInTheDocument();
    expect(screen.getByText(expectedDate(RIVERSIDE.timestamp))).toBeInTheDocument();
    expect(screen.getByText(expectedDate(HILLVIEW.timestamp))).toBeInTheDocument();
    expect(screen.getByText(/Pop 12,345/)).toBeInTheDocument();
    expect(screen.getByText(/98,765/)).toBeInTheDocument();
  });

  it('fires onLoad with the correct id when a row Load button is clicked', () => {
    const onLoad = vi.fn();
    render(<SaveBrowser saves={SAVES} onLoad={onLoad} onDelete={vi.fn()} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Load Hillview' }));
    expect(onLoad).toHaveBeenCalledWith('slot-2');
  });

  it('fires onDelete with the correct id when a row Delete button is clicked', () => {
    const onDelete = vi.fn();
    render(<SaveBrowser saves={SAVES} onLoad={vi.fn()} onDelete={onDelete} onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Riverside' }));
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it('fires onBack when Back is clicked', () => {
    const onBack = vi.fn();
    render(<SaveBrowser saves={[]} onLoad={vi.fn()} onDelete={vi.fn()} onBack={onBack} />);
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
