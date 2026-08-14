# SimSolar Orrery

SimSolar is a dependency-free browser visualization of the solar system and
selected spacecraft trajectories. It uses Keplerian orbital elements, a
lightweight 3D-to-2D projection, and the Canvas 2D API.

## Run locally

Open `solar-system.html` in a modern browser. No build, package installation, or
web server is required.

## Features

- Elliptical and hyperbolic Kepler solvers
- Eight planets, Pluto and Charon, 13 major planetary moons, and six spacecraft
- Five iconic comets with JPL-derived paths and Sun-facing tails
- Future-only Newtonian N-body gravity initialized from JPL state vectors
- Interactive insertion of configurable stars, black holes, planets, and comets
- Animated simulation clock with adjustable speed and direction
- Mission timeline with launch/flyby jumps and UTC date navigation
- Automatic zoom/focus/follow from the body list and spacecraft mission events
- Rolling average and p95 frame-time profiler for each view preset
- Pointer orbit rotation, Space-drag or two-finger pan, pinch/wheel zoom, movable panels, and view presets
- Panel shortcuts: `M` mission timeline, `L` body/craft list, and `P` frame-time profiler
- Selection cards with mass, orbital information, and Wikipedia links
- Depth-aware solar occultation and close-view major-moon rendering
- Planet and spacecraft trajectory hit testing

## Repository layout

| Path | Purpose |
| --- | --- |
| `solar-system.html` | Complete application: markup, styles, data, simulation, rendering, and input |
| `data/planet-ephemerides.js` | Generated NASA/JPL Horizons planet state vectors |
| `data/spacecraft-trajectories.js` | Generated NASA/JPL Horizons trajectory samples |
| `data/comet-ephemerides.js` | Generated NASA/JPL Horizons comet state vectors |
| `docs/DESIGN.md` | Architecture, data model, numerical assumptions, and design decisions |
| `docs/ROADMAP.md` | Progress tracker and prioritized improvement backlog |
| `src/trajectory-math.js` | Shared interpolation and two-body propagation module |
| `src/mission-timeline.js` | Shared mission navigation helpers |
| `src/frame-profiler.js` | Rolling frame-time statistics for view presets |
| `src/view-transform.js` | Camera rotation and view-space transformation helpers |
| `src/panel-drag.js` | Pointer-driven movable panel behavior and viewport clamping |
| `src/moon-system.js` | Parent-relative major-moon orbits and visibility thresholds |
| `src/nbody-simulation.js` | Barycentric Newtonian integration and checkpoint replay |
| `tests/trajectory-tests.js` | Dependency-free numerical regression suite |
| `tests/panel-drag-tests.js` | Movable-panel interaction and clamping tests |
| `tests/moon-system-tests.js` | Moon orbit, visibility, and focus-zoom tests |
| `tests/nbody-tests.js` | Conservation, continuity, and deterministic replay tests |
| `tools/fetch-trajectories.py` | Reproducible Horizons data generator |

## Current limitations

- Historical dates use ephemerides rather than recomputing past gravitational
  interactions.
- Historical spacecraft positions and flybys use bundled NASA/JPL Horizons
  vectors through the date recorded in the generated data file.
- Planet, Pluto, and Charon markers use matching NASA/JPL Horizons state vectors
  from 1970 through 2035 so they align with historical launches and flybys.
- Comet paths use Horizons state vectors from 1950 through 2080.
- Dates beyond the bundled spacecraft vectors are propagated from the final JPL
  position and velocity under solar gravity only until the common N-body
  cutover epoch.
- Future gravity is Newtonian. Relativistic effects, close-encounter
  regularization, collisions, maneuvers, and comet outgassing are not modeled.
- Major moons use approximate parent-relative Keplerian display orbits and are
  revealed only in close planetary views. They are not separate N-body masses;
  Earth's gravitational parameter continues to include the Moon.
- Planet and spacecraft data is embedded in the application.
- Dynamic body positions and traveled trails are rendered every animation frame,
  except that off-screen heliocentric paths are suppressed in close moon views.
- Interaction and visual regression tests are not yet automated.
- The interface has limited keyboard and screen-reader support.

## Hybrid gravity model

Historical dates use bundled JPL ephemerides. At
`2026-08-12 00:00:00 UTC`, JPL-backed position and velocity vectors initialize
a barycentric Newtonian simulation. The Sun, planets, Pluto, and Charon
interact pairwise; spacecraft and comets are massless test particles. A
fixed-step velocity-Verlet integrator and eight-day checkpoints provide
deterministic future date navigation. Long jumps are prepared in bounded chunks
so the browser can repaint progress between them. Relativistic effects and
compact-object close encounters remain deferred. The browser UI currently caps
future navigation at 2100 to bound integration time and checkpoint memory.

## Contributing

Before changing orbital calculations, document the source, epoch, units, and
expected accuracy in `docs/DESIGN.md`. Track planned and completed work in
`docs/ROADMAP.md`, keeping tasks small enough to validate independently.

## Test

Run:

```text
npm test
```

The dependency-free Node test suite validates source-sample interpolation,
ephemeris endpoint continuity, long-range propagation, N-body conservation and
deterministic replay, launch proximity, flyby alignment, and mission navigation
helpers.

## Refresh trajectory data

Run:

```text
python tools/fetch-trajectories.py
```

The generator downloads heliocentric Ecliptic J2000 vectors from NASA/JPL
Horizons and rewrites both generated files under `data/`. Internet access is
required only when regenerating the data, not when running the application.
