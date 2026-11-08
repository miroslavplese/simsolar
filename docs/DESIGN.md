# Design

## Product goal

Provide an approachable, interactive overview of solar-system motion while
remaining easy to run as a single static page. The visualization favors clear
relative motion and exploration over mission-grade ephemeris accuracy.

## Architecture

The browser application remains statically runnable. Pure numerical and mission
navigation logic is shared through small UMD modules that also load directly in
Node for regression testing.

Application decomposition is gated by frozen numerical/scenario references,
functional browser tests, and fixed Windows/Chromium visual baselines. Test
instrumentation and coverage tooling remain development-only; no runtime
test hooks, bundler, or module-loading change is required. See the README's
refactor regression baseline section for the commands, tolerances, resource
budgets, platform limits, and explicit reference-update procedure.

`solar-system.html` is the markup/script-loading shell. `src/app.js` is only the
composition root: it constructs components, wires their dependencies, initializes
controls, restores the initial scenario, and starts the animation loop. It does
not implement physics, drawing, gesture handling, or feature workflows.

| Boundary | Ownership |
| --- | --- |
| `src/app/catalog.js` | Per-application body objects, stable Solar IDs, parent relationships, and read-only bundled-data references |
| `src/app/simulation.js` | Editable and Solar numerical state, integrators, snapshots, position/orbit adapters, serialization, and runtime body IDs |
| `src/app/system-transitions.js` | Detach/load/delete/restore transactions and cross-feature cleanup, cancellation, catalog refresh, and date bounds |
| `src/app/playback.js`, `animation.js` | Time/playback controls and the single frame loop, including collision and route/time limits |
| `src/app/camera.js`, `input.js`, `selection.js` | Projection/follow/zoom state, gestures/shortcuts/hit testing, and selected/hovered bodies |
| `src/rendering/` | Canvas viewport, body visibility, star/surface/orbit/ring/overlay layers, and system/observatory/cockpit scenes |
| `src/features/` | Library, body card, planner, timeline, sky events, Lagrange controls, body editing, impacts, observatory/clouds, cockpit, scenarios, tutorial, panels, and profiler |
| `src/app.css`, `src/features/*.css` | Shared page tokens/controls/mode rules and feature-specific styling, including each feature's mobile rules |

Factories expose `create(deps)` through classic-script globals and CommonJS.
Loading a component file only registers its factory; it does not bind listeners
or start work. The composition root supplies named dependencies, not a shared
mutable application-context object. Already-created dependencies are ordinary
references; lazy getters resolve forward references used by runtime callbacks.
Constructors must not dereference those forward dependencies. All instances are
created before any `initialize()` call or control-building command.

Mutable state stays in its owning closure. Exported live accessors are deliberately
limited to state used by cooperating controllers; writing an accessor alone is
not a system transition. UI workflows must use the centralized transition
commands so selection, following, async work, catalogs, and caches remain
consistent. Numerical snapshot maps and render-path caches stay private:
transitions call their owners' `clearCaches()`/`clearPaths()` commands.
Simulation sampling takes an explicit time and does not depend on the document,
camera, playback controller, or date controls. Render trail construction belongs
to the orbit layer, not the numerical adapter.

These are page-lifetime controllers, not independently remountable widgets.
`initialize()` is idempotent; static control builders run once at startup.
Rebuilt library/event rows own their transient listeners without a permanent
listener registry retaining discarded rows. Existing feature-specific worker,
date-navigation, cloud-request, and stale-result cancellation remains in place.
Animation `start()`/`stop()` owns at most one pending frame, resets elapsed-time
tracking on resume, and ignores late cancelled callbacks. Page hide stops it and
cancels pending navigation, planner, cloud, and tutorial-start work; a persisted
page show resumes the loop. Full in-place application remount/disposal is not
part of this static-page architecture.

