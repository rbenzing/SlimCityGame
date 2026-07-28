// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ICON_NAMES, Icon } from './icons';

afterEach(() => {
  cleanup();
});

describe('Icon', () => {
  it('includes the UI-SPEC §6.11 Landscaping category glyph', () => {
    expect(ICON_NAMES).toContain('landscaping');
  });

  it('renders a single inline svg element (no emoji glyph) for every known icon name', () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      const svgs = container.querySelectorAll('svg');
      expect(svgs, `icon "${name}" should render exactly one <svg>`).toHaveLength(1);
      unmount();
    }
  });

  it('is decorative by default (aria-hidden) so it never doubles up with an accessible name', () => {
    const { container } = render(<Icon name="roads" />);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('forwards className and other svg props to the underlying element', () => {
    const { container } = render(<Icon name="roads" className="w-5 h-5" data-testid="road-icon" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('w-5', 'h-5');
    expect(svg).toHaveAttribute('data-testid', 'road-icon');
  });
});
