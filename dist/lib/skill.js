"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.lintSkill = lintSkill;
const path = require("node:path");
const promises_1 = require("node:fs/promises");
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
const RECOMMENDED_SECTION_HEADINGS = [
    {
        heading: "Purpose",
        suggestion: 'Add a "## Purpose" section that explains the outcome this skill is meant to produce.'
    },
    {
        heading: "Workflow",
        suggestion: 'Add a "## Workflow" section with the repeatable steps the model should follow.'
    },
    {
        heading: "Constraints",
        suggestion: 'Add a "## Constraints" section with non-negotiable guardrails, checks, or limits.'
    }
];
async function lintSkill(skillDir) {
    const issues = [];
    const skillFile = path.join(skillDir, "SKILL.md");
    if (!(await (0, fs_1.exists)(skillDir))) {
        issues.push(createIssue("error", "missing-directory", ".", `Directory does not exist: ${skillDir}`, {
            category: "filesystem",
            suggestion: "Check the path passed to lint or create the skill directory before validating."
        }));
        return { skillDir, issues, fileCount: 0 };
    }
    if (!(await (0, fs_1.exists)(skillFile))) {
        issues.push(createIssue("error", "missing-skill-file", ".", "Missing SKILL.md at the skill root.", {
            category: "filesystem",
            suggestion: 'Run "openclaw-skillkit init <dir>" or add SKILL.md before packaging this skill.'
        }));
        return { skillDir, issues, fileCount: 0 };
    }
    const markdown = await (0, fs_1.readTextFile)(skillFile);
    if (!markdown.trim()) {
        issues.push(createIssue("error", "empty-skill-file", "SKILL.md", "SKILL.md is empty.", {
            category: "content",
            suggestion: "Add frontmatter plus concrete instructions so the skill can be reviewed and packaged."
        }));
        return { skillDir, issues, fileCount: 1 };
    }
    let frontmatterBody = markdown;
    try {
        const parsed = (0, frontmatter_1.parseFrontmatter)(markdown);
        frontmatterBody = parsed.body;
        if (!parsed.hasFrontmatter) {
            issues.push(createIssue("warning", "missing-frontmatter", "SKILL.md", "SKILL.md has no frontmatter. Add name, description, and version for better tooling.", {
                category: "frontmatter",
                suggestion: 'Start SKILL.md with "---" and add name, description, and version fields.'
            }));
        }
        else {
            validateFrontmatter(parsed.attributes, issues);
        }
    }
    catch (error) {
        issues.push(createIssue("error", "frontmatter-parse-error", "SKILL.md", `Frontmatter error: ${error.message}`, {
            category: "frontmatter",
            suggestion: 'Use simple "key: value" lines between the opening and closing "---" markers.'
        }));
    }
    if (!/^#\s+.+/m.test(frontmatterBody)) {
        issues.push(createIssue("error", "missing-title-heading", "SKILL.md", "SKILL.md should contain a top-level heading.", {
            category: "structure",
            suggestion: 'Add a single "# Skill Title" heading near the top of the document body.'
        }));
    }
    if (!/##\s+.+/m.test(frontmatterBody)) {
        issues.push(createIssue("warning", "missing-section-heading", "SKILL.md", "SKILL.md should include at least one section heading.", {
            category: "structure",
            suggestion: 'Add sections such as "Purpose", "Workflow", or "Constraints" so the skill is easier to review.'
        }));
    }
    if (PLACEHOLDER_BODY_PATTERNS.some((pattern) => pattern.test(frontmatterBody))) {
        issues.push(createIssue("warning", "placeholder-body", "SKILL.md", "SKILL.md still contains scaffold placeholder copy. Replace it with real instructions before shipping.", {
            category: "content",
            suggestion: "Rewrite the scaffold sections with the actual trigger conditions, workflow steps, and guardrails."
        }));
    }
    const sections = extractSections(frontmatterBody);
    if (sections.size > 0) {
        validateRecommendedSections(sections, issues);
    }
    for (const reference of getReferencedLocalFiles(frontmatterBody)) {
        const referencePath = path.resolve(skillDir, reference);
        if (await (0, fs_1.exists)(referencePath)) {
            continue;
        }
        issues.push(createIssue("error", "missing-local-reference", "SKILL.md", `Referenced local file not found: ${reference}`, {
            category: "references",
            suggestion: `Create ${reference} or update the markdown link to point at an existing bundled file.`
        }));
    }
    await validateScriptExecutables(skillDir, issues);
    return {
        skillDir,
        issues,
        fileCount: 1
    };
}
function validateFrontmatter(attributes, issues) {
    for (const field of ["name", "description", "version"]) {
        if (!attributes[field]) {
            issues.push(createIssue("warning", `missing-frontmatter-${field}`, "SKILL.md", `Frontmatter is missing "${field}".`, {
                category: "frontmatter",
                suggestion: `Add a ${field}: ... entry to the frontmatter block.`
            }));
        }
    }
    if (attributes.version && !/^\d+\.\d+\.\d+([-.][0-9A-Za-z.]+)?$/.test(attributes.version)) {
        issues.push(createIssue("error", "invalid-frontmatter-version", "SKILL.md", `Frontmatter version must look like semver. Received "${attributes.version}".`, {
            category: "frontmatter",
            suggestion: 'Use a semver-style version such as "0.1.0" or "1.2.3-beta.1".'
        }));
    }
    if (attributes.name) {
        if (attributes.name.length < 3) {
            issues.push(createIssue("error", "short-frontmatter-name", "SKILL.md", "Frontmatter name must be at least 3 characters.", {
                category: "frontmatter",
                suggestion: 'Use a stable slug such as "customer-support" instead of an abbreviated label.'
            }));
        }
        if (!SKILL_NAME_PATTERN.test(attributes.name)) {
            issues.push(createIssue("error", "invalid-frontmatter-name", "SKILL.md", `Frontmatter name must use lowercase letters, numbers, and single hyphens. Received "${attributes.name}".`, {
                category: "frontmatter",
                suggestion: "Rename the skill to a lowercase slug with hyphens only, for example customer-support."
            }));
        }
    }
    if (attributes.description) {
        if (attributes.description.trim().length < 20) {
            issues.push(createIssue("warning", "short-frontmatter-description", "SKILL.md", "Frontmatter description should be at least 20 characters for clearer discovery.", {
                category: "frontmatter",
                suggestion: "Expand the description to mention the user outcome, domain, or workflow this skill covers."
            }));
        }
        if (PLACEHOLDER_DESCRIPTION_PATTERNS.some((pattern) => pattern.test(attributes.description))) {
            issues.push(createIssue("warning", "placeholder-frontmatter-description", "SKILL.md", "Frontmatter description looks like placeholder copy. Make it specific to the skill.", {
                category: "frontmatter",
                suggestion: "Describe the actual user task and value instead of generic scaffold language."
            }));
        }
    }
}
function createIssue(level, code, file, message, options = {}) {
    return {
        level,
        code,
        category: options.category,
        file,
        message,
        suggestion: options.suggestion
    };
}
function validateRecommendedSections(sections, issues) {
    for (const item of RECOMMENDED_SECTION_HEADINGS) {
        if (!sections.has(item.heading.toLowerCase())) {
            issues.push(createIssue("warning", `missing-section-${item.heading.toLowerCase()}`, "SKILL.md", `SKILL.md should include a "## ${item.heading}" section.`, {
                category: "structure",
                suggestion: item.suggestion
            }));
        }
    }
    const workflowBody = sections.get("workflow");
    if (workflowBody && !/^\d+\.\s+/m.test(workflowBody)) {
        issues.push(createIssue("warning", "workflow-not-numbered", "SKILL.md", 'The "## Workflow" section should include numbered steps.', {
            category: "structure",
            suggestion: 'Rewrite the workflow as "1. ...", "2. ...", "3. ..." so another developer can follow it.'
        }));
    }
}
function extractSections(markdown) {
    const sections = new Map();
    const headingPattern = /^##\s+(.+)$/gm;
    const matches = [...markdown.matchAll(headingPattern)];
    for (let index = 0; index < matches.length; index += 1) {
        const match = matches[index];
        const heading = match[1]?.trim();
        if (!heading || match.index === undefined) {
            continue;
        }
        const sectionStart = match.index + match[0].length;
        const sectionEnd = matches[index + 1]?.index ?? markdown.length;
        sections.set(heading.toLowerCase(), markdown.slice(sectionStart, sectionEnd).trim());
    }
    return sections;
}
function getReferencedLocalFiles(markdown) {
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
        if (!target) {
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
async function validateScriptExecutables(skillDir, issues) {
    const scriptsDir = path.join(skillDir, "scripts");
    if (!(await (0, fs_1.exists)(scriptsDir))) {
        return;
    }
    const scriptFiles = await (0, fs_1.listFilesRecursive)(scriptsDir);
    for (const file of scriptFiles) {
        if (!looksLikeRunnableScript(file.relativePath)) {
            continue;
        }
        const displayPath = path.posix.join("scripts", file.relativePath);
        const fileStat = await (0, promises_1.stat)(file.absolutePath);
        if ((fileStat.mode & 0o111) !== 0) {
            continue;
        }
        issues.push(createIssue("warning", "non-executable-script", displayPath, `Script is not executable: ${displayPath}`, {
            category: "scripts",
            suggestion: `Run "chmod +x ${displayPath}" if the script is meant to be invoked directly.`
        }));
    }
}
function looksLikeRunnableScript(relativePath) {
    const extension = path.extname(relativePath).toLowerCase();
    return extension === ".sh" || extension === ".bash" || extension === ".py" || extension === ".js";
}
