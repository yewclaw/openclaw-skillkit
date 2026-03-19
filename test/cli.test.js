"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

const { copyFixture, makeTempDir, readArchiveEntries, readArchiveEntry } = require("./helpers/fixture.js");
const { main } = require("../dist/cli.js");

const serialTest = (name, fn) => test(name, { concurrency: false }, fn);

function runCli(args, options = {}) {
  return captureCliOutput(args, options.cwd);
}

async function captureCliOutput(args, cwd) {
  const originalCwd = process.cwd();
  const originalExitCode = process.exitCode;
  const logs = [];
  const errors = [];
  const originalLog = console.log;
  const originalError = console.error;

  console.log = (...values) => {
    logs.push(values.join(" "));
  };
  console.error = (...values) => {
    errors.push(values.join(" "));
  };

  try {
    if (cwd) {
      process.chdir(cwd);
    }

    process.exitCode = 0;

    try {
      await main(args);
    } catch (error) {
      console.error(`Error: ${error.message}`);
      process.exitCode = 1;
    }

    return {
      code: process.exitCode ?? 0,
      stdout: logs.join("\n"),
      stderr: errors.join("\n")
    };
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.exitCode = originalExitCode;

    if (cwd) {
      process.chdir(originalCwd);
    }
  }
}

serialTest("cli init scaffolds a skill with requested resources", async () => {
  const tempDir = await makeTempDir("skillforge-init-");
  const targetDir = path.join(tempDir, "customer-support");

  const result = await runCli([
    "init",
    targetDir,
    "--name",
    "customer-support",
    "--description",
    "Skill for support triage",
    "--resources",
    "references,scripts,assets"
  ]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /READY TO AUTHOR/);
  assert.match(result.stdout, /Initialized skill at/);
  assert.match(result.stdout, /Template: minimal/);
  assert.match(result.stdout, /Created: SKILL\.md, references\/, scripts\/, assets\//);
  assert.match(result.stdout, /Edit: .*SKILL\.md/);
  assert.match(result.stdout, /Reference example: examples\/weather-research-skill/);
  assert.match(result.stdout, /Validate: skillforge lint /);
  assert.match(result.stdout, /Package when clean: skillforge pack /);
  const skillMarkdown = await fs.readFile(path.join(targetDir, "SKILL.md"), "utf8");
  assert.match(skillMarkdown, /name: customer-support/);
  assert.match(skillMarkdown, /## Inputs/);
  assert.match(skillMarkdown, /## Output/);
  assert.match(skillMarkdown, /## Customization Checklist/);
  assert.doesNotMatch(skillMarkdown, /Explain what this skill helps the model do\./);
  await fs.access(path.join(targetDir, "references", "README.md"));
  await fs.access(path.join(targetDir, "scripts", "example.sh"));
  await fs.access(path.join(targetDir, "assets", "README.txt"));
});

serialTest("cli init template modes scaffold practical layouts", async () => {
  const tempDir = await makeTempDir("skillforge-init-template-");
  const scriptsDir = path.join(tempDir, "ops-skill");
  const fullDir = path.join(tempDir, "full-skill");

  const scriptsResult = await runCli(["init", scriptsDir, "--template", "scripts"]);
  const fullResult = await runCli(["init", fullDir, "--template", "full"]);

  assert.equal(scriptsResult.code, 0, scriptsResult.stderr);
  assert.match(scriptsResult.stdout, /Template: scripts/);
  await fs.access(path.join(scriptsDir, "references", "README.md"));
  await fs.access(path.join(scriptsDir, "scripts", "example.sh"));
  await assert.rejects(fs.access(path.join(scriptsDir, "assets", "README.txt")));

  assert.equal(fullResult.code, 0, fullResult.stderr);
  await fs.access(path.join(fullDir, "references", "README.md"));
  await fs.access(path.join(fullDir, "scripts", "example.sh"));
  await fs.access(path.join(fullDir, "assets", "README.txt"));
});

serialTest("cli lint succeeds for a valid fixture", async () => {
  const tempDir = await makeTempDir("skillforge-lint-valid-");
  const skillDir = path.join(tempDir, "skill");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);

  const result = await runCli(["lint", skillDir]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Status: READY TO PACKAGE/);
  assert.match(result.stdout, /Confidence: no blocking issues or warnings were found\./);
  assert.match(result.stdout, /Pack when ready: skillforge pack /);
  assert.match(result.stdout, /Run a full review before handoff: skillforge review /);
});

serialTest("cli lint fails for an invalid fixture", async () => {
  const tempDir = await makeTempDir("skillforge-lint-invalid-");
  const skillDir = path.join(tempDir, "skill");
  await copyFixture(path.join("invalid", "bad-version-skill"), skillDir);

  const result = await runCli(["lint", skillDir]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /Status: BLOCKED/);
  assert.match(result.stdout, /ERROR \[invalid-frontmatter-version\] SKILL\.md: Frontmatter version must look like semver/);
  assert.match(result.stdout, /Fix: Use a semver-style version such as "0\.1\.0" or "1\.2\.3-beta\.1"\./);
  assert.match(result.stdout, /ERROR \[short-frontmatter-name\] SKILL\.md: Frontmatter name must be at least 3 characters/);
  assert.match(result.stdout, /Next:/);
  assert.match(result.stdout, /Fix blocking metadata issues first\./);
  assert.match(result.stdout, /Re-run: skillforge lint /);
});

serialTest("cli lint reports broken markdown references", async () => {
  const tempDir = await makeTempDir("skillforge-lint-reference-");
  const skillDir = path.join(tempDir, "skill");
  await copyFixture(path.join("benchmark", "bad", "broken-reference-skill"), skillDir);

  const result = await runCli(["lint", skillDir]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /Referenced local file not found: references\/missing\.md/);
});

serialTest("cli lint supports json output for CI and editor tooling", async () => {
  const tempDir = await makeTempDir("skillforge-lint-json-");
  const skillDir = path.join(tempDir, "skill");
  await copyFixture(path.join("invalid", "bad-version-skill"), skillDir);

  const result = await runCli(["lint", skillDir, "--json"]);

  assert.equal(result.code, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.skillDir, skillDir);
  assert.deepEqual(payload.summary, {
    errors: 2,
    warnings: 2,
    total: 4
  });
  assert.deepEqual(payload.focusAreas, [
    {
      category: "frontmatter",
      label: "Metadata",
      errors: 2,
      warnings: 0,
      suggestion: "Update the SKILL.md frontmatter so name, description, and version clearly identify the skill."
    },
    {
      category: "structure",
      label: "Structure",
      errors: 0,
      warnings: 2,
      suggestion: "Add the standard sections and make the workflow easy to follow as numbered steps."
    }
  ]);
  assert.match(payload.nextSteps[0], /Fix blocking metadata issues first\./);
  assert.match(payload.nextSteps[payload.nextSteps.length - 1], /Re-run: skillforge lint /);
  assert.deepEqual(payload.issues.slice(0, 2).map((issue) => issue.code), [
    "invalid-frontmatter-version",
    "short-frontmatter-name"
  ]);
  assert.equal(payload.issues[0].category, "frontmatter");
  assert.match(payload.issues[0].suggestion, /semver-style version/);
});

serialTest("cli lint can run repo-scale validation across multiple skills", async () => {
  const tempDir = await makeTempDir("skillforge-lint-all-");
  const skillsRoot = path.join(tempDir, "skills");
  await copyFixture(path.join("valid", "basic-skill"), path.join(skillsRoot, "weather"));
  await copyFixture(path.join("invalid", "bad-version-skill"), path.join(skillsRoot, "broken"));

  const result = await runCli(["lint", skillsRoot, "--all", "--json"]);

  assert.equal(result.code, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.rootDir, skillsRoot);
  assert.equal(payload.skillCount, 2);
  assert.equal(payload.summary.blocked, 1);
  assert.equal(payload.summary.ready, 1);
  assert.deepEqual(
    payload.skills.map((entry) => entry.relativeDir).sort(),
    ["broken", "weather"]
  );
  assert.match(payload.skills.find((entry) => entry.relativeDir === "broken").issues[0].code, /invalid-frontmatter-version/);
});

serialTest("cli lint --all detects duplicate skill names across directories", async () => {
  const tempDir = await makeTempDir("skillforge-lint-duplicate-");
  const skillsRoot = path.join(tempDir, "skills");
  const firstDir = path.join(skillsRoot, "first");
  const secondDir = path.join(skillsRoot, "second");
  await copyFixture(path.join("valid", "basic-skill"), firstDir);
  await copyFixture(path.join("valid", "basic-skill"), secondDir);
  await fs.writeFile(
    path.join(secondDir, "SKILL.md"),
    `---
name: weather-research
description: Another skill with a conflicting name for repo lint validation.
version: 1.0.0
---

# Duplicate Name Skill

## Purpose
Detect duplicate frontmatter names in batch lint.

## Workflow
1. Validate both skill directories.

## Constraints
- Use unique skill names.
`
  );

  const result = await runCli(["lint", skillsRoot, "--all"]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /duplicate-skill-name/);
  assert.match(result.stdout, /Frontmatter name "weather-research" is duplicated/);
});

serialTest("cli lint --all can export a markdown report", async () => {
  const tempDir = await makeTempDir("skillforge-lint-all-report-");
  const skillsRoot = path.join(tempDir, "skills");
  const reportPath = path.join(tempDir, "lint-all.md");
  await copyFixture(path.join("valid", "basic-skill"), path.join(skillsRoot, "weather"));

  const result = await runCli(["lint", skillsRoot, "--all", "--report", reportPath]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Report: /);
  const report = await fs.readFile(reportPath, "utf8");
  assert.match(report, /# SkillForge Batch Lint Report/);
  assert.match(report, /## Skills/);
  assert.match(report, /### weather/);
});

serialTest("cli pack creates a .skill archive for a valid fixture", async () => {
  const tempDir = await makeTempDir("skillforge-pack-valid-");
  const skillDir = path.join(tempDir, "skill");
  const outputPath = path.join(tempDir, "artifact.skill");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);

  const result = await runCli(["pack", skillDir, "--output", outputPath]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /PACKAGED SUCCESSFULLY/);
  assert.match(result.stdout, /Archive ready: /);
  assert.match(result.stdout, /Skill: weather-research@1\.2\.3/);
  assert.match(result.stdout, /Contents: SKILL\.md, assets\/README\.txt, references\/README\.md, scripts\/example\.sh/);
  assert.match(result.stdout, /Inspect the shipped artifact: skillforge inspect /);
  const entries = await readArchiveEntries(outputPath);
  assert.deepEqual(entries.sort(), [
    ".skillforge/manifest.json",
    "SKILL.md",
    "assets/README.txt",
    "references/README.md",
    "scripts/example.sh"
  ]);
  const manifest = JSON.parse(await readArchiveEntry(outputPath, ".skillforge/manifest.json"));
  assert.equal(manifest.schemaVersion, 2);
  assert.deepEqual(manifest.skill, {
    name: "weather-research",
    description: "Skill for structured weather research with grounded source notes.",
    version: "1.2.3"
  });
  assert.equal(manifest.entryCount, 4);
  assert.equal(manifest.totalBytes > 0, true);
  assert.deepEqual(manifest.entries.map((entry) => entry.path), [
    "SKILL.md",
    "assets/README.txt",
    "references/README.md",
    "scripts/example.sh"
  ]);
  assert.deepEqual(manifest.entries.map((entry) => typeof entry.size), [
    "number",
    "number",
    "number",
    "number"
  ]);
  assert.deepEqual(manifest.entries.map((entry) => typeof entry.sha256), [
    "string",
    "string",
    "string",
    "string"
  ]);
});

serialTest("cli pack surfaces warnings before creating the archive", async () => {
  const tempDir = await makeTempDir("skillforge-pack-warning-");
  const skillDir = path.join(tempDir, "skill");
  const outputPath = path.join(tempDir, "artifact.skill");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);

  const result = await runCli(["pack", skillDir, "--output", outputPath]);

  assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /Packing with \d+ warning\(s\):/);
});

serialTest("cli pack fails when lint errors exist", async () => {
  const tempDir = await makeTempDir("skillforge-pack-invalid-");
  const skillDir = path.join(tempDir, "skill");
  await copyFixture(path.join("invalid", "bad-version-skill"), skillDir);

  const result = await runCli(["pack", skillDir]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Cannot pack .* because lint found 2 error\(s\)\. Run "skillforge lint .*" first\./);
});

serialTest("cli pack defaults to the current directory", async () => {
  const tempDir = await makeTempDir("skillforge-pack-cwd-");
  const skillDir = path.join(tempDir, "skill");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);

  const result = await runCli(["pack"], { cwd: skillDir });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Archive ready: /);
  await fs.access(path.join(tempDir, "skill.skill"));
});

serialTest("cli pack appends .skill and creates the output directory when needed", async () => {
  const tempDir = await makeTempDir("skillforge-pack-output-");
  const skillDir = path.join(tempDir, "skill");
  const outputPath = path.join(tempDir, "artifacts", "release", "artifact");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);

  const result = await runCli(["pack", skillDir, "--output", outputPath]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Output path did not end in \.skill\. Using /);
  await fs.access(`${outputPath}.skill`);
});

