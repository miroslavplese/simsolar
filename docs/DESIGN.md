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
5. **Interaction** - pointer hit testing, orbit rotation, pan, pinch/wheel zoom,
   selection, and playback controls. Mission navigation helpers live in
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
- Mutable yaw and tilt angles project 3D coordinates onto the 2D canvas.
- Planet and moon sizes use visibility markers at system scale, then transition
  smoothly to physical radii in sufficiently close views.

## Orbit calculation

`bodyPosition` in `src/trajectory-math.js` propagates mean anomaly from each
object's epoch and chooses an elliptical or hyperbolic Kepler solver based on
eccentricity. The shared implementation is used directly by both the browser
and Node regression tests.

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

Planet, Pluto, and Charon markers use state vectors from the same Horizons frame
and center from 1970 through 2035. Daily samples are added around launches and
flybys, ensuring the spacecraft and encountered body are derived from the same
reference data. The analytic heliocentric ellipses remain as uncluttered visual
orbit guides. Charon's marker is separated from Pluto by at least 16 screen
pixels so both remain selectable; this display offset is explicitly identified
as an exaggeration in Charon's detail card.

`src/moon-system.js` adds the Moon, Phobos, Deimos, Io, Europa, Ganymede,
Callisto, Rhea, Titan, Iapetus, Titania, Oberon, and Triton. A moon system is
rendered only when its outer orbit spans at least 50 screen pixels and its
parent is near the viewport. Selecting a parent from the body list applies a
close-view zoom that reveals its moons. Moon orbits, markers, selection cards,
masses, and Wikipedia links then behave like the other visible bodies.

`data/moon-cutoff-states.js` stores heliocentric Ecliptic J2000 position and
velocity vectors from NASA/JPL Horizons at `2026-08-12 00:00:00 UTC`.
Before that boundary, each moon is propagated backward from its cutoff vector
as a parent-relative two-body orbit, preserving cutoff continuity without
claiming a complete historical perturbation solution.

`data/planet-cutoff-states.js` supplies exact Horizons vectors at the same
boundary for every globally integrated planet. Sparse display ephemerides are
not differentiated to initialize dynamics because fast inner planets can incur
material velocity error between samples.

`src/ring-system.js` defines physical ring bands for Jupiter, Saturn, Uranus,
and Neptune. Inner and outer radii are stored in kilometers and projected in
each planet's approximate equatorial plane. Rings appear with the
physical-radius sphere rather than its wide-view marker. Their rear halves
render before the planet sphere and front halves afterward, preserving sphere
occlusion while keeping ring and moon scales consistent. Ring brightness follows solar
incidence on the ring plane. Each segment is tested against the parent sphere
along the direction to the Sun, producing a geometric planet-shadow wedge.

Comet markers and paths use Horizons state vectors from 1950 through 2080.
Velocity-aware interpolation smooths the sampled paths, while the rendered tail
points away from the projected Sun and grows visually near perihelion. Tail
length is illustrative rather than a physical coma or dust-tail simulation.
Long paths use an adaptive point budget while retaining the original dense
perihelion samples.

## Gravity model

The runtime uses a hybrid historical/future model:

- Before `2026-08-12 00:00:00 UTC`, positions come from bundled Horizons
  vectors, with the existing solar-only continuation filling short spacecraft
  gaps before the common cutover.
- At the cutover, heliocentric Ecliptic J2000 states are shifted into a
  barycentric frame using each massive body's gravitational parameter.
- The Sun, eight planets, Pluto, and Charon then interact through pairwise
  Newtonian gravity.
- Earth through Neptune enter the global integration at their system
  barycenters rather than their physical planet centers.
- Spacecraft and comets feel every massive body's gravity but remain massless
  test particles, so they do not perturb the massive system.
- Rendering converts integrated states back to Sun-relative coordinates,
  preserving the visualization's heliocentric presentation.

