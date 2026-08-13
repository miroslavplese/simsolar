# Roadmap and Progress

Use this file as the lightweight project tracker. Move completed items to
**Completed**, add the completion date, and note any follow-up discovered during
validation.

## Current state

- **Phase:** Functional prototype
- **Deployment:** Standalone static HTML
- **Dependencies:** None
- **Automated tests:** Numerical and mission-navigation regression suite
- **Primary technical concern:** Measuring frame time and scaling interaction to
  larger object counts

## Priority 0 - Correctness and measurement

- [ ] Add deterministic tests for elliptical and hyperbolic Kepler solvers.
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
- [ ] Add a small frame-time profiler or browser performance baseline.
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

## Completed

- [x] 2026-08-12 - Added baseline project, design, and roadmap documentation.
- [x] 2026-08-12 - Added Halley, Hale-Bopp, Encke, 67P, and NEOWISE with
  generated ephemerides, paths, markers, tails, cards, and legend controls.
