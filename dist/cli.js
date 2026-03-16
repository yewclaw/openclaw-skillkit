#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const args_1 = require("./lib/args");
const init_1 = require("./commands/init");
const lint_1 = require("./commands/lint");
const pack_1 = require("./commands/pack");
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
    assertNoUnexpectedFlags(parsed, ["name", "description", "resources", "force"]);
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
    const nameFlag = (0, args_1.getFlag)(parsed, "name");
    const descriptionFlag = (0, args_1.getFlag)(parsed, "description");
    await (0, init_1.runInit)({
        targetDir,
        name: typeof nameFlag === "string" ? String(nameFlag) : undefined,
        description: typeof descriptionFlag === "string" ? String(descriptionFlag) : undefined,
        resources,
        force: (0, args_1.getFlag)(parsed, "force") === true
    });
    console.log(`Initialized skill at ${targetDir}`);
}
async function handleLint(parsed) {
    assertNoUnexpectedFlags(parsed, []);
    assertArgumentCount(parsed, 1, "lint accepts at most 1 target directory.");
    const targetDir = parsed.positionals[0] ?? ".";
    const exitCode = await (0, lint_1.runLint)(targetDir);
    process.exitCode = exitCode;
}
async function handlePack(parsed) {
    assertNoUnexpectedFlags(parsed, ["output"]);
    assertArgumentCount(parsed, 1, "pack expects exactly 1 target directory.");
    const targetDir = parsed.positionals[0];
    if (!targetDir) {
        throw new Error('pack requires a target directory. Run "openclaw-skillkit help pack" for examples.');
    }
    const outputFlag = (0, args_1.getFlag)(parsed, "output");
    const output = typeof outputFlag === "string" ? String(outputFlag) : undefined;
    await (0, pack_1.runPack)(targetDir, output);
}
function assertNoUnexpectedFlags(parsed, allowed) {
    const unexpected = [...parsed.flags.keys()].filter((flag) => flag !== "help" && !allowed.includes(flag));
    if (unexpected.length > 0) {
        throw new Error(`Unknown flag(s): ${unexpected.map((flag) => `--${flag}`).join(", ")}.`);
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
        console.error(`Error: ${error.message}`);
        process.exitCode = 1;
    });
}
