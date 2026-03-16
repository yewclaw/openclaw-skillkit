"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { parseFrontmatter } = require("../dist/lib/frontmatter.js");
const { lintSkill } = require("../dist/lib/skill.js");
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

test("lintSkill reports missing skill file", async () => {
  const skillDir = path.resolve(__dirname, "fixtures", "invalid", "missing-skill-file");
  const result = await lintSkill(skillDir);

  assert.deepEqual(result.issues, [
    {
      level: "error",
      message: "Missing SKILL.md at the skill root."
    }
  ]);
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
    /Referenced markdown file not found: references\/missing\.md/
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
