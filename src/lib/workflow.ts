import path from "node:path";
import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { ensureDir, exists, listFilesRecursive, readTextFile } from "./fs";
import { parseFrontmatter } from "./frontmatter";
import { type LintResult, lintSkill } from "./skill";
import { createSkillArchive, readArchiveManifest, type SkillArchiveManifest } from "./zip";

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
  description: string;
  version: string;
  resources: string[];
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
    return [`Pack when ready: openclaw-skillkit pack ${resolvedDir}`];
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
    throw new Error(`Cannot pack ${resolvedDir} because lint found ${errors.length} error(s).`);
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
  archivePath: string
): Promise<{ archivePath: string; manifest: SkillArchiveManifest }> {
  const resolvedArchivePath = path.resolve(archivePath);
  const manifest = await readArchiveManifest(resolvedArchivePath);

  return {
    archivePath: resolvedArchivePath,
    manifest
  };
}

export async function compareArchiveToSource(
  archivePath: string,
  sourceDir: string
): Promise<{ archivePath: string; manifest: SkillArchiveManifest; comparison: ArchiveSourceComparison }> {
  const inspected = await inspectSkillArchive(archivePath);
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

    for (const resource of ["references", "scripts", "assets"]) {
      if (await exists(path.join(skillDir, resource))) {
        resources.push(resource);
      }
    }

    results.push({
      name: parsed.attributes.name ?? entry.name,
      absolutePath: skillDir,
      relativePath: path.relative(repoRoot, skillDir),
      description: parsed.attributes.description ?? "",
      version: parsed.attributes.version ?? "",
      resources
    });
  }

  return results.sort((left, right) => left.name.localeCompare(right.name));
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
