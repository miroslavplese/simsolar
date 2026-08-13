# Design

## Product goal

Provide an approachable, interactive overview of solar-system motion while
remaining easy to run as a single static page. The visualization favors clear
relative motion and exploration over mission-grade ephemeris accuracy.

## Architecture

The browser application remains statically runnable. Pure numerical and mission
navigation logic is shared through small UMD modules that also load directly in
Node for regression testing.

1. **Document and styling** - canvas surfaces, controls, legend, and detail card.
2. **Orbital data** - static planet and spacecraft element records.
3. **Simulation** - clock state, sampled ephemeris interpolation, Kepler
   solvers, orbital position, and speed. Shared trajectory calculations live in
   `src/trajectory-math.js`.
4. **Rendering** - projection, orbit paths, bodies, labels, and star field.
5. **Interaction** - pointer hit testing, pan, pinch/wheel zoom, selection, and
   playback controls. Mission navigation helpers live in
   `src/mission-timeline.js`.

This arrangement keeps deployment trivial while allowing the correctness-
critical calculations to be tested without a browser.

## Coordinate and time model

- Distances are represented in astronomical units (AU).
- Dates are represented as days relative to J2000:
  `2000-01-01 12:00:00 UTC`.
- Angles in data records are degrees and are converted to radians for
  calculations.
- Planet mean motion is derived as `360 / period` in degrees per day.
- Positions are calculated in heliocentric ecliptic coordinates.
- A fixed tilt projects 3D coordinates onto the 2D canvas.
- Planet radii and marker sizes are exaggerated for visibility.

## Orbit calculation

`bodyPosition` propagates mean anomaly from each object's epoch and chooses an
elliptical or hyperbolic Kepler solver based on eccentricity.

- Elliptical objects use Newton iteration on `E - e sin(E) = M`.
- Hyperbolic objects use Newton iteration on `e sinh(H) - H = M`.
- Orbital speed uses the vis-viva equation with solar gravitational parameter.
- Orbit paths sample true anomaly into line segments for canvas rendering and
  hit testing.

Historical spacecraft positions use bundled NASA/JPL Horizons heliocentric
vectors in the Ecliptic J2000 frame. Base samples are supplemented with daily
samples around planetary encounters so gravity-assist turns remain visible.
Time-aware cubic Hermite interpolation uses the position and velocity state at
each sample to produce smooth positions and paths without drawing visible
straight chords between sparse deep-space samples.

Before the first available post-launch vector, a spacecraft is not rendered.
After the last bundled vector, universal-variable two-body propagation advances
the final JPL position and velocity under solar gravity. The propagated segment
starts at the exact ephemeris endpoint, so the marker remains attached to its
path. Adaptive display sampling is capped to control rendering cost. This
continuation excludes later planetary perturbations and maneuvers.

`tools/fetch-trajectories.py` regenerates the browser-ready data file. Runtime
network access is intentionally avoided so direct `file://` execution remains
supported.

Planet markers use state vectors from the same Horizons frame and center from
1970 through 2035. Daily samples are added around launches and flybys, ensuring
the spacecraft and encountered planet are derived from the same reference data.
The analytic planet ellipses remain as uncluttered visual orbit guides.

Comet markers and paths use Horizons state vectors from 1950 through 2080.
Velocity-aware interpolation smooths the sampled paths, while the rendered tail
points away from the projected Sun and grows visually near perihelion. Tail
length is illustrative rather than a physical coma or dust-tail simulation.
Long paths use an adaptive point budget while retaining the original dense
perihelion samples.

## Rendering lifecycle

The animation loop:

1. Advances simulated time when playback is active.
2. Computes positions for all visible bodies.
3. Reuses cached world-space and projected orbit geometry.
4. Redraws the static orbit layer only when the camera, visibility, or
   highlighting changes.
5. Draws dynamic spacecraft trails, the Sun, markers, labels, and selection
   state.
6. Updates the date and selected-object card.

The star field is rendered to a separate canvas only on resize. Full orbit paths
use a second cached canvas, while the dynamic scene is redrawn with
`requestAnimationFrame`.

## Interaction model

- Mouse movement performs marker and trajectory hit testing.
- Pointer dragging pans the projected scene.
- Two pointers perform anchored pinch zoom.
- Wheel and buttons apply anchored zoom.
- Legend entries and canvas markers toggle selection.
- Space toggles playback; minus reverses time direction.
- View presets reset zoom and pan for inner, outer, and deep-space scales.
- Mission timeline events pause playback, select and follow the spacecraft, and
  apply a target-specific zoom.
- The UTC date input supports direct navigation independently of mission events.
- Manual panning and view presets release the follow camera.

## Design constraints

- Preserve direct browser execution without a required build step.
- Keep scientific units explicit at data and API boundaries.
- Avoid presenting approximate spacecraft positions as authoritative.
- Maintain usable mouse and touch interaction.
- Prefer deterministic calculations that can be unit tested independently.

## Decision log

Record material design decisions here so later changes retain their rationale.

| Date | Decision | Rationale |
| --- | --- | --- |
| 2026-08-12 | Keep the application dependency-free and statically runnable. | Minimizes setup and deployment cost. |
| 2026-08-12 | Treat spacecraft paths as documented approximations. | Current records are not full time-varying ephemerides. |
| 2026-08-12 | Optimize before adding more rendered objects. | Orbit reconstruction and hit testing scale with body and segment count. |
| 2026-08-12 | Cache orbit geometry and render full paths on a separate canvas. | Orbital shapes are static and should not be solved and redrawn every frame. |
| 2026-08-12 | Bundle sampled JPL Horizons spacecraft paths. | A single conic cannot reproduce launch geometry or gravity assists. |
| 2026-08-12 | Propagate beyond the ephemeris cutoff from its final state vector. | Switching to an independently fitted conic created a visible path/marker discontinuity. |
| 2026-08-12 | Use matching Horizons state vectors for planet markers. | Spacecraft flybys cannot visually align with planets propagated from a different approximate model. |
| 2026-08-12 | Add mission-event navigation and an explicit follow camera. | Accurate historical paths need direct, discoverable ways to inspect launches and encounters. |
| 2026-08-12 | Add five iconic comets from Horizons state vectors. | Comets broaden the visualization beyond planets and spacecraft while reusing the tested ephemeris pipeline. |

## Change checklist

For changes affecting simulation or data:

- Record the source and epoch of new orbital elements.
- Confirm angle, distance, time, and velocity units.
- Test representative circular, eccentric, and hyperbolic cases.
- Check behavior at inner, outer, and deep-space zoom levels.
- Check mouse, touch, and keyboard interactions.
- Update the accuracy statement if assumptions change.