`src/features/body-info.js` owns
the detail card's DOM references, formatting, provenance labels, reference links,
image presenter, visibility, and close listener; its responsive styles live in
`src/features/body-info.css`. `BodyInfo.create` receives the document, image/mass
catalogs, custom-body presets, integration epoch label, and a close command.
`update(body, frame)` consumes a read-only body and already-sampled position,
radius, editable/orbit-display flags, and optional two-body orbit reference.
It does not own selection, time, follow state, or simulation caches, and it
does not sample or advance the simulation. The selection, playback, camera,
and simulation components retain those responsibilities; selection/tutorial
commands route card visibility through `setVisible`.
`dispose` removes the close listener and releases image callbacks and references;
late failures from replaced or cleared images cannot overwrite a newer card.
Shared panel dragging remains outside the feature.

Browser modules continue to use classic scripts so `file://` remains supported.
The numerical UMD modules depend on `work-scheduler.js`; load it before the
planner and integrators. Node remains a development/testing tool only.

The existing pure numerical and transport modules remain the reusable calculation
layer: `trajectory-math.js`, both integrators, `mission-planner.js`,
`mission-timeline.js`, and `scenario-state.js` are not duplicated by the feature
adapters. This keeps deployment trivial and allows correctness-critical
calculations and component contracts to be tested without a browser.

### Work scheduling and playback

Both integrators expose their unchanged fixed-step operations as iterators.
Synchronous sampling consumes the iterator immediately; asynchronous preparation
consumes the same steps using an 8 ms wall-clock budget, yielding between steps
and checking cancellation before continuing. Checkpoints and replay results are
unchanged. The budget is cooperative, not a hard limit on a single close-encounter
step. Live rendering still uses synchronous sampling.

Route search similarly shares one iterator between synchronous and asynchronous
consumers. Over HTTP(S), the client gathers the exact sampled waypoint states and
body parameters, then sends only serializable data to a dedicated Worker.
File launch and browsers without Worker support use the cooperative iterator.
Workers terminate on completion, failure, or cancellation; unexpected worker
errors are shown in the planner rather than silently returning empty results.

`PlaybackClock` resets on visibility changes and ignores hidden-tab elapsed
time. Visible playback caps elapsed time at 100 ms per frame, preventing a long
stall from triggering an uncontrolled catch-up. The profiler still records the
uncapped elapsed frame duration.

### Object reference images

All 39 built-in objects have bundled Wikipedia/Wikimedia reference thumbnails.
Only the selected card assigns an image URL; per-frame card updates do not
reload it. `assets/objects/credits.json` preserves source-file URLs, authors,
credits, licenses, descriptions, and thumbnail-change notices. The generator
accepts public-domain, CC0, and CC BY/CC BY-SA imagery; NASA Commons files marked
as having no known copyright restrictions retain that exact designation.
Earth uses a public-domain NASA Apollo photograph. Schematics for custom bodies
and Lagrange points are labeled, and image failures produce an explicit notice
and schematic rather than an unrelated photograph.
Reference images link directly to their original Wikimedia source page in a
new tab. Author, license, and modification notices remain in the link tooltip
and attribution manifest, without a caption or separate credits section.

The 29 non-Solar curated bodies instead use static WebP portraits in
`assets/objects/curated/`, rendered from their generated surface materials by
`tools/render-curated-portraits.js`. `ObjectImages` uses the shared
`BodyTextures.CURATED_DEFINITIONS` allowlist and stable body IDs before consulting
the name-based photographic catalog. Renaming and shared scenarios retain the
correct portrait; arbitrary IDs cannot select asset paths. These images show
the caption "Artistic illustration" without a photographic source link.
They retain lazy loading, direct-file support, and explicit failure notices,
without requiring WebGL in the info panel or altering Solar imagery.

### Editable systems

Body dropdowns share `src/body-select.js`: native option groups identify
planetary families, indented entries show moons and deeper custom relationships,
and spacecraft/comets remain separate categories. The full active catalog
supplies parent context even when a panel excludes that parent from selection.
Each panel retains its own eligibility rules, option values, and current
selection across catalog refreshes.

The built-in Solar System is an immutable preset. The first body insertion or
deletion samples its current physical state into an editable system with stable
runtime body IDs. Subsequent edits rebuild the N-body simulator at the current
date, so removed mass no longer affects future motion. Parent deletion cascades
to dependent moons, while an empty system remains a valid paused editor state.
The first new body starts at the barycentric origin with zero velocity.

Existing built-in IDs include their original catalog index. New missions are
appended after all legacy bodies when assigning IDs, keeping old comet and
editable-system scenario references stable.

