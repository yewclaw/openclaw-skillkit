# openclaw-skillkit

Build, lint, package, and benchmark OpenClaw skills with a lean Node.js CLI.

`openclaw-skillkit` helps teams stop treating skills like loose markdown files and start treating them like shippable artifacts. It gives you a fast scaffold, concrete lint checks, packaging that refuses broken skills, and a repeatable benchmark loop you can run locally or in CI.

- Start a new skill with a consistent layout in one command
- Catch weak metadata, broken references, and placeholder content before review
- Package a `.skill` archive only after lint passes
- Measure detection quality and CLI round-trip performance with repeatable benchmarks

## Why This Exists

Most skill repos break trust early:

- every new skill starts from a slightly different folder structure
- `SKILL.md` metadata is vague or missing
- local markdown references drift and fail later
- packaging is manual, so validation gets skipped
- quality discussions turn into opinion because nobody runs the same checks

`openclaw-skillkit` gives you one small workflow for the whole path from scaffold to archive.

## 60-Second Quickstart

Requirements:

- Node.js 22+

Clone the repo, install dependencies, and verify the baseline:

```bash
npm install
npm run verify
```

Create a skill, validate it, and package it:

```bash
npx openclaw-skillkit init skills/customer-support --template scripts
$EDITOR skills/customer-support/SKILL.md
npx openclaw-skillkit lint skills/customer-support
npx openclaw-skillkit pack skills/customer-support --output ./artifacts/customer-support.skill
```

If you want to use the checked-in build directly:

```bash
node dist/cli.js lint examples/weather-research-skill
node dist/cli.js pack examples/weather-research-skill
node bench/index.js --iterations 3
```

## What It Actually Solves

### 1. Start from a real scaffold

`init` creates a ready-to-edit skill directory instead of another ad hoc markdown file. Use template modes for the common cases, then add `--resources` only when you need to go off the happy path.

```bash
openclaw-skillkit init skills/customer-support \
  --name customer-support \
  --description "Skill for support triage workflows" \
  --template scripts
```

Template modes:

- `minimal`: `SKILL.md` only
- `references`: adds `references/`
- `scripts`: adds `references/` and `scripts/`
- `full`: adds `references/`, `scripts/`, and `assets/`

`--resources references,scripts,assets` still works and is merged with the selected template mode.

Output:

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

### 2. Catch common quality failures early

`lint` checks the things that usually make skills hard to trust or reuse:

- missing or malformed `SKILL.md`
- missing `name`, `description`, or `version` frontmatter
- invalid slug-style skill names
- invalid semver-like versions
- placeholder descriptions or scaffold body copy left in place
- missing headings that make the skill hard to review
- broken local file references
- stable issue codes and fix suggestions for each finding
- JSON output for CI, editor extensions, and custom tooling

```bash
openclaw-skillkit lint skills/customer-support
npx openclaw-skillkit lint skills/customer-support --json
```

Example output:

```text
Linting /tmp/openclaw-skillkit-repo/examples/weather-research-skill
  OK: skill structure looks valid (1 file(s) checked).
```

Example actionable failure output:

```text
Linting /tmp/openclaw-skillkit-repo/test/fixtures/invalid/bad-version-skill
  ERROR [invalid-frontmatter-version] SKILL.md: Frontmatter version must look like semver. Received "version1".
    Fix: Use a semver-style version such as "0.1.0" or "1.2.3-beta.1".
```

Example JSON output:

```json
{
  "skillDir": "/tmp/openclaw-skillkit-repo/test/fixtures/invalid/bad-version-skill",
  "fileCount": 1,
  "summary": {
    "total": 4,
    "errors": 2,
    "warnings": 2
  },
  "issues": [
    {
      "level": "error",
      "code": "invalid-frontmatter-version",
      "file": "SKILL.md",
      "message": "Frontmatter version must look like semver. Received \"version1\".",
      "suggestion": "Use a semver-style version such as \"0.1.0\" or \"1.2.3-beta.1\"."
    }
  ]
}
```

### 3. Package only when the skill is good enough to ship

`pack` runs lint first and refuses to create a `.skill` archive if blocking errors exist.

```bash
openclaw-skillkit pack skills/customer-support
openclaw-skillkit pack skills/customer-support --output ./artifacts/customer-support.skill
```

If you are already inside a skill directory:

```bash
openclaw-skillkit pack
```

## Example Workflow

Use this when you want a simple authoring loop for a new skill:

```bash
npx openclaw-skillkit init skills/weather-brief --template scripts
$EDITOR skills/weather-brief/SKILL.md
npx openclaw-skillkit lint skills/weather-brief
npx openclaw-skillkit pack skills/weather-brief --output ./artifacts/weather-brief.skill
```

Typical flow:

1. `init` creates the folder structure and starter files.
2. You replace the scaffold text in `SKILL.md` with real instructions and references.
3. `lint` catches structural and quality issues before review.
4. `pack` creates a portable archive once the skill clears validation.

A working example lives in [`examples/weather-research-skill/`](examples/weather-research-skill/).

## Quality Pipeline

This repo is opinionated about trust:

- `pack` is gated by lint, so broken skills do not get archived by accident
- fixture-driven tests cover parsing, linting, CLI behavior, and archive contents
- `npm run verify` runs the test suite plus the benchmark suite
- GitHub Actions runs the same `npm run verify` command on pushes and pull requests

Run the full local pipeline:

```bash
npm run verify
```

## Benchmarks

The benchmark suite covers both quality detection and CLI workflow performance:

- `bench/run-detection-benchmark.js` scores good-vs-bad skill detection using labeled fixtures in [`test/fixtures/benchmark/`](test/fixtures/benchmark/)
- `bench/run-cli-benchmark.js` measures a repeatable CLI round trip: linting the example skill and running `init -> lint -> pack`
- `npm run benchmark -- --json --output ./artifacts/benchmark.json` exports machine-readable results for CI artifacts or before/after comparisons

Human-readable output looks like this:

```text
Benchmark summary
  Detection: 5/5 correct (100.0%), precision 100.0%, recall 100.0%
  CLI lint x5: min 38.0ms, p50 40.2ms, avg 41.1ms
  Round trip x5: min 145.0ms, p50 149.4ms, avg 151.0ms
```

## Why Teams Choose This Instead Of Rolling Their Own

- small surface area: three core CLI commands plus benchmarks
- no runtime dependencies
- checked-in `dist/` for direct use from the repo
- plain markdown and filesystem conventions instead of a larger platform

It is meant for teams that want a standard skill workflow quickly, without creating another internal toolchain project.

## Commands

```bash
openclaw-skillkit help
openclaw-skillkit help init
openclaw-skillkit help lint
openclaw-skillkit help pack
npm run benchmark -- --help
npm run check
npm run build
```
