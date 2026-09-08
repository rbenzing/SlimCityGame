# Input mapping

Every binding here is verified against `src/main.ts`, `src/render/camera.ts`,
and `src/ui/App.tsx` — nothing aspirational, matching Rule Zero
(see [ux-design.md](ux-design.md)). There is no controller support and no
touch support anywhere in the input code: every listener below binds
`PointerEvent`, `WheelEvent`, or `KeyboardEvent` on `window`/`viewport`,
and none of it is reachable from a gamepad or a touchscreen.

## Mouse and pointer

All routed through `viewport`'s own `pointerdown`/`pointermove`/`pointerup`
listeners in `main.ts`, except camera control, which is `CameraRig`'s own
independent listener set on the same element.

| Input                                         | Action                                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Left click / drag                             | The active tool (draw a road, paint a zone, place a ploppable, bulldoze, terraform). Handled by `ToolManager`; a drag in progress is what Escape's stage one cancels.                                                                                                                    |
| Left click, tool = `select`, no drag consumed | Picks a building under the cursor via GPU-id raycast (`IdPicker.pickBuilding`) and opens its info panel; with nothing built there, picks the ground tile and opens the junction inspector if a real junction (3+ roads) stands on it. A building always wins over a junction beneath it. |
| Middle-drag or right-drag                     | Rotates the camera (yaw from horizontal drag, pitch from vertical), `CameraRig`'s own `pointerdown`/`pointermove`. Left-drag is deliberately not handled here — tools own it.                                                                                                            |
| Right-click                                   | Suppressed (`contextmenu` is prevented) — the browser's own context menu never appears, since right-drag already means "rotate camera".                                                                                                                                                  |
| Wheel                                         | Zooms to the cursor position (`onWheel` in `camera.ts`), not to screen center — the point under the pointer stays fixed while distance changes.                                                                                                                                          |

## Keyboard — camera

`CameraRig` listens on `window` independently of `main.ts`'s own keydown
handler below; held keys pan continuously while the frame loop runs.

| Key                            | Action                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `W` / `↑`                      | Pan forward (away from camera, north on the ground plane)                                                                           |
| `S` / `↓`                      | Pan backward                                                                                                                        |
| `A` / `←`                      | Pan left                                                                                                                            |
| `D` / `→`                      | Pan right                                                                                                                           |
| (pointer near a viewport edge) | Edge-scroll pans the same way as the corresponding key, while the pointer sits inside the viewport within an 8px band of its border |

## Keyboard — simulation, tools, and history

All bound in one `window` `keydown` listener in `main.ts`.

| Key                                       | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Space`                                   | Toggles pause/resume; resumes at whatever speed was running before the pause (remembered, not reset to 1×). `preventDefault`-ed so it never scrolls the page.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `Escape`                                  | Stage 1 of the Escape stack: if photo mode is active, exits it and restores the gameplay camera (photo mode owns Escape first); otherwise, if a tool drag is in progress, cancels it and marks the press consumed via `preventDefault`, so `App.tsx`'s own later-registered listener (stage 2: close the open drawer; stage 3: drop the tool to `select` and deselect any selected building) does not also fire on the same press. Also doubles, in `MenuScreen.tsx`, as the way to close the in-game pause overlay — but only while a game is actually running; on the menu-only start screen there is nothing to resume, and Escape there does nothing. |
| `R` (no `Ctrl`/`Cmd`)                     | Rotates the ploppable currently in hand (`ToolManager.rotatePlop`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `Page Up` / `Page Down`                   | Raises/lowers the road tool's deck height by one step, only while a road tool is selected (`ROAD_TOOL_TO_TIER[toolManager.tool]` is set); no-op for every other tool                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `Ctrl`/`Cmd`+`Z`                          | Undo; with `Shift` held, redo instead                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `Ctrl`/`Cmd`+`Y`                          | Redo (alternate binding, same effect as `Ctrl`+`Shift`+`Z`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Ctrl`/`Cmd`+`S`                          | Save now                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `Ctrl`/`Cmd`+`Shift`+`L`                  | Load the latest save                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `Digit1`…`Digit7` (no `Ctrl`/`Cmd`/`Alt`) | Jumps to a representative tool of a build category — see the table below. These are the only category hotkeys; the main dock has 14 categories in total (`DockCategory` in `src/ui/categories.ts`), and the other seven have no keyboard shortcut of their own — a category without a listed key below is reachable only by clicking its dock icon.                                                                                                                                                                                                                                                                                                       |

### The `1`–`7` category hotkeys

| Key | Tool selected              | Category    |
| --- | -------------------------- | ----------- |
| `1` | `road.two` (two-lane road) | Roads       |
| `2` | `zone.resLow`              | Zoning      |
| `3` | `plop.wind-turbine`        | Electricity |
| `4` | `plop.police-station`      | Police      |
| `5` | `plop.small-park`          | Parks       |
| `6` | `bulldoze`                 | Bulldoze    |
| `7` | `terraform.raise`          | Landscaping |

## What is not bound

No gamepad/controller input exists anywhere in the codebase — there is no
`Gamepad` API usage, and nothing above is reachable except by mouse and
keyboard. There is likewise no touch-specific handling: `PointerEvent`
covers touch input generically, but there is no pinch-to-zoom, no
touch-drag-to-rotate, and no on-screen touch controls, so the camera and
tools are, in practice, playable only with a mouse and keyboard.
