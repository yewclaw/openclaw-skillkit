"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

const { makeTempDir } = require("./helpers/fixture.js");
const { parseFrontmatter } = require("../dist/lib/frontmatter.js");
const { lintSkill } = require("../dist/lib/skill.js");
const {
  buildArchiveReport,
  buildReviewReport,
  compareArchiveToSource,
  compareArchives,
  packSkill,
  reviewSkill,
  summarizeReleaseDelta
} = require("../dist/lib/workflow.js");
const {
  classifyLintResult,
  evaluateDetectionCases,
  formatRatio
} = require("../dist/lib/evaluation.js");

test("parseFrontmatter returns attributes and body", () => {
  const parsed = parseFrontmatter(`---
name: sample-skill
description: "Sample description"
version: 1.0.0
---

# Title
`);

  assert.deepEqual(parsed.attributes, {
    name: "sample-skill",
    description: "Sample description",
    version: "1.0.0"
  });
  assert.equal(parsed.hasFrontmatter, true);
  assert.match(parsed.body, /# Title/);
});

test("parseFrontmatter rejects malformed frontmatter", () => {
  assert.throws(
    () => parseFrontmatter(`---
name sample-skill
---

# Title
`),
    /Invalid frontmatter line/
  );
});

test("lintSkill accepts a valid fixture without optional-directory noise", async () => {
  const skillDir = path.resolve(__dirname, "fixtures", "valid", "basic-skill");
  const result = await lintSkill(skillDir);

  assert.equal(result.fileCount, 1);
  assert.deepEqual(result.issues, []);
});

test("lintSkill accepts the bundled example skills", async () => {
  const exampleDirs = [
    path.resolve(__dirname, "..", "examples", "weather-research-skill"),
    path.resolve(__dirname, "..", "examples", "customer-support-triage-skill"),
    path.resolve(__dirname, "..", "examples", "release-notes-skill")
  ];

  for (const skillDir of exampleDirs) {
    const result = await lintSkill(skillDir);
    assert.deepEqual(result.issues, [], skillDir);
  }
});

test("lintSkill reports missing skill file", async () => {
  const skillDir = path.resolve(__dirname, "fixtures", "invalid", "missing-skill-file");
  const result = await lintSkill(skillDir);

  assert.equal(result.issues.length, 1);
  assert.deepEqual(result.issues[0], {
    level: "error",
    code: "missing-skill-file",
    category: "filesystem",
    file: ".",
    message: "Missing SKILL.md at the skill root.",
    suggestion: 'Run "openclaw-skillkit init <dir>" or add SKILL.md before packaging this skill.'
  });
});

test("lintSkill rejects invalid skill names", async () => {
  const skillDir = path.resolve(__dirname, "fixtures", "benchmark", "bad", "invalid-name-skill");
  const result = await lintSkill(skillDir);

  assert.match(
    result.issues.map((issue) => issue.message).join("\n"),
    /Frontmatter name must use lowercase letters, numbers, and single hyphens/
  );
});

test("lintSkill detects missing local markdown references", async () => {
  const skillDir = path.resolve(__dirname, "fixtures", "benchmark", "bad", "broken-reference-skill");
  const result = await lintSkill(skillDir);

  assert.match(
    result.issues.map((issue) => issue.message).join("\n"),
    /Referenced local file not found: references\/missing\.md/
  );
});

test("lintSkill rejects local references that escape the skill root", async () => {
  const skillDir = await makeTempDir("openclaw-reference-escape-");
  const outsideReference = path.join(path.dirname(skillDir), "outside.md");
  await fs.writeFile(outsideReference, "# Not bundled\n");
  await fs.writeFile(path.join(skillDir, "SKILL.md"), `---
name: escaped-reference-check
description: Skill for catching local references that packaging cannot safely bundle.
version: 1.0.0
---

# Escaped Reference Check

## Purpose
Keep local references self-contained.

## Workflow
1. Review the local guide at [Outside](../${path.basename(outsideReference)}).
2. Summarize the required steps.

## Constraints
- Only link to bundled files.
`);

  const result = await lintSkill(skillDir);

  assert.match(
    result.issues.map((issue) => issue.message).join("\n"),
    /Referenced local file escapes the skill root/
  );
});

test("lintSkill rejects local references that point to directories", async () => {
  const skillDir = await makeTempDir("openclaw-reference-directory-");
  await fs.mkdir(path.join(skillDir, "references"), { recursive: true });
  await fs.writeFile(path.join(skillDir, "SKILL.md"), `---
name: directory-reference-check
description: Skill for catching local references that point at directories instead of bundled files.
version: 1.0.0
---

# Directory Reference Check

## Purpose
Keep links precise.

## Workflow
1. Review the local guide at [References](references/).
2. Continue the task.

## Constraints
- Link to concrete files only.
`);

  const result = await lintSkill(skillDir);

  assert.match(
    result.issues.map((issue) => issue.message).join("\n"),
    /Referenced local path is a directory: references\//
  );
});

test("lintSkill warns on placeholder descriptions", async () => {
  const skillDir = path.resolve(__dirname, "fixtures", "benchmark", "bad", "placeholder-description-skill");
  const result = await lintSkill(skillDir);

  assert.match(
    result.issues.map((issue) => issue.message).join("\n"),
    /Frontmatter description looks like placeholder copy/
  );
});

test("lintSkill warns on scaffold placeholder body copy", async () => {
  const skillDir = path.resolve(__dirname, "fixtures", "benchmark", "bad", "placeholder-body-skill");
  const result = await lintSkill(skillDir);

  assert.match(
    result.issues.map((issue) => issue.message).join("\n"),
    /SKILL\.md still contains scaffold placeholder copy/
  );
});

test("lintSkill returns machine-readable issue metadata and suggestions", async () => {
  const skillDir = path.resolve(__dirname, "fixtures", "benchmark", "bad", "broken-reference-skill");
  const result = await lintSkill(skillDir);
  const issue = result.issues.find((entry) => entry.code === "missing-local-reference");

  assert.deepEqual(issue, {
    level: "error",
    code: "missing-local-reference",
    category: "references",
    file: "SKILL.md",
    message: "Referenced local file not found: references/missing.md",
    suggestion: "Create references/missing.md or update the markdown link to point at an existing bundled file."
  });
});

test("lintSkill warns when the workflow section is not expressed as numbered steps", async () => {
  const skillDir = await makeTempDir("openclaw-workflow-warning-");
  await fs.writeFile(path.join(skillDir, "SKILL.md"), `---
name: workflow-gap
description: Skill for catching weak workflow guidance before packaging.
version: 1.0.0
---

# Workflow Gap

## Purpose
Help the model complete a task.

## Workflow
- Do the thing.

## Constraints
- Stay grounded.
`);

  const result = await lintSkill(skillDir);

  assert.match(
    result.issues.map((issue) => issue.message).join("\n"),
    /The "## Workflow" section should include numbered steps\./
  );
});

test("lintSkill warns when bundled scripts are not executable", async () => {
  const skillDir = await makeTempDir("openclaw-script-mode-");
  const scriptsDir = path.join(skillDir, "scripts");
  await fs.mkdir(scriptsDir, { recursive: true });
  await fs.writeFile(path.join(skillDir, "SKILL.md"), `---
name: script-mode-check
description: Skill for catching packaged scripts that will fail when invoked directly.
version: 1.0.0
---

# Script Mode Check

## Purpose
Catch broken script packaging before release.

## Workflow
1. Run the helper script.
2. Validate the output.

## Constraints
- Keep the workflow reproducible.
`);
  await fs.writeFile(path.join(scriptsDir, "example.sh"), "#!/usr/bin/env bash\necho test\n");

  const result = await lintSkill(skillDir);

  assert.match(
    result.issues.map((issue) => issue.message).join("\n"),
    /Script is not executable: scripts\/example\.sh/
  );
});

test("workflow helpers can compare archives across releases", async () => {
  const tempDir = await makeTempDir("openclaw-release-compare-");
  const skillDir = path.join(tempDir, "skill");
  const baselineArchivePath = path.join(tempDir, "baseline.skill");
  const currentArchivePath = path.join(tempDir, "current.skill");
  await fs.mkdir(path.join(skillDir, "references"), { recursive: true });
  await fs.writeFile(path.join(skillDir, "references", "README.md"), "# Guide\nOriginal\n");
  await fs.writeFile(path.join(skillDir, "SKILL.md"), `---
name: release-compare
description: Compare shipped skill archives between releases.
version: 1.0.0
---

# Release Compare

## Purpose
Compare release artifacts.

## Workflow
1. Inspect the baseline release.
2. Inspect the new release.

## Constraints
- Keep packaging deterministic.
`);

  await packSkill(skillDir, baselineArchivePath);
  await fs.appendFile(path.join(skillDir, "references", "README.md"), "Updated\n");
  await fs.writeFile(path.join(skillDir, "assets.md"), "new file\n");
  await fs.writeFile(path.join(skillDir, "SKILL.md"), `---
name: release-compare
description: Compare shipped skill archives between releases.
version: 1.1.0
---

# Release Compare

## Purpose
Compare release artifacts.

## Workflow
1. Inspect the baseline release.
2. Inspect the new release.

## Constraints
- Keep packaging deterministic.
`);

  await packSkill(skillDir, currentArchivePath);

  const compared = await compareArchives(currentArchivePath, baselineArchivePath);

  assert.equal(compared.releaseComparison.matches, false);
  assert.equal(compared.releaseComparison.metadataDifferences.some((entry) => entry.field === "version"), true);
  assert.equal(compared.releaseComparison.changedEntries.some((entry) => entry.path === "references/README.md"), true);
  assert.deepEqual(compared.releaseComparison.addedEntries, ["assets.md"]);

  const summary = summarizeReleaseDelta(compared);
  assert.equal(summary.status, "release-changed");
  assert.match(summary.headline, /Release delta detected/);

  const report = buildArchiveReport(compared);
  assert.match(report, /## Release Delta/);
  assert.match(report, /### Changed Since Baseline/);
  assert.match(report, /### Added Since Baseline/);
});

test("compareArchiveToSource detects drift and manifest hashes after packaging", async () => {
  const skillDir = await makeTempDir("openclaw-compare-");
  const archivePath = path.join(skillDir, "artifact.skill");
  await fs.mkdir(path.join(skillDir, "references"), { recursive: true });
  await fs.writeFile(path.join(skillDir, "references", "README.md"), "# Guide\n");
  await fs.writeFile(path.join(skillDir, "SKILL.md"), `---
name: compare-check
description: Skill for validating archive and source comparison.
version: 1.0.0
---

# Compare Check

## Purpose
Verify that artifact inspection can detect source drift.

## Workflow
1. Read [the guide](references/README.md).
2. Package the skill.

## Constraints
- Keep the packaged artifact trustworthy.
`);

  const packed = await packSkill(skillDir, archivePath);
  assert.equal(packed.manifest.schemaVersion, 2);
  assert.equal(typeof packed.manifest.entries[0].sha256, "string");

  await fs.writeFile(path.join(skillDir, "references", "README.md"), "# Guide\nUpdated after packaging.\n");

  const inspected = await compareArchiveToSource(archivePath, skillDir);
  assert.equal(inspected.comparison.matches, false);
  assert.equal(inspected.comparison.changedEntries[0].path, "references/README.md");
  assert.equal(inspected.comparison.changedEntries[0].reason, "size-mismatch");
  const report = buildArchiveReport(inspected);
  assert.match(report, /# OpenClaw Skill Archive Report/);
  assert.match(report, /Status: drift detected/);
  assert.match(report, /### Changed Files/);
});

test("reviewSkill produces a ready verdict and combined review report for a valid skill", async () => {
  const skillDir = path.resolve(__dirname, "fixtures", "valid", "basic-skill");
  const tempDir = await makeTempDir("openclaw-review-valid-");
  const archivePath = path.join(tempDir, "artifact.skill");

  const review = await reviewSkill(skillDir, archivePath);

  assert.equal(review.readiness, "ready");
  assert.equal(review.lint.summary.errors, 0);
  assert.equal(review.archive.destination, archivePath);
  assert.equal(review.archive.comparison.matches, true);
  const report = buildReviewReport(review);
  assert.match(report, /# OpenClaw Skill Review Report/);
  assert.match(report, /Verdict: ready to ship/);
});

test("reviewSkill stops before packaging when blocking lint errors remain", async () => {
  const skillDir = path.resolve(__dirname, "fixtures", "invalid", "bad-version-skill");

  const review = await reviewSkill(skillDir);

  assert.equal(review.readiness, "not-ready");
  assert.equal(review.archive, undefined);
  assert.equal(review.lint.summary.errors > 0, true);
  assert.match(buildReviewReport(review), /Archive not created because blocking lint errors remain\./);
});

test("evaluation helpers summarize good-vs-bad detection metrics", () => {
  const metrics = evaluateDetectionCases([
    { name: "good-1", expected: "good", predicted: "good" },
    { name: "good-2", expected: "good", predicted: "bad" },
    { name: "bad-1", expected: "bad", predicted: "bad" },
    { name: "bad-2", expected: "bad", predicted: "good" }
  ]);

  assert.deepEqual(metrics, {
    total: 4,
    correct: 2,
    accuracy: 0.5,
    precision: 0.5,
    recall: 0.5,
    truePositives: 1,
    falsePositives: 1,
    falseNegatives: 1
  });
  assert.equal(formatRatio(metrics.accuracy), "50.0%");
});

test("classifyLintResult marks lint errors as bad skills", async () => {
  const validSkillDir = path.resolve(__dirname, "fixtures", "benchmark", "good", "linked-reference-skill");
  const invalidSkillDir = path.resolve(__dirname, "fixtures", "benchmark", "bad", "invalid-name-skill");
  const placeholderSkillDir = path.resolve(
    __dirname,
    "fixtures",
    "benchmark",
    "bad",
    "placeholder-description-skill"
  );
  const placeholderBodySkillDir = path.resolve(
    __dirname,
    "fixtures",
    "benchmark",
    "bad",
    "placeholder-body-skill"
  );

  assert.equal(classifyLintResult(await lintSkill(validSkillDir)), "good");
  assert.equal(classifyLintResult(await lintSkill(invalidSkillDir)), "bad");
  assert.equal(classifyLintResult(await lintSkill(placeholderSkillDir)), "bad");
  assert.equal(classifyLintResult(await lintSkill(placeholderBodySkillDir)), "bad");
});
