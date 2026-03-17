"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInspect = runInspect;
const workflow_1 = require("../lib/workflow");
async function runInspect(archivePath, options) {
    const inspected = options.sourceDir
        ? await (0, workflow_1.compareArchiveToSource)(archivePath, options.sourceDir)
        : await (0, workflow_1.inspectSkillArchive)(archivePath);
    const reportPath = await (0, workflow_1.writeArchiveReport)(inspected.archivePath, inspected, options.reportPath);
    const trust = (0, workflow_1.summarizeArchiveTrust)(inspected);
    if (options.format === "json") {
        console.log(JSON.stringify({
            archivePath: inspected.archivePath,
            trustSummary: trust,
            manifest: inspected.manifest,
            reportPath,
            reportMarkdown: (0, workflow_1.buildArchiveReport)(inspected),
            comparison: "comparison" in inspected ? inspected.comparison : undefined
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
    if (!hasComparison(inspected)) {
        console.log(`  Next: run openclaw-skillkit inspect ${inspected.archivePath} --source ./path-to-skill to check for drift.`);
    }
    if (reportPath) {
        console.log(`  Report: ${reportPath}`);
    }
}
function hasComparison(value) {
    return Boolean(value.comparison);
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
