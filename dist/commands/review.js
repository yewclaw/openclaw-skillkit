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
                        suggestion: 'Run "skillforge init <dir>" to scaffold a skill, or point review at the repo containing skills.'
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
        console.log(`  2. Re-run: skillforge review ${rootDir} --all`);
        return 1;
    }
    const artifactDir = options.outputDir
        ? node_path_1.default.resolve(options.outputDir)
        : node_path_1.default.join(rootDir, ".skillforge", "review-artifacts", `${Date.now()}`);
    const skills = [];
    for (const skillDir of skillDirs) {
        const relativeDir = node_path_1.default.relative(rootDir, skillDir) || ".";
        const name = await readFrontmatterName(skillDir);
        const outputPath = resolveBatchOutputPath(artifactDir, relativeDir);
        const baselineLookup = await resolveBatchBaselineArchive(options.baselineDir, rootDir, relativeDir, name);
        const review = await (0, workflow_1.reviewSkill)(skillDir, outputPath, baselineLookup?.resolvedArchivePath);
        const largestEntry = review.archive?.manifest.entries
            .slice()
            .sort((left, right) => right.size - left.size || left.path.localeCompare(right.path))[0];
        skills.push({
            skillDir,
            relativeDir,
            name,
            artifactPath: outputPath,
            artifactPresent: await (0, fs_1.exists)(outputPath),
            readiness: review.readiness,
            releaseSummary: (0, workflow_1.summarizeReviewReadiness)(review),
            lint: review.lint,
            archive: review.archive
                ? {
                    destination: review.archive.destination,
                    archiveSizeBytes: review.archive.archiveSizeBytes,
                    archiveSizeLabel: review.archive.archiveSizeLabel,
                    entryCount: review.archive.manifest.entryCount,
                    totalBytes: review.archive.manifest.totalBytes,
                    largestEntry: largestEntry
                        ? {
                            path: largestEntry.path,
                            size: largestEntry.size
                        }
                        : undefined,
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
                            metadataDifferences: review.archive.releaseComparison.metadataDifferences.map((difference) => ({
                                field: difference.field
                            })),
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
    const result = await summarizeBatchReview(rootDir, artifactDir, options.baselineDir, skills);
    const reportPath = await writeBatchReviewReport(result, options.reportPath);
    const reportMarkdown = buildBatchReviewReport(result);
    const indexPath = await writeBatchReviewIndex(result, options.indexPath);
    if (options.format === "json") {
        console.log(JSON.stringify({
            rootDir: result.rootDir,
            artifactDir: result.artifactDir,
            baselineDir: result.baselineDir,
            skillCount: result.skillCount,
            summary: result.summary,
            artifactSummary: result.artifactSummary,
            maintenanceSummary: result.maintenanceSummary,
            artifactCleanupSummary: result.artifactCleanupSummary,
            releaseHotspots: result.releaseSummary,
            baselineSummary: result.baselineSummary,
            operationsSummary: result.operationsSummary,
            reportPath,
            indexPath,
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
    console.log(`  Artifacts created: ${result.summary.artifactsCreated} (${result.artifactSummary.totalEntries} bundled files, ${formatBytes(result.artifactSummary.totalBytes)} total)`);
    if (result.baselineDir) {
        console.log(`  Baselines compared: ${result.summary.baselineCompared}`);
        console.log(`  Release changes detected: ${result.summary.releaseChanged}`);
        console.log(`  Baselines missing: ${result.summary.baselineMissing}`);
    }
    if (result.artifactSummary.largestArchives.length > 0) {
        console.log("Artifact inventory:");
        for (const archive of result.artifactSummary.largestArchives) {
            console.log(`  ${archive.relativeDir}: ${formatBytes(archive.archiveSizeBytes)} across ${archive.entryCount} file(s) -> ${archive.archivePath}`);
        }
    }
    if (result.releaseSummary && result.releaseSummary.changedPaths.length > 0) {
        console.log("Release hotspots:");
        for (const hotspot of result.releaseSummary.changedPaths) {
            console.log(`  ${hotspot.path}: touched in ${hotspot.count} skill(s) [${hotspot.changeKinds.join(", ")}]`);
        }
    }
    if (result.maintenanceSummary.issueHotspots.length > 0) {
        console.log("Issue hotspots:");
        for (const hotspot of result.maintenanceSummary.issueHotspots) {
            console.log(`  ${hotspot.code}: ${hotspot.count} issue(s) across ${hotspot.skills.join(", ")}`);
        }
    }
    if (result.artifactCleanupSummary.blockedSkillArtifacts.length > 0 || result.artifactCleanupSummary.staleArtifacts.length > 0) {
        console.log("Artifact cleanup:");
        console.log(`  Blocked skill artifacts: ${result.artifactCleanupSummary.blockedSkillArtifacts.length}`);
        console.log(`  Stale artifacts: ${result.artifactCleanupSummary.staleArtifacts.length}`);
    }
    if (result.baselineSummary?.orphanedArchives.length) {
        console.log("Orphaned baselines:");
        for (const archive of result.baselineSummary.orphanedArchives) {
            console.log(`  ${archive}`);
        }
    }
    if (reportPath) {
        console.log(`Report: ${reportPath}`);
    }
    if (indexPath) {
        console.log(`Index: ${indexPath}`);
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
async function summarizeBatchReview(rootDir, artifactDir, baselineDir, skills) {
    const summary = {
        ready: 0,
        readyWithWarnings: 0,
        notReady: 0,
        lintErrors: 0,
        lintWarnings: 0,
        archiveDrift: 0,
        artifactsCreated: 0,
        artifactBytes: 0,
        artifactEntries: 0,
        baselineCompared: 0,
        releaseChanged: 0,
        baselineMissing: 0
    };
    const issueCounts = new Map();
    const changedPathCounts = new Map();
    const metadataCounts = new Map();
    const matchedBaselineArchives = new Set();
    const activeArtifactPaths = new Set();
    const blockedArtifactPaths = new Set();
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
        for (const issue of skill.lint.issues) {
            const current = issueCounts.get(issue.code) ?? { count: 0, skills: new Set() };
            current.count += 1;
            current.skills.add(skill.relativeDir);
            issueCounts.set(issue.code, current);
        }
        if (skill.archive && !skill.archive.comparison.matches) {
            summary.archiveDrift += 1;
        }
        if (skill.archive) {
            summary.artifactsCreated += 1;
            summary.artifactBytes += skill.archive.archiveSizeBytes;
            summary.artifactEntries += skill.archive.entryCount;
            activeArtifactPaths.add(node_path_1.default.resolve(skill.artifactPath));
        }
        else if (skill.readiness === "not-ready" && skill.artifactPresent) {
            blockedArtifactPaths.add(node_path_1.default.resolve(skill.artifactPath));
        }
        if (skill.archive?.releaseComparison) {
            summary.baselineCompared += 1;
            matchedBaselineArchives.add(node_path_1.default.resolve(skill.archive.releaseComparison.baselineArchivePath));
            if (!skill.archive.releaseComparison.matches) {
                summary.releaseChanged += 1;
            }
            for (const entry of skill.archive.releaseComparison.changedEntries) {
                const current = changedPathCounts.get(entry.path) ?? {
                    count: 0,
                    skills: new Set(),
                    changeKinds: new Set()
                };
                current.count += 1;
                current.skills.add(skill.relativeDir);
                current.changeKinds.add("changed");
                changedPathCounts.set(entry.path, current);
            }
            for (const entry of skill.archive.releaseComparison.addedEntries) {
                const current = changedPathCounts.get(entry) ?? {
                    count: 0,
                    skills: new Set(),
                    changeKinds: new Set()
                };
                current.count += 1;
                current.skills.add(skill.relativeDir);
                current.changeKinds.add("added");
                changedPathCounts.set(entry, current);
            }
            for (const entry of skill.archive.releaseComparison.removedEntries) {
                const current = changedPathCounts.get(entry) ?? {
                    count: 0,
                    skills: new Set(),
                    changeKinds: new Set()
                };
                current.count += 1;
                current.skills.add(skill.relativeDir);
                current.changeKinds.add("removed");
                changedPathCounts.set(entry, current);
            }
            for (const difference of skill.archive.releaseComparison.metadataDifferences ?? []) {
                const current = metadataCounts.get(difference.field) ?? { count: 0, skills: new Set() };
                current.count += 1;
                current.skills.add(skill.relativeDir);
                metadataCounts.set(difference.field, current);
            }
        }
        else if (baselineDir && skill.baselineLookup && !skill.baselineLookup.resolvedArchivePath) {
            summary.baselineMissing += 1;
        }
    }
    const totalArchives = skills.filter((skill) => skill.archive).length;
    const largestArchives = skills
        .filter((skill) => Boolean(skill.archive))
        .sort((left, right) => right.archive.archiveSizeBytes - left.archive.archiveSizeBytes || left.relativeDir.localeCompare(right.relativeDir))
        .slice(0, 5)
        .map((skill) => ({
        relativeDir: skill.relativeDir,
        archivePath: skill.archive.destination,
        archiveSizeBytes: skill.archive.archiveSizeBytes,
        entryCount: skill.archive.entryCount
    }));
    const largestEntries = skills
        .filter((skill) => Boolean(skill.archive?.largestEntry))
        .sort((left, right) => (right.archive.largestEntry?.size ?? 0) - (left.archive.largestEntry?.size ?? 0) ||
        left.relativeDir.localeCompare(right.relativeDir))
        .slice(0, 5)
        .map((skill) => ({
        relativeDir: skill.relativeDir,
        path: skill.archive.largestEntry?.path ?? "unknown",
        size: skill.archive.largestEntry?.size ?? 0
    }));
    const issueHotspots = [...issueCounts.entries()]
        .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
        .slice(0, 5)
        .map(([code, entry]) => ({
        code,
        count: entry.count,
        skills: [...entry.skills].sort((left, right) => left.localeCompare(right))
    }));
    const releaseSummary = changedPathCounts.size > 0 || metadataCounts.size > 0
        ? {
            changedPaths: [...changedPathCounts.entries()]
                .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
                .slice(0, 5)
                .map(([changePath, entry]) => ({
                path: changePath,
                count: entry.count,
                changeKinds: [...entry.changeKinds].sort((left, right) => left.localeCompare(right)),
                skills: [...entry.skills].sort((left, right) => left.localeCompare(right))
            })),
            metadataHotspots: [...metadataCounts.entries()]
                .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
                .map(([field, entry]) => ({
                field,
                count: entry.count,
                skills: [...entry.skills].sort((left, right) => left.localeCompare(right))
            }))
        }
        : undefined;
    const baselineSummary = baselineDir
        ? await summarizeBaselineCoverage(node_path_1.default.resolve(baselineDir), skills, matchedBaselineArchives)
        : undefined;
    const staleArtifacts = await listStaleReviewArtifacts(artifactDir, activeArtifactPaths, blockedArtifactPaths);
    const blockedSkillArtifacts = [...blockedArtifactPaths].sort((left, right) => left.localeCompare(right));
    return {
        rootDir,
        artifactDir,
        baselineDir: baselineDir ? node_path_1.default.resolve(baselineDir) : undefined,
        skillCount: skills.length,
        summary,
        artifactSummary: {
            totalArchives,
            totalBytes: summary.artifactBytes,
            totalEntries: summary.artifactEntries,
            averageArchiveSizeBytes: totalArchives > 0 ? Math.round(summary.artifactBytes / totalArchives) : 0,
            averageEntriesPerArchive: totalArchives > 0 ? Number((summary.artifactEntries / totalArchives).toFixed(1)) : 0,
            largestArchives,
            largestEntries
        },
        maintenanceSummary: {
            issueHotspots
        },
        artifactCleanupSummary: {
            requestedDir: artifactDir,
            blockedSkillArtifacts,
            staleArtifacts
        },
        releaseSummary,
        baselineSummary,
        operationsSummary: {
            readySkills: skills
                .filter((skill) => skill.readiness === "ready")
                .map((skill) => skill.relativeDir)
                .sort((left, right) => left.localeCompare(right)),
            readyWithWarningsSkills: skills
                .filter((skill) => skill.readiness === "ready-with-warnings")
                .map((skill) => skill.relativeDir)
                .sort((left, right) => left.localeCompare(right)),
            blockedSkills: skills
                .filter((skill) => skill.readiness === "not-ready")
                .map((skill) => skill.relativeDir)
                .sort((left, right) => left.localeCompare(right)),
            skillsWithReleaseChanges: skills
                .filter((skill) => skill.archive?.releaseComparison && !skill.archive.releaseComparison.matches)
                .map((skill) => skill.relativeDir)
                .sort((left, right) => left.localeCompare(right)),
            skillsMissingBaselines: skills
                .filter((skill) => skill.baselineLookup && !skill.baselineLookup.resolvedArchivePath)
                .map((skill) => skill.relativeDir)
                .sort((left, right) => left.localeCompare(right)),
            driftedArtifacts: skills
                .filter((skill) => skill.archive && !skill.archive.comparison.matches)
                .map((skill) => skill.relativeDir)
                .sort((left, right) => left.localeCompare(right)),
            blockedSkillArtifacts: blockedSkillArtifacts.map((artifactPath) => node_path_1.default.relative(artifactDir, artifactPath) || node_path_1.default.basename(artifactPath)),
            staleArtifacts: staleArtifacts.map((artifactPath) => node_path_1.default.relative(artifactDir, artifactPath) || node_path_1.default.basename(artifactPath))
        },
        skills: skills.sort((left, right) => left.relativeDir.localeCompare(right.relativeDir))
    };
}
function buildBatchReviewReport(result) {
    const lines = [];
    lines.push("# SkillForge Batch Review Report");
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
    lines.push(`- Artifacts created: ${result.summary.artifactsCreated}`);
    lines.push(`- Total artifact bytes: ${formatBytes(result.summary.artifactBytes)}`);
    lines.push(`- Total bundled files: ${result.summary.artifactEntries}`);
    if (result.baselineDir) {
        lines.push(`- Baseline directory: \`${result.baselineDir}\``);
        lines.push(`- Baselines compared: ${result.summary.baselineCompared}`);
        lines.push(`- Release changes detected: ${result.summary.releaseChanged}`);
        lines.push(`- Baselines missing: ${result.summary.baselineMissing}`);
    }
    lines.push("");
    lines.push("## Artifact Inventory");
    lines.push("");
    lines.push(`- Archives created: ${result.artifactSummary.totalArchives}`);
    lines.push(`- Total size: ${formatBytes(result.artifactSummary.totalBytes)}`);
    lines.push(`- Average archive size: ${formatBytes(result.artifactSummary.averageArchiveSizeBytes)}`);
    lines.push(`- Average bundled files per archive: ${result.artifactSummary.averageEntriesPerArchive}`);
    if (result.artifactSummary.largestArchives.length > 0) {
        lines.push("", "### Largest Archives");
        for (const archive of result.artifactSummary.largestArchives) {
            lines.push(`- ${archive.relativeDir}: ${formatBytes(archive.archiveSizeBytes)} across ${archive.entryCount} file(s) (\`${archive.archivePath}\`)`);
        }
    }
    if (result.artifactSummary.largestEntries.length > 0) {
        lines.push("", "### Largest Bundled Entries");
        for (const entry of result.artifactSummary.largestEntries) {
            lines.push(`- ${entry.relativeDir}: \`${entry.path}\` (${formatBytes(entry.size)})`);
        }
    }
    if (result.releaseSummary) {
        lines.push("", "## Release Hotspots");
        if (result.releaseSummary.changedPaths.length > 0) {
            lines.push("", "### Most Changed Paths");
            for (const hotspot of result.releaseSummary.changedPaths) {
                lines.push(`- \`${hotspot.path}\`: ${hotspot.count} skill(s), change kinds ${hotspot.changeKinds.join(", ")}, skills ${hotspot.skills.join(", ")}`);
            }
        }
        if (result.releaseSummary.metadataHotspots.length > 0) {
            lines.push("", "### Metadata Churn");
            for (const hotspot of result.releaseSummary.metadataHotspots) {
                lines.push(`- ${hotspot.field}: ${hotspot.count} skill(s) (${hotspot.skills.join(", ")})`);
            }
        }
    }
    if (result.maintenanceSummary.issueHotspots.length > 0) {
        lines.push("", "## Issue Hotspots");
        for (const hotspot of result.maintenanceSummary.issueHotspots) {
            lines.push(`- ${hotspot.code}: ${hotspot.count} issue(s) across ${hotspot.skills.join(", ")}`);
        }
    }
    lines.push("", "## Artifact Cleanup");
    lines.push("");
    lines.push(`- Requested directory: \`${result.artifactCleanupSummary.requestedDir}\``);
    lines.push(`- Blocked skill artifacts: ${result.artifactCleanupSummary.blockedSkillArtifacts.length}`);
    lines.push(`- Stale artifacts: ${result.artifactCleanupSummary.staleArtifacts.length}`);
    if (result.artifactCleanupSummary.blockedSkillArtifacts.length > 0) {
        lines.push("", "### Blocked Skill Artifacts");
        for (const artifactPath of result.artifactCleanupSummary.blockedSkillArtifacts) {
            lines.push(`- \`${artifactPath}\``);
        }
    }
    if (result.artifactCleanupSummary.staleArtifacts.length > 0) {
        lines.push("", "### Stale Artifacts");
        for (const artifactPath of result.artifactCleanupSummary.staleArtifacts) {
            lines.push(`- \`${artifactPath}\``);
        }
    }
    if (result.baselineSummary) {
        lines.push("", "## Baseline Coverage");
        lines.push(`- Requested directory: \`${result.baselineSummary.requestedDir}\``);
        lines.push(`- Compared: ${result.baselineSummary.compared}`);
        lines.push(`- Changed: ${result.baselineSummary.changed}`);
        lines.push(`- Unchanged: ${result.baselineSummary.unchanged}`);
        lines.push(`- Missing baselines: ${result.baselineSummary.missingSkills.length}`);
        lines.push(`- Orphaned baseline archives: ${result.baselineSummary.orphanedArchives.length}`);
        if (result.baselineSummary.missingSkills.length > 0) {
            lines.push("", "### Missing Baselines");
            for (const skill of result.baselineSummary.missingSkills) {
                lines.push(`- ${skill}`);
            }
        }
        if (result.baselineSummary.orphanedArchives.length > 0) {
            lines.push("", "### Orphaned Baselines");
            for (const archive of result.baselineSummary.orphanedArchives) {
                lines.push(`- \`${archive}\``);
            }
        }
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
async function summarizeBaselineCoverage(requestedDir, skills, matchedBaselineArchives) {
    const baselineArchives = await listBaselineArchives(requestedDir);
    const orphanedArchives = baselineArchives.filter((archive) => !matchedBaselineArchives.has(archive));
    return {
        requestedDir,
        compared: skills.filter((skill) => Boolean(skill.archive?.releaseComparison)).length,
        changed: skills.filter((skill) => skill.archive?.releaseComparison && !skill.archive.releaseComparison.matches).length,
        unchanged: skills.filter((skill) => skill.archive?.releaseComparison?.matches).length,
        missingSkills: skills
            .filter((skill) => skill.baselineLookup?.requestedDir && !skill.baselineLookup.resolvedArchivePath)
            .map((skill) => skill.relativeDir)
            .sort((left, right) => left.localeCompare(right)),
        orphanedArchives: orphanedArchives.sort((left, right) => left.localeCompare(right))
    };
}
async function listBaselineArchives(rootDir) {
    if (!(await (0, fs_1.exists)(rootDir))) {
        return [];
    }
    const results = [];
    async function walk(currentDir) {
        const entries = await (0, promises_1.readdir)(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = node_path_1.default.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                await walk(fullPath);
                continue;
            }
            if (entry.isFile() && entry.name.endsWith(".skill")) {
                results.push(node_path_1.default.resolve(fullPath));
            }
        }
    }
    await walk(rootDir);
    return results;
}
async function listStaleReviewArtifacts(artifactDir, activeArtifactPaths, blockedArtifactPaths) {
    if (!(await (0, fs_1.exists)(artifactDir))) {
        return [];
    }
    const entries = await (0, fs_1.listFilesRecursive)(artifactDir);
    return entries
        .filter((entry) => entry.relativePath.endsWith(".skill"))
        .map((entry) => node_path_1.default.resolve(entry.absolutePath))
        .filter((artifactPath) => !activeArtifactPaths.has(artifactPath) && !blockedArtifactPaths.has(artifactPath))
        .sort((left, right) => left.localeCompare(right));
}
async function writeBatchReviewReport(result, reportPath) {
    if (typeof reportPath === "undefined") {
        return undefined;
    }
    const destination = reportPath === true
        ? node_path_1.default.join(result.rootDir, ".skillforge", "review-all.report.md")
        : typeof reportPath === "string"
            ? node_path_1.default.resolve(reportPath)
            : undefined;
    if (!destination) {
        return undefined;
    }
    await (0, fs_1.writeTextFile)(destination, buildBatchReviewReport(result));
    return destination;
}
async function writeBatchReviewIndex(result, indexPath) {
    if (typeof indexPath === "undefined" || indexPath === false) {
        return undefined;
    }
    const destination = indexPath === true
        ? node_path_1.default.join(result.artifactDir, "review-all.index.json")
        : node_path_1.default.resolve(String(indexPath));
    await (0, fs_1.writeTextFile)(destination, JSON.stringify(result, null, 2));
    return destination;
}
async function discoverSkillDirs(rootDir) {
    const results = [];
    const ignored = new Set([".git", "node_modules", "dist", ".skillforge"]);
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
function formatBytes(size) {
    if (size < 1024) {
        return `${size} B`;
    }
    return `${(size / 1024).toFixed(1)} KB`;
}
