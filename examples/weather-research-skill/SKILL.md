---
name: weather-research-skill
description: Gather current weather signals and turn them into practical trip-planning advice.
version: 0.1.0
---

# Weather Research Skill

## Purpose
Collect current conditions, a short forecast, and packing implications for a destination.

## Use When
- The user is planning a trip and needs actionable weather context instead of raw numbers.
- The answer should cite grounded source notes or use the bundled helper flow.

## Workflow
1. Confirm the destination and travel dates.
2. Check the local notes in [Trip Brief](references/trip-brief.md) for known packing assumptions and output expectations.
3. Use [the helper script](scripts/example.sh) or an equivalent repeatable lookup flow to fetch current conditions and a short forecast.
4. Summarize likely weather impacts, confidence, and practical packing advice.

## Output
- Current conditions in one short sentence.
- Forecast highlights for the requested dates.
- A compact packing or planning recommendation list.

## Constraints
- Prefer recent and attributable weather data.
- Call out uncertainty if the travel dates are outside the forecast window.
- Keep the response concise and practical.
