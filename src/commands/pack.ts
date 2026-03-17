import { type SkillArchiveManifest } from "../lib/zip";
import { formatBytes, packSkill } from "../lib/workflow";

export interface RunPackOptions {
  outputPath?: string;
  format: "text" | "json";
}

export async function runPack(targetDir: string, options: RunPackOptions): Promise<void> {
  const packResult = await packSkill(targetDir, options.outputPath);

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

  printArchiveSummary(packResult.destination, packResult.archiveSizeBytes, packResult.manifest);
}

function printArchiveSummary(destination: string, archiveSize: number, manifest: SkillArchiveManifest): void {
  console.log(`Archive ready: ${destination}`);
  console.log(
    `  Skill: ${manifest.skill.name}@${manifest.skill.version} (${manifest.entryCount} bundled file(s) plus manifest, ${formatBytes(archiveSize)}).`
  );
  console.log(`  Contents: ${manifest.entries.map((entry) => entry.path).join(", ")}`);
  console.log(`  Inspect: openclaw-skillkit inspect ${destination}`);
}
