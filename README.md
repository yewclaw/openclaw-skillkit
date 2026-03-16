# openclaw-skillkit

Build OpenClaw skills without building a framework around them.

`openclaw-skillkit` is a lean TypeScript + Node.js CLI for the three jobs skill authors actually need on day one:

- `init` to scaffold a clean skill directory
- `lint` to catch broken structure and bad frontmatter early
- `pack` to turn a skill into a portable `.skill` archive

The project is intentionally small, readable, and easy to fork. The goal is fast adoption, not ceremony.

## Quickstart

```bash
npm install
npm run build
npx openclaw-skillkit init my-skill --resources references,scripts,assets
npx openclaw-skillkit lint my-skill
npx openclaw-skillkit pack my-skill
```

If you want to run the checked-in build directly in this repo:

```bash
node dist/cli.js init my-skill --resources references,scripts
node dist/cli.js lint my-skill
node dist/cli.js pack my-skill
```

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

Validate a skill directory. Current checks:

- `SKILL.md` exists and is not empty
- frontmatter is parseable
- `name`, `description`, and `version` are checked if frontmatter exists
- the markdown contains a title and at least one section
- common resource directories are flagged as optional warnings when absent

```bash
openclaw-skillkit lint skills/customer-support
```

Example output:

```text
Linting /tmp/openclaw-skillkit-repo/examples/weather-research-skill
  WARNING: Optional directory not found: assets/
  WARNING: Optional directory not found: examples/
Summary: 0 error(s), 2 warning(s).
```

### `pack`

Package a skill directory into a `.skill` archive. The archive format is a standard ZIP container with a `.skill` extension.

```bash
openclaw-skillkit pack skills/customer-support
openclaw-skillkit pack skills/customer-support --output ./artifacts/customer-support.skill
```

`pack` runs lint checks first and refuses to build an archive if lint errors exist.

## Example Skill

A minimal example lives in `examples/weather-research-skill/`.

Use it to test the toolkit quickly:

```bash
node dist/cli.js lint examples/weather-research-skill
node dist/cli.js pack examples/weather-research-skill
```

## Project Layout

```text
src/
  cli.ts
  commands/
  lib/
dist/
  cli.js
examples/
  weather-research-skill/
```

## Notes

- Runtime dependencies are intentionally avoided to keep the MVP portable.
- The checked-in `dist/` build lets the repo work immediately even before local compilation.
- `npm run build` uses `tsc` once dependencies are installed.
