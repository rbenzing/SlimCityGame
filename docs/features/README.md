# Technical design documents

One document per feature, written **before** the feature is built, describing
how it will be implemented. The reader is whoever reviews the plan — and, later,
whoever has to work out why it was built this way.

A technical design document is a proposal. That is what separates it from
everything else in this set: the rest of the documentation describes what is,
and this folder describes what is intended.

## Why write one

Because the expensive mistakes in this project are made before any code is
written — a save layer that cannot be extended, a command with no clean inverse,
a render path that has to be walked every frame. A page of design costs an hour
and catches those; a week of implementation does not.

Write one when a feature touches more than one module, changes the save format
or the worker protocol, or has a design that a reviewer could reasonably
disagree with. Skip it for a bug fix or a self-contained change — the pull
request is enough.

## The lifecycle, which matters

A technical design document has a **Status**, and it moves:

- `Draft` — being written.
- `Agreed` — the plan to build from.
- `Built` — the feature shipped. Add a line naming where its behaviour is now
  described in [SPEC.md](../SPEC.md), and stop maintaining this file.
- `Abandoned` — say why, and leave it. A recorded dead end saves the next person
  from walking down it.

**A built feature's documentation does not live here.** Once it ships, what it
does belongs to [SPEC.md](../SPEC.md), how the system works belongs to
[systems/](../systems/README.md), and when it landed belongs to
[ROADMAP.md](../ROADMAP.md). This folder keeps the plan as a historical record of
intent, not as a description of the product — which is exactly why a document
here going out of date is harmless, while one in `systems/` going out of date is
not.

If the design settled a question that will outlive the feature — a choice that
constrains what can be built later — that belongs in a decision record instead,
or as well. See [adr/README.md](../adr/README.md).

## Writing one

Copy [\_template.md](_template.md) to `<feature>.md`.
