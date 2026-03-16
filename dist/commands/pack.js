"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPack = runPack;
const path = require("node:path");
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
    const destination = outputPath
        ? path.resolve(outputPath)
        : path.resolve(`${resolvedDir}.skill`);
    if (await (0, fs_1.exists)(destination)) {
        throw new Error(`Output already exists: ${destination}`);
    }
    if (warnings.length > 0) {
        console.log(`Packing with ${warnings.length} warning(s):`);
        for (const warning of warnings) {
            console.log(`  WARNING: ${warning.message}`);
        }
        console.log("Proceeding anyway because warnings do not block packaging.");
    }
    const fileCount = await (0, zip_1.createSkillArchive)(resolvedDir, destination);
    console.log(`Packed ${fileCount} file(s) into ${destination}`);
}
