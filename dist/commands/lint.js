"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runLint = runLint;
const path = require("node:path");
const skill_1 = require("../lib/skill");
async function runLint(targetDir) {
    const resolved = path.resolve(targetDir);
    const result = await (0, skill_1.lintSkill)(resolved);
    const errors = result.issues.filter((issue) => issue.level === "error");
    const warnings = result.issues.filter((issue) => issue.level === "warning");
    console.log(`Linting ${resolved}`);
    if (result.issues.length === 0) {
        console.log(`  OK: skill structure looks valid (${result.fileCount} file(s) checked).`);
        return 0;
    }
    for (const issue of result.issues) {
        console.log(`  ${issue.level.toUpperCase()}: ${issue.message}`);
    }
    console.log(`Summary: ${errors.length} error(s), ${warnings.length} warning(s), ${result.fileCount} file(s) checked.`);
    if (errors.length > 0) {
        console.log("Next: fix the errors above before running pack.");
    }
    else if (warnings.length > 0) {
        console.log("Next: review the warnings above. Pack will still work.");
    }
    return errors.length === 0 ? 0 : 1;
}
