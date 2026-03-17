import path from "node:path";
import { readArchiveManifest } from "../lib/zip";

export interface RunInspectOptions {
  format: "text" | "json";
}

export async function runInspect(archivePath: string, options: RunInspectOptions): Promise<void> {
  const resolvedArchivePath = path.resolve(archivePath);
  const manifest = await readArchiveManifest(resolvedArchivePath);

  if (options.format === "json") {
    console.log(
      JSON.stringify(
        {
          archivePath: resolvedArchivePath,
          manifest
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`Inspecting ${resolvedArchivePath}`);
  console.log(`  Skill: ${manifest.skill.name}@${manifest.skill.version}`);
  console.log(`  Description: ${manifest.skill.description}`);
  console.log(`  Entries: ${manifest.entryCount} bundled file(s), ${formatBytes(manifest.totalBytes)} before manifest.`);
  console.log(`  Contents: ${manifest.entries.map((entry) => `${entry.path} (${formatBytes(entry.size)})`).join(", ")}`);
}

function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  return `${(size / 1024).toFixed(1)} KB`;
}
