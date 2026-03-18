"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runIndex = runIndex;
const node_path_1 = __importDefault(require("node:path"));
const fs_1 = require("../lib/fs");
async function runIndex(indexPath, options) {
    const resolvedIndexPath = node_path_1.default.resolve(indexPath);
    const payload = JSON.parse(await (0, fs_1.readTextFile)(resolvedIndexPath));
    const detectedType = detectIndexType(payload);
    const limit = options.limit ?? 10;
    if (options.plain && !options.listName) {
        throw new Error("index --plain requires --list so the output stays unambiguous for scripts.");
    }
    const summary = detectedType === "review"
        ? buildReviewSummary(payload)
        : buildInspectSummary(payload);
    const actionGroups = detectedType === "review"
        ? buildReviewActionGroups(payload)
        : buildInspectActionGroups(payload);
    const selectedGroup = selectActionGroup(actionGroups, options.listName);
    if (options.format === "json") {
        console.log(JSON.stringify({
            indexPath: resolvedIndexPath,
            type: detectedType,
            summary,
            availableLists: actionGroups.map((group) => ({
                name: group.name,
                label: group.label,
                description: group.description,
                count: group.items.length
            })),
            selectedList: selectedGroup
                ? {
                    name: selectedGroup.name,
                    label: selectedGroup.label,
                    description: selectedGroup.description,
                    count: selectedGroup.items.length,
                    items: selectedGroup.items.slice(0, limit),
                    truncated: selectedGroup.items.length > limit
                }
                : undefined
        }, null, 2));
        return;
    }
    if (selectedGroup && options.plain) {
        for (const item of selectedGroup.items.slice(0, limit)) {
            console.log(item);
        }
        return;
    }
    console.log(`Index: ${resolvedIndexPath}`);
    console.log(`Type: ${summary.headline}`);
    console.log(`Status: ${summary.status}`);
    console.log(`Root: ${summary.rootDir}`);
    if (summary.artifactDir) {
        console.log(`Artifacts: ${summary.artifactDir}`);
    }
    console.log(`${summary.countLabel}: ${summary.itemCount}`);
    console.log(`Summary: ${summary.stats.map((entry) => `${entry.label} ${entry.value}`).join(", ")}.`);
    if (summary.hotspots.length > 0) {
        console.log(`Hotspots: ${summary.hotspots.join(", ")}`);
    }
    if (selectedGroup) {
        printActionGroup(selectedGroup, limit);
        return;
    }
    const groupsToPrint = actionGroups.filter((group) => group.items.length > 0).slice(0, 5);
    if (groupsToPrint.length === 0) {
        console.log("Actions: no current action items recorded in this index.");
        return;
    }
    console.log("Actions:");
    for (const group of groupsToPrint) {
        const preview = group.items.slice(0, Math.min(limit, 5));
        const suffix = group.items.length > preview.length ? ` (+${group.items.length - preview.length} more)` : "";
        console.log(`  ${group.name} (${group.items.length}): ${preview.join(", ")}${suffix}`);
    }
}
function printActionGroup(group, limit) {
    console.log(`${group.label}: ${group.items.length}`);
    if (group.items.length === 0) {
        console.log("  none");
        return;
    }
    for (const item of group.items.slice(0, limit)) {
        console.log(`  - ${item}`);
    }
    if (group.items.length > limit) {
        console.log(`  ... ${group.items.length - limit} more`);
    }
}
function selectActionGroup(groups, listName) {
    if (!listName) {
        return undefined;
    }
    const selected = groups.find((group) => group.name === listName);
    if (selected) {
        return selected;
    }
    throw new Error(`Unknown action group "${listName}". Available groups: ${groups.map((group) => group.name).join(", ")}.`);
}
function detectIndexType(payload) {
    if (isReviewIndex(payload)) {
        return "review";
    }
    if (isInspectIndex(payload)) {
        return "inspect";
    }
    throw new Error("index requires a persisted batch inspect/review JSON index produced by SkillForge.");
}
function isReviewIndex(payload) {
    if (!payload || typeof payload !== "object") {
        return false;
    }
    const candidate = payload;
    return typeof candidate.rootDir === "string" && typeof candidate.artifactDir === "string" && Array.isArray(candidate.operationsSummary?.readySkills);
}
function isInspectIndex(payload) {
    if (!payload || typeof payload !== "object") {
        return false;
    }
    const candidate = payload;
    return typeof candidate.rootDir === "string" && typeof candidate.archiveCount === "number" && Array.isArray(candidate.operationsSummary?.duplicateReleaseCoordinates);
}
function buildReviewSummary(index) {
    return {
        headline: "batch review index",
        status: index.summary.notReady > 0
            ? "NOT READY"
            : index.summary.readyWithWarnings > 0
                ? "READY WITH WARNINGS"
                : "READY TO SHIP",
        rootDir: index.rootDir,
        artifactDir: index.artifactDir,
        itemCount: index.skillCount,
        countLabel: "Skills",
        stats: [
            { label: "ready", value: index.summary.ready },
            { label: "warnings", value: index.summary.readyWithWarnings },
            { label: "blocked", value: index.summary.notReady },
            { label: "release changes", value: index.summary.releaseChanged },
            { label: "drifted artifacts", value: index.summary.archiveDrift },
            { label: "missing baselines", value: index.summary.baselineMissing }
        ],
        hotspots: (index.maintenanceSummary?.issueHotspots ?? [])
            .slice(0, 3)
            .map((entry) => `${entry.code} (${entry.count})`)
    };
}
function buildInspectSummary(index) {
    return {
        headline: "batch inspect index",
        status: index.summary.releaseChanged > 0 || index.summary.baselineMissing > 0
            ? "RELEASE CHANGES DETECTED"
            : index.summary.duplicateCoordinates > 0 || index.summary.multiVersionSkills > 0
                ? "IDENTITY HOTSPOTS DETECTED"
                : "ARCHIVES LOOK CLEAN",
        rootDir: index.rootDir,
        itemCount: index.archiveCount,
        countLabel: "Archives",
        stats: [
            { label: "release changes", value: index.summary.releaseChanged },
            { label: "missing baselines", value: index.summary.baselineMissing },
            { label: "duplicate releases", value: index.summary.duplicateCoordinates },
            { label: "version spread", value: index.summary.multiVersionSkills }
        ],
        hotspots: [
            `${index.operationsSummary.duplicateReleaseCoordinates.length} duplicate release coordinate(s)`,
            `${index.operationsSummary.skillsWithVersionSpread.length} skill(s) with version spread`
        ]
    };
}
function buildReviewActionGroups(index) {
    return [
        {
            name: "blocked-skills",
            label: "Blocked Skills",
            description: "Skill directories that are not ready to ship.",
            items: sortStrings(index.operationsSummary.blockedSkills)
        },
        {
            name: "ready-with-warnings",
            label: "Ready With Warnings",
            description: "Skill directories that can ship but still carry warnings.",
            items: sortStrings(index.operationsSummary.readyWithWarningsSkills)
        },
        {
            name: "ready-skills",
            label: "Ready Skills",
            description: "Skill directories that are ready to ship.",
            items: sortStrings(index.operationsSummary.readySkills)
        },
        {
            name: "release-changes",
            label: "Skills With Release Changes",
            description: "Skills whose new artifacts differ from the matched baseline archive.",
            items: sortStrings(index.operationsSummary.skillsWithReleaseChanges)
        },
        {
            name: "missing-baselines",
            label: "Skills Missing Baselines",
            description: "Skills that did not find a matching baseline archive.",
            items: sortStrings(index.operationsSummary.skillsMissingBaselines)
        },
        {
            name: "drifted-artifacts",
            label: "Drifted Artifacts",
            description: "Packaged review artifacts that no longer match source contents.",
            items: sortStrings(index.operationsSummary.driftedArtifacts)
        },
        {
            name: "orphaned-baselines",
            label: "Orphaned Baselines",
            description: "Baseline archives that were not matched by any reviewed skill.",
            items: sortStrings(index.baselineSummary?.orphanedArchives ?? [])
        }
    ];
}
function buildInspectActionGroups(index) {
    return [
        {
            name: "release-changes",
            label: "Archives With Release Changes",
            description: "Archives that differ from their matched baseline archive.",
            items: sortStrings(index.operationsSummary.archivesWithReleaseChanges)
        },
        {
            name: "missing-baselines",
            label: "Archives Missing Baselines",
            description: "Archives that did not find a matching baseline archive.",
            items: sortStrings(index.operationsSummary.archivesMissingBaselines)
        },
        {
            name: "duplicate-release-coordinates",
            label: "Duplicate Release Coordinates",
            description: "Duplicate name@version release coordinates found in the archive set.",
            items: sortStrings(index.operationsSummary.duplicateReleaseCoordinates)
        },
        {
            name: "version-spread",
            label: "Skills With Version Spread",
            description: "Skills that appear at multiple versions in the same archive set.",
            items: sortStrings(index.operationsSummary.skillsWithVersionSpread)
        },
        {
            name: "orphaned-baselines",
            label: "Orphaned Baselines",
            description: "Baseline archives that were not matched by any inspected archive.",
            items: sortStrings(index.baselineSummary?.orphanedArchives ?? [])
        }
    ];
}
function sortStrings(values) {
    return values.slice().sort((left, right) => left.localeCompare(right));
}
