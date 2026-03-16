#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const args_1 = require("./lib/args");
const init_1 = require("./commands/init");
const lint_1 = require("./commands/lint");
const pack_1 = require("./commands/pack");
async function main() {
    const parsed = (0, args_1.parseArgs)(process.argv.slice(2));
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
async function handleInit(parsed) {
    const targetDir = parsed.positionals[0];
    if (!targetDir) {
        throw new Error("init requires a target directory.");
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
    const targetDir = parsed.positionals[0] ?? ".";
    const exitCode = await (0, lint_1.runLint)(targetDir);
    process.exitCode = exitCode;
}
async function handlePack(parsed) {
    const targetDir = parsed.positionals[0];
    if (!targetDir) {
        throw new Error("pack requires a target directory.");
    }
    const outputFlag = (0, args_1.getFlag)(parsed, "output");
    const output = typeof outputFlag === "string" ? String(outputFlag) : undefined;
    await (0, pack_1.runPack)(targetDir, output);
}
function printHelp() {
    console.log(`openclaw-skillkit

Usage:
  openclaw-skillkit init <dir> [--name my-skill] [--description "Skill summary"] [--resources references,scripts,assets] [--force]
  openclaw-skillkit lint [dir]
  openclaw-skillkit pack <dir> [--output ./dist/my-skill.skill]
`);
}
main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
});