`src/nbody-simulation.js` uses velocity Verlet with a 0.25-day base
massive-body timestep. Pairs involving a custom massive body select smaller,
deterministic substeps from predicted closest approach, crossing time, and local
dynamical time. Particles advance alongside those massive-body substeps instead
of seeing one linearized flyby. Their normal maximum step is 0.03125 day, and
Parker Solar Probe selects still smaller deterministic steps near massive
bodies. Eight-day
checkpoints make future date queries deterministic and bound replay work;
queries between main integration steps run a deterministic partial step rather
than discarding particle substep accuracy. Spacecraft and comet future trails
are sampled from the same integrated solution as their markers.

`src/hierarchical-moon-simulation.js` advances the six modeled moon systems
independently at a 0.05-day step. Each split step applies half of the
perturbation kick, performs an exact universal-variable parent-moon Kepler
drift, then applies the final half kick. Perturbations include the differential
external acceleration between each planet and moon, mutual forces between
modeled moons, and the indirect acceleration caused by parent recoil. Global
massive-body positions are linearly interpolated across one-day intervals from
a dedicated massive-only sampler, avoiding repeated spacecraft integration.
One-day moon checkpoints support deterministic replay.

The global body's GM is the DE440 planetary-system GM. The hierarchy subtracts
the current JPL GMs of explicitly modeled moons to obtain a residual parent GM;
that residual includes the physical planet and omitted satellites. Parent
offsets are reconstructed from the local system barycenter, so rendered planet
centers and moon states remain continuous at the cutoff. Custom massive-body
insertion creates matching global and moon hierarchy branches, allowing the new
body's tidal gravity to affect moons without double-counting their mass.

Long future jumps extend checkpoints in 180-day chunks and yield to the browser
between chunks so progress remains visible. Navigation is capped at 2100 to
bound total work and checkpoint memory; moving integration to a Web Worker
remains the next performance phase.

Gravitational parameters are stored in km³/s² from NASA/JPL Solar System
Dynamics values and converted once to AU³/day². DE440 system parameters are
used globally, while current satellite-solution parameters are used locally.
Spacecraft whose last bundled sample precedes the cutover are advanced to it
with the prior solar-only universal-variable propagator, preserving positional
continuity.
Daily Pluto and Charon samples around the cutover prevent their 6.387-day binary
orbit from being aliased by the normal sparse outer-system sampling cadence.

## Lagrange points and rotating frames

`src/lagrange-system.js` calculates L1 through L5 for the selected Sun-planet,
Sun-custom-body, Pluto-Charon, or planet-moon pair. Collinear points solve the
dimensionless circular restricted three-body equilibrium equation by bracketed
bisection. L4 and L5 use equilateral geometry in the instantaneous orbital plane.
The rendered positions use each body's current state and GM, so they update with
ephemeris and integrated motion.

These markers are instantaneous circular-model estimates, not propagated
objects or guaranteed stability regions. Their detail cards state this
approximation. L-point mode auto-fits the selected pair, provides selectable
legend entries, and draws the primary-secondary and triangular geometry at true
scale.

Co-rotating mode dynamically aligns the selected primary-secondary axis while
retaining user-controlled tilt and yaw offset. Inertial orbit paths and traveled
trails are suppressed in this mode because continuously reprojecting them is
expensive and their inertial geometry is misleading in a rotating frame.

## Eclipses and transits

`src/occultation-system.js` compares the apparent angular disks of the Sun and
an intervening body from a selected planet or moon center. Exact circle-overlap
geometry reports maximum solar-disk coverage and classifies total, annular,
partial, or contained-disk events. Local parent/moon and sibling-moon events are
reported as solar eclipses; nonlocal inner bodies are reported as transits or
solar occultations.

The browser searches each eligible occulter with a bounded coarse scan, detects
local minima in apparent limb clearance, and refines each candidate with a
golden-section minimum search. Local scan cadence uses the shorter of the
observer and occulter periods so fast moon observers such as Phobos are not
under-sampled. Searches yield periodically, are cancellable by observer/type
changes or closing the panel, and cover at most 20 years.

Planetary transit searches prefer bundled Horizons ephemerides where available
and use the massive-only future sampler afterward. Local moon eclipses use the
full reconstructed physical parent and hierarchical moon states. The event view
shows an apparent-Sun inset at true angular-radius ratio; it does not yet compute
surface shadow tracks, atmospheric refraction, observer topography, or formal
first-through-fourth contact times.

