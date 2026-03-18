"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

const { runDetectionBenchmark } = require("./run-detection-benchmark.js");
const { runCliBenchmark } = require("./run-cli-benchmark.js");

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const benchmarkOptions = { silent: options.json };
  const detection = await runDetectionBenchmark(benchmarkOptions);
  const cli = await runCliBenchmark(options.iterations, benchmarkOptions);
  const report = buildReport(detection, cli, options.iterations);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printSummary(report);
  }

  if (options.output) {
    await writeReport(options.output, report);
    if (!options.json) {
      console.log(`Exported benchmark report to ${path.resolve(options.output)}`);
    }
  }
}

function parseArgs(argv) {
  const options = {
    iterations: 5,
    json: false,
    output: undefined
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--json") {
      options.json = true;
      continue;
    }

    if (token === "--help") {
      printHelp();
      process.exitCode = 0;
      process.exit();
    }

    if (token === "--iterations") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--iterations requires a numeric value.");
      }

      options.iterations = parseIterations(value);
      index += 1;
      continue;
    }

    if (token.startsWith("--iterations=")) {
      options.iterations = parseIterations(token.split("=", 2)[1]);
      continue;
    }

    if (token === "--output") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("--output requires a file path.");
      }

      options.output = value;
      index += 1;
      continue;
    }

    if (token.startsWith("--output=")) {
      options.output = token.split("=", 2)[1];
      continue;
    }

    throw new Error(`Unknown benchmark option "${token}".`);
  }

  return options;
}

function parseIterations(value) {
  const iterations = Number.parseInt(value, 10);
  if (!Number.isInteger(iterations) || iterations <= 0) {
    throw new Error("--iterations must be a positive integer.");
  }

  return iterations;
}

function buildReport(detection, cli, iterations) {
  return {
    generatedAt: new Date().toISOString(),
    iterations,
    detection: {
      total: detection.metrics.total,
      correct: detection.metrics.correct,
      accuracy: detection.metrics.accuracy,
      precision: detection.metrics.precision,
      recall: detection.metrics.recall,
      accuracyLabel: detection.format.accuracy,
      precisionLabel: detection.format.precision,
      recallLabel: detection.format.recall,
      cases: detection.results
    },
    cli: {
      lint: cli.summary.lint,
      roundTrip: cli.summary.roundTrip,
      samples: {
        lintMs: cli.lintSamples,
        roundTripMs: cli.roundTripSamples
      }
    }
  };
}

function printSummary(report) {
  console.log("");
  console.log("Benchmark summary");
  console.log(
    `  Detection: ${report.detection.correct}/${report.detection.total} correct (${report.detection.accuracyLabel}), precision ${report.detection.precisionLabel}, recall ${report.detection.recallLabel}`
  );
  console.log(
    `  CLI lint x${report.iterations}: min ${report.cli.lint.minMs.toFixed(1)}ms, p50 ${report.cli.lint.p50Ms.toFixed(1)}ms, avg ${report.cli.lint.averageMs.toFixed(1)}ms`
  );
  console.log(
    `  Round trip x${report.iterations}: min ${report.cli.roundTrip.minMs.toFixed(1)}ms, p50 ${report.cli.roundTrip.p50Ms.toFixed(1)}ms, avg ${report.cli.roundTrip.averageMs.toFixed(1)}ms`
  );
}

async function writeReport(outputPath, report) {
  const resolvedPath = path.resolve(outputPath);
  await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
  await fs.writeFile(resolvedPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

function printHelp() {
  console.log(`skillforge benchmark

Usage:
  npm run benchmark
  npm run benchmark -- --iterations 10
  npm run benchmark -- --json --output ./artifacts/benchmark.json

Options:
  --iterations <n>  Number of CLI benchmark iterations to run (default: 5)
  --json            Print the combined benchmark report as JSON
  --output <file>   Write the combined benchmark report to a JSON file
`);
}

module.exports = {
  buildReport,
  main,
  parseArgs
};

if (require.main === module) {
  main().catch((error) => {
    console.error(`Benchmark failed: ${error.message}`);
    process.exitCode = 1;
  });
}
