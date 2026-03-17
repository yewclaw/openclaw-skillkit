import path from "node:path";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { ensureDir, exists, listFilesRecursive, readTextFile, writeTextFile } from "./fs";
import { parseFrontmatter } from "./frontmatter";
import { type LintResult, lintSkill } from "./skill";
import { TEMPLATE_MODES, type TemplateMode } from "./templates";
import {
  createSkillArchive,
  readArchiveEntryBuffer,
  readArchiveManifest,
  type SkillArchiveManifest
} from "./zip";

export interface LintSummary {
  total: number;
  errors: number;
  warnings: number;
}

export interface FocusAreaSummary {
  category: string;
  label: string;
  errors: number;
  warnings: number;
  suggestion: string;
}

export interface ExampleSkillSummary {
  name: string;
  absolutePath: string;
  relativePath: string;
  title: string;
  description: string;
  version: string;
  resources: string[];
  recommendedTemplate: TemplateMode;
  suggestedTargetDir: string;
  starterCommand: string;
  useCases: string[];
  workflowSteps: string[];
  workflowPreview: string;
}

export interface PackSkillResult {
  resolvedDir: string;
  destination: string;
  normalizedOutputPath: boolean;
  warnings: LintResult["issues"];
  archiveSizeBytes: number;
  archiveSizeLabel: string;
  manifest: SkillArchiveManifest;
}

export type ReviewReadiness = "ready" | "ready-with-warnings" | "not-ready";

export interface SkillReviewResult {
  skillDir: string;
  readiness: ReviewReadiness;
  lint: {
    fileCount: number;
    summary: LintSummary;
    focusAreas: FocusAreaSummary[];
    nextSteps: string[];
    issues: LintResult["issues"];
  };
  archive?: PackSkillResult & {
    comparison: ArchiveSourceComparison;
    releaseComparison?: ArchiveReleaseComparison;
  };
}

export interface ArchiveSourceComparison {
  sourceDir: string;
  comparedAt: string;
  metadataMatches: boolean;
  matches: boolean;
  entryCount: number;
  matchedEntries: number;
  missingFromSource: string[];
  changedEntries: Array<{
    path: string;
    archiveSize: number;
    sourceSize: number;
    reason: "size-mismatch" | "hash-mismatch";
  }>;
  extraSourceEntries: string[];
  metadataDifferences: Array<{
    field: "name" | "description" | "version";
    archiveValue: string;
    sourceValue: string;
  }>;
}

export interface ArchiveReleaseComparison {
  baselineArchivePath: string;
  comparedAt: string;
  currentArchivePath: string;
  metadataMatches: boolean;
  matches: boolean;
  entryCount: number;
  baselineEntryCount: number;
  matchedEntries: number;
  addedEntries: string[];
  removedEntries: string[];
  changedEntries: Array<{
    path: string;
    currentSize: number;
    baselineSize: number;
    reason: "size-mismatch" | "hash-mismatch";
  }>;
  metadataDifferences: Array<{
    field: "name" | "description" | "version";
    currentValue: string;
    baselineValue: string;
  }>;
}

export interface InspectedArchiveResult {
  archivePath: string;
  manifest: SkillArchiveManifest;
  comparison?: ArchiveSourceComparison;
  releaseComparison?: ArchiveReleaseComparison;
  archiveInsights?: ArchiveInsights;
  entryPreview?: ArchiveEntryPreview;
}

export interface ArchiveInsights {
  groups: Array<{
    label: string;
    fileCount: number;
    totalBytes: number;
  }>;
  largestEntries: Array<{
    path: string;
    size: number;
  }>;
}

export interface ArchiveEntryPreview {
  path: string;
  size: number;
  sha256?: string;
  text: boolean;
  truncated: boolean;
  lineCount: number;
  preview: string;
}

export type AssessmentStatus = "pass" | "warn" | "fail";

export interface AssessmentCheck {
  label: string;
  status: AssessmentStatus;
  detail: string;
}

export interface ArchiveTrustSummary {
  status: "verified" | "matching-source" | "drift-detected";
  headline: string;
  confidence: string;
  checks: AssessmentCheck[];
  nextStep?: string;
}

export interface ReviewSummary {
  headline: string;
  confidence: string;
  checks: AssessmentCheck[];
}

export interface ReleaseDeltaSummary {
  status: "same-release" | "release-changed";
  headline: string;
  confidence: string;
  checks: AssessmentCheck[];
}

export function summarizeLintResult(result: LintResult): LintSummary {
  const errors = result.issues.filter((issue) => issue.level === "error").length;
  const warnings = result.issues.filter((issue) => issue.level === "warning").length;

  return {
    total: result.issues.length,
    errors,
    warnings
  };
}

export function summarizeFocusAreas(result: LintResult): FocusAreaSummary[] {
  const grouped = new Map<string, { errors: number; warnings: number }>();

  for (const issue of result.issues) {
    const current = grouped.get(issue.category) ?? { errors: 0, warnings: 0 };
    current[issue.level === "error" ? "errors" : "warnings"] += 1;
    grouped.set(issue.category, current);
  }

  return [...grouped.entries()]
    .sort((left, right) => {
      const leftCounts = left[1];
      const rightCounts = right[1];
      return (
        rightCounts.errors - leftCounts.errors ||
        rightCounts.warnings - leftCounts.warnings ||
        left[0].localeCompare(right[0])
      );
    })
    .map(([category, counts]) => ({
      category,
      label: CATEGORY_GUIDANCE[category].label,
      errors: counts.errors,
      warnings: counts.warnings,
      suggestion: CATEGORY_GUIDANCE[category].suggestion
    }));
}

