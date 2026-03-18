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
            throw new Error(`Unknown command "${parsed.command}". Run "skillforge help" for usage.`);
    }
}
async function handleInit(parsed) {
    assertNoUnexpectedFlags(parsed, ["name", "description", "template", "resources", "force"]);
    assertArgumentCount(parsed, 1, "init expects exactly 1 target directory.");
    const targetDir = parsed.positionals[0];
    if (!targetDir) {
        throw new Error('init requires a target directory. Run "skillforge help init" for examples.');
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
    console.log(`  2. Validate: skillforge lint ${result.skillDir}`);
    console.log(`  3. Package when clean: skillforge pack ${result.skillDir}`);
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
    assertNoUnexpectedFlags(parsed, ["output", "output-dir", "format", "json", "report", "all", "index"]);
    assertArgumentCount(parsed, 1, "pack expects exactly 1 target directory.");
    const targetDir = parsed.positionals[0] ?? ".";
    const batchMode = (0, args_1.getFlag)(parsed, "all") === true;
    if (batchMode && typeof (0, args_1.getFlag)(parsed, "output") === "string") {
        throw new Error('pack --all does not support --output. Use --output-dir to control where batch artifacts are written.');
    }
    await (0, pack_1.runPack)(targetDir, {
        outputPath: typeof (0, args_1.getFlag)(parsed, "output") === "string" ? String((0, args_1.getFlag)(parsed, "output")) : undefined,
        outputDir: typeof (0, args_1.getFlag)(parsed, "output-dir") === "string" ? String((0, args_1.getFlag)(parsed, "output-dir")) : undefined,
        format: parseMachineFormat(parsed, "pack"),
        all: batchMode,
        indexPath: parseOptionalPathFlag(parsed, "index"),
        reportPath: parseOptionalPathFlag(parsed, "report")
    });
}
async function handleInspect(parsed) {
    assertNoUnexpectedFlags(parsed, ["format", "json", "source", "against", "report", "entry", "all", "baseline-dir"]);
    assertArgumentCount(parsed, 1, "inspect expects exactly 1 archive path.");
    const archivePath = parsed.positionals[0];
    if (!archivePath) {
        throw new Error('inspect requires an archive path or archive directory. Run "skillforge help inspect" for examples.');
    }
    const batchMode = (0, args_1.getFlag)(parsed, "all") === true;
    if (batchMode && typeof (0, args_1.getFlag)(parsed, "source") === "string") {
        throw new Error('inspect --all does not support --source. Inspect individual archives when checking source drift.');
    }
    if (batchMode && typeof (0, args_1.getFlag)(parsed, "against") === "string") {
        throw new Error('inspect --all does not support --against. Use --baseline-dir to match each archive against a baseline archive directory.');
    }
    if (batchMode && typeof (0, args_1.getFlag)(parsed, "entry") === "string") {
        throw new Error('inspect --all does not support --entry. Inspect an individual archive when previewing bundled files.');
    }
    await (0, inspect_1.runInspect)(archivePath, {
        format: parseMachineFormat(parsed, "inspect"),
        all: batchMode,
        sourceDir: typeof (0, args_1.getFlag)(parsed, "source") === "string" ? String((0, args_1.getFlag)(parsed, "source")) : undefined,
        baselineArchivePath: typeof (0, args_1.getFlag)(parsed, "against") === "string" ? String((0, args_1.getFlag)(parsed, "against")) : undefined,
        baselineDir: typeof (0, args_1.getFlag)(parsed, "baseline-dir") === "string" ? String((0, args_1.getFlag)(parsed, "baseline-dir")) : undefined,
        reportPath: parseOptionalPathFlag(parsed, "report"),
        entryPath: typeof (0, args_1.getFlag)(parsed, "entry") === "string" ? String((0, args_1.getFlag)(parsed, "entry")) : undefined
    });
}
async function handleReview(parsed) {
    assertNoUnexpectedFlags(parsed, ["output", "output-dir", "format", "json", "report", "against", "all", "baseline-dir"]);
    assertArgumentCount(parsed, 1, "review accepts at most 1 target directory.");
    const targetDir = parsed.positionals[0] ?? ".";
    const batchMode = (0, args_1.getFlag)(parsed, "all") === true;
    if (batchMode && typeof (0, args_1.getFlag)(parsed, "output") === "string") {
        throw new Error('review --all does not support --output. Use --output-dir to control where batch artifacts are written.');
    }
    if (batchMode && typeof (0, args_1.getFlag)(parsed, "against") === "string") {
        throw new Error('review --all does not support --against. Use --baseline-dir to match each skill against a baseline archive directory.');
    }
    const exitCode = await (0, review_1.runReview)(targetDir, {
        outputPath: typeof (0, args_1.getFlag)(parsed, "output") === "string" ? String((0, args_1.getFlag)(parsed, "output")) : undefined,
        outputDir: typeof (0, args_1.getFlag)(parsed, "output-dir") === "string" ? String((0, args_1.getFlag)(parsed, "output-dir")) : undefined,
        format: parseMachineFormat(parsed, "review"),
        reportPath: parseOptionalPathFlag(parsed, "report"),
        baselineArchivePath: typeof (0, args_1.getFlag)(parsed, "against") === "string" ? String((0, args_1.getFlag)(parsed, "against")) : undefined,
        baselineDir: typeof (0, args_1.getFlag)(parsed, "baseline-dir") === "string" ? String((0, args_1.getFlag)(parsed, "baseline-dir")) : undefined,
        all: batchMode
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
  skillforge inspect <archive-dir> --all [--baseline-dir ./released-skills] [--report [./reports/inspect-all.report.md]] [--json|--format text|json]

Examples:
  skillforge inspect ./artifacts/customer-support.skill
  skillforge inspect ./artifacts/customer-support.skill --source ./skills/customer-support
  skillforge inspect ./artifacts/customer-support.skill --against ./artifacts/customer-support-prev.skill
  skillforge inspect ./artifacts/customer-support.skill --entry SKILL.md
  skillforge inspect ./artifacts/customer-support.skill --source ./skills/customer-support --against ./artifacts/customer-support-prev.skill
  skillforge inspect ./artifacts/customer-support.skill --source ./skills/customer-support --report
  skillforge inspect ./released-skills --all
  skillforge inspect ./released-skills --all --baseline-dir ./previous-releases --report
  skillforge inspect ./artifacts/customer-support.skill --json
`);
        return;
    }
    if (command === "review") {
        console.log(`skillforge review

Run a release-readiness review for a skill directory.

Usage:
  skillforge review [dir] [--output ./dist/my-skill.skill] [--against ./dist/previous.skill] [--report [./dist/my-skill.review.md]] [--json|--format text|json]
  skillforge review [dir] --all [--output-dir ./.skillforge/review-artifacts] [--baseline-dir ./released-skills] [--report [./reports/review-all.report.md]] [--json|--format text|json]

Examples:
  skillforge review
  skillforge review skills/customer-support
  skillforge review skills/customer-support --against ./artifacts/customer-support-prev.skill
  skillforge review skills/customer-support --output ./artifacts/customer-support.skill --report
  skillforge review skills --all
  skillforge review skills --all --output-dir ./artifacts/review
  skillforge review skills --all --baseline-dir ./released-skills --report
  skillforge review skills/customer-support --json
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
  skillforge inspect <archive-dir> --all [--baseline-dir ./released-skills] [--report [./reports/inspect-all.report.md]] [--json|--format text|json]
  skillforge review [dir] [--output ./dist/my-skill.skill] [--against ./dist/previous.skill] [--all] [--output-dir ./.skillforge/review-artifacts] [--baseline-dir ./released-skills] [--report [./dist/my-skill.review.md]] [--json|--format text|json]
  skillforge serve [--host 127.0.0.1] [--port 3210]

Help:
  skillforge help
  skillforge help <command>
  skillforge <command> --help
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
