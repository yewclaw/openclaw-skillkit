import path from "node:path";
import { readdir, stat } from "node:fs/promises";
import {
  buildArchiveReport,
  compareArchiveToSource,
  compareArchives,
  type ArchiveReleaseComparison,
  type ArchiveSourceComparison,
  formatBytes,
  inspectSkillArchive,
  summarizeReleaseDelta,
  summarizeArchiveTrust,
  writeArchiveReport
} from "../lib/workflow";
import { exists, writeTextFile } from "../lib/fs";

export interface RunInspectOptions {
  format: "text" | "json";
  all?: boolean;
  sourceDir?: string;
  baselineArchivePath?: string;
  baselineDir?: string;
  indexPath?: string | boolean;
  reportPath?: string | boolean;
  entryPath?: string;
}

interface BatchInspectedArchive {
  archivePath: string;
  relativePath: string;
  skill: {
    name: string;
    description: string;
    version: string;
  };
  archiveSizeBytes: number;
  archiveSizeLabel: string;
  entryCount: number;
  totalBytes: number;
  groups: Array<{
    label: string;
    fileCount: number;
    totalBytes: number;
  }>;
  largestEntries: Array<{
    path: string;
    size: number;
  }>;
  entryPaths: string[];
  baselineLookup?: {
    requestedDir: string;
    resolvedArchivePath?: string;
  };
  releaseComparison?: {
    baselineArchivePath: string;
    matches: boolean;
    matchedEntries: number;
    baselineEntryCount: number;
    addedEntries: string[];
    removedEntries: string[];
    changedEntries: Array<{
      path: string;
      reason: "size-mismatch" | "hash-mismatch";
    }>;
    metadataDifferences: Array<{
      field: "name" | "description" | "version";
    }>;
  };
}

interface BatchInspectResult {
  rootDir: string;
  baselineDir?: string;
  archiveCount: number;
  summary: {
    totalBytes: number;
    totalEntries: number;
    baselineCompared: number;
    releaseChanged: number;
    baselineMissing: number;
    duplicateCoordinates: number;
    multiVersionSkills: number;
  };
  inventorySummary: {
    largestArchives: Array<{
      relativePath: string;
      archivePath: string;
      archiveSizeBytes: number;
      entryCount: number;
    }>;
    largestEntries: Array<{
      relativePath: string;
      path: string;
      size: number;
    }>;
    commonEntries: Array<{
      path: string;
      archiveCount: number;
      archives: string[];
    }>;
  };
  identitySummary: {
    duplicateCoordinates: Array<{
      name: string;
      version: string;
      count: number;
      archives: string[];
    }>;
    multiVersionSkills: Array<{
      name: string;
      versions: string[];
      archives: string[];
    }>;
  };
  releaseSummary?: {
    changedPaths: Array<{
      path: string;
      count: number;
      changeKinds: string[];
      archives: string[];
    }>;
    metadataHotspots: Array<{
      field: "name" | "description" | "version";
      count: number;
      archives: string[];
    }>;
  };
  baselineSummary?: {
    requestedDir: string;
    compared: number;
    changed: number;
    unchanged: number;
    missingArchives: string[];
    orphanedArchives: string[];
  };
  operationsSummary: {
    duplicateReleaseCoordinates: string[];
    skillsWithVersionSpread: string[];
    archivesWithReleaseChanges: string[];
    archivesMissingBaselines: string[];
  };
  archives: BatchInspectedArchive[];
}

