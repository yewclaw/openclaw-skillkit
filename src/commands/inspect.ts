import {
  buildArchiveReport,
  compareArchives,
  type ArchiveSourceComparison,
  type ArchiveReleaseComparison,
  compareArchiveToSource,
  formatBytes,
  inspectSkillArchive,
  summarizeReleaseDelta,
  summarizeArchiveTrust,
  writeArchiveReport
} from "../lib/workflow";

export interface RunInspectOptions {
  format: "text" | "json";
  sourceDir?: string;
  baselineArchivePath?: string;
  reportPath?: string | boolean;
}

export async function runInspect(archivePath: string, options: RunInspectOptions): Promise<void> {
  let inspected = await inspectSkillArchive(archivePath);

  if (options.sourceDir) {
    inspected = await compareArchiveToSource(archivePath, options.sourceDir);
  }

  if (options.baselineArchivePath) {
    const compared = await compareArchives(archivePath, options.baselineArchivePath);
    inspected = {
      ...inspected,
      releaseComparison: compared.releaseComparison
    };
  }

  const reportPath = await writeArchiveReport(inspected.archivePath, inspected, options.reportPath);
  const trust = summarizeArchiveTrust(inspected);
  const releaseDelta = summarizeReleaseDelta(inspected);

  if (options.format === "json") {
    console.log(
      JSON.stringify(
        {
          archivePath: inspected.archivePath,
          trustSummary: trust,
          releaseDeltaSummary: releaseDelta,
          manifest: inspected.manifest,
          reportPath,
          reportMarkdown: buildArchiveReport(inspected),
          comparison: "comparison" in inspected ? inspected.comparison : undefined,
          releaseComparison: "releaseComparison" in inspected ? inspected.releaseComparison : undefined
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`Inspecting ${inspected.archivePath}`);
  console.log(`  Status: ${formatInspectStatus(inspected)}`);
  console.log(`  Trust: ${trust.headline}`);
  console.log(`  Skill: ${inspected.manifest.skill.name}@${inspected.manifest.skill.version}`);
  console.log(`  Description: ${inspected.manifest.skill.description}`);
  console.log(`  Confidence: ${trust.confidence}`);
  console.log(
    `  Checks: ${trust.checks
      .map((check) => `${formatAssessment(check.status)} ${check.label.toLowerCase()} (${check.detail})`)
      .join("; ")}`
  );
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

  if (hasReleaseComparison(inspected)) {
    const { releaseComparison } = inspected;
    console.log(`  Release delta: ${releaseDelta.headline}`);
    console.log(`  Baseline archive: ${releaseComparison.baselineArchivePath}`);
    console.log(
      `  Delta: ${releaseComparison.matches ? "matches baseline archive" : "release changed"} (${releaseComparison.matchedEntries}/${releaseComparison.baselineEntryCount} baseline entries unchanged).`
    );

    if (releaseComparison.metadataDifferences.length > 0) {
      console.log(
        `  Metadata changes: ${releaseComparison.metadataDifferences
          .map(
            (difference) =>
              `${difference.field} current="${difference.currentValue}" baseline="${difference.baselineValue}"`
          )
          .join("; ")}`
      );
    }

    if (releaseComparison.changedEntries.length > 0) {
      console.log(
        `  Changed since baseline: ${releaseComparison.changedEntries
          .map(
            (entry) =>
              `${entry.path} (${entry.reason}, current ${formatBytes(entry.currentSize)}, baseline ${formatBytes(entry.baselineSize)})`
          )
          .join(", ")}`
      );
    }

    if (releaseComparison.addedEntries.length > 0) {
      console.log(`  Added since baseline: ${releaseComparison.addedEntries.join(", ")}`);
    }

    if (releaseComparison.removedEntries.length > 0) {
      console.log(`  Removed since baseline: ${releaseComparison.removedEntries.join(", ")}`);
    }
  }

  if (!hasComparison(inspected)) {
    console.log(`  Next: run openclaw-skillkit inspect ${inspected.archivePath} --source ./path-to-skill to check for drift.`);
  }

  if (!hasReleaseComparison(inspected)) {
    console.log(
      `  Release history: run openclaw-skillkit inspect ${inspected.archivePath} --against ./previous-release.skill to compare against a prior artifact.`
    );
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

function hasReleaseComparison(
  value: { archivePath: string; manifest: unknown; releaseComparison?: ArchiveReleaseComparison }
): value is {
  archivePath: string;
  manifest: { entries: Array<{ path: string; size: number }> };
  releaseComparison: ArchiveReleaseComparison;
} {
  return Boolean(value.releaseComparison);
}

function formatInspectStatus(result: { comparison?: ArchiveSourceComparison }): string {
  if (!result.comparison) {
    return "ARCHIVE VERIFIED";
  }

  return result.comparison.matches ? "ARCHIVE MATCHES SOURCE" : "DRIFT DETECTED";
}

function formatAssessment(status: "pass" | "warn" | "fail"): string {
  switch (status) {
    case "pass":
      return "PASS";
    case "warn":
      return "ATTN";
    default:
      return "FAIL";
  }
}
