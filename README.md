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
- Incrementally sampled future trails that avoid blocking close-flyby frames
- Hierarchical major-moon dynamics with external and mutual perturbations
- Selectable L1-L5 markers and co-rotating Sun-planet or planet-moon views
- Surface-observer eclipse, planetary transit, and one-degree planet-conjunction
  search with direct Observatory Mode navigation
- 8,870-star Hipparcos celestial sphere with catalog positions, Johnson V
  magnitudes, B−V colors, and a cached offscreen rendering backdrop
- Surface observatory mode for solid planets and moons with location presets,
  configurable coordinates, atmospheric daylight, horizon coordinates, and
  true-angular-size sky objects, optional orbit/trajectory guides, scaled time,
  and local civil-time display
- Interactive insertion of configurable stars, black holes, planets, and comets
  with 0–180° orbital inclination
- Physical-scale close rendering and Observatory visibility for custom bodies,
  with appearance-specific stars, black holes, planets, and comets
- Lazy-loaded 1024px planetary surface textures with axial orientation,
  rotation, sphere projection, illumination, and flat-color fallback
- Swept-contact detection for custom bodies, impact warnings, and momentum-conserving custom-body merging
- Animated simulation clock with adjustable speed and direction
- Versioned shareable scenario links that restore the date, playback, camera,
  visible object groups, selection, and Observatory location/view
- First-run guided tutorial with responsive pointers, feature explanations,
  completion persistence, and an always-available restart button
- Mission timeline with launch/flyby jumps and UTC date navigation
- Patched-conic mission planner with Earth launch windows, optional planetary
  gravity assists, ranked Lambert routes, maneuver/encounter details, animated
  trajectory previews, local saves, and shareable active plans
- Automatic zoom/focus/follow from the body list and spacecraft mission events
- Rolling average and p95 frame-time profiler for each view preset
- Pointer orbit rotation, right-button drag or two-finger pan, pinch/wheel zoom,
  movable panels, and view presets
- Panel shortcuts: `W` mission planner, `M` mission timeline, `L` body/craft
  list, `T` time/view
  controls, and `P` frame-time profiler
- Observatory shortcut: `O`
- Selection cards with physical mass, planetary-body radius, orbital
  information, and Wikipedia links
- Sun-directed sphere lighting, depth-aware occultation, and shadowed planetary rings
- Planet and spacecraft trajectory hit testing

## Repository layout

| Path | Purpose |
| --- | --- |
| `solar-system.html` | Complete application: markup, styles, data, simulation, rendering, and input |
| `data/planet-ephemerides.js` | Generated NASA/JPL Horizons planet state vectors |
| `data/planet-cutoff-states.js` | Exact NASA/JPL Horizons future-integration seed vectors |
| `data/moon-cutoff-states.js` | Generated NASA/JPL Horizons major-moon cutoff vectors |
| `data/spacecraft-trajectories.js` | Generated NASA/JPL Horizons trajectory samples |
| `data/comet-ephemerides.js` | Generated NASA/JPL Horizons comet state vectors |
| `data/hipparcos-stars.js` | Generated naked-eye Hipparcos star catalog from CDS VizieR |
| `docs/DESIGN.md` | Architecture, data model, numerical assumptions, and design decisions |
| `docs/ROADMAP.md` | Progress tracker and prioritized improvement backlog |
| `src/trajectory-math.js` | Shared interpolation and two-body propagation module |
| `src/mission-timeline.js` | Shared mission navigation helpers |
| `src/mission-planner.js` | Lambert solver, patched-conic route scoring, window search, and plan persistence |
| `src/mission-planner-ui.js` | Mission-planner workflow, route comparison, maneuvers, saves, and previews |
| `src/frame-profiler.js` | Rolling frame-time statistics for view presets |
| `src/view-transform.js` | Camera rotation and view-space transformation helpers |
| `src/star-field.js` | Deterministic celestial-sphere generation and camera projection |
| `src/observatory-mode.js` | Surface frames, horizontal coordinates, sky projection, and daylight calculations |
| `src/scenario-state.js` | Validated versioned encoding for shareable URL scenarios |
| `src/guided-tutorial.js` | First-run persistence and responsive guided walkthrough UI |
| `src/panel-drag.js` | Pointer-driven movable panel behavior and viewport clamping |
| `src/body-rendering.js` | Marker-to-physical-radius close-view transitions |
| `src/body-textures.js` | Lazy WebGL sphere projection and texture loading |
| `src/body-placement.js` | Inclined custom-body velocity and orbital-plane calculations |
| `src/body-lighting.js` | Lambert sphere lighting and geometric shadow tests |
| `src/moon-system.js` | Major-moon metadata and visibility thresholds |
| `src/hierarchical-moon-simulation.js` | Perturbed parent-moon hierarchy integration |
| `src/ring-system.js` | Physical ring bands and 3D equatorial-plane geometry |
| `src/lagrange-system.js` | Restricted three-body L1-L5 calculations and frame alignment |
| `src/occultation-system.js` | Apparent-disk overlap geometry and event refinement |
| `src/nbody-simulation.js` | Barycentric Newtonian integration and checkpoint replay |
| `tests/trajectory-tests.js` | Dependency-free numerical regression suite |
| `tests/mission-planner-tests.js` | Lambert, flyby, route search, sampling, and persistence tests |
| `tests/mission-planner-ui-tests.js` | Planner date, duration, and default-plan tests |
| `tests/star-field-tests.js` | Star generation and camera-relative projection tests |
| `tests/observatory-mode-tests.js` | Surface-frame and horizontal sky-projection tests |
| `tests/scenario-state-tests.js` | Shareable scenario encoding, URL, and validation tests |
| `tests/guided-tutorial-tests.js` | Tutorial completion cookie and fallback persistence tests |
| `tests/panel-drag-tests.js` | Movable-panel interaction and clamping tests |
| `tests/body-rendering-tests.js` | Physical radius scaling and transition tests |
| `tests/body-texture-tests.js` | Texture thresholds, rotation, and metadata tests |
| `tests/body-placement-tests.js` | Custom-body inclination and velocity-rotation tests |
| `tests/body-lighting-tests.js` | Illumination and planet-shadow geometry tests |
| `tests/moon-system-tests.js` | Moon orbit, visibility, and focus-zoom tests |
| `tests/hierarchical-moon-tests.js` | Moon conservation, perturbation, continuity, and stability tests |
| `tests/ring-system-tests.js` | Planetary ring dimensions and projection tests |
| `tests/lagrange-system-tests.js` | Collinear, triangular, and rotating-frame tests |
| `tests/occultation-system-tests.js` | Eclipse, transit, overlap, and event-search tests |
| `tests/nbody-tests.js` | Conservation, continuity, and deterministic replay tests |
| `tools/fetch-trajectories.py` | Reproducible Horizons data generator |
| `tools/fetch-stars.py` | Reproducible Hipparcos catalog generator |

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
- Future gravity is Newtonian. Custom-body contacts are detected using estimated
  physical radii; impacts with natural bodies are report-only and custom-body
  merges conserve mass and linear momentum. Custom massive bodies trigger
  deterministic close-encounter substeps during fast flybys. Relativistic
  effects, singularity regularization, fragmentation, maneuvers, and comet
  outgassing are not modeled.