export async function runInspect(archivePath: string, options: RunInspectOptions): Promise<void> {
  if (options.all) {
    await runBatchInspect(path.resolve(archivePath), options);
    return;
  }

  let inspected = await inspectSkillArchive(archivePath, {
    entryPath: options.entryPath
  });

  if (options.sourceDir) {
    inspected = await compareArchiveToSource(archivePath, options.sourceDir, {
      entryPath: options.entryPath
    });
  }

  if (options.baselineArchivePath) {
    const compared = await compareArchives(archivePath, options.baselineArchivePath, {
      entryPath: options.entryPath
    });
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
          archiveInsights: inspected.archiveInsights,
          entryPreview: inspected.entryPreview,
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
  if (inspected.archiveInsights) {
    console.log(
      `  Layout: ${inspected.archiveInsights.groups
        .map((group) => `${group.label} ${group.fileCount} file(s), ${formatBytes(group.totalBytes)}`)
        .join("; ")}`
    );
    console.log(
      `  Largest: ${inspected.archiveInsights.largestEntries
        .map((entry) => `${entry.path} (${formatBytes(entry.size)})`)
        .join(", ")}`
    );
  }

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
    console.log(`  Next: run skillforge inspect ${inspected.archivePath} --source ./path-to-skill to check for drift.`);
  }

  if (!hasReleaseComparison(inspected)) {
    console.log(
      `  Release history: run skillforge inspect ${inspected.archivePath} --against ./previous-release.skill to compare against a prior artifact.`
    );
  }

  if (inspected.entryPreview) {
    console.log(`  Entry preview: ${inspected.entryPreview.path} (${inspected.entryPreview.text ? "text" : "binary"})`);
    console.log(inspected.entryPreview.preview);
  } else {
    console.log(`  Entry preview: run skillforge inspect ${inspected.archivePath} --entry SKILL.md to inspect a bundled file.`);
  }

  if (reportPath) {
    console.log(`  Report: ${reportPath}`);
  }
}

