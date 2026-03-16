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
Explain what this skill helps the model do.

## Usage
- Add the trigger conditions.
- Describe the expected workflow.

## Constraints
- List important guardrails.
`;
exports.EXAMPLE_REFERENCE = `# Notes

Use this folder for supporting docs that the skill can cite or summarize.
`;
exports.EXAMPLE_SCRIPT = `#!/usr/bin/env bash
echo "Replace this helper with a real workflow script."
`;
exports.EXAMPLE_ASSET = `This folder can hold templates, prompts, or example outputs.`;