export function buildActionPlan(result: LintResult, resolvedDir: string): string[] {
  const focusAreas = summarizeFocusAreas(result);

  if (focusAreas.length === 0) {
    return [
      `Pack when ready: openclaw-skillkit pack ${resolvedDir}`,
      `Run a release check before handoff: openclaw-skillkit review ${resolvedDir}`
    ];
  }

  const steps: string[] = [];
  const blockingArea = focusAreas.find((area) => area.errors > 0);

  if (blockingArea) {
    steps.push(`Fix blocking ${blockingArea.label.toLowerCase()} issues first. ${blockingArea.suggestion}`);
  }

  const warningArea = focusAreas.find((area) => area.warnings > 0 && area.category !== blockingArea?.category);
  if (warningArea) {
    steps.push(`Then review ${warningArea.label.toLowerCase()} warnings. ${warningArea.suggestion}`);
  }

  steps.push(`Re-run: openclaw-skillkit lint ${resolvedDir}`);

  if (!blockingArea) {
    steps.push(`Pack when ready: openclaw-skillkit pack ${resolvedDir}`);
    steps.push(`Run a release check before handoff: openclaw-skillkit review ${resolvedDir}`);
  }

  return steps;
}

export function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }

  return `${(size / 1024).toFixed(1)} KB`;
}

export function resolveArchiveDestination(
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

export async function packSkill(targetDir: string, outputPath?: string): Promise<PackSkillResult> {
  const resolvedDir = path.resolve(targetDir);
  const lintResult = await lintSkill(resolvedDir);
  const errors = lintResult.issues.filter((issue) => issue.level === "error");
  const warnings = lintResult.issues.filter((issue) => issue.level === "warning");

  if (errors.length > 0) {
    throw new Error(
      `Cannot pack ${resolvedDir} because lint found ${errors.length} error(s). Run "openclaw-skillkit lint ${resolvedDir}" first.`
    );
  }

  const { destination, normalizedOutputPath } = resolveArchiveDestination(resolvedDir, outputPath);

  if (await exists(destination)) {
    throw new Error(`Output already exists: ${destination}`);
  }

  await ensureDir(path.dirname(destination));

  const archive = await createSkillArchive(resolvedDir, destination);
  const archiveStat = await stat(destination);

  return {
    resolvedDir,
    destination,
    normalizedOutputPath,
    warnings,
    archiveSizeBytes: archiveStat.size,
    archiveSizeLabel: formatBytes(archiveStat.size),
    manifest: archive.manifest
  };
}

export async function inspectSkillArchive(
  archivePath: string,
  options: { entryPath?: string } = {}
): Promise<InspectedArchiveResult> {
  const resolvedArchivePath = path.resolve(archivePath);
  const manifest = await readArchiveManifest(resolvedArchivePath);
  const entryPreview = options.entryPath
    ? await previewArchiveEntry(resolvedArchivePath, manifest, options.entryPath)
    : undefined;

  return {
    archivePath: resolvedArchivePath,
    manifest,
    archiveInsights: summarizeArchiveContents(manifest),
    entryPreview
  };
}

export async function reviewSkill(
  targetDir: string,
  outputPath?: string,
  baselineArchivePath?: string
): Promise<SkillReviewResult> {
  const resolvedDir = path.resolve(targetDir);
  const lintResult = await lintSkill(resolvedDir);
  const summary = summarizeLintResult(lintResult);
  const focusAreas = summarizeFocusAreas(lintResult);
  const nextSteps = buildActionPlan(lintResult, resolvedDir);
  const review: SkillReviewResult = {
    skillDir: resolvedDir,
    readiness: summary.errors > 0 ? "not-ready" : summary.warnings > 0 ? "ready-with-warnings" : "ready",
    lint: {
      fileCount: lintResult.fileCount,
      summary,
      focusAreas,
      nextSteps,
      issues: lintResult.issues
    }
  };

  if (summary.errors > 0) {
    return review;
  }

  const packed = await packSkill(resolvedDir, outputPath);
  const inspected = await compareArchiveToSource(packed.destination, resolvedDir);
  if (!inspected.comparison) {
    throw new Error("Expected source comparison for review workflow.");
  }

  review.archive = {
    ...packed,
    comparison: inspected.comparison
  };

  if (baselineArchivePath) {
    const releaseCompared = await compareArchives(packed.destination, baselineArchivePath);
    review.archive.releaseComparison = releaseCompared.releaseComparison;
  }

  if (!inspected.comparison.matches) {
    review.readiness = "not-ready";
  }

  return review;
}

export async function compareArchiveToSource(
  archivePath: string,
  sourceDir: string,
  options: { entryPath?: string } = {}
): Promise<InspectedArchiveResult> {
  const inspected = await inspectSkillArchive(archivePath, options);
  const resolvedSourceDir = path.resolve(sourceDir);
  const sourceSkillFile = path.join(resolvedSourceDir, "SKILL.md");

  if (!(await exists(sourceSkillFile))) {
    throw new Error(`Missing SKILL.md at source directory: ${resolvedSourceDir}`);
  }

  const sourceMarkdown = await readTextFile(sourceSkillFile);
  const sourceFrontmatter = parseFrontmatter(sourceMarkdown).attributes;
  const sourceFiles = (await readdirRecursiveWithHashes(resolvedSourceDir))
    .filter((file) => !file.relativePath.endsWith(".skill"))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));

  const sourceByPath = new Map(
    sourceFiles.map((file) => [
      file.relativePath.split(path.sep).join("/"),
      {
        size: file.size,
        sha256: file.sha256
      }
    ])
  );
  const metadataDifferences = [
    compareMetadataField("name", inspected.manifest.skill.name, sourceFrontmatter.name),
    compareMetadataField("description", inspected.manifest.skill.description, sourceFrontmatter.description),
    compareMetadataField("version", inspected.manifest.skill.version, sourceFrontmatter.version)
  ].filter(Boolean) as ArchiveSourceComparison["metadataDifferences"];
  const missingFromSource: string[] = [];
  const changedEntries: ArchiveSourceComparison["changedEntries"] = [];
  let matchedEntries = 0;

  for (const entry of inspected.manifest.entries) {
    const sourceEntry = sourceByPath.get(entry.path);
    if (!sourceEntry) {
      missingFromSource.push(entry.path);
      continue;
    }

    sourceByPath.delete(entry.path);

    if (sourceEntry.size !== entry.size) {
      changedEntries.push({
        path: entry.path,
        archiveSize: entry.size,
        sourceSize: sourceEntry.size,
        reason: "size-mismatch"
      });
      continue;
    }

    if (entry.sha256 && sourceEntry.sha256 !== entry.sha256) {
      changedEntries.push({
        path: entry.path,
        archiveSize: entry.size,
        sourceSize: sourceEntry.size,
        reason: "hash-mismatch"
      });
      continue;
    }

    matchedEntries += 1;
  }

  const extraSourceEntries = [...sourceByPath.keys()].sort((left, right) => left.localeCompare(right));
  const metadataMatches = metadataDifferences.length === 0;
  const matches =
    metadataMatches && missingFromSource.length === 0 && changedEntries.length === 0 && extraSourceEntries.length === 0;

  return {
    archivePath: inspected.archivePath,
    manifest: inspected.manifest,
    comparison: {
      sourceDir: resolvedSourceDir,
      comparedAt: new Date().toISOString(),
      metadataMatches,
      matches,
      entryCount: inspected.manifest.entryCount,
      matchedEntries,
      missingFromSource,
      changedEntries,
      extraSourceEntries,
      metadataDifferences
    }
  };
}

