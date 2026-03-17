"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runReview = runReview;
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = require("node:fs/promises");
const frontmatter_1 = require("../lib/frontmatter");
const fs_1 = require("../lib/fs");
const workflow_1 = require("../lib/workflow");
function summarizeFocusAreas(review) {
    return review.lint.focusAreas;
}
async function runReview(targetDir, options) {
    const resolved = node_path_1.default.resolve(targetDir);
    if (options.all) {
        return runBatchReview(resolved, options);
    }
    const review = await (0, workflow_1.reviewSkill)(resolved, options.outputPath, options.baselineArchivePath);
    const reportPath = await (0, workflow_1.writeReviewReport)(review, options.reportPath);
    const summary = (0, workflow_1.summarizeReviewReadiness)(review);
    if (options.format === "json") {
        console.log(JSON.stringify({
            skillDir: review.skillDir,
            readiness: review.readiness,
            releaseSummary: summary,
            reportPath,
            reportMarkdown: (0, workflow_1.buildReviewReport)(review),
            lint: review.lint,
            archive: review.archive
        }, null, 2));
        return review.readiness === "not-ready" ? 1 : 0;
    }
    printSingleReview(review, summary, reportPath);
    return review.readiness === "not-ready" ? 1 : 0;
}
async function runBatchReview(rootDir, options) {
    const skillDirs = await discoverSkillDirs(rootDir);
    if (skillDirs.length === 0) {
        if (options.format === "json") {
            console.log(JSON.stringify({
                rootDir,
                summary: {
                    ready: 0,
                    readyWithWarnings: 0,
                    notReady: 1,
                    lintErrors: 1,
                    lintWarnings: 0,
                    archiveDrift: 0,
                    baselineCompared: 0,
                    releaseChanged: 0,
                    baselineMissing: 0
                },
                skills: [],
                issues: [
                    {
                        level: "error",
                        code: "no-skills-found",
                        file: ".",
                        message: "No skills were found under the target directory.",
                        suggestion: 'Run "openclaw-skillkit init <dir>" to scaffold a skill, or point review at the repo containing skills.'
                    }
                ]
            }, null, 2));
            return 1;
        }
        console.log(`Reviewing all skills under ${rootDir}`);
        console.log("Status: NOT READY");
        console.log("Summary: no skill directories were found.");
        console.log("Next:");
        console.log("  1. Add at least one skill directory containing SKILL.md.");
        console.log(`  2. Re-run: openclaw-skillkit review ${rootDir} --all`);
        return 1;
    }
    const artifactDir = options.outputDir
        ? node_path_1.default.resolve(options.outputDir)
        : node_path_1.default.join(rootDir, ".openclaw-skillkit", "review-artifacts", `${Date.now()}`);
    const skills = [];
    for (const skillDir of skillDirs) {
        const relativeDir = node_path_1.default.relative(rootDir, skillDir) || ".";
        const name = await readFrontmatterName(skillDir);
        const outputPath = resolveBatchOutputPath(artifactDir, relativeDir);
        const baselineLookup = await resolveBatchBaselineArchive(options.baselineDir, rootDir, relativeDir, name);
        const review = await (0, workflow_1.reviewSkill)(skillDir, outputPath, baselineLookup?.resolvedArchivePath);
        skills.push({
            skillDir,
            relativeDir,
            name,
            readiness: review.readiness,
            releaseSummary: (0, workflow_1.summarizeReviewReadiness)(review),
            lint: review.lint,
            archive: review.archive
                ? {
                    destination: review.archive.destination,
                    archiveSizeBytes: review.archive.archiveSizeBytes,
                    archiveSizeLabel: review.archive.archiveSizeLabel,
                    comparison: {
                        matches: review.archive.comparison.matches,
                        matchedEntries: review.archive.comparison.matchedEntries,
                        entryCount: review.archive.comparison.entryCount
                    },
                    releaseComparison: review.archive.releaseComparison
                        ? {
                            baselineArchivePath: review.archive.releaseComparison.baselineArchivePath,
                            matches: review.archive.releaseComparison.matches,
                            matchedEntries: review.archive.releaseComparison.matchedEntries,
                            baselineEntryCount: review.archive.releaseComparison.baselineEntryCount,
                            addedEntries: review.archive.releaseComparison.addedEntries,
                            removedEntries: review.archive.releaseComparison.removedEntries,
                            changedEntries: review.archive.releaseComparison.changedEntries.map((entry) => ({
                                path: entry.path
                            }))
                        }
                        : undefined
                }
                : undefined,
            baselineLookup
        });
    }
    const result = summarizeBatchReview(rootDir, artifactDir, options.baselineDir, skills);
    const reportPath = await writeBatchReviewReport(result, options.reportPath);
    const reportMarkdown = buildBatchReviewReport(result);
    if (options.format === "json") {
        console.log(JSON.stringify({
            rootDir: result.rootDir,
            artifactDir: result.artifactDir,
            baselineDir: result.baselineDir,
            skillCount: result.skillCount,
            summary: result.summary,
            reportPath,
            reportMarkdown,
            skills: result.skills
        }, null, 2));
        return result.summary.notReady > 0 ? 1 : 0;
    }
    console.log(`Reviewing all skills under ${result.rootDir}`);
    console.log(`Artifacts: ${result.artifactDir}`);
    console.log(`Discovered: ${result.skillCount} skill(s)`);
    console.log(`Status: ${formatBatchReadiness(result.summary)}`);
    console.log(`Summary: ${result.summary.notReady} not ready, ${result.summary.readyWithWarnings} ready with warnings, ${result.summary.ready} ready to ship.`);
    for (const skill of result.skills) {
        console.log(`  ${formatBatchSkillReadiness(skill.readiness)} ${skill.relativeDir}: ${skill.lint.summary.errors} error(s), ${skill.lint.summary.warnings} warning(s)`);
        if (skill.archive) {
            console.log(`    Archive: ${skill.archive.destination}`);
            console.log(`    Artifact check: ${skill.archive.comparison.matches ? "matches source" : "drift detected"} (${skill.archive.comparison.matchedEntries}/${skill.archive.comparison.entryCount} archive entries unchanged).`);
        }
        else {
            console.log("    Archive: not created because blocking lint errors remain.");
        }
        if (skill.baselineLookup?.requestedDir) {
            if (skill.baselineLookup.resolvedArchivePath) {
                console.log(`    Baseline archive: ${skill.baselineLookup.resolvedArchivePath}`);
            }
            else {
                console.log(`    Baseline archive: not found under ${skill.baselineLookup.requestedDir}`);
            }
        }
        if (skill.archive?.releaseComparison) {
            console.log(`    Release delta: ${skill.archive.releaseComparison.matches ? "matches baseline archive" : "release changed"} (${skill.archive.releaseComparison.matchedEntries}/${skill.archive.releaseComparison.baselineEntryCount} baseline entries unchanged).`);
        }
        for (const issue of skill.lint.issues) {
            console.log(`    ${issue.level.toUpperCase()} [${issue.code}] ${issue.file}: ${issue.message}`);
            if (issue.suggestion) {
                console.log(`      Fix: ${issue.suggestion}`);
            }
        }
    }
    console.log("Rollup:");
    console.log(`  Ready to ship: ${result.summary.ready}`);
    console.log(`  Ready with warnings: ${result.summary.readyWithWarnings}`);
    console.log(`  Not ready: ${result.summary.notReady}`);
    console.log(`  Artifact drift detected: ${result.summary.archiveDrift}`);
    if (result.baselineDir) {
        console.log(`  Baselines compared: ${result.summary.baselineCompared}`);
        console.log(`  Release changes detected: ${result.summary.releaseChanged}`);
        console.log(`  Baselines missing: ${result.summary.baselineMissing}`);
    }
    if (reportPath) {
        console.log(`Report: ${reportPath}`);
    }
    return result.summary.notReady > 0 ? 1 : 0;
}
function printSingleReview(review, summary, reportPath) {
    console.log(`Reviewing ${review.skillDir}`);
    console.log(`  Readiness: ${formatReadinessLabel(review.readiness)}`);
    console.log(`  Summary: ${summary.headline}`);
    console.log(`  Lint: ${review.lint.summary.errors} error(s), ${review.lint.summary.warnings} warning(s) across ${review.lint.fileCount} file(s).`);
    console.log(`  Confidence: ${summary.confidence}`);
    console.log(`  Release checks: ${summary.checks
        .map((check) => `${formatAssessment(check.status)} ${check.label.toLowerCase()} (${check.detail})`)
        .join("; ")}`);
    if (review.lint.focusAreas.length > 0) {
        console.log(`  Focus areas: ${review.lint.focusAreas
            .map((area) => `${area.label} (${area.errors} error(s), ${area.warnings} warning(s))`)
            .join(", ")}`);
    }
    if (review.archive) {
        console.log(`  Archive: ${review.archive.destination}`);
        console.log(`  Artifact check: ${review.archive.comparison.matches ? "matches source" : "drift detected"} (${review.archive.comparison.matchedEntries}/${review.archive.comparison.entryCount} archive entries unchanged).`);
        if (review.archive.releaseComparison) {
            console.log(`  Baseline archive: ${review.archive.releaseComparison.baselineArchivePath}`);
            console.log(`  Release delta: ${review.archive.releaseComparison.matches ? "matches baseline archive" : "release changed"} (${review.archive.releaseComparison.matchedEntries}/${review.archive.releaseComparison.baselineEntryCount} baseline entries unchanged).`);
        }
    }
    else {
        console.log("  Archive: not created because blocking lint errors remain.");
    }
    if (review.lint.issues.length > 0) {
        console.log("  Issues:");
        for (const issue of review.lint.issues) {
            console.log(`    ${issue.level.toUpperCase()} [${issue.code}] ${issue.file}: ${issue.message}`);
            if (issue.suggestion) {
                console.log(`      Fix: ${issue.suggestion}`);
            }
        }
    }
    if (review.lint.nextSteps.length > 0) {
        console.log("  Next:");
        review.lint.nextSteps.forEach((step, index) => console.log(`    ${index + 1}. ${step}`));
    }
    if (reportPath) {
        console.log(`  Report: ${reportPath}`);
    }
}
function summarizeBatchReview(rootDir, artifactDir, baselineDir, skills) {
    const summary = {
        ready: 0,
        readyWithWarnings: 0,
        notReady: 0,
        lintErrors: 0,
        lintWarnings: 0,
        archiveDrift: 0,
        baselineCompared: 0,
        releaseChanged: 0,
        baselineMissing: 0
    };
    for (const skill of skills) {
        if (skill.readiness === "ready") {
            summary.ready += 1;
        }
        else if (skill.readiness === "ready-with-warnings") {
            summary.readyWithWarnings += 1;
        }
        else {
            summary.notReady += 1;
        }
        summary.lintErrors += skill.lint.summary.errors;
        summary.lintWarnings += skill.lint.summary.warnings;
        if (skill.archive && !skill.archive.comparison.matches) {
            summary.archiveDrift += 1;
        }
        if (skill.archive?.releaseComparison) {
            summary.baselineCompared += 1;
            if (!skill.archive.releaseComparison.matches) {
                summary.releaseChanged += 1;
            }
        }
        else if (baselineDir && skill.baselineLookup && !skill.baselineLookup.resolvedArchivePath) {
            summary.baselineMissing += 1;
        }
    }
    return {
        rootDir,
        artifactDir,
        baselineDir: baselineDir ? node_path_1.default.resolve(baselineDir) : undefined,
        skillCount: skills.length,
        summary,
        skills: skills.sort((left, right) => left.relativeDir.localeCompare(right.relativeDir))
    };
}
function buildBatchReviewReport(result) {
    const lines = [];
    lines.push("# OpenClaw Skill Batch Review Report");
    lines.push("");
    lines.push(`- Root: \`${result.rootDir}\``);
    lines.push(`- Artifact directory: \`${result.artifactDir}\``);
    lines.push(`- Skills: ${result.skillCount}`);
    lines.push(`- Ready to ship: ${result.summary.ready}`);
    lines.push(`- Ready with warnings: ${result.summary.readyWithWarnings}`);
    lines.push(`- Not ready: ${result.summary.notReady}`);
    lines.push(`- Lint errors: ${result.summary.lintErrors}`);
    lines.push(`- Lint warnings: ${result.summary.lintWarnings}`);
    lines.push(`- Artifact drift detected: ${result.summary.archiveDrift}`);
    if (result.baselineDir) {
        lines.push(`- Baseline directory: \`${result.baselineDir}\``);
        lines.push(`- Baselines compared: ${result.summary.baselineCompared}`);
        lines.push(`- Release changes detected: ${result.summary.releaseChanged}`);
        lines.push(`- Baselines missing: ${result.summary.baselineMissing}`);
    }
    lines.push("");
    lines.push("## Skills");
    lines.push("");
    for (const skill of result.skills) {
        lines.push(`### ${skill.relativeDir}`);
        lines.push("");
        lines.push(`- Name: ${skill.name ?? "unknown"}`);
        lines.push(`- Readiness: ${formatReviewReadinessMarkdown(skill.readiness)}`);
        lines.push(`- Summary: ${skill.releaseSummary.headline}`);
        lines.push(`- Lint: ${skill.lint.summary.errors} error(s), ${skill.lint.summary.warnings} warning(s)`);
        if (skill.archive) {
            lines.push(`- Archive: \`${skill.archive.destination}\``);
            lines.push(`- Artifact check: ${skill.archive.comparison.matches ? "matches source" : "drift detected"} (${skill.archive.comparison.matchedEntries}/${skill.archive.comparison.entryCount} entries matched)`);
        }
        else {
            lines.push("- Archive: not created because blocking lint errors remain");
        }
        if (skill.baselineLookup?.requestedDir) {
            lines.push(`- Baseline archive: ${skill.baselineLookup.resolvedArchivePath ? `\`${skill.baselineLookup.resolvedArchivePath}\`` : `not found under \`${skill.baselineLookup.requestedDir}\``}`);
        }
        if (skill.archive?.releaseComparison) {
            lines.push(`- Release delta: ${skill.archive.releaseComparison.matches ? "matches baseline archive" : "release changed"} (${skill.archive.releaseComparison.matchedEntries}/${skill.archive.releaseComparison.baselineEntryCount} baseline entries matched)`);
        }
        if (skill.lint.issues.length > 0) {
            lines.push("- Issues:");
            for (const issue of skill.lint.issues) {
                lines.push(`  - ${issue.level.toUpperCase()} [${issue.code}] ${issue.file}: ${issue.message}`);
            }
        }
        if (skill.lint.nextSteps.length > 0) {
            lines.push("- Next steps:");
            skill.lint.nextSteps.forEach((step, index) => lines.push(`  ${index + 1}. ${step}`));
        }
        lines.push("");
    }
    return lines.join("\n");
}
async function writeBatchReviewReport(result, reportPath) {
    if (typeof reportPath === "undefined") {
        return undefined;
    }
    const destination = reportPath === true
        ? node_path_1.default.join(result.rootDir, ".openclaw-skillkit", "review-all.report.md")
        : typeof reportPath === "string"
            ? node_path_1.default.resolve(reportPath)
            : undefined;
    if (!destination) {
        return undefined;
    }
    await (0, fs_1.writeTextFile)(destination, buildBatchReviewReport(result));
    return destination;
}
async function discoverSkillDirs(rootDir) {
    const results = [];
    const ignored = new Set([".git", "node_modules", "dist", ".openclaw-skillkit"]);
    async function walk(currentDir) {
        const entries = await (0, promises_1.readdir)(currentDir, { withFileTypes: true });
        if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) {
            results.push(currentDir);
        }
        for (const entry of entries) {
            if (!entry.isDirectory() || ignored.has(entry.name)) {
                continue;
            }
            await walk(node_path_1.default.join(currentDir, entry.name));
        }
    }
    await walk(rootDir);
    return results.sort((left, right) => left.localeCompare(right));
}
async function readFrontmatterName(skillDir) {
    try {
        const markdown = await (0, fs_1.readTextFile)(node_path_1.default.join(skillDir, "SKILL.md"));
        const parsed = (0, frontmatter_1.parseFrontmatter)(markdown);
        return parsed.attributes.name || undefined;
    }
    catch {
        return undefined;
    }
}
function resolveBatchOutputPath(artifactDir, relativeDir) {
    const normalized = relativeDir === "." ? "root" : relativeDir;
    return node_path_1.default.join(artifactDir, `${normalized}.skill`);
}
async function resolveBatchBaselineArchive(baselineDir, rootDir, relativeDir, name) {
    if (!baselineDir) {
        return undefined;
    }
    const requestedDir = node_path_1.default.resolve(baselineDir);
    const candidateRelative = relativeDir === "." ? "root.skill" : `${relativeDir}.skill`;
    const candidates = [node_path_1.default.join(requestedDir, candidateRelative)];
    if (name) {
        candidates.push(node_path_1.default.join(requestedDir, `${name}.skill`));
    }
    const dedupedCandidates = [...new Set(candidates.map((candidate) => node_path_1.default.resolve(candidate)))];
    for (const candidate of dedupedCandidates) {
        if (await (0, fs_1.exists)(candidate)) {
            return {
                requestedDir,
                resolvedArchivePath: candidate
            };
        }
    }
    return {
        requestedDir
    };
}
function formatReadinessLabel(readiness) {
    switch (readiness) {
        case "ready":
            return "READY TO SHIP";
        case "ready-with-warnings":
            return "READY WITH WARNINGS";
        default:
            return "NOT READY";
    }
}
function formatAssessment(status) {
    switch (status) {
        case "pass":
            return "PASS";
        case "warn":
            return "ATTN";
        default:
            return "FAIL";
    }
}
function formatBatchReadiness(summary) {
    if (summary.notReady > 0) {
        return "NOT READY";
    }
    if (summary.readyWithWarnings > 0) {
        return "READY WITH WARNINGS";
    }
    return "READY TO SHIP";
}
function formatBatchSkillReadiness(readiness) {
    if (readiness === "ready") {
        return "READY";
    }
    if (readiness === "ready-with-warnings") {
        return "WARN";
    }
    return "BLOCKED";
}
function formatReviewReadinessMarkdown(readiness) {
    if (readiness === "ready") {
        return "ready to ship";
    }
    if (readiness === "ready-with-warnings") {
        return "ready with warnings";
    }
    return "not ready";
}
