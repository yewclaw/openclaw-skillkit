"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const { evaluateDetectionCases, classifyLintResult, formatRatio } = require("../dist/lib/evaluation.js");
const { lintSkill } = require("../dist/lib/skill.js");

const benchmarkRoot = path.resolve(__dirname, "..", "test", "fixtures", "benchmark");

async function runDetectionBenchmark() {
  const cases = await loadBenchmarkCases();
  const results = [];

  for (const item of cases) {
    const lintResult = await lintSkill(item.skillDir);
    results.push({
      name: item.name,
      expected: item.expected,
      predicted: classifyLintResult(lintResult),
      errorCount: lintResult.issues.filter((issue) => issue.level === "error").length,
      warningCount: lintResult.issues.filter((issue) => issue.level === "warning").length
    });
  }

  const metrics = evaluateDetectionCases(results);
  const format = {
    accuracy: formatRatio(metrics.accuracy),
    precision: formatRatio(metrics.precision),
    recall: formatRatio(metrics.recall)
  };

  console.log("Detection benchmark");
  for (const result of results) {
    console.log(
      `  ${result.expected === result.predicted ? "PASS" : "FAIL"} ${result.name}: expected ${result.expected}, predicted ${result.predicted} (${result.errorCount} error(s), ${result.warningCount} warning(s))`
    );
  }
  console.log(
    `  Accuracy ${metrics.correct}/${metrics.total} (${format.accuracy}), precision ${format.precision}, recall ${format.recall}`
  );

  return { metrics, format, results };
}

async function loadBenchmarkCases() {
  const groups = await fs.readdir(benchmarkRoot, { withFileTypes: true });
  const cases = [];

  for (const group of groups) {
    if (!group.isDirectory()) {
      continue;
    }

    const expected = group.name === "good" ? "good" : "bad";
    const groupDir = path.join(benchmarkRoot, group.name);
    const entries = await fs.readdir(groupDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }

      cases.push({
        name: entry.name,
        expected,
        skillDir: path.join(groupDir, entry.name)
      });
    }
  }

  return cases.sort((left, right) => left.name.localeCompare(right.name));
}

module.exports = {
  loadBenchmarkCases,
  runDetectionBenchmark
};

if (require.main === module) {
  runDetectionBenchmark().catch((error) => {
    console.error(`Detection benchmark failed: ${error.message}`);
    process.exitCode = 1;
  });
}
