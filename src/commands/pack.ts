import path from "node:path";
import { createSkillArchive } from "../lib/zip";
import { exists } from "../lib/fs";
import { lintSkill } from "../lib/skill";

export async function runPack(targetDir: string, outputPath?: string): Promise<void> {
  const resolvedDir = path.resolve(targetDir);
  const lintResult = await lintSkill(resolvedDir);
  const errors = lintResult.issues.filter((issue) => issue.level === "error");
  const warnings = lintResult.issues.filter((issue) => issue.level === "warning");

  if (errors.length > 0) {
    throw new Error(`Cannot pack ${resolvedDir} because lint found ${errors.length} error(s).`);
  }

  const destination = outputPath
    ? path.resolve(outputPath)
    : path.resolve(`${resolvedDir}.skill`);

  if (await exists(destination)) {
    throw new Error(`Output already exists: ${destination}`);
  }

  if (warnings.length > 0) {
    console.log(`Packing with ${warnings.length} warning(s):`);
    for (const warning of warnings) {
      console.log(`  WARNING: ${warning.message}`);
    }
    console.log("Proceeding anyway because warnings do not block packaging.");
  }

  const fileCount = await createSkillArchive(resolvedDir, destination);
  console.log(`Packed ${fileCount} file(s) into ${destination}`);
}
