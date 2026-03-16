---
name: customer-support-triage-skill
description: Triage inbound support tickets into severity, routing, and customer-safe next steps.
version: 0.1.0
---

# Customer Support Triage Skill

## Purpose
Turn raw support requests into a structured triage summary that an ops or support team can act on quickly.

## Use When
- A user pastes a support ticket, escalation note, or bug report that needs fast routing.
- The response should separate severity, likely product area, and the next action for the support queue.

## Workflow
1. Review the routing rules in [Support Routing Guide](references/support-routing-guide.md) before assigning ownership or severity.
2. Capture the core customer impact, affected surface area, and any missing details needed for reproduction.
3. Use [the helper parser](scripts/parse-ticket.sh) to normalize large pasted tickets into a short evidence block when the input is noisy.
4. Return a triage summary with severity, owning team, customer response recommendation, and follow-up questions.

## Output
- `Severity`: low, medium, high, or urgent with a one-line reason.
- `Owner`: the recommended queue or team.
- `Customer Reply`: a concise, non-committal next-step message the support agent can send.
- `Follow-Up`: the minimum extra details needed if the ticket is not yet actionable.

## Constraints
- Do not promise fixes, timelines, or root causes unless the source text already confirms them.
- Escalate account lockouts, payment failures, and production outages using the highest matching rule in the routing guide.
- Keep the summary short enough to drop directly into a ticketing system comment.
