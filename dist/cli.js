#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.main = main;
const args_1 = require("./lib/args");
const init_1 = require("./commands/init");
const lint_1 = require("./commands/lint");
const pack_1 = require("./commands/pack");
const inspect_1 = require("./commands/inspect");
const review_1 = require("./commands/review");
const serve_1 = require("./commands/serve");
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
        case "inspect":
            await handleInspect(parsed);
            return;
        case "review":
            await handleReview(parsed);
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
    const result = await (0, init_1.runInit)({
        targetDir,
        name: typeof (0, args_1.getFlag)(parsed, "name") === "string" ? String((0, args_1.getFlag)(parsed, "name")) : undefined,
        description: typeof (0, args_1.getFlag)(parsed, "description") === "string"
            ? String((0, args_1.getFlag)(parsed, "description"))
            : undefined,
        template,
        resources,
        force: (0, args_1.getFlag)(parsed, "force") === true
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
    console.log(`  2. Validate: openclaw-skillkit lint ${result.skillDir}`);
    console.log(`  3. Package when clean: openclaw-skillkit pack ${result.skillDir}`);
}
async function handleLint(parsed) {
    assertNoUnexpectedFlags(parsed, ["format", "json", "all", "report"]);
    assertArgumentCount(parsed, 1, "lint accepts at most 1 target directory.");
    const targetDir = parsed.positionals[0] ?? ".";
    const format = parseMachineFormat(parsed, "lint");
    const exitCode = await (0, lint_1.runLint)(targetDir, {
        format,
        all: (0, args_1.getFlag)(parsed, "all") === true,
        reportPath: parseOptionalPathFlag(parsed, "report")
    });
    process.exitCode = exitCode;
}
async function handlePack(parsed) {
    assertNoUnexpectedFlags(parsed, ["output", "format", "json", "report"]);
    assertArgumentCount(parsed, 1, "pack expects exactly 1 target directory.");
    const targetDir = parsed.positionals[0] ?? ".";
    await (0, pack_1.runPack)(targetDir, {
        outputPath: typeof (0, args_1.getFlag)(parsed, "output") === "string" ? String((0, args_1.getFlag)(parsed, "output")) : undefined,
        format: parseMachineFormat(parsed, "pack"),
        reportPath: parseOptionalPathFlag(parsed, "report")
    });
}
async function handleInspect(parsed) {
    assertNoUnexpectedFlags(parsed, ["format", "json", "source", "against", "report", "entry"]);
    assertArgumentCount(parsed, 1, "inspect expects exactly 1 archive path.");
    const archivePath = parsed.positionals[0];
    if (!archivePath) {
        throw new Error('inspect requires a .skill archive path. Run "openclaw-skillkit help inspect" for examples.');
    }
    await (0, inspect_1.runInspect)(archivePath, {
        format: parseMachineFormat(parsed, "inspect"),
        sourceDir: typeof (0, args_1.getFlag)(parsed, "source") === "string" ? String((0, args_1.getFlag)(parsed, "source")) : undefined,
        baselineArchivePath: typeof (0, args_1.getFlag)(parsed, "against") === "string" ? String((0, args_1.getFlag)(parsed, "against")) : undefined,
        reportPath: parseOptionalPathFlag(parsed, "report"),
        entryPath: typeof (0, args_1.getFlag)(parsed, "entry") === "string" ? String((0, args_1.getFlag)(parsed, "entry")) : undefined
    });
}
async function handleReview(parsed) {
    assertNoUnexpectedFlags(parsed, ["output", "format", "json", "report", "against"]);
    assertArgumentCount(parsed, 1, "review accepts at most 1 target directory.");
    const targetDir = parsed.positionals[0] ?? ".";
    const exitCode = await (0, review_1.runReview)(targetDir, {
        outputPath: typeof (0, args_1.getFlag)(parsed, "output") === "string" ? String((0, args_1.getFlag)(parsed, "output")) : undefined,
        format: parseMachineFormat(parsed, "review"),
        reportPath: parseOptionalPathFlag(parsed, "report"),
        baselineArchivePath: typeof (0, args_1.getFlag)(parsed, "against") === "string" ? String((0, args_1.getFlag)(parsed, "against")) : undefined
    });
    process.exitCode = exitCode;
}
async function handleServe(parsed) {
    assertNoUnexpectedFlags(parsed, ["host", "port"]);
    assertArgumentCount(parsed, 0, "serve does not accept positional arguments.");
    const portValue = (0, args_1.getFlag)(parsed, "port");
    const port = typeof portValue === "string" && /^\d+$/.test(portValue)
        ? Number(portValue)
        : typeof portValue === "undefined"
            ? 3210
            : Number.NaN;
    if (!Number.isInteger(port) || port < 0 || port > 65535) {
        throw new Error('serve expects --port to be an integer between 0 and 65535.');
    }
    await (0, serve_1.runServe)({
        host: typeof (0, args_1.getFlag)(parsed, "host") === "string" ? String((0, args_1.getFlag)(parsed, "host")) : "127.0.0.1",
        port
    });
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
  openclaw-skillkit lint [dir] [--all] [--report [./reports/lint-all.report.md]] [--json|--format text|json]

Examples:
  openclaw-skillkit lint
  openclaw-skillkit lint --json
  openclaw-skillkit lint examples/weather-research-skill
  openclaw-skillkit lint skills --all
  openclaw-skillkit lint skills --all --report
`);
        return;
    }
    if (command === "pack") {
        console.log(`openclaw-skillkit pack

Create a .skill archive after lint passes.

  Usage:
  openclaw-skillkit pack [dir] [--output ./dist/my-skill.skill] [--report [./dist/my-skill.report.md]] [--json|--format text|json]

Examples:
  openclaw-skillkit pack
  openclaw-skillkit pack skills/customer-support
  openclaw-skillkit pack skills/customer-support --output ./artifacts/customer-support
  openclaw-skillkit pack skills/customer-support --output ./artifacts/customer-support.skill
  openclaw-skillkit pack skills/customer-support --report
`);
        return;
    }
    if (command === "inspect") {
        console.log(`openclaw-skillkit inspect

Inspect a packaged .skill archive and print the embedded manifest.

Usage:
  openclaw-skillkit inspect <archive.skill> [--source ./skill-dir] [--against ./previous.skill] [--entry SKILL.md] [--report [./artifacts/customer-support.report.md]] [--json|--format text|json]

Examples:
  openclaw-skillkit inspect ./artifacts/customer-support.skill
  openclaw-skillkit inspect ./artifacts/customer-support.skill --source ./skills/customer-support
  openclaw-skillkit inspect ./artifacts/customer-support.skill --against ./artifacts/customer-support-prev.skill
  openclaw-skillkit inspect ./artifacts/customer-support.skill --entry SKILL.md
  openclaw-skillkit inspect ./artifacts/customer-support.skill --source ./skills/customer-support --against ./artifacts/customer-support-prev.skill
  openclaw-skillkit inspect ./artifacts/customer-support.skill --source ./skills/customer-support --report
  openclaw-skillkit inspect ./artifacts/customer-support.skill --json
`);
        return;
    }
    if (command === "review") {
        console.log(`openclaw-skillkit review

Run a release-readiness review for a skill directory.

Usage:
  openclaw-skillkit review [dir] [--output ./dist/my-skill.skill] [--against ./dist/previous.skill] [--report [./dist/my-skill.review.md]] [--json|--format text|json]

Examples:
  openclaw-skillkit review
  openclaw-skillkit review skills/customer-support
  openclaw-skillkit review skills/customer-support --against ./artifacts/customer-support-prev.skill
  openclaw-skillkit review skills/customer-support --output ./artifacts/customer-support.skill --report
  openclaw-skillkit review skills/customer-support --json
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
  openclaw-skillkit lint [dir] [--all] [--report [./reports/lint-all.report.md]] [--json|--format text|json]
  openclaw-skillkit pack [dir] [--output ./dist/my-skill.skill] [--report [./dist/my-skill.report.md]] [--json|--format text|json]
  openclaw-skillkit inspect <archive.skill> [--source ./skill-dir] [--against ./previous.skill] [--entry SKILL.md] [--report [./dist/my-skill.report.md]] [--json|--format text|json]
  openclaw-skillkit review [dir] [--output ./dist/my-skill.skill] [--against ./dist/previous.skill] [--report [./dist/my-skill.review.md]] [--json|--format text|json]
  openclaw-skillkit serve [--host 127.0.0.1] [--port 3210]

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
function parseMachineFormat(parsed, commandName) {
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
        throw new Error(`\`--format\` for ${commandName} expects "text" or "json".`);
    }
    if (formatFlag === "text" || formatFlag === "json") {
        return formatFlag;
    }
    throw new Error(`Unknown ${commandName} format "${formatFlag}". Use "text" or "json".`);
}
function parseOptionalPathFlag(parsed, name) {
    const value = (0, args_1.getFlag)(parsed, name);
    if (typeof value === "undefined") {
        return undefined;
    }
    if (value === true) {
        return true;
    }
    return String(value);
}
function templateResourcesForSummary(template, resources) {
    return [...new Set([...templates_1.TEMPLATE_MODES[template], ...resources])];
}
