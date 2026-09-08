# Contributing

## Quality gates

Every change must pass the same gates CI runs (`.github/workflows/ci.yml`):

```bash
npm run typecheck   # strict tsc, no errors
npm run lint        # ESLint, zero errors
npm test            # Vitest (unit + determinism)
npm run build       # production bundle succeeds
npm run lint:docs   # every relative link in the docs resolves
```

`sim/` never imports `render/` or `ui/`; the UI talks to the sim only through
the worker command/snapshot protocol. No `Math.random` / `Date.now` in the sim
or render paths — seeded RNG streams only, so runs stay deterministic.

## Where a fact goes

The documentation set has one rule, and it is the rule that keeps it usable:
**one fact, one place.** A set rots not because something is written down wrongly
but because it is written down twice, one copy is updated, and now the two
contradict each other with no way to tell which is current.

So when you add a paragraph, first decide what kind of thing it is:

| The thing you are writing                            | Goes in                                                             |
| ---------------------------------------------------- | ------------------------------------------------------------------- |
| How the simulated world behaves                      | [docs/world-sim/](docs/world-sim/README.md)                         |
| What the game asks of the player, or a tuning number | [docs/game-design/](docs/game-design/README.md)                     |
| How the code is structured, or a contract            | [docs/engineering/](docs/engineering/README.md)                     |
| Why a costly, hard-to-reverse choice was made        | [docs/engineering/adr/](docs/engineering/adr/README.md)             |
| A coding, testing or naming convention               | [docs/engineering/standards/](docs/engineering/standards/README.md) |
| How the world is rendered                            | [docs/visual-render/](docs/visual-render/README.md)                 |
| How an asset should look or be built                 | [docs/art/](docs/art/README.md)                                     |
| How the interface behaves                            | [docs/ux/](docs/ux/README.md)                                       |
| That something shipped, or is next, or a date        | [docs/ROADMAP.md](docs/ROADMAP.md)                                  |
| Something we have decided not to build               | [docs/DESIGN.md](docs/DESIGN.md)                                    |
| How to play                                          | [docs/USERGUIDE.md](docs/USERGUIDE.md)                              |

Two habits follow from that table and are worth stating outright.

**Never date a spec.** A sentence in any of the discipline folders describes the
product as it is now. The moment it carries "(shipped 2026-08-11)" or "v2" it
has become a changelog entry in the wrong file, and the next reader cannot tell
which of two nearby paragraphs is true. Delivery belongs to
[docs/ROADMAP.md](docs/ROADMAP.md), and nowhere else.

**Never state a volatile number twice.** Test counts, file counts, benchmark
figures: pick the one document that owns it, date it there, and link from
anywhere else that wants to mention it.

Decision records follow their own conventions — chiefly that an accepted record
is never rewritten, only superseded. See
[docs/engineering/adr/README.md](docs/engineering/adr/README.md)
before adding one.

## Commit messages drive the version

Versioning is automated with [release-please](https://github.com/googleapis/release-please)
and [Conventional Commits](https://www.conventionalcommits.org/). The **type**
prefix on each commit decides the next [SemVer](https://semver.org/) bump:

| Prefix                                                               | Example                                  | Version bump |
| -------------------------------------------------------------------- | ---------------------------------------- | ------------ |
| `fix:`                                                               | `fix: garbage trucks stall at dead ends` | patch        |
| `feat:`                                                              | `feat: add incinerator facility`         | minor        |
| `feat!:` / `fix!:` / `BREAKING CHANGE:`                              | `feat!: rework save format`              | major        |
| `docs:` `chore:` `refactor:` `test:` `ci:` `perf:` `build:` `style:` | maintenance, no release on their own     | none         |

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
