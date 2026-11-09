# Development guide

This is the contributor and coding-agent entry point. Read it before changing
the application. Architecture and scientific assumptions live in
[DESIGN.md](DESIGN.md); planned/completed work lives in [ROADMAP.md](ROADMAP.md).

## Setup and architecture

Open `solar-system.html` directly for no-build use. To exercise real Workers,
run `node tools/serve.js` and open `http://127.0.0.1:4173/solar-system.html`.
Node 22 is used in CI; install development dependencies with `npm ci` and
Chromium with `npx playwright install chromium`.

The application uses classic scripts and UMD modules, not a bundled module
graph. `src/app.js` composes named dependencies and starts page-lifetime
controllers. State belongs in `src/app/`, drawing in `src/rendering/`, and
feature workflows/styles in `src/features/`. Pure calculations and transports
remain shared modules under `src/`. Factories register without touching the
DOM; construct every instance before initializing controls. Lazy dependency
getters resolve forward references only in runtime callbacks.

Use centralized system transitions, not isolated accessor writes, for catalog
changes. Clear numerical, rendering, and feature caches through their owners.
Do not put simulation, drawing, input, or feature workflows back into the
composition root. Declare new scripts/styles in `solar-system.html` in dependency
order and bump modified script cache keys when existing keys are versioned.

## Before and during a change

1. Identify the affected ownership boundary and existing helpers.
2. Record reproducible scenarios, including date, playback speed, camera,
   enabled layers, and active system. Pin wall time where defaults depend on it.
3. Make the smallest complete change; keep physics/data updates separate from
   component extraction.
4. Add assertions for the actual behavior or amount of work, not merely an
   output that could pass while doing unnecessary work.
5. Run affected checks, review artifacts, and then run broader checks when the
   changed boundary requires them. Document unresolved failures explicitly.

Before changing orbital calculations, record source, epoch, units, and expected
accuracy in DESIGN.md. Preserve finite-number validation and explicit errors.
For user-configurable state, decide whether it survives sharing; update capture,
validation, restoration, version compatibility, and scenario tests together.
Review and update the guided tutorial for major features or changed workflows.

## Validation commands

| Command | Purpose |
| --- | --- |
| `npm test` | Numerical, component, data, transport, and lifecycle contracts |
| `npm run test:browser` | HTTP/direct-file workflows and browser error guards |
| `npm run test:all` | Node and functional browser suites |
| `npm run test:coverage` | Node/browser suites plus combined V8 coverage |
| `npm run test:visual` | Reviewed Windows/Chromium raster baselines |
| `npm run test:performance` | Paired sustained-playback comparisons against an explicit Git revision |
| `git diff --check` | Whitespace errors |

Browser suites start their own loopback server on port 4173. Stop a manual
preview first and do not run browser suites concurrently. Playwright file
selectors are regular expressions; on Windows, use a filename or `--grep`
rather than a backslash-separated file selector.

CI runs coverage/functional checks on Linux, visuals on Windows, and performance
comparisons on `ubuntu-24.04`, using Node 22 and lockfile Chromium. Failure traces,
screenshots, coverage, lifecycle counters, and performance measurements are
retained as artifacts. Development tooling must not enter runtime dependencies.

### Correctness, coverage, and resource baselines

`tests/fixtures/refactor-reference.json` freezes numerical outputs, route
results, legacy link payloads, and source hashes from
`6fe1c4a708e5213890bf4f8051dd1fa07ccd97ae`. Numerical comparisons use absolute
tolerance `1e-12` plus relative tolerance `1e-11`; conservation and physical
invariants remain separate checks. Original v1/v2 payloads must load directly,
not just after re-encoding as v3. Full TRAPPIST-1 snapshots exceed the
4,096-character share limit and must fail explicitly, not lose bodies.

Coverage needs Node 20.19+ and reports `coverage/index.html` and
`coverage/coverage-summary.json`. Unloaded source modules and the curated catalog
are included. Browser Worker execution is not collected; route-instrumented
script copies are excluded. Coverage reveals missing assertions, not correctness.

Six visual baselines cover Solar overview, Saturn/rings, TRAPPIST-1, Observatory,
mission cockpit, and mobile curated UI. Reviewed images use Windows, lockfile
Chromium, SwiftShader, fixed scenarios/date, locale, timezone, and viewport.
Linux skips those images; Windows CI enforces them. Comparisons allow at most
100 changed pixels at Playwright's default color threshold. Missing images fail.

Browser guards cover transport termination, stale weather, out-of-order
restoration, collisions, mouse/touch cancellation, page suspension, and catalog
changes. Repeated-mode resource tests warm both systems, perform eight measured
cycles, finish painting, and collect garbage before measuring. Bounds are one
animation loop, no intervals/Workers, no extra documents, at most 50 extra nodes,
five extra listeners, and less than 8 MiB heap growth. Their 250 ms paused-frame
p95 limit is only a coarse stall guard, not a playback performance guarantee.
Detached DOM collection can lag painting; diagnose live versus detached nodes
rather than raising the node allowance.