export async function compareArchives(
  archivePath: string,
  baselineArchivePath: string,
  options: { entryPath?: string } = {}
): Promise<InspectedArchiveResult> {
  const current = await inspectSkillArchive(archivePath, options);
  const baseline = await inspectSkillArchive(baselineArchivePath);
  const currentByPath = new Map(
    current.manifest.entries.map((entry) => [
      entry.path,
      {
        size: entry.size,
        sha256: entry.sha256
      }
    ])
  );
  const metadataDifferences = [
    compareArchiveMetadataField("name", current.manifest.skill.name, baseline.manifest.skill.name),
    compareArchiveMetadataField("description", current.manifest.skill.description, baseline.manifest.skill.description),
    compareArchiveMetadataField("version", current.manifest.skill.version, baseline.manifest.skill.version)
  ].filter(Boolean) as ArchiveReleaseComparison["metadataDifferences"];
  const removedEntries: string[] = [];
  const changedEntries: ArchiveReleaseComparison["changedEntries"] = [];
  let matchedEntries = 0;

  for (const baselineEntry of baseline.manifest.entries) {
    const currentEntry = currentByPath.get(baselineEntry.path);
    if (!currentEntry) {
      removedEntries.push(baselineEntry.path);
      continue;
    }

    currentByPath.delete(baselineEntry.path);

    if (currentEntry.size !== baselineEntry.size) {
      changedEntries.push({
        path: baselineEntry.path,
        currentSize: currentEntry.size,
        baselineSize: baselineEntry.size,
        reason: "size-mismatch"
      });
      continue;
    }

    if (baselineEntry.sha256 && currentEntry.sha256 !== baselineEntry.sha256) {
      changedEntries.push({
        path: baselineEntry.path,
        currentSize: currentEntry.size,
        baselineSize: baselineEntry.size,
        reason: "hash-mismatch"
      });
      continue;
    }

    matchedEntries += 1;
  }

  const addedEntries = [...currentByPath.keys()].sort((left, right) => left.localeCompare(right));
  const metadataMatches = metadataDifferences.length === 0;
  const matches = metadataMatches && addedEntries.length === 0 && removedEntries.length === 0 && changedEntries.length === 0;

  return {
    archivePath: current.archivePath,
    manifest: current.manifest,
    releaseComparison: {
      baselineArchivePath: baseline.archivePath,
      currentArchivePath: current.archivePath,
      comparedAt: new Date().toISOString(),
      metadataMatches,
      matches,
      entryCount: current.manifest.entryCount,
      baselineEntryCount: baseline.manifest.entryCount,
      matchedEntries,
      addedEntries,
      removedEntries,
      changedEntries,
      metadataDifferences
    }
  };
}

export function resolveArchiveReportPath(archivePath: string, requestedPath?: string | boolean): string | undefined {
  if (!requestedPath) {
    return undefined;
  }

  if (requestedPath === true) {
    return path.resolve(defaultArchiveReportFileName(archivePath));
  }

  return path.resolve(requestedPath);
}

export function resolveReviewReportPath(
  review: SkillReviewResult,
  requestedPath?: string | boolean
): string | undefined {
  if (!requestedPath) {
    return undefined;
  }

  if (requestedPath === true) {
    return path.resolve(defaultReviewReportFileName(review.skillDir, review.archive?.destination));
  }

  return path.resolve(requestedPath);
}

