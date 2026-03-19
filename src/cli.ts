#!/usr/bin/env node
import path from "node:path";
import { parseArgs, getFlag } from "./lib/args";
import { runInit } from "./commands/init";
import { runLint } from "./commands/lint";
import { runPack } from "./commands/pack";
import { runInspect } from "./commands/inspect";
import { runReview } from "./commands/review";
import { runIndex } from "./commands/index";
import { runServe } from "./commands/serve";
import { TEMPLATE_MODES, type TemplateMode } from "./lib/templates";

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
    case "review":
      await handleReview(parsed);
      return;
    case "index":
      await handleIndex(parsed);
      return;
    case "serve":
      await handleServe(parsed);
      return;
    case undefined:
      printHelp("overview");
      return;
    default:
      throw new Error(`Unknown command "${parsed.command}". Run "skillforge help" for usage.`);
  }
}

async function handleInit(parsed: ReturnType<typeof parseArgs>): Promise<void> {
  assertNoUnexpectedFlags(parsed, ["name", "description", "template", "resources", "force"]);
  assertArgumentCount(parsed, 1, "init expects exactly 1 target directory.");

  const targetDir = parsed.positionals[0];
  if (!targetDir) {
    throw new Error('init requires a target directory. Run "skillforge help init" for examples.');
  }

  const resourcesValue = getFlag(parsed, "resources");
  const resources = typeof resourcesValue === "string"
    ? resourcesValue
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
  const template = parseTemplateMode(getFlag(parsed, "template"));

  const result = await runInit({
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

  const createdEntries = ["SKILL.md"];
  for (const resource of templateResourcesForSummary(template, resources)) {
    createdEntries.push(`${resource}/`);
  }

  console.log("READY TO AUTHOR");
  console.log(`Initialized skill at ${result.skillDir}`);
  console.log(`Skill: ${result.inferredName}`);
  console.log(`Template: ${result.template}`);
  console.log(`Created: ${createdEntries.join(", ")}`);
  console.log(`Edit: ${result.skillFile}`);
  console.log(`Reference example: ${result.exampleSkill}`);
  console.log("Next:");
  console.log(`  1. Add real instructions to ${result.skillFile}`);
  console.log(`  2. Validate: skillforge lint ${result.skillDir}`);
  console.log(`  3. Package when clean: skillforge pack ${result.skillDir}`);
}

async function handleLint(parsed: ReturnType<typeof parseArgs>): Promise<void> {
  assertNoUnexpectedFlags(parsed, ["format", "json", "all", "report"]);
  assertArgumentCount(parsed, 1, "lint accepts at most 1 target directory.");

  const targetDir = parsed.positionals[0] ?? ".";
  const format = parseMachineFormat(parsed, "lint");
  const exitCode = await runLint(targetDir, {
    format,
    all: getFlag(parsed, "all") === true,
    reportPath: parseOptionalPathFlag(parsed, "report")
  });
  process.exitCode = exitCode;
}

async function handlePack(parsed: ReturnType<typeof parseArgs>): Promise<void> {
  assertNoUnexpectedFlags(parsed, ["output", "output-dir", "format", "json", "report", "all", "index"]);
  assertArgumentCount(parsed, 1, "pack expects exactly 1 target directory.");

  const targetDir = parsed.positionals[0] ?? ".";
  const batchMode = getFlag(parsed, "all") === true;
  if (batchMode && typeof getFlag(parsed, "output") === "string") {
    throw new Error('pack --all does not support --output. Use --output-dir to control where batch artifacts are written.');
  }
  await runPack(targetDir, {
    outputPath: typeof getFlag(parsed, "output") === "string" ? String(getFlag(parsed, "output")) : undefined,
    outputDir: typeof getFlag(parsed, "output-dir") === "string" ? String(getFlag(parsed, "output-dir")) : undefined,
    format: parseMachineFormat(parsed, "pack"),
    all: batchMode,
    indexPath: parseOptionalPathFlag(parsed, "index"),
    reportPath: parseOptionalPathFlag(parsed, "report")
  });
}

async function handleInspect(parsed: ReturnType<typeof parseArgs>): Promise<void> {
  assertNoUnexpectedFlags(parsed, ["format", "json", "source", "against", "report", "entry", "all", "baseline-dir", "index"]);
  assertArgumentCount(parsed, 1, "inspect expects exactly 1 archive path.");

  const archivePath = parsed.positionals[0];
  if (!archivePath) {
    throw new Error('inspect requires an archive path or archive directory. Run "skillforge help inspect" for examples.');
  }

  const batchMode = getFlag(parsed, "all") === true;
  if (batchMode && typeof getFlag(parsed, "source") === "string") {
    throw new Error('inspect --all does not support --source. Inspect individual archives when checking source drift.');
  }
  if (batchMode && typeof getFlag(parsed, "against") === "string") {
    throw new Error('inspect --all does not support --against. Use --baseline-dir to match each archive against a baseline archive directory.');
  }
  if (batchMode && typeof getFlag(parsed, "entry") === "string") {
    throw new Error('inspect --all does not support --entry. Inspect an individual archive when previewing bundled files.');
  }

  await runInspect(archivePath, {
    format: parseMachineFormat(parsed, "inspect"),
    all: batchMode,
    sourceDir: typeof getFlag(parsed, "source") === "string" ? String(getFlag(parsed, "source")) : undefined,
    baselineArchivePath: typeof getFlag(parsed, "against") === "string" ? String(getFlag(parsed, "against")) : undefined,
    baselineDir: typeof getFlag(parsed, "baseline-dir") === "string" ? String(getFlag(parsed, "baseline-dir")) : undefined,
    indexPath: parseOptionalPathFlag(parsed, "index"),
    reportPath: parseOptionalPathFlag(parsed, "report"),
    entryPath: typeof getFlag(parsed, "entry") === "string" ? String(getFlag(parsed, "entry")) : undefined
  });
}

async function handleReview(parsed: ReturnType<typeof parseArgs>): Promise<void> {
  assertNoUnexpectedFlags(parsed, ["output", "output-dir", "format", "json", "report", "against", "all", "baseline-dir", "index"]);
  assertArgumentCount(parsed, 1, "review accepts at most 1 target directory.");

  const targetDir = parsed.positionals[0] ?? ".";
  const batchMode = getFlag(parsed, "all") === true;
  if (batchMode && typeof getFlag(parsed, "output") === "string") {
    throw new Error('review --all does not support --output. Use --output-dir to control where batch artifacts are written.');
  }
  if (batchMode && typeof getFlag(parsed, "against") === "string") {
    throw new Error('review --all does not support --against. Use --baseline-dir to match each skill against a baseline archive directory.');
  }

  const exitCode = await runReview(targetDir, {
    outputPath: typeof getFlag(parsed, "output") === "string" ? String(getFlag(parsed, "output")) : undefined,
    outputDir: typeof getFlag(parsed, "output-dir") === "string" ? String(getFlag(parsed, "output-dir")) : undefined,
    format: parseMachineFormat(parsed, "review"),
    reportPath: parseOptionalPathFlag(parsed, "report"),
    indexPath: parseOptionalPathFlag(parsed, "index"),
    baselineArchivePath: typeof getFlag(parsed, "against") === "string" ? String(getFlag(parsed, "against")) : undefined,
    baselineDir: typeof getFlag(parsed, "baseline-dir") === "string" ? String(getFlag(parsed, "baseline-dir")) : undefined,
    all: batchMode
  });
  process.exitCode = exitCode;
}

async function handleIndex(parsed: ReturnType<typeof parseArgs>): Promise<void> {
  assertNoUnexpectedFlags(parsed, ["format", "json", "list", "plain", "limit", "commands", "apply", "yes"]);
  assertArgumentCount(parsed, 1, "index expects exactly 1 persisted index path.");

  const indexPath = parsed.positionals[0];
  if (!indexPath) {
    throw new Error('index requires a persisted batch index path. Run "skillforge help index" for examples.');
  }

  const limitValue = getFlag(parsed, "limit");
  const limit =
    typeof limitValue === "string" && /^\d+$/.test(limitValue)
      ? Number(limitValue)
      : typeof limitValue === "undefined"
        ? undefined
        : Number.NaN;

  if (typeof limit !== "undefined" && (!Number.isInteger(limit) || limit < 1)) {
    throw new Error('index expects --limit to be an integer greater than 0.');
  }

  const applyFlag = getFlag(parsed, "apply");
  if (applyFlag === true) {
    throw new Error("index requires --apply to name an action group.");
  }
  const applyName = typeof applyFlag === "string" ? String(applyFlag) : undefined;
  if (applyName && typeof getFlag(parsed, "list") === "string") {
    throw new Error("index does not allow --apply together with --list.");
  }
  if (applyName && getFlag(parsed, "commands") === true) {
    throw new Error("index does not allow --apply together with --commands.");
  }
  if (applyName && getFlag(parsed, "plain") === true) {
    throw new Error("index does not allow --apply together with --plain.");
  }
  if (applyName && typeof limit !== "undefined") {
    throw new Error("index does not allow --apply together with --limit.");
  }
  if (!applyName && getFlag(parsed, "yes") === true) {
    throw new Error("index only accepts --yes together with --apply.");
  }

  process.exitCode = await runIndex(indexPath, {
    format: parseMachineFormat(parsed, "index"),
    listName: typeof getFlag(parsed, "list") === "string" ? String(getFlag(parsed, "list")) : undefined,
    plain: getFlag(parsed, "plain") === true,
    limit,
    commands: getFlag(parsed, "commands") === true,
    applyName,
    confirm: getFlag(parsed, "yes") === true
  });
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
    console.log(`skillforge init

Scaffold a ready-to-edit skill directory.

Usage:
  skillforge init <dir> [--name my-skill] [--description "Skill summary"] [--template minimal|references|scripts|full] [--resources references,scripts,assets] [--force]

Examples:
  skillforge init skills/customer-support --template scripts
  skillforge init skills/customer-support --template full
  skillforge init ./skill --name customer-support --description "Skill for triage workflows"
`);
    return;
  }

  if (command === "lint") {
    console.log(`skillforge lint

Validate a skill directory for packaging and review.

Usage:
  skillforge lint [dir] [--all] [--report [./reports/lint-all.report.md]] [--json|--format text|json]

Examples:
  skillforge lint
  skillforge lint --json
  skillforge lint examples/weather-research-skill
  skillforge lint skills --all
  skillforge lint skills --all --report
`);
    return;
  }

  if (command === "pack") {
    console.log(`skillforge pack

Create a .skill archive after lint passes.

  Usage:
  skillforge pack [dir] [--output ./dist/my-skill.skill] [--report [./dist/my-skill.report.md]] [--json|--format text|json]
  skillforge pack [dir] --all [--output-dir ./.skillforge/pack-artifacts] [--index [./artifacts/batch-pack.index.json]] [--report [./reports/pack-all.report.md]] [--json|--format text|json]

Examples:
  skillforge pack
  skillforge pack skills/customer-support
  skillforge pack skills/customer-support --output ./artifacts/customer-support
  skillforge pack skills/customer-support --output ./artifacts/customer-support.skill
  skillforge pack skills/customer-support --report
  skillforge pack skills --all
  skillforge pack skills --all --output-dir ./artifacts/release --index --report
`);
    return;
  }

  if (command === "inspect") {
    console.log(`skillforge inspect

Inspect a packaged .skill archive and print the embedded manifest.

Usage:
  skillforge inspect <archive.skill> [--source ./skill-dir] [--against ./previous.skill] [--entry SKILL.md] [--report [./artifacts/customer-support.report.md]] [--json|--format text|json]
  skillforge inspect <archive-dir> --all [--baseline-dir ./released-skills] [--index [./.skillforge/inspect-all.index.json]] [--report [./reports/inspect-all.report.md]] [--json|--format text|json]

Examples:
  skillforge inspect ./artifacts/customer-support.skill
  skillforge inspect ./artifacts/customer-support.skill --source ./skills/customer-support
  skillforge inspect ./artifacts/customer-support.skill --against ./artifacts/customer-support-prev.skill
  skillforge inspect ./artifacts/customer-support.skill --entry SKILL.md
  skillforge inspect ./artifacts/customer-support.skill --source ./skills/customer-support --against ./artifacts/customer-support-prev.skill
  skillforge inspect ./artifacts/customer-support.skill --source ./skills/customer-support --report
  skillforge inspect ./released-skills --all
  skillforge inspect ./released-skills --all --baseline-dir ./previous-releases --index --report
  skillforge inspect ./artifacts/customer-support.skill --json
`);
    return;
  }

  if (command === "review") {
    console.log(`skillforge review

Run a release-readiness review for a skill directory.

Usage:
  skillforge review [dir] [--output ./dist/my-skill.skill] [--against ./dist/previous.skill] [--report [./dist/my-skill.review.md]] [--json|--format text|json]
  skillforge review [dir] --all [--output-dir ./.skillforge/review-artifacts] [--baseline-dir ./released-skills] [--index [./artifacts/review-all.index.json]] [--report [./reports/review-all.report.md]] [--json|--format text|json]

Examples:
  skillforge review
  skillforge review skills/customer-support
  skillforge review skills/customer-support --against ./artifacts/customer-support-prev.skill
  skillforge review skills/customer-support --output ./artifacts/customer-support.skill --report
  skillforge review skills --all
  skillforge review skills --all --output-dir ./artifacts/review
  skillforge review skills --all --baseline-dir ./released-skills --index --report
  skillforge review skills/customer-support --json
`);
    return;
  }

  if (command === "index") {
    console.log(`skillforge index

Read, query, and apply safe maintenance actions from a persisted batch inspect/review index.

Usage:
  skillforge index <index.json> [--list action-group] [--commands] [--plain] [--limit 20] [--json|--format text|json]
  skillforge index <index.json> --apply action-group [--yes] [--json|--format text|json]

Examples:
  skillforge index ./artifacts/review-all.index.json
  skillforge index ./artifacts/review-all.index.json --list blocked-skills
  skillforge index ./artifacts/review-all.index.json --list stale-artifacts --commands --plain
  skillforge index ./artifacts/review-all.index.json --list blocked-skills --commands --plain
  skillforge index ./artifacts/review-all.index.json --commands
  skillforge index ./artifacts/review-all.index.json --apply blocked-artifacts
  skillforge index ./artifacts/review-all.index.json --apply missing-baselines
  skillforge index ./artifacts/review-all.index.json --apply release-changes --yes
  skillforge index ./.skillforge/inspect-all.index.json --list orphaned-baselines --json
`);
    return;
  }

  if (command === "serve") {
    console.log(`skillforge serve

Run the local SkillForge Studio web interface.

Usage:
  skillforge serve [--host 127.0.0.1] [--port 3210]

Examples:
  skillforge serve
  skillforge serve --port 4310
  skillforge serve --host 0.0.0.0 --port 3210
`);
    return;
  }

  console.log(`skillforge

Author, validate, package, inspect, and review reusable skills.

Usage:
  skillforge init <dir> [--name my-skill] [--description "Skill summary"] [--template minimal|references|scripts|full] [--resources references,scripts,assets] [--force]
  skillforge lint [dir] [--all] [--report [./reports/lint-all.report.md]] [--json|--format text|json]
  skillforge pack [dir] [--output ./dist/my-skill.skill] [--report [./dist/my-skill.report.md]] [--json|--format text|json]
  skillforge pack [dir] --all [--output-dir ./.skillforge/pack-artifacts] [--index [./artifacts/batch-pack.index.json]] [--report [./reports/pack-all.report.md]] [--json|--format text|json]
  skillforge inspect <archive.skill> [--source ./skill-dir] [--against ./previous.skill] [--entry SKILL.md] [--report [./dist/my-skill.report.md]] [--json|--format text|json]
  skillforge inspect <archive-dir> --all [--baseline-dir ./released-skills] [--index [./.skillforge/inspect-all.index.json]] [--report [./reports/inspect-all.report.md]] [--json|--format text|json]
  skillforge review [dir] [--output ./dist/my-skill.skill] [--against ./dist/previous.skill] [--all] [--output-dir ./.skillforge/review-artifacts] [--baseline-dir ./released-skills] [--index [./artifacts/review-all.index.json]] [--report [./dist/my-skill.review.md]] [--json|--format text|json]
  skillforge index <index.json> [--list action-group] [--commands] [--plain] [--limit 20] [--json|--format text|json]
  skillforge index <index.json> --apply action-group [--yes] [--json|--format text|json]
  skillforge serve [--host 127.0.0.1] [--port 3210]

Help:
  skillforge help
  skillforge help <command>
  skillforge <command> --help
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

function parseOptionalPathFlag(parsed: ReturnType<typeof parseArgs>, name: string): string | boolean | undefined {
  const value = getFlag(parsed, name);
  if (typeof value === "undefined") {
    return undefined;
  }

  if (value === true) {
    return true;
  }

  return String(value);
}

function templateResourcesForSummary(template: TemplateMode, resources: string[]): string[] {
  return [...new Set([...TEMPLATE_MODES[template], ...resources])];
}
