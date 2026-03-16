#!/usr/bin/env node
import { parseArgs, getFlag } from "./lib/args";
import { runInit } from "./commands/init";
import { runLint } from "./commands/lint";
import { runPack } from "./commands/pack";

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv);

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
    case "help":
    case undefined:
      printHelp();
      return;
    default:
      throw new Error(`Unknown command "${parsed.command}".`);
  }
}

async function handleInit(parsed: ReturnType<typeof parseArgs>): Promise<void> {
  const targetDir = parsed.positionals[0];
  if (!targetDir) {
    throw new Error("init requires a target directory.");
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
  const targetDir = parsed.positionals[0] ?? ".";
  const exitCode = await runLint(targetDir);
  process.exitCode = exitCode;
}

async function handlePack(parsed: ReturnType<typeof parseArgs>): Promise<void> {
  const targetDir = parsed.positionals[0];
  if (!targetDir) {
    throw new Error("pack requires a target directory.");
  }

  const output = typeof getFlag(parsed, "output") === "string" ? String(getFlag(parsed, "output")) : undefined;
  await runPack(targetDir, output);
}

function printHelp(): void {
  console.log(`openclaw-skillkit

Usage:
  openclaw-skillkit init <dir> [--name my-skill] [--description "Skill summary"] [--resources references,scripts,assets] [--force]
  openclaw-skillkit lint [dir]
  openclaw-skillkit pack <dir> [--output ./dist/my-skill.skill]
`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Error: ${(error as Error).message}`);
    process.exitCode = 1;
  });
}