export async function writeArchiveReport(
  archivePath: string,
  result: InspectedArchiveResult,
  requestedPath?: string | boolean
): Promise<string | undefined> {
  const reportPath = resolveArchiveReportPath(archivePath, requestedPath);
  if (!reportPath) {
    return undefined;
  }

  await writeTextFile(reportPath, buildArchiveReport(result));
  return reportPath;
}

export async function writeReviewReport(
  review: SkillReviewResult,
  requestedPath?: string | boolean
): Promise<string | undefined> {
  const reportPath = resolveReviewReportPath(review, requestedPath);
  if (!reportPath) {
    return undefined;
  }

  await writeTextFile(reportPath, buildReviewReport(review));
  return reportPath;
}

export function summarizeArchiveContents(manifest: SkillArchiveManifest): ArchiveInsights {
  const grouped = new Map<string, { label: string; fileCount: number; totalBytes: number }>();

  for (const entry of manifest.entries) {
    const root = entry.path.includes("/") ? entry.path.split("/")[0] : "root";
    const label = root === "root" ? "root files" : `${root}/`;
    const current = grouped.get(label) ?? { label, fileCount: 0, totalBytes: 0 };
    current.fileCount += 1;
    current.totalBytes += entry.size;
    grouped.set(label, current);
  }

  return {
    groups: [...grouped.values()].sort((left, right) => right.totalBytes - left.totalBytes || left.label.localeCompare(right.label)),
    largestEntries: [...manifest.entries]
      .sort((left, right) => right.size - left.size || left.path.localeCompare(right.path))
      .slice(0, 3)
      .map((entry) => ({
        path: entry.path,
        size: entry.size
      }))
  };
}

export async function previewArchiveEntry(
  archivePath: string,
  manifest: SkillArchiveManifest,
  entryPath: string
): Promise<ArchiveEntryPreview> {
  const requestedPath = entryPath.trim();
  const entry = manifest.entries.find((candidate) => candidate.path === requestedPath);
  if (!entry) {
    throw new Error(`Archive entry not found in manifest: ${requestedPath}`);
  }

  const buffer = await readArchiveEntryBuffer(archivePath, requestedPath);
  const text = isLikelyTextBuffer(buffer);

  if (!text) {
    return {
      path: requestedPath,
      size: entry.size,
      sha256: entry.sha256,
      text: false,
      truncated: false,
      lineCount: 0,
      preview: "Preview unavailable because this entry appears to be binary."
    };
  }

  const rawText = buffer.toString("utf8");
  const lines = rawText.split(/\r?\n/);
  const maxLines = 80;
  const visibleLines = lines.slice(0, maxLines);
  let preview = visibleLines.join("\n");
  const truncated = lines.length > maxLines || Buffer.byteLength(preview, "utf8") < buffer.length;

  if (preview.length > 6000) {
    preview = preview.slice(0, 6000);
  }

  if (truncated) {
    preview = `${preview}\n\n[preview truncated]`;
  }

  return {
    path: requestedPath,
    size: entry.size,
    sha256: entry.sha256,
    text: true,
    truncated,
    lineCount: lines.length,
    preview
  };
}

