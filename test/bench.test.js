"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { buildReport, parseArgs } = require("../bench/index.js");

test("benchmark args support json, output, and iterations", () => {
  assert.deepEqual(parseArgs(["--json", "--iterations", "7", "--output", "./artifacts/report.json"]), {
    iterations: 7,
    json: true,
    output: "./artifacts/report.json"
  });
});

test("benchmark args reject invalid iterations", () => {
  assert.throws(() => parseArgs(["--iterations", "0"]), /--iterations must be a positive integer/);
});

test("buildReport combines detection and cli benchmark data", () => {
  const report = buildReport(
    {
      metrics: {
        total: 4,
        correct: 3,
        accuracy: 0.75,
        precision: 1,
        recall: 0.5
      },
      format: {
        accuracy: "75.0%",
        precision: "100.0%",
        recall: "50.0%"
      },
      results: [{ name: "sample-case", expected: "good", predicted: "good" }]
    },
    {
      summary: {
        lint: { minMs: 10, p50Ms: 12, averageMs: 11 },
        roundTrip: { minMs: 20, p50Ms: 25, averageMs: 22 }
      },
      lintSamples: [10, 12, 11],
      roundTripSamples: [20, 25, 22]
    },
    3
  );

  assert.equal(report.iterations, 3);
  assert.equal(report.detection.accuracyLabel, "75.0%");
  assert.deepEqual(report.cli.samples.lintMs, [10, 12, 11]);
  assert.match(report.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("benchmark CLI can export a json report", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-benchmark-"));
  const outputPath = path.join(tempDir, "benchmark.json");

  try {
    const result = spawnSync(
      process.execPath,
      ["bench/index.js", "--iterations", "1", "--output", outputPath, "--json"],
      {
        cwd: path.resolve(__dirname, ".."),
        encoding: "utf8"
      }
    );

    assert.equal(result.status, 0, result.stderr);
    const writtenReport = JSON.parse(await fs.readFile(outputPath, "utf8"));
    assert.equal(writtenReport.iterations, 1);
    assert.equal(writtenReport.detection.total > 0, true);
    assert.deepEqual(writtenReport.cli.samples.lintMs.length, 1);

    if (result.stdout.trim()) {
      assert.deepEqual(JSON.parse(result.stdout), writtenReport);
    }
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});
