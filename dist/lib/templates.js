"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EXAMPLE_ASSET = exports.EXAMPLE_SCRIPT = exports.EXAMPLE_REFERENCE = exports.DEFAULT_SKILL_MD = void 0;
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

## Workflow
1. Confirm the user's goal, required inputs, and any missing context.
2. Gather the minimum information needed to complete the task reliably.
3. Produce the result in a concise format that is easy to review.

## Constraints
- Ask for clarification when required inputs are missing.
- Prefer verifiable information over assumptions.
- Keep the output focused on the user's requested outcome.
`;
exports.EXAMPLE_REFERENCE = `# Notes

Store short supporting docs here that the skill can cite, summarize, or follow.
Keep files task-specific so reviewers can see why each reference exists.
`;
exports.EXAMPLE_SCRIPT = `#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: ./scripts/example.sh <input>" >&2
  exit 1
fi

echo "Replace this script with a real workflow for: $1"
`;
exports.EXAMPLE_ASSET = `Use this folder for reusable templates, prompts, or example outputs that support the skill.`;
