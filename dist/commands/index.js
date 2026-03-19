"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runIndex = runIndex;
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = require("node:fs/promises");
const fs_1 = require("../lib/fs");
const fs_2 = require("../lib/fs");
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
    const commandGroups = detectedType === "review"
        ? buildReviewCommandGroups(payload)
        : buildInspectCommandGroups(payload);
    const operationGroups = detectedType === "review"
        ? buildReviewOperationGroups(payload)
        : buildInspectOperationGroups(payload);
    const selectedGroup = selectActionGroup(actionGroups, options.listName);
    const selectedCommands = selectedGroup ? commandGroups.get(selectedGroup.name) ?? [] : [];
    if (options.applyName) {
        const selectedOperationGroup = selectActionGroup(actionGroups, options.applyName);
        if (!selectedOperationGroup) {
            throw new Error(`Unknown action group "${options.applyName}".`);
        }
        if (!operationGroups.has(selectedOperationGroup.name)) {
            throw new Error(`index --apply only supports actionable groups. Use one of: ${[...operationGroups.keys()].join(", ")}.`);
        }
        const operations = operationGroups.get(selectedOperationGroup.name) ?? [];
        const results = await applyOperations(operations, options.confirm === true);
        const failed = results.filter((result) => result.outcome === "failed").length;
        if (options.format === "json") {
            console.log(JSON.stringify({
                indexPath: resolvedIndexPath,
                type: detectedType,
                summary,
                apply: {
                    name: selectedOperationGroup.name,
                    label: selectedOperationGroup.label,
                    description: selectedOperationGroup.description,
                    dryRun: options.confirm !== true,
                    count: results.length,
                    applied: results.filter((result) => result.outcome === "applied").length,
                    pending: results.filter((result) => result.outcome === "pending").length,
                    skipped: results.filter((result) => result.outcome === "skipped").length,
                    failed,
                    results
                }
            }, null, 2));
            return failed > 0 ? 1 : 0;
        }
        console.log(`Index: ${resolvedIndexPath}`);
        console.log(`Type: ${summary.headline}`);
        console.log(`Apply: ${selectedOperationGroup.label}`);
        console.log(`Mode: ${options.confirm === true ? "execute" : "dry-run"}`);
        console.log(`Operations: ${results.length}`);
        if (results.length === 0) {
            console.log("  none");
        }
        else {
            for (const result of results) {
                console.log(`  ${formatOperationOutcome(result.outcome)} ${result.label}: ${result.detail}`);
            }
        }
        if (options.confirm !== true && results.some((result) => result.outcome === "pending")) {
            console.log("Next: re-run with --yes to execute the pending operations.");
        }
        return failed > 0 ? 1 : 0;
    }
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
            recommendedCommands: options.commands && !selectedGroup
                ? actionGroups
                    .map((group) => ({
                    name: group.name,
                    label: group.label,
                    count: (commandGroups.get(group.name) ?? []).length,
                    commands: (commandGroups.get(group.name) ?? []).slice(0, limit),
                    truncated: (commandGroups.get(group.name) ?? []).length > limit
                }))
                    .filter((group) => group.count > 0)
                : undefined,
            selectedList: selectedGroup
                ? {
                    name: selectedGroup.name,
                    label: selectedGroup.label,
                    description: selectedGroup.description,
                    count: selectedGroup.items.length,
                    items: selectedGroup.items.slice(0, limit),
                    truncated: selectedGroup.items.length > limit,
                    commands: options.commands ? selectedCommands.slice(0, limit) : undefined,
                    commandsTruncated: options.commands ? selectedCommands.length > limit : undefined
                }
                : undefined
        }, null, 2));
        return 0;
    }
    if (selectedGroup && options.plain) {
        const plainValues = options.commands ? selectedCommands : selectedGroup.items;
        for (const item of plainValues.slice(0, limit)) {
            console.log(item);
        }
        return 0;
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
        if (options.commands) {
            printCommandGroup(selectedCommands, limit);
        }
        return 0;
    }
    const groupsToPrint = actionGroups.filter((group) => group.items.length > 0).slice(0, 5);
    if (groupsToPrint.length === 0) {
        console.log("Actions: no current action items recorded in this index.");
        return 0;
    }
    console.log("Actions:");
    for (const group of groupsToPrint) {
        const preview = group.items.slice(0, Math.min(limit, 5));
        const suffix = group.items.length > preview.length ? ` (+${group.items.length - preview.length} more)` : "";
        console.log(`  ${group.name} (${group.items.length}): ${preview.join(", ")}${suffix}`);
    }
    if (options.commands) {
        const commandGroupsToPrint = actionGroups
            .map((group) => ({
            name: group.name,
            commands: commandGroups.get(group.name) ?? []
        }))
            .filter((group) => group.commands.length > 0)
            .slice(0, 5);
        if (commandGroupsToPrint.length === 0) {
            console.log("Commands: no follow-up commands available from this index.");
            return 0;
        }
        console.log("Commands:");
        for (const group of commandGroupsToPrint) {
            const preview = group.commands.slice(0, Math.min(limit, 3));
            const suffix = group.commands.length > preview.length ? ` (+${group.commands.length - preview.length} more)` : "";
            console.log(`  ${group.name}: ${preview.join(" | ")}${suffix}`);
        }
    }
    return 0;
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
function printCommandGroup(commands, limit) {
    console.log(`Commands: ${commands.length}`);
    if (commands.length === 0) {
        console.log("  none");
        return;
    }
    for (const command of commands.slice(0, limit)) {
        console.log(`  - ${command}`);
    }
    if (commands.length > limit) {
        console.log(`  ... ${commands.length - limit} more`);
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
function buildReviewCommandGroups(index) {
    const skills = index.skills ?? [];
    const byRelativeDir = new Map(skills.map((skill) => [skill.relativeDir, skill]));
    return new Map([
        [
            "blocked-skills",
            buildUniqueCommands(index.operationsSummary.blockedSkills.map((relativeDir) => {
                const skill = byRelativeDir.get(relativeDir);
                return skill ? `skillforge lint ${shellQuote(skill.skillDir)}` : undefined;
            }))
        ],
        [
            "ready-with-warnings",
            buildUniqueCommands(index.operationsSummary.readyWithWarningsSkills.map((relativeDir) => {
                const skill = byRelativeDir.get(relativeDir);
                if (!skill) {
                    return undefined;
                }
                if (skill.archive?.destination) {
                    return `skillforge review ${shellQuote(skill.skillDir)} --output ${shellQuote(skill.archive.destination)}`;
                }
                return `skillforge lint ${shellQuote(skill.skillDir)}`;
            }))
        ],
        [
            "ready-skills",
            buildUniqueCommands(index.operationsSummary.readySkills.map((relativeDir) => {
                const skill = byRelativeDir.get(relativeDir);
                if (!skill?.archive?.destination) {
                    return undefined;
                }
                return `skillforge inspect ${shellQuote(skill.archive.destination)}`;
            }))
        ],
        [
            "release-changes",
            buildUniqueCommands(index.operationsSummary.skillsWithReleaseChanges.map((relativeDir) => {
                const skill = byRelativeDir.get(relativeDir);
                if (!skill?.archive?.destination || !skill.archive.releaseComparison?.baselineArchivePath) {
                    return undefined;
                }
                return `skillforge inspect ${shellQuote(skill.archive.destination)} --against ${shellQuote(skill.archive.releaseComparison.baselineArchivePath)}`;
            }))
        ],
        [
            "missing-baselines",
            buildUniqueCommands(index.operationsSummary.skillsMissingBaselines.map((relativeDir) => {
                const skill = byRelativeDir.get(relativeDir);
                const baselinePath = skill ? resolveReviewBaselinePromotionPath(skill) : undefined;
                if (!skill?.archive?.destination || !baselinePath) {
                    return undefined;
                }
                return `cp ${shellQuote(skill.archive.destination)} ${shellQuote(baselinePath)}`;
            }))
        ],
        [
            "drifted-artifacts",
            buildUniqueCommands(index.operationsSummary.driftedArtifacts.map((relativeDir) => {
                const skill = byRelativeDir.get(relativeDir);
                if (!skill) {
                    return undefined;
                }
                if (skill.archive?.destination) {
                    return `skillforge review ${shellQuote(skill.skillDir)} --output ${shellQuote(skill.archive.destination)}`;
                }
                return `skillforge review ${shellQuote(skill.skillDir)}`;
            }))
        ],
        [
            "orphaned-baselines",
            buildUniqueCommands((index.baselineSummary?.orphanedArchives ?? []).map((archivePath) => `rm -f ${shellQuote(archivePath)}`))
        ]
    ]);
}
function buildInspectCommandGroups(index) {
    const archives = index.archives ?? [];
    const byRelativePath = new Map(archives.map((archive) => [archive.relativePath, archive]));
    const duplicateCommands = (index.identitySummary?.duplicateCoordinates ?? []).flatMap((entry) => entry.archives.map((archivePath) => `skillforge inspect ${shellQuote(archivePath)}`));
    const versionSpreadCommands = (index.identitySummary?.multiVersionSkills ?? []).flatMap((entry) => entry.archives.map((archivePath) => `skillforge inspect ${shellQuote(archivePath)}`));
    return new Map([
        [
            "release-changes",
            buildUniqueCommands(index.operationsSummary.archivesWithReleaseChanges.map((relativePath) => {
                const archive = byRelativePath.get(relativePath);
                if (!archive?.releaseComparison?.baselineArchivePath) {
                    return undefined;
                }
                return `skillforge inspect ${shellQuote(archive.archivePath)} --against ${shellQuote(archive.releaseComparison.baselineArchivePath)}`;
            }))
        ],
        [
            "missing-baselines",
            buildUniqueCommands(index.operationsSummary.archivesMissingBaselines.map((relativePath) => {
                const archive = byRelativePath.get(relativePath);
                const baselinePath = archive ? resolveInspectBaselinePromotionPath(archive) : undefined;
                if (!archive || !baselinePath) {
                    return undefined;
                }
                return `cp ${shellQuote(archive.archivePath)} ${shellQuote(baselinePath)}`;
            }))
        ],
        ["duplicate-release-coordinates", buildUniqueCommands(duplicateCommands)],
        ["version-spread", buildUniqueCommands(versionSpreadCommands)],
        [
            "orphaned-baselines",
            buildUniqueCommands((index.baselineSummary?.orphanedArchives ?? []).map((archivePath) => `rm -f ${shellQuote(archivePath)}`))
        ]
    ]);
}
function buildReviewOperationGroups(index) {
    const skills = index.skills ?? [];
    const byRelativeDir = new Map(skills.map((skill) => [skill.relativeDir, skill]));
    return new Map([
        [
            "release-changes",
            buildUniqueOperations(index.operationsSummary.skillsWithReleaseChanges.map((relativeDir) => {
                const skill = byRelativeDir.get(relativeDir);
                if (!skill?.archive?.destination || !skill.archive.releaseComparison?.baselineArchivePath) {
                    return undefined;
                }
                return {
                    mode: "sync-release-baseline",
                    label: relativeDir,
                    sourcePath: skill.archive.destination,
                    targetPath: skill.archive.releaseComparison.baselineArchivePath,
                    detail: `copy ${skill.archive.destination} -> ${skill.archive.releaseComparison.baselineArchivePath}`
                };
            }))
        ],
        [
            "missing-baselines",
            buildUniqueOperations(index.operationsSummary.skillsMissingBaselines.map((relativeDir) => {
                const skill = byRelativeDir.get(relativeDir);
                const baselinePath = skill ? resolveReviewBaselinePromotionPath(skill) : undefined;
                if (!skill?.archive?.destination || !baselinePath) {
                    return undefined;
                }
                return {
                    mode: "promote-missing-baseline",
                    label: relativeDir,
                    sourcePath: skill.archive.destination,
                    targetPath: baselinePath,
                    detail: `copy ${skill.archive.destination} -> ${baselinePath}`
                };
            }))
        ],
        [
            "orphaned-baselines",
            buildUniqueOperations((index.baselineSummary?.orphanedArchives ?? []).map((archivePath) => ({
                mode: "remove-orphaned-baseline",
                label: node_path_1.default.basename(archivePath),
                targetPath: archivePath,
                detail: `remove ${archivePath}`
            })))
        ]
    ]);
}
function buildInspectOperationGroups(index) {
    const archives = index.archives ?? [];
    const byRelativePath = new Map(archives.map((archive) => [archive.relativePath, archive]));
    return new Map([
        [
            "release-changes",
            buildUniqueOperations(index.operationsSummary.archivesWithReleaseChanges.map((relativePath) => {
                const archive = byRelativePath.get(relativePath);
                if (!archive?.releaseComparison?.baselineArchivePath) {
                    return undefined;
                }
                return {
                    mode: "sync-release-baseline",
                    label: relativePath,
                    sourcePath: archive.archivePath,
                    targetPath: archive.releaseComparison.baselineArchivePath,
                    detail: `copy ${archive.archivePath} -> ${archive.releaseComparison.baselineArchivePath}`
                };
            }))
        ],
        [
            "missing-baselines",
            buildUniqueOperations(index.operationsSummary.archivesMissingBaselines.map((relativePath) => {
                const archive = byRelativePath.get(relativePath);
                const baselinePath = archive ? resolveInspectBaselinePromotionPath(archive) : undefined;
                if (!archive || !baselinePath) {
                    return undefined;
                }
                return {
                    mode: "promote-missing-baseline",
                    label: relativePath,
                    sourcePath: archive.archivePath,
                    targetPath: baselinePath,
                    detail: `copy ${archive.archivePath} -> ${baselinePath}`
                };
            }))
        ],
        [
            "orphaned-baselines",
            buildUniqueOperations((index.baselineSummary?.orphanedArchives ?? []).map((archivePath) => ({
                mode: "remove-orphaned-baseline",
                label: node_path_1.default.basename(archivePath),
                targetPath: archivePath,
                detail: `remove ${archivePath}`
            })))
        ]
    ]);
}
function resolveReviewBaselinePromotionPath(skill) {
    const requestedDir = skill.baselineLookup?.requestedDir;
    if (!requestedDir) {
        return undefined;
    }
    const relativeName = skill.relativeDir === "." ? "root.skill" : `${skill.relativeDir}.skill`;
    return node_path_1.default.join(requestedDir, relativeName);
}
function resolveInspectBaselinePromotionPath(archive) {
    const requestedDir = archive.baselineLookup?.requestedDir;
    if (!requestedDir) {
        return undefined;
    }
    const relativeName = archive.relativePath === "." ? "root.skill" : archive.relativePath;
    return node_path_1.default.join(requestedDir, relativeName);
}
function buildUniqueCommands(commands) {
    return [...new Set(commands.filter((command) => Boolean(command)))];
}
function buildUniqueOperations(operations) {
    const seen = new Set();
    const unique = [];
    for (const operation of operations) {
        if (!operation) {
            continue;
        }
        const key = `${operation.mode}:${operation.sourcePath ?? ""}:${operation.targetPath}`;
        if (seen.has(key)) {
            continue;
        }
        seen.add(key);
        unique.push(operation);
    }
    return unique;
}
async function applyOperations(operations, execute) {
    const results = [];
    for (const operation of operations) {
        if (operation.mode === "remove-orphaned-baseline") {
            const targetExists = await (0, fs_2.exists)(operation.targetPath);
            if (!targetExists) {
                results.push({ ...operation, outcome: "skipped", detail: `${operation.detail} (already absent)` });
                continue;
            }
            if (!execute) {
                results.push(operationAsResult(operation, "pending"));
                continue;
            }
            await (0, promises_1.rm)(operation.targetPath, { force: true });
            results.push(operationAsResult(operation, "applied"));
            continue;
        }
        if (!operation.sourcePath) {
            results.push({ ...operation, outcome: "failed", detail: `${operation.detail} (missing source path)` });
            continue;
        }
        const sourceExists = await (0, fs_2.exists)(operation.sourcePath);
        if (!sourceExists) {
            results.push({ ...operation, outcome: "failed", detail: `${operation.detail} (source missing)` });
            continue;
        }
        const targetExists = await (0, fs_2.exists)(operation.targetPath);
        if (operation.mode === "promote-missing-baseline" && targetExists) {
            results.push({ ...operation, outcome: "skipped", detail: `${operation.detail} (target already exists)` });
            continue;
        }
        if (!execute) {
            results.push(operationAsResult(operation, "pending"));
            continue;
        }
        await (0, fs_2.ensureDir)(node_path_1.default.dirname(operation.targetPath));
        await (0, promises_1.copyFile)(operation.sourcePath, operation.targetPath);
        results.push(operationAsResult(operation, "applied"));
    }
    return results;
}
function operationAsResult(operation, outcome) {
    return {
        ...operation,
        outcome
    };
}
function formatOperationOutcome(outcome) {
    switch (outcome) {
        case "applied":
            return "APPLY";
        case "pending":
            return "PLAN";
        case "skipped":
            return "SKIP ";
        case "failed":
            return "FAIL ";
    }
}
function shellQuote(value) {
    if (/^[A-Za-z0-9_./:-]+$/.test(value)) {
        return value;
    }
    return `'${value.replace(/'/g, `'\\''`)}'`;
}
function sortStrings(values) {
    return values.slice().sort((left, right) => left.localeCompare(right));
}
