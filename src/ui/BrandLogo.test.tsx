// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import BrandLogo from './BrandLogo';

afterEach(() => {
  cleanup();
});

describe('BrandLogo', () => {
  it('renders an accessible SVG wordmark labeled "SlimCity"', () => {
    render(<BrandLogo />);
    expect(screen.getByRole('img', { name: 'SlimCity' })).toBeInTheDocument();
  });

  it('forwards a className to the root svg so callers can tint it', () => {
    render(<BrandLogo className="text-white" />);
    expect(screen.getByRole('img', { name: 'SlimCity' })).toHaveClass('text-white');
  });
});
