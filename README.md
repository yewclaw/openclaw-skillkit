# openclaw-skillkit

<p align="center">
  <img src="https://img.shields.io/badge/node-22%2B-3C873A?logo=node.js&logoColor=white" alt="Node.js 22+" />
  <img src="https://img.shields.io/badge/license-MIT-0F172A" alt="MIT License" />
  <img src="https://img.shields.io/badge/verify-npm%20run%20verify-0A7F5A" alt="Verify with npm run verify" />
</p>

<p align="center"><strong>The official-feeling toolkit for authoring, validating, packaging, and demoing OpenClaw skills.</strong></p>

`openclaw-skillkit` turns skill authoring into a repeatable product workflow instead of a folder of markdown that drifts over time. It gives you one toolkit with two aligned surfaces: a strong CLI for day-to-day work and a local Skill Studio for demos, onboarding, and review.

<p align="center">
  <img src="./docs/assets/skillkit-flow.svg" alt="Workflow diagram showing init, author, lint, pack, and benchmark steps in openclaw-skillkit." width="920" />
</p>

## At a Glance

| Area | What you get |
| --- | --- |
| `init` | Generate a consistent skill layout with optional `references/`, `scripts/`, and `assets/`. |
| `lint` | Catch weak metadata, placeholder copy, missing sections, and broken local references before review. |
| `pack` | Create a `.skill` archive only after validation passes, with a manifest and optional release report for inspection. |
| `inspect` | Read a packaged archive back out, verify exactly what it contains, and optionally export a handoff report. |
| `review` | Run a release-readiness pass that lints, packages, verifies source-to-artifact parity, and emits one review report. |
| `serve` | Launch a local Skill Studio web UI for demos, examples, linting, packaging, and archive inspection. |
| `benchmark` | Measure fixture detection quality and CLI round-trip performance with repeatable runs. |

## One Toolkit, Two Surfaces

Use the CLI when you want speed and scripting. Use Skill Studio when you want a clearer authoring flow, example-driven onboarding, or a more legible demo for other people. Both surfaces run the same real workflow:

1. initialize or load a skill
2. lint it with concrete fix guidance
3. package a `.skill` archive
4. inspect or review the shipped artifact

## Why This Exists

Most skill repos lose trust for predictable reasons:

- every new skill starts from a slightly different structure
- `SKILL.md` metadata is vague, missing, or left half-scaffolded
- local references drift and break later
- packaging becomes manual, so validation gets skipped
- quality debates stay subjective because nobody runs the same checks

`openclaw-skillkit` keeps the workflow small: create, author, lint, pack, inspect, benchmark.

## Quickstart

Requirements: Node.js 22+

Install dependencies and verify the baseline:

```bash
npm install
npm run verify
```

Launch the local studio if you want the guided authoring workflow:

```bash
npm run ui
```

Create a skill, edit it, validate it, and package it:

```bash
npx openclaw-skillkit init skills/customer-support --template scripts
$EDITOR skills/customer-support/SKILL.md
npx openclaw-skillkit lint skills/customer-support
npx openclaw-skillkit pack skills/customer-support --output ./artifacts/customer-support.skill
npx openclaw-skillkit inspect ./artifacts/customer-support.skill
npx openclaw-skillkit review skills/customer-support --output ./artifacts/customer-support.skill --report
```

If you want to use the checked-in build directly:

```bash
node dist/cli.js lint examples/weather-research-skill
node dist/cli.js lint examples/customer-support-triage-skill
node dist/cli.js lint examples/release-notes-skill
node dist/cli.js pack examples/weather-research-skill
node bench/index.js --iterations 3
```

## Local Studio

`openclaw-skillkit serve` starts a lightweight local web interface on `http://127.0.0.1:3210` by default. It uses the same real workflow as the CLI, not mocked demo actions.

Skill Studio is designed to feel like the product surface for the toolkit, not a separate experiment. It makes the path through skill authoring explicit:

- start from an example or scaffold a new skill
- see the current workflow status at a glance
- get clearer empty states and recommended next actions after each operation
- prefill a new skill scaffold from a checked-in example's structure and metadata
- move directly from packaging into archive inspection without re-entering paths

Use it to:

- scaffold a new skill with template and resource options
- compare examples, preload their paths, and prefill a matching scaffold
- lint a local skill directory and review fix guidance
- package a `.skill` archive and inspect the bundled manifest
- run one release-readiness review that combines lint, packaging, and artifact verification

Run it with either command:

```bash
npm run ui
openclaw-skillkit serve --port 3210
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

The generated `SKILL.md` now includes practical sections for `Inputs`, `Output`, and a short customization checklist so authors can move from scaffold to reviewable skill with fewer guesswork edits.

If you are not sure where to start, use the examples as authoring blueprints instead of copying folders manually:

```bash
openclaw-skillkit init ./skills/weather-research-skill --template scripts
openclaw-skillkit init ./skills/customer-support-triage-skill --template references
```

Skill Studio now surfaces the same adaptation path directly in each example card, including a prefilled create form, the recommended template, and the first workflow step to borrow.

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
Status: READY TO PACKAGE
Summary: 0 error(s), 0 warning(s), 1 file(s) checked.
  Confidence: no blocking issues or warnings were found.
Next:
  1. Pack when ready: openclaw-skillkit pack /tmp/openclaw-skillkit-repo/examples/weather-research-skill
  2. Run a full review before handoff: openclaw-skillkit review /tmp/openclaw-skillkit-repo/examples/weather-research-skill
```

