# Agent development instructions

Read [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) before modifying this repository.
It defines change validation, performance comparisons, baseline review, and
lessons from previous regressions. Read [docs/DESIGN.md](docs/DESIGN.md) for
component ownership and scientific assumptions.

- Preserve static HTTP and direct-file launch; do not introduce a required build.
- Keep feature logic out of `src/app.js`, the composition root.
- Keep live integration out of renderers; use completed simulation snapshots.
- Validate the actual workload affected, including enabled optional layers,
  close-up following, future dates, and system replacement where relevant.
- Do not weaken checks or regenerate references just to make a change pass.
- Update scenario compatibility, tutorial instructions, and related docs with
  behavioral changes. Do not publish or merge changes without user authorization.
