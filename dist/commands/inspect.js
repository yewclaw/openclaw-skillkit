"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runInspect = runInspect;
const node_path_1 = __importDefault(require("node:path"));
const zip_1 = require("../lib/zip");
async function runInspect(archivePath, options) {
    const resolvedArchivePath = node_path_1.default.resolve(archivePath);
    const manifest = await (0, zip_1.readArchiveManifest)(resolvedArchivePath);
    if (options.format === "json") {
        console.log(JSON.stringify({
            archivePath: resolvedArchivePath,
            manifest
        }, null, 2));
        return;
    }
    console.log(`Inspecting ${resolvedArchivePath}`);
    console.log(`  Skill: ${manifest.skill.name}@${manifest.skill.version}`);
    console.log(`  Description: ${manifest.skill.description}`);
    console.log(`  Entries: ${manifest.entryCount} bundled file(s), ${formatBytes(manifest.totalBytes)} before manifest.`);
    console.log(`  Contents: ${manifest.entries.map((entry) => `${entry.path} (${formatBytes(entry.size)})`).join(", ")}`);
}
function formatBytes(size) {
    if (size < 1024) {
        return `${size} B`;
    }
    return `${(size / 1024).toFixed(1)} KB`;
}
