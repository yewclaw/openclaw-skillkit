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
exports.listExampleSkills = listExampleSkills;
const node_path_1 = __importDefault(require("node:path"));
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
        return [`Pack when ready: openclaw-skillkit pack ${resolvedDir}`];
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
        throw new Error(`Cannot pack ${resolvedDir} because lint found ${errors.length} error(s).`);
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
