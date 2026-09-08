# Engineering

How SlimCity is built: the architecture, the contracts between its parts, the
data it stores, and the conventions the codebase holds itself to.

## Architecture

| Document                               | Covers                                                                                                 |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [architecture.md](architecture.md)     | The whole system at arm's length: three execution contexts, the module map, one tick traced end to end |
| [dependency-map.md](dependency-map.md) | Which module may depend on which, with evidence, and which rules are actually enforced                 |
| [adr/](adr/README.md)                  | Numbered decision records — why each costly choice was made, and what it cost                          |

## Contracts and data

| Document                       | Covers                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------- |
| [interfaces.md](interfaces.md) | Every command, every snapshot channel, the dev read-back surface, the data files |
| [data-model.md](data-model.md) | The grid layers, the save format, the version table, what is never saved         |

## Limits

| Document                                       | Covers                                                             |
| ---------------------------------------------- | ------------------------------------------------------------------ |
| [performance-budget.md](performance-budget.md) | CPU, GPU, memory and simulation budgets, and which are measured    |
| [constraints.md](constraints.md)               | The limits the implementation must respect, and what enforces each |

## Per-item documents

| Folder                            | For                                                                      |
| --------------------------------- | ------------------------------------------------------------------------ |
| [systems/](systems/README.md)     | One document per system: how it works inside                             |
| [features/](features/README.md)   | One document per feature, before it is built: how it will be implemented |
| [standards/](standards/README.md) | The conventions the codebase follows                                     |

## The two rules everything else rests on

**The simulation owns the world, and nothing else may.** It runs deterministically
on a fixed timestep in a Web Worker; `sim/` never imports `render/` or `ui/`.
Be aware that this is a **convention, not a guarantee** — there is no
import-boundary lint rule, so a violation would typecheck and lint clean. See
[adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md](adr/0002-sim-runs-deterministic-fixed-timestep-in-a-worker.md).

**A decision record is never rewritten.** Once accepted it is superseded, not
edited, which is what makes the folder trustworthy years later. See
[adr/README.md](adr/README.md).
