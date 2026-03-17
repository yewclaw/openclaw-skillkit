import {
  buildArchiveReport,
  type ArchiveSourceComparison,
  compareArchiveToSource,
  formatBytes,
  inspectSkillArchive,
  writeArchiveReport
} from "../lib/workflow";

export interface RunInspectOptions {
  format: "text" | "json";
  sourceDir?: string;
  reportPath?: string | boolean;
}

export async function runInspect(archivePath: string, options: RunInspectOptions): Promise<void> {
  const inspected = options.sourceDir
    ? await compareArchiveToSource(archivePath, options.sourceDir)
    : await inspectSkillArchive(archivePath);
  const reportPath = await writeArchiveReport(inspected.archivePath, inspected, options.reportPath);

  if (options.format === "json") {
    console.log(
      JSON.stringify(
        {
          archivePath: inspected.archivePath,
          manifest: inspected.manifest,
          reportPath,
          reportMarkdown: buildArchiveReport(inspected),
          comparison: "comparison" in inspected ? inspected.comparison : undefined
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

  if (hasComparison(inspected)) {
    const { comparison } = inspected;
    console.log(`  Source: ${comparison.sourceDir}`);
    console.log(
      `  Comparison: ${comparison.matches ? "matches source" : "drift detected"} (${comparison.matchedEntries}/${comparison.entryCount} archive entries unchanged).`
    );

    if (comparison.metadataDifferences.length > 0) {
      console.log(
        `  Metadata drift: ${comparison.metadataDifferences
          .map((difference) => `${difference.field} archive="${difference.archiveValue}" source="${difference.sourceValue}"`)
          .join("; ")}`
      );
    }

    if (comparison.changedEntries.length > 0) {
      console.log(
        `  Changed: ${comparison.changedEntries
          .map((entry) => `${entry.path} (${entry.reason}, archive ${formatBytes(entry.archiveSize)}, source ${formatBytes(entry.sourceSize)})`)
          .join(", ")}`
      );
    }

    if (comparison.missingFromSource.length > 0) {
      console.log(`  Missing from source: ${comparison.missingFromSource.join(", ")}`);
    }

    if (comparison.extraSourceEntries.length > 0) {
      console.log(`  New in source: ${comparison.extraSourceEntries.join(", ")}`);
    }
  }

  if (reportPath) {
    console.log(`  Report: ${reportPath}`);
  }
}

function hasComparison(
  value: { archivePath: string; manifest: unknown; comparison?: ArchiveSourceComparison }
): value is { archivePath: string; manifest: { entries: Array<{ path: string; size: number }> }; comparison: ArchiveSourceComparison } {
  return Boolean(value.comparison);
}
