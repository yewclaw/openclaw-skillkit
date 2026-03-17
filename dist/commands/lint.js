"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runLint = runLint;
const node_path_1 = __importDefault(require("node:path"));
const skill_1 = require("../lib/skill");
const workflow_1 = require("../lib/workflow");
async function runLint(targetDir, options) {
    const resolved = node_path_1.default.resolve(targetDir);
    const result = await (0, skill_1.lintSkill)(resolved);
    const summary = (0, workflow_1.summarizeLintResult)(result);
    const actionPlan = (0, workflow_1.buildActionPlan)(result, resolved);
    if (options.format === "json") {
        console.log(JSON.stringify({
            skillDir: result.skillDir,
            fileCount: result.fileCount,
            summary,
            focusAreas: (0, workflow_1.summarizeFocusAreas)(result),
            nextSteps: actionPlan,
            issues: result.issues
        }, null, 2));
        return summary.errors === 0 ? 0 : 1;
    }
    console.log(`Linting ${resolved}`);
    if (summary.total === 0) {
        console.log(`  OK: skill structure looks valid (${result.fileCount} file(s) checked).`);
        console.log(`  Ready: openclaw-skillkit pack ${resolved}`);
        console.log(`  Inspect after packing: openclaw-skillkit inspect ${resolved}.skill`);
        return 0;
    }
    for (const issue of result.issues) {
        console.log(`  ${issue.level.toUpperCase()} [${issue.code}] ${issue.file}: ${issue.message}`);
        if (issue.suggestion) {
            console.log(`    Fix: ${issue.suggestion}`);
        }
    }
    console.log(`Summary: ${summary.errors} error(s), ${summary.warnings} warning(s), ${result.fileCount} file(s) checked.`);
    if (actionPlan.length > 0) {
        console.log("Action plan:");
        for (const [index, step] of actionPlan.entries()) {
            console.log(`  ${index + 1}. ${step}`);
        }
    }
    return summary.errors === 0 ? 0 : 1;
}
