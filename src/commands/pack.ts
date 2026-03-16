import path from "node:path";
import { stat } from "node:fs/promises";
import { createSkillArchive } from "../lib/zip";
import { ensureDir, exists } from "../lib/fs";
import { lintSkill } from "../lib/skill";

export async function runPack(targetDir: string, outputPath?: string): Promise<void> {
  const resolvedDir = path.resolve(targetDir);
  const lintResult = await lintSkill(resolvedDir);
  const errors = lintResult.issues.filter((issue) => issue.level === "error");
  const warnings = lintResult.issues.filter((issue) => issue.level === "warning");

  if (errors.length > 0) {
    throw new Error(`Cannot pack ${resolvedDir} because lint found ${errors.length} error(s).`);
  }

  const { destination, normalizedOutputPath } = resolveDestination(resolvedDir, outputPath);

  if (await exists(destination)) {
    throw new Error(`Output already exists: ${destination}`);
  }

  await ensureDir(path.dirname(destination));

  console.log(`Packing ${resolvedDir}`);

  if (warnings.length > 0) {
    console.log(`Packing with ${warnings.length} warning(s):`);
    for (const warning of warnings) {
      console.log(`  WARNING [${warning.file}]: ${warning.message}`);
      if (warning.suggestion) {
        console.log(`    Fix: ${warning.suggestion}`);
      }
    }
    console.log("Proceeding anyway because warnings do not block packaging.");
  }

  const fileCount = await createSkillArchive(resolvedDir, destination);
  const archiveStat = await stat(destination);

  if (normalizedOutputPath) {
    console.log(`Output path did not end in .skill. Using ${destination}`);
  }

  console.log(`Archive ready: ${destination}`);
  console.log(`  Included ${fileCount} file(s), ${formatBytes(archiveStat.size)}.`);
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
