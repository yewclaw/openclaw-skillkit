"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInspect = runInspect;
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = require("node:fs/promises");
const workflow_1 = require("../lib/workflow");
const fs_1 = require("../lib/fs");
async function runInspect(archivePath, options) {
    if (options.all) {
        await runBatchInspect(node_path_1.default.resolve(archivePath), options);
        return;
    }
    let inspected = await (0, workflow_1.inspectSkillArchive)(archivePath, {
        entryPath: options.entryPath
    });
    if (options.sourceDir) {
        inspected = await (0, workflow_1.compareArchiveToSource)(archivePath, options.sourceDir, {
            entryPath: options.entryPath
        });
    }
    if (options.baselineArchivePath) {
        const compared = await (0, workflow_1.compareArchives)(archivePath, options.baselineArchivePath, {
            entryPath: options.entryPath
        });
        inspected = {
            ...inspected,
            releaseComparison: compared.releaseComparison
        };
    }
    const reportPath = await (0, workflow_1.writeArchiveReport)(inspected.archivePath, inspected, options.reportPath);
    const trust = (0, workflow_1.summarizeArchiveTrust)(inspected);
    const releaseDelta = (0, workflow_1.summarizeReleaseDelta)(inspected);
    if (options.format === "json") {
        console.log(JSON.stringify({
            archivePath: inspected.archivePath,
            trustSummary: trust,
            releaseDeltaSummary: releaseDelta,
            manifest: inspected.manifest,
            archiveInsights: inspected.archiveInsights,
            entryPreview: inspected.entryPreview,
            reportPath,
            reportMarkdown: (0, workflow_1.buildArchiveReport)(inspected),
            comparison: "comparison" in inspected ? inspected.comparison : undefined,
            releaseComparison: "releaseComparison" in inspected ? inspected.releaseComparison : undefined
        }, null, 2));
        return;
    }
    console.log(`Inspecting ${inspected.archivePath}`);
    console.log(`  Status: ${formatInspectStatus(inspected)}`);
    console.log(`  Trust: ${trust.headline}`);
    console.log(`  Skill: ${inspected.manifest.skill.name}@${inspected.manifest.skill.version}`);
    console.log(`  Description: ${inspected.manifest.skill.description}`);
    console.log(`  Confidence: ${trust.confidence}`);
    console.log(`  Checks: ${trust.checks
        .map((check) => `${formatAssessment(check.status)} ${check.label.toLowerCase()} (${check.detail})`)
        .join("; ")}`);
    console.log(`  Entries: ${inspected.manifest.entryCount} bundled file(s), ${(0, workflow_1.formatBytes)(inspected.manifest.totalBytes)} before manifest.`);
    console.log(`  Contents: ${inspected.manifest.entries
        .map((entry) => `${entry.path} (${(0, workflow_1.formatBytes)(entry.size)})`)
        .join(", ")}`);
    if (inspected.archiveInsights) {
        console.log(`  Layout: ${inspected.archiveInsights.groups
            .map((group) => `${group.label} ${group.fileCount} file(s), ${(0, workflow_1.formatBytes)(group.totalBytes)}`)
            .join("; ")}`);
        console.log(`  Largest: ${inspected.archiveInsights.largestEntries
            .map((entry) => `${entry.path} (${(0, workflow_1.formatBytes)(entry.size)})`)
            .join(", ")}`);
    }
    if (hasComparison(inspected)) {
        const { comparison } = inspected;
        console.log(`  Source: ${comparison.sourceDir}`);
        console.log(`  Comparison: ${comparison.matches ? "matches source" : "drift detected"} (${comparison.matchedEntries}/${comparison.entryCount} archive entries unchanged).`);
        if (comparison.metadataDifferences.length > 0) {
            console.log(`  Metadata drift: ${comparison.metadataDifferences
                .map((difference) => `${difference.field} archive="${difference.archiveValue}" source="${difference.sourceValue}"`)
                .join("; ")}`);
        }
        if (comparison.changedEntries.length > 0) {
            console.log(`  Changed: ${comparison.changedEntries
                .map((entry) => `${entry.path} (${entry.reason}, archive ${(0, workflow_1.formatBytes)(entry.archiveSize)}, source ${(0, workflow_1.formatBytes)(entry.sourceSize)})`)
                .join(", ")}`);
        }
        if (comparison.missingFromSource.length > 0) {
            console.log(`  Missing from source: ${comparison.missingFromSource.join(", ")}`);
        }
        if (comparison.extraSourceEntries.length > 0) {
            console.log(`  New in source: ${comparison.extraSourceEntries.join(", ")}`);
        }
    }
    if (hasReleaseComparison(inspected)) {
        const { releaseComparison } = inspected;
        console.log(`  Release delta: ${releaseDelta.headline}`);
        console.log(`  Baseline archive: ${releaseComparison.baselineArchivePath}`);
        console.log(`  Delta: ${releaseComparison.matches ? "matches baseline archive" : "release changed"} (${releaseComparison.matchedEntries}/${releaseComparison.baselineEntryCount} baseline entries unchanged).`);
        if (releaseComparison.metadataDifferences.length > 0) {
            console.log(`  Metadata changes: ${releaseComparison.metadataDifferences
                .map((difference) => `${difference.field} current="${difference.currentValue}" baseline="${difference.baselineValue}"`)
                .join("; ")}`);
        }
        if (releaseComparison.changedEntries.length > 0) {
            console.log(`  Changed since baseline: ${releaseComparison.changedEntries
                .map((entry) => `${entry.path} (${entry.reason}, current ${(0, workflow_1.formatBytes)(entry.currentSize)}, baseline ${(0, workflow_1.formatBytes)(entry.baselineSize)})`)
                .join(", ")}`);
        }
        if (releaseComparison.addedEntries.length > 0) {
            console.log(`  Added since baseline: ${releaseComparison.addedEntries.join(", ")}`);
        }
        if (releaseComparison.removedEntries.length > 0) {
            console.log(`  Removed since baseline: ${releaseComparison.removedEntries.join(", ")}`);
        }
    }
    if (!hasComparison(inspected)) {
        console.log(`  Next: run skillforge inspect ${inspected.archivePath} --source ./path-to-skill to check for drift.`);
    }
    if (!hasReleaseComparison(inspected)) {
        console.log(`  Release history: run skillforge inspect ${inspected.archivePath} --against ./previous-release.skill to compare against a prior artifact.`);
    }
    if (inspected.entryPreview) {
        console.log(`  Entry preview: ${inspected.entryPreview.path} (${inspected.entryPreview.text ? "text" : "binary"})`);
        console.log(inspected.entryPreview.preview);
    }
    else {
        console.log(`  Entry preview: run skillforge inspect ${inspected.archivePath} --entry SKILL.md to inspect a bundled file.`);
    }
    if (reportPath) {
        console.log(`  Report: ${reportPath}`);
    }
}
async function runBatchInspect(rootDir, options) {
    const archivePaths = await discoverArchivePaths(rootDir);
    if (archivePaths.length === 0) {
        process.exitCode = 1;
        if (options.format === "json") {
            console.log(JSON.stringify({
                rootDir,
                summary: {
                    totalBytes: 0,
                    totalEntries: 0,
                    baselineCompared: 0,
                    releaseChanged: 0,
                    baselineMissing: 0,
                    duplicateCoordinates: 0,
                    multiVersionSkills: 0
                },
                archives: [],
                issues: [
                    {
                        level: "error",
                        code: "no-archives-found",
                        file: ".",
                        message: "No .skill archives were found under the target directory.",
                        suggestion: 'Point inspect at a release artifact directory or run "skillforge review <dir> --all" first.'
                    }
                ]
            }, null, 2));
            return;
        }
        console.log(`Inspecting all archives under ${rootDir}`);
        console.log("Status: NO ARCHIVES");
        console.log("Summary: no .skill archives were found.");
        console.log("Next:");
        console.log("  1. Point inspect at a directory containing packaged .skill files.");
        console.log(`  2. Re-run: skillforge inspect ${rootDir} --all`);
        return;
    }
    const archives = [];
    const matchedBaselineArchives = new Set();
    for (const archivePath of archivePaths) {
        const inspected = await (0, workflow_1.inspectSkillArchive)(archivePath);
        const archiveStat = await (0, promises_1.stat)(archivePath);
        const relativePath = node_path_1.default.relative(rootDir, archivePath) || node_path_1.default.basename(archivePath);
        const baselineLookup = await resolveBatchBaselineArchive(options.baselineDir, relativePath, inspected.manifest.skill.name);
        const compared = baselineLookup?.resolvedArchivePath
            ? await (0, workflow_1.compareArchives)(archivePath, baselineLookup.resolvedArchivePath)
            : undefined;
        if (compared?.releaseComparison) {
            matchedBaselineArchives.add(node_path_1.default.resolve(compared.releaseComparison.baselineArchivePath));
        }
        archives.push({
            archivePath: inspected.archivePath,
            relativePath,
            skill: inspected.manifest.skill,
            archiveSizeBytes: archiveStat.size,
            archiveSizeLabel: (0, workflow_1.formatBytes)(archiveStat.size),
            entryCount: inspected.manifest.entryCount,
            totalBytes: inspected.manifest.totalBytes,
            groups: inspected.archiveInsights?.groups ?? [],
            largestEntries: inspected.archiveInsights?.largestEntries ?? [],
            entryPaths: inspected.manifest.entries.map((entry) => entry.path),
            baselineLookup,
            releaseComparison: compared?.releaseComparison
                ? {
                    baselineArchivePath: compared.releaseComparison.baselineArchivePath,
                    matches: compared.releaseComparison.matches,
                    matchedEntries: compared.releaseComparison.matchedEntries,
                    baselineEntryCount: compared.releaseComparison.baselineEntryCount,
                    addedEntries: compared.releaseComparison.addedEntries,
                    removedEntries: compared.releaseComparison.removedEntries,
                    changedEntries: compared.releaseComparison.changedEntries.map((entry) => ({
                        path: entry.path,
                        reason: entry.reason
                    })),
                    metadataDifferences: compared.releaseComparison.metadataDifferences.map((difference) => ({
                        field: difference.field
                    }))
                }
                : undefined
        });
    }
    const result = await summarizeBatchInspect(rootDir, options.baselineDir, archives, matchedBaselineArchives);
    const reportPath = await writeBatchInspectReport(result, options.reportPath);
    const reportMarkdown = buildBatchInspectReport(result);
    if (options.format === "json") {
        console.log(JSON.stringify({
            rootDir: result.rootDir,
            baselineDir: result.baselineDir,
            archiveCount: result.archiveCount,
            summary: result.summary,
            inventorySummary: result.inventorySummary,
            identitySummary: result.identitySummary,
            releaseSummary: result.releaseSummary,
            baselineSummary: result.baselineSummary,
            reportPath,
            reportMarkdown,
            archives: result.archives
        }, null, 2));
        return;
    }
    console.log(`Inspecting all archives under ${result.rootDir}`);
    console.log(`Discovered: ${result.archiveCount} archive(s)`);
    console.log(`Summary: ${(0, workflow_1.formatBytes)(result.summary.totalBytes)} across ${result.summary.totalEntries} bundled file(s) in ${result.archiveCount} archive(s).`);
    console.log(`Identity: ${result.summary.duplicateCoordinates} duplicate release coordinate(s), ${result.summary.multiVersionSkills} skill(s) with multiple versions.`);
    if (result.baselineDir) {
        console.log(`Baselines: compared ${result.summary.baselineCompared}, changed ${result.summary.releaseChanged}, missing ${result.summary.baselineMissing}.`);
    }
    for (const archive of result.archives) {
        console.log(`  ARCHIVE ${archive.relativePath}: ${archive.skill.name}@${archive.skill.version}, ${archive.entryCount} file(s), ${archive.archiveSizeLabel}`);
        if (archive.baselineLookup?.requestedDir) {
            if (archive.releaseComparison) {
                console.log(`    Release delta: ${archive.releaseComparison.matches ? "matches baseline archive" : "release changed"} (${archive.releaseComparison.matchedEntries}/${archive.releaseComparison.baselineEntryCount} baseline entries unchanged).`);
            }
            else if (archive.baselineLookup.resolvedArchivePath) {
                console.log(`    Baseline archive: ${archive.baselineLookup.resolvedArchivePath}`);
            }
            else {
                console.log(`    Baseline archive: not found under ${archive.baselineLookup.requestedDir}`);
            }
        }
    }
    if (result.inventorySummary.largestArchives.length > 0) {
        console.log("Largest archives:");
        for (const archive of result.inventorySummary.largestArchives) {
            console.log(`  ${archive.relativePath}: ${(0, workflow_1.formatBytes)(archive.archiveSizeBytes)} across ${archive.entryCount} file(s)`);
        }
    }
    if (result.identitySummary.duplicateCoordinates.length > 0) {
        console.log("Duplicate releases:");
        for (const duplicate of result.identitySummary.duplicateCoordinates) {
            console.log(`  ${duplicate.name}@${duplicate.version}: ${duplicate.archives.join(", ")}`);
        }
    }
    if (result.identitySummary.multiVersionSkills.length > 0) {
        console.log("Version spread:");
        for (const entry of result.identitySummary.multiVersionSkills) {
            console.log(`  ${entry.name}: ${entry.versions.join(", ")}`);
        }
    }
    if (result.inventorySummary.commonEntries.length > 0) {
        console.log("Common bundled paths:");
        for (const entry of result.inventorySummary.commonEntries) {
            console.log(`  ${entry.path}: ${entry.archiveCount} archive(s)`);
        }
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
}
async function summarizeBatchInspect(rootDir, baselineDir, archives, matchedBaselineArchives) {
    const totalBytes = archives.reduce((sum, archive) => sum + archive.archiveSizeBytes, 0);
    const totalEntries = archives.reduce((sum, archive) => sum + archive.entryCount, 0);
    const duplicateCoordinates = collectDuplicateCoordinates(archives);
    const multiVersionSkills = collectMultiVersionSkills(archives);
    const entryCounts = new Map();
    const largestEntries = archives
        .flatMap((archive) => archive.largestEntries.map((entry) => ({
        relativePath: archive.relativePath,
        path: entry.path,
        size: entry.size
    })))
        .sort((left, right) => right.size - left.size || left.path.localeCompare(right.path))
        .slice(0, 5);
    for (const archive of archives) {
        for (const entryPath of archive.entryPaths) {
            const current = entryCounts.get(entryPath) ?? { count: 0, archives: new Set() };
            current.count += 1;
            current.archives.add(archive.relativePath);
            entryCounts.set(entryPath, current);
        }
    }
    const changedPathCounts = new Map();
    const metadataCounts = new Map();
    let baselineCompared = 0;
    let releaseChanged = 0;
    let baselineMissing = 0;
    for (const archive of archives) {
        if (archive.releaseComparison) {
            baselineCompared += 1;
            if (!archive.releaseComparison.matches) {
                releaseChanged += 1;
            }
            for (const entry of archive.releaseComparison.changedEntries) {
                const current = changedPathCounts.get(entry.path) ?? {
                    count: 0,
                    changeKinds: new Set(),
                    archives: new Set()
                };
                current.count += 1;
                current.changeKinds.add(entry.reason);
                current.archives.add(archive.relativePath);
                changedPathCounts.set(entry.path, current);
            }
            for (const entry of archive.releaseComparison.addedEntries) {
                const current = changedPathCounts.get(entry) ?? {
                    count: 0,
                    changeKinds: new Set(),
                    archives: new Set()
                };
                current.count += 1;
                current.changeKinds.add("added");
                current.archives.add(archive.relativePath);
                changedPathCounts.set(entry, current);
            }
            for (const entry of archive.releaseComparison.removedEntries) {
                const current = changedPathCounts.get(entry) ?? {
                    count: 0,
                    changeKinds: new Set(),
                    archives: new Set()
                };
                current.count += 1;
                current.changeKinds.add("removed");
                current.archives.add(archive.relativePath);
                changedPathCounts.set(entry, current);
            }
            for (const difference of archive.releaseComparison.metadataDifferences) {
                const current = metadataCounts.get(difference.field) ?? { count: 0, archives: new Set() };
                current.count += 1;
                current.archives.add(archive.relativePath);
                metadataCounts.set(difference.field, current);
            }
        }
        else if (baselineDir && archive.baselineLookup && !archive.baselineLookup.resolvedArchivePath) {
            baselineMissing += 1;
        }
    }
    return {
        rootDir,
        baselineDir: baselineDir ? node_path_1.default.resolve(baselineDir) : undefined,
        archiveCount: archives.length,
        summary: {
            totalBytes,
            totalEntries,
            baselineCompared,
            releaseChanged,
            baselineMissing,
            duplicateCoordinates: duplicateCoordinates.length,
            multiVersionSkills: multiVersionSkills.length
        },
        inventorySummary: {
            largestArchives: archives
                .map((archive) => ({
                relativePath: archive.relativePath,
                archivePath: archive.archivePath,
                archiveSizeBytes: archive.archiveSizeBytes,
                entryCount: archive.entryCount
            }))
                .sort((left, right) => right.archiveSizeBytes - left.archiveSizeBytes || left.relativePath.localeCompare(right.relativePath))
                .slice(0, 5),
            largestEntries,
            commonEntries: [...entryCounts.entries()]
                .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
                .slice(0, 10)
                .map(([entryPath, value]) => ({
                path: entryPath,
                archiveCount: value.count,
                archives: [...value.archives].sort((left, right) => left.localeCompare(right))
            }))
        },
        identitySummary: {
            duplicateCoordinates,
            multiVersionSkills
        },
        releaseSummary: baselineDir
            ? {
                changedPaths: [...changedPathCounts.entries()]
                    .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
                    .slice(0, 10)
                    .map(([entryPath, value]) => ({
                    path: entryPath,
                    count: value.count,
                    changeKinds: [...value.changeKinds].sort((left, right) => left.localeCompare(right)),
                    archives: [...value.archives].sort((left, right) => left.localeCompare(right))
                })),
                metadataHotspots: [...metadataCounts.entries()]
                    .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
                    .map(([field, value]) => ({
                    field,
                    count: value.count,
                    archives: [...value.archives].sort((left, right) => left.localeCompare(right))
                }))
            }
            : undefined,
        baselineSummary: baselineDir
            ? await summarizeBaselineCoverage(node_path_1.default.resolve(baselineDir), archives, matchedBaselineArchives)
            : undefined,
        archives: archives.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
    };
}
function buildBatchInspectReport(result) {
    const lines = [];
    lines.push("# SkillForge Batch Inspect Report");
    lines.push("");
    lines.push(`- Root: \`${result.rootDir}\``);
    lines.push(`- Archives: ${result.archiveCount}`);
    lines.push(`- Total archive bytes: ${(0, workflow_1.formatBytes)(result.summary.totalBytes)}`);
    lines.push(`- Total bundled files: ${result.summary.totalEntries}`);
    lines.push(`- Duplicate release coordinates: ${result.summary.duplicateCoordinates}`);
    lines.push(`- Skills with multiple versions: ${result.summary.multiVersionSkills}`);
    if (result.baselineDir) {
        lines.push(`- Baseline directory: \`${result.baselineDir}\``);
        lines.push(`- Baselines compared: ${result.summary.baselineCompared}`);
        lines.push(`- Release changes detected: ${result.summary.releaseChanged}`);
        lines.push(`- Baselines missing: ${result.summary.baselineMissing}`);
    }
    lines.push("");
    lines.push("## Artifact Inventory");
    lines.push("");
    if (result.inventorySummary.largestArchives.length > 0) {
        lines.push("### Largest Archives");
        for (const archive of result.inventorySummary.largestArchives) {
            lines.push(`- ${archive.relativePath}: ${(0, workflow_1.formatBytes)(archive.archiveSizeBytes)} across ${archive.entryCount} file(s) (\`${archive.archivePath}\`)`);
        }
    }
    if (result.inventorySummary.largestEntries.length > 0) {
        lines.push("", "### Largest Bundled Entries");
        for (const entry of result.inventorySummary.largestEntries) {
            lines.push(`- ${entry.relativePath}: \`${entry.path}\` (${(0, workflow_1.formatBytes)(entry.size)})`);
        }
    }
    if (result.inventorySummary.commonEntries.length > 0) {
        lines.push("", "### Common Bundled Paths");
        for (const entry of result.inventorySummary.commonEntries) {
            lines.push(`- \`${entry.path}\`: ${entry.archiveCount} archive(s) (${entry.archives.join(", ")})`);
        }
    }
    lines.push("", "## Identity Hotspots");
    if (result.identitySummary.duplicateCoordinates.length > 0) {
        lines.push("", "### Duplicate Releases");
        for (const entry of result.identitySummary.duplicateCoordinates) {
            lines.push(`- ${entry.name}@${entry.version}: ${entry.count} archive(s) (${entry.archives.join(", ")})`);
        }
    }
    else {
        lines.push("", "- No duplicate release coordinates detected.");
    }
    if (result.identitySummary.multiVersionSkills.length > 0) {
        lines.push("", "### Version Spread");
        for (const entry of result.identitySummary.multiVersionSkills) {
            lines.push(`- ${entry.name}: versions ${entry.versions.join(", ")} (${entry.archives.join(", ")})`);
        }
    }
    else {
        lines.push("", "- No skill names span multiple versions in this archive set.");
    }
    if (result.releaseSummary) {
        lines.push("", "## Release Hotspots");
        if (result.releaseSummary.changedPaths.length > 0) {
            lines.push("", "### Most Changed Paths");
            for (const hotspot of result.releaseSummary.changedPaths) {
                lines.push(`- \`${hotspot.path}\`: ${hotspot.count} archive(s), change kinds ${hotspot.changeKinds.join(", ")}, archives ${hotspot.archives.join(", ")}`);
            }
        }
        if (result.releaseSummary.metadataHotspots.length > 0) {
            lines.push("", "### Metadata Churn");
            for (const hotspot of result.releaseSummary.metadataHotspots) {
                lines.push(`- ${hotspot.field}: ${hotspot.count} archive(s) (${hotspot.archives.join(", ")})`);
            }
        }
    }
    if (result.baselineSummary) {
        lines.push("", "## Baseline Coverage");
        lines.push(`- Requested directory: \`${result.baselineSummary.requestedDir}\``);
        lines.push(`- Compared: ${result.baselineSummary.compared}`);
        lines.push(`- Changed: ${result.baselineSummary.changed}`);
        lines.push(`- Unchanged: ${result.baselineSummary.unchanged}`);
        lines.push(`- Missing baselines: ${result.baselineSummary.missingArchives.length}`);
        lines.push(`- Orphaned baseline archives: ${result.baselineSummary.orphanedArchives.length}`);
        if (result.baselineSummary.missingArchives.length > 0) {
            lines.push("", "### Missing Baselines");
            for (const archive of result.baselineSummary.missingArchives) {
                lines.push(`- ${archive}`);
            }
        }
        if (result.baselineSummary.orphanedArchives.length > 0) {
            lines.push("", "### Orphaned Baselines");
            for (const archive of result.baselineSummary.orphanedArchives) {
                lines.push(`- \`${archive}\``);
            }
        }
    }
    lines.push("", "## Archives", "");
    for (const archive of result.archives) {
        lines.push(`### ${archive.relativePath}`);
        lines.push("");
        lines.push(`- Skill: ${archive.skill.name}@${archive.skill.version}`);
        lines.push(`- Description: ${archive.skill.description}`);
        lines.push(`- Archive size: ${archive.archiveSizeLabel}`);
        lines.push(`- Bundled files: ${archive.entryCount}`);
        if (archive.groups.length > 0) {
            lines.push(`- Layout: ${archive.groups.map((group) => `${group.label} ${group.fileCount} file(s)`).join("; ")}`);
        }
        if (archive.releaseComparison) {
            lines.push(`- Release delta: ${archive.releaseComparison.matches ? "matches baseline archive" : "release changed"} (${archive.releaseComparison.matchedEntries}/${archive.releaseComparison.baselineEntryCount} baseline entries matched)`);
        }
        else if (archive.baselineLookup?.requestedDir) {
            lines.push(`- Baseline archive: ${archive.baselineLookup.resolvedArchivePath ? `\`${archive.baselineLookup.resolvedArchivePath}\`` : `not found under \`${archive.baselineLookup.requestedDir}\``}`);
        }
        lines.push("");
    }
    return lines.join("\n");
}
async function summarizeBaselineCoverage(requestedDir, archives, matchedBaselineArchives) {
    const baselineArchives = await listSkillArchives(requestedDir);
    const orphanedArchives = baselineArchives.filter((archive) => !matchedBaselineArchives.has(archive));
    return {
        requestedDir,
        compared: archives.filter((archive) => Boolean(archive.releaseComparison)).length,
        changed: archives.filter((archive) => archive.releaseComparison && !archive.releaseComparison.matches).length,
        unchanged: archives.filter((archive) => archive.releaseComparison?.matches).length,
        missingArchives: archives
            .filter((archive) => archive.baselineLookup?.requestedDir && !archive.baselineLookup.resolvedArchivePath)
            .map((archive) => archive.relativePath)
            .sort((left, right) => left.localeCompare(right)),
        orphanedArchives: orphanedArchives.sort((left, right) => left.localeCompare(right))
    };
}
async function discoverArchivePaths(rootDir) {
    const archivePaths = await listSkillArchives(rootDir);
    return archivePaths.sort((left, right) => left.localeCompare(right));
}
async function listSkillArchives(rootDir) {
    if (!(await (0, fs_1.exists)(rootDir))) {
        return [];
    }
    const results = [];
    const ignored = new Set([".git", "node_modules"]);
    async function walk(currentDir) {
        const entries = await (0, promises_1.readdir)(currentDir, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = node_path_1.default.join(currentDir, entry.name);
            if (entry.isDirectory()) {
                if (!ignored.has(entry.name)) {
                    await walk(fullPath);
                }
                continue;
            }
            if (entry.isFile() && entry.name.endsWith(".skill")) {
                results.push(node_path_1.default.resolve(fullPath));
            }
        }
    }
    const rootStat = await (0, promises_1.stat)(rootDir);
    if (rootStat.isFile() && rootDir.endsWith(".skill")) {
        return [node_path_1.default.resolve(rootDir)];
    }
    if (rootStat.isFile()) {
        return [];
    }
    await walk(rootDir);
    return results;
}
function collectDuplicateCoordinates(archives) {
    const grouped = new Map();
    for (const archive of archives) {
        const key = `${archive.skill.name}@${archive.skill.version}`;
        const current = grouped.get(key) ?? {
            name: archive.skill.name,
            version: archive.skill.version,
            archives: []
        };
        current.archives.push(archive.relativePath);
        grouped.set(key, current);
    }
    return [...grouped.values()]
        .filter((entry) => entry.archives.length > 1)
        .sort((left, right) => right.archives.length - left.archives.length || left.name.localeCompare(right.name))
        .map((entry) => ({
        name: entry.name,
        version: entry.version,
        count: entry.archives.length,
        archives: entry.archives.sort((left, right) => left.localeCompare(right))
    }));
}
function collectMultiVersionSkills(archives) {
    const grouped = new Map();
    for (const archive of archives) {
        const current = grouped.get(archive.skill.name) ?? { versions: new Set(), archives: new Set() };
        current.versions.add(archive.skill.version);
        current.archives.add(archive.relativePath);
        grouped.set(archive.skill.name, current);
    }
    return [...grouped.entries()]
        .filter(([, value]) => value.versions.size > 1)
        .sort((left, right) => right[1].versions.size - left[1].versions.size || left[0].localeCompare(right[0]))
        .map(([name, value]) => ({
        name,
        versions: [...value.versions].sort((left, right) => left.localeCompare(right)),
        archives: [...value.archives].sort((left, right) => left.localeCompare(right))
    }));
}
async function writeBatchInspectReport(result, reportPath) {
    if (typeof reportPath === "undefined") {
        return undefined;
    }
    const destination = reportPath === true
        ? node_path_1.default.join(result.rootDir, ".skillforge", "inspect-all.report.md")
        : typeof reportPath === "string"
            ? node_path_1.default.resolve(reportPath)
            : undefined;
    if (!destination) {
        return undefined;
    }
    await (0, fs_1.writeTextFile)(destination, buildBatchInspectReport(result));
    return destination;
}
async function resolveBatchBaselineArchive(baselineDir, relativePath, name) {
    if (!baselineDir) {
        return undefined;
    }
    const requestedDir = node_path_1.default.resolve(baselineDir);
    const candidateRelative = relativePath === "." ? "root.skill" : relativePath;
    const candidates = [node_path_1.default.join(requestedDir, candidateRelative), node_path_1.default.join(requestedDir, `${name}.skill`)];
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
function hasComparison(value) {
    return Boolean(value.comparison);
}
function hasReleaseComparison(value) {
    return Boolean(value.releaseComparison);
}
function formatInspectStatus(result) {
    if (!result.comparison) {
        return "ARCHIVE VERIFIED";
    }
    return result.comparison.matches ? "ARCHIVE MATCHES SOURCE" : "DRIFT DETECTED";
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
