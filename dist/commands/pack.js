"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runPack = runPack;
const workflow_1 = require("../lib/workflow");
async function runPack(targetDir, options) {
    const packResult = await (0, workflow_1.packSkill)(targetDir, options.outputPath);
    const reportPath = await (0, workflow_1.writeArchiveReport)(packResult.destination, {
        archivePath: packResult.destination,
        manifest: packResult.manifest
    }, options.reportPath);
    if (options.format === "text") {
        console.log(`Packing ${packResult.resolvedDir}`);
    }
    if (packResult.warnings.length > 0 && options.format === "text") {
        console.log(`Packing with ${packResult.warnings.length} warning(s):`);
        for (const warning of packResult.warnings) {
            console.log(`  WARNING [${warning.file}]: ${warning.message}`);
            if (warning.suggestion) {
                console.log(`    Fix: ${warning.suggestion}`);
            }
        }
        console.log("Proceeding anyway because warnings do not block packaging.");
    }
    if (packResult.normalizedOutputPath && options.format === "text") {
        console.log(`Output path did not end in .skill. Using ${packResult.destination}`);
    }
    if (options.format === "json") {
        console.log(JSON.stringify({
            archivePath: packResult.destination,
            reportPath,
            reportMarkdown: (0, workflow_1.buildArchiveReport)({
                archivePath: packResult.destination,
                manifest: packResult.manifest
            }),
            normalizedOutputPath: packResult.normalizedOutputPath,
            archiveSizeBytes: packResult.archiveSizeBytes,
            archiveSizeLabel: packResult.archiveSizeLabel,
            warnings: packResult.warnings.map((warning) => ({
                code: warning.code,
                file: warning.file,
                message: warning.message,
                suggestion: warning.suggestion
            })),
            manifest: packResult.manifest
        }, null, 2));
        return;
    }
    printArchiveSummary(packResult.destination, packResult.archiveSizeBytes, packResult.manifest, reportPath);
}
function printArchiveSummary(destination, archiveSize, manifest, reportPath) {
    console.log(`Archive ready: ${destination}`);
    console.log(`  Skill: ${manifest.skill.name}@${manifest.skill.version} (${manifest.entryCount} bundled file(s) plus manifest, ${(0, workflow_1.formatBytes)(archiveSize)}).`);
    console.log(`  Contents: ${manifest.entries.map((entry) => entry.path).join(", ")}`);
    console.log(`  Inspect: openclaw-skillkit inspect ${destination}`);
    if (reportPath) {
        console.log(`  Report: ${reportPath}`);
    }
}