export function buildArchiveReport(result: InspectedArchiveResult): string {
  const generatedAt = new Date().toISOString();
  const trust = summarizeArchiveTrust(result);
  const insights = result.archiveInsights ?? summarizeArchiveContents(result.manifest);
  const lines = [
    "# OpenClaw Skill Archive Report",
    "",
    `Generated: ${generatedAt}`,
    "",
    "## Trust Summary",
    `- Headline: ${trust.headline}`,
    `- Confidence: ${trust.confidence}`,
    "",
    "### Checks"
  ];

  for (const check of trust.checks) {
    lines.push(`- ${formatAssessmentStatus(check.status)} ${check.label}: ${check.detail}`);
  }

  if (trust.nextStep) {
    lines.push(`- Next step: ${trust.nextStep}`);
  }

  lines.push(
    "",
    "## Archive",
    `- Archive: ${result.archivePath}`,
    `- Skill: ${result.manifest.skill.name}@${result.manifest.skill.version}`,
    `- Description: ${result.manifest.skill.description}`,
    `- Packaged at: ${result.manifest.packagedAt}`,
    `- Manifest schema: v${result.manifest.schemaVersion}`,
    `- Bundled files: ${result.manifest.entryCount}`,
    `- Total bundled bytes: ${formatBytes(result.manifest.totalBytes)}`,
    "",
    "## Layout"
  );

  for (const group of insights.groups) {
    lines.push(`- ${group.label}: ${group.fileCount} file(s), ${formatBytes(group.totalBytes)}`);
  }

  lines.push(
    "",
    "## Largest Files"
  );

  for (const entry of insights.largestEntries) {
    lines.push(`- \`${entry.path}\` (${formatBytes(entry.size)})`);
  }

  lines.push(
    "",
    "## Contents"
  );

  for (const entry of result.manifest.entries) {
    lines.push(`- \`${entry.path}\` (${formatBytes(entry.size)}, sha256 \`${entry.sha256 ?? "n/a"}\`)`);
  }

  lines.push("", "## Review Status");

  if (result.comparison) {
    lines.push(
      `- Source: ${result.comparison.sourceDir}`,
      `- Compared at: ${result.comparison.comparedAt}`,
      `- Status: ${result.comparison.matches ? "matches source" : "drift detected"}`,
      `- Matched archive entries: ${result.comparison.matchedEntries}/${result.comparison.entryCount}`
    );

    if (result.comparison.metadataDifferences.length > 0) {
      lines.push("", "### Metadata Drift");
      for (const difference of result.comparison.metadataDifferences) {
        lines.push(
          `- ${difference.field}: archive="${difference.archiveValue}" source="${difference.sourceValue}"`
        );
      }
    }

    if (result.comparison.changedEntries.length > 0) {
      lines.push("", "### Changed Files");
      for (const entry of result.comparison.changedEntries) {
        lines.push(
          `- ${entry.path}: ${entry.reason} (archive ${formatBytes(entry.archiveSize)}, source ${formatBytes(entry.sourceSize)})`
        );
      }
    }

    if (result.comparison.missingFromSource.length > 0) {
      lines.push("", "### Missing From Source");
      for (const entry of result.comparison.missingFromSource) {
        lines.push(`- ${entry}`);
      }
    }

    if (result.comparison.extraSourceEntries.length > 0) {
      lines.push("", "### New In Source");
      for (const entry of result.comparison.extraSourceEntries) {
        lines.push(`- ${entry}`);
      }
    }
  }

  if (result.releaseComparison) {
    const releaseDelta = summarizeReleaseDelta(result);
    lines.push(
      "",
      "## Release Delta",
      `- Headline: ${releaseDelta.headline}`,
      `- Confidence: ${releaseDelta.confidence}`,
      `- Baseline archive: ${result.releaseComparison.baselineArchivePath}`,
      `- Compared at: ${result.releaseComparison.comparedAt}`,
      `- Status: ${result.releaseComparison.matches ? "no release delta detected" : "release changed"}`,
      `- Matched files: ${result.releaseComparison.matchedEntries}/${result.releaseComparison.baselineEntryCount}`
    );

    lines.push("", "### Delta Checks");
    for (const check of releaseDelta.checks) {
      lines.push(`- ${formatAssessmentStatus(check.status)} ${check.label}: ${check.detail}`);
    }

    if (result.releaseComparison.metadataDifferences.length > 0) {
      lines.push("", "### Metadata Changes");
      for (const difference of result.releaseComparison.metadataDifferences) {
        lines.push(
          `- ${difference.field}: current="${difference.currentValue}" baseline="${difference.baselineValue}"`
        );
      }
    }

    if (result.releaseComparison.changedEntries.length > 0) {
      lines.push("", "### Changed Since Baseline");
      for (const entry of result.releaseComparison.changedEntries) {
        lines.push(
          `- ${entry.path}: ${entry.reason} (current ${formatBytes(entry.currentSize)}, baseline ${formatBytes(entry.baselineSize)})`
        );
      }
    }

    if (result.releaseComparison.addedEntries.length > 0) {
      lines.push("", "### Added Since Baseline");
      for (const entry of result.releaseComparison.addedEntries) {
        lines.push(`- ${entry}`);
      }
    }

    if (result.releaseComparison.removedEntries.length > 0) {
      lines.push("", "### Removed Since Baseline");
      for (const entry of result.releaseComparison.removedEntries) {
        lines.push(`- ${entry}`);
      }
    }
  }

  if (!result.comparison) {
    lines.push(`- Status: packaged artifact reviewed without source comparison`);
    lines.push(`- Next: run \`openclaw-skillkit inspect ${result.archivePath} --source ./path-to-skill\` to include drift status`);
  }

  if (result.entryPreview) {
    lines.push(
      "",
      "## Entry Preview",
      `- Entry: ${result.entryPreview.path}`,
      `- Size: ${formatBytes(result.entryPreview.size)}`,
      `- Lines: ${result.entryPreview.lineCount}`,
      `- Text preview: ${result.entryPreview.text ? "yes" : "no"}`
    );

    lines.push("", "```text", result.entryPreview.preview, "```");
  }

  lines.push(
    "",
    "## Reviewer Checklist",
    "- Confirm the skill name, version, and description match the release you intend to share.",
    "- Confirm every referenced helper file is bundled in the archive contents above.",
    "- If source comparison was included, resolve any reported drift before publication.",
    "- If a baseline archive was included, confirm the release delta matches what you intended to ship."
  );

  return lines.join("\n");
}