- Historical major-moon positions are two-body continuations from authoritative
  cutoff vectors; historical planetary and mutual perturbations are not replayed.
- Future moon dynamics cover 13 major moons. Omitted satellites remain absorbed
  into each parent system's gravitational parameter.
- Eclipse, transit, and conjunction searches use the configured surface
  observer. Atmospheric refraction and formal contact times are not yet modeled.
- Planet and spacecraft data is embedded in the application.
- Star positions are Hipparcos ICRS catalog directions at epoch J1991.25;
  proper motion and long-term precession are not yet applied.
- Dynamic body positions and traveled trails are rendered every animation frame,
  except that off-screen heliocentric paths are suppressed in close moon views.
- Planned transfers use zero-revolution heliocentric patched conics. Major moons
  are treated as heliocentric encounter points rather than receiving a separate
  parent-system capture leg, and finite burns, low-thrust flight, launch-site
  geometry, navigation uncertainty, and multi-revolution Lambert solutions are
  not modeled.
- Custom bodies can be local mission targets, but their simulation branches are
  not portable; plans that reference them can be saved locally but cannot be
  included in a shareable scenario link.
- Interaction and visual regression tests are not yet automated.
- The interface has limited keyboard and screen-reader support.

## Hybrid gravity model

Historical dates use bundled JPL ephemerides. At
`2026-08-12 00:00:00 UTC`, JPL-backed position and velocity vectors initialize
from exact cutoff samples rather than sparse-ephemeris interpolation. Planetary
systems are represented globally
by their system barycenters. A nested 0.05-day moon integrator combines exact
parent-moon Kepler drift with external tidal, mutual-moon, and parent-recoil
kicks. Spacecraft and comets remain massless test particles. Checkpoints provide
deterministic future navigation, and custom massive bodies perturb both global
and moon-system branches. Long jumps are prepared in bounded chunks so the
browser can repaint progress between them. Adaptive substeps resolve
Newtonian custom-body flybys, but relativistic compact-object encounters
remain deferred. The browser UI currently caps future navigation at 2100 to
bound integration time and checkpoint memory.

## Contributing

Before changing orbital calculations, document the source, epoch, units, and
expected accuracy in `docs/DESIGN.md`. Track planned and completed work in
`docs/ROADMAP.md`, keeping tasks small enough to validate independently.
When adding user-configurable state, decide whether it should survive in a
shared scenario link. If so, update scenario capture, validation, restoration,
version compatibility, and `tests/scenario-state-tests.js` together.
When adding a major user-facing feature or changing an existing workflow,
update the guided tutorial steps and instructions in the same change. The
tutorial must always describe the current interface and its primary features.

## Test

Run:

```text
npm test
```

The dependency-free Node test suite validates source-sample interpolation,
ephemeris endpoint continuity, long-range propagation, N-body conservation and
deterministic replay, hierarchical moon continuity and stability, launch
proximity, flyby alignment, and mission navigation helpers.

## Refresh trajectory data

Run:

```text
python tools/fetch-trajectories.py
```

The generator downloads heliocentric Ecliptic J2000 vectors from NASA/JPL
Horizons and rewrites both generated files under `data/`. Internet access is
required only when regenerating the data, not when running the application.
