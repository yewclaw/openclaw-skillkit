"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.summarizeLintResult = summarizeLintResult;
exports.summarizeFocusAreas = summarizeFocusAreas;
exports.buildActionPlan = buildActionPlan;
exports.formatBytes = formatBytes;
exports.resolveArchiveDestination = resolveArchiveDestination;
exports.packSkill = packSkill;
exports.inspectSkillArchive = inspectSkillArchive;
exports.reviewSkill = reviewSkill;
exports.compareArchiveToSource = compareArchiveToSource;
exports.resolveArchiveReportPath = resolveArchiveReportPath;
exports.resolveReviewReportPath = resolveReviewReportPath;
exports.writeArchiveReport = writeArchiveReport;
exports.writeReviewReport = writeReviewReport;
exports.buildArchiveReport = buildArchiveReport;
exports.buildReviewReport = buildReviewReport;
exports.listExampleSkills = listExampleSkills;
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const fs_1 = require("./fs");
const frontmatter_1 = require("./frontmatter");
const skill_1 = require("./skill");
const zip_1 = require("./zip");
function summarizeLintResult(result) {
    const errors = result.issues.filter((issue) => issue.level === "error").length;
    const warnings = result.issues.filter((issue) => issue.level === "warning").length;
    return {
        total: result.issues.length,
        errors,
        warnings
    };
}
function summarizeFocusAreas(result) {
    const grouped = new Map();
    for (const issue of result.issues) {
        const current = grouped.get(issue.category) ?? { errors: 0, warnings: 0 };
        current[issue.level === "error" ? "errors" : "warnings"] += 1;
        grouped.set(issue.category, current);
    }
    return [...grouped.entries()]
        .sort((left, right) => {
        const leftCounts = left[1];
        const rightCounts = right[1];
        return (rightCounts.errors - leftCounts.errors ||
            rightCounts.warnings - leftCounts.warnings ||
            left[0].localeCompare(right[0]));
    })
        .map(([category, counts]) => ({
        category,
        label: CATEGORY_GUIDANCE[category].label,
        errors: counts.errors,
        warnings: counts.warnings,
        suggestion: CATEGORY_GUIDANCE[category].suggestion
    }));
}
function buildActionPlan(result, resolvedDir) {
    const focusAreas = summarizeFocusAreas(result);
    if (focusAreas.length === 0) {
        return [
            `Pack when ready: openclaw-skillkit pack ${resolvedDir}`,
            `Run a release check before handoff: openclaw-skillkit review ${resolvedDir}`
        ];
    }
    const steps = [];
    const blockingArea = focusAreas.find((area) => area.errors > 0);
    if (blockingArea) {
        steps.push(`Fix blocking ${blockingArea.label.toLowerCase()} issues first. ${blockingArea.suggestion}`);
    }
    const warningArea = focusAreas.find((area) => area.warnings > 0 && area.category !== blockingArea?.category);
    if (warningArea) {
        steps.push(`Then review ${warningArea.label.toLowerCase()} warnings. ${warningArea.suggestion}`);
    }
    steps.push(`Re-run: openclaw-skillkit lint ${resolvedDir}`);
    if (!blockingArea) {
        steps.push(`Pack when ready: openclaw-skillkit pack ${resolvedDir}`);
        steps.push(`Run a release check before handoff: openclaw-skillkit review ${resolvedDir}`);
    }
    return steps;
}
function formatBytes(size) {
    if (size < 1024) {
        return `${size} B`;
    }
    return `${(size / 1024).toFixed(1)} KB`;
}
function resolveArchiveDestination(resolvedDir, outputPath) {
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
async function packSkill(targetDir, outputPath) {
    const resolvedDir = node_path_1.default.resolve(targetDir);
    const lintResult = await (0, skill_1.lintSkill)(resolvedDir);
    const errors = lintResult.issues.filter((issue) => issue.level === "error");
    const warnings = lintResult.issues.filter((issue) => issue.level === "warning");
    if (errors.length > 0) {
        throw new Error(`Cannot pack ${resolvedDir} because lint found ${errors.length} error(s). Run "openclaw-skillkit lint ${resolvedDir}" first.`);
    }
    const { destination, normalizedOutputPath } = resolveArchiveDestination(resolvedDir, outputPath);
    if (await (0, fs_1.exists)(destination)) {
        throw new Error(`Output already exists: ${destination}`);
    }
    await (0, fs_1.ensureDir)(node_path_1.default.dirname(destination));
    const archive = await (0, zip_1.createSkillArchive)(resolvedDir, destination);
    const archiveStat = await (0, promises_1.stat)(destination);
    return {
        resolvedDir,
        destination,
        normalizedOutputPath,
        warnings,
        archiveSizeBytes: archiveStat.size,
        archiveSizeLabel: formatBytes(archiveStat.size),
        manifest: archive.manifest
    };
}
async function inspectSkillArchive(archivePath) {
    const resolvedArchivePath = node_path_1.default.resolve(archivePath);
    const manifest = await (0, zip_1.readArchiveManifest)(resolvedArchivePath);
    return {
        archivePath: resolvedArchivePath,
        manifest
    };
}
async function reviewSkill(targetDir, outputPath) {
    const resolvedDir = node_path_1.default.resolve(targetDir);
    const lintResult = await (0, skill_1.lintSkill)(resolvedDir);
    const summary = summarizeLintResult(lintResult);
    const focusAreas = summarizeFocusAreas(lintResult);
    const nextSteps = buildActionPlan(lintResult, resolvedDir);
    const review = {
        skillDir: resolvedDir,
        readiness: summary.errors > 0 ? "not-ready" : summary.warnings > 0 ? "ready-with-warnings" : "ready",
        lint: {
            fileCount: lintResult.fileCount,
            summary,
            focusAreas,
            nextSteps,
            issues: lintResult.issues
        }
    };
    if (summary.errors > 0) {
        return review;
    }
    const packed = await packSkill(resolvedDir, outputPath);
    const inspected = await compareArchiveToSource(packed.destination, resolvedDir);
    if (!inspected.comparison) {
        throw new Error("Expected source comparison for review workflow.");
    }
    review.archive = {
        ...packed,
        comparison: inspected.comparison
    };
    if (!inspected.comparison.matches) {
        review.readiness = "not-ready";
    }
    return review;
}
async function compareArchiveToSource(archivePath, sourceDir) {
    const inspected = await inspectSkillArchive(archivePath);
    const resolvedSourceDir = node_path_1.default.resolve(sourceDir);
    const sourceSkillFile = node_path_1.default.join(resolvedSourceDir, "SKILL.md");
    if (!(await (0, fs_1.exists)(sourceSkillFile))) {
        throw new Error(`Missing SKILL.md at source directory: ${resolvedSourceDir}`);
    }
    const sourceMarkdown = await (0, fs_1.readTextFile)(sourceSkillFile);
    const sourceFrontmatter = (0, frontmatter_1.parseFrontmatter)(sourceMarkdown).attributes;
    const sourceFiles = (await readdirRecursiveWithHashes(resolvedSourceDir))
        .filter((file) => !file.relativePath.endsWith(".skill"))
        .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
    const sourceByPath = new Map(sourceFiles.map((file) => [
        file.relativePath.split(node_path_1.default.sep).join("/"),
        {
            size: file.size,
            sha256: file.sha256
        }
    ]));
    const metadataDifferences = [
        compareMetadataField("name", inspected.manifest.skill.name, sourceFrontmatter.name),
        compareMetadataField("description", inspected.manifest.skill.description, sourceFrontmatter.description),
        compareMetadataField("version", inspected.manifest.skill.version, sourceFrontmatter.version)
    ].filter(Boolean);
    const missingFromSource = [];
    const changedEntries = [];
    let matchedEntries = 0;
    for (const entry of inspected.manifest.entries) {
        const sourceEntry = sourceByPath.get(entry.path);
        if (!sourceEntry) {
            missingFromSource.push(entry.path);
            continue;
        }
        sourceByPath.delete(entry.path);
        if (sourceEntry.size !== entry.size) {
            changedEntries.push({
                path: entry.path,
                archiveSize: entry.size,
                sourceSize: sourceEntry.size,
                reason: "size-mismatch"
            });
            continue;
        }
        if (entry.sha256 && sourceEntry.sha256 !== entry.sha256) {
            changedEntries.push({
                path: entry.path,
                archiveSize: entry.size,
                sourceSize: sourceEntry.size,
                reason: "hash-mismatch"
            });
            continue;
        }
        matchedEntries += 1;
    }
    const extraSourceEntries = [...sourceByPath.keys()].sort((left, right) => left.localeCompare(right));
    const metadataMatches = metadataDifferences.length === 0;
    const matches = metadataMatches && missingFromSource.length === 0 && changedEntries.length === 0 && extraSourceEntries.length === 0;
    return {
        archivePath: inspected.archivePath,
        manifest: inspected.manifest,
        comparison: {
            sourceDir: resolvedSourceDir,
            comparedAt: new Date().toISOString(),
            metadataMatches,
            matches,
            entryCount: inspected.manifest.entryCount,
            matchedEntries,
            missingFromSource,
            changedEntries,
            extraSourceEntries,
            metadataDifferences
        }
    };
}
function resolveArchiveReportPath(archivePath, requestedPath) {
    if (!requestedPath) {
        return undefined;
    }
    if (requestedPath === true) {
        return node_path_1.default.resolve(defaultArchiveReportFileName(archivePath));
    }
    return node_path_1.default.resolve(requestedPath);
}
function resolveReviewReportPath(review, requestedPath) {
    if (!requestedPath) {
        return undefined;
    }
    if (requestedPath === true) {
        return node_path_1.default.resolve(defaultReviewReportFileName(review.skillDir, review.archive?.destination));
    }
    return node_path_1.default.resolve(requestedPath);
}
async function writeArchiveReport(archivePath, result, requestedPath) {
    const reportPath = resolveArchiveReportPath(archivePath, requestedPath);
    if (!reportPath) {
        return undefined;
    }
    await (0, fs_1.writeTextFile)(reportPath, buildArchiveReport(result));
    return reportPath;
}
async function writeReviewReport(review, requestedPath) {
    const reportPath = resolveReviewReportPath(review, requestedPath);
    if (!reportPath) {
        return undefined;
    }
    await (0, fs_1.writeTextFile)(reportPath, buildReviewReport(review));
    return reportPath;
}
function buildArchiveReport(result) {
    const generatedAt = new Date().toISOString();
    const lines = [
        "# OpenClaw Skill Archive Report",
        "",
        `Generated: ${generatedAt}`,
        "",
        "## Archive",
        `- Archive: ${result.archivePath}`,
        `- Skill: ${result.manifest.skill.name}@${result.manifest.skill.version}`,
        `- Description: ${result.manifest.skill.description}`,
        `- Packaged at: ${result.manifest.packagedAt}`,
        `- Manifest schema: v${result.manifest.schemaVersion}`,
        `- Bundled files: ${result.manifest.entryCount}`,
        `- Total bundled bytes: ${formatBytes(result.manifest.totalBytes)}`,
        "",
        "## Contents"
    ];
    for (const entry of result.manifest.entries) {
        lines.push(`- \`${entry.path}\` (${formatBytes(entry.size)}, sha256 \`${entry.sha256 ?? "n/a"}\`)`);
    }
    lines.push("", "## Review Status");
    if (result.comparison) {
        lines.push(`- Source: ${result.comparison.sourceDir}`, `- Compared at: ${result.comparison.comparedAt}`, `- Status: ${result.comparison.matches ? "matches source" : "drift detected"}`, `- Matched archive entries: ${result.comparison.matchedEntries}/${result.comparison.entryCount}`);
        if (result.comparison.metadataDifferences.length > 0) {
            lines.push("", "### Metadata Drift");
            for (const difference of result.comparison.metadataDifferences) {
                lines.push(`- ${difference.field}: archive="${difference.archiveValue}" source="${difference.sourceValue}"`);
            }
        }
        if (result.comparison.changedEntries.length > 0) {
            lines.push("", "### Changed Files");
            for (const entry of result.comparison.changedEntries) {
                lines.push(`- ${entry.path}: ${entry.reason} (archive ${formatBytes(entry.archiveSize)}, source ${formatBytes(entry.sourceSize)})`);
            }
        }
        if (result.comparison.missingFromSource.length > 0) {
            lines.push("", "### Missing From Source");
            for (const entry of result.comparison.missingFromSource) {
                lines.push(`- ${entry}`);
            }
        }
        if (result.comparison.extraSourceEntries.length > 0) {
            lines.push("", "### New In Source");
            for (const entry of result.comparison.extraSourceEntries) {
                lines.push(`- ${entry}`);
            }
        }
    }
    else {
        lines.push(`- Status: packaged artifact reviewed without source comparison`);
        lines.push(`- Next: run \`openclaw-skillkit inspect ${result.archivePath} --source ./path-to-skill\` to include drift status`);
    }
    lines.push("", "## Reviewer Checklist", "- Confirm the skill name, version, and description match the release you intend to share.", "- Confirm every referenced helper file is bundled in the archive contents above.", "- If source comparison was included, resolve any reported drift before publication.");
    return lines.join("\n");
}
function buildReviewReport(review) {
    const lines = [
        "# OpenClaw Skill Review Report",
        "",
        `Generated: ${new Date().toISOString()}`,
        "",
        "## Readiness",
        `- Skill directory: ${review.skillDir}`,
        `- Verdict: ${formatReviewReadiness(review.readiness)}`,
        `- Files checked: ${review.lint.fileCount}`,
        `- Lint summary: ${review.lint.summary.errors} error(s), ${review.lint.summary.warnings} warning(s)`
    ];
    if (review.lint.focusAreas.length > 0) {
        lines.push("", "## Focus Areas");
        for (const area of review.lint.focusAreas) {
            lines.push(`- ${area.label}: ${area.errors} error(s), ${area.warnings} warning(s)`);
        }
    }
    if (review.lint.issues.length > 0) {
        lines.push("", "## Issues");
        for (const issue of review.lint.issues) {
            lines.push(`- ${issue.level.toUpperCase()} [${issue.code}] ${issue.file}: ${issue.message}`);
            if (issue.suggestion) {
                lines.push(`  Fix: ${issue.suggestion}`);
            }
        }
    }
    if (review.archive) {
        lines.push("", "## Archive", `- Archive: ${review.archive.destination}`, `- Size: ${review.archive.archiveSizeLabel}`, `- Skill: ${review.archive.manifest.skill.name}@${review.archive.manifest.skill.version}`, `- Bundled files: ${review.archive.manifest.entryCount}`, `- Drift check: ${review.archive.comparison.matches ? "matches source" : "drift detected"}`, `- Matched entries: ${review.archive.comparison.matchedEntries}/${review.archive.comparison.entryCount}`);
        if (review.archive.warnings.length > 0) {
            lines.push("", "## Packaging Warnings");
            for (const warning of review.archive.warnings) {
                lines.push(`- ${warning.code}: ${warning.message}`);
            }
        }
    }
    else {
        lines.push("", "## Archive", "- Archive not created because blocking lint errors remain.");
    }
    if (review.lint.nextSteps.length > 0) {
        lines.push("", "## Next Steps");
        review.lint.nextSteps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
    }
    return lines.join("\n");
}
async function listExampleSkills(repoRoot = node_path_1.default.resolve(__dirname, "..", "..")) {
    const examplesDir = node_path_1.default.join(repoRoot, "examples");
    const entries = await (0, promises_1.readdir)(examplesDir, { withFileTypes: true });
    const results = [];
    for (const entry of entries) {
        if (!entry.isDirectory()) {
            continue;
        }
        const skillDir = node_path_1.default.join(examplesDir, entry.name);
        const skillFile = node_path_1.default.join(skillDir, "SKILL.md");
        if (!(await (0, fs_1.exists)(skillFile))) {
            continue;
        }
        const markdown = await (0, fs_1.readTextFile)(skillFile);
        const parsed = (0, frontmatter_1.parseFrontmatter)(markdown);
        const resources = [];
        for (const resource of ["references", "scripts", "assets"]) {
            if (await (0, fs_1.exists)(node_path_1.default.join(skillDir, resource))) {
                resources.push(resource);
            }
        }
        results.push({
            name: parsed.attributes.name ?? entry.name,
            absolutePath: skillDir,
            relativePath: node_path_1.default.relative(repoRoot, skillDir),
            description: parsed.attributes.description ?? "",
            version: parsed.attributes.version ?? "",
            resources
        });
    }
    return results.sort((left, right) => left.name.localeCompare(right.name));
}
const CATEGORY_GUIDANCE = {
    filesystem: {
        label: "Filesystem",
        suggestion: "Make sure the skill directory exists and contains a root SKILL.md before packaging."
    },
    frontmatter: {
        label: "Metadata",
        suggestion: "Update the SKILL.md frontmatter so name, description, and version clearly identify the skill."
    },
    structure: {
        label: "Structure",
        suggestion: "Add the standard sections and make the workflow easy to follow as numbered steps."
    },
    content: {
        label: "Content",
        suggestion: "Replace scaffold copy with concrete instructions, outputs, and guardrails."
    },
    references: {
        label: "References",
        suggestion: "Repair or bundle every local markdown link so packaged skills stay self-contained."
    },
    scripts: {
        label: "Scripts",
        suggestion: "Mark bundled helper scripts executable when authors are expected to run them directly."
    }
};
async function readdirRecursiveWithHashes(rootDir) {
    const files = await (0, fs_1.listFilesRecursive)(rootDir);
    return Promise.all(files.map(async (file) => ({
        relativePath: file.relativePath,
        size: file.size,
        sha256: hashBuffer(await (0, promises_1.readFile)(file.absolutePath))
    })));
}
function hashBuffer(buffer) {
    return (0, node_crypto_1.createHash)("sha256").update(buffer).digest("hex");
}
function compareMetadataField(field, archiveValue, sourceValue) {
    const normalizedSourceValue = typeof sourceValue === "string" ? sourceValue : "";
    if (archiveValue === normalizedSourceValue) {
        return null;
    }
    return {
        field,
        archiveValue,
        sourceValue: normalizedSourceValue
    };
}
function defaultArchiveReportFileName(archivePath) {
    const resolvedArchivePath = node_path_1.default.resolve(archivePath);
    if (resolvedArchivePath.endsWith(".skill")) {
        return `${resolvedArchivePath.slice(0, -".skill".length)}.report.md`;
    }
    return `${resolvedArchivePath}.report.md`;
}
function defaultReviewReportFileName(skillDir, archivePath) {
    if (archivePath) {
        const resolvedArchivePath = node_path_1.default.resolve(archivePath);
        if (resolvedArchivePath.endsWith(".skill")) {
            return `${resolvedArchivePath.slice(0, -".skill".length)}.review.md`;
        }
        return `${resolvedArchivePath}.review.md`;
    }
    return `${node_path_1.default.resolve(skillDir)}.review.md`;
}
function formatReviewReadiness(readiness) {
    switch (readiness) {
        case "ready":
            return "ready to ship";
        case "ready-with-warnings":
            return "ready with warnings";
        default:
            return "not ready";
    }
}
