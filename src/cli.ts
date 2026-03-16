#!/usr/bin/env node
import { parseArgs, getFlag } from "./lib/args";
import { runInit } from "./commands/init";
import { runLint } from "./commands/lint";
import { runPack } from "./commands/pack";

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv);
  const wantsHelp = parsed.command === "help" || getFlag(parsed, "help") === true;

  if (wantsHelp) {
    printHelp(parsed.command === "help" ? parsed.positionals[0] : parsed.command);
    return;
  }

  switch (parsed.command) {
    case "init":
      await handleInit(parsed);
      return;
    case "lint":
      await handleLint(parsed);
      return;
    case "pack":
      await handlePack(parsed);
      return;
    case undefined:
      printHelp("overview");
      return;
    default:
      throw new Error(`Unknown command "${parsed.command}". Run "openclaw-skillkit help" for usage.`);
  }
}

async function handleInit(parsed: ReturnType<typeof parseArgs>): Promise<void> {
  assertNoUnexpectedFlags(parsed, ["name", "description", "resources", "force"]);
  assertArgumentCount(parsed, 1, "init expects exactly 1 target directory.");

  const targetDir = parsed.positionals[0];
  if (!targetDir) {
    throw new Error('init requires a target directory. Run "openclaw-skillkit help init" for examples.');
  }

  const resourcesValue = getFlag(parsed, "resources");
  const resources = typeof resourcesValue === "string"
    ? resourcesValue
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

  await runInit({
    targetDir,
    name: typeof getFlag(parsed, "name") === "string" ? String(getFlag(parsed, "name")) : undefined,
    description:
      typeof getFlag(parsed, "description") === "string"
        ? String(getFlag(parsed, "description"))
        : undefined,
    resources,
    force: getFlag(parsed, "force") === true
  });

  console.log(`Initialized skill at ${targetDir}`);
}

async function handleLint(parsed: ReturnType<typeof parseArgs>): Promise<void> {
  assertNoUnexpectedFlags(parsed, []);
  assertArgumentCount(parsed, 1, "lint accepts at most 1 target directory.");

  const targetDir = parsed.positionals[0] ?? ".";
  const exitCode = await runLint(targetDir);
  process.exitCode = exitCode;
}

async function handlePack(parsed: ReturnType<typeof parseArgs>): Promise<void> {
  assertNoUnexpectedFlags(parsed, ["output"]);
  assertArgumentCount(parsed, 1, "pack expects exactly 1 target directory.");

  const targetDir = parsed.positionals[0];
  if (!targetDir) {
    throw new Error('pack requires a target directory. Run "openclaw-skillkit help pack" for examples.');
  }

  const output = typeof getFlag(parsed, "output") === "string" ? String(getFlag(parsed, "output")) : undefined;
  await runPack(targetDir, output);
}

function assertNoUnexpectedFlags(parsed: ReturnType<typeof parseArgs>, allowed: string[]): void {
  const unexpected = [...parsed.flags.keys()].filter((flag) => flag !== "help" && !allowed.includes(flag));
  if (unexpected.length > 0) {
    throw new Error(`Unknown flag(s): ${unexpected.map((flag) => `--${flag}`).join(", ")}.`);
  }
}

function assertArgumentCount(parsed: ReturnType<typeof parseArgs>, max: number, message: string): void {
  if (parsed.positionals.length > max) {
    throw new Error(message);
  }
}

function printHelp(command = "overview"): void {
  if (command === "init") {
    console.log(`openclaw-skillkit init

Scaffold a ready-to-edit skill directory.

Usage:
  openclaw-skillkit init <dir> [--name my-skill] [--description "Skill summary"] [--resources references,scripts,assets] [--force]

Examples:
  openclaw-skillkit init skills/customer-support --resources references,scripts
  openclaw-skillkit init ./skill --name customer-support --description "Skill for triage workflows"
`);
    return;
  }

  if (command === "lint") {
    console.log(`openclaw-skillkit lint

Validate a skill directory for packaging and review.

Usage:
  openclaw-skillkit lint [dir]

Examples:
  openclaw-skillkit lint
  openclaw-skillkit lint examples/weather-research-skill
`);
    return;
  }

  if (command === "pack") {
    console.log(`openclaw-skillkit pack

Create a .skill archive after lint passes.

Usage:
  openclaw-skillkit pack <dir> [--output ./dist/my-skill.skill]

Examples:
  openclaw-skillkit pack skills/customer-support
  openclaw-skillkit pack skills/customer-support --output ./artifacts/customer-support.skill
`);
    return;
  }

  console.log(`openclaw-skillkit

Build, lint, and pack OpenClaw skills.

Usage:
  openclaw-skillkit init <dir> [--name my-skill] [--description "Skill summary"] [--resources references,scripts,assets] [--force]
  openclaw-skillkit lint [dir]
  openclaw-skillkit pack <dir> [--output ./dist/my-skill.skill]

Help:
  openclaw-skillkit help
  openclaw-skillkit help <command>
  openclaw-skillkit <command> --help
`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Error: ${(error as Error).message}`);
    process.exitCode = 1;
  });
}
