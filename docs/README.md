# SlimCity documentation

Seven disciplines, each with its own folder. Find your question below and the
folder will have the rest.

| I want to know…                        | Go to                                     |
| -------------------------------------- | ----------------------------------------- |
| How do I play?                         | [USERGUIDE.md](USERGUIDE.md)              |
| What is built, and what is next?       | [ROADMAP.md](ROADMAP.md)                  |
| What are we deliberately not building? | [DESIGN.md](DESIGN.md)                    |
| How is it built, and why that way?     | [engineering/](engineering/README.md)     |
| What does the game ask of the player?  | [game-design/](game-design/README.md)     |
| How does the simulated world behave?   | [world-sim/](world-sim/README.md)         |
| How is the world rendered?             | [visual-render/](visual-render/README.md) |
| What should an asset look like?        | [art/](art/README.md)                     |
| How does the interface behave?         | [ux/](ux/README.md)                       |
| How do I work on it?                   | [../CONTRIBUTING.md](../CONTRIBUTING.md)  |

## The seven folders

**[engineering/](engineering/README.md)** — architecture, decision records,
interface contracts, the data model, budgets, constraints, and the coding
standards the repo holds itself to. Four documents there divide by how far in
you are looking: `architecture.md` is the whole system at arm's length,
`systems/` is one subsystem's internals, `interfaces.md` is the exact shapes
crossing between them, and `data-model.md` is what survives being written to
disk.

**[game-design/](game-design/README.md)** — the game design document, the core
loop, the economy, progression, and every tuning constant gathered in one
place.

**[world-sim/](world-sim/README.md)** — the rules of the simulated world: the
grid, roads, traffic, transit, utilities, services, the fields, and what runs
each tick. The largest area, because it is the largest part of the game.

**[visual-render/](visual-render/README.md)** — the rendering pipeline,
lighting, terrain, water and vegetation.

**[art/](art/README.md)** — the art bible and the standards an asset is built
to. The scale bible sits at the front, because everything else obeys it.

**[ux/](ux/README.md)** — how the interface behaves: every surface, the
interaction rules, the bindings, accessibility.

**[ROADMAP.md](ROADMAP.md) and [DESIGN.md](DESIGN.md)** stay at the top level
because they cut across all six: one is the only place delivery status and
dates live, the other the only place a deliberate non-goal lives.

## The rules that keep this working

**One fact, one place.** A documentation set rots not because something is
written down wrongly but because it is written down twice, one copy is updated,
and the two now contradict each other with no way to tell which is current.
When you are about to restate something, link to it instead.

**Never date a specification.** A spec describes the product as it is now. The
moment it carries "(shipped 2026-08-11)" or "v2" it has become a changelog in
the wrong file, and the next reader cannot tell which of two nearby paragraphs
is true. Delivery belongs to [ROADMAP.md](ROADMAP.md), and nowhere else.

**A shipped thing leaves [DESIGN.md](DESIGN.md).** Its behaviour goes to the
relevant spec and its delivery to the roadmap. A built feature lingering in a
deferred list is how a scope guard turns into misinformation.

**An accepted decision record is never rewritten** — it is superseded. See
[engineering/adr/README.md](engineering/adr/README.md).

`npm run lint:docs` fails on any relative link in these files that does not
resolve, so the set cannot quietly rot the way it once did.
