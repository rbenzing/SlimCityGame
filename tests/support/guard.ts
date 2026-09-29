import { afterEach, beforeEach, expect, vi } from 'vitest';
import type { MockInstance } from 'vitest';

/**
 * Every road command also checks the road network: after each one the road
 * layers are derived from the network again, and a tile that comes out
 * differently is reported. A file that calls this lets no test leave one
 * reported.
 */
export function guardRoadNetwork(): void {
  let consoleError: MockInstance<typeof console.error>;
  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error');
  });
  afterEach(() => {
    const roadReports = consoleError.mock.calls.filter((args) =>
      String(args[0]).startsWith('road network'),
    );
    consoleError.mockRestore();
    expect(roadReports).toEqual([]);
  });
}