Luminous bodies are identified by metadata rather than the literal name
`Sun`. Rendering, tails, occultation availability, and custom-system mission
planning select their runtime light or gravitational source from the active
catalog. Scenario format v3 serializes the editable epoch, definitions, and
initial state while continuing to decode v1 and v2 Solar scenarios.

### Curated systems

The library contains Our Solar System, Tatooine, Alpha Centauri, TRAPPIST-1,
Kepler-16, HD 189733, Binary Duet, Kepler-442, and Compact Four.
Selector cards use nine AI-generated raster illustrations in
`assets/curated-systems/`, keyed by each system's catalog ID. Generated PNG
artwork is resized to 640 by 360 pixels and encoded as WebP for lightweight
cards; these are not rasterized SVG illustrations. The images are decorative
beside the system names and explicitly labeled as artistic, not-to-scale
impressions, not observations. All assets are bundled locally, supporting
both GitHub Pages and direct-file use without remote image dependencies.
All 29 stars and planets in the eight non-Solar systems also have matching
AI-generated 1024 by 512 equirectangular WebP surface maps in
`assets/textures/curated/`. These are artistic materials, not measured surface
conditions; the Solar preset keeps its existing observation-based textures.
Texture lookup uses the curated body's stable ID, so editing, renaming, sharing,
and restoring a system retain the material without adding URLs to scenarios.
Generated stellar maps are emissive, while planetary maps receive the existing
scene lighting and shadows. Their spins are illustrative: 609.12 hours for stars
and 24 hours for planets, with zero axial tilt.
`data/curated-systems.js` is a classic-script/Node module loaded after trajectory
math, system-model validation, and the N-body integrator. It reuses those modules
instead of maintaining separate gravity units or barycentric corrections.
The Solar entry restores the existing immutable preset with its complete
catalog and historical/future behavior; it never synthesizes Earth-mass copies
of the Solar planets.

Other entries create a paused editable system at the current simulation date,
in days since J2000. Elliptical elements are converted to position and velocity
using the shared Kepler solver; eccentricity is not discarded. Synthetic mean
anomalies are spread by the golden angle unless an explicit phase is supplied.
Stars are initialized as nested two-body groups: each outer star orbits the
inner group's barycenter and imparts recoil to the entire inner group.
Planetary initial states use either their named stellar parent or the stellar
barycenter. All non-built-in restored bodies use the existing deterministic
adaptive factor of 48, including after sharing or deletion/rebuilding. The
coarse 0.25-day checkpoint stepping alone cannot resolve the compact examples.

These are educational models, not fitted ephemerides or demonstrations that
observed resonances and long-term stability have been reproduced. Masses,
radii, and semimajor axes are rounded; orbital phases, inclinations relative to
the display plane, colors, and observing surfaces are schematic. Reference
sources and additional limitations:

