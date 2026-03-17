"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInit = runInit;
exports.getExampleSkillForTemplate = getExampleSkillForTemplate;
const node_path_1 = __importDefault(require("node:path"));
const promises_1 = require("node:fs/promises");
const fs_1 = require("../lib/fs");
const templates_1 = require("../lib/templates");
async function runInit(options) {
    const skillDir = node_path_1.default.resolve(options.targetDir);
    const skillFile = node_path_1.default.join(skillDir, "SKILL.md");
    if ((await (0, fs_1.exists)(skillFile)) && !options.force) {
        throw new Error(`Refusing to overwrite existing file: ${skillFile}. Use --force to replace it.`);
    }
    await (0, fs_1.ensureDir)(skillDir);
    const inferredName = options.name ?? node_path_1.default.basename(skillDir);
    const title = titleCase(inferredName);
    const titleLower = title.toLowerCase();
    const description = options.description ?? `Guide the model through ${title.toLowerCase()} workflows with clear steps.`;
    const resources = [...new Set([...templates_1.TEMPLATE_MODES[options.template], ...options.resources])];
    const markdown = templates_1.DEFAULT_SKILL_MD
        .replace(/{{name}}/g, inferredName)
        .replace(/{{description}}/g, description)
        .replace(/{{title}}/g, title)
        .replace(/{{titleLower}}/g, titleLower);
    await (0, fs_1.writeTextFile)(skillFile, markdown);
    for (const resource of resources) {
        const resourceDir = node_path_1.default.join(skillDir, resource);
        await (0, fs_1.ensureDir)(resourceDir);
        if (resource === "references") {
            await (0, fs_1.writeTextFile)(node_path_1.default.join(resourceDir, "README.md"), templates_1.EXAMPLE_REFERENCE);
        }
        else if (resource === "scripts") {
            const scriptFile = node_path_1.default.join(resourceDir, "example.sh");
            await (0, fs_1.writeTextFile)(scriptFile, templates_1.EXAMPLE_SCRIPT);
            await (0, promises_1.chmod)(scriptFile, 0o755);
        }
        else if (resource === "assets") {
            await (0, fs_1.writeTextFile)(node_path_1.default.join(resourceDir, "README.txt"), templates_1.EXAMPLE_ASSET);
        }
    }
    return {
        skillDir,
        skillFile,
        template: options.template,
        resources,
        inferredName,
        exampleSkill: getExampleSkillForTemplate(options.template, options.resources)
    };
}
function getExampleSkillForTemplate(template, resources) {
    const effectiveResources = new Set([...templates_1.TEMPLATE_MODES[template], ...resources]);
    if (effectiveResources.has("scripts")) {
        return "examples/weather-research-skill";
    }
    if (effectiveResources.has("references")) {
        return "examples/customer-support-triage-skill";
    }
    return "examples/release-notes-skill";
}
function titleCase(value) {
    return value
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(" ");
}
