#!/usr/bin/env node
import path from "node:path";
import { parseArgs, getFlag } from "./lib/args";
import { runInit } from "./commands/init";
import { runLint } from "./commands/lint";
import { runPack } from "./commands/pack";
import { runInspect } from "./commands/inspect";
import { runServe } from "./commands/serve";
import { TEMPLATE_MODES, type TemplateMode } from "./lib/templates";
import { getExampleSkillForTemplate } from "./commands/init";

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
    case "inspect":
      await handleInspect(parsed);
      return;
    case "serve":
      await handleServe(parsed);
      return;
    case undefined:
      printHelp("overview");
      return;
    default:
      throw new Error(`Unknown command "${parsed.command}". Run "openclaw-skillkit help" for usage.`);
  }
}

async function handleInit(parsed: ReturnType<typeof parseArgs>): Promise<void> {
  assertNoUnexpectedFlags(parsed, ["name", "description", "template", "resources", "force"]);
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
  const template = parseTemplateMode(getFlag(parsed, "template"));

  await runInit({
    targetDir,
    name: typeof getFlag(parsed, "name") === "string" ? String(getFlag(parsed, "name")) : undefined,
    description:
      typeof getFlag(parsed, "description") === "string"
        ? String(getFlag(parsed, "description"))
        : undefined,
    template,
    resources,
    force: getFlag(parsed, "force") === true
  });

  const resolvedTargetDir = path.resolve(targetDir);
  const createdEntries = ["SKILL.md"];
  for (const resource of templateResourcesForSummary(template, resources)) {
    createdEntries.push(`${resource}/`);
  }

  console.log(`Initialized skill at ${resolvedTargetDir}`);
  console.log(`Template: ${template}`);
  console.log(`Created: ${createdEntries.join(", ")}`);
  console.log(`Next: edit ${resolvedTargetDir}/SKILL.md`);
  console.log(`Reference example: ${getExampleSkillForTemplate(template, resources)}`);
  console.log(`Then: openclaw-skillkit lint ${resolvedTargetDir}`);
  console.log(`Ship: openclaw-skillkit pack ${resolvedTargetDir}`);
}

async function handleLint(parsed: ReturnType<typeof parseArgs>): Promise<void> {
  assertNoUnexpectedFlags(parsed, ["format", "json"]);
  assertArgumentCount(parsed, 1, "lint accepts at most 1 target directory.");

  const targetDir = parsed.positionals[0] ?? ".";
  const format = parseMachineFormat(parsed, "lint");
  const exitCode = await runLint(targetDir, { format });
  process.exitCode = exitCode;
}

async function handlePack(parsed: ReturnType<typeof parseArgs>): Promise<void> {
  assertNoUnexpectedFlags(parsed, ["output", "format", "json"]);
  assertArgumentCount(parsed, 1, "pack expects exactly 1 target directory.");

  const targetDir = parsed.positionals[0] ?? ".";
  await runPack(targetDir, {
    outputPath: typeof getFlag(parsed, "output") === "string" ? String(getFlag(parsed, "output")) : undefined,
    format: parseMachineFormat(parsed, "pack")
  });
}

async function handleInspect(parsed: ReturnType<typeof parseArgs>): Promise<void> {
  assertNoUnexpectedFlags(parsed, ["format", "json"]);
  assertArgumentCount(parsed, 1, "inspect expects exactly 1 archive path.");

  const archivePath = parsed.positionals[0];
  if (!archivePath) {
    throw new Error('inspect requires a .skill archive path. Run "openclaw-skillkit help inspect" for examples.');
  }

  await runInspect(archivePath, { format: parseMachineFormat(parsed, "inspect") });
}

async function handleServe(parsed: ReturnType<typeof parseArgs>): Promise<void> {
  assertNoUnexpectedFlags(parsed, ["host", "port"]);
  assertArgumentCount(parsed, 0, "serve does not accept positional arguments.");

  const portValue = getFlag(parsed, "port");
  const port =
    typeof portValue === "string" && /^\d+$/.test(portValue)
      ? Number(portValue)
      : typeof portValue === "undefined"
        ? 3210
        : Number.NaN;

  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error('serve expects --port to be an integer between 0 and 65535.');
  }

  await runServe({
    host: typeof getFlag(parsed, "host") === "string" ? String(getFlag(parsed, "host")) : "127.0.0.1",
    port
  });
}