Example actionable failure output:

```text
Linting /tmp/openclaw-skillkit-repo/test/fixtures/invalid/bad-version-skill
  ERROR [invalid-frontmatter-version] SKILL.md: Frontmatter version must look like semver. Received "version1".
    Fix: Use a semver-style version such as "0.1.0" or "1.2.3-beta.1".
Summary: 2 error(s), 2 warning(s), 1 file(s) checked.
Next:
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

`pack` runs lint first and refuses to create a `.skill` archive if blocking errors exist. It also skips nested `.skill` files and writes `.openclaw-skillkit/manifest.json` into the archive so adopters can inspect exactly what was bundled, including per-file sizes and hashes.

```bash
openclaw-skillkit pack skills/customer-support
openclaw-skillkit pack skills/customer-support --output ./artifacts/customer-support.skill
openclaw-skillkit pack skills/customer-support --report
openclaw-skillkit pack skills/customer-support --output ./artifacts/customer-support.skill --json
```

If you are already inside a skill directory:

```bash
openclaw-skillkit pack
```

Example success output:

```text
PACKAGED SUCCESSFULLY
Archive ready: /tmp/openclaw-skillkit-repo/artifacts/customer-support.skill
  Skill: customer-support@0.1.0 (4 bundled file(s) plus manifest, 1.3 KB).
  Confidence: the archive includes an embedded manifest for later inspection.
  Contents: SKILL.md, references/README.md, scripts/example.sh, assets/README.txt
Next:
  1. Inspect the shipped artifact: openclaw-skillkit inspect /tmp/openclaw-skillkit-repo/artifacts/customer-support.skill
  2. Verify source parity: openclaw-skillkit inspect /tmp/openclaw-skillkit-repo/artifacts/customer-support.skill --source ./path-to-skill
```

Use `--report` to write a Markdown handoff summary next to the archive by default, or pass an explicit path such as `--report ./artifacts/customer-support.report.md`.

`pack --json` emits archive metadata for CI artifacts, release automation, editor tooling, and release note pipelines. The JSON payload now also includes the generated report markdown and report path when requested.

### 4. Inspect the final artifact before publishing

Use `inspect` to verify the packaged manifest instead of trusting a zip file blindly:

```bash
openclaw-skillkit inspect ./artifacts/customer-support.skill
openclaw-skillkit inspect ./artifacts/customer-support.skill --source ./skills/customer-support
openclaw-skillkit inspect ./artifacts/customer-support.skill --source ./skills/customer-support --report
openclaw-skillkit inspect ./artifacts/customer-support.skill --json
```

Adding `--source` compares the archive to a current skill directory so you can catch drift before review or publication. That comparison reports:

- frontmatter metadata drift
- files that changed since packaging
- files missing from the current source
- new source files not present in the archive

The text, JSON, Studio, and Markdown report outputs now all include the same trust summary so reviewers can quickly see whether the manifest was verified, whether metadata still matches, and whether the archive still reflects the current source.

Adding `--report` exports the same inspection as a Markdown review artifact that is easier to attach to release notes, share in PRs, or hand to reviewers who do not want raw JSON.

### 5. Run a release-readiness review before handoff

`review` is the lean preflight command for answering "is this skill actually ready to ship?" without manually chaining multiple steps. It:

- runs lint and summarizes blocking issues and warnings
- packages the skill when lint passes
- compares the packaged archive back to the current source directory
- optionally writes a Markdown readiness report for handoff or release notes

```bash
openclaw-skillkit review skills/customer-support
openclaw-skillkit review skills/customer-support --output ./artifacts/customer-support.skill --report
openclaw-skillkit review skills/customer-support --json
```

If blocking lint errors remain, `review` exits non-zero and does not create an archive. When the skill is ready, the report captures both authoring quality and artifact trust in one place.

That review output now includes a small release scorecard across CLI, Studio, JSON, and exported Markdown so the handoff answer is explicit: what passed, what needs attention, and whether the shipped artifact is still trustworthy.

## Commands

| Command | Purpose |
| --- | --- |
| `openclaw-skillkit help` | Show CLI help. |
| `openclaw-skillkit help init` | Show scaffold options and flags. |
| `openclaw-skillkit help lint` | Show lint modes, including JSON output. |
| `openclaw-skillkit help pack` | Show packaging behavior, output options, JSON reporting, and report export. |
| `openclaw-skillkit help inspect` | Show artifact inspection, drift comparison, and report export usage. |
| `openclaw-skillkit help review` | Show the combined release-readiness workflow and report export usage. |
| `openclaw-skillkit help serve` | Show local studio host and port options. |
| `openclaw-skillkit serve` | Start the local Skill Studio web interface. |
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
- packaged archives include skill metadata plus per-file sizes and hashes, and avoid recursively bundling old `.skill` artifacts
- `inspect` lets authors and reviewers confirm the manifest from the built artifact itself, compare it against the current source directory for drift, and export a review-ready Markdown report
- `review` provides a single readiness verdict that covers lint status, archive creation, and source-to-artifact parity before handoff
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
