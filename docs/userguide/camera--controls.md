# Camera & controls

| Input                      | Action                                                             |
| -------------------------- | ------------------------------------------------------------------ |
| Left drag                  | Active tool (draw road / paint zone / bulldoze)                    |
| Left click                 | Select a building (opens its info panel)                           |
| Middle / right drag, wheel | Rotate / zoom-to-cursor; `WASD` + edge-scroll to pan               |
| `Space`                    | Pause / resume                                                     |
| `1`–`7`                    | Jump to a tool category (roads / zoning / power / … / landscaping) |
| `R`                        | Rotate the ploppable you're placing                                |
| `Esc`                      | Cancel the current tool / deselect                                 |
| `Ctrl+Z` / `Ctrl+Y`        | Undo / redo (refunds are exact)                                    |
| `Ctrl+S` / `Ctrl+Shift+L`  | Save / load latest                                                 |

Speed controls (status strip): pause and stepped speeds up to 4×. `1×` is a calm,
real-time-ish pace; higher steps fast-forward. Day and night cycle continuously —
street lamps and windows light up after dark. Only streets the power grid has
actually reached carry lamps at all, so after dark the lit part of the map is
the powered part — and a district that browns out goes dark with it.

Your city **autosaves** every couple of game-months to the browser (IndexedDB),
and you can save/load manually. There's also a **photo mode** that hides the UI
for a clean screenshot.