export function buildReviewReport(review: SkillReviewResult): string {
  const summary = summarizeReviewReadiness(review);
  const lines = [
    "# OpenClaw Skill Review Report",
    "",
    `Generated: ${new Date().toISOString()}`,
    "",
    "## Release Summary",
    `- Headline: ${summary.headline}`,
    `- Confidence: ${summary.confidence}`,
    "",
    "### Checks"
  ];

  for (const check of summary.checks) {
    lines.push(`- ${formatAssessmentStatus(check.status)} ${check.label}: ${check.detail}`);
  }

  lines.push(
    "",
    "## Readiness",
    `- Skill directory: ${review.skillDir}`,
    `- Verdict: ${formatReviewReadiness(review.readiness)}`,
    `- Files checked: ${review.lint.fileCount}`,
    `- Lint summary: ${review.lint.summary.errors} error(s), ${review.lint.summary.warnings} warning(s)`
  );

  if (review.lint.focusAreas.length > 0) {
    lines.push("", "## Focus Areas");
    for (const area of review.lint.focusAreas) {
      lines.push(`- ${area.label}: ${area.errors} error(s), ${area.warnings} warning(s)`);
    }
  }

  if (review.lint.issues.length > 0) {
    lines.push("", "## Issues");
    for (const issue of review.lint.issues) {
      lines.push(`- ${issue.level.toUpperCase()} [${issue.code}] ${issue.file}: ${issue.message}`);
      if (issue.suggestion) {
        lines.push(`  Fix: ${issue.suggestion}`);
      }
    }
  }

  if (review.archive) {
    lines.push(
      "",
      "## Archive",
      `- Archive: ${review.archive.destination}`,
      `- Size: ${review.archive.archiveSizeLabel}`,
      `- Skill: ${review.archive.manifest.skill.name}@${review.archive.manifest.skill.version}`,
      `- Bundled files: ${review.archive.manifest.entryCount}`,
      `- Drift check: ${review.archive.comparison.matches ? "matches source" : "drift detected"}`,
      `- Matched entries: ${review.archive.comparison.matchedEntries}/${review.archive.comparison.entryCount}`
    );

    if (review.archive.releaseComparison) {
      lines.push(
        `- Baseline archive: ${review.archive.releaseComparison.baselineArchivePath}`,
        `- Release delta: ${review.archive.releaseComparison.matches ? "matches baseline archive" : "release changed"}`,
        `- Matched baseline entries: ${review.archive.releaseComparison.matchedEntries}/${review.archive.releaseComparison.baselineEntryCount}`
      );
    }

    if (review.archive.warnings.length > 0) {
      lines.push("", "## Packaging Warnings");
      for (const warning of review.archive.warnings) {
        lines.push(`- ${warning.code}: ${warning.message}`);
      }
    }
  } else {
    lines.push("", "## Archive", "- Archive not created because blocking lint errors remain.");
  }

  if (review.lint.nextSteps.length > 0) {
    lines.push("", "## Next Steps");
    review.lint.nextSteps.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  }

  return lines.join("\n");
}

export function summarizeArchiveTrust(result: InspectedArchiveResult): ArchiveTrustSummary {
  const checks: AssessmentCheck[] = [
    {
      label: "Manifest",
      status: "pass",
      detail: `embedded manifest loaded from the packaged archive (schema v${result.manifest.schemaVersion})`
    },
    {
      label: "Contents",
      status: "pass",
      detail: `${result.manifest.entryCount} bundled file(s), ${formatBytes(result.manifest.totalBytes)} before manifest`
    }
  ];

  if (!result.comparison) {
    return {
      status: "verified",
      headline: "Archive manifest verified",
      confidence: "The packaged artifact includes a readable manifest, but source parity has not been checked yet.",
      checks,
      nextStep: `openclaw-skillkit inspect ${result.archivePath} --source ./path-to-skill`
    };
  }

  const comparison = result.comparison;
  checks.push({
    label: "Metadata",
    status: comparison.metadataMatches ? "pass" : "fail",
    detail: comparison.metadataMatches
      ? "archive metadata matches the selected source skill"
      : `${comparison.metadataDifferences.length} metadata field(s) drifted`
  });
  checks.push({
    label: "Source parity",
    status: comparison.matches ? "pass" : "fail",
    detail: comparison.matches
      ? `${comparison.matchedEntries}/${comparison.entryCount} archive entries match the source`
      : buildParityDetail(comparison)
  });

  if (comparison.matches) {
    return {
      status: "matching-source",
      headline: "Archive matches source",
      confidence: "The embedded manifest, metadata, and bundled files all align with the selected source directory.",
      checks
    };
  }

  return {
    status: "drift-detected",
    headline: "Artifact drift detected",
    confidence: "The packaged artifact no longer reflects the selected source directory, so it should be re-packed before handoff.",
    checks
  };
}

export function summarizeReviewReadiness(review: SkillReviewResult): ReviewSummary {
  const checks: AssessmentCheck[] = [
    {
      label: "Lint",
      status:
        review.lint.summary.errors > 0 ? "fail" : review.lint.summary.warnings > 0 ? "warn" : "pass",
      detail:
        review.lint.summary.errors > 0
          ? `${review.lint.summary.errors} blocking error(s), ${review.lint.summary.warnings} warning(s)`
          : review.lint.summary.warnings > 0
            ? `${review.lint.summary.warnings} warning(s) remain`
            : "no blocking errors or warnings"
    },
    {
      label: "Focus areas",
      status: review.lint.focusAreas.some((area) => area.errors > 0) ? "fail" : review.lint.focusAreas.length > 0 ? "warn" : "pass",
      detail:
        review.lint.focusAreas.length > 0
          ? review.lint.focusAreas
              .slice(0, 2)
              .map((area) => `${area.label.toLowerCase()} ${area.errors}/${area.warnings}`)
              .join(", ")
          : "no risk clusters detected"
    }
  ];

  if (!review.archive) {
    checks.push({
      label: "Archive",
      status: "fail",
      detail: "not created because blocking lint errors remain"
    });

    return {
      headline: "Not ready to ship",
      confidence: "Blocking lint issues prevent packaging, so there is no trustworthy release artifact yet.",
      checks
    };
  }

  checks.push({
    label: "Archive",
    status: review.archive.warnings.length > 0 ? "warn" : "pass",
    detail:
      review.archive.warnings.length > 0
        ? `${review.archive.warnings.length} packaging warning(s) carried into the artifact`
        : `created successfully at ${review.archive.destination}`
  });

  const trust = summarizeArchiveTrust({
    archivePath: review.archive.destination,
    manifest: review.archive.manifest,
    comparison: review.archive.comparison
  });
  checks.push({
    label: "Artifact trust",
    status: mapTrustStatusToAssessment(trust.status),
    detail: trust.headline.toLowerCase()
  });

  if (review.archive.releaseComparison) {
    checks.push({
      label: "Release delta",
      status: review.archive.releaseComparison.matches ? "pass" : "warn",
      detail: review.archive.releaseComparison.matches
        ? "no archive-level changes were detected against the baseline"
        : buildReleaseDeltaDetail(review.archive.releaseComparison)
    });
  }

  if (review.readiness === "ready") {
    return {
      headline: review.archive.releaseComparison ? "Ready to ship with reviewed release delta" : "Ready to ship",
      confidence: review.archive.releaseComparison
        ? "Lint passed cleanly, the archive matches the source, and the release delta against the baseline is captured for handoff."
        : "Lint passed cleanly, the archive was created, and the packaged artifact still matches the source.",
      checks
    };
  }

  if (review.readiness === "ready-with-warnings") {
    return {
      headline: "Ready with warnings",
      confidence: "The release is packable and trusted, but warnings still deserve a final pass before handoff.",
      checks
    };
  }

  return {
    headline: "Not ready to ship",
    confidence:
      review.archive.comparison.matches === false
        ? "The artifact no longer matches the source, so the release should be rebuilt before handoff."
        : "Blocking issues remain in the release workflow.",
    checks
  };
}

