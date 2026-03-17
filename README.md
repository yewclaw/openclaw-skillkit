# openclaw-skillkit

<p align="center">
  <img src="https://img.shields.io/badge/node-22%2B-3C873A?logo=node.js&logoColor=white" alt="Node.js 22+" />
  <img src="https://img.shields.io/badge/license-MIT-0F172A" alt="MIT License" />
  <img src="https://img.shields.io/badge/verify-npm%20run%20verify-0A7F5A" alt="Verify with npm run verify" />
</p>

<p align="center"><strong>Build, lint, package, and benchmark OpenClaw skills with a lean Node.js CLI.</strong></p>

`openclaw-skillkit` turns skill authoring into a repeatable workflow instead of a folder of markdown that drifts over time. It gives you a scaffold, concrete validation, packaging that refuses broken skills, and a benchmark loop you can run locally or in CI.

<p align="center">
  <img src="./docs/assets/skillkit-flow.svg" alt="Workflow diagram showing init, author, lint, pack, and benchmark steps in openclaw-skillkit." width="920" />
</p>

## At a Glance

| Area | What you get |
| --- | --- |
| `init` | Generate a consistent skill layout with optional `references/`, `scripts/`, and `assets/`. |
| `lint` | Catch weak metadata, placeholder copy, missing sections, and broken local references before review. |
| `pack` | Create a `.skill` archive only after validation passes, with a manifest included for inspection. |
| `benchmark` | Measure fixture detection quality and CLI round-trip performance with repeatable runs. |

## Why This Exists

Most skill repos lose trust for predictable reasons:

- every new skill starts from a slightly different structure
- `SKILL.md` metadata is vague, missing, or left half-scaffolded
- local references drift and break later
- packaging becomes manual, so validation gets skipped
- quality debates stay subjective because nobody runs the same checks

`openclaw-skillkit` keeps the workflow small: create, author, lint, pack, benchmark.

## Quickstart

Requirements: Node.js 22+

Install dependencies and verify the baseline:

```bash
npm install
npm run verify
```

Create a skill, edit it, validate it, and package it:

```bash
npx openclaw-skillkit init skills/customer-support --template scripts
$EDITOR skills/customer-support/SKILL.md
npx openclaw-skillkit lint skills/customer-support
npx openclaw-skillkit pack skills/customer-support --output ./artifacts/customer-support.skill
```

If you want to use the checked-in build directly:

```bash
node dist/cli.js lint examples/weather-research-skill
node dist/cli.js lint examples/customer-support-triage-skill
node dist/cli.js lint examples/release-notes-skill
node dist/cli.js pack examples/weather-research-skill
node bench/index.js --iterations 3
```

## Workflow

### 1. Start from a real scaffold

`init` creates a ready-to-edit skill directory instead of another ad hoc markdown file.

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

Resulting structure:

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

### 2. Catch trust-breaking issues early

`lint` checks the failure modes that usually make skills hard to review or reuse:

- missing or malformed `SKILL.md`
- missing `name`, `description`, or `version` frontmatter
- invalid slug-style skill names
- invalid semver-like versions
- placeholder descriptions or scaffold body copy left in place
- missing headings that make the workflow hard to follow
- broken local file references, including links that escape the skill root
- stable issue codes and fix suggestions for every finding
- focus-area summaries and next-step guidance for authors and CI consumers
- JSON output for CI, editor extensions, and custom tooling

```bash
openclaw-skillkit lint skills/customer-support
npx openclaw-skillkit lint skills/customer-support --json
```

Example success output:

```text
Linting /tmp/openclaw-skillkit-repo/examples/weather-research-skill
  OK: skill structure looks valid (1 file(s) checked).
```

Example actionable failure output:

```text
Linting /tmp/openclaw-skillkit-repo/test/fixtures/invalid/bad-version-skill
  ERROR [invalid-frontmatter-version] SKILL.md: Frontmatter version must look like semver. Received "version1".
    Fix: Use a semver-style version such as "0.1.0" or "1.2.3-beta.1".
Summary: 2 error(s), 2 warning(s), 1 file(s) checked.
Action plan:
  1. Fix blocking metadata issues first. Update the SKILL.md frontmatter so name, description, and version clearly identify the skill.
  2. Then review structure warnings. Add the standard sections and make the workflow easy to follow as numbered steps.
  3. Re-run: openclaw-skillkit lint /tmp/openclaw-skillkit-repo/test/fixtures/invalid/bad-version-skill
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
  "focusAreas": [
    {
      "category": "frontmatter",
      "label": "Metadata",
      "errors": 2,
      "warnings": 1,
      "suggestion": "Update the SKILL.md frontmatter so name, description, and version clearly identify the skill."
    }
  ],
  "nextSteps": [
    "Fix blocking metadata issues first. Update the SKILL.md frontmatter so name, description, and version clearly identify the skill.",
    "Then review structure warnings. Add the standard sections and make the workflow easy to follow as numbered steps.",
    "Re-run: openclaw-skillkit lint /tmp/openclaw-skillkit-repo/test/fixtures/invalid/bad-version-skill"
  ],
  "issues": [
    {
      "level": "error",
      "code": "invalid-frontmatter-version",
      "category": "frontmatter",
      "file": "SKILL.md",
      "message": "Frontmatter version must look like semver. Received \"version1\".",
      "suggestion": "Use a semver-style version such as \"0.1.0\" or \"1.2.3-beta.1\"."
    }
  ]
}
```

### 3. Package only when a skill is ready to ship

`pack` runs lint first and refuses to create a `.skill` archive if blocking errors exist. It also skips nested `.skill` files and writes `.openclaw-skillkit/manifest.json` into the archive so adopters can inspect exactly what was bundled.

```bash
openclaw-skillkit pack skills/customer-support
openclaw-skillkit pack skills/customer-support --output ./artifacts/customer-support.skill
```

If you are already inside a skill directory:

```bash
openclaw-skillkit pack
```

## Commands

| Command | Purpose |
| --- | --- |
| `openclaw-skillkit help` | Show CLI help. |
| `openclaw-skillkit help init` | Show scaffold options and flags. |
| `openclaw-skillkit help lint` | Show lint modes, including JSON output. |
| `openclaw-skillkit help pack` | Show packaging behavior and output options. |
| `npm run benchmark -- --help` | Show benchmark runner flags. |
| `npm run check` | Type-check without emitting build output. |
| `npm run build` | Compile the CLI into `dist/`. |
| `npm run verify` | Run the full local verification pipeline. |

## Example Skills

| Example | Focus |
| --- | --- |
| [`examples/weather-research-skill/`](examples/weather-research-skill/) | Grounded trip-planning research with references and scripts. |
| [`examples/customer-support-triage-skill/`](examples/customer-support-triage-skill/) | Support queue routing and escalation. |
| [`examples/release-notes-skill/`](examples/release-notes-skill/) | Turning engineering change notes into customer-facing launches. |

## Quality Pipeline

The repo keeps the trust boundary explicit:

- `pack` is gated by lint, so broken skills do not get archived by accident
- packaged archives include a manifest and avoid recursively bundling old `.skill` artifacts
- fixture-driven tests cover parsing, linting, CLI behavior, and archive contents
- `npm run verify` runs tests and benchmarks, and also typechecks plus rebuilds `dist/` when the local TypeScript compiler is available
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

## Why Teams Use It

- small surface area: three core CLI commands plus benchmarks
- no runtime dependencies
- checked-in `dist/` for direct use from the repo
- plain markdown and filesystem conventions instead of a larger platform

It is meant for teams that want a standard skill workflow quickly, without creating another internal toolchain project.
