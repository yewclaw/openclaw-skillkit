"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPack = runPack;
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = require("node:fs/promises");
const zip_1 = require("../lib/zip");
const fs_1 = require("../lib/fs");
const skill_1 = require("../lib/skill");
async function runPack(targetDir, options) {
    const resolvedDir = node_path_1.default.resolve(targetDir);
    const lintResult = await (0, skill_1.lintSkill)(resolvedDir);
    const errors = lintResult.issues.filter((issue) => issue.level === "error");
    const warnings = lintResult.issues.filter((issue) => issue.level === "warning");
    if (errors.length > 0) {
        throw new Error(`Cannot pack ${resolvedDir} because lint found ${errors.length} error(s).`);
    }
    const { destination, normalizedOutputPath } = resolveDestination(resolvedDir, options.outputPath);
    if (await (0, fs_1.exists)(destination)) {
        throw new Error(`Output already exists: ${destination}`);
    }
    await (0, fs_1.ensureDir)(node_path_1.default.dirname(destination));
    if (options.format === "text") {
        console.log(`Packing ${resolvedDir}`);
    }
    if (warnings.length > 0 && options.format === "text") {
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
    if (normalizedOutputPath && options.format === "text") {
        console.log(`Output path did not end in .skill. Using ${destination}`);
    }
    if (options.format === "json") {
        console.log(JSON.stringify({
            archivePath: destination,
            normalizedOutputPath,
            archiveSizeBytes: archiveStat.size,
            archiveSizeLabel: formatBytes(archiveStat.size),
            warnings: warnings.map((warning) => ({
                code: warning.code,
                file: warning.file,
                message: warning.message,
                suggestion: warning.suggestion
            })),
            manifest: archive.manifest
        }, null, 2));
        return;
    }
    printArchiveSummary(destination, archiveStat.size, archive.manifest);
}
function resolveDestination(resolvedDir, outputPath) {
    if (!outputPath) {
        return {
            destination: node_path_1.default.resolve(`${resolvedDir}.skill`),
            normalizedOutputPath: false
        };
    }
    const resolvedOutput = node_path_1.default.resolve(outputPath);
    const extension = node_path_1.default.extname(resolvedOutput);
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
function printArchiveSummary(destination, archiveSize, manifest) {
    console.log(`Archive ready: ${destination}`);
    console.log(`  Skill: ${manifest.skill.name}@${manifest.skill.version} (${manifest.entryCount} bundled file(s) plus manifest, ${formatBytes(archiveSize)}).`);
    console.log(`  Contents: ${manifest.entries.map((entry) => entry.path).join(", ")}`);
    console.log(`  Inspect: openclaw-skillkit inspect ${destination}`);
}
