"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInit = runInit;
const path = require("node:path");
const promises_1 = require("node:fs/promises");
const fs_1 = require("../lib/fs");
const templates_1 = require("../lib/templates");
async function runInit(options) {
    const skillDir = path.resolve(options.targetDir);
    const skillFile = path.join(skillDir, "SKILL.md");
    if ((await (0, fs_1.exists)(skillFile)) && !options.force) {
        throw new Error(`Refusing to overwrite existing file: ${skillFile}. Use --force to replace it.`);
    }
    await (0, fs_1.ensureDir)(skillDir);
    const inferredName = options.name ?? path.basename(skillDir);
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
        const resourceDir = path.join(skillDir, resource);
        await (0, fs_1.ensureDir)(resourceDir);
        if (resource === "references") {
            await (0, fs_1.writeTextFile)(path.join(resourceDir, "README.md"), templates_1.EXAMPLE_REFERENCE);
        }
        else if (resource === "scripts") {
            const scriptFile = path.join(resourceDir, "example.sh");
            await (0, fs_1.writeTextFile)(scriptFile, templates_1.EXAMPLE_SCRIPT);
            await (0, promises_1.chmod)(scriptFile, 0o755);
        }
        else if (resource === "assets") {
            await (0, fs_1.writeTextFile)(path.join(resourceDir, "README.txt"), templates_1.EXAMPLE_ASSET);
        }
    }
}
function titleCase(value) {
    return value
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
        .join(" ");
}
