import { formatBytes, inspectSkillArchive } from "../lib/workflow";

export interface RunInspectOptions {
  format: "text" | "json";
}

export async function runInspect(archivePath: string, options: RunInspectOptions): Promise<void> {
  const inspected = await inspectSkillArchive(archivePath);

  if (options.format === "json") {
    console.log(
      JSON.stringify(
        {
          archivePath: inspected.archivePath,
          manifest: inspected.manifest
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`Inspecting ${inspected.archivePath}`);
  console.log(`  Skill: ${inspected.manifest.skill.name}@${inspected.manifest.skill.version}`);
  console.log(`  Description: ${inspected.manifest.skill.description}`);
  console.log(
    `  Entries: ${inspected.manifest.entryCount} bundled file(s), ${formatBytes(inspected.manifest.totalBytes)} before manifest.`
  );
  console.log(
    `  Contents: ${inspected.manifest.entries
      .map((entry) => `${entry.path} (${formatBytes(entry.size)})`)
      .join(", ")}`
  );
}
