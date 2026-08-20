# Roadmap and Progress

Use this file as the lightweight project tracker. Move completed items to
**Completed**, add the completion date, and note any follow-up discovered during
validation.

## Current state

- **Phase:** Functional prototype with synchronous hybrid gravity
- **Deployment:** Standalone static HTML
- **Dependencies:** None
- **Automated tests:** Numerical and mission-navigation regression suite
- **Primary technical concern:** Measuring frame time and scaling interaction to
  larger object counts

## Priority 0 - Correctness and measurement

- [x] 2026-08-13 - Extract orbital calculations and add deterministic tests for
  elliptical and hyperbolic Kepler solvers.
  - Validate residual error after solving.
  - Cover eccentricities near zero, near one, and greater than one.
- [x] 2026-08-12 - Add ephemeris interpolation, propagation, launch, flyby, and
  mission-navigation regression tests.
- [ ] Audit every spacecraft source, epoch, calibration point, and note.
- [x] 2026-08-12 - Add reproducible NASA/JPL Horizons trajectory generation.
- [x] 2026-08-12 - Render sampled launch-to-present spacecraft paths and
  planetary flyby markers.
- [x] 2026-08-12 - Smooth sparse ephemeris samples with time-aware cubic
  interpolation while preserving dense flyby samples.
- [x] 2026-08-12 - Anchor post-ephemeris propagation to the final JPL state so
  spacecraft markers remain connected to their paths.
- [x] 2026-08-13 - Add a rolling in-app frame-time profiler for each view preset.
  - Record average and 95th-percentile frame time at each view preset.

## Priority 1 - Rendering performance

- [x] 2026-08-12 - Cache orbit geometry in world coordinates.
  - Recompute only when orbital elements or sampling quality change.
  - Apply projection during rendering rather than solving the orbit again.
- [x] 2026-08-12 - Separate static and dynamic rendering layers.
  - Redraw orbit paths only after zoom, pan, resize, visibility, or highlight
    changes.
  - Continue drawing moving bodies on the animation canvas.
- [x] 2026-08-12 - Avoid per-frame date DOM writes when values have not changed.
- [x] 2026-08-12 - Add projected trajectory bounds before segment hit testing.
- [x] 2026-08-18 - Replace synchronous adaptive future-trail rebuilding with
  bounded incremental sampling of live integrated states during playback.
- [x] 2026-08-18 - Add a monotonic full-state integration cursor so forward
  playback in the global and nested moon simulators does not repeatedly replay
  the current checkpoint interval.
- [ ] Replace remaining trajectory segment scans with spatial indexing or
  marker-first selection at large scales.
- [ ] Reduce path sample counts based on projected size while preserving visual
  curvature.

**Target:** Maintain 60 frames per second on a typical laptop and 30 frames per
second on a mid-range mobile device in the deep-space view.

## Priority 2 - Maintainability

- [ ] Split CSS, orbital data, simulation math, rendering, and interaction into
  separate files or ES modules.
- [ ] Introduce explicit object schemas and validation for orbital records.
- [ ] Centralize repeated rotation and orbital-plane transformation logic.
- [ ] Replace repeated DOM lookups with cached element references.
- [ ] Add formatting and linting appropriate for browser JavaScript.

Keep a no-build launch option even if an optional development toolchain is
introduced.

## Priority 3 - User experience and accessibility

- [ ] Add visible keyboard focus and semantic buttons.
- [ ] Add keyboard controls for zoom, date stepping, presets, and selection.
- [ ] Provide accessible labels and a text alternative for selected-body data.
- [ ] Respect `prefers-reduced-motion`.
- [ ] Persist user preferences such as speed and spacecraft visibility.
- [ ] Improve small-screen layout and prevent controls from obscuring content.

## Priority 4 - Scientific capability

- [ ] Display the data epoch and accuracy class in each detail card.
- [x] 2026-08-12 - Support bundled authoritative spacecraft ephemeris data.
- [x] 2026-08-12 - Use matching authoritative planetary ephemerides from the
  same frame and center as spacecraft trajectories.
- [ ] Add configurable reference planes and camera orientation.
- [ ] Show uncertainty or approximation indicators for spacecraft.
- [x] 2026-08-12 - Add launch/flyby timeline navigation, UTC date input,
  event-specific zoom, and spacecraft follow mode.
- [x] 2026-08-13 - Add a future-only Newtonian N-body simulation.
  - Define a fixed JPL-backed cutover epoch and barycentric initial state.
  - Add masses and pairwise acceleration for planets, Pluto, and Charon.
  - Integrate massive bodies with a deterministic symplectic timestep.
  - Treat spacecraft and comets as massless test particles initially.
  - Cache checkpoints so future date jumps do not restart from the epoch.
  - Keep historical navigation on bundled ephemerides.
  - Validate continuity, energy and momentum drift, and deterministic replay.
- [ ] Move long-running future integration into a Web Worker after the
  synchronous reference implementation is validated.
  - Cooperative main-thread preparation currently yields between 180-day
    integration chunks and reports progress.
  - Remove or extend the temporary 2100 navigation cap once integration no
    longer blocks the animation thread.
- [x] 2026-08-13 - Add interactive ecliptic-plane insertion for configurable
  stars, black holes, planets, and comets at the current future date.
- [x] 2026-08-19 - Add 0–180 degree custom-body orbital inclination by treating
  the ecliptic placement point as an orbital node and rotating the drafted
  velocity into the selected plane.
- [ ] Extend custom-body position controls beyond an ecliptic-plane orbital node
  to unrestricted 3D placement.