async function runBatchInspect(rootDir: string, options: RunInspectOptions): Promise<void> {
  const archivePaths = await discoverArchivePaths(rootDir);
  if (archivePaths.length === 0) {
    process.exitCode = 1;
    if (options.format === "json") {
      console.log(
        JSON.stringify(
          {
            rootDir,
            summary: {
              totalBytes: 0,
              totalEntries: 0,
              baselineCompared: 0,
              releaseChanged: 0,
              baselineMissing: 0,
              duplicateCoordinates: 0,
              multiVersionSkills: 0
            },
            archives: [],
            issues: [
              {
                level: "error",
                code: "no-archives-found",
                file: ".",
                message: "No .skill archives were found under the target directory.",
                suggestion: 'Point inspect at a release artifact directory or run "skillforge review <dir> --all" first.'
              }
            ]
          },
          null,
          2
        )
      );
      return;
    }

    console.log(`Inspecting all archives under ${rootDir}`);
    console.log("Status: NO ARCHIVES");
    console.log("Summary: no .skill archives were found.");
    console.log("Next:");
    console.log("  1. Point inspect at a directory containing packaged .skill files.");
    console.log(`  2. Re-run: skillforge inspect ${rootDir} --all`);
    return;
  }

  const archives: BatchInspectedArchive[] = [];
  const matchedBaselineArchives = new Set<string>();

  for (const archivePath of archivePaths) {
    const inspected = await inspectSkillArchive(archivePath);
    const archiveStat = await stat(archivePath);
    const relativePath = path.relative(rootDir, archivePath) || path.basename(archivePath);
    const baselineLookup = await resolveBatchBaselineArchive(
      options.baselineDir,
      relativePath,
      inspected.manifest.skill.name
    );
    const compared = baselineLookup?.resolvedArchivePath
      ? await compareArchives(archivePath, baselineLookup.resolvedArchivePath)
      : undefined;

    if (compared?.releaseComparison) {
      matchedBaselineArchives.add(path.resolve(compared.releaseComparison.baselineArchivePath));
    }

    archives.push({
      archivePath: inspected.archivePath,
      relativePath,
      skill: inspected.manifest.skill,
      archiveSizeBytes: archiveStat.size,
      archiveSizeLabel: formatBytes(archiveStat.size),
      entryCount: inspected.manifest.entryCount,
      totalBytes: inspected.manifest.totalBytes,
      groups: inspected.archiveInsights?.groups ?? [],
      largestEntries: inspected.archiveInsights?.largestEntries ?? [],
      entryPaths: inspected.manifest.entries.map((entry) => entry.path),
      baselineLookup,
      releaseComparison: compared?.releaseComparison
        ? {
            baselineArchivePath: compared.releaseComparison.baselineArchivePath,
            matches: compared.releaseComparison.matches,
            matchedEntries: compared.releaseComparison.matchedEntries,
            baselineEntryCount: compared.releaseComparison.baselineEntryCount,
            addedEntries: compared.releaseComparison.addedEntries,
            removedEntries: compared.releaseComparison.removedEntries,
            changedEntries: compared.releaseComparison.changedEntries.map((entry) => ({
              path: entry.path,
              reason: entry.reason
            })),
            metadataDifferences: compared.releaseComparison.metadataDifferences.map((difference) => ({
              field: difference.field
            }))
          }
        : undefined
    });
  }

  const result = await summarizeBatchInspect(rootDir, options.baselineDir, archives, matchedBaselineArchives);
  const reportPath = await writeBatchInspectReport(result, options.reportPath);
  const reportMarkdown = buildBatchInspectReport(result);
  const indexPath = await writeBatchInspectIndex(result, options.indexPath);

  if (options.format === "json") {
    console.log(
      JSON.stringify(
        {
          rootDir: result.rootDir,
          baselineDir: result.baselineDir,
          archiveCount: result.archiveCount,
          summary: result.summary,
          inventorySummary: result.inventorySummary,
          identitySummary: result.identitySummary,
          releaseSummary: result.releaseSummary,
          baselineSummary: result.baselineSummary,
          operationsSummary: result.operationsSummary,
          reportPath,
          indexPath,
          reportMarkdown,
          archives: result.archives
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`Inspecting all archives under ${result.rootDir}`);
  console.log(`Discovered: ${result.archiveCount} archive(s)`);
  console.log(
    `Summary: ${formatBytes(result.summary.totalBytes)} across ${result.summary.totalEntries} bundled file(s) in ${result.archiveCount} archive(s).`
  );
  console.log(`Identity: ${result.summary.duplicateCoordinates} duplicate release coordinate(s), ${result.summary.multiVersionSkills} skill(s) with multiple versions.`);
  if (result.baselineDir) {
    console.log(
      `Baselines: compared ${result.summary.baselineCompared}, changed ${result.summary.releaseChanged}, missing ${result.summary.baselineMissing}.`
    );
  }

  for (const archive of result.archives) {
    console.log(
      `  ARCHIVE ${archive.relativePath}: ${archive.skill.name}@${archive.skill.version}, ${archive.entryCount} file(s), ${archive.archiveSizeLabel}`
    );
    if (archive.baselineLookup?.requestedDir) {
      if (archive.releaseComparison) {
        console.log(
          `    Release delta: ${archive.releaseComparison.matches ? "matches baseline archive" : "release changed"} (${archive.releaseComparison.matchedEntries}/${archive.releaseComparison.baselineEntryCount} baseline entries unchanged).`
        );
      } else if (archive.baselineLookup.resolvedArchivePath) {
        console.log(`    Baseline archive: ${archive.baselineLookup.resolvedArchivePath}`);
      } else {
        console.log(`    Baseline archive: not found under ${archive.baselineLookup.requestedDir}`);
      }
    }
  }

  if (result.inventorySummary.largestArchives.length > 0) {
    console.log("Largest archives:");
    for (const archive of result.inventorySummary.largestArchives) {
      console.log(
        `  ${archive.relativePath}: ${formatBytes(archive.archiveSizeBytes)} across ${archive.entryCount} file(s)`
      );
    }
  }

  if (result.identitySummary.duplicateCoordinates.length > 0) {
    console.log("Duplicate releases:");
    for (const duplicate of result.identitySummary.duplicateCoordinates) {
      console.log(`  ${duplicate.name}@${duplicate.version}: ${duplicate.archives.join(", ")}`);
    }
  }

  if (result.identitySummary.multiVersionSkills.length > 0) {
    console.log("Version spread:");
    for (const entry of result.identitySummary.multiVersionSkills) {
      console.log(`  ${entry.name}: ${entry.versions.join(", ")}`);
    }
  }

  if (result.inventorySummary.commonEntries.length > 0) {
    console.log("Common bundled paths:");
    for (const entry of result.inventorySummary.commonEntries) {
      console.log(`  ${entry.path}: ${entry.archiveCount} archive(s)`);
    }
  }

  if (result.baselineSummary?.orphanedArchives.length) {
    console.log("Orphaned baselines:");
    for (const archive of result.baselineSummary.orphanedArchives) {
      console.log(`  ${archive}`);
    }
  }

  if (reportPath) {
    console.log(`Report: ${reportPath}`);
  }
  if (indexPath) {
    console.log(`Index: ${indexPath}`);
  }
}

async function summarizeBatchInspect(
  rootDir: string,
  baselineDir: string | undefined,
  archives: BatchInspectedArchive[],
  matchedBaselineArchives: Set<string>
): Promise<BatchInspectResult> {
  const totalBytes = archives.reduce((sum, archive) => sum + archive.archiveSizeBytes, 0);
  const totalEntries = archives.reduce((sum, archive) => sum + archive.entryCount, 0);
  const duplicateCoordinates = collectDuplicateCoordinates(archives);
  const multiVersionSkills = collectMultiVersionSkills(archives);

  const entryCounts = new Map<string, { count: number; archives: Set<string> }>();
  const largestEntries = archives
    .flatMap((archive) =>
      archive.largestEntries.map((entry) => ({
        relativePath: archive.relativePath,
        path: entry.path,
        size: entry.size
      }))
    )
    .sort((left, right) => right.size - left.size || left.path.localeCompare(right.path))
    .slice(0, 5);

  for (const archive of archives) {
    for (const entryPath of archive.entryPaths) {
      const current = entryCounts.get(entryPath) ?? { count: 0, archives: new Set<string>() };
      current.count += 1;
      current.archives.add(archive.relativePath);
      entryCounts.set(entryPath, current);
    }
  }

  const changedPathCounts = new Map<string, { count: number; changeKinds: Set<string>; archives: Set<string> }>();
  const metadataCounts = new Map<"name" | "description" | "version", { count: number; archives: Set<string> }>();
  let baselineCompared = 0;
  let releaseChanged = 0;
  let baselineMissing = 0;

  for (const archive of archives) {
    if (archive.releaseComparison) {
      baselineCompared += 1;
      if (!archive.releaseComparison.matches) {
        releaseChanged += 1;
      }

      for (const entry of archive.releaseComparison.changedEntries) {
        const current = changedPathCounts.get(entry.path) ?? {
          count: 0,
          changeKinds: new Set<string>(),
          archives: new Set<string>()
        };
        current.count += 1;
        current.changeKinds.add(entry.reason);
        current.archives.add(archive.relativePath);
        changedPathCounts.set(entry.path, current);
      }

      for (const entry of archive.releaseComparison.addedEntries) {
        const current = changedPathCounts.get(entry) ?? {
          count: 0,
          changeKinds: new Set<string>(),
          archives: new Set<string>()
        };
        current.count += 1;
        current.changeKinds.add("added");
        current.archives.add(archive.relativePath);
        changedPathCounts.set(entry, current);
      }

      for (const entry of archive.releaseComparison.removedEntries) {
        const current = changedPathCounts.get(entry) ?? {
          count: 0,
          changeKinds: new Set<string>(),
          archives: new Set<string>()
        };
        current.count += 1;
        current.changeKinds.add("removed");
        current.archives.add(archive.relativePath);
        changedPathCounts.set(entry, current);
      }

      for (const difference of archive.releaseComparison.metadataDifferences) {
        const current = metadataCounts.get(difference.field) ?? { count: 0, archives: new Set<string>() };
        current.count += 1;
        current.archives.add(archive.relativePath);
        metadataCounts.set(difference.field, current);
      }
    } else if (baselineDir && archive.baselineLookup && !archive.baselineLookup.resolvedArchivePath) {
      baselineMissing += 1;
    }
  }

  return {
    rootDir,
    baselineDir: baselineDir ? path.resolve(baselineDir) : undefined,
    archiveCount: archives.length,
    summary: {
      totalBytes,
      totalEntries,
      baselineCompared,
      releaseChanged,
      baselineMissing,
      duplicateCoordinates: duplicateCoordinates.length,
      multiVersionSkills: multiVersionSkills.length
    },
    inventorySummary: {
      largestArchives: archives
        .map((archive) => ({
          relativePath: archive.relativePath,
          archivePath: archive.archivePath,
          archiveSizeBytes: archive.archiveSizeBytes,
          entryCount: archive.entryCount
        }))
        .sort((left, right) => right.archiveSizeBytes - left.archiveSizeBytes || left.relativePath.localeCompare(right.relativePath))
        .slice(0, 5),
      largestEntries,
      commonEntries: [...entryCounts.entries()]
        .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
        .slice(0, 10)
        .map(([entryPath, value]) => ({
          path: entryPath,
          archiveCount: value.count,
          archives: [...value.archives].sort((left, right) => left.localeCompare(right))
        }))
    },
    identitySummary: {
      duplicateCoordinates,
      multiVersionSkills
    },
    releaseSummary: baselineDir
      ? {
          changedPaths: [...changedPathCounts.entries()]
            .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
            .slice(0, 10)
            .map(([entryPath, value]) => ({
              path: entryPath,
              count: value.count,
              changeKinds: [...value.changeKinds].sort((left, right) => left.localeCompare(right)),
              archives: [...value.archives].sort((left, right) => left.localeCompare(right))
            })),
          metadataHotspots: [...metadataCounts.entries()]
            .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
            .map(([field, value]) => ({
              field,
              count: value.count,
              archives: [...value.archives].sort((left, right) => left.localeCompare(right))
            }))
        }
      : undefined,
    baselineSummary: baselineDir
      ? await summarizeBaselineCoverage(path.resolve(baselineDir), archives, matchedBaselineArchives)
      : undefined,
    operationsSummary: {
      duplicateReleaseCoordinates: duplicateCoordinates.map((entry) => `${entry.name}@${entry.version}`),
      skillsWithVersionSpread: multiVersionSkills.map((entry) => `${entry.name}: ${entry.versions.join(", ")}`),
      archivesWithReleaseChanges: archives
        .filter((archive) => archive.releaseComparison && !archive.releaseComparison.matches)
        .map((archive) => archive.relativePath)
        .sort((left, right) => left.localeCompare(right)),
      archivesMissingBaselines: archives
        .filter((archive) => archive.baselineLookup && !archive.baselineLookup.resolvedArchivePath)
        .map((archive) => archive.relativePath)
        .sort((left, right) => left.localeCompare(right))
    },
    archives: archives.sort((left, right) => left.relativePath.localeCompare(right.relativePath))
  };
}

function buildBatchInspectReport(result: BatchInspectResult): string {
  const lines: string[] = [];
  lines.push("# SkillForge Batch Inspect Report");
  lines.push("");
  lines.push(`- Root: \`${result.rootDir}\``);
  lines.push(`- Archives: ${result.archiveCount}`);
  lines.push(`- Total archive bytes: ${formatBytes(result.summary.totalBytes)}`);
  lines.push(`- Total bundled files: ${result.summary.totalEntries}`);
  lines.push(`- Duplicate release coordinates: ${result.summary.duplicateCoordinates}`);
  lines.push(`- Skills with multiple versions: ${result.summary.multiVersionSkills}`);
  if (result.baselineDir) {
    lines.push(`- Baseline directory: \`${result.baselineDir}\``);
    lines.push(`- Baselines compared: ${result.summary.baselineCompared}`);
    lines.push(`- Release changes detected: ${result.summary.releaseChanged}`);
    lines.push(`- Baselines missing: ${result.summary.baselineMissing}`);
  }
  lines.push("");
  lines.push("## Artifact Inventory");
  lines.push("");
  if (result.inventorySummary.largestArchives.length > 0) {
    lines.push("### Largest Archives");
    for (const archive of result.inventorySummary.largestArchives) {
      lines.push(
        `- ${archive.relativePath}: ${formatBytes(archive.archiveSizeBytes)} across ${archive.entryCount} file(s) (\`${archive.archivePath}\`)`
      );
    }
  }
  if (result.inventorySummary.largestEntries.length > 0) {
    lines.push("", "### Largest Bundled Entries");
    for (const entry of result.inventorySummary.largestEntries) {
      lines.push(`- ${entry.relativePath}: \`${entry.path}\` (${formatBytes(entry.size)})`);
    }
  }
  if (result.inventorySummary.commonEntries.length > 0) {
    lines.push("", "### Common Bundled Paths");
    for (const entry of result.inventorySummary.commonEntries) {
      lines.push(`- \`${entry.path}\`: ${entry.archiveCount} archive(s) (${entry.archives.join(", ")})`);
    }
  }
  lines.push("", "## Identity Hotspots");
  if (result.identitySummary.duplicateCoordinates.length > 0) {
    lines.push("", "### Duplicate Releases");
    for (const entry of result.identitySummary.duplicateCoordinates) {
      lines.push(`- ${entry.name}@${entry.version}: ${entry.count} archive(s) (${entry.archives.join(", ")})`);
    }
  } else {
    lines.push("", "- No duplicate release coordinates detected.");
  }
  if (result.identitySummary.multiVersionSkills.length > 0) {
    lines.push("", "### Version Spread");
    for (const entry of result.identitySummary.multiVersionSkills) {
      lines.push(`- ${entry.name}: versions ${entry.versions.join(", ")} (${entry.archives.join(", ")})`);
    }
  } else {
    lines.push("", "- No skill names span multiple versions in this archive set.");
  }
  if (result.releaseSummary) {
    lines.push("", "## Release Hotspots");
    if (result.releaseSummary.changedPaths.length > 0) {
      lines.push("", "### Most Changed Paths");
      for (const hotspot of result.releaseSummary.changedPaths) {
        lines.push(
          `- \`${hotspot.path}\`: ${hotspot.count} archive(s), change kinds ${hotspot.changeKinds.join(", ")}, archives ${hotspot.archives.join(", ")}`
        );
      }
    }
    if (result.releaseSummary.metadataHotspots.length > 0) {
      lines.push("", "### Metadata Churn");
      for (const hotspot of result.releaseSummary.metadataHotspots) {
        lines.push(`- ${hotspot.field}: ${hotspot.count} archive(s) (${hotspot.archives.join(", ")})`);
      }
    }
  }
  if (result.baselineSummary) {
    lines.push("", "## Baseline Coverage");
    lines.push(`- Requested directory: \`${result.baselineSummary.requestedDir}\``);
    lines.push(`- Compared: ${result.baselineSummary.compared}`);
    lines.push(`- Changed: ${result.baselineSummary.changed}`);
    lines.push(`- Unchanged: ${result.baselineSummary.unchanged}`);
    lines.push(`- Missing baselines: ${result.baselineSummary.missingArchives.length}`);
    lines.push(`- Orphaned baseline archives: ${result.baselineSummary.orphanedArchives.length}`);
    if (result.baselineSummary.missingArchives.length > 0) {
      lines.push("", "### Missing Baselines");
      for (const archive of result.baselineSummary.missingArchives) {
        lines.push(`- ${archive}`);
      }
    }
    if (result.baselineSummary.orphanedArchives.length > 0) {
      lines.push("", "### Orphaned Baselines");
      for (const archive of result.baselineSummary.orphanedArchives) {
        lines.push(`- \`${archive}\``);
      }
    }
  }
  lines.push("", "## Archives", "");
  for (const archive of result.archives) {
    lines.push(`### ${archive.relativePath}`);
    lines.push("");
    lines.push(`- Skill: ${archive.skill.name}@${archive.skill.version}`);
    lines.push(`- Description: ${archive.skill.description}`);
    lines.push(`- Archive size: ${archive.archiveSizeLabel}`);
    lines.push(`- Bundled files: ${archive.entryCount}`);
    if (archive.groups.length > 0) {
      lines.push(`- Layout: ${archive.groups.map((group) => `${group.label} ${group.fileCount} file(s)`).join("; ")}`);
    }
    if (archive.releaseComparison) {
      lines.push(
        `- Release delta: ${archive.releaseComparison.matches ? "matches baseline archive" : "release changed"} (${archive.releaseComparison.matchedEntries}/${archive.releaseComparison.baselineEntryCount} baseline entries matched)`
      );
    } else if (archive.baselineLookup?.requestedDir) {
      lines.push(
        `- Baseline archive: ${archive.baselineLookup.resolvedArchivePath ? `\`${archive.baselineLookup.resolvedArchivePath}\`` : `not found under \`${archive.baselineLookup.requestedDir}\``}`
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function summarizeBaselineCoverage(
  requestedDir: string,
  archives: BatchInspectedArchive[],
  matchedBaselineArchives: Set<string>
): Promise<NonNullable<BatchInspectResult["baselineSummary"]>> {
  const baselineArchives = await listSkillArchives(requestedDir);
  const orphanedArchives = baselineArchives.filter((archive) => !matchedBaselineArchives.has(archive));

  return {
    requestedDir,
    compared: archives.filter((archive) => Boolean(archive.releaseComparison)).length,
    changed: archives.filter((archive) => archive.releaseComparison && !archive.releaseComparison.matches).length,
    unchanged: archives.filter((archive) => archive.releaseComparison?.matches).length,
    missingArchives: archives
      .filter((archive) => archive.baselineLookup?.requestedDir && !archive.baselineLookup.resolvedArchivePath)
      .map((archive) => archive.relativePath)
      .sort((left, right) => left.localeCompare(right)),
    orphanedArchives: orphanedArchives.sort((left, right) => left.localeCompare(right))
  };
}

async function discoverArchivePaths(rootDir: string): Promise<string[]> {
  const archivePaths = await listSkillArchives(rootDir);
  return archivePaths.sort((left, right) => left.localeCompare(right));
}

async function listSkillArchives(rootDir: string): Promise<string[]> {
  if (!(await exists(rootDir))) {
    return [];
  }

  const results: string[] = [];
  const ignored = new Set([".git", "node_modules"]);

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (!ignored.has(entry.name)) {
          await walk(fullPath);
        }
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".skill")) {
        results.push(path.resolve(fullPath));
      }
    }
  }

  const rootStat = await stat(rootDir);
  if (rootStat.isFile() && rootDir.endsWith(".skill")) {
    return [path.resolve(rootDir)];
  }
  if (rootStat.isFile()) {
    return [];
  }

  await walk(rootDir);
  return results;
}

function collectDuplicateCoordinates(archives: BatchInspectedArchive[]): BatchInspectResult["identitySummary"]["duplicateCoordinates"] {
  const grouped = new Map<string, { name: string; version: string; archives: string[] }>();
  for (const archive of archives) {
    const key = `${archive.skill.name}@${archive.skill.version}`;
    const current = grouped.get(key) ?? {
      name: archive.skill.name,
      version: archive.skill.version,
      archives: []
    };
    current.archives.push(archive.relativePath);
    grouped.set(key, current);
  }

  return [...grouped.values()]
    .filter((entry) => entry.archives.length > 1)
    .sort((left, right) => right.archives.length - left.archives.length || left.name.localeCompare(right.name))
    .map((entry) => ({
      name: entry.name,
      version: entry.version,
      count: entry.archives.length,
      archives: entry.archives.sort((left, right) => left.localeCompare(right))
    }));
}

function collectMultiVersionSkills(archives: BatchInspectedArchive[]): BatchInspectResult["identitySummary"]["multiVersionSkills"] {
  const grouped = new Map<string, { versions: Set<string>; archives: Set<string> }>();
  for (const archive of archives) {
    const current = grouped.get(archive.skill.name) ?? { versions: new Set<string>(), archives: new Set<string>() };
    current.versions.add(archive.skill.version);
    current.archives.add(archive.relativePath);
    grouped.set(archive.skill.name, current);
  }

  return [...grouped.entries()]
    .filter(([, value]) => value.versions.size > 1)
    .sort((left, right) => right[1].versions.size - left[1].versions.size || left[0].localeCompare(right[0]))
    .map(([name, value]) => ({
      name,
      versions: [...value.versions].sort((left, right) => left.localeCompare(right)),
      archives: [...value.archives].sort((left, right) => left.localeCompare(right))
    }));
}

async function writeBatchInspectReport(result: BatchInspectResult, reportPath?: string | boolean): Promise<string | undefined> {
  if (typeof reportPath === "undefined") {
    return undefined;
  }

  const destination =
    reportPath === true
      ? path.join(result.rootDir, ".skillforge", "inspect-all.report.md")
      : typeof reportPath === "string"
        ? path.resolve(reportPath)
        : undefined;
  if (!destination) {
    return undefined;
  }

  await writeTextFile(destination, buildBatchInspectReport(result));
  return destination;
}

async function writeBatchInspectIndex(result: BatchInspectResult, indexPath?: string | boolean): Promise<string | undefined> {
  if (typeof indexPath === "undefined" || indexPath === false) {
    return undefined;
  }

  const destination =
    indexPath === true
      ? path.join(result.rootDir, ".skillforge", "inspect-all.index.json")
      : path.resolve(String(indexPath));

  await writeTextFile(destination, JSON.stringify(result, null, 2));
  return destination;
}

async function resolveBatchBaselineArchive(
  baselineDir: string | undefined,
  relativePath: string,
  name: string
): Promise<BatchInspectedArchive["baselineLookup"] | undefined> {
  if (!baselineDir) {
    return undefined;
  }

  const requestedDir = path.resolve(baselineDir);
  const candidateRelative = relativePath === "." ? "root.skill" : relativePath;
  const candidates = [path.join(requestedDir, candidateRelative), path.join(requestedDir, `${name}.skill`)];
  const dedupedCandidates = [...new Set(candidates.map((candidate) => path.resolve(candidate)))];
  for (const candidate of dedupedCandidates) {
    if (await exists(candidate)) {
      return {
        requestedDir,
        resolvedArchivePath: candidate
      };
    }
  }

  return {
    requestedDir
  };
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
