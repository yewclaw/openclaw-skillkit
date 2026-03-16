export const DEFAULT_SKILL_MD = `---
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

## Workflow
1. Confirm the user's goal, required inputs, and any missing context.
2. Gather the minimum information needed to complete the task reliably.
3. Produce the result in a concise format that is easy to review.

## Constraints
- Ask for clarification when required inputs are missing.
- Prefer verifiable information over assumptions.
- Keep the output focused on the user's requested outcome.
`;

export const TEMPLATE_MODES = {
  minimal: [],
  references: ["references"],
  scripts: ["references", "scripts"],
  full: ["references", "scripts", "assets"]
} as const;

export type TemplateMode = keyof typeof TEMPLATE_MODES;

export const EXAMPLE_REFERENCE = `# Notes

Store short supporting docs here that the skill can cite, summarize, or follow.
Good examples: API quirks, policy notes, output rubrics, or edge-case checklists.
`;

export const EXAMPLE_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: ./scripts/example.sh <input>" >&2
  exit 1
fi

printf 'todo: replace with a real workflow for "%s"\n' "$1"
`;

export const EXAMPLE_ASSET = `Use this folder for reusable templates, prompts, or example outputs that support the skill.`;
