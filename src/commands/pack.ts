import path from "node:path";
import { createSkillArchive } from "../lib/zip";
import { exists } from "../lib/fs";
import { lintSkill } from "../lib/skill";

export async function runPack(targetDir: string, outputPath?: string): Promise<void> {
  const resolvedDir = path.resolve(targetDir);
  const lintResult = await lintSkill(resolvedDir);
  const errors = lintResult.issues.filter((issue) => issue.level === "error");

  if (errors.length > 0) {
    throw new Error(`Cannot pack ${resolvedDir} because lint found ${errors.length} error(s).`);
  }

  const destination = outputPath
    ? path.resolve(outputPath)
    : path.resolve(`${resolvedDir}.skill`);

  if (await exists(destination)) {
    throw new Error(`Output already exists: ${destination}`);
  }

  const fileCount = await createSkillArchive(resolvedDir, destination);
  console.log(`Packed ${fileCount} file(s) into ${destination}`);
}