Component contracts include independent instances, frozen numerical adapters,
projection/zoom anchors, playback bounds, stale callbacks, and translation-cache
work counts. Preserve rendering and hit-test cache consistency together.

### Performance regression gate

Functional and visual success does not prove performance. The performance suite
is separate from ordinary browser/coverage runs and must be run for rendering,
simulation, per-frame UI, input/caching changes, or features adding per-frame work.

Choose a reviewed revision before your changes:

```powershell
$env:SIMSOLAR_PERF_BASE='HEAD'
npm run test:performance
```

Use `HEAD` for uncommitted local changes; after committing, use the actual
pre-change SHA. On POSIX shells, use
`SIMSOLAR_PERF_BASE=<sha> npm run test:performance`.
Missing/invalid revisions fail. PR CI uses the target branch's base SHA; push
CI uses the previous head (or the parent on a new branch). Both versions execute
sequentially on the same runner/browser. Changed tracked scripts/data and the
HTML shell are served from Git for the baseline; candidate files come from the
checkout. Untracked candidate files are usable, but Git cannot baseline them.
This is a source comparison, not a separate dependency-install comparison:
dependency/asset-only performance changes need additional explicit experiments.

Fixed workloads are future Solar overview with spacecraft/comets enabled,
close-up Earth following with both groups enabled, and TRAPPIST-1 playback.
Each version reloads the page from a fixed saved scenario, with a two-second
playback warm-up, and a three-second sample, repeated three times with alternating
version order. Each workload has an isolated browser context; both versions
use normal Chromium rendering, not the visual suite's forced SwiftShader.
A successful sample must contain more than 30 draws and frames.
Playback must visibly advance before sampling; an idle or failed page is not
a valid speed improvement. Application errors fail the workload.

The gate compares the median of three samples' p50/p95 drawing costs and frame
intervals. Candidate drawing metrics must not exceed `1.5 * baseline + 2 ms`;
frame metrics must not exceed `1.5 * baseline + 5 ms`. Additional candidate
p95 limits are 40 ms drawing and 100 ms frame interval. These deliberately
tolerate hosted-runner variation while detecting substantial regressions;
they are not a 60 FPS certification. Drawing cost includes synchronous scene
work, not Worker computation or asynchronous GPU execution. Frame intervals
provide a complementary end-to-end responsiveness signal.

Each workload writes `performance.json` under `test-results/performance/`,
including raw samples, aggregates, thresholds, revision IDs, dirty status,
browser/platform, and scenario name. CI retains these in `performance-evidence`.
Review failures with profiles and identical base/candidate workloads. Rerun
the complete paired experiment to diagnose noise; never repeatedly run only
the candidate until a favorable result appears. Do not raise thresholds or
choose a slower baseline to hide a failure.

Hosted runner hardware is not dedicated, even with a pinned OS image. A noisy
failure requires evidence, not automatic threshold updates. Major improvements
should also be profiled in an ordinary hardware-accelerated browser and on
representative devices. Add workloads when new features create new expensive
paths. The three scenarios are not exhaustive.

### Lessons from previous regressions

- Enabling optional spacecraft/comet layers multiplies trajectory work. Profile
  overview **and close-up following**, not only the default hidden-layer view.
  Translation-only camera motion must not repeat world projection or path
  simplification. Zoom/rotation/source changes must still invalidate the cache.
- Keep live physics in the persistent simulation Worker and render completed
  exact states. The displayed clock must not run ahead of bodies. Direct-file
  fallback remains cooperative; a failed Worker must not silently fall back to
  blocking integration. Planner/sky-event analytical sampling is still a
  main-thread limitation, not covered by moving live playback off-thread.
- Rendering while a future date/system restore is pending can make cockpit
  logic see an invalid route date and disable itself. Validate model/date
  readiness before drawing, and invalidate late results on every relevant
  transition.
- A paused screenshot hides sustained playback problems. Combine visual
  preservation, deterministic work-count assertions, and measured workloads.
- Pin workflow fixture dates. Wall-clock-derived future defaults become slower
  over time and make tests drift without code changes.
- Image loading/offline failures and resource-count failures need root-cause
  investigation and baseline comparison. Do not dismiss them as unrelated just
  because numerical tests pass.

### Updating references

Never regenerate references to make a refactor pass. For an intentional
behavior change, inspect the difference, commit the production change, then
explicitly capture and review references:

```text
npm run test:reference:update
npm run test:visual -- --update-snapshots=all
```

Numerical capture refuses uncommitted production changes. Visual updates require
Windows and pinned Chromium; inspect every PNG/diff. Performance baselines are
explicit Git revisions, not automatically rewritten snapshots. Threshold changes
require documented measurements and review.

## Delivery checklist

Confirm the affected checks pass, inspect evidence, and state any unresolved
failures. Update design/roadmap/tutorial/scenario documentation as applicable.
Do not silently expand scientific claims or substitute artwork for observations.
Only push, open PRs, merge, or publish when requested. Merging to `main` deploys
GitHub Pages; verify CI and deployment rather than assuming a successful push
means the public site is updated.
