import path from "node:path";
import { stat } from "node:fs/promises";
import { createSkillArchive, type SkillArchiveManifest } from "../lib/zip";
import { ensureDir, exists } from "../lib/fs";
import { lintSkill } from "../lib/skill";

export interface RunPackOptions {
  outputPath?: string;
  format: "text" | "json";
}

export async function runPack(targetDir: string, options: RunPackOptions): Promise<void> {
  const resolvedDir = path.resolve(targetDir);
  const lintResult = await lintSkill(resolvedDir);
  const errors = lintResult.issues.filter((issue) => issue.level === "error");
  const warnings = lintResult.issues.filter((issue) => issue.level === "warning");

  if (errors.length > 0) {
    throw new Error(`Cannot pack ${resolvedDir} because lint found ${errors.length} error(s).`);
  }

  const { destination, normalizedOutputPath } = resolveDestination(resolvedDir, options.outputPath);

  if (await exists(destination)) {
    throw new Error(`Output already exists: ${destination}`);
  }

  await ensureDir(path.dirname(destination));

  if (options.format === "text") {
    console.log(`Packing ${resolvedDir}`);
  }

  if (warnings.length > 0 && options.format === "text") {
    console.log(`Packing with ${warnings.length} warning(s):`);
    for (const warning of warnings) {
      console.log(`  WARNING [${warning.file}]: ${warning.message}`);
      if (warning.suggestion) {
        console.log(`    Fix: ${warning.suggestion}`);
      }
    }
    console.log("Proceeding anyway because warnings do not block packaging.");
  }

  const archive = await createSkillArchive(resolvedDir, destination);
  const archiveStat = await stat(destination);

  if (normalizedOutputPath && options.format === "text") {
    console.log(`Output path did not end in .skill. Using ${destination}`);
  }

  if (options.format === "json") {
    console.log(
      JSON.stringify(
        {
          archivePath: destination,
          normalizedOutputPath,
          archiveSizeBytes: archiveStat.size,
          archiveSizeLabel: formatBytes(archiveStat.size),
          warnings: warnings.map((warning) => ({
            code: warning.code,
            file: warning.file,
            message: warning.message,
            suggestion: warning.suggestion
          })),
          manifest: archive.manifest
        },
        null,
        2
      )
    );
    return;
  }

  printArchiveSummary(destination, archiveStat.size, archive.manifest);
}

function resolveDestination(
  resolvedDir: string,
  outputPath?: string
): { destination: string; normalizedOutputPath: boolean } {
  if (!outputPath) {
    return {
      destination: path.resolve(`${resolvedDir}.skill`),
      normalizedOutputPath: false
    };
  }

  const resolvedOutput = path.resolve(outputPath);
  const extension = path.extname(resolvedOutput);

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

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  return `${(size / 1024).toFixed(1)} KB`;
}

function printArchiveSummary(destination: string, archiveSize: number, manifest: SkillArchiveManifest): void {
  console.log(`Archive ready: ${destination}`);
  console.log(
    `  Skill: ${manifest.skill.name}@${manifest.skill.version} (${manifest.entryCount} bundled file(s) plus manifest, ${formatBytes(archiveSize)}).`
  );
  console.log(`  Contents: ${manifest.entries.map((entry) => entry.path).join(", ")}`);
  console.log(`  Inspect: openclaw-skillkit inspect ${destination}`);
}