The body detail card reports physical mass in kilograms for massive bodies.
Spacecraft and comets display `0 kg (test particle)` to distinguish their
modeled gravitational mass from their nonzero physical mass.
Built-in bodies link to their corresponding English Wikipedia article. Custom
bodies link to the general article for their selected body type.

## User-introduced bodies

The body insertion panel provides star, black-hole, planet, and comet presets
with editable names and masses. Placement uses two direct-manipulation steps on
the canvas: the first tap selects a position on the ecliptic plane, and the
second pointer drag sets an in-plane velocity vector whose arrow length maps to
speed. Live AU coordinates, direction, and km/s are shown before insertion.

Insertion creates a new deterministic simulation branch at the current date.
The new body's heliocentric position and velocity are converted to the active
barycentric state, its mass becomes a Newtonian gravitational parameter, and
later checkpoints and trail caches are invalidated. Rewinding before the
insertion date selects the prior branch; inserting after a rewind discards
branches introduced later. The first version intentionally limits placement
and velocity to the ecliptic plane.

Each forward playback interval checks swept physical spheres for every pair
involving a custom body. Natural radii come from the body catalog; custom radii
use type-specific mass estimates (stellar mass-radius scaling, Schwarzschild
radius, constant Earth density, or comet density). The impact monitor also
provides a constant-velocity warning up to 365 days ahead. Contact pauses at the
first crossing. Natural-body contacts remain report-only; custom-custom
contacts may create a volume-conserving, momentum-conserving remnant on matching
global and moon branches.

Relativistic corrections, fragmentation, maneuvers, comet outgassing, and
singularity regularization remain outside this implementation. Adaptive
substepping improves fast Newtonian flybys but does not make extreme
black-hole encounters physically relativistic. The synchronous reference
integrator is intentionally validated before moving equivalent work to a Web
Worker.

## Rendering lifecycle

The animation loop:

1. Advances simulated time when playback is active.
2. Selects ephemeris interpolation or checkpointed N-body integration based on
   the current date.
3. Computes positions for all visible bodies.
4. Reuses cached world-space and projected orbit geometry.
5. Redraws the static orbit layer only when the camera, visibility, or
   highlighting changes.
6. Draws dynamic spacecraft trails, the Sun, markers, labels, and selection
   state.
7. Updates the date, active gravity model, and selected-object card.

Body markers are depth sorted. Markers behind the Sun are clipped against its
opaque disk and fully occulted markers are excluded from pointer hit testing.
`src/body-rendering.js` converts physical radii from kilometers through the same
AU-to-pixel scale used by moon orbits. Wide views retain minimum-size markers;
those marker radii remain constant in screen space while zooming and use solid,
high-contrast colors. Once a moon system reaches 50 screen pixels, its parent
and moons switch to true relative radii before the moons appear. Bodies without
moon systems switch once their physical disk becomes large enough on screen.

`src/body-lighting.js` transforms each body's current direction to the Sun into
camera space. In close physical-radius views, cached raster sprites apply
ambient-plus-Lambert illumination to the visible sphere surface, so the bright
limb and terminator respond to both orbital position and camera rotation. Wide
view markers remain unshaded. Ring shadows use parallel solar rays; the Sun's
finite angular size and resulting narrow penumbra are not modeled.

`src/star-field.js` generates deterministic directions on a celestial sphere.
The separate sky canvas uses a 90-degree perspective projection and redraws only
when camera yaw, tilt, or viewport dimensions change. Stars therefore remain
fixed in inertial space while moving correctly under pointer rotation and
co-rotating reference frames; zoom and pan do not alter the distant background.

Full orbit paths use a second cached canvas, while the dynamic scene is redrawn
with `requestAnimationFrame`. At moon-system zoom levels, heliocentric orbit
paths and traveled spacecraft/comet/custom-body trails are suppressed because
they are far outside the viewport and rebuilding their extreme projected
geometry while following a planet causes unnecessary frame-time spikes.

An optional in-app profiler records frame intervals in a rolling 300-frame
window for the inner, outer, and deep-space presets. It reports average and
95th-percentile frame time plus derived frames per second without adding a
runtime dependency.

## Interaction model