| Example | Parameter context and limitations |
| --- | --- |
| TRAPPIST-1 | Rounded stellar/planet masses, radii, and orbital sizes based on [Agol et al. (2021)](https://ntrs.nasa.gov/api/citations/20210000129/downloads/Agol_2021_Planet._Sci._J._2_1_Refining.Trappist1.pdf). The resonant orbital phases and fitted eccentricity vectors are not reproduced. |
| Kepler-16 | Approximate stellar binary and planet parameters summarized in [Kepler-16b](https://en.wikipedia.org/wiki/Kepler-16b), including the roughly 106-Earth-mass planet and its low eccentricity. Display-plane orientation is synthetic. |
| HD 189733 | Rounded values from [TEPCat](https://www.astro.keele.ac.uk/jkt/tepcat/planets/HD_189733.html): stellar mass 0.719 solar masses, planet mass 329 Earth masses, and semimajor axis 0.02984 AU. The distant stellar companion, atmosphere, and weather are omitted. |
| Kepler-442 | K-star and planet parameters summarized in [TEPCat](https://www.astro.keele.ac.uk/jkt/tepcat/planets/Kepler-442b.html) and [Kepler-442b](https://en.wikipedia.org/wiki/Kepler-442b). The model's 0.3864 AU semimajor axis is derived from the measured 112.3053-day period and adopted 0.61-solar-mass star, within the quoted semimajor-axis uncertainty. The 2.36-Earth-mass planet value is an estimate, not a dynamical mass measurement; habitability is not established. |
| Alpha Centauri | Deliberately compressed stellar separations of 0.23 and 2.6 AU, circular stellar orbits, and a schematic Proxima d. Its radius and orientation are illustrative; the model is not the measured triple system and does not place Proxima d in a claimed habitable zone. |
| Tatooine, Binary Duet, Compact Four | Fictional or idealized experiments with explicitly chosen masses and orbits. Compact Four is not an observed resonant system. |

Non-Solar curated info panels label each numeric field with its provenance:
**Arbitrary** for chosen inputs or results derived from invented/compressed
setups, **Approximate** for rounded reference parameters, **Estimated** for
inferred values, and **Simulated** for calculated orbital quantities rather
than observations. Inclination is relative to the arbitrary display plane.
TRAPPIST-1's displayed eccentricities are simulated, not the fitted observed
eccentricity vectors; Kepler-442 b's assumed eccentricity is marked arbitrary.
Proxima d's illustrative radius and estimated mass are labeled separately.
Alpha Centauri cards explicitly state the 0.23/2.6 AU demo compression, which
changes the physical dynamics, not just the camera scale.
Labels are resolved from the catalog by stable body ID without adding metadata
to shared scenarios. Changed masses or radii become **Edited**, rather than
retaining reference provenance. Solar and unrelated custom-body cards do not
inherit these labels. Display precision is not a claim of measurement accuracy.

`SystemModel.orbitReference` supplies the same parent/group reference to orbit
guides, Observatory paths, and instantaneous orbital-element cards. Binary
stellar conics are scaled from the relative orbit to each star's barycentric
orbit. Hierarchical triples show local, instantaneous conics, not full predicted
three-body tracks. References use the actual moving stellar barycenter rather
than assuming it is at the coordinate origin.

Scenario v3 permits optional validated `orbitPrimaryIds` and `genericSurface`
body fields. The former preserves stellar group references through sharing and
is pruned after deletions. The latter explicitly opts curated planets into the
generic 24-hour, airless observing surface, including gas giants as schematic
viewpoints. It does not make built-in Solar gas giants solid-world observers.
Small systems can be shared with these fields; the existing 4096-character
limit still applies to larger systems. Scenario camera-pan bounds scale with
zoom because the stored offsets are screen pixels, allowing close-up planetary
views to round-trip without weakening finite-number validation.

Loading cancels pending date, mission, and event work; exits observation and
cockpit modes; clears old selections, routes, impacts, and rotating frames; and
refreshes all catalogs through the shared system-change cleanup. Feature panels
close through their existing visibility helpers, preserving the user's body-list
and time/view-dock visibility. The view is fitted and playback is paused.
Regression coverage checks all library entries, bounded energy drift and compact
orbits over 100 days, both binary guides, shared references/surfaces, Solar
restoration, stale-work cancellation, body cards, and repeated panel/profiler use.

## Coordinate and time model

- Distances are represented in astronomical units (AU).
- Dates are represented as days relative to J2000:
  `2000-01-01 12:00:00 UTC`.
- Angles in data records are degrees and are converted to radians for
  calculations.
- Planet mean motion is derived as `360 / period` in degrees per day.
- Positions are calculated in heliocentric ecliptic coordinates.
- Editing or deleting a body detaches the Solar preset at the current date into
  a new barycentric N-body epoch. The untouched preset continues using its
  historical heliocentric ephemerides, while custom systems never require a
  body named `Sun` or a fixed body at the origin.
- Mutable yaw and tilt angles project 3D coordinates onto the 2D canvas.
- Planet and moon sizes use visibility markers at system scale, then transition
  smoothly to physical radii in sufficiently close views.
- At seven pixels of rendered radius, mapped Solar and curated bodies begin
  loading a 1024 x 512 WebP map and use a small offscreen WebGL shader to project the
  equirectangular map onto a lit sphere. The same renderer is used in system and
  Observatory views. Axial tilt, approximate rotation periods, gas-giant
  flattening, and current simulation time affect the rendered disk. Earth adds
  a separately rotating translucent cloud map. Parent moons are projected into
  the shader in physical target-radius units; finite stellar, planet, and moon
  radii produce moving umbra and penumbra shading for solar and lunar eclipses.
- Texture loading is asynchronous and per-body. Until a map is ready, when
  WebGL is unavailable, or for bodies without a bundled map, the existing
  lit-color sphere remains the deterministic fallback. Thus texture assets add
  no work or transfer to the initial Solar system-scale view.

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

The four recent missions are generated separately with `--recent-only`, leaving
legacy samples and the cutover epoch untouched. Horizons target IDs are Webb
`-170`, Lucy `-49`, Psyche `-255`, and Europa Clipper `-159`. Each dataset includes
post-separation launch-day samples, daily encounter windows, and an exact
`2026-08-12 00:00` cutoff sample. Sources are heliocentric Ecliptic J2000/ICRF
vectors in AU and AU/day; Horizons vector epochs use TDB, matching the existing
pipeline's numerical time convention. The UI labels dates in UTC without a
TDB-to-UTC conversion (roughly a minute offset); this is not event-timing-grade
ephemeris software.

Webb's source covers its L2 halo trajectory; Lucy includes main-belt and Earth
encounters; Psyche and Europa Clipper include Mars gravity assists. Horizons
may supply reference/predicted segments. New cards intentionally omit fixed
Kepler-element values rather than inventing an ellipse for maneuvering missions.
After the common cutoff, all are massless gravity-only particles: no Webb
station-keeping, Psyche ion propulsion, or later targeting/capture burns.
Mission descriptions link to NASA mission pages; the generator's Horizons
target records provide the spacecraft identifiers and trajectory provenance.

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
When a moon itself is selected or followed, its local system remains rendered
even after close zoom moves the parent outside the viewport.

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

## Mission planning

`src/mission-planner.js` provides a dependency-free patched-conic planner. A
universal-variable Lambert solver evaluates prograde short- and long-way,
zero-revolution heliocentric transfers. Window search samples each waypoint's
date interval, evaluates up to 32 branch combinations per route, and ranks
candidates using Earth departure delta-v, powered gravity-assist corrections,
arrival relative speed, and an infeasible-assist penalty.

Planetary assists compare the required incoming/outgoing hyperbolic-excess turn
against the maximum turn available at the configured flyby altitude. The UI
reports excess powered correction rather than silently accepting an impossible
unpowered flyby. Final targets may be planets, major moons, bundled comets, or
active custom bodies. Moon targets currently use their heliocentric state
directly; a parent-centric sphere-of-influence arrival leg is deferred.

The planner prepares global and hierarchical-moon N-body checkpoints before a
future search, then queries the same heliocentric states used by rendering.
Selected Lambert arcs are sampled for the static orbit layer, while preview
playback interpolates a spacecraft marker along those physically propagated
samples. Encounter entries jump the main simulation clock to their waypoint.

New plans select distinct targets from the active catalog. Solar Earth-to-Mars
defaults retain their original windows; other systems derive day-scale windows
from their planets' initial orbital periods. Switching to a different catalog or
an incompatible epoch replaces the plan. Deleting individual bodies preserves
eligible waypoints, removes unavailable assists, and leaves a deleted departure
or target empty for explicit replacement. Any system change clears solved-route
controls and refreshes gravity-assist choices. Searches reject dates before an editable
system's epoch and repeated consecutive bodies before preparing ephemerides.
Systems with fewer than two mission targets report that limitation explicitly.
The central-mass patched-conic approximation is not a full N-body spacecraft
optimizer, particularly around multiple stars.

Plans use a compact versioned schema. Named plans are stored in local storage;
only waypoint windows, flyby altitudes, and selected route times/branch mask are
serialized. Derived route polylines are recomputed after load. Scenario version
2 optionally embeds the active compact plan, while version-1 links remain
accepted. Version 3 also stores editable-system definitions and initial states,
so small custom systems and their plans can be restored within the URL size
limit. The 2100 simulation limit bounds Solar planner searches; editable-system
searches instead respect their saved epoch.

Departure delta-v is calculated from the selected circular parking orbit into
the Lambert leg's hyperbolic excess velocity. Gravity assists compare the
required asymptote turn against the turn available at the selected periapsis
altitude and include any powered correction. The destination may remain a
flyby or include a circular-orbit capture burn. Sampled legs use finite
periapsis offsets at every encounter, so both the rendered route and Spacecraft
View pass around bodies instead of through their centers.

## Spacecraft View

Spacecraft View is available only when the mission planner has a solved route.
`src/spacecraft-view.js` constructs an orthonormal camera frame whose forward
axis follows the planned transfer velocity. Pointer drag adds yaw and pitch
relative to that flight frame, while wheel, pinch, and the standard zoom
controls adjust vertical field of view. LOOK FORWARD resets the offsets without
changing the propagated trajectory.

The view uses the selected route's universal-variable samples for both position
and velocity. It renders the same physical bodies, textures, lighting, labels,
and selection cards as the surface observer, but without a horizon or
atmospheric clipping plane. Body hit testing uses cockpit-projected disks, so a
planet seen during a flyby remains selectable. The standard playback, speed,
date, mission-planner, timeline, layer, and sharing controls remain available;
surface observatory, body insertion, Lagrange, and rotating-frame controls are
disabled because their camera assumptions conflict with a vehicle frame.

The HUD reports the current route leg, heliocentric velocity, next encounter,
distance, encounter ETA, total remaining time, and mission progress. Playback
stops at the selected route's final encounter. Scenario links optionally store
cockpit yaw, pitch, and FOV alongside the compact selected mission route, then
recompute the physical path before restoring the view.

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
than discarding particle substep accuracy. Monotonic full-state cursors in both
the global and nested moon integrators keep forward playback from replaying the
interval since their latest checkpoints on every animation frame; backward and
out-of-order queries still restart from deterministic checkpoints. Spacecraft
and comet future trails
are sampled from the same integrated solution as their markers. During
playback, the renderer incrementally retains those already-computed live states
instead of synchronously resampling and recursively refining an entire trail
segment. This bounds trail work per frame while preserving close-flyby curvature
from the actual simulation states.

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

Long future jumps extend checkpoints with wall-clock-budgeted cooperative work
and yield to the browser so progress remains visible. Navigation is capped at
2100 to bound total work and checkpoint memory. Route search uses a Worker;
moving live global/moon integration off-thread remains a separate future step
because rendering currently requires synchronous state queries.

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

Event searches currently support built-in Solar planets and moons, including
those retained in an edited Solar preset. Non-Solar curated and custom bodies
are not event-search observers; their event controls are disabled with an
explicit explanation rather than retaining stale Solar selections.

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

The body detail card reports physical mass in kilograms, and physical radius for
the Sun, planets, dwarf planets, moons, and custom bodies. Spacecraft use NASA
published spacecraft masses. Comets use measured masses where available and
size/density-derived estimates otherwise. Spacecraft and comets retain their
massless test-particle dynamics: these display masses do not perturb any body.
Built-in bodies link to their corresponding English Wikipedia article. Custom
bodies link to the general article for their selected body type.

Spacecraft values are NASA-published launch masses: 721.9 kg for each Voyager,
258 kg for Pioneer 10, 258.5 kg for Pioneer 11, 478 kg for New Horizons, and
685 kg for Parker Solar Probe. Comet values use published physical estimates:
Halley 2.2e14 kg, Hale-Bopp 1.9e14 kg, and Rosetta's measured 9.982e12 kg for
67P. Encke's 2.9e13 kg and NEOWISE's 3.3e13 kg are marked approximate and
derived from their published 4.86 km and 5 km nucleus diameters using a typical
500 kg/m3 comet density.

## User-introduced bodies

The body insertion panel provides star, black-hole, planet, and comet presets
with editable names and masses. A 0–180 degree inclination slider supports
prograde, polar, and retrograde trajectories. Placement uses two
direct-manipulation steps on the canvas: the first tap selects an orbital node
on the ecliptic plane, and the second pointer drag sets the planar velocity
direction and speed. The velocity is then rotated about the placement radius
to produce the requested orbital inclination while preserving speed and radial
velocity. Live AU coordinates, 3D direction, inclination, and km/s are shown
before insertion.

Insertion creates a new deterministic simulation branch at the current date.
The new body's heliocentric 3D position and velocity are converted to the active
barycentric state, its mass becomes a Newtonian gravitational parameter, and
later checkpoints and trail caches are invalidated. Rewinding before the
insertion date selects the prior branch; inserting after a rewind discards
branches introduced later. The first version intentionally limits placement
and velocity to the ecliptic plane.

Custom bodies use the same estimated physical radii for collision geometry,
close-view rendering, and apparent angular size in Observatory Mode. At system
scale they retain selectable visibility markers; after sufficient zoom they
transition to physical scale. Rendering follows the selected appearance:
emissive glow for stars, a dark event-horizon disk and rim for black holes,
Sun-lit spheres for planets, and illuminated nuclei with anti-solar tails for
comets.

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

Ringed planets use `RingSystem`'s plane normal for their texture spin axis,
so cloud bands and rings share an equator as the camera rotates. Moon orbits
retain their individual inclinations. The texture shader intersects an oblate
spheroid oriented around that same axis, rather than compressing the image
vertically in screen space; lighting uses the corresponding surface normal.
Ring axes use mean J2000 pole right ascension and declination from
[JPL NAIF pck00011](https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/pck00011.tpc),
rotated from equatorial J2000 into the ecliptic J2000 frame of the Horizons
trajectories. They no longer treat obliquity to the planet's orbit as an
ecliptic inclination or use the planet's orbital node as its equatorial node.
The visualization holds these mean poles fixed: secular precession and periodic
nutation (including Neptune's) are not modeled. Regression tests compare the
planes against the actual bundled moon position/velocity states, preserving
real moon inclinations rather than forcing every moon into the ring plane.

`src/star-field.js` generates deterministic directions on a celestial sphere.
The separate sky canvas uses a 90-degree perspective projection and redraws only
when camera yaw, tilt, or viewport dimensions change. Stars therefore remain
fixed in inertial space while moving correctly under pointer rotation and
co-rotating reference frames; zoom and pan do not alter the distant background.

Full orbit paths use a second cached canvas. `src/asteroid-belt.js` adds a deterministic,
static density illustration of the main belt to that cached canvas, behind
orbit paths and body markers. Its 5,000 exaggerated points span 2.1 to 3.3 AU
with a small vertical thickness, sharing the scene's pan, zoom, and 3D camera
projection. Points are viewport-culled and fade out at close-up scales.
At wide scales their opacity decreases with projected area, preventing
overlapping screen-sized dots from turning into a bright solid ring.
They are not ephemerides, selectable objects, or inputs to the integrator.
The illustration appears only in the built-in Solar System overview, including
its rotating reference frame; any editable/custom system suppresses it, and
restoring the Solar System restores it.

The dynamic scene is redrawn with `requestAnimationFrame`. At moon-system zoom levels, heliocentric orbit
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
- Mission timeline, mission planner, body/craft, and profiler panels can be
  closed directly and toggled with `M`, `W`, `L`, and `P`, respectively.
  Timeline, planner, and profiler start hidden.
- Wheel and buttons apply anchored zoom.
- The zoom ceiling remains conservative for system navigation, then scales
  inversely with the physical radius of the selected or followed body so small
  planets and moons can fill the viewport without granting unbounded zoom.
- Legend entries and canvas markers toggle selection.
- Close-view moon markers receive an expanded pointer target, and their dynamic
  parent-relative orbit polylines participate in trajectory hit testing.
- Selecting a body from the body/craft list applies a distance-aware zoom,
  centers the camera, and follows that body. Planets with moons frame the local
  moon system; planets without moons use their physical radius for an equivalent
  close-body frame rather than falling back to a wide heliocentric view.
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

The guided tutorial is offered automatically until the user finishes or skips
it. Completion is stored in the `simsolar_tutorial_complete` cookie, with local
storage as a fallback for direct-file environments, and the toolbar restart
action remains available afterward. Introductory steps dim the application;
interactive steps keep the simulation fully visible and usable while
highlighting the relevant control. Tutorial progress is ephemeral and is not
included in shareable scenario URLs.

**Tutorial maintenance requirement:** every major user-facing feature addition,
removal, renamed control, or changed workflow must review and update the guided
tutorial in the same change. Target selectors, instructions, ordering, and
feature coverage must remain synchronized with the current interface.

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
