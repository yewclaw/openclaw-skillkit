---
name: linked-reference-skill
description: Skill for grounded answers that rely on a local reference note.
version: 1.0.0
---

# Linked Reference Skill

## Purpose
Guide the model to use the bundled reference for stable instructions.

## Workflow
1. Read [the reference](references/guide.md) before answering.
2. Extract the relevant instruction or fact.
3. Answer using the local guide as the primary source.

## Constraints
Keep the answer aligned with the local guide.
