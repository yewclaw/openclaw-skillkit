#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const path = require("node:path");
const args_1 = require("./lib/args");
const init_1 = require("./commands/init");
const lint_1 = require("./commands/lint");
const pack_1 = require("./commands/pack");
const templates_1 = require("./lib/templates");
async function main(argv = process.argv.slice(2)) {
    const parsed = (0, args_1.parseArgs)(argv);
    const wantsHelp = parsed.command === "help" || (0, args_1.getFlag)(parsed, "help") === true;
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
async function handleInit(parsed) {
    assertNoUnexpectedFlags(parsed, ["name", "description", "template", "resources", "force"]);
    assertArgumentCount(parsed, 1, "init expects exactly 1 target directory.");
    const targetDir = parsed.positionals[0];
    if (!targetDir) {
        throw new Error('init requires a target directory. Run "openclaw-skillkit help init" for examples.');
    }
    const resourcesValue = (0, args_1.getFlag)(parsed, "resources");
    const resources = typeof resourcesValue === "string"
        ? resourcesValue
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : [];
    const template = parseTemplateMode((0, args_1.getFlag)(parsed, "template"));
    await (0, init_1.runInit)({
        targetDir,
        name: typeof (0, args_1.getFlag)(parsed, "name") === "string" ? String((0, args_1.getFlag)(parsed, "name")) : undefined,
        description: typeof (0, args_1.getFlag)(parsed, "description") === "string" ? String((0, args_1.getFlag)(parsed, "description")) : undefined,
        template,
        resources,
        force: (0, args_1.getFlag)(parsed, "force") === true
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
    console.log(`Then: openclaw-skillkit lint ${resolvedTargetDir}`);
    console.log(`Ship: openclaw-skillkit pack ${resolvedTargetDir}`);
}
async function handleLint(parsed) {
    assertNoUnexpectedFlags(parsed, ["format", "json"]);
    assertArgumentCount(parsed, 1, "lint accepts at most 1 target directory.");
    const targetDir = parsed.positionals[0] ?? ".";
    const format = parseLintFormat(parsed);
    const exitCode = await (0, lint_1.runLint)(targetDir, { format });
    process.exitCode = exitCode;
}
async function handlePack(parsed) {
    assertNoUnexpectedFlags(parsed, ["output"]);
    assertArgumentCount(parsed, 1, "pack expects exactly 1 target directory.");
    const targetDir = parsed.positionals[0] ?? ".";
    const output = typeof (0, args_1.getFlag)(parsed, "output") === "string" ? String((0, args_1.getFlag)(parsed, "output")) : undefined;
    await (0, pack_1.runPack)(targetDir, output);
}
function assertNoUnexpectedFlags(parsed, allowed) {
    const unexpected = [...parsed.flags.keys()].filter((flag) => flag !== "help" && !allowed.includes(flag));
    if (unexpected.length > 0) {
        const allowedFlags = allowed.length > 0 ? allowed.map((flag) => `--${flag}`).join(", ") : "no flags";
        throw new Error(`Unknown flag(s): ${unexpected.map((flag) => `--${flag}`).join(", ")}. This command supports ${allowedFlags} and --help.`);
    }
}
function assertArgumentCount(parsed, max, message) {
    if (parsed.positionals.length > max) {
        throw new Error(message);
    }
}
function printHelp(command = "overview") {
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
  openclaw-skillkit pack [dir] [--output ./dist/my-skill.skill]

Examples:
  openclaw-skillkit pack
  openclaw-skillkit pack skills/customer-support
  openclaw-skillkit pack skills/customer-support --output ./artifacts/customer-support
  openclaw-skillkit pack skills/customer-support --output ./artifacts/customer-support.skill
`);
        return;
    }
    console.log(`openclaw-skillkit

Build, lint, and pack OpenClaw skills.

Usage:
  openclaw-skillkit init <dir> [--name my-skill] [--description "Skill summary"] [--template minimal|references|scripts|full] [--resources references,scripts,assets] [--force]
  openclaw-skillkit lint [dir] [--json|--format text|json]
  openclaw-skillkit pack [dir] [--output ./dist/my-skill.skill]

Help:
  openclaw-skillkit help
  openclaw-skillkit help <command>
  openclaw-skillkit <command> --help
`);
}
if (require.main === module) {
    main().catch((error) => {
        console.error(`Error: ${error.message}`);
        process.exitCode = 1;
    });
}
function parseTemplateMode(value) {
    if (value === undefined) {
        return "minimal";
    }
    if (typeof value !== "string") {
        throw new Error(`--template expects one of: ${Object.keys(templates_1.TEMPLATE_MODES).join(", ")}`);
    }
    if (value in templates_1.TEMPLATE_MODES) {
        return value;
    }
    throw new Error(`Unknown template mode "${value}". Use one of: ${Object.keys(templates_1.TEMPLATE_MODES).join(", ")}.`);
}
function parseLintFormat(parsed) {
    const jsonFlag = (0, args_1.getFlag)(parsed, "json");
    const formatFlag = (0, args_1.getFlag)(parsed, "format");
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
        throw new Error('`--format` expects "text" or "json".');
    }
    if (formatFlag === "text" || formatFlag === "json") {
        return formatFlag;
    }
    throw new Error(`Unknown lint format "${formatFlag}". Use "text" or "json".`);
}
function templateResourcesForSummary(template, resources) {
    return [...new Set([...templates_1.TEMPLATE_MODES[template], ...resources])];
}
