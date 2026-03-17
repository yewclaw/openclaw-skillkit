"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

const { makeTempDir } = require("./helpers/fixture.js");
const { getStudioAssets } = require("../dist/commands/serve.js");
const { listExampleSkills, packSkill, inspectSkillArchive } = require("../dist/lib/workflow.js");

test("studio assets expose the local app shell and workflow controls", () => {
  const assets = getStudioAssets();

  assert.match(assets.html, /OpenClaw Skill Studio/);
  assert.match(assets.html, /One Clear Skill Pipeline/);
  assert.match(assets.html, /id="status-title"/);
  assert.match(assets.html, /id="init-form"/);
  assert.match(assets.html, /id="init-target-dir"/);
  assert.match(assets.html, /id="inspect-form"/);
  assert.match(assets.html, /id="inspect-source-input"/);
  assert.match(assets.html, /id="review-button"/);
  assert.match(assets.html, /id="review-summary"/);
  assert.match(assets.html, /id="review-result"/);
  assert.match(assets.html, /id="inspect-summary"/);
  assert.match(assets.html, /Recommended flow:/);
  assert.match(assets.css, /\.hero/);
  assert.match(assets.css, /\.summary-grid/);
  assert.match(assets.css, /\.summary-card/);
  assert.match(assets.css, /\.step-grid/);
  assert.match(assets.css, /\.status-banner/);
  assert.match(assets.css, /\.panel/);
  assert.match(assets.css, /\.command-card/);
  assert.match(assets.js, /api\("\/api\/lint"/);
  assert.match(assets.js, /api\("\/api\/review"/);
  assert.match(assets.js, /formatPackResult/);
  assert.match(assets.js, /formatReviewResult/);
  assert.match(assets.js, /renderSummaryCards/);
  assert.match(assets.js, /buildReviewSummaryCards/);
  assert.match(assets.js, /buildInspectSummaryCards/);
  assert.match(assets.js, /compareArchiveToSource|source comparison/i);
  assert.match(assets.js, /Release report:/);
  assert.match(assets.js, /Prefill create form/);
  assert.match(assets.js, /setResourceSelections/);
  assert.match(assets.js, /setStatus\("Ready to author"/);
  assert.match(assets.js, /PACKAGED SUCCESSFULLY/);
  assert.match(assets.js, /Next steps:/);
});

test("workflow helpers surface example skills for the studio", async () => {
  const examples = await listExampleSkills(path.resolve(__dirname, ".."));

  assert.equal(examples.length >= 3, true);
  assert.equal(examples.some((example) => example.name === "weather-research-skill"), true);
  assert.equal(examples.some((example) => example.resources.includes("scripts")), true);
  const weatherExample = examples.find((example) => example.name === "weather-research-skill");
  assert.equal(weatherExample.recommendedTemplate, "scripts");
  assert.match(weatherExample.starterCommand, /openclaw-skillkit init \.\/skills\/weather-research-skill --template scripts/);
  assert.equal(weatherExample.useCases.length > 0, true);
  assert.equal(weatherExample.workflowSteps.length > 0, true);
});

test("workflow helpers can pack and inspect a scaffolded studio skill", async () => {
  const tempDir = await makeTempDir("openclaw-studio-workflow-");
  const skillDir = path.join(tempDir, "studio-skill");
  const archivePath = path.join(tempDir, "studio-skill.skill");

  await fs.mkdir(path.join(skillDir, "references"), { recursive: true });
  await fs.mkdir(path.join(skillDir, "scripts"), { recursive: true });
  await fs.writeFile(path.join(skillDir, "references", "README.md"), "# Guide\n");
  await fs.writeFile(path.join(skillDir, "scripts", "example.sh"), "#!/usr/bin/env bash\necho ok\n");
  await fs.chmod(path.join(skillDir, "scripts", "example.sh"), 0o755);
  await fs.writeFile(path.join(skillDir, "SKILL.md"), `---
name: studio-skill
description: Skill for testing the local studio packaging helpers.
version: 1.0.0
---

# Studio Skill

## Purpose
Exercise the local workflow.

## Workflow
1. Read [the guide](references/README.md).
2. Run the helper script.
3. Package the skill.

## Constraints
- Keep the workflow reproducible.
`);

  const packed = await packSkill(skillDir, archivePath);
  assert.equal(packed.destination, archivePath);
  assert.equal(packed.manifest.skill.name, "studio-skill");

  const inspected = await inspectSkillArchive(archivePath);
  assert.equal(inspected.manifest.skill.name, "studio-skill");
  assert.equal(inspected.manifest.entries.some((entry) => entry.path === "scripts/example.sh"), true);
});
