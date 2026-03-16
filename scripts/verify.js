"use strict";

const { existsSync, readdirSync, statSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.resolve(__dirname, "..");
const tscBin = path.join(repoRoot, "node_modules", "typescript", "bin", "tsc");

if (existsSync(tscBin) && statSync(tscBin).size > 0) {
  run(process.execPath, [tscBin, "-p", "tsconfig.json", "--noEmit"]);
  run(process.execPath, [tscBin, "-p", "tsconfig.json"]);
} else {
  console.log("verify: local TypeScript compiler unavailable; skipping check/build and testing checked-in dist/");
}

run(process.execPath, ["--test", ...getTestFiles()]);
run(process.execPath, ["bench/index.js"]);

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit"
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function getTestFiles() {
  return readdirSync(path.join(repoRoot, "test"))
    .filter((entry) => entry.endsWith(".test.js"))
    .sort()
    .map((entry) => path.join("test", entry));
}
