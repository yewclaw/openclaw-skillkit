"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInspect = runInspect;
const workflow_1 = require("../lib/workflow");
async function runInspect(archivePath, options) {
    const inspected = await (0, workflow_1.inspectSkillArchive)(archivePath);
    if (options.format === "json") {
        console.log(JSON.stringify({
            archivePath: inspected.archivePath,
            manifest: inspected.manifest
        }, null, 2));
        return;
    }
    console.log(`Inspecting ${inspected.archivePath}`);
    console.log(`  Skill: ${inspected.manifest.skill.name}@${inspected.manifest.skill.version}`);
    console.log(`  Description: ${inspected.manifest.skill.description}`);
    console.log(`  Entries: ${inspected.manifest.entryCount} bundled file(s), ${(0, workflow_1.formatBytes)(inspected.manifest.totalBytes)} before manifest.`);
    console.log(`  Contents: ${inspected.manifest.entries
        .map((entry) => `${entry.path} (${(0, workflow_1.formatBytes)(entry.size)})`)
        .join(", ")}`);
}