serialTest("cli pack supports json output for artifact pipelines", async () => {
  const tempDir = await makeTempDir("skillforge-pack-json-");
  const skillDir = path.join(tempDir, "skill");
  const outputPath = path.join(tempDir, "artifact.skill");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);

  const result = await runCli(["pack", skillDir, "--output", outputPath, "--json"]);

  assert.equal(result.code, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.archivePath, outputPath);
  assert.equal(payload.archiveSizeBytes > 0, true);
  assert.equal(payload.archiveSizeLabel.length > 0, true);
  assert.deepEqual(payload.warnings, []);
  assert.match(payload.reportMarkdown, /# SkillForge Archive Report/);
  assert.equal(payload.manifest.skill.name, "weather-research");
  assert.deepEqual(payload.manifest.entries.map((entry) => entry.path), [
    "SKILL.md",
    "assets/README.txt",
    "references/README.md",
    "scripts/example.sh"
  ]);
});

serialTest("cli pack can export a markdown handoff report", async () => {
  const tempDir = await makeTempDir("skillforge-pack-report-");
  const skillDir = path.join(tempDir, "skill");
  const outputPath = path.join(tempDir, "artifact.skill");
  const reportPath = path.join(tempDir, "artifact-review.md");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);

  const result = await runCli(["pack", skillDir, "--output", outputPath, "--report", reportPath]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Report: /);
  const report = await fs.readFile(reportPath, "utf8");
  assert.match(report, /# SkillForge Archive Report/);
  assert.match(report, /weather-research@1\.2\.3/);
  assert.match(report, /## Reviewer Checklist/);
});

serialTest("cli pack excludes nested .skill artifacts from the archive payload", async () => {
  const tempDir = await makeTempDir("skillforge-pack-nested-artifact-");
  const skillDir = path.join(tempDir, "skill");
  const outputPath = path.join(tempDir, "artifact.skill");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);
  await fs.writeFile(path.join(skillDir, "old-release.skill"), "stale artifact");

  const result = await runCli(["pack", skillDir, "--output", outputPath]);

  assert.equal(result.code, 0, result.stderr);
  const entries = await readArchiveEntries(outputPath);
  assert.doesNotMatch(entries.join("\n"), /old-release\.skill/);
});

