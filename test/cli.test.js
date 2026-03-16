"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");

const { copyFixture, makeTempDir, readArchiveEntries } = require("./helpers/fixture.js");
const { main } = require("../dist/cli.js");

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

test("cli init scaffolds a skill with requested resources", async () => {
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
  assert.match(await fs.readFile(path.join(targetDir, "SKILL.md"), "utf8"), /name: customer-support/);
  await fs.access(path.join(targetDir, "references", "README.md"));
  await fs.access(path.join(targetDir, "scripts", "example.sh"));
  await fs.access(path.join(targetDir, "assets", "README.txt"));
});

test("cli lint succeeds for a valid fixture", async () => {
  const tempDir = await makeTempDir("openclaw-lint-valid-");
  const skillDir = path.join(tempDir, "skill");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);

  const result = await runCli(["lint", skillDir]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Summary: 0 error\(s\), 1 warning\(s\)\./);
});

test("cli lint fails for an invalid fixture", async () => {
  const tempDir = await makeTempDir("openclaw-lint-invalid-");
  const skillDir = path.join(tempDir, "skill");
  await copyFixture(path.join("invalid", "bad-version-skill"), skillDir);

  const result = await runCli(["lint", skillDir]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /Frontmatter version must look like semver/);
  assert.match(result.stdout, /Frontmatter name must be at least 3 characters/);
});

test("cli lint reports broken markdown references", async () => {
  const tempDir = await makeTempDir("openclaw-lint-reference-");
  const skillDir = path.join(tempDir, "skill");
  await copyFixture(path.join("benchmark", "bad", "broken-reference-skill"), skillDir);

  const result = await runCli(["lint", skillDir]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /Referenced markdown file not found: references\/missing\.md/);
});

test("cli pack creates a .skill archive for a valid fixture", async () => {
  const tempDir = await makeTempDir("openclaw-pack-valid-");
  const skillDir = path.join(tempDir, "skill");
  const outputPath = path.join(tempDir, "artifact.skill");
  await copyFixture(path.join("valid", "basic-skill"), skillDir);

  const result = await runCli(["pack", skillDir, "--output", outputPath]);

  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /Packed 4 file\(s\) into/);
  const entries = await readArchiveEntries(outputPath);
  assert.deepEqual(entries.sort(), [
    "SKILL.md",
    "assets/README.txt",
    "references/README.md",
    "scripts/example.sh"
  ]);
});

test("cli pack fails when lint errors exist", async () => {
  const tempDir = await makeTempDir("openclaw-pack-invalid-");
  const skillDir = path.join(tempDir, "skill");
  await copyFixture(path.join("invalid", "bad-version-skill"), skillDir);

  const result = await runCli(["pack", skillDir]);

  assert.equal(result.code, 1);
  assert.match(result.stderr, /Cannot pack .* because lint found 2 error\(s\)\./);
});