- [x] 2026-08-16 - Add deterministic adaptive substeps for fast Newtonian
  encounters involving custom massive bodies.
- [ ] Investigate relativistic corrections and singularity regularization as a
  later, separate capability.
- [x] 2026-08-14 - Add custom-body impact prediction and physical contact
  detection, automatic pause/report, and optional momentum-conserving merging.
- [ ] Consider deterministic debris generation with explicit performance limits
  only if fragmentation becomes a useful interactive scenario.

## Future feature concepts

- [x] 2026-08-19 - Add a patched-conic mission planner with Earth departure
  windows, planetary gravity assists, ranked Lambert routes, encounter nodes,
  trajectory previews, local named saves, and shareable active plans.
- [x] 2026-08-19 - Add finite-radius encounter geometry, parking-orbit injection
  burns, modeled gravity-assist turn angles and powered corrections, plus
  optional destination orbit insertion.
- [ ] Extend the mission planner with finite-burn and low-thrust maneuver editing,
  multi-revolution Lambert branches, and parent-centric terminal moon targeting.
- [x] 2026-08-18 - Add versioned shareable URL scenarios that restore simulation
  time, playback, camera, object visibility, selection, follow target, and
  Observatory location/view state.
- [ ] Add a named local scenario library for saving and reopening multiple setups.
- [ ] Add a close-approach analyzer with encounter time, minimum distance, and
  relative velocity.
- [ ] Add guided scenarios and tours for missions, eclipses, asteroid deflection,
  and unusual gravitational encounters.
- [ ] Add an optional catalog of notable asteroids, near-Earth objects, and
  historical comets.
- [ ] Add selectable background stars in Solar System and Observatory views.
  - Build a spatial hit-test index from projected stars whenever the cached
    backdrop refreshes, avoiding per-frame or full-catalog click scans.
  - Extend generated Hipparcos records with names/designations, spectral type,
    parallax/distance, and constellation where authoritative data is available.
  - Show a star properties card and preserve star selection in shareable
    scenario links.
- [ ] Add a spacecraft builder with mass, propulsion, fuel, thrust, and staged
  maneuvers.
- [ ] Add a searchable event timeline for conjunctions, eclipses, perihelia,
  impacts, and close encounters.
- [ ] Add optional relativistic effects, including Mercury's perihelion
  precession and appropriate black-hole visualization.
- [ ] Package the application as an installable offline-capable Progressive Web
  App with fullscreen and home-screen support.

## Completed

- [x] 2026-08-19 - Added Spacecraft View for solved mission-planner routes with
  velocity-aligned cockpit free-look, live travel HUD, selectable flyby bodies,
  normal playback controls, and shareable view restoration.
- [x] 2026-08-18 - Added physical-scale, appearance-specific rendering for
  user-introduced stars, black holes, planets, and comets in both Solar System
  and Observatory views.
- [x] 2026-08-18 - Added a first-run guided tutorial with persistent completion,
  responsive pointers, major-feature walkthroughs, and a toolbar restart action.
- [x] 2026-08-17 - Replaced the generated random star sphere with 8,870
  Hipparcos stars through Johnson V magnitude 6.5, including catalog positions
  and B−V-derived colors.
- [x] 2026-08-18 - Moved Hipparcos rendering to a throttled offscreen backdrop
  cache keyed by viewport, camera, FOV, surface frame, and daylight.
- [x] 2026-08-17 - Added surface observatory mode for modeled solid planets and
  moons with latitude/longitude presets, drag-and-zoom sky navigation,
  atmosphere-aware daylight, true angular sizes, labels, horizon coordinates,
  and selectable visibility enhancement.
- [x] 2026-08-17 - Added DST-aware civil time for Earth city presets, scaled
  Observatory Mode time acceleration, surface-visible eclipse and transit
  navigation, and one-degree planet-conjunction search.
- [x] 2026-08-17 - Added optional projected orbit and trajectory guides to
  Observatory Mode, hidden by default.
- [x] 2026-08-17 - Moved view presets into the closable time/view dock and added
  a synchronized top-toolbar toggle.
- [x] 2026-08-17 - Enabled selected-object properties in Observatory Mode,
  disabled incompatible toolbar actions there, and reduced profiler access to
  its `P` keyboard shortcut.
- [x] 2026-08-14 - Replaced static screen-space stars with a deterministic
  celestial sphere that responds to camera and co-rotating-frame orientation.
- [x] 2026-08-14 - Added observer-based solar eclipse and transit search,
  apparent-disk classification and coverage, cancellable navigation, and event
  previews for modeled planets and moons.
- [x] 2026-08-14 - Added exact JPL planet vectors at the future cutover to avoid
  sparse-interpolation velocity error in N-body initialization.
- [x] 2026-08-14 - Added selectable L1-L5 markers, true-scale system guides,
  auto-fit navigation, and co-rotating Sun-planet and planet-moon frames.
- [x] 2026-08-14 - Initialized 13 major moons from JPL Horizons cutoff vectors
  and added hierarchical future dynamics with external tides, mutual moon
  perturbations, parent recoil, checkpoints, and custom-body branches.
- [x] 2026-08-14 - Added close-view rendering, selection, and approximate
  parent-relative display metadata for 13 major planetary moons.
- [x] 2026-08-13 - Added Pluto, Charon, and their New Horizons encounter using
  matching NASA/JPL Horizons state vectors.
- [x] 2026-08-12 - Added baseline project, design, and roadmap documentation.
- [x] 2026-08-12 - Added Halley, Hale-Bopp, Encke, 67P, and NEOWISE with
  generated ephemerides, paths, markers, tails, cards, and legend controls.
