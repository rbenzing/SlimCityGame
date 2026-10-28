# Truths — Process

Back to [the index](../GROUND-TRUTHS.md).


- [R-process-001] Never name or imitate a commercial city-builder in names, assets, branding,
  code or docs; say "city builder" or "city simulator". Genre grammar is reused
  deliberately; originality is elsewhere. —
  [ADR-0014](../engineering/adr/0014-genre-grammar-is-deliberate-originality-is-elsewhere.md),
  [DESIGN.md](../DESIGN.md)
- [R-process-002] Code comments explain why, never what, and never cite a documentation section
  or narrate history. Test names describe behaviour, without section
  citations. — [coding.md](../engineering/standards/coding.md),
  [naming.md](../engineering/standards/naming.md)
- [R-process-003] A unit test is co-located as `<module>.test.ts(x)` beside the module, never
  in a `__tests__` folder. A test that sends the sim commands is an
  interaction test and lives in `tests/interaction/`, named for what the
  player does, never beside a module. A feature a player can build adds a
  step to the small town in `tests/support/town.ts`. —
  [naming.md](../engineering/standards/naming.md),
  [testing.md](../engineering/standards/testing.md)
- [R-process-004] A passing test that a new feature can only keep passing by adding a setup
  step is not a test to fix but a rule the feature has changed: stop, name
  the rule, and move it in [GROUND-TRUTHS.md](../GROUND-TRUTHS.md) and its spec
  before the test. The sewer gate shipped in 1.31.0 by giving every growth
  test a pond and a drain, and no new town could grow until 1.32. —
  [testing.md](../engineering/standards/testing.md);
  `tests/interaction/firsttown.test.ts`
- [R-process-005] Files are lowercase run-together (`roadprofile.ts`); React components are
  `PascalCase.tsx`; only `worker.entry.ts` carries a dot suffix; constants are
  `UPPER_SNAKE_CASE`, and a derived constant is computed from its source
  constant in the same file. — [naming.md](../engineering/standards/naming.md)
- [R-process-006] Commit subjects use Conventional Commit prefixes; a PR title that will land
  as a merge commit is plain prose with no prefix, or the changelog
  double-counts. Releases are cut by release-please: never hand-tag, never
  hand-edit the package version or the changelog. —
  [commits.md](../engineering/standards/commits.md),
  [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [R-process-007] The version is one number in three files — `package.json`,
  `.release-please-manifest.json`, and the newest heading in `CHANGELOG.md` —
  and they never disagree. release-please writes all three in one commit, so a
  disagreement means someone edited one by hand. The menu shows the version of
  the BUILD, baked from `package.json`, which is why a feature branch behind
  main honestly reads older than the newest release: that is correct, and
  showing the latest release instead would make the menu lie about what is
  running. — `src/shared/contracts.version.test.ts`, `vite.config.ts`
- [R-process-008] An accepted decision record is never rewritten beyond typos and links; a
  changed decision gets a new number and the old one is marked superseded.
  Numbers are never reused. — [adr/README.md](../engineering/adr/README.md)
- [R-process-009] A volatile number (test count, date) lives in one document only; delivery
  status lives in [ROADMAP.md](../ROADMAP.md) and "not building" in
  [DESIGN.md](../DESIGN.md). Documentation carries one overall version, never
  per-section versioning. — [CONTRIBUTING.md](../../CONTRIBUTING.md)
- [R-process-010] The gate for every change is typecheck, lint, lint:docs, test and build, in
  that order, and a render change adds a looked-at screenshot. —
  [testing.md](../engineering/standards/testing.md),
  [branching.md](../engineering/standards/branching.md)
