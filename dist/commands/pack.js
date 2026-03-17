"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPack = runPack;
const path = require("node:path");
const promises_1 = require("node:fs/promises");
const zip_1 = require("../lib/zip");
const fs_1 = require("../lib/fs");
const skill_1 = require("../lib/skill");
async function runPack(targetDir, outputPath) {
    const resolvedDir = path.resolve(targetDir);
    const lintResult = await (0, skill_1.lintSkill)(resolvedDir);
    const errors = lintResult.issues.filter((issue) => issue.level === "error");
    const warnings = lintResult.issues.filter((issue) => issue.level === "warning");
    if (errors.length > 0) {
        throw new Error(`Cannot pack ${resolvedDir} because lint found ${errors.length} error(s).`);
    }
    const { destination, normalizedOutputPath } = resolveDestination(resolvedDir, outputPath);
    if (await (0, fs_1.exists)(destination)) {
        throw new Error(`Output already exists: ${destination}`);
    }
    await (0, fs_1.ensureDir)(path.dirname(destination));
    console.log(`Packing ${resolvedDir}`);
    if (warnings.length > 0) {
        console.log(`Packing with ${warnings.length} warning(s):`);
        for (const warning of warnings) {
            console.log(`  WARNING [${warning.file}]: ${warning.message}`);
            if (warning.suggestion) {
                console.log(`    Fix: ${warning.suggestion}`);
            }
        }
        console.log("Proceeding anyway because warnings do not block packaging.");
    }
    const archive = await (0, zip_1.createSkillArchive)(resolvedDir, destination);
    const archiveStat = await (0, promises_1.stat)(destination);
    if (normalizedOutputPath) {
        console.log(`Output path did not end in .skill. Using ${destination}`);
    }
    console.log(`Archive ready: ${destination}`);
    console.log(`  Included ${archive.packagedEntries.length} bundled file(s) plus manifest, ${formatBytes(archiveStat.size)}.`);
}
function resolveDestination(resolvedDir, outputPath) {
    if (!outputPath) {
        return {
            destination: path.resolve(`${resolvedDir}.skill`),
            normalizedOutputPath: false
        };
    }
    const resolvedOutput = path.resolve(outputPath);
    const extension = path.extname(resolvedOutput);
    if (!extension) {
        return {
            destination: `${resolvedOutput}.skill`,
            normalizedOutputPath: true
        };
    }
    if (extension !== ".skill") {
        throw new Error(`Output must end with ".skill". Received "${outputPath}".`);
    }
    return {
        destination: resolvedOutput,
        normalizedOutputPath: false
    };
}
function formatBytes(size) {
    if (size < 1024) {
        return `${size} B`;
    }
    return `${(size / 1024).toFixed(1)} KB`;
}
