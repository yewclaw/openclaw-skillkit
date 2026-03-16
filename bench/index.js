"use strict";

const { runDetectionBenchmark } = require("./run-detection-benchmark.js");
const { runCliBenchmark } = require("./run-cli-benchmark.js");

async function main() {
  const detection = await runDetectionBenchmark();
  const cli = await runCliBenchmark();

  console.log("");
  console.log("Benchmark summary");
  console.log(
    `  Detection accuracy ${detection.metrics.correct}/${detection.metrics.total} (${detection.format.accuracy})`
  );
  console.log(
    `  CLI lint p50 ${cli.summary.lint.p50Ms.toFixed(1)}ms, init+lint+pack avg ${cli.summary.roundTrip.averageMs.toFixed(1)}ms`
  );
}

main().catch((error) => {
  console.error(`Benchmark failed: ${error.message}`);
  process.exitCode = 1;
});
