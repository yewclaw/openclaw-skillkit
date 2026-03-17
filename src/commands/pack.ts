import { type SkillArchiveManifest } from "../lib/zip";
import { buildArchiveReport, formatBytes, packSkill, writeArchiveReport } from "../lib/workflow";

export interface RunPackOptions {
  outputPath?: string;
  format: "text" | "json";
  reportPath?: string | boolean;
}

export async function runPack(targetDir: string, options: RunPackOptions): Promise<void> {
  const packResult = await packSkill(targetDir, options.outputPath);
  const reportPath = await writeArchiveReport(
    packResult.destination,
    {
      archivePath: packResult.destination,
      manifest: packResult.manifest
    },
    options.reportPath
  );

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
    console.log(
      JSON.stringify(
        {
          archivePath: packResult.destination,
          reportPath,
          reportMarkdown: buildArchiveReport({
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
        },
        null,
        2
      )
    );
    return;
  }

  printArchiveSummary(packResult.destination, packResult.archiveSizeBytes, packResult.manifest, reportPath);
}

function printArchiveSummary(
  destination: string,
  archiveSize: number,
  manifest: SkillArchiveManifest,
  reportPath?: string
): void {
  console.log("PACKAGED SUCCESSFULLY");
  console.log(`Archive ready: ${destination}`);
  console.log(
    `  Skill: ${manifest.skill.name}@${manifest.skill.version} (${manifest.entryCount} bundled file(s) plus manifest, ${formatBytes(archiveSize)}).`
  );
  console.log("  Confidence: the archive includes an embedded manifest for later inspection.");
  console.log(`  Contents: ${manifest.entries.map((entry) => entry.path).join(", ")}`);
  console.log("Next:");
  console.log(`  1. Inspect the shipped artifact: openclaw-skillkit inspect ${destination}`);
  console.log(`  2. Verify source parity: openclaw-skillkit inspect ${destination} --source ./path-to-skill`);
  if (reportPath) {
    console.log(`  Report: ${reportPath}`);
  }
}
