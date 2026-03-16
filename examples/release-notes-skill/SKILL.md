---
name: release-notes-skill
description: Convert engineering change notes into customer-facing release notes with clear risk framing.
version: 0.1.0
---

# Release Notes Skill

## Purpose
Draft concise release notes that explain what changed, who is affected, and what customers should do next.

## Use When
- A team has a changelog, merged PR summary, or launch checklist that needs customer-facing release notes.
- The output should be consistent with the product voice and rollout guidance in [Release Style Guide](references/release-style-guide.md).

## Workflow
1. Review [Release Style Guide](references/release-style-guide.md) and [launch-example.md](assets/launch-example.md) for tone, structure, and rollout expectations.
2. Separate user-facing outcomes from internal implementation details.
3. Group changes into themes such as new capability, fix, performance improvement, or deprecation.
4. Produce release notes with a headline, short summary, impact statement, and any action customers need to take.

## Output
- A release headline.
- Two to four bullets covering visible changes.
- An `Impact` note that clarifies availability, rollout stage, or affected audience.
- An `Action Required` note only when customers must change behavior.

## Constraints
- Avoid internal jargon, ticket IDs, and implementation-specific detail unless the audience needs them.
- Flag rollout uncertainty instead of implying global availability.
- Keep the final draft readable in product UI, email, or changelog formats.
