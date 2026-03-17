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
exports.compareArchives = compareArchives;
exports.resolveArchiveReportPath = resolveArchiveReportPath;
exports.resolveReviewReportPath = resolveReviewReportPath;
exports.writeArchiveReport = writeArchiveReport;
exports.writeReviewReport = writeReviewReport;
exports.buildArchiveReport = buildArchiveReport;
exports.buildReviewReport = buildReviewReport;
exports.summarizeArchiveTrust = summarizeArchiveTrust;
exports.summarizeReviewReadiness = summarizeReviewReadiness;
exports.summarizeReleaseDelta = summarizeReleaseDelta;
exports.listExampleSkills = listExampleSkills;
const node_path_1 = __importDefault(require("node:path"));
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:fs/promises");
const fs_1 = require("./fs");
const frontmatter_1 = require("./frontmatter");
const skill_1 = require("./skill");
const templates_1 = require("./templates");
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
async function compareArchives(archivePath, baselineArchivePath) {
    const current = await inspectSkillArchive(archivePath);
    const baseline = await inspectSkillArchive(baselineArchivePath);
    const currentByPath = new Map(current.manifest.entries.map((entry) => [
        entry.path,
        {
            size: entry.size,
            sha256: entry.sha256
        }
    ]));
    const metadataDifferences = [
        compareArchiveMetadataField("name", current.manifest.skill.name, baseline.manifest.skill.name),
        compareArchiveMetadataField("description", current.manifest.skill.description, baseline.manifest.skill.description),
        compareArchiveMetadataField("version", current.manifest.skill.version, baseline.manifest.skill.version)
    ].filter(Boolean);
    const removedEntries = [];
    const changedEntries = [];
    let matchedEntries = 0;
    for (const baselineEntry of baseline.manifest.entries) {
        const currentEntry = currentByPath.get(baselineEntry.path);
        if (!currentEntry) {
            removedEntries.push(baselineEntry.path);
            continue;
        }
        currentByPath.delete(baselineEntry.path);
        if (currentEntry.size !== baselineEntry.size) {
            changedEntries.push({
                path: baselineEntry.path,
                currentSize: currentEntry.size,
                baselineSize: baselineEntry.size,
                reason: "size-mismatch"
            });
            continue;
        }
        if (baselineEntry.sha256 && currentEntry.sha256 !== baselineEntry.sha256) {
            changedEntries.push({
                path: baselineEntry.path,
                currentSize: currentEntry.size,
                baselineSize: baselineEntry.size,
                reason: "hash-mismatch"
            });
            continue;
        }
        matchedEntries += 1;
    }
    const addedEntries = [...currentByPath.keys()].sort((left, right) => left.localeCompare(right));
    const metadataMatches = metadataDifferences.length === 0;
    const matches = metadataMatches && addedEntries.length === 0 && removedEntries.length === 0 && changedEntries.length === 0;
    return {
        archivePath: current.archivePath,
        manifest: current.manifest,
        releaseComparison: {
            baselineArchivePath: baseline.archivePath,
            currentArchivePath: current.archivePath,
            comparedAt: new Date().toISOString(),
            metadataMatches,
            matches,
            entryCount: current.manifest.entryCount,
            baselineEntryCount: baseline.manifest.entryCount,
            matchedEntries,
            addedEntries,
            removedEntries,
            changedEntries,
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
    const trust = summarizeArchiveTrust(result);
    const lines = [
        "# OpenClaw Skill Archive Report",
        "",
        `Generated: ${generatedAt}`,
        "",
        "## Trust Summary",
        `- Headline: ${trust.headline}`,
        `- Confidence: ${trust.confidence}`,
        "",
        "### Checks"
    ];
    for (const check of trust.checks) {
        lines.push(`- ${formatAssessmentStatus(check.status)} ${check.label}: ${check.detail}`);
    }
    if (trust.nextStep) {
        lines.push(`- Next step: ${trust.nextStep}`);
    }
    lines.push("", "## Archive", `- Archive: ${result.archivePath}`, `- Skill: ${result.manifest.skill.name}@${result.manifest.skill.version}`, `- Description: ${result.manifest.skill.description}`, `- Packaged at: ${result.manifest.packagedAt}`, `- Manifest schema: v${result.manifest.schemaVersion}`, `- Bundled files: ${result.manifest.entryCount}`, `- Total bundled bytes: ${formatBytes(result.manifest.totalBytes)}`, "", "## Contents");
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
    if (result.releaseComparison) {
        const releaseDelta = summarizeReleaseDelta(result);
        lines.push("", "## Release Delta", `- Headline: ${releaseDelta.headline}`, `- Confidence: ${releaseDelta.confidence}`, `- Baseline archive: ${result.releaseComparison.baselineArchivePath}`, `- Compared at: ${result.releaseComparison.comparedAt}`, `- Status: ${result.releaseComparison.matches ? "no release delta detected" : "release changed"}`, `- Matched files: ${result.releaseComparison.matchedEntries}/${result.releaseComparison.baselineEntryCount}`);
        lines.push("", "### Delta Checks");
        for (const check of releaseDelta.checks) {
            lines.push(`- ${formatAssessmentStatus(check.status)} ${check.label}: ${check.detail}`);
        }
        if (result.releaseComparison.metadataDifferences.length > 0) {
            lines.push("", "### Metadata Changes");
            for (const difference of result.releaseComparison.metadataDifferences) {
                lines.push(`- ${difference.field}: current="${difference.currentValue}" baseline="${difference.baselineValue}"`);
            }
        }
        if (result.releaseComparison.changedEntries.length > 0) {
            lines.push("", "### Changed Since Baseline");
            for (const entry of result.releaseComparison.changedEntries) {
                lines.push(`- ${entry.path}: ${entry.reason} (current ${formatBytes(entry.currentSize)}, baseline ${formatBytes(entry.baselineSize)})`);
            }
        }
        if (result.releaseComparison.addedEntries.length > 0) {
            lines.push("", "### Added Since Baseline");
            for (const entry of result.releaseComparison.addedEntries) {
                lines.push(`- ${entry}`);
            }
        }
        if (result.releaseComparison.removedEntries.length > 0) {
            lines.push("", "### Removed Since Baseline");
            for (const entry of result.releaseComparison.removedEntries) {
                lines.push(`- ${entry}`);
            }
        }
    }
    if (!result.comparison) {
        lines.push(`- Status: packaged artifact reviewed without source comparison`);
        lines.push(`- Next: run \`openclaw-skillkit inspect ${result.archivePath} --source ./path-to-skill\` to include drift status`);
    }
    lines.push("", "## Reviewer Checklist", "- Confirm the skill name, version, and description match the release you intend to share.", "- Confirm every referenced helper file is bundled in the archive contents above.", "- If source comparison was included, resolve any reported drift before publication.", "- If a baseline archive was included, confirm the release delta matches what you intended to ship.");
    return lines.join("\n");
}
function buildReviewReport(review) {
    const summary = summarizeReviewReadiness(review);
    const lines = [
        "# OpenClaw Skill Review Report",
        "",
        `Generated: ${new Date().toISOString()}`,
        "",
        "## Release Summary",
        `- Headline: ${summary.headline}`,
        `- Confidence: ${summary.confidence}`,
        "",
        "### Checks"
    ];
    for (const check of summary.checks) {
        lines.push(`- ${formatAssessmentStatus(check.status)} ${check.label}: ${check.detail}`);
    }
    lines.push("", "## Readiness", `- Skill directory: ${review.skillDir}`, `- Verdict: ${formatReviewReadiness(review.readiness)}`, `- Files checked: ${review.lint.fileCount}`, `- Lint summary: ${review.lint.summary.errors} error(s), ${review.lint.summary.warnings} warning(s)`);
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
function summarizeArchiveTrust(result) {
    const checks = [
        {
            label: "Manifest",
            status: "pass",
            detail: `embedded manifest loaded from the packaged archive (schema v${result.manifest.schemaVersion})`
        },
        {
            label: "Contents",
            status: "pass",
            detail: `${result.manifest.entryCount} bundled file(s), ${formatBytes(result.manifest.totalBytes)} before manifest`
        }
    ];
    if (!result.comparison) {
        return {
            status: "verified",
            headline: "Archive manifest verified",
            confidence: "The packaged artifact includes a readable manifest, but source parity has not been checked yet.",
            checks,
            nextStep: `openclaw-skillkit inspect ${result.archivePath} --source ./path-to-skill`
        };
    }
    const comparison = result.comparison;
    checks.push({
        label: "Metadata",
        status: comparison.metadataMatches ? "pass" : "fail",
        detail: comparison.metadataMatches
            ? "archive metadata matches the selected source skill"
            : `${comparison.metadataDifferences.length} metadata field(s) drifted`
    });
    checks.push({
        label: "Source parity",
        status: comparison.matches ? "pass" : "fail",
        detail: comparison.matches
            ? `${comparison.matchedEntries}/${comparison.entryCount} archive entries match the source`
            : buildParityDetail(comparison)
    });
    if (comparison.matches) {
        return {
            status: "matching-source",
            headline: "Archive matches source",
            confidence: "The embedded manifest, metadata, and bundled files all align with the selected source directory.",
            checks
        };
    }
    return {
        status: "drift-detected",
        headline: "Artifact drift detected",
        confidence: "The packaged artifact no longer reflects the selected source directory, so it should be re-packed before handoff.",
        checks
    };
}
function summarizeReviewReadiness(review) {
    const checks = [
        {
            label: "Lint",
            status: review.lint.summary.errors > 0 ? "fail" : review.lint.summary.warnings > 0 ? "warn" : "pass",
            detail: review.lint.summary.errors > 0
                ? `${review.lint.summary.errors} blocking error(s), ${review.lint.summary.warnings} warning(s)`
                : review.lint.summary.warnings > 0
                    ? `${review.lint.summary.warnings} warning(s) remain`
                    : "no blocking errors or warnings"
        },
        {
            label: "Focus areas",
            status: review.lint.focusAreas.some((area) => area.errors > 0) ? "fail" : review.lint.focusAreas.length > 0 ? "warn" : "pass",
            detail: review.lint.focusAreas.length > 0
                ? review.lint.focusAreas
                    .slice(0, 2)
                    .map((area) => `${area.label.toLowerCase()} ${area.errors}/${area.warnings}`)
                    .join(", ")
                : "no risk clusters detected"
        }
    ];
    if (!review.archive) {
        checks.push({
            label: "Archive",
            status: "fail",
            detail: "not created because blocking lint errors remain"
        });
        return {
            headline: "Not ready to ship",
            confidence: "Blocking lint issues prevent packaging, so there is no trustworthy release artifact yet.",
            checks
        };
    }
    checks.push({
        label: "Archive",
        status: review.archive.warnings.length > 0 ? "warn" : "pass",
        detail: review.archive.warnings.length > 0
            ? `${review.archive.warnings.length} packaging warning(s) carried into the artifact`
            : `created successfully at ${review.archive.destination}`
    });
    const trust = summarizeArchiveTrust({
        archivePath: review.archive.destination,
        manifest: review.archive.manifest,
        comparison: review.archive.comparison
    });
    checks.push({
        label: "Artifact trust",
        status: mapTrustStatusToAssessment(trust.status),
        detail: trust.headline.toLowerCase()
    });
    if (review.readiness === "ready") {
        return {
            headline: "Ready to ship",
            confidence: "Lint passed cleanly, the archive was created, and the packaged artifact still matches the source.",
            checks
        };
    }
    if (review.readiness === "ready-with-warnings") {
        return {
            headline: "Ready with warnings",
            confidence: "The release is packable and trusted, but warnings still deserve a final pass before handoff.",
            checks
        };
    }
    return {
        headline: "Not ready to ship",
        confidence: review.archive.comparison.matches === false
            ? "The artifact no longer matches the source, so the release should be rebuilt before handoff."
            : "Blocking issues remain in the release workflow.",
        checks
    };
}
function summarizeReleaseDelta(result) {
    if (!result.releaseComparison) {
        return {
            status: "same-release",
            headline: "No baseline archive selected",
            confidence: "Select a previous .skill artifact to see exactly what changed between releases.",
            checks: []
        };
    }
    const comparison = result.releaseComparison;
    const checks = [
        {
            label: "Metadata delta",
            status: comparison.metadataMatches ? "pass" : "warn",
            detail: comparison.metadataMatches
                ? "name, description, and version match the baseline archive"
                : `${comparison.metadataDifferences.length} metadata field(s) changed`
        },
        {
            label: "File delta",
            status: comparison.matches ? "pass" : "warn",
            detail: comparison.matches
                ? `${comparison.matchedEntries}/${comparison.baselineEntryCount} baseline files are unchanged`
                : buildReleaseDeltaDetail(comparison)
        }
    ];
    if (comparison.matches) {
        return {
            status: "same-release",
            headline: "Matches baseline archive",
            confidence: "The current artifact is identical to the selected baseline archive at the manifest level.",
            checks
        };
    }
    return {
        status: "release-changed",
        headline: "Release delta detected",
        confidence: "The current artifact differs from the selected baseline archive, so reviewers can inspect exactly what changed before handoff.",
        checks
    };
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
        const title = extractFirstHeading(parsed.body) ?? entry.name;
        const useCases = extractMarkdownBullets(extractMarkdownSection(parsed.body, "Use When"));
        const workflowSteps = extractMarkdownNumberedSteps(extractMarkdownSection(parsed.body, "Workflow"));
        for (const resource of ["references", "scripts", "assets"]) {
            if (await (0, fs_1.exists)(node_path_1.default.join(skillDir, resource))) {
                resources.push(resource);
            }
        }
        const recommendedTemplate = inferTemplateMode(resources);
        results.push({
            name: parsed.attributes.name ?? entry.name,
            absolutePath: skillDir,
            relativePath: node_path_1.default.relative(repoRoot, skillDir),
            title,
            description: parsed.attributes.description ?? "",
            version: parsed.attributes.version ?? "",
            resources,
            recommendedTemplate,
            suggestedTargetDir: `./skills/${parsed.attributes.name ?? entry.name}`,
            starterCommand: `openclaw-skillkit init ./skills/${parsed.attributes.name ?? entry.name} --template ${recommendedTemplate}`,
            useCases,
            workflowSteps,
            workflowPreview: workflowSteps[0] ?? "Review the example and adapt its workflow to your own domain."
        });
    }
    return results.sort((left, right) => left.name.localeCompare(right.name));
}
function extractFirstHeading(markdownBody) {
    const match = markdownBody.match(/^#\s+(.+)$/m);
    return match?.[1]?.trim();
}
function extractMarkdownSection(markdownBody, heading) {
    const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = markdownBody.match(new RegExp(`^##\\s+${escapedHeading}\\s*$([\\s\\S]*?)(?=^##\\s+|\\Z)`, "m"));
    return match?.[1]?.trim() ?? "";
}
function extractMarkdownBullets(section) {
    return section
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^-\s+/.test(line))
        .map((line) => line.replace(/^-\s+/, "").trim());
}
function extractMarkdownNumberedSteps(section) {
    return section
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => /^\d+\.\s+/.test(line))
        .map((line) => line.replace(/^\d+\.\s+/, "").trim());
}
function inferTemplateMode(resources) {
    const normalizedResources = [...resources].sort();
    for (const [template, templateResources] of Object.entries(templates_1.TEMPLATE_MODES)) {
        if (templateResources.length === normalizedResources.length &&
            templateResources.every((resource, index) => normalizedResources[index] === resource)) {
            return template;
        }
    }
    return normalizedResources.includes("assets")
        ? "full"
        : normalizedResources.includes("scripts")
            ? "scripts"
            : normalizedResources.includes("references")
                ? "references"
                : "minimal";
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
function compareArchiveMetadataField(field, currentValue, baselineValue) {
    if (currentValue === baselineValue) {
        return null;
    }
    return {
        field,
        currentValue,
        baselineValue
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
function formatAssessmentStatus(status) {
    switch (status) {
        case "pass":
            return "PASS";
        case "warn":
            return "ATTN";
        default:
            return "FAIL";
    }
}
function buildParityDetail(comparison) {
    const details = [];
    if (comparison.changedEntries.length > 0) {
        details.push(`${comparison.changedEntries.length} changed file(s)`);
    }
    if (comparison.missingFromSource.length > 0) {
        details.push(`${comparison.missingFromSource.length} missing from source`);
    }
    if (comparison.extraSourceEntries.length > 0) {
        details.push(`${comparison.extraSourceEntries.length} new in source`);
    }
    if (comparison.metadataDifferences.length > 0) {
        details.push(`${comparison.metadataDifferences.length} metadata difference(s)`);
    }
    return details.join(", ") || `${comparison.matchedEntries}/${comparison.entryCount} entries match`;
}
function buildReleaseDeltaDetail(comparison) {
    const details = [];
    if (comparison.changedEntries.length > 0) {
        details.push(`${comparison.changedEntries.length} changed file(s)`);
    }
    if (comparison.addedEntries.length > 0) {
        details.push(`${comparison.addedEntries.length} new file(s)`);
    }
    if (comparison.removedEntries.length > 0) {
        details.push(`${comparison.removedEntries.length} removed file(s)`);
    }
    if (comparison.metadataDifferences.length > 0) {
        details.push(`${comparison.metadataDifferences.length} metadata change(s)`);
    }
    return details.join(", ") || `${comparison.matchedEntries}/${comparison.baselineEntryCount} baseline entries match`;
}
function mapTrustStatusToAssessment(status) {
    switch (status) {
        case "verified":
            return "warn";
        case "matching-source":
            return "pass";
        default:
            return "fail";
    }
}
