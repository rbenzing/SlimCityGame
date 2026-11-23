/**
 * The timeout for a test that builds a whole world (a road mesh over a map, a settled field
 * simulation) for every case. Each takes four to fifteen seconds on its own and several times
 * that with the rest of the suite running beside it, so the default twenty would fail it on
 * load rather than on anything it checks. Pass it as a describe option or a test's third
 * argument, the way `GROWTH_TIMEOUT_MS` is passed.
 */
export const SLOW_TEST_TIMEOUT_MS = 60_000;