export function summarizeReleaseDelta(result: InspectedArchiveResult): ReleaseDeltaSummary {
  if (!result.releaseComparison) {
    return {
      status: "same-release",
      headline: "No baseline archive selected",
      confidence: "Select a previous .skill artifact to see exactly what changed between releases.",
      checks: []
    };
  }

  const comparison = result.releaseComparison;
  const checks: AssessmentCheck[] = [
    {
      label: "Metadata delta",
      status: comparison.metadataMatches ? "pass" : "warn",
      detail: comparison.metadataMatches
        ? "name, description, and version match the baseline archive"
        : `${comparison.metadataDifferences.length} metadata field(s) changed`
    },
    {
      label: "File delta",
      status: comparison.matches ? "pass" : "warn",
      detail: comparison.matches
        ? `${comparison.matchedEntries}/${comparison.baselineEntryCount} baseline files are unchanged`
        : buildReleaseDeltaDetail(comparison)
    }
  ];

  if (comparison.matches) {
    return {
      status: "same-release",
      headline: "Matches baseline archive",
      confidence: "The current artifact is identical to the selected baseline archive at the manifest level.",
      checks
    };
  }

  return {
    status: "release-changed",
    headline: "Release delta detected",
    confidence: "The current artifact differs from the selected baseline archive, so reviewers can inspect exactly what changed before handoff.",
    checks
  };
}

export async function listExampleSkills(repoRoot = path.resolve(__dirname, "..", "..")): Promise<ExampleSkillSummary[]> {
  const examplesDir = path.join(repoRoot, "examples");
  const entries = await readdir(examplesDir, { withFileTypes: true });
  const results: ExampleSkillSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const skillDir = path.join(examplesDir, entry.name);
    const skillFile = path.join(skillDir, "SKILL.md");

    if (!(await exists(skillFile))) {
      continue;
    }

    const markdown = await readTextFile(skillFile);
    const parsed = parseFrontmatter(markdown);
    const resources: string[] = [];
    const title = extractFirstHeading(parsed.body) ?? entry.name;
    const useCases = extractMarkdownBullets(extractMarkdownSection(parsed.body, "Use When"));
    const workflowSteps = extractMarkdownNumberedSteps(extractMarkdownSection(parsed.body, "Workflow"));

    for (const resource of ["references", "scripts", "assets"]) {
      if (await exists(path.join(skillDir, resource))) {
        resources.push(resource);
      }
    }

    const recommendedTemplate = inferTemplateMode(resources);

    results.push({
      name: parsed.attributes.name ?? entry.name,
      absolutePath: skillDir,
      relativePath: path.relative(repoRoot, skillDir),
      title,
      description: parsed.attributes.description ?? "",
      version: parsed.attributes.version ?? "",
      resources,
      recommendedTemplate,
      suggestedTargetDir: `./skills/${parsed.attributes.name ?? entry.name}`,
      starterCommand: `openclaw-skillkit init ./skills/${parsed.attributes.name ?? entry.name} --template ${recommendedTemplate}`,
      useCases,
      workflowSteps,
      workflowPreview: workflowSteps[0] ?? "Review the example and adapt its workflow to your own domain."
    });
  }

  return results.sort((left, right) => left.name.localeCompare(right.name));
}

function extractFirstHeading(markdownBody: string): string | undefined {
  const match = markdownBody.match(/^#\s+(.+)$/m);
  return match?.[1]?.trim();
}

function extractMarkdownSection(markdownBody: string, heading: string): string {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdownBody.match(new RegExp(`^##\\s+${escapedHeading}\\s*$([\\s\\S]*?)(?=^##\\s+|\\Z)`, "m"));
  return match?.[1]?.trim() ?? "";
}

function extractMarkdownBullets(section: string): string[] {
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^-\s+/.test(line))
    .map((line) => line.replace(/^-\s+/, "").trim());
}

function extractMarkdownNumberedSteps(section: string): string[] {
  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s+/.test(line))
    .map((line) => line.replace(/^\d+\.\s+/, "").trim());
}

function inferTemplateMode(resources: string[]): TemplateMode {
  const normalizedResources = [...resources].sort();

  for (const [template, templateResources] of Object.entries(TEMPLATE_MODES) as Array<
    [TemplateMode, readonly string[]]
  >) {
    if (
      templateResources.length === normalizedResources.length &&
      templateResources.every((resource, index) => normalizedResources[index] === resource)
    ) {
      return template;
    }
  }

  return normalizedResources.includes("assets")
    ? "full"
    : normalizedResources.includes("scripts")
      ? "scripts"
      : normalizedResources.includes("references")
        ? "references"
        : "minimal";
}

