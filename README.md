# openclaw-skillkit

Build, lint, package, and benchmark OpenClaw skills with a small Node.js CLI.

`openclaw-skillkit` is for teams that want a skill workflow without inventing one from scratch. It gives you a fast scaffold, opinionated quality checks, portable `.skill` packaging, and a repeatable benchmark loop you can run locally or in CI.

## Why This Repo Exists

Most skill repos lose trust in the first few minutes:

- new skills start from inconsistent folder layouts
- metadata is too vague to review or reuse
- local references drift and break silently
- packaging happens without validation
- quality discussions are anecdotal because nobody runs the same checks

`openclaw-skillkit` replaces that with one lean toolkit:

- `init` replaces manual skill bootstrapping
- `lint` replaces ad hoc review for structural mistakes
- `pack` replaces manual archive creation
- `benchmark` replaces “seems better” with a repeatable evaluation pass

## Quickstart

Install and verify the repo:

```bash
npm install
npm run verify
```

Create and ship a skill:

```bash
npx openclaw-skillkit init skills/customer-support --resources references,scripts,assets
$EDITOR skills/customer-support/SKILL.md
npx openclaw-skillkit lint skills/customer-support
npx openclaw-skillkit pack skills/customer-support --output ./artifacts/customer-support.skill
```

Run the benchmark loop:

```bash
npm run benchmark
npm run benchmark -- --iterations 10 --output ./artifacts/benchmark.json
```

If you want to use the checked-in build directly:

```bash
node dist/cli.js lint examples/weather-research-skill
node dist/cli.js pack examples/weather-research-skill
node bench/index.js --iterations 3
```

## What You Get

### `init`

Scaffolds a ready-to-edit skill directory in one command.

```bash
openclaw-skillkit init skills/customer-support \
  --name customer-support \
  --description "Skill for support triage workflows" \
  --resources references,scripts,assets
```

Output shape:

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

Validates the parts of a skill that usually break adoption:

- missing or malformed `SKILL.md`
- weak `name`, `description`, or `version` frontmatter
- invalid slug-style skill names
- untouched placeholder descriptions or scaffold body copy
- broken local markdown references
- missing headings that make a skill hard to review

```bash
openclaw-skillkit lint skills/customer-support
```

Example output:

```text
Linting /tmp/openclaw-skillkit-repo/examples/weather-research-skill
  OK: skill structure looks valid (1 file(s) checked).
```

### `pack`

Builds a `.skill` archive only after lint passes.

```bash
openclaw-skillkit pack skills/customer-support
openclaw-skillkit pack skills/customer-support --output ./artifacts/customer-support.skill
```

If you are already inside a skill directory:

```bash
openclaw-skillkit pack
```

## Quality Checks And Evaluation

The repo includes both validation and measurement.

Quality checks:

- fixture-driven tests cover parsing, linting, CLI behavior, and archive contents
- `pack` refuses to build if lint errors exist
- `verify` runs the test suite and benchmark suite in one command
- GitHub Actions runs the same `npm run verify` command as local contributors

Evaluation:

- `bench/run-detection-benchmark.js` scores good-vs-bad skill detection using labeled fixtures in [`test/fixtures/benchmark/`](/tmp/openclaw-skillkit-repo/test/fixtures/benchmark)
- `bench/run-cli-benchmark.js` measures a repeatable CLI workflow: example-skill lint and an `init -> lint -> pack` round trip
- `npm run benchmark -- --json --output ./artifacts/benchmark.json` exports a machine-readable report for CI artifacts or before/after comparisons

Human-readable benchmark output looks like this:

```text
Benchmark summary
  Detection: 5/5 correct (100.0%), precision 100.0%, recall 100.0%
  CLI lint x5: min 38.0ms, p50 40.2ms, avg 41.1ms
  Round trip x5: min 145.0ms, p50 149.4ms, avg 151.0ms
```

## Adoption Notes

This project is intentionally lean:

- no runtime dependencies
- plain Node.js CLI with checked-in `dist/`
- benchmark flow stays as scripts, not a framework

That makes it useful when you want to standardize a skill repo quickly without taking on a larger platform or internal tooling project.

## Commands And Help

```bash
openclaw-skillkit help
openclaw-skillkit help init
openclaw-skillkit help lint
openclaw-skillkit help pack
npm run benchmark -- --help
npm run check
npm run build
```

## Example Skill

A minimal example lives in [`examples/weather-research-skill/`](/tmp/openclaw-skillkit-repo/examples/weather-research-skill).

Use it to validate the repo quickly:

```bash
node dist/cli.js lint examples/weather-research-skill
node dist/cli.js pack examples/weather-research-skill
```
