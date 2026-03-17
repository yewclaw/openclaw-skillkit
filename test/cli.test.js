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
  const tempDir = await makeTempDir("openclaw-init-");
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
  assert.match(result.stdout, /Initialized skill at/);
  assert.match(result.stdout, /Template: minimal/);
  assert.match(result.stdout, /Created: SKILL\.md, references\/, scripts\/, assets\//);
  assert.match(result.stdout, /Next: edit .*SKILL\.md/);
  assert.match(result.stdout, /Reference example: examples\/weather-research-skill/);
  assert.match(result.stdout, /Then: openclaw-skillkit lint /);
  assert.match(result.stdout, /Ship: openclaw-skillkit pack /);
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
  const tempDir = await makeTempDir("openclaw-init-template-");
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
  const tempDir = await makeTempDir("openclaw-lint-valid-");
  const skillDir = path.join(tempDir, "skill");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);

  const result = await runCli(["lint", skillDir]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /OK: skill structure looks valid/);
  assert.match(result.stdout, /Ready: openclaw-skillkit pack /);
  assert.match(result.stdout, /Inspect after packing: openclaw-skillkit inspect /);
});

serialTest("cli lint fails for an invalid fixture", async () => {
  const tempDir = await makeTempDir("openclaw-lint-invalid-");
  const skillDir = path.join(tempDir, "skill");
  await copyFixture(path.join("invalid", "bad-version-skill"), skillDir);

  const result = await runCli(["lint", skillDir]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /ERROR \[invalid-frontmatter-version\] SKILL\.md: Frontmatter version must look like semver/);
  assert.match(result.stdout, /Fix: Use a semver-style version such as "0\.1\.0" or "1\.2\.3-beta\.1"\./);
  assert.match(result.stdout, /ERROR \[short-frontmatter-name\] SKILL\.md: Frontmatter name must be at least 3 characters/);
  assert.match(result.stdout, /Action plan:/);
  assert.match(result.stdout, /Fix blocking metadata issues first\./);
  assert.match(result.stdout, /Re-run: openclaw-skillkit lint /);
});

serialTest("cli lint reports broken markdown references", async () => {
  const tempDir = await makeTempDir("openclaw-lint-reference-");
  const skillDir = path.join(tempDir, "skill");
  await copyFixture(path.join("benchmark", "bad", "broken-reference-skill"), skillDir);

  const result = await runCli(["lint", skillDir]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /Referenced local file not found: references\/missing\.md/);
});

serialTest("cli lint supports json output for CI and editor tooling", async () => {
  const tempDir = await makeTempDir("openclaw-lint-json-");
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
  assert.match(payload.nextSteps[payload.nextSteps.length - 1], /Re-run: openclaw-skillkit lint /);
  assert.deepEqual(payload.issues.slice(0, 2).map((issue) => issue.code), [
    "invalid-frontmatter-version",
    "short-frontmatter-name"
  ]);
  assert.equal(payload.issues[0].category, "frontmatter");
  assert.match(payload.issues[0].suggestion, /semver-style version/);
});

serialTest("cli pack creates a .skill archive for a valid fixture", async () => {
  const tempDir = await makeTempDir("openclaw-pack-valid-");
  const skillDir = path.join(tempDir, "skill");
  const outputPath = path.join(tempDir, "artifact.skill");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);

  const result = await runCli(["pack", skillDir, "--output", outputPath]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Archive ready: /);
  assert.match(result.stdout, /Skill: weather-research@1\.2\.3/);
  assert.match(result.stdout, /Contents: SKILL\.md, assets\/README\.txt, references\/README\.md, scripts\/example\.sh/);
  assert.match(result.stdout, /Inspect: openclaw-skillkit inspect /);
  const entries = await readArchiveEntries(outputPath);
  assert.deepEqual(entries.sort(), [
    ".openclaw-skillkit/manifest.json",
    "SKILL.md",
    "assets/README.txt",
    "references/README.md",
    "scripts/example.sh"
  ]);
  const manifest = JSON.parse(await readArchiveEntry(outputPath, ".openclaw-skillkit/manifest.json"));
  assert.equal(manifest.schemaVersion, 1);
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
});

serialTest("cli pack surfaces warnings before creating the archive", async () => {
  const tempDir = await makeTempDir("openclaw-pack-warning-");
  const skillDir = path.join(tempDir, "skill");
  const outputPath = path.join(tempDir, "artifact.skill");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);

  const result = await runCli(["pack", skillDir, "--output", outputPath]);

  assert.equal(result.code, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /Packing with \d+ warning\(s\):/);
});

