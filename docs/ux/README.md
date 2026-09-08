# UX and interface

How the interface behaves: what the player can reach, what it does when they
reach for it, and the rules that hold across every panel.

This folder is about **behaviour**. What the interface looks like — colour,
type, spacing, icons — is a visual language and lives in
[../art/ui-style-guide.md](../art/ui-style-guide.md). What the interface is
_for_ lives in [../game-design/](../game-design/README.md).

| Document                                 | Covers                                                              |
| ---------------------------------------- | ------------------------------------------------------------------- |
| [ux-design.md](ux-design.md)             | The interaction philosophy the rest follows from                    |
| [ui-architecture.md](ui-architecture.md) | How the overlay is structured and composed                          |
| [hud.md](hud.md)                         | Every on-screen surface: docks, drawers, panels, popovers           |
| [components.md](components.md)           | The reusable controls and when to reach for each                    |
| [interaction.md](interaction.md)         | The rules that cut across panels: feedback, selection, cancellation |
| [input-mapping.md](input-mapping.md)     | Keyboard and mouse bindings                                         |
| [menu-flow.md](menu-flow.md)             | The start menu and game lifecycle                                   |
| [accessibility.md](accessibility.md)     | What is done, and honestly what is not                              |

## The rule that governs all of it

**Rule zero: every control the game renders is wired to real behaviour.**
Nothing ships as a dead button, a placeholder, or a control that looks
adjustable and is not. A feature that is not built is not rendered — it is
listed in [../DESIGN.md](../DESIGN.md) instead. See
[../engineering/adr/0011-rule-zero-every-control-is-wired-to-real-behaviour.md](../engineering/adr/0011-rule-zero-every-control-is-wired-to-real-behaviour.md).
