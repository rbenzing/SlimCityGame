# SlimCity documentation

Six kinds of question, six places to look. Each fact lives in exactly one of
them; where two would overlap, the others link here rather than repeat it.

| I want to know…                      | Read                                     | Which is                    |
| ------------------------------------ | ---------------------------------------- | --------------------------- |
| How do I play?                       | [USERGUIDE.md](USERGUIDE.md)             | The player's guide          |
| What does the product do?            | [SPEC.md](SPEC.md)                       | The normative reference     |
| What is built, and what is next?     | [ROADMAP.md](ROADMAP.md)                 | The delivery plan           |
| How is the system put together?      | [architecture.md](architecture.md)       | The architecture overview   |
| How does one system work inside?     | [systems/](systems/README.md)            | System design documents     |
| What shape crosses this boundary?    | [interfaces.md](interfaces.md)           | The interface contracts     |
| What does the stored data look like? | [data-model.md](data-model.md)           | The data model and schema   |
| Why is it built that way?            | [adr/](adr/README.md)                    | The decision log            |
| How will this feature be built?      | [features/](features/README.md)          | Technical design documents  |
| What are we deliberately not doing?  | [DESIGN.md](DESIGN.md)                   | The scope guards            |
| How should this screen look?         | [ui/](ui/README.md)                      | The interface design system |
| How should this model look?          | [art/](art/README.md)                    | The in-world art direction  |
| How do I work on it?                 | [../CONTRIBUTING.md](../CONTRIBUTING.md) | The contributor guide       |

The four technical documents divide by a single question — _how far in are you
looking?_ [architecture.md](architecture.md) is the whole system at arm's
length; [systems/](systems/README.md) is one subsystem's internals;
[interfaces.md](interfaces.md) is the exact shapes that cross between them; and
[data-model.md](data-model.md) is what survives being written to disk.
[SPEC.md](SPEC.md) sits outside that stack entirely: it describes what a player
can observe, and says nothing about how any of it is built.

## What each one is for, and what it must never become

**[SPEC.md](SPEC.md) — what the product is.** Present tense, normative, organised
by subsystem. A reader should be able to hold a statement in SPEC.md against the
running game and tell whether the game is wrong. It carries no dates, no history
and no delivery status: a spec that records when each sentence was written stops
being a description of the product and becomes a changelog with the wrong name.

**[ROADMAP.md](ROADMAP.md) — what is done and what is next.** This is the only
document that carries dates and delivery status, and that exclusivity is the
point. When a thing ships, its status is updated here and its behaviour is
described in SPEC.md; the two never both describe it.

**[adr/](adr/README.md) — what was decided, and what it cost.** One record per
decision, numbered, and never rewritten once accepted — a decision that changes
gets a new record superseding the old. That is what makes it safe to read a
record from a year ago: you are seeing what was actually believed then.

**[DESIGN.md](DESIGN.md) — what we are not building.** The deferred backlog and
the rejected directions, each with its reasoning. Treat the rejected list as
settled, not as open questions. Once something here ships it leaves this file
entirely — it belongs to SPEC.md and ROADMAP.md from that moment.

**[ui/](ui/README.md) — the DOM overlay.** Layout grammar, style tokens, and the
interaction patterns that cut across panels. The colour and radius values are
owned by `src/ui/styles.css`; the docs name the authority rather than becoming a
second copy of it.

**[art/](art/README.md) — the world itself.** Massing, materials, lighting,
vehicles, nature. The scale bible sits at the front of that folder because
everything else obeys it.

**[USERGUIDE.md](USERGUIDE.md) — how to play.** Written for someone who has never
opened the game and does not care how it is built.

## The rule that keeps this working

**One fact, one place.** The most common way a documentation set rots is not that
a fact is written down wrongly — it is that a fact is written down twice, one
copy is updated, and now the set contradicts itself with no way to tell which
half is current. When you find yourself about to restate something, link to it
instead.
