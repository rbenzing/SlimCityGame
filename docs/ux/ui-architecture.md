# Overlay architecture

How the interface is wired together — not what it shows (see
[hud.md](hud.md)) or how it behaves (see [interaction.md](interaction.md)).

## `#ui-root` / `#viewport` and pointer-events layering

The document holds exactly two full-screen layers, both defined in
`src/ui/styles.css`:

- `#viewport` — `position: fixed; inset: 0`. The three.js canvas. Owns
  every pointer event by default.
- `#ui-root` — `position: fixed; inset: 0; pointer-events: none; z-index:
10`. The React mount point, stacked above the viewport.

`#ui-root` itself ignores pointer events, so any gap between panels is
click-through straight to the viewport underneath. The one rule that makes
individual panels clickable is `#ui-root > *{ pointer-events: auto; }` —
every direct child of the root regains pointer events, so each top-level
panel is a hit target again while the space around it stays transparent to
the world below. A panel nested inside JSX but not a direct child of the
root (a popover rendered inside a wrapping `<div>`, for instance) has to
restate `pointer-events-auto` itself, since the blanket rule only reaches
one level deep — several panels do exactly this (their outer wrapper is
`pointer-events-none`, sized to its slot, with the actual chrome inside it
marked `pointer-events-auto`) precisely so the empty margin around a
corner-anchored panel stays click-through.

## React + Zustand, with the store as the only bridge to the render thread

`src/ui/store.ts` is a single Zustand store (`useCityStore`) and nothing
else touches the render thread from React. Concretely:

- Every panel reads simulation state (stats, selection, tool state,
  settings) out of the store via `useCityStore((s) => ...)` selectors —
  never by reaching into `main.ts`'s renderers or the worker directly.
- Actions that need to reach the render/worker side go through
  `BoundActions`, a small interface (`sendCommands`, `undo`, `redo`,
  `setSpeed`, `togglePhoto`, `saveGame`, `onSettings`, `focusTile`) that
  `main.ts` supplies once via `bindActions` after it constructs the
  worker, the `UndoStack`, and the render pipeline. Until that call lands,
  `store.getState().bound` is `null` and calls through it are no-ops — the
  store is safe to read from the very first React render, before
  `main.ts` has finished booting anything.
- The store carries no DOM or three.js state of its own — it is a pure
  data model (`CityStoreState`), safe to unit test (`store.test.ts`)
  without a browser.

This one-bridge rule is what keeps the `ui/` ↔ `render/` seam legible: a
panel never needs to know how a command reaches the worker, and `main.ts`
never needs to know which panel triggered it. See
[../engineering/adr/0004-dom-overlay-is-react-3d-world-stays-imperative-three.md](../engineering/adr/0004-dom-overlay-is-react-3d-world-stays-imperative-three.md)
for why the two sides use different frameworks at all, and
[../engineering/architecture.md](../engineering/architecture.md) for the
full module map.

Transient UI-navigation state that nothing outside `src/ui` needs to
read — which build category's drawer is open, whether a popover is
showing — deliberately does **not** live in the store. It is plain React
`useState` in `App.tsx`, passed down as props. Only state that the
render/worker integration also needs to read or drive (`selectedTool`,
`overlay`, `photoMode`, `screen`, `settings`, and so on) belongs in the
store; promoting UI-only state there would make `store.ts` the wrong
single source of truth for two different things at once.

## `App.tsx`: composing the surfaces

`src/ui/App.tsx` is the one place all top-level panels are assembled. It:

- Always renders `<MenuScreen />` (self-gating: the component itself
  decides whether the start screen or the pause overlay should show).
- Renders the rest of the in-game chrome only when `screen === 'playing'
&& !photoMode` — there is no world or worker on the menu-only screen for
  any panel to read, and photo mode hides every DOM element for a clean
  shot.
- Owns the drawer/popover navigation state (`activeCategory`,
  `infoviewOpen`, `milestoneOpen`, `cityInfoOpen`, `helpOpen`) as local
  `useState`, for the reason above.
- Registers one `window` `keydown` listener for the last two stages of the
  Escape stack (closing the drawer, then dropping the tool/selection) —
  stage one, cancelling an in-progress drag, is handled earlier, at the
  tool level in `main.ts`, which calls `preventDefault()` so this later
  listener knows the press was already consumed. See
  [interaction.md](interaction.md) for the full stack.
- Calls `mountUi(rootEl)`, the one export `main.ts` calls to attach this
  whole tree to `#ui-root` via `createRoot`.

## Viewport input lives outside React entirely

Every pointer and keyboard interaction with the 3D world — tool
drawing, building/junction picking, camera drag/zoom/pan, and every global
keyboard shortcut — is wired in `src/main.ts` with plain
`addEventListener` calls on `viewport` and `window`, not through any React
event handler. React never sees a `pointerdown` on the canvas. This
follows directly from the `ui/` vs. `render/` technology boundary in
ADR-0004: the viewport is imperative three.js territory, and routing its
input through React would mean reconciling a component tree on every mouse
move for no benefit. See [input-mapping.md](input-mapping.md) for the
exact bindings this wires up, and `CameraRig`
(`src/render/camera.ts`) for the camera's own independent listener set.
