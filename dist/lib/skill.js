"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lintSkill = lintSkill;
const path = require("node:path");
const fs_1 = require("./fs");
const frontmatter_1 = require("./frontmatter");
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PLACEHOLDER_DESCRIPTION_PATTERNS = [
    /\b(todo|tbd|placeholder|fill in|write a description)\b/i,
    /^openclaw skill for\b/i
];
const PLACEHOLDER_BODY_PATTERNS = [
    /Explain what this skill helps the model do\./i,
    /Add the trigger conditions\./i,
    /Describe the expected workflow\./i,
    /List important guardrails\./i
];
async function lintSkill(skillDir) {
    const issues = [];
    const skillFile = path.join(skillDir, "SKILL.md");
    if (!(await (0, fs_1.exists)(skillDir))) {
        issues.push({
            level: "error",
            message: `Directory does not exist: ${skillDir}`
        });
        return { skillDir, issues, fileCount: 0 };
    }
    if (!(await (0, fs_1.exists)(skillFile))) {
        issues.push({
            level: "error",
            message: "Missing SKILL.md at the skill root."
        });
        return { skillDir, issues, fileCount: 0 };
    }
    const markdown = await (0, fs_1.readTextFile)(skillFile);
    if (!markdown.trim()) {
        issues.push({
            level: "error",
            message: "SKILL.md is empty."
        });
        return { skillDir, issues, fileCount: 1 };
    }
    let frontmatterBody = markdown;
    try {
        const parsed = (0, frontmatter_1.parseFrontmatter)(markdown);
        frontmatterBody = parsed.body;
        if (!parsed.hasFrontmatter) {
            issues.push({
                level: "warning",
                message: "SKILL.md has no frontmatter. Add name, description, and version for better tooling."
            });
        }
        else {
            validateFrontmatter(parsed.attributes, issues);
        }
    }
    catch (error) {
        issues.push({
            level: "error",
            message: `Frontmatter error: ${error.message}`
        });
    }
    if (!/^#\s+.+/m.test(frontmatterBody)) {
        issues.push({
            level: "error",
            message: "SKILL.md should contain a top-level heading."
        });
    }
    if (!/##\s+.+/m.test(frontmatterBody)) {
        issues.push({
            level: "warning",
            message: "SKILL.md should include at least one section heading."
        });
    }
    if (PLACEHOLDER_BODY_PATTERNS.some((pattern) => pattern.test(frontmatterBody))) {
        issues.push({
            level: "warning",
            message: "SKILL.md still contains scaffold placeholder copy. Replace it with real instructions before shipping."
        });
    }
    for (const reference of getReferencedMarkdownFiles(frontmatterBody)) {
        const referencePath = path.resolve(skillDir, reference);
        if (await (0, fs_1.exists)(referencePath)) {
            continue;
        }
        issues.push({
            level: "error",
            message: `Referenced markdown file not found: ${reference}`
        });
    }
    return {
        skillDir,
        issues,
        fileCount: 1
    };
}
function validateFrontmatter(attributes, issues) {
    for (const field of ["name", "description", "version"]) {
        if (!attributes[field]) {
            issues.push({
                level: "warning",
                message: `Frontmatter is missing "${field}".`
            });
        }
    }
    if (attributes.version && !/^\d+\.\d+\.\d+([-.][0-9A-Za-z.]+)?$/.test(attributes.version)) {
        issues.push({
            level: "error",
            message: `Frontmatter version must look like semver. Received "${attributes.version}".`
        });
    }
    if (attributes.name) {
        if (attributes.name.length < 3) {
            issues.push({
                level: "error",
                message: "Frontmatter name must be at least 3 characters."
            });
        }
        if (!SKILL_NAME_PATTERN.test(attributes.name)) {
            issues.push({
                level: "error",
                message: `Frontmatter name must use lowercase letters, numbers, and single hyphens. Received "${attributes.name}".`
            });
        }
    }
    if (attributes.description) {
        if (attributes.description.trim().length < 20) {
            issues.push({
                level: "warning",
                message: "Frontmatter description should be at least 20 characters for clearer discovery."
            });
        }
        if (PLACEHOLDER_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(attributes.description))) {
            issues.push({
                level: "warning",
                message: "Frontmatter description looks like placeholder copy. Make it specific to the skill."
            });
        }
    }
}
function getReferencedMarkdownFiles(markdown) {
    const references = new Set();
    const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
    for (const match of markdown.matchAll(linkPattern)) {
        const rawTarget = match[1]?.trim();
        if (!rawTarget) {
            continue;
        }
        const target = rawTarget
            .replace(/^<|>$/g, "")
            .split(/\s+/, 1)[0]
            .split("#", 1)[0];
        if (!target || !target.toLowerCase().endsWith(".md")) {
            continue;
        }
        if (target.startsWith("#") ||
            target.startsWith("/") ||
            /^[a-z][a-z0-9+.-]*:/i.test(target)) {
            continue;
        }
        references.add(target);
    }
    return [...references];
}