const CATEGORY_GUIDANCE: Record<
  string,
  {
    label: string;
    suggestion: string;
  }
> = {
  filesystem: {
    label: "Filesystem",
    suggestion: "Make sure the skill directory exists and contains a root SKILL.md before packaging."
  },
  frontmatter: {
    label: "Metadata",
    suggestion: "Update the SKILL.md frontmatter so name, description, and version clearly identify the skill."
  },
  structure: {
    label: "Structure",
    suggestion: "Add the standard sections and make the workflow easy to follow as numbered steps."
  },
  content: {
    label: "Content",
    suggestion: "Replace scaffold copy with concrete instructions, outputs, and guardrails."
  },
  references: {
    label: "References",
    suggestion: "Repair or bundle every local markdown link so packaged skills stay self-contained."
  },
  scripts: {
    label: "Scripts",
    suggestion: "Mark bundled helper scripts executable when authors are expected to run them directly."
  }
};

async function readdirRecursiveWithHashes(
  rootDir: string
): Promise<Array<{ relativePath: string; size: number; sha256: string }>> {
  const files = await listFilesRecursive(rootDir);

  return Promise.all(
    files.map(async (file) => ({
      relativePath: file.relativePath,
      size: file.size,
      sha256: hashBuffer(await readFile(file.absolutePath))
    }))
  );
}

function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function compareMetadataField(
  field: "name" | "description" | "version",
  archiveValue: string,
  sourceValue: unknown
): ArchiveSourceComparison["metadataDifferences"][number] | null {
  const normalizedSourceValue = typeof sourceValue === "string" ? sourceValue : "";
  if (archiveValue === normalizedSourceValue) {
    return null;
  }

  return {
    field,
    archiveValue,
    sourceValue: normalizedSourceValue
  };
}

function compareArchiveMetadataField(
  field: "name" | "description" | "version",
  currentValue: string,
  baselineValue: string
): ArchiveReleaseComparison["metadataDifferences"][number] | null {
  if (currentValue === baselineValue) {
    return null;
  }

  return {
    field,
    currentValue,
    baselineValue
  };
}

function defaultArchiveReportFileName(archivePath: string): string {
  const resolvedArchivePath = path.resolve(archivePath);
  if (resolvedArchivePath.endsWith(".skill")) {
    return `${resolvedArchivePath.slice(0, -".skill".length)}.report.md`;
  }

  return `${resolvedArchivePath}.report.md`;
}

function defaultReviewReportFileName(skillDir: string, archivePath?: string): string {
  if (archivePath) {
    const resolvedArchivePath = path.resolve(archivePath);
    if (resolvedArchivePath.endsWith(".skill")) {
      return `${resolvedArchivePath.slice(0, -".skill".length)}.review.md`;
    }

    return `${resolvedArchivePath}.review.md`;
  }

  return `${path.resolve(skillDir)}.review.md`;
}

function isLikelyTextBuffer(buffer: Buffer): boolean {
  if (buffer.length === 0) {
    return true;
  }

  let suspicious = 0;

  for (const byte of buffer) {
    if (byte === 0) {
      return false;
    }

    if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
      suspicious += 1;
    }
  }

  return suspicious / buffer.length < 0.15;
}

function formatReviewReadiness(readiness: ReviewReadiness): string {
  switch (readiness) {
    case "ready":
      return "ready to ship";
    case "ready-with-warnings":
      return "ready with warnings";
    default:
      return "not ready";
  }
}

function formatAssessmentStatus(status: AssessmentStatus): string {
  switch (status) {
    case "pass":
      return "PASS";
    case "warn":
      return "ATTN";
    default:
      return "FAIL";
  }
}

function buildParityDetail(comparison: ArchiveSourceComparison): string {
  const details: string[] = [];

  if (comparison.changedEntries.length > 0) {
    details.push(`${comparison.changedEntries.length} changed file(s)`);
  }

  if (comparison.missingFromSource.length > 0) {
    details.push(`${comparison.missingFromSource.length} missing from source`);
  }

  if (comparison.extraSourceEntries.length > 0) {
    details.push(`${comparison.extraSourceEntries.length} new in source`);
  }

  if (comparison.metadataDifferences.length > 0) {
    details.push(`${comparison.metadataDifferences.length} metadata difference(s)`);
  }

  return details.join(", ") || `${comparison.matchedEntries}/${comparison.entryCount} entries match`;
}

function buildReleaseDeltaDetail(comparison: ArchiveReleaseComparison): string {
  const details: string[] = [];

  if (comparison.changedEntries.length > 0) {
    details.push(`${comparison.changedEntries.length} changed file(s)`);
  }

  if (comparison.addedEntries.length > 0) {
    details.push(`${comparison.addedEntries.length} new file(s)`);
  }

  if (comparison.removedEntries.length > 0) {
    details.push(`${comparison.removedEntries.length} removed file(s)`);
  }

  if (comparison.metadataDifferences.length > 0) {
    details.push(`${comparison.metadataDifferences.length} metadata change(s)`);
  }

  return details.join(", ") || `${comparison.matchedEntries}/${comparison.baselineEntryCount} baseline entries match`;
}

function mapTrustStatusToAssessment(status: ArchiveTrustSummary["status"]): AssessmentStatus {
  switch (status) {
    case "verified":
      return "warn";
    case "matching-source":
      return "pass";
    default:
      return "fail";
  }
}
