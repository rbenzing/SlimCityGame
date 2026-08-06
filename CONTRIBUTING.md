# Contributing

## Quality gates

Every change must pass the same gates CI runs (`.github/workflows/ci.yml`):

```bash
npm run typecheck   # strict tsc, no errors
npm run lint        # ESLint, zero errors
npm test            # Vitest (unit + determinism)
npm run build       # production bundle succeeds
```

`sim/` never imports `render/` or `ui/`; the UI talks to the sim only through
the worker command/snapshot protocol. No `Math.random` / `Date.now` in the sim
or render paths — seeded RNG streams only, so runs stay deterministic.

## Commit messages drive the version

Versioning is automated with [release-please](https://github.com/googleapis/release-please)
and [Conventional Commits](https://www.conventionalcommits.org/). The **type**
prefix on each commit decides the next [SemVer](https://semver.org/) bump:

| Prefix                                    | Example                                  | Version bump |
| ----------------------------------------- | ---------------------------------------- | ------------ |
| `fix:`                                    | `fix: garbage trucks stall at dead ends` | patch        |
| `feat:`                                   | `feat: add incinerator facility`         | minor        |
| `feat!:` / `fix!:` / `BREAKING CHANGE:`   | `feat!: rework save format`              | major        |
| `docs:` `chore:` `refactor:` `test:` `ci:` `perf:` `build:` `style:` | maintenance, no release on their own | none         |

Scopes are optional (`feat(garbage): …`). Keep the subject imperative and under
~72 chars; put rationale in the body.

## How a release ships

1. You merge Conventional-Commit PRs into `main`.
2. `release-please` keeps a rolling **release PR** open that accumulates the
   pending changes, the computed next version, and the generated `CHANGELOG.md`.
3. When you merge that release PR, release-please bumps `package.json`, tags the
   commit (`vX.Y.Z`), and publishes a **GitHub Release**.
4. The same workflow then builds the SPA and deploys it to **GitHub Pages**.

You never edit the version by hand — the commit history is the source of truth.