- Mouse movement performs marker and trajectory hit testing.
- One-pointer dragging rotates the view around the solar system.
- When an object is selected, one-pointer rotation preserves that object's
  screen position and uses it as the camera pivot; clearing selection restores
  the Sun as the rotation pivot.
- Right-button dragging pans the projected scene and suppresses the canvas
  context menu.
- Two pointers pan by midpoint movement and perform anchored pinch zoom.
- Dragging any non-interactive area of a panel repositions that panel while
  preserving normal behavior for its links, buttons, inputs, and list items.
- Mission, body/craft, and profiler panels can be closed directly and toggled
  with `M`, `L`, and `P`, respectively. Mission and profiler start hidden.
- Wheel and buttons apply anchored zoom.
- Legend entries and canvas markers toggle selection.
- Close-view moon markers receive an expanded pointer target, and their dynamic
  parent-relative orbit polylines participate in trajectory hit testing.
- Selecting a body from the body/craft list applies a distance-aware zoom,
  centers the camera, and follows that body.
- Selecting a spacecraft from the legend or canvas synchronizes the mission
  selector, event list, and follow control to that spacecraft. The mission
  panel opens while a spacecraft is selected and closes when it is unselected.
- Space toggles playback. Minus reverses time direction.
- The view preset selector resets rotation, zoom, and pan for inner, outer, and
  deep-space scales.
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
| 2026-08-13 | Add Pluto and Charon using matching Horizons vectors. | New Horizons' Pluto-system encounter should align with both bodies while keeping Charon individually selectable. |
| 2026-08-13 | Use a future-only hybrid N-body model. | Preserve authoritative history while allowing hypothetical massive bodies to affect future motion deterministically. |
| 2026-08-13 | Defer relativistic compact-object physics. | Newtonian gravity is sufficient for the first interactive implementation; close black-hole encounters need specialized integration. |
| 2026-08-13 | Cut over to N-body gravity at 2026-08-12 UTC. | All massive bodies and test particles have a reproducible JPL-backed or continuity-preserving state at this shared boundary. |
| 2026-08-13 | Use velocity Verlet at a fixed 0.25-day step. | A symplectic method provides bounded long-term energy error and deterministic replay at interactive solar-system scale. |
| 2026-08-14 | Integrate major moons in nested planetary hierarchies. | Exact local Kepler drift resolves fast moons without forcing the whole solar system onto a Phobos-scale timestep. |
| 2026-08-14 | Keep planetary-system GMs global and explicit moon GMs local. | Barycenter reconstruction captures parent recoil while preventing moon masses from being counted twice. |
| 2026-08-14 | Derive L1-L5 from the instantaneous selected two-body state. | The same implementation supports historical ephemerides, future integration, moons, and user-created massive bodies without pretending the points are independently propagated objects. |
| 2026-08-14 | Search occultations using apparent angular-disk overlap. | A center-of-body observer model consistently distinguishes total, annular, partial, and transit geometry while remaining usable for every modeled planet and moon. |
| 2026-08-14 | Seed future gravity from exact cutoff vectors. | Differentiating sparse display interpolation produced unacceptable inner-planet velocity and event-timing error. |
| 2026-08-14 | Store stars as inertial unit directions rather than screen pixels. | A celestial sphere makes the background respond naturally to every camera and reference-frame rotation without coupling it to scene zoom or pan. |
| 2026-08-14 | Detect only collisions involving custom bodies and merge only custom-custom pairs. | Natural major-body collisions are irrelevant on the supported time horizon, while restricted merging avoids unsafe moon-parent and Sun branch rewrites. |
| 2026-08-16 | Adapt the massive timestep only for pairs involving custom bodies. | Fast stellar flybys need close-approach resolution, while leaving the natural system on its established base step avoids a permanent performance penalty. |

## Change checklist

For changes affecting simulation or data:

- Record the source and epoch of new orbital elements.
- Confirm angle, distance, time, and velocity units.
- Test representative circular, eccentric, and hyperbolic cases.
- Check behavior at inner, outer, and deep-space zoom levels.
- Check mouse, touch, and keyboard interactions.
- Update the accuracy statement if assumptions change.
