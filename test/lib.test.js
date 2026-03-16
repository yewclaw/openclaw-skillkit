"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const { parseFrontmatter } = require("../dist/lib/frontmatter.js");
const { lintSkill } = require("../dist/lib/skill.js");

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

test("lintSkill accepts a valid fixture with only optional-directory warnings removed", async () => {
  const skillDir = path.resolve(__dirname, "fixtures", "valid", "basic-skill");
  const result = await lintSkill(skillDir);

  assert.equal(result.fileCount, 1);
  assert.deepEqual(result.issues, [
    {
      level: "warning",
      message: "Optional directory not found: examples/"
    }
  ]);
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
