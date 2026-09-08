# System design documents

One document per system, describing **how that system works inside**: its data
structures, its algorithms, the invariants it maintains, and where it is likely
to break. The reader is a developer about to change that system.

## What belongs here, and what does not

The documentation set draws a line that is worth being exact about, because
almost every duplication problem starts with getting it wrong:

| Question                                  | Document                              |
| ----------------------------------------- | ------------------------------------- |
| What does the product do, from outside?   | [SPEC.md](../SPEC.md)                 |
| How is the whole system put together?     | [architecture.md](../architecture.md) |
| How does _this one system_ work inside?   | here                                  |
| What shape crosses this boundary?         | [interfaces.md](../interfaces.md)     |
| What does the stored data look like?      | [data-model.md](../data-model.md)     |
| Why was this chosen over the alternative? | [adr/](../adr/README.md)              |

A worked example of the difference. SPEC.md says a signalised approach takes a
control delay of Webster's uniform delay with a 60-second cycle, and gives the
formula — that is observable behaviour a player feels and a test can pin. A
system design document for traffic says how the assignment loop is structured,
which arrays it walks, how congestion feeds back between iterations, and what
happens when the graph changes under it — none of which a player can see, and
all of which the next person to touch it needs.

If you find yourself restating a rule that SPEC.md already states, link to it.

## The documents

| System                   | Covers                                                                        |
| ------------------------ | ----------------------------------------------------------------------------- |
| [traffic.md](traffic.md) | The road graph, the assignment loop, congestion feedback, and where it breaks |

## Writing one

Copy [\_template.md](_template.md) to `<system>.md`. A system earns a document
when it has internal structure a newcomer cannot infer from reading one file —
traffic assignment, growth, the road network model. A system that is one clear
module with good names does not need one; the code is the documentation.

Keep it current with the code. Unlike a decision record, a system design
document describes the present and **is** rewritten as the system changes — if
it goes stale it is worse than absent, because it will be believed.
