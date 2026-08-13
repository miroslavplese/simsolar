# SimSolar Orrery

SimSolar is a dependency-free browser visualization of the solar system and
selected spacecraft trajectories. It uses Keplerian orbital elements, a
lightweight 3D-to-2D projection, and the Canvas 2D API.

## Run locally

Open `solar-system.html` in a modern browser. No build, package installation, or
web server is required.

## Features

- Elliptical and hyperbolic Kepler solvers
- Eight planets and six spacecraft
- Five iconic comets with JPL-derived paths and Sun-facing tails
- Animated simulation clock with adjustable speed and direction
- Mission timeline with launch/flyby jumps and UTC date navigation
- Spacecraft follow camera with event-specific automatic zoom
- Pan, wheel zoom, touch pinch zoom, and view presets
- Selection cards with orbital information
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
| `tests/trajectory-tests.js` | Dependency-free numerical regression suite |
| `tools/fetch-trajectories.py` | Reproducible Horizons data generator |

## Current limitations

- Historical spacecraft positions and flybys use bundled NASA/JPL Horizons
  vectors through the date recorded in the generated data file.
- Planet markers use matching NASA/JPL Horizons state vectors from 1970 through
  2035 so they align with historical launches and flybys.
- Comet paths use Horizons state vectors from 1950 through 2080.
- Dates beyond the bundled spacecraft vectors are propagated from the final JPL
  position and velocity under solar gravity, keeping markers connected to their
  trajectories.
- Planet and spacecraft data is embedded in the application.
- Dynamic body positions and spacecraft traveled trails are still rendered every
  animation frame.
- Interaction and visual regression tests are not yet automated.
- The interface has limited keyboard and screen-reader support.

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
ephemeris endpoint continuity, long-range propagation, energy conservation,
launch proximity, flyby alignment, and mission navigation helpers.

## Refresh trajectory data

Run:

```text
python tools/fetch-trajectories.py
```

The generator downloads heliocentric Ecliptic J2000 vectors from NASA/JPL
Horizons and rewrites both generated files under `data/`. Internet access is
required only when regenerating the data, not when running the application.