serialTest("cli pack fails when lint errors exist", async () => {
  const tempDir = await makeTempDir("openclaw-pack-invalid-");
  const skillDir = path.join(tempDir, "skill");
  await copyFixture(path.join("invalid", "bad-version-skill"), skillDir);

  const result = await runCli(["pack", skillDir]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Cannot pack .* because lint found 2 error\(s\)\./);
});

serialTest("cli pack defaults to the current directory", async () => {
  const tempDir = await makeTempDir("openclaw-pack-cwd-");
  const skillDir = path.join(tempDir, "skill");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);

  const result = await runCli(["pack"], { cwd: skillDir });

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Archive ready: /);
  await fs.access(path.join(tempDir, "skill.skill"));
});

serialTest("cli pack appends .skill and creates the output directory when needed", async () => {
  const tempDir = await makeTempDir("openclaw-pack-output-");
  const skillDir = path.join(tempDir, "skill");
  const outputPath = path.join(tempDir, "artifacts", "release", "artifact");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);

  const result = await runCli(["pack", skillDir, "--output", outputPath]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Output path did not end in \.skill\. Using /);
  await fs.access(`${outputPath}.skill`);
});

serialTest("cli pack supports json output for artifact pipelines", async () => {
  const tempDir = await makeTempDir("openclaw-pack-json-");
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
  assert.equal(payload.manifest.skill.name, "weather-research");
  assert.deepEqual(payload.manifest.entries.map((entry) => entry.path), [
    "SKILL.md",
    "assets/README.txt",
    "references/README.md",
    "scripts/example.sh"
  ]);
});

serialTest("cli pack excludes nested .skill artifacts from the archive payload", async () => {
  const tempDir = await makeTempDir("openclaw-pack-nested-artifact-");
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
  const tempDir = await makeTempDir("openclaw-pack-extension-");
  const skillDir = path.join(tempDir, "skill");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);

  const result = await runCli(["pack", skillDir, "--output", "./artifact.zip"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Output must end with "\.skill"\. Received "\.\/artifact\.zip"\./);
});

serialTest("cli help supports command-specific output", async () => {
  const result = await runCli(["help", "pack"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /openclaw-skillkit pack/);
  assert.match(result.stdout, /Create a \.skill archive after lint passes\./);
  assert.match(result.stdout, /openclaw-skillkit pack$/m);
});

serialTest("cli help documents the local studio command", async () => {
  const result = await runCli(["help", "serve"]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /openclaw-skillkit serve/);
  assert.match(result.stdout, /local OpenClaw Skill Studio web interface/);
  assert.match(result.stdout, /--port 3210/);
});

serialTest("cli inspect reads the embedded archive manifest", async () => {
  const tempDir = await makeTempDir("openclaw-inspect-");
  const skillDir = path.join(tempDir, "skill");
  const outputPath = path.join(tempDir, "artifact.skill");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);
  const packResult = await runCli(["pack", skillDir, "--output", outputPath]);
  assert.equal(packResult.code, 0, packResult.stderr);

  const result = await runCli(["inspect", outputPath]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Inspecting /);
  assert.match(result.stdout, /Skill: weather-research@1\.2\.3/);
  assert.match(result.stdout, /Description: Skill for structured weather research/);
  assert.match(result.stdout, /Contents: SKILL\.md \(\d+ B\), assets\/README\.txt/);
});

serialTest("cli inspect supports json output", async () => {
  const tempDir = await makeTempDir("openclaw-inspect-json-");
  const skillDir = path.join(tempDir, "skill");
  const outputPath = path.join(tempDir, "artifact.skill");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);
  const packResult = await runCli(["pack", skillDir, "--output", outputPath]);
  assert.equal(packResult.code, 0, packResult.stderr);

  const result = await runCli(["inspect", outputPath, "--json"]);

  assert.equal(result.code, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.archivePath, outputPath);
  assert.equal(payload.manifest.skill.version, "1.2.3");
  assert.equal(payload.manifest.entryCount, 4);
});

serialTest("cli rejects unknown flags with a clear error", async () => {
  const result = await runCli(["lint", "--output", "./artifact.skill"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Unknown flag\(s\): --output\. This command supports --format, --json and --help\./);
});

serialTest("cli lint rejects conflicting format flags", async () => {
  const result = await runCli(["lint", "--json", "--format", "text"]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Use either --json or --format, not both\./);
});
