"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXAMPLE_ASSET = exports.EXAMPLE_SCRIPT = exports.EXAMPLE_REFERENCE = exports.TEMPLATE_MODES = exports.DEFAULT_SKILL_MD = void 0;
exports.DEFAULT_SKILL_MD = `---
name: {{name}}
description: {{description}}
version: 0.1.0
---

# {{title}}

## Purpose
Help the model execute {{title}} work with a predictable, reviewable workflow.

## Use When
- The user needs {{titleLower}} help with a clear outcome.
- The task benefits from a repeatable sequence instead of free-form improvisation.

## Inputs
- The user's goal, constraints, and required output format.
- Any local references, policies, examples, or helper scripts that should shape the result.

## Workflow
1. Confirm the user's goal, required inputs, and any missing context.
2. Gather the minimum information needed to complete the task reliably.
3. Produce the result in a concise format that is easy to review.

## Output
- Return the final result in the format the user asked for.
- Call out any missing inputs, assumptions, or follow-up actions.

## Constraints
- Ask for clarification when required inputs are missing.
- Prefer verifiable information over assumptions.
- Keep the output focused on the user's requested outcome.

## Customization Checklist
1. Replace this scaffold text with domain-specific steps, checks, and language.
2. Add local links under \`references/\`, \`scripts/\`, or \`assets/\` when they improve repeatability.
3. Run \`skillforge lint .\` before packaging the skill.
`;
exports.TEMPLATE_MODES = {
    minimal: [],
    references: ["references"],
    scripts: ["references", "scripts"],
    full: ["references", "scripts", "assets"]
};
exports.EXAMPLE_REFERENCE = `# Notes

Store short supporting docs here that the skill can cite, summarize, or follow.
Good examples: API quirks, policy notes, output rubrics, or edge-case checklists.
`;
exports.EXAMPLE_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: ./scripts/example.sh <input>" >&2
  exit 1
fi

printf 'todo: replace with a real workflow for "%s"\n' "$1"
`;
exports.EXAMPLE_ASSET = `Use this folder for reusable templates, prompts, or example outputs that support the skill.`;
