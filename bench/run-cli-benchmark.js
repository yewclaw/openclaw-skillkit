"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const cliPath = path.resolve(__dirname, "..", "dist", "cli.js");
const exampleSkillDir = path.resolve(__dirname, "..", "examples", "weather-research-skill");

async function runCliBenchmark(iterations = 5, options = {}) {
  const silent = options.silent === true;
  const lintSamples = [];
  const roundTripSamples = [];

  for (let index = 0; index < iterations; index += 1) {
    lintSamples.push(runCommand(["lint", exampleSkillDir]).durationMs);
    roundTripSamples.push(await runRoundTrip(index));
  }

  const summary = {
    lint: summarizeDurations(lintSamples),
    roundTrip: summarizeDurations(roundTripSamples)
  };

  if (!silent) {
    console.log("CLI benchmark");
    console.log(
      `  lint x${iterations}: min ${summary.lint.minMs.toFixed(1)}ms, p50 ${summary.lint.p50Ms.toFixed(1)}ms, avg ${summary.lint.averageMs.toFixed(1)}ms`
    );
    console.log(
      `  init+lint+pack x${iterations}: min ${summary.roundTrip.minMs.toFixed(1)}ms, p50 ${summary.roundTrip.p50Ms.toFixed(1)}ms, avg ${summary.roundTrip.averageMs.toFixed(1)}ms`
    );
  }

  return { summary, lintSamples, roundTripSamples };
}

function runCommand(args) {
  const startedAt = process.hrtime.bigint();
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    encoding: "utf8"
  });
  const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || `CLI exited with status ${result.status}`);
  }

  return {
    durationMs,
    stdout: result.stdout
  };
}

async function runRoundTrip(index) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `openclaw-bench-${index}-`));
  const skillDir = path.join(tempDir, "bench-skill");
  const archivePath = path.join(tempDir, "bench-skill.skill");
  const startedAt = process.hrtime.bigint();

  try {
    runCommand([
      "init",
      skillDir,
      "--name",
      "bench-skill",
      "--description",
      "Skill for repeatable benchmark round trips.",
      "--resources",
      "references,scripts,assets"
    ]);
    runCommand(["lint", skillDir]);
    runCommand(["pack", skillDir, "--output", archivePath]);
    return Number(process.hrtime.bigint() - startedAt) / 1e6;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function summarizeDurations(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  const midpoint = Math.floor(sorted.length / 2);

  return {
    minMs: sorted[0] ?? 0,
    p50Ms: sorted[midpoint] ?? 0,
    averageMs: sorted.length === 0 ? 0 : total / sorted.length
  };
}

module.exports = {
  runCliBenchmark,
  summarizeDurations
};

if (require.main === module) {
  runCliBenchmark().catch((error) => {
    console.error(`CLI benchmark failed: ${error.message}`);
    process.exitCode = 1;
  });
}