serialTest("cli pack rejects unsupported output extensions", async () => {
  const tempDir = await makeTempDir("skillforge-pack-extension-");
  const skillDir = path.join(tempDir, "skill");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);

  const result = await runCli(["pack", skillDir, "--output", "./artifact.zip"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Output must end with "\.skill"\. Received "\.\/artifact\.zip"\./);
});

serialTest("cli pack --all packages clean skills, blocks invalid ones, and writes an index", async () => {
  const tempDir = await makeTempDir("skillforge-pack-all-");
  const skillsRoot = path.join(tempDir, "skills");
  const artifactsDir = path.join(tempDir, "artifacts");
  const reportPath = path.join(tempDir, "pack-all.md");
  const indexPath = path.join(tempDir, "pack-all.json");
  await copyFixture(path.join("valid", "basic-skill"), path.join(skillsRoot, "weather"));
  await copyFixture(path.join("invalid", "bad-version-skill"), path.join(skillsRoot, "broken"));

  const result = await runCli([
    "pack",
    skillsRoot,
    "--all",
    "--output-dir",
    artifactsDir,
    "--index",
    indexPath,
    "--report",
    reportPath,
    "--json"
  ]);

  assert.equal(result.code, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.rootDir, skillsRoot);
  assert.equal(payload.artifactDir, artifactsDir);
  assert.equal(payload.skillCount, 2);
  assert.equal(payload.summary.packaged, 1);
  assert.equal(payload.summary.blocked, 1);
  assert.equal(payload.summary.errors, 2);
  assert.equal(payload.summary.warnings, 2);
  assert.equal(payload.indexPath, indexPath);
  assert.match(payload.reportMarkdown, /# SkillForge Batch Pack Report/);
  assert.match(payload.reportMarkdown, /## Artifact Inventory/);
  assert.match(payload.reportMarkdown, /## Maintenance Hotspots/);
  const weather = payload.skills.find((entry) => entry.relativeDir === "weather");
  const broken = payload.skills.find((entry) => entry.relativeDir === "broken");
  assert.match(weather.archive.destination, /weather\.skill$/);
  assert.equal(weather.archive.manifest.skill.name, "weather-research");
  assert.equal(broken.archive, undefined);
  assert.match(broken.issues[0].code, /invalid-frontmatter-version/);
  await fs.access(path.join(artifactsDir, "weather.skill"));
  await assert.rejects(fs.access(path.join(artifactsDir, "broken.skill")));
  const report = await fs.readFile(reportPath, "utf8");
  assert.match(report, /# SkillForge Batch Pack Report/);
  const index = JSON.parse(await fs.readFile(indexPath, "utf8"));
  assert.equal(index.summary.packaged, 1);
});

serialTest("cli pack --all blocks duplicate skill names across directories", async () => {
  const tempDir = await makeTempDir("skillforge-pack-all-duplicate-");
  const skillsRoot = path.join(tempDir, "skills");
  const firstDir = path.join(skillsRoot, "first");
  const secondDir = path.join(skillsRoot, "second");
  await copyFixture(path.join("valid", "basic-skill"), firstDir);
  await copyFixture(path.join("valid", "basic-skill"), secondDir);

  const result = await runCli(["pack", skillsRoot, "--all"]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /Duplicate names:/);
  assert.match(result.stdout, /duplicate-skill-name/);
  assert.match(result.stdout, /weather-research: 2 skill\(s\) \(first, second\)/);
});

serialTest("cli help supports command-specific output", async () => {
  const result = await runCli(["help", "pack"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /skillforge pack/);
  assert.match(result.stdout, /Create a \.skill archive after lint passes\./);
  assert.match(result.stdout, /--output-dir \.\/\.skillforge\/pack-artifacts/);
  assert.match(result.stdout, /--index \[\.\/artifacts\/batch-pack\.index\.json\]/);
  assert.match(result.stdout, /skillforge pack$/m);
});

serialTest("cli help documents the review workflow", async () => {
  const result = await runCli(["help", "review"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /skillforge review/);
  assert.match(result.stdout, /release-readiness review/);
  assert.match(result.stdout, /--all/);
  assert.match(result.stdout, /--baseline-dir \.\/released-skills/);
  assert.match(result.stdout, /--index \[\.\/artifacts\/review-all\.index\.json\]/);
  assert.match(result.stdout, /my-skill\.review\.md/);
});

serialTest("cli help documents the local studio command", async () => {
  const result = await runCli(["help", "serve"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /skillforge serve/);
  assert.match(result.stdout, /local SkillForge Studio web interface/);
  assert.match(result.stdout, /--port 3210/);
});

serialTest("cli help documents persisted index queries", async () => {
  const result = await runCli(["help", "index"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /skillforge index/);
  assert.match(result.stdout, /persisted batch inspect\/review index/);
  assert.match(result.stdout, /--list action-group/);
  assert.match(result.stdout, /--apply action-group/);
  assert.match(result.stdout, /--yes/);
  assert.match(result.stdout, /--plain/);
});

serialTest("cli inspect reads the embedded archive manifest", async () => {
  const tempDir = await makeTempDir("skillforge-inspect-");
  const skillDir = path.join(tempDir, "skill");
  const outputPath = path.join(tempDir, "artifact.skill");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);
  const packResult = await runCli(["pack", skillDir, "--output", outputPath]);
  assert.equal(packResult.code, 0, packResult.stderr);

  const result = await runCli(["inspect", outputPath]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Inspecting /);
  assert.match(result.stdout, /Status: ARCHIVE VERIFIED/);
  assert.match(result.stdout, /Trust: Archive manifest verified/);
  assert.match(result.stdout, /Skill: weather-research@1\.2\.3/);
  assert.match(result.stdout, /Description: Skill for structured weather research/);
  assert.match(result.stdout, /Checks: PASS manifest/);
  assert.match(result.stdout, /Contents: SKILL\.md \(\d+ B\), assets\/README\.txt/);
  assert.match(result.stdout, /Next: run skillforge inspect .* --source \.\/path-to-skill to check for drift\./);
});

serialTest("cli inspect supports json output", async () => {
  const tempDir = await makeTempDir("skillforge-inspect-json-");
  const skillDir = path.join(tempDir, "skill");
  const outputPath = path.join(tempDir, "artifact.skill");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);
  const packResult = await runCli(["pack", skillDir, "--output", outputPath]);
  assert.equal(packResult.code, 0, packResult.stderr);

  const result = await runCli(["inspect", outputPath, "--json"]);

  assert.equal(result.code, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.archivePath, outputPath);
  assert.equal(payload.trustSummary.status, "verified");
  assert.equal(payload.manifest.skill.version, "1.2.3");
  assert.equal(payload.manifest.entryCount, 4);
  assert.match(payload.reportMarkdown, /# SkillForge Archive Report/);
});

serialTest("cli help documents archive-to-archive inspection", async () => {
  const result = await runCli(["help", "inspect"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /--against \.\/previous\.skill/);
  assert.match(result.stdout, /<archive-dir> --all/);
  assert.match(result.stdout, /--baseline-dir \.\/released-skills/);
  assert.match(result.stdout, /--index \[\.\/\.skillforge\/inspect-all\.index\.json\]/);
  assert.match(result.stdout, /--entry SKILL\.md/);
  assert.match(result.stdout, /customer-support-prev\.skill/);
});

serialTest("cli inspect can compare an archive against its source directory", async () => {
  const tempDir = await makeTempDir("skillforge-inspect-compare-");
  const skillDir = path.join(tempDir, "skill");
  const outputPath = path.join(tempDir, "artifact.skill");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);
  const packResult = await runCli(["pack", skillDir, "--output", outputPath]);
  assert.equal(packResult.code, 0, packResult.stderr);

  await fs.appendFile(path.join(skillDir, "references", "README.md"), "\nDrifted after packaging.\n");

  const result = await runCli(["inspect", outputPath, "--source", skillDir]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Comparison: drift detected/);
  assert.match(result.stdout, /Trust: Artifact drift detected/);
  assert.match(result.stdout, /Changed: references\/README\.md \(size-mismatch,/);
});

serialTest("cli inspect can export a markdown drift report", async () => {
  const tempDir = await makeTempDir("skillforge-inspect-report-");
  const skillDir = path.join(tempDir, "skill");
  const outputPath = path.join(tempDir, "artifact.skill");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);
  const packResult = await runCli(["pack", skillDir, "--output", outputPath]);
  assert.equal(packResult.code, 0, packResult.stderr);

  await fs.appendFile(path.join(skillDir, "references", "README.md"), "\nDrifted after packaging.\n");

  const result = await runCli(["inspect", outputPath, "--source", skillDir, "--report"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Report: /);
  const reportPath = path.join(tempDir, "artifact.report.md");
  const report = await fs.readFile(reportPath, "utf8");
  assert.match(report, /## Trust Summary/);
  assert.match(report, /Status: drift detected/);
  assert.match(report, /### Changed Files/);
  assert.match(report, /references\/README\.md/);
});

serialTest("cli inspect can compare the current archive against a baseline archive", async () => {
  const tempDir = await makeTempDir("skillforge-inspect-against-");
  const skillDir = path.join(tempDir, "skill");
  const baselineArchivePath = path.join(tempDir, "baseline.skill");
  const currentArchivePath = path.join(tempDir, "current.skill");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);

  let result = await runCli(["pack", skillDir, "--output", baselineArchivePath]);
  assert.equal(result.code, 0, result.stderr);

  await fs.appendFile(path.join(skillDir, "references", "README.md"), "\nUpdated after baseline.\n");

  result = await runCli(["pack", skillDir, "--output", currentArchivePath]);
  assert.equal(result.code, 0, result.stderr);

  result = await runCli(["inspect", currentArchivePath, "--against", baselineArchivePath]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Release delta: Release delta detected/);
  assert.match(result.stdout, /Baseline archive: /);
  assert.match(result.stdout, /Delta: release changed/);
  assert.match(result.stdout, /Changed since baseline: references\/README\.md/);
});

serialTest("cli inspect json can include both source and baseline comparisons", async () => {
  const tempDir = await makeTempDir("skillforge-inspect-full-");
  const skillDir = path.join(tempDir, "skill");
  const baselineArchivePath = path.join(tempDir, "baseline.skill");
  const currentArchivePath = path.join(tempDir, "current.skill");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);

  let result = await runCli(["pack", skillDir, "--output", baselineArchivePath]);
  assert.equal(result.code, 0, result.stderr);

  await fs.appendFile(path.join(skillDir, "references", "README.md"), "\nChanged after release.\n");

  result = await runCli(["pack", skillDir, "--output", currentArchivePath]);
  assert.equal(result.code, 0, result.stderr);

  await fs.appendFile(path.join(skillDir, "references", "README.md"), "\nChanged after packaging.\n");

  result = await runCli(["inspect", currentArchivePath, "--source", skillDir, "--against", baselineArchivePath, "--json"]);

  assert.equal(result.code, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.trustSummary.status, "drift-detected");
  assert.equal(payload.releaseDeltaSummary.status, "release-changed");
  assert.equal(payload.comparison.matches, false);
  assert.equal(payload.releaseComparison.matches, false);
  assert.match(payload.reportMarkdown, /## Release Delta/);
});

serialTest("cli inspect can preview a bundled archive entry", async () => {
  const tempDir = await makeTempDir("skillforge-inspect-entry-");
  const skillDir = path.join(tempDir, "skill");
  const outputPath = path.join(tempDir, "artifact.skill");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);
  const packResult = await runCli(["pack", skillDir, "--output", outputPath]);
  assert.equal(packResult.code, 0, packResult.stderr);

  const result = await runCli(["inspect", outputPath, "--entry", "SKILL.md"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Entry preview: SKILL\.md \(text\)/);
  assert.match(result.stdout, /# Weather Research/);
});

serialTest("cli inspect --all summarizes repo-scale archives and duplicate releases", async () => {
  const tempDir = await makeTempDir("skillforge-inspect-all-");
  const releasesDir = path.join(tempDir, "releases");
  const weatherDir = path.join(tempDir, "weather");
  const duplicateDir = path.join(tempDir, "duplicate");
  await copyFixture(path.join("valid", "basic-skill"), weatherDir);
  await copyFixture(path.join("valid", "basic-skill"), duplicateDir);

  let result = await runCli(["pack", weatherDir, "--output", path.join(releasesDir, "weather.skill")]);
  assert.equal(result.code, 0, result.stderr);
  result = await runCli(["pack", duplicateDir, "--output", path.join(releasesDir, "duplicate.skill")]);
  assert.equal(result.code, 0, result.stderr);

  result = await runCli(["inspect", releasesDir, "--all", "--json"]);

  assert.equal(result.code, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.archiveCount, 2);
  assert.equal(payload.summary.duplicateCoordinates, 1);
  assert.equal(payload.summary.multiVersionSkills, 0);
  assert(payload.inventorySummary.commonEntries.some((entry) => entry.path === "SKILL.md"));
  assert.match(payload.reportMarkdown, /# SkillForge Batch Inspect Report/);
  assert.match(payload.reportMarkdown, /## Identity Hotspots/);
  assert.deepEqual(
    payload.archives.map((entry) => entry.relativePath).sort(),
    ["duplicate.skill", "weather.skill"]
  );
  assert.equal(payload.identitySummary.duplicateCoordinates[0].name, "weather-research");
});

serialTest("cli inspect --all can compare release directories against baseline archives", async () => {
  const tempDir = await makeTempDir("skillforge-inspect-all-baseline-");
  const currentDir = path.join(tempDir, "current");
  const baselineDir = path.join(tempDir, "baseline");
  const reportPath = path.join(tempDir, "inspect-all.md");
  const weatherDir = path.join(tempDir, "weather");
  const alertsDir = path.join(tempDir, "alerts");
  await copyFixture(path.join("valid", "basic-skill"), weatherDir);
  await copyFixture(path.join("valid", "basic-skill"), alertsDir);
  await fs.mkdir(baselineDir, { recursive: true });

  let result = await runCli(["pack", weatherDir, "--output", path.join(baselineDir, "weather-research.skill")]);
  assert.equal(result.code, 0, result.stderr);
  result = await runCli(["pack", alertsDir, "--output", path.join(baselineDir, "unused.skill")]);
  assert.equal(result.code, 0, result.stderr);

  await fs.appendFile(path.join(weatherDir, "references", "README.md"), "\nChanged after release.\n");
  await fs.writeFile(
    path.join(alertsDir, "SKILL.md"),
    `---
name: alerts-skill
description: Artifact inventory should flag missing baselines for archive sets.
version: 2.0.0
---

# Alerts Skill

## Purpose
Exercise batch archive inspection against a baseline directory.

## Workflow
1. Inspect the shipped archive set.
2. Compare current artifacts against matching baselines.

## Constraints
- Keep the release audit concise.
`
  );

  result = await runCli(["pack", weatherDir, "--output", path.join(currentDir, "weather.skill")]);
  assert.equal(result.code, 0, result.stderr);
  result = await runCli(["pack", alertsDir, "--output", path.join(currentDir, "alerts.skill")]);
  assert.equal(result.code, 0, result.stderr);

  result = await runCli(["inspect", currentDir, "--all", "--baseline-dir", baselineDir, "--report", reportPath, "--json"]);

  assert.equal(result.code, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.summary.baselineCompared, 1);
  assert.equal(payload.summary.releaseChanged, 1);
  assert.equal(payload.summary.baselineMissing, 1);
  assert.equal(payload.baselineSummary.compared, 1);
  assert.equal(payload.baselineSummary.changed, 1);
  assert.deepEqual(payload.baselineSummary.missingArchives, ["alerts.skill"]);
  assert.equal(payload.baselineSummary.orphanedArchives.length, 1);
  assert.match(payload.baselineSummary.orphanedArchives[0], /unused\.skill$/);
  assert.match(payload.reportMarkdown, /## Baseline Coverage/);
  assert.match(payload.reportMarkdown, /### Orphaned Baselines/);
  const weather = payload.archives.find((entry) => entry.relativePath === "weather.skill");
  const alerts = payload.archives.find((entry) => entry.relativePath === "alerts.skill");
  assert.match(weather.baselineLookup.resolvedArchivePath, /weather-research\.skill$/);
  assert.equal(weather.releaseComparison.matches, false);
  assert.equal(alerts.baselineLookup.resolvedArchivePath, undefined);
  const report = await fs.readFile(reportPath, "utf8");
  assert.match(report, /# SkillForge Batch Inspect Report/);
  assert.match(report, /## Artifact Inventory/);
});

serialTest("cli inspect --all can write a persisted index with operations summary", async () => {
  const tempDir = await makeTempDir("skillforge-inspect-all-index-");
  const currentDir = path.join(tempDir, "current");
  const baselineDir = path.join(tempDir, "baseline");
  const indexPath = path.join(tempDir, "inspect-all.json");
  const weatherDir = path.join(tempDir, "weather");
  const alertsDir = path.join(tempDir, "alerts");
  await copyFixture(path.join("valid", "basic-skill"), weatherDir);
  await copyFixture(path.join("valid", "basic-skill"), alertsDir);
  await fs.mkdir(baselineDir, { recursive: true });

  let result = await runCli(["pack", weatherDir, "--output", path.join(baselineDir, "weather-research.skill")]);
  assert.equal(result.code, 0, result.stderr);

  await fs.appendFile(path.join(weatherDir, "references", "README.md"), "\nChanged after release.\n");
  await fs.writeFile(
    path.join(alertsDir, "SKILL.md"),
    `---
name: alerts-skill
description: Batch inspect index should expose practical release operations data.
version: 1.0.0
---

# Alerts Skill

## Purpose
Exercise persisted archive inventory output.

## Workflow
1. Inspect the release set.
2. Capture the operations summary for automation.
`
  );

  result = await runCli(["pack", weatherDir, "--output", path.join(currentDir, "weather.skill")]);
  assert.equal(result.code, 0, result.stderr);
  result = await runCli(["pack", alertsDir, "--output", path.join(currentDir, "alerts.skill")]);
  assert.equal(result.code, 0, result.stderr);

  result = await runCli(["inspect", currentDir, "--all", "--baseline-dir", baselineDir, "--index", indexPath, "--json"]);

  assert.equal(result.code, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.indexPath, indexPath);
  assert.deepEqual(payload.operationsSummary.archivesWithReleaseChanges, ["weather.skill"]);
  assert.deepEqual(payload.operationsSummary.archivesMissingBaselines, ["alerts.skill"]);
  const index = JSON.parse(await fs.readFile(indexPath, "utf8"));
  assert.deepEqual(index.operationsSummary.archivesWithReleaseChanges, ["weather.skill"]);
  assert.deepEqual(index.operationsSummary.archivesMissingBaselines, ["alerts.skill"]);
});

serialTest("cli inspect --all rejects single-archive-only flags", async () => {
  const result = await runCli(["inspect", ".", "--all", "--entry", "SKILL.md"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /inspect --all does not support --entry/);
});

serialTest("cli pack --all rejects single-skill output flag", async () => {
  const tempDir = await makeTempDir("skillforge-pack-all-output-");
  const skillsRoot = path.join(tempDir, "skills");
  await copyFixture(path.join("valid", "basic-skill"), path.join(skillsRoot, "weather"));

  const result = await runCli(["pack", skillsRoot, "--all", "--output", path.join(tempDir, "artifact.skill")]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /pack --all does not support --output\. Use --output-dir to control where batch artifacts are written\./);
});

serialTest("cli review packages a valid skill and reports readiness", async () => {
  const tempDir = await makeTempDir("skillforge-review-cli-");
  const skillDir = path.join(tempDir, "skill");
  const outputPath = path.join(tempDir, "artifact.skill");
  const reportPath = path.join(tempDir, "artifact.review.md");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);

  const result = await runCli(["review", skillDir, "--output", outputPath, "--report", reportPath]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Readiness: READY TO SHIP/);
  assert.match(result.stdout, /Summary: Ready to ship/);
  assert.match(result.stdout, /Release checks: PASS lint/);
  assert.match(result.stdout, /Artifact check: matches source/);
  assert.match(result.stdout, /Report: /);
  await fs.access(outputPath);
  const report = await fs.readFile(reportPath, "utf8");
  assert.match(report, /# SkillForge Review Report/);
  assert.match(report, /## Release Summary/);
  assert.match(report, /Verdict: ready to ship/);
});

serialTest("cli review can include a baseline archive delta", async () => {
  const tempDir = await makeTempDir("skillforge-review-baseline-");
  const skillDir = path.join(tempDir, "skill");
  const baselineArchivePath = path.join(tempDir, "baseline.skill");
  const currentArchivePath = path.join(tempDir, "current.skill");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);

  let result = await runCli(["pack", skillDir, "--output", baselineArchivePath]);
  assert.equal(result.code, 0, result.stderr);

  await fs.appendFile(path.join(skillDir, "references", "README.md"), "\nBaseline delta for review.\n");

  result = await runCli(["review", skillDir, "--output", currentArchivePath, "--against", baselineArchivePath, "--json"]);

  assert.equal(result.code, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.match(payload.releaseSummary.headline, /release delta/i);
  assert.equal(payload.archive.releaseComparison.matches, false);
  assert.match(payload.reportMarkdown, /Baseline archive:/);
});

serialTest("cli review stops before packaging when the skill is not ready", async () => {
  const tempDir = await makeTempDir("skillforge-review-cli-fail-");
  const skillDir = path.join(tempDir, "skill");
  const outputPath = path.join(tempDir, "artifact.skill");
  await copyFixture(path.join("invalid", "bad-version-skill"), skillDir);

  const result = await runCli(["review", skillDir, "--output", outputPath, "--json"]);

  assert.equal(result.code, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.readiness, "not-ready");
  assert.equal(payload.releaseSummary.headline, "Not ready to ship");
  assert.equal(payload.archive, undefined);
  await assert.rejects(fs.access(outputPath));
});

serialTest("cli review --all runs repo-scale readiness checks and writes batch artifacts", async () => {
  const tempDir = await makeTempDir("skillforge-review-all-");
  const skillsRoot = path.join(tempDir, "skills");
  const artifactsDir = path.join(tempDir, "review-artifacts");
  const reportPath = path.join(tempDir, "review-all.md");
  await copyFixture(path.join("valid", "basic-skill"), path.join(skillsRoot, "weather"));
  await copyFixture(path.join("invalid", "bad-version-skill"), path.join(skillsRoot, "broken"));

  const result = await runCli(["review", skillsRoot, "--all", "--output-dir", artifactsDir, "--report", reportPath, "--json"]);

  assert.equal(result.code, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.rootDir, skillsRoot);
  assert.equal(payload.skillCount, 2);
  assert.equal(payload.summary.ready, 1);
  assert.equal(payload.summary.notReady, 1);
  assert.equal(payload.summary.archiveDrift, 0);
  assert.equal(payload.summary.artifactsCreated, 1);
  assert.equal(payload.summary.artifactEntries, 4);
  assert.equal(payload.artifactSummary.totalArchives, 1);
  assert.equal(payload.artifactSummary.totalEntries, 4);
  assert.equal(payload.artifactSummary.largestArchives[0].relativeDir, "weather");
  assert.equal(payload.maintenanceSummary.issueHotspots[0].code, "invalid-frontmatter-version");
  assert.match(payload.reportMarkdown, /# SkillForge Batch Review Report/);
  assert.match(payload.reportMarkdown, /## Artifact Inventory/);
  assert.match(payload.reportMarkdown, /## Issue Hotspots/);
  assert.deepEqual(
    payload.skills.map((entry) => entry.relativeDir).sort(),
    ["broken", "weather"]
  );
  const weather = payload.skills.find((entry) => entry.relativeDir === "weather");
  const broken = payload.skills.find((entry) => entry.relativeDir === "broken");
  assert.equal(weather.readiness, "ready");
  assert.match(weather.archive.destination, /weather\.skill$/);
  assert.equal(broken.readiness, "not-ready");
  assert.equal(broken.archive, undefined);
  await fs.access(path.join(artifactsDir, "weather.skill"));
  const report = await fs.readFile(reportPath, "utf8");
  assert.match(report, /### weather/);
  assert.match(report, /### broken/);
  assert.match(report, /### Largest Archives/);
});

serialTest("cli review --all can match baseline archives from a directory", async () => {
  const tempDir = await makeTempDir("skillforge-review-all-baseline-");
  const skillsRoot = path.join(tempDir, "skills");
  const baselinesDir = path.join(tempDir, "baselines");
  const artifactsDir = path.join(tempDir, "artifacts");
  const weatherDir = path.join(skillsRoot, "weather");
  const alertsDir = path.join(skillsRoot, "alerts");
  await copyFixture(path.join("valid", "basic-skill"), weatherDir);
  await copyFixture(path.join("valid", "basic-skill"), alertsDir);
  await fs.mkdir(baselinesDir, { recursive: true });

  let result = await runCli(["pack", weatherDir, "--output", path.join(baselinesDir, "weather-research.skill")]);
  assert.equal(result.code, 0, result.stderr);
  result = await runCli(["pack", alertsDir, "--output", path.join(baselinesDir, "unused-baseline.skill")]);
  assert.equal(result.code, 0, result.stderr);

  await fs.appendFile(path.join(weatherDir, "references", "README.md"), "\nChanged after baseline.\n");
  await fs.writeFile(
    path.join(alertsDir, "SKILL.md"),
    `---
name: alerts-skill
description: Batch review should flag missing baselines and orphaned releases.
version: 1.0.0
---

# Alerts Skill

## Purpose
Exercise baseline coverage reporting.

## Workflow
1. Review the current skill state.
2. Compare it against a known baseline when available.

## Constraints
- Keep the release report concise.
`
  );

  result = await runCli([
    "review",
    skillsRoot,
    "--all",
    "--output-dir",
    artifactsDir,
    "--baseline-dir",
    baselinesDir,
    "--json"
  ]);

  assert.equal(result.code, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.summary.baselineCompared, 1);
  assert.equal(payload.summary.releaseChanged, 1);
  assert.equal(payload.summary.baselineMissing, 1);
  assert.equal(payload.baselineSummary.compared, 1);
  assert.equal(payload.baselineSummary.changed, 1);
  assert.deepEqual(payload.baselineSummary.missingSkills, ["alerts"]);
  assert.equal(payload.baselineSummary.orphanedArchives.length, 1);
  assert.match(payload.baselineSummary.orphanedArchives[0], /unused-baseline\.skill$/);
  assert.match(payload.reportMarkdown, /## Baseline Coverage/);
  assert.match(payload.reportMarkdown, /### Orphaned Baselines/);
  const weather = payload.skills.find((entry) => entry.relativeDir === "weather");
  const alerts = payload.skills.find((entry) => entry.relativeDir === "alerts");
  assert.match(weather.baselineLookup.resolvedArchivePath, /weather-research\.skill$/);
  assert.equal(weather.archive.releaseComparison.matches, false);
  assert.equal(alerts.baselineLookup.resolvedArchivePath, undefined);
});

serialTest("cli review --all can write a persisted index with operations summary", async () => {
  const tempDir = await makeTempDir("skillforge-review-all-index-");
  const skillsRoot = path.join(tempDir, "skills");
  const baselinesDir = path.join(tempDir, "baselines");
  const artifactsDir = path.join(tempDir, "artifacts");
  const indexPath = path.join(tempDir, "review-all.json");
  const weatherDir = path.join(skillsRoot, "weather");
  const brokenDir = path.join(skillsRoot, "broken");
  await copyFixture(path.join("valid", "basic-skill"), weatherDir);
  await copyFixture(path.join("invalid", "bad-version-skill"), brokenDir);
  await fs.mkdir(baselinesDir, { recursive: true });

  let result = await runCli(["pack", weatherDir, "--output", path.join(baselinesDir, "weather-research.skill")]);
  assert.equal(result.code, 0, result.stderr);
  await fs.appendFile(path.join(weatherDir, "references", "README.md"), "\nChanged after baseline.\n");

  result = await runCli([
    "review",
    skillsRoot,
    "--all",
    "--output-dir",
    artifactsDir,
    "--baseline-dir",
    baselinesDir,
    "--index",
    indexPath,
    "--json"
  ]);

  assert.equal(result.code, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.indexPath, indexPath);
  assert.deepEqual(payload.operationsSummary.readySkills, ["weather"]);
  assert.deepEqual(payload.operationsSummary.blockedSkills, ["broken"]);
  assert.deepEqual(payload.operationsSummary.skillsWithReleaseChanges, ["weather"]);
  assert.deepEqual(payload.operationsSummary.skillsMissingBaselines, ["broken"]);
  const index = JSON.parse(await fs.readFile(indexPath, "utf8"));
  assert.deepEqual(index.operationsSummary.readySkills, ["weather"]);
  assert.deepEqual(index.operationsSummary.blockedSkills, ["broken"]);
});

serialTest("cli review --all indexes artifact cleanup targets and index can apply them", async () => {
  const tempDir = await makeTempDir("skillforge-review-artifact-cleanup-");
  const skillsRoot = path.join(tempDir, "skills");
  const artifactsDir = path.join(tempDir, "artifacts");
  const indexPath = path.join(tempDir, "review-all.json");
  const weatherDir = path.join(skillsRoot, "weather");
  const brokenDir = path.join(skillsRoot, "broken");
  await copyFixture(path.join("valid", "basic-skill"), weatherDir);
  await copyFixture(path.join("invalid", "bad-version-skill"), brokenDir);
  await fs.mkdir(artifactsDir, { recursive: true });

  const blockedArtifactPath = path.join(artifactsDir, "broken.skill");
  const staleArtifactPath = path.join(artifactsDir, "stale.skill");
  await fs.writeFile(blockedArtifactPath, "old blocked artifact");
  await fs.writeFile(staleArtifactPath, "old stale artifact");

  let result = await runCli([
    "review",
    skillsRoot,
    "--all",
    "--output-dir",
    artifactsDir,
    "--index",
    indexPath,
    "--json"
  ]);

  assert.equal(result.code, 1);
  let payload = JSON.parse(result.stdout);
  assert.deepEqual(payload.artifactCleanupSummary.blockedSkillArtifacts, [blockedArtifactPath]);
  assert.deepEqual(payload.artifactCleanupSummary.staleArtifacts, [staleArtifactPath]);
  assert.deepEqual(payload.operationsSummary.blockedSkillArtifacts, ["broken.skill"]);
  assert.deepEqual(payload.operationsSummary.staleArtifacts, ["stale.skill"]);

  result = await runCli(["index", indexPath, "--list", "blocked-artifacts", "--plain"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim(), "broken.skill");

  result = await runCli(["index", indexPath, "--list", "stale-artifacts", "--commands", "--plain"]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /rm -f .*stale\.skill/);

  result = await runCli(["index", indexPath, "--apply", "blocked-artifacts"]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Mode: dry-run/);
  await fs.access(blockedArtifactPath);

  result = await runCli(["index", indexPath, "--apply", "blocked-artifacts", "--yes", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  payload = JSON.parse(result.stdout);
  assert.equal(payload.apply.applied, 1);
  await assert.rejects(fs.access(blockedArtifactPath));

  result = await runCli(["index", indexPath, "--apply", "stale-artifacts", "--yes"]);
  assert.equal(result.code, 0, result.stderr);
  await assert.rejects(fs.access(staleArtifactPath));
});

serialTest("cli index can query persisted review indexes for maintenance actions", async () => {
  const tempDir = await makeTempDir("skillforge-index-review-");
  const skillsRoot = path.join(tempDir, "skills");
  const baselinesDir = path.join(tempDir, "baselines");
  const artifactsDir = path.join(tempDir, "artifacts");
  const indexPath = path.join(tempDir, "review-all.json");
  const weatherDir = path.join(skillsRoot, "weather");
  const brokenDir = path.join(skillsRoot, "broken");
  await copyFixture(path.join("valid", "basic-skill"), weatherDir);
  await copyFixture(path.join("invalid", "bad-version-skill"), brokenDir);
  await fs.mkdir(baselinesDir, { recursive: true });

  let result = await runCli(["pack", weatherDir, "--output", path.join(baselinesDir, "weather-research.skill")]);
  assert.equal(result.code, 0, result.stderr);
  await fs.appendFile(path.join(weatherDir, "references", "README.md"), "\nChanged after baseline.\n");

  result = await runCli([
    "review",
    skillsRoot,
    "--all",
    "--output-dir",
    artifactsDir,
    "--baseline-dir",
    baselinesDir,
    "--index",
    indexPath,
    "--json"
  ]);

  assert.equal(result.code, 1, result.stderr);

  result = await runCli(["index", indexPath, "--list", "blocked-skills", "--plain"]);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(result.stdout.trim(), "broken");

  result = await runCli(["index", indexPath, "--json"]);
  assert.equal(result.code, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.type, "review");
  assert.equal(payload.summary.status, "NOT READY");
  assert.equal(payload.summary.itemCount, 2);
  assert.equal(payload.availableLists.find((entry) => entry.name === "blocked-skills").count, 1);

  result = await runCli(["index", indexPath, "--list", "release-changes", "--commands", "--plain"]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /skillforge inspect .*weather\.skill --against .*weather-research\.skill/);

  result = await runCli(["index", indexPath, "--list", "blocked-skills", "--commands", "--plain"]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /skillforge lint .*broken$/);
});

serialTest("cli index can summarize persisted inspect indexes and list cleanup targets", async () => {
  const tempDir = await makeTempDir("skillforge-index-inspect-");
  const currentDir = path.join(tempDir, "current");
  const baselineDir = path.join(tempDir, "baseline");
  const indexPath = path.join(tempDir, "inspect-all.json");
  const weatherDir = path.join(tempDir, "weather");
  const alertsDir = path.join(tempDir, "alerts");
  await copyFixture(path.join("valid", "basic-skill"), weatherDir);
  await copyFixture(path.join("valid", "basic-skill"), alertsDir);
  await fs.mkdir(baselineDir, { recursive: true });

  let result = await runCli(["pack", weatherDir, "--output", path.join(baselineDir, "weather-research.skill")]);
  assert.equal(result.code, 0, result.stderr);
  result = await runCli(["pack", alertsDir, "--output", path.join(baselineDir, "unused.skill")]);
  assert.equal(result.code, 0, result.stderr);

  await fs.appendFile(path.join(weatherDir, "references", "README.md"), "\nChanged after release.\n");
  await fs.writeFile(
    path.join(alertsDir, "SKILL.md"),
    `---
name: alerts-skill
description: Persisted inspect index queries should expose orphaned cleanup targets.
version: 1.0.0
---

# Alerts Skill

## Purpose
Exercise index-driven inspect maintenance output.

## Workflow
1. Package the current release set.
2. Inspect the persisted release index.
`
  );

  result = await runCli(["pack", weatherDir, "--output", path.join(currentDir, "weather.skill")]);
  assert.equal(result.code, 0, result.stderr);
  result = await runCli(["pack", alertsDir, "--output", path.join(currentDir, "alerts.skill")]);
  assert.equal(result.code, 0, result.stderr);

  result = await runCli(["inspect", currentDir, "--all", "--baseline-dir", baselineDir, "--index", indexPath, "--json"]);
  assert.equal(result.code, 0, result.stderr);

  result = await runCli(["index", indexPath]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Type: batch inspect index/);
  assert.match(result.stdout, /Status: RELEASE CHANGES DETECTED/);
  assert.match(result.stdout, /orphaned-baselines \(1\):/);

  result = await runCli(["index", indexPath, "--list", "orphaned-baselines", "--plain"]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout.trim(), /unused\.skill$/);

  result = await runCli(["index", indexPath, "--list", "orphaned-baselines", "--commands", "--plain"]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout.trim(), /rm -f .*unused\.skill$/);
});

serialTest("cli index can emit baseline promotion commands for missing baselines", async () => {
  const tempDir = await makeTempDir("skillforge-index-promote-");
  const skillsRoot = path.join(tempDir, "skills");
  const reviewArtifactsDir = path.join(tempDir, "review-artifacts");
  const reviewBaselineDir = path.join(tempDir, "review-baselines");
  const reviewIndexPath = path.join(tempDir, "review-all.json");
  const inspectCurrentDir = path.join(tempDir, "inspect-current");
  const inspectBaselineDir = path.join(tempDir, "inspect-baselines");
  const inspectIndexPath = path.join(tempDir, "inspect-all.json");
  const weatherDir = path.join(skillsRoot, "weather");

  await copyFixture(path.join("valid", "basic-skill"), weatherDir);
  await fs.mkdir(reviewBaselineDir, { recursive: true });
  await fs.mkdir(inspectBaselineDir, { recursive: true });

  let result = await runCli([
    "review",
    skillsRoot,
    "--all",
    "--output-dir",
    reviewArtifactsDir,
    "--baseline-dir",
    reviewBaselineDir,
    "--index",
    reviewIndexPath,
    "--json"
  ]);
  assert.equal(result.code, 0, result.stderr);

  result = await runCli(["index", reviewIndexPath, "--list", "missing-baselines", "--commands", "--plain"]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /cp .*weather\.skill .*review-baselines.*weather\.skill/);

  result = await runCli(["pack", weatherDir, "--output", path.join(inspectCurrentDir, "weather.skill")]);
  assert.equal(result.code, 0, result.stderr);
  result = await runCli([
    "inspect",
    inspectCurrentDir,
    "--all",
    "--baseline-dir",
    inspectBaselineDir,
    "--index",
    inspectIndexPath,
    "--json"
  ]);
  assert.equal(result.code, 0, result.stderr);

  result = await runCli(["index", inspectIndexPath, "--list", "missing-baselines", "--commands", "--plain"]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /cp .*inspect-current\/weather\.skill .*inspect-baselines\/weather\.skill/);
});

serialTest("cli index can dry-run and apply missing baseline promotions from a review index", async () => {
  const tempDir = await makeTempDir("skillforge-index-apply-review-");
  const skillsRoot = path.join(tempDir, "skills");
  const artifactsDir = path.join(tempDir, "artifacts");
  const baselineDir = path.join(tempDir, "baselines");
  const indexPath = path.join(tempDir, "review-all.json");
  const weatherDir = path.join(skillsRoot, "weather");
  await copyFixture(path.join("valid", "basic-skill"), weatherDir);
  await fs.mkdir(baselineDir, { recursive: true });

  let result = await runCli([
    "review",
    skillsRoot,
    "--all",
    "--output-dir",
    artifactsDir,
    "--baseline-dir",
    baselineDir,
    "--index",
    indexPath,
    "--json"
  ]);
  assert.equal(result.code, 0, result.stderr);

  const promotedBaselinePath = path.join(baselineDir, "weather.skill");
  result = await runCli(["index", indexPath, "--apply", "missing-baselines"]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Mode: dry-run/);
  assert.match(result.stdout, /PLAN weather: copy /);
  await assert.rejects(fs.access(promotedBaselinePath));

  result = await runCli(["index", indexPath, "--apply", "missing-baselines", "--yes", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.apply.dryRun, false);
  assert.equal(payload.apply.applied, 1);
  assert.equal(payload.apply.failed, 0);
  const promotedBuffer = await fs.readFile(promotedBaselinePath);
  const artifactBuffer = await fs.readFile(path.join(artifactsDir, "weather.skill"));
  assert.deepEqual(promotedBuffer, artifactBuffer);
});

serialTest("cli index can apply release baseline refresh and orphan cleanup from an inspect index", async () => {
  const tempDir = await makeTempDir("skillforge-index-apply-inspect-");
  const currentDir = path.join(tempDir, "current");
  const baselineDir = path.join(tempDir, "baseline");
  const indexPath = path.join(tempDir, "inspect-all.json");
  const weatherDir = path.join(tempDir, "weather");
  const alertsDir = path.join(tempDir, "alerts");
  await copyFixture(path.join("valid", "basic-skill"), weatherDir);
  await copyFixture(path.join("valid", "basic-skill"), alertsDir);
  await fs.mkdir(baselineDir, { recursive: true });

  let result = await runCli(["pack", weatherDir, "--output", path.join(baselineDir, "weather-research.skill")]);
  assert.equal(result.code, 0, result.stderr);
  result = await runCli(["pack", alertsDir, "--output", path.join(baselineDir, "unused.skill")]);
  assert.equal(result.code, 0, result.stderr);

  const originalBaselineBuffer = await fs.readFile(path.join(baselineDir, "weather-research.skill"));
  await fs.appendFile(path.join(weatherDir, "references", "README.md"), "\nChanged after release.\n");
  await fs.writeFile(
    path.join(alertsDir, "SKILL.md"),
    `---
name: alerts-skill
description: Inspect apply should support release baseline refresh and orphan cleanup.
version: 1.0.0
---

# Alerts Skill

## Purpose
Exercise apply flows for inspect indexes.

## Workflow
1. Package the current release set.
2. Refresh the changed baseline.
`
  );

  result = await runCli(["pack", weatherDir, "--output", path.join(currentDir, "weather.skill")]);
  assert.equal(result.code, 0, result.stderr);
  result = await runCli(["pack", alertsDir, "--output", path.join(currentDir, "alerts.skill")]);
  assert.equal(result.code, 0, result.stderr);

  result = await runCli(["inspect", currentDir, "--all", "--baseline-dir", baselineDir, "--index", indexPath, "--json"]);
  assert.equal(result.code, 0, result.stderr);

  result = await runCli(["index", indexPath, "--apply", "release-changes", "--yes"]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Mode: execute/);
  assert.match(result.stdout, /APPLY weather\.skill: copy /);
  const refreshedBaselineBuffer = await fs.readFile(path.join(baselineDir, "weather-research.skill"));
  const currentWeatherBuffer = await fs.readFile(path.join(currentDir, "weather.skill"));
  assert.notDeepEqual(refreshedBaselineBuffer, originalBaselineBuffer);
  assert.deepEqual(refreshedBaselineBuffer, currentWeatherBuffer);

  result = await runCli(["index", indexPath, "--apply", "orphaned-baselines", "--yes"]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /APPLY unused\.skill: remove /);
  await assert.rejects(fs.access(path.join(baselineDir, "unused.skill")));
});

serialTest("cli review --all rejects single-skill artifact flags", async () => {
  const result = await runCli(["review", ".", "--all", "--output", "./artifact.skill"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /review --all does not support --output/);
});

serialTest("cli rejects unknown flags with a clear error", async () => {
  const result = await runCli(["lint", "--output", "./artifact.skill"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown flag\(s\): --output\. This command supports --format, --json, --all, --report and --help\./);
});

serialTest("cli lint rejects conflicting format flags", async () => {
  const result = await runCli(["lint", "--json", "--format", "text"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Use either --json or --format, not both\./);
});

serialTest("cli index rejects --plain without a selected action group", async () => {
  const tempDir = await makeTempDir("skillforge-index-plain-");
  const indexPath = path.join(tempDir, "index.json");
  await fs.writeFile(
    indexPath,
    JSON.stringify({
      rootDir: tempDir,
      archiveCount: 0,
      summary: {
        duplicateCoordinates: 0,
        multiVersionSkills: 0,
        releaseChanged: 0,
        baselineMissing: 0
      },
      operationsSummary: {
        duplicateReleaseCoordinates: [],
        skillsWithVersionSpread: [],
        archivesWithReleaseChanges: [],
        archivesMissingBaselines: []
      }
    })
  );

  const result = await runCli(["index", indexPath, "--plain"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /index --plain requires --list/);
});

serialTest("cli index rejects unsafe or incomplete apply flag combinations", async () => {
  const tempDir = await makeTempDir("skillforge-index-apply-guards-");
  const indexPath = path.join(tempDir, "index.json");
  await fs.writeFile(
    indexPath,
    JSON.stringify({
      rootDir: tempDir,
      artifactDir: path.join(tempDir, "artifacts"),
      skillCount: 1,
      summary: {
        ready: 1,
        readyWithWarnings: 0,
        notReady: 0,
        archiveDrift: 0,
        releaseChanged: 0,
        baselineMissing: 0
      },
      operationsSummary: {
        readySkills: ["weather"],
        readyWithWarningsSkills: [],
        blockedSkills: [],
        skillsWithReleaseChanges: [],
        skillsMissingBaselines: [],
        driftedArtifacts: []
      },
      skills: []
    })
  );

  let result = await runCli(["index", indexPath, "--apply"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /index requires --apply to name an action group/);

  result = await runCli(["index", indexPath, "--apply", "ready-skills"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /index --apply only supports actionable groups/);

  result = await runCli(["index", indexPath, "--apply", "missing-baselines", "--commands"]);
  assert.equal(result.code, 1);
  assert.match(result.stderr, /index does not allow --apply together with --commands/);
});
