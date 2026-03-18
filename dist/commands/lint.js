"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runLint = runLint;
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = require("node:fs/promises");
const frontmatter_1 = require("../lib/frontmatter");
const fs_1 = require("../lib/fs");
const skill_1 = require("../lib/skill");
const workflow_1 = require("../lib/workflow");
async function runLint(targetDir, options) {
    const resolved = node_path_1.default.resolve(targetDir);
    if (options.all) {
        return runBatchLint(resolved, options);
    }
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
    console.log(`Status: ${formatLintStatus(summary)}`);
    console.log(`Summary: ${summary.errors} error(s), ${summary.warnings} warning(s), ${result.fileCount} file(s) checked.`);
    if (summary.total === 0) {
        console.log("  Confidence: no blocking issues or warnings were found.");
        console.log("Next:");
        console.log(`  1. Pack when ready: skillforge pack ${resolved}`);
        console.log(`  2. Run a full review before handoff: skillforge review ${resolved}`);
        return 0;
    }
    const focusAreas = (0, workflow_1.summarizeFocusAreas)(result);
    if (focusAreas.length > 0) {
        console.log("Focus areas:");
        for (const area of focusAreas) {
            console.log(`  ${area.label}: ${area.errors} error(s), ${area.warnings} warning(s)`);
        }
    }
    for (const issue of result.issues) {
        console.log(`  ${issue.level.toUpperCase()} [${issue.code}] ${issue.file}: ${issue.message}`);
        if (issue.suggestion) {
            console.log(`    Fix: ${issue.suggestion}`);
        }
    }
    if (actionPlan.length > 0) {
        console.log("Next:");
        for (const [index, step] of actionPlan.entries()) {
            console.log(`  ${index + 1}. ${step}`);
        }
    }
    return summary.errors === 0 ? 0 : 1;
}
async function runBatchLint(rootDir, options) {
    const skillDirs = await discoverSkillDirs(rootDir);
    if (skillDirs.length === 0) {
        if (options.format === "json") {
            console.log(JSON.stringify({
                rootDir,
                summary: {
                    total: 1,
                    errors: 1,
                    warnings: 0,
                    ready: 0,
                    packableWithWarnings: 0,
                    blocked: 0
                },
                skills: [],
                issues: [
                    {
                        level: "error",
                        code: "no-skills-found",
                        file: ".",
                        message: "No skills were found under the target directory.",
                        suggestion: 'Run "skillforge init <dir>" to scaffold a skill, or point lint at the repo containing skills.'
                    }
                ]
            }, null, 2));
            return 1;
        }
        console.log(`Linting all skills under ${rootDir}`);
        console.log("Status: BLOCKED");
        console.log("Summary: no skill directories were found.");
        console.log("Next:");
        console.log("  1. Add at least one skill directory containing SKILL.md.");
        console.log(`  2. Re-run: skillforge lint ${rootDir} --all`);
        return 1;
    }
    const baseResults = await Promise.all(skillDirs.map(async (skillDir) => {
        const lint = await (0, skill_1.lintSkill)(skillDir);
        return {
            skillDir,
            relativeDir: node_path_1.default.relative(rootDir, skillDir) || ".",
            summary: (0, workflow_1.summarizeLintResult)(lint),
            focusAreas: (0, workflow_1.summarizeFocusAreas)(lint),
            nextSteps: (0, workflow_1.buildActionPlan)(lint, skillDir),
            issues: lint.issues.map((issue) => ({
                level: issue.level,
                code: issue.code,
                file: issue.file,
                message: issue.message,
                suggestion: issue.suggestion
            })),
            name: await readFrontmatterName(skillDir)
        };
    }));
    const duplicateMap = collectDuplicateNames(baseResults);
    const results = baseResults.map((result) => {
        const duplicateSkills = result.name ? duplicateMap.get(result.name) : undefined;
        const duplicateIssue = duplicateSkills && duplicateSkills.length > 1
            ? {
                level: "error",
                code: "duplicate-skill-name",
                file: "SKILL.md",
                message: `Frontmatter name "${result.name}" is duplicated across ${duplicateSkills.length} skills.`,
                suggestion: `Use unique frontmatter names. Conflicts: ${duplicateSkills
                    .map((skillPath) => node_path_1.default.relative(rootDir, skillPath) || ".")
                    .sort()
                    .join(", ")}`
            }
            : undefined;
        const issues = duplicateIssue ? [...result.issues, duplicateIssue] : result.issues;
        const errors = issues.filter((issue) => issue.level === "error").length;
        const warnings = issues.filter((issue) => issue.level === "warning").length;
        return {
            skillDir: result.skillDir,
            relativeDir: result.relativeDir,
            summary: {
                total: issues.length,
                errors,
                warnings
            },
            status: errors > 0 ? "blocked" : warnings > 0 ? "packable-with-warnings" : "ready",
            focusAreas: result.focusAreas,
            nextSteps: result.nextSteps,
            issues
        };
    });
    const batchResult = summarizeBatchResults(rootDir, results);
    const reportPath = await writeBatchLintReport(batchResult, options.reportPath);
    const reportMarkdown = buildBatchLintReport(batchResult);
    if (options.format === "json") {
        console.log(JSON.stringify({
            rootDir: batchResult.rootDir,
            skillCount: batchResult.skillCount,
            summary: batchResult.summary,
            reportPath,
            reportMarkdown,
            skills: batchResult.skills
        }, null, 2));
        return batchResult.summary.errors > 0 ? 1 : 0;
    }
    console.log(`Linting all skills under ${batchResult.rootDir}`);
    console.log(`Discovered: ${batchResult.skillCount} skill(s)`);
    console.log(`Status: ${formatBatchStatus(batchResult.summary)}`);
    console.log(`Summary: ${batchResult.summary.errors} error(s), ${batchResult.summary.warnings} warning(s) across ${batchResult.skillCount} skill(s).`);
    for (const skill of batchResult.skills) {
        console.log(`  ${formatSkillStatus(skill.status)} ${skill.relativeDir}: ${skill.summary.errors} error(s), ${skill.summary.warnings} warning(s)`);
        for (const issue of skill.issues) {
            console.log(`    ${issue.level.toUpperCase()} [${issue.code}] ${issue.file}: ${issue.message}`);
            if (issue.suggestion) {
                console.log(`      Fix: ${issue.suggestion}`);
            }
        }
    }
    console.log("Rollup:");
    console.log(`  Ready: ${batchResult.summary.ready}`);
    console.log(`  Packable with warnings: ${batchResult.summary.packableWithWarnings}`);
    console.log(`  Blocked: ${batchResult.summary.blocked}`);
    if (reportPath) {
        console.log(`Report: ${reportPath}`);
    }
    return batchResult.summary.errors > 0 ? 1 : 0;
}
function summarizeBatchResults(rootDir, skills) {
    const summary = {
        total: 0,
        errors: 0,
        warnings: 0,
        ready: 0,
        packableWithWarnings: 0,
        blocked: 0
    };
    for (const skill of skills) {
        summary.total += skill.summary.total;
        summary.errors += skill.summary.errors;
        summary.warnings += skill.summary.warnings;
        if (skill.status === "ready") {
            summary.ready += 1;
        }
        else if (skill.status === "packable-with-warnings") {
            summary.packableWithWarnings += 1;
        }
        else {
            summary.blocked += 1;
        }
    }
    return {
        rootDir,
        skillCount: skills.length,
        summary,
        skills: skills.sort((left, right) => left.relativeDir.localeCompare(right.relativeDir))
    };
}
function buildBatchLintReport(result) {
    const lines = [];
    lines.push("# SkillForge Batch Lint Report");
    lines.push("");
    lines.push(`- Root: \`${result.rootDir}\``);
    lines.push(`- Skills: ${result.skillCount}`);
    lines.push(`- Errors: ${result.summary.errors}`);
    lines.push(`- Warnings: ${result.summary.warnings}`);
    lines.push(`- Ready: ${result.summary.ready}`);
    lines.push(`- Packable with warnings: ${result.summary.packableWithWarnings}`);
    lines.push(`- Blocked: ${result.summary.blocked}`);
    lines.push("");
    lines.push("## Skills");
    lines.push("");
    for (const skill of result.skills) {
        lines.push(`### ${skill.relativeDir}`);
        lines.push("");
        lines.push(`- Status: ${skill.status}`);
        lines.push(`- Errors: ${skill.summary.errors}`);
        lines.push(`- Warnings: ${skill.summary.warnings}`);
        if (skill.issues.length > 0) {
            lines.push("- Issues:");
            for (const issue of skill.issues) {
                lines.push(`  - ${issue.level.toUpperCase()} [${issue.code}] ${issue.file}: ${issue.message}`);
            }
        }
        lines.push("");
    }
    return lines.join("\n");
}
async function writeBatchLintReport(result, reportPath) {
    if (typeof reportPath === "undefined") {
        return undefined;
    }
    const destination = reportPath === true
        ? node_path_1.default.join(result.rootDir, ".skillforge", "lint-all.report.md")
        : typeof reportPath === "string"
            ? node_path_1.default.resolve(reportPath)
            : undefined;
    if (!destination) {
        return undefined;
    }
    await (0, fs_1.writeTextFile)(destination, buildBatchLintReport(result));
    return destination;
}
function collectDuplicateNames(results) {
    const grouped = new Map();
    for (const result of results) {
        if (!result.name) {
            continue;
        }
        const current = grouped.get(result.name) ?? [];
        current.push(result.skillDir);
        grouped.set(result.name, current);
    }
    return new Map([...grouped.entries()].filter(([, skills]) => skills.length > 1));
}
async function readFrontmatterName(skillDir) {
    try {
        const markdown = await (0, fs_1.readTextFile)(node_path_1.default.join(skillDir, "SKILL.md"));
        const parsed = (0, frontmatter_1.parseFrontmatter)(markdown);
        if (!parsed.hasFrontmatter || !parsed.attributes.name) {
            return undefined;
        }
        return parsed.attributes.name;
    }
    catch {
        return undefined;
    }
}
async function discoverSkillDirs(rootDir) {
    const results = [];
    const ignored = new Set([".git", "node_modules", "dist", ".skillforge"]);
    async function walk(currentDir) {
        const entries = await (0, promises_1.readdir)(currentDir, { withFileTypes: true });
        const hasSkillFile = entries.some((entry) => entry.isFile() && entry.name === "SKILL.md");
        if (hasSkillFile) {
            results.push(currentDir);
        }
        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }
            if (ignored.has(entry.name)) {
                continue;
            }
            await walk(node_path_1.default.join(currentDir, entry.name));
        }
    }
    await walk(rootDir);
    return results.sort((left, right) => left.localeCompare(right));
}
function formatBatchStatus(summary) {
    if (summary.errors > 0) {
        return "BLOCKED";
    }
    if (summary.warnings > 0) {
        return "PACKABLE WITH WARNINGS";
    }
    return "READY TO PACKAGE";
}
function formatSkillStatus(status) {
    if (status === "ready") {
        return "READY";
    }
    if (status === "packable-with-warnings") {
        return "WARN";
    }
    return "BLOCKED";
}
function formatLintStatus(summary) {
    if (summary.errors > 0) {
        return "BLOCKED";
    }
    if (summary.warnings > 0) {
        return "PACKABLE WITH WARNINGS";
    }
    return "READY TO PACKAGE";
}
