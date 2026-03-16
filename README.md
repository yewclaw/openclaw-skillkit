# openclaw-skillkit

Ship OpenClaw skills that are easy to trust, easy to review, and easy to package.

Most skill repos fail adoption for boring reasons: the first skill is slow to scaffold, metadata is vague, local references break silently, and nobody can tell if quality is improving. `openclaw-skillkit` keeps that surface small:

- `init` creates a clean skill directory in seconds
- `lint` catches structural and metadata mistakes before they spread
- `pack` builds a portable `.skill` archive from a validated skill
- `bench` measures detection quality and a repeatable CLI workflow without extra dependencies

The project is intentionally lean. No runtime dependencies. No framework around skills. Just a readable Node.js CLI that helps a team adopt a real skill workflow quickly.

## Quick Demo

```bash
npm install
npm run verify

npx openclaw-skillkit init my-skill --resources references,scripts,assets
npx openclaw-skillkit lint my-skill
npx openclaw-skillkit pack my-skill
```

Fast evaluation loop:

```bash
npx openclaw-skillkit help pack
npx openclaw-skillkit init demo-skill --resources references,scripts
$EDITOR demo-skill/SKILL.md
npx openclaw-skillkit lint demo-skill
npx openclaw-skillkit pack demo-skill --output ./artifacts/demo-skill.skill
```

If you want to use the checked-in build directly:

```bash
node dist/cli.js init my-skill --resources references,scripts,assets
node dist/cli.js lint my-skill
node dist/cli.js pack my-skill
node bench/index.js
```

## Why It Converts

`openclaw-skillkit` is built for the first five minutes of evaluation:

- a visitor can understand the product from one screen
- a teammate can scaffold and lint a real skill immediately
- a maintainer can measure quality with fixture-driven benchmarks instead of intuition
- CI runs the same local `verify` command that contributors run

## Commands

### `init`

Scaffold a new skill directory with a ready-to-edit `SKILL.md`.

```bash
openclaw-skillkit init skills/customer-support \
  --name customer-support \
  --description "Skill for support triage workflows" \
  --resources references,scripts,assets
```

Creates:

```text
skills/customer-support/
├── SKILL.md
├── assets/
│   └── README.txt
├── references/
│   └── README.md
└── scripts/
    └── example.sh
```

### `lint`

Validate a skill directory with practical checks:

- `SKILL.md` exists, is non-empty, and has parseable frontmatter
- `name`, `description`, and `version` are checked for useful metadata
- skill names must be lowercase slug-style identifiers
- placeholder descriptions are flagged before they hurt discovery
- untouched scaffold body copy is flagged before a generated skill ships as-is
- broken local markdown references in `SKILL.md` are reported as errors
- missing top-level and section headings are surfaced

```bash
openclaw-skillkit lint skills/customer-support
```

Example output:

```text
Linting /tmp/openclaw-skillkit-repo/examples/weather-research-skill
  WARNING: Optional directory not found: assets/
  WARNING: Optional directory not found: examples/
Summary: 0 error(s), 2 warning(s), 1 file(s) checked.
```

### `pack`

Package a skill directory into a `.skill` archive. `pack` runs lint first and refuses to build an archive if lint errors exist.

Warnings remain visible during `pack`, so reviewers can still spot weak metadata or incomplete structure before sharing the archive.

```bash
openclaw-skillkit pack skills/customer-support
openclaw-skillkit pack skills/customer-support --output ./artifacts/customer-support.skill
```

## How Quality Is Measured

The repo now includes a lightweight measurement loop under [`bench/`](/tmp/openclaw-skillkit-repo/bench):

- `bench/run-detection-benchmark.js` scores good-vs-bad skill detection using labeled fixtures in [`test/fixtures/benchmark/`](/tmp/openclaw-skillkit-repo/test/fixtures/benchmark)
- `bench/run-cli-benchmark.js` measures a repeatable CLI workflow: `lint` on the example skill and an `init -> lint -> pack` round trip
- `npm run bench` prints both reports

That keeps iteration grounded in concrete signals instead of anecdotal “seems better” feedback.

## Verification

One command runs the repo verification path used in CI:

```bash
npm run verify
```

That command runs:

- `npm test` for fixture-driven CLI and library coverage
- `npm run bench` for quality and DX measurement output

If you are editing TypeScript sources, these maintenance commands stay available:

```bash
npm run check
npm run build
```

GitHub Actions runs the same `npm run verify` command in [`.github/workflows/ci.yml`](/tmp/openclaw-skillkit-repo/.github/workflows/ci.yml).

## CLI Help

The CLI now supports command-aware help for faster first-use discovery:

```bash
openclaw-skillkit help
openclaw-skillkit help init
openclaw-skillkit pack --help
```

## Example Skill

A minimal example lives in [`examples/weather-research-skill/`](/tmp/openclaw-skillkit-repo/examples/weather-research-skill).

Use it to test the toolkit quickly:

```bash
node dist/cli.js lint examples/weather-research-skill
node dist/cli.js pack examples/weather-research-skill
```

## Tests

The test suite stays intentionally lean:

- library coverage for parsing, lint rules, and evaluation metrics
- fixture-driven valid, invalid, and benchmark skill cases under [`test/fixtures/`](/tmp/openclaw-skillkit-repo/test/fixtures)
- CLI integration coverage for `init`, `lint`, and `pack`
- archive-content checks for generated `.skill` files without extra dependencies

## Notes

- Runtime dependencies are intentionally avoided to keep the toolkit portable.
- The checked-in `dist/` build lets the repo work immediately before local compilation.
- `npm run build` uses `tsc` once dependencies are installed.
