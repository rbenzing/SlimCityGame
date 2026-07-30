# SlimCity

<div align="center">

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-000000?style=for-the-badge&logo=three.js&logoColor=white)](https://threejs.org/)
[![React](https://img.shields.io/badge/React-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vite.dev/)
[![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=for-the-badge&logo=vitest&logoColor=white)](https://vitest.dev/)
[![License: AGPL v3+](https://img.shields.io/badge/License-AGPL%20v3%2B-blue.svg?style=for-the-badge)](./LICENSE)
[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/russellbenzing)

**A small-form-factor city builder in the browser — an engine showcase built on Three.js**

🌐 **Browser-Native** • ⚡ **WebGPU + WebGL2 Fallback** • 🧠 **Deterministic Worker Sim** • 🧩 **Fully Instanced**

[Features](#-features) • [Quick Start](#-quick-start) • [Controls](#-controls) • [Documentation](#-documentation) • [License](#-license)

</div>

---

SlimCity is a familiar city-builder play grammar and UI layout at reduced scale:
milestone-gated zoning (low → medium-row → medium → mixed-use → high density,
plus business & industry), demand-driven growth, a road hierarchy with
statistical traffic in lanes, road-carried power & water, diffusing data fields,
a full economy, full terraforming with animated water, a day/night cycle with emissive
windows + bloom — all running smoothly in a browser tab. The simulation runs
deterministically in a Web Worker at a fixed timestep; rendering is fully
instanced Three.js.

<div align="center">

![SlimCity — a city block at night, with lit windows, street lamps and traffic](screenshots/screenshot-01.png)

</div>

---

## ✨ Features

- **🏙️ Paint-to-grow zoning** — you set zones and demand fills them in; buildings
  construct, upgrade, and abandon on their own. Denser zone types unlock as you
  hit milestones.
- **🛣️ Road hierarchy** — gravel, two-lane, avenue, one-way, four-lane, and
  highway, with junction crosswalks, rounded corners, contained dead-end caps,
  and smooth grade-preserving ramps up slopes.
- **⚡💧 Networks through roads** — power and water propagate along the road graph;
  place a source next to a road and the connected network is served.
- **🚗 Statistical traffic** — lane-accurate cosmetic vehicles driven by a
  statistical assignment model, not per-car physics.
- **🚌 Services & transit** — fire, police, health, education, parks; cosmetic
  service dispatch; bus lines with ridership; districts & policies.
- **⛰️ Terraforming & water** — raise / lower / level / smooth brushes with real
  depth-rendered, animated water that floods below sea level.
- **🌗 Living day/night** — continuous sun cycle with emissive windows, pooled
  street-lamp lighting, shadows, and a bloom pass.
- **📊 Legible through data** — RCI demand bars, milestone XP, infoview lenses
  (land value, pollution, traffic, coverage), and stats charts.

---

## 🛠️ Tech Stack

| Layer         | Tech                                                                           |
| ------------- | ------------------------------------------------------------------------------ |
| Language      | TypeScript (strict)                                                            |
| Rendering     | Three.js — `WebGPURenderer` with automatic WebGL2 fallback                     |
| UI shell      | React + Zustand + Tailwind CSS (HTML overlay only; no R3F in the render path)  |
| Build         | Vite                                                                           |
| Simulation    | Deterministic fixed-timestep loop in a Web Worker over typed-array tile layers |
| Terrain noise | `simplex-noise`                                                                |
| Testing       | Vitest (unit + determinism) · Playwright (headless visual smoke)               |
| Quality       | ESLint + Prettier (kept at zero errors)                                        |

---

## 🚀 Quick Start

**Prerequisites:** Node.js 20.19+ (or 22+) and npm.

```bash
npm install
npm run dev        # Vite dev server (http://localhost:5173)
npm test           # Vitest suite
npm run typecheck  # strict tsc
npm run build      # production build
npm run lint       # ESLint (zero errors)
npm run format     # Prettier
```

---

## ✅ Quality Gates

Built test-first throughout — **2,094+ unit/integration tests across 80 files**.
Every change exits through the same gates:

- ✅ `typecheck` — strict TypeScript, no errors
- ✅ `test` — unit + determinism (same seed + command log ⇒ same state hash)
- ✅ `build` — production bundle succeeds
- ✅ `lint` — ESLint at zero errors, Prettier-clean
- ✅ **no-stub audit** — every rendered control is wired to real behavior
- ✅ **screenshot review** — visual features are verified in a headless browser

---

## 🎮 Controls

| Input                      | Action                                                        |
| -------------------------- | ------------------------------------------------------------- |
| Left drag                  | Active tool (draw road / paint zone / bulldoze)               |
| Left click                 | Select a building (info panel)                                |
| Middle / right drag, wheel | Camera rotate / zoom-to-cursor; `WASD` + edge-scroll pan      |
| `Space`                    | Pause / resume                                                |
| `1`–`7`                    | Tool categories (roads / zoning / power / … / landscaping)    |
| `R`                        | Rotate ploppable                                              |
| `Esc`                      | Cancel tool / deselect                                        |
| `Ctrl+Z` / `Ctrl+Y`        | Undo / redo (refund-accurate, worker-computed inverses)       |
| `Ctrl+S` / `Ctrl+Shift+L`  | Save / load latest (IndexedDB; autosaves every 2 game-months) |

New here? See the [Player Guide](docs/USERGUIDE.md).

---

## 🏗️ Project Layout

```
src/
  shared/        contract layer every module codes against (types, constants)
  core/          deterministic sim kernel (fixed-timestep loop, commands, RNG)
  world/         map generation, grid, roads, pathfinding, terraform, districts
  sim/           simulation systems (growth, economy, traffic, transit, fields)
  render/        instanced Three.js renderers (terrain, buildings, roads, …)
  tools/         tool state machines + undo stack
  ui/            React / Zustand / Tailwind overlay
  main.ts        render-thread boot: wires the worker, renderers, UI, persistence
docs/            SPEC · ROADMAP · DESIGN · USERGUIDE
tools/           reusable Playwright visual harnesses (not part of the build)
```

**Hard rule:** `sim/` never imports `render/` or `ui/`; the UI talks to the sim
only through the worker command/snapshot protocol. The simulation is
deterministic — no `Math.random`, no `Date.now`; seeded RNG streams, hash-tested.

---

## 📚 Documentation

- **[docs/SPEC.md](docs/SPEC.md)** — the living product spec: the city-builder UI
  shell, in-world feedback, night cycle, and the visual/systems detail for roads,
  zoning, utilities, services, transit, districts, terraforming, and landmarks.
- **[docs/ROADMAP.md](docs/ROADMAP.md)** — design pillars, systems, milestones,
  and delivery status.
- **[docs/DESIGN.md](docs/DESIGN.md)** — design rationale and scope guards: the
  deferred backlog and deliberately-rejected directions, with reasoning.
- **[docs/USERGUIDE.md](docs/USERGUIDE.md)** — how to play: the gameplay loop,
  tools, reading the city, and controls.

---

## 📄 License

Released under the [GNU Affero General Public License v3.0 or later (AGPLv3+)](./LICENSE).

---

## 👤 About the Author

Built by **Russell Benzing**. SlimCity is a personal project exploring how far a
browser engine can be pushed toward a living, data-rich city simulation.

---

## 💬 Support

If SlimCity is useful or fun to you, you can support the work:

<div align="center">

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20Me%20A%20Coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/russellbenzing)

**Built with Three.js, TypeScript, and a lot of screenshots.**

</div>
