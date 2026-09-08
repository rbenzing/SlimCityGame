# Standards

The conventions the codebase actually follows, derived from the real code
and config rather than asserted. Each document says plainly which of its
rules are enforced by a tool (ESLint, `tsc`, a test, CI) and which hold only
because reviewers keep upholding them.

| Document                                           | Covers                                                                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| [coding.md](coding.md)                             | TypeScript strictness, module style, what ESLint and Prettier actually enforce, comment conventions                          |
| [architecture-rules.md](architecture-rules.md)     | The sim/render firewall, the `shared/` contract layer, determinism, command/inverse pairing, the one `Math.random` exception |
| [naming.md](naming.md)                             | File, symbol, test, and constant naming, derived from the tree                                                               |
| [repository-structure.md](repository-structure.md) | Where everything belongs: `src/`, `docs/`, `tools/`, `public/`                                                               |
| [branching.md](branching.md)                       | How branches are named and merged — and what is not actually enforced                                                        |
| [commits.md](commits.md)                           | Conventional Commits and release-please                                                                                      |
| [testing.md](testing.md)                           | Vitest conventions, unit vs. integration, determinism tests, and the standing screenshot-verification rule for render work   |
| [logging.md](logging.md)                           | What little logging convention exists, and where it doesn't                                                                  |
| [error-handling.md](error-handling.md)             | The command-ack/reason pattern, fail-soft storage access, what has no convention yet                                         |
| [debugging.md](debugging.md)                       | `window.__slimcity` dev read-backs and the `tools/*-shots.mjs` visual harnesses                                              |

## How these relate to the rest of `docs/engineering/`

[architecture.md](../architecture.md) and
[dependency-map.md](../dependency-map.md) describe what the system's parts
are and how they connect. These documents describe how a person working in
this codebase writes, names, tests, and ships a change inside that
structure. Where a rule here restates something an ADR already decided, it
links to the ADR rather than re-arguing it.