function assertNoUnexpectedFlags(parsed: ReturnType<typeof parseArgs>, allowed: string[]): void {
  const unexpected = [...parsed.flags.keys()].filter((flag) => flag !== "help" && !allowed.includes(flag));
  if (unexpected.length > 0) {
    const allowedFlags = allowed.length > 0 ? allowed.map((flag) => `--${flag}`).join(", ") : "no flags";
    throw new Error(
      `Unknown flag(s): ${unexpected.map((flag) => `--${flag}`).join(", ")}. This command supports ${allowedFlags} and --help.`
    );
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
  openclaw-skillkit init <dir> [--name my-skill] [--description "Skill summary"] [--template minimal|references|scripts|full] [--resources references,scripts,assets] [--force]

Examples:
  openclaw-skillkit init skills/customer-support --template scripts
  openclaw-skillkit init skills/customer-support --template full
  openclaw-skillkit init ./skill --name customer-support --description "Skill for triage workflows"
`);
    return;
  }

  if (command === "lint") {
    console.log(`openclaw-skillkit lint

Validate a skill directory for packaging and review.

Usage:
  openclaw-skillkit lint [dir] [--json|--format text|json]

Examples:
  openclaw-skillkit lint
  openclaw-skillkit lint --json
  openclaw-skillkit lint examples/weather-research-skill
`);
    return;
  }

  if (command === "pack") {
    console.log(`openclaw-skillkit pack

Create a .skill archive after lint passes.

  Usage:
  openclaw-skillkit pack [dir] [--output ./dist/my-skill.skill] [--json|--format text|json]

Examples:
  openclaw-skillkit pack
  openclaw-skillkit pack skills/customer-support
  openclaw-skillkit pack skills/customer-support --output ./artifacts/customer-support
  openclaw-skillkit pack skills/customer-support --output ./artifacts/customer-support.skill
`);
    return;
  }

  if (command === "inspect") {
    console.log(`openclaw-skillkit inspect

Inspect a packaged .skill archive and print the embedded manifest.

Usage:
  openclaw-skillkit inspect <archive.skill> [--json|--format text|json]

Examples:
  openclaw-skillkit inspect ./artifacts/customer-support.skill
  openclaw-skillkit inspect ./artifacts/customer-support.skill --json
`);
    return;
  }

  if (command === "serve") {
    console.log(`openclaw-skillkit serve

Run the local OpenClaw Skill Studio web interface.

Usage:
  openclaw-skillkit serve [--host 127.0.0.1] [--port 3210]

Examples:
  openclaw-skillkit serve
  openclaw-skillkit serve --port 4310
  openclaw-skillkit serve --host 0.0.0.0 --port 3210
`);
    return;
  }

  console.log(`openclaw-skillkit

Build, lint, and pack OpenClaw skills.

Usage:
  openclaw-skillkit init <dir> [--name my-skill] [--description "Skill summary"] [--template minimal|references|scripts|full] [--resources references,scripts,assets] [--force]
  openclaw-skillkit lint [dir] [--json|--format text|json]
  openclaw-skillkit pack [dir] [--output ./dist/my-skill.skill] [--json|--format text|json]
  openclaw-skillkit inspect <archive.skill> [--json|--format text|json]
  openclaw-skillkit serve [--host 127.0.0.1] [--port 3210]

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

function parseTemplateMode(value: string | boolean | undefined): TemplateMode {
  if (value === undefined) {
    return "minimal";
  }

  if (typeof value !== "string") {
    throw new Error(`--template expects one of: ${Object.keys(TEMPLATE_MODES).join(", ")}`);
  }

  if (value in TEMPLATE_MODES) {
    return value as TemplateMode;
  }

  throw new Error(`Unknown template mode "${value}". Use one of: ${Object.keys(TEMPLATE_MODES).join(", ")}.`);
}

function parseMachineFormat(parsed: ReturnType<typeof parseArgs>, commandName: string): "text" | "json" {
  const jsonFlag = getFlag(parsed, "json");
  const formatFlag = getFlag(parsed, "format");

  if (jsonFlag === true && formatFlag !== undefined) {
    throw new Error('Use either --json or --format, not both.');
  }

  if (jsonFlag === true) {
    return "json";
  }

  if (formatFlag === undefined) {
    return "text";
  }

  if (typeof formatFlag !== "string") {
    throw new Error(`\`--format\` for ${commandName} expects "text" or "json".`);
  }

  if (formatFlag === "text" || formatFlag === "json") {
    return formatFlag;
  }

  throw new Error(`Unknown ${commandName} format "${formatFlag}". Use "text" or "json".`);
}

function templateResourcesForSummary(template: TemplateMode, resources: string[]): string[] {
  return [...new Set([...TEMPLATE_MODES[template], ...resources])];
}
