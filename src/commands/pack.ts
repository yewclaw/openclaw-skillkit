import path from "node:path";
import { readdir } from "node:fs/promises";
import { parseFrontmatter } from "../lib/frontmatter";
import { ensureDir, exists, readTextFile, writeTextFile } from "../lib/fs";
import { lintSkill } from "../lib/skill";
import { type SkillArchiveManifest } from "../lib/zip";
import { buildArchiveReport, formatBytes, packSkill, summarizeLintResult, writeArchiveReport } from "../lib/workflow";

export interface RunPackOptions {
  outputPath?: string;
  outputDir?: string;
  format: "text" | "json";
  all?: boolean;
  indexPath?: string | boolean;
  reportPath?: string | boolean;
}

interface BatchPackIssue {
  level: "error" | "warning";
  code: string;
  file: string;
  message: string;
  suggestion?: string;
}

interface BatchPackedSkill {
  skillDir: string;
  relativeDir: string;
  name?: string;
  status: "packaged" | "blocked";
  summary: {
    total: number;
    errors: number;
    warnings: number;
  };
  issues: BatchPackIssue[];
  archive?: {
    destination: string;
    archiveSizeBytes: number;
    archiveSizeLabel: string;
    entryCount: number;
    totalBytes: number;
    largestEntry?: {
      path: string;
      size: number;
    };
    manifest: SkillArchiveManifest;
  };
}

interface BatchPackResult {
  rootDir: string;
  artifactDir: string;
  skillCount: number;
  summary: {
    total: number;
    errors: number;
    warnings: number;
    packaged: number;
    blocked: number;
    artifactBytes: number;
    artifactEntries: number;
  };
  artifactSummary: {
    totalArchives: number;
    totalBytes: number;
    totalEntries: number;
    largestArchives: Array<{
      relativeDir: string;
      archivePath: string;
      archiveSizeBytes: number;
      entryCount: number;
    }>;
    largestEntries: Array<{
      relativeDir: string;
      path: string;
      size: number;
    }>;
  };
  maintenanceSummary: {
    issueHotspots: Array<{
      code: string;
      count: number;
      skills: string[];
    }>;
    duplicateNames: Array<{
      name: string;
      count: number;
      skills: string[];
    }>;
  };
  skills: BatchPackedSkill[];
}

export async function runPack(targetDir: string, options: RunPackOptions): Promise<void> {
  if (options.all) {
    await runBatchPack(path.resolve(targetDir), options);
    return;
  }

  const packResult = await packSkill(targetDir, options.outputPath);
  const reportPath = await writeArchiveReport(
    packResult.destination,
    {
      archivePath: packResult.destination,
      manifest: packResult.manifest
    },
    options.reportPath
  );

  if (options.format === "text") {
    console.log(`Packing ${packResult.resolvedDir}`);
  }

  if (packResult.warnings.length > 0 && options.format === "text") {
    console.log(`Packing with ${packResult.warnings.length} warning(s):`);
    for (const warning of packResult.warnings) {
      console.log(`  WARNING [${warning.file}]: ${warning.message}`);
      if (warning.suggestion) {
        console.log(`    Fix: ${warning.suggestion}`);
      }
    }
    console.log("Proceeding anyway because warnings do not block packaging.");
  }

  if (packResult.normalizedOutputPath && options.format === "text") {
    console.log(`Output path did not end in .skill. Using ${packResult.destination}`);
  }

  if (options.format === "json") {
    console.log(
      JSON.stringify(
        {
          archivePath: packResult.destination,
          reportPath,
          reportMarkdown: buildArchiveReport({
            archivePath: packResult.destination,
            manifest: packResult.manifest
          }),
          normalizedOutputPath: packResult.normalizedOutputPath,
          archiveSizeBytes: packResult.archiveSizeBytes,
          archiveSizeLabel: packResult.archiveSizeLabel,
          warnings: packResult.warnings.map((warning) => ({
            code: warning.code,
            file: warning.file,
            message: warning.message,
            suggestion: warning.suggestion
          })),
          manifest: packResult.manifest
        },
        null,
        2
      )
    );
    return;
  }

  printArchiveSummary(packResult.destination, packResult.archiveSizeBytes, packResult.manifest, reportPath);
}

async function runBatchPack(rootDir: string, options: RunPackOptions): Promise<void> {
  const skillDirs = await discoverSkillDirs(rootDir);
  if (skillDirs.length === 0) {
    process.exitCode = 1;
    if (options.format === "json") {
      console.log(
        JSON.stringify(
          {
            rootDir,
            summary: {
              total: 1,
              errors: 1,
              warnings: 0,
              packaged: 0,
              blocked: 0,
              artifactBytes: 0,
              artifactEntries: 0
            },
            skills: [],
            issues: [
              {
                level: "error",
                code: "no-skills-found",
                file: ".",
                message: "No skills were found under the target directory.",
                suggestion: 'Run "skillforge init <dir>" to scaffold a skill, or point pack at the repo containing skills.'
              }
            ]
          },
          null,
          2
        )
      );
      return;
    }

    console.log(`Packing all skills under ${rootDir}`);
    console.log("Status: BLOCKED");
    console.log("Summary: no skill directories were found.");
    console.log("Next:");
    console.log("  1. Add at least one skill directory containing SKILL.md.");
    console.log(`  2. Re-run: skillforge pack ${rootDir} --all`);
    return;
  }

  const artifactDir = options.outputDir
    ? path.resolve(options.outputDir)
    : path.join(rootDir, ".skillforge", "pack-artifacts", `${Date.now()}`);
  await ensureDir(artifactDir);

  const lintedSkills = await Promise.all(
    skillDirs.map(async (skillDir) => {
      const lint = await lintSkill(skillDir);
      return {
        skillDir,
        relativeDir: path.relative(rootDir, skillDir) || ".",
        name: await readFrontmatterName(skillDir),
        summary: summarizeLintResult(lint),
        issues: lint.issues.map((issue) => ({
          level: issue.level,
          code: issue.code,
          file: issue.file,
          message: issue.message,
          suggestion: issue.suggestion
        }))
      };
    })
  );

  const duplicateMap = collectDuplicateNames(lintedSkills);
  const skills: BatchPackedSkill[] = [];

  for (const skill of lintedSkills) {
    const duplicateSkills = skill.name ? duplicateMap.get(skill.name) : undefined;
    const duplicateIssue =
      duplicateSkills && duplicateSkills.length > 1
        ? {
            level: "error" as const,
            code: "duplicate-skill-name",
            file: "SKILL.md",
            message: `Frontmatter name "${skill.name}" is duplicated across ${duplicateSkills.length} skills.`,
            suggestion: `Use unique frontmatter names. Conflicts: ${duplicateSkills
              .map((skillPath) => path.relative(rootDir, skillPath) || ".")
              .sort()
              .join(", ")}`
          }
        : undefined;
    const issues = duplicateIssue ? [...skill.issues, duplicateIssue] : skill.issues;
    const summary = {
      total: issues.length,
      errors: issues.filter((issue) => issue.level === "error").length,
      warnings: issues.filter((issue) => issue.level === "warning").length
    };

    if (summary.errors > 0) {
      skills.push({
        skillDir: skill.skillDir,
        relativeDir: skill.relativeDir,
        name: skill.name,
        status: "blocked",
        summary,
        issues
      });
      continue;
    }

    const outputPath = resolveBatchOutputPath(artifactDir, skill.relativeDir);
    const packed = await packSkill(skill.skillDir, outputPath);
    const largestEntry = packed.manifest.entries
      .slice()
      .sort((left, right) => right.size - left.size || left.path.localeCompare(right.path))[0];

    skills.push({
      skillDir: skill.skillDir,
      relativeDir: skill.relativeDir,
      name: skill.name,
      status: "packaged",
      summary,
      issues,
      archive: {
        destination: packed.destination,
        archiveSizeBytes: packed.archiveSizeBytes,
        archiveSizeLabel: packed.archiveSizeLabel,
        entryCount: packed.manifest.entryCount,
        totalBytes: packed.manifest.totalBytes,
        largestEntry: largestEntry
          ? {
              path: largestEntry.path,
              size: largestEntry.size
            }
          : undefined,
        manifest: packed.manifest
      }
    });
  }

  const result = summarizeBatchPack(rootDir, artifactDir, skills);
  const reportPath = await writeBatchPackReport(result, options.reportPath);
  const reportMarkdown = buildBatchPackReport(result);
  const indexPath = await writeBatchPackIndex(result, options.indexPath);

  process.exitCode = result.summary.blocked > 0 ? 1 : 0;

  if (options.format === "json") {
    console.log(
      JSON.stringify(
        {
          rootDir: result.rootDir,
          artifactDir: result.artifactDir,
          skillCount: result.skillCount,
          summary: result.summary,
          artifactSummary: result.artifactSummary,
          maintenanceSummary: result.maintenanceSummary,
          reportPath,
          reportMarkdown,
          indexPath,
          skills: result.skills
        },
        null,
        2
      )
    );
    return;
  }

  console.log(`Packing all skills under ${result.rootDir}`);
  console.log(`Artifacts: ${result.artifactDir}`);
  console.log(`Discovered: ${result.skillCount} skill(s)`);
  console.log(`Status: ${result.summary.blocked > 0 ? "BLOCKED" : "PACKAGED"}`);
  console.log(
    `Summary: ${result.summary.packaged} packaged, ${result.summary.blocked} blocked, ${result.summary.warnings} warning(s) across ${result.skillCount} skill(s).`
  );

  for (const skill of result.skills) {
    console.log(
      `  ${skill.status === "packaged" ? "PACKAGED" : "BLOCKED"} ${skill.relativeDir}: ${skill.summary.errors} error(s), ${skill.summary.warnings} warning(s)`
    );
    if (skill.archive) {
      console.log(
        `    Archive: ${skill.archive.destination} (${skill.archive.archiveSizeLabel}, ${skill.archive.entryCount} file(s))`
      );
    }
    for (const issue of skill.issues) {
      console.log(`    ${issue.level.toUpperCase()} [${issue.code}] ${issue.file}: ${issue.message}`);
      if (issue.suggestion) {
        console.log(`      Fix: ${issue.suggestion}`);
      }
    }
  }

  console.log("Rollup:");
  console.log(`  Packaged: ${result.summary.packaged}`);
  console.log(`  Blocked: ${result.summary.blocked}`);
  console.log(
    `  Artifact inventory: ${result.artifactSummary.totalArchives} archive(s), ${result.artifactSummary.totalEntries} bundled file(s), ${formatBytes(result.artifactSummary.totalBytes)} total`
  );
  if (result.artifactSummary.largestArchives.length > 0) {
    console.log("Largest archives:");
    for (const archive of result.artifactSummary.largestArchives) {
      console.log(
        `  ${archive.relativeDir}: ${formatBytes(archive.archiveSizeBytes)} across ${archive.entryCount} file(s) -> ${archive.archivePath}`
      );
    }
  }
  if (result.maintenanceSummary.duplicateNames.length > 0) {
    console.log("Duplicate names:");
    for (const duplicate of result.maintenanceSummary.duplicateNames) {
      console.log(`  ${duplicate.name}: ${duplicate.count} skill(s) (${duplicate.skills.join(", ")})`);
    }
  }
  if (result.maintenanceSummary.issueHotspots.length > 0) {
    console.log("Issue hotspots:");
    for (const hotspot of result.maintenanceSummary.issueHotspots) {
      console.log(`  ${hotspot.code}: ${hotspot.count} issue(s) across ${hotspot.skills.join(", ")}`);
    }
  }
  if (indexPath) {
    console.log(`Index: ${indexPath}`);
  }
  if (reportPath) {
    console.log(`Report: ${reportPath}`);
  }
}

function printArchiveSummary(
  destination: string,
  archiveSize: number,
  manifest: SkillArchiveManifest,
  reportPath?: string
): void {
  console.log("PACKAGED SUCCESSFULLY");
  console.log(`Archive ready: ${destination}`);
  console.log(
    `  Skill: ${manifest.skill.name}@${manifest.skill.version} (${manifest.entryCount} bundled file(s) plus manifest, ${formatBytes(archiveSize)}).`
  );
  console.log("  Confidence: the archive includes an embedded manifest for later inspection.");
  console.log(`  Contents: ${manifest.entries.map((entry) => entry.path).join(", ")}`);
  console.log("Next:");
  console.log(`  1. Inspect the shipped artifact: skillforge inspect ${destination}`);
  console.log(`  2. Verify source parity: skillforge inspect ${destination} --source ./path-to-skill`);
  if (reportPath) {
    console.log(`  Report: ${reportPath}`);
  }
}

function summarizeBatchPack(rootDir: string, artifactDir: string, skills: BatchPackedSkill[]): BatchPackResult {
  const summary = {
    total: 0,
    errors: 0,
    warnings: 0,
    packaged: 0,
    blocked: 0,
    artifactBytes: 0,
    artifactEntries: 0
  };
  const issueCounts = new Map<string, { count: number; skills: Set<string> }>();
  const duplicateNames = new Map<string, Set<string>>();

  for (const skill of skills) {
    summary.total += skill.summary.total;
    summary.errors += skill.summary.errors;
    summary.warnings += skill.summary.warnings;
    if (skill.status === "packaged") {
      summary.packaged += 1;
    } else {
      summary.blocked += 1;
    }
    if (skill.archive) {
      summary.artifactBytes += skill.archive.archiveSizeBytes;
      summary.artifactEntries += skill.archive.entryCount;
    }
    for (const issue of skill.issues) {
      const current = issueCounts.get(issue.code) ?? { count: 0, skills: new Set<string>() };
      current.count += 1;
      current.skills.add(skill.relativeDir);
      issueCounts.set(issue.code, current);
      if (issue.code === "duplicate-skill-name" && skill.name) {
        const names = duplicateNames.get(skill.name) ?? new Set<string>();
        names.add(skill.relativeDir);
        duplicateNames.set(skill.name, names);
      }
    }
  }

  const packagedSkills = skills.filter(
    (skill): skill is BatchPackedSkill & { archive: NonNullable<BatchPackedSkill["archive"]> } => Boolean(skill.archive)
  );
  const largestArchives = packagedSkills
    .slice()
    .sort(
      (left, right) =>
        right.archive.archiveSizeBytes - left.archive.archiveSizeBytes || left.relativeDir.localeCompare(right.relativeDir)
    )
    .slice(0, 5)
    .map((skill) => ({
      relativeDir: skill.relativeDir,
      archivePath: skill.archive.destination,
      archiveSizeBytes: skill.archive.archiveSizeBytes,
      entryCount: skill.archive.entryCount
    }));
  const largestEntries = packagedSkills
    .filter(
      (
        skill
      ): skill is BatchPackedSkill & {
        archive: NonNullable<BatchPackedSkill["archive"]> & { largestEntry: NonNullable<BatchPackedSkill["archive"]>["largestEntry"] };
      } => Boolean(skill.archive.largestEntry)
    )
    .slice()
    .sort(
      (left, right) =>
        (right.archive.largestEntry?.size ?? 0) - (left.archive.largestEntry?.size ?? 0) ||
        left.relativeDir.localeCompare(right.relativeDir)
    )
    .slice(0, 5)
    .map((skill) => ({
      relativeDir: skill.relativeDir,
      path: skill.archive.largestEntry?.path ?? "unknown",
      size: skill.archive.largestEntry?.size ?? 0
    }));

  return {
    rootDir,
    artifactDir,
    skillCount: skills.length,
    summary,
    artifactSummary: {
      totalArchives: packagedSkills.length,
      totalBytes: summary.artifactBytes,
      totalEntries: summary.artifactEntries,
      largestArchives,
      largestEntries
    },
    maintenanceSummary: {
      issueHotspots: [...issueCounts.entries()]
        .sort((left, right) => right[1].count - left[1].count || left[0].localeCompare(right[0]))
        .slice(0, 5)
        .map(([code, value]) => ({
          code,
          count: value.count,
          skills: [...value.skills].sort((left, right) => left.localeCompare(right))
        })),
      duplicateNames: [...duplicateNames.entries()]
        .sort((left, right) => right[1].size - left[1].size || left[0].localeCompare(right[0]))
        .map(([name, values]) => ({
          name,
          count: values.size,
          skills: [...values].sort((left, right) => left.localeCompare(right))
        }))
    },
    skills: skills.sort((left, right) => left.relativeDir.localeCompare(right.relativeDir))
  };
}

function buildBatchPackReport(result: BatchPackResult): string {
  const lines: string[] = [];
  lines.push("# SkillForge Batch Pack Report");
  lines.push("");
  lines.push(`- Root: \`${result.rootDir}\``);
  lines.push(`- Artifact directory: \`${result.artifactDir}\``);
  lines.push(`- Skills: ${result.skillCount}`);
  lines.push(`- Packaged: ${result.summary.packaged}`);
  lines.push(`- Blocked: ${result.summary.blocked}`);
  lines.push(`- Warnings: ${result.summary.warnings}`);
  lines.push(`- Artifact bytes: ${formatBytes(result.summary.artifactBytes)}`);
  lines.push(`- Bundled files: ${result.summary.artifactEntries}`);
  lines.push("");
  lines.push("## Artifact Inventory");
  lines.push("");
  if (result.artifactSummary.largestArchives.length > 0) {
    lines.push("### Largest Archives");
    for (const archive of result.artifactSummary.largestArchives) {
      lines.push(
        `- ${archive.relativeDir}: ${formatBytes(archive.archiveSizeBytes)} across ${archive.entryCount} file(s) (\`${archive.archivePath}\`)`
      );
    }
  }
  if (result.artifactSummary.largestEntries.length > 0) {
    lines.push("", "### Largest Bundled Entries");
    for (const entry of result.artifactSummary.largestEntries) {
      lines.push(`- ${entry.relativeDir}: \`${entry.path}\` (${formatBytes(entry.size)})`);
    }
  }
  lines.push("", "## Maintenance Hotspots");
  if (result.maintenanceSummary.duplicateNames.length > 0) {
    lines.push("", "### Duplicate Skill Names");
    for (const duplicate of result.maintenanceSummary.duplicateNames) {
      lines.push(`- ${duplicate.name}: ${duplicate.count} skill(s) (${duplicate.skills.join(", ")})`);
    }
  } else {
    lines.push("", "- No duplicate skill names blocked this batch.");
  }
  if (result.maintenanceSummary.issueHotspots.length > 0) {
    lines.push("", "### Issue Hotspots");
    for (const hotspot of result.maintenanceSummary.issueHotspots) {
      lines.push(`- ${hotspot.code}: ${hotspot.count} issue(s) across ${hotspot.skills.join(", ")}`);
    }
  }
  lines.push("", "## Skills", "");
  for (const skill of result.skills) {
    lines.push(`### ${skill.relativeDir}`);
    lines.push("");
    lines.push(`- Status: ${skill.status}`);
    lines.push(`- Errors: ${skill.summary.errors}`);
    lines.push(`- Warnings: ${skill.summary.warnings}`);
    if (skill.archive) {
      lines.push(`- Archive: \`${skill.archive.destination}\``);
      lines.push(`- Artifact size: ${skill.archive.archiveSizeLabel}`);
      lines.push(`- Bundled files: ${skill.archive.entryCount}`);
    }
    if (skill.issues.length > 0) {
      lines.push("- Issues:");
      for (const issue of skill.issues) {
        lines.push(`  - ${issue.level.toUpperCase()} [${issue.code}] ${issue.file}: ${issue.message}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function writeBatchPackReport(result: BatchPackResult, reportPath?: string | boolean): Promise<string | undefined> {
  if (typeof reportPath === "undefined" || reportPath === false) {
    return undefined;
  }

  const destination =
    reportPath === true
      ? path.join(result.artifactDir, "batch-pack.report.md")
      : path.resolve(String(reportPath));

  await writeTextFile(destination, buildBatchPackReport(result));
  return destination;
}

async function writeBatchPackIndex(result: BatchPackResult, indexPath?: string | boolean): Promise<string | undefined> {
  if (typeof indexPath === "undefined" || indexPath === false) {
    return undefined;
  }

  const destination =
    indexPath === true
      ? path.join(result.artifactDir, "batch-pack.index.json")
      : path.resolve(String(indexPath));

  await writeTextFile(destination, JSON.stringify(result, null, 2));
  return destination;
}

async function discoverSkillDirs(rootDir: string): Promise<string[]> {
  if (!(await exists(rootDir))) {
    return [];
  }

  const results: string[] = [];
  const ignored = new Set([".git", "node_modules", "dist", ".skillforge"]);

  async function walk(currentDir: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    if (entries.some((entry) => entry.isFile() && entry.name === "SKILL.md")) {
      results.push(currentDir);
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || ignored.has(entry.name)) {
        continue;
      }
      await walk(path.join(currentDir, entry.name));
    }
  }

  await walk(rootDir);
  return results.sort((left, right) => left.localeCompare(right));
}

async function readFrontmatterName(skillDir: string): Promise<string | undefined> {
  try {
    const markdown = await readTextFile(path.join(skillDir, "SKILL.md"));
    const parsed = parseFrontmatter(markdown);
    return parsed.attributes.name || undefined;
  } catch {
    return undefined;
  }
}

function collectDuplicateNames(
  skills: Array<{
    skillDir: string;
    name?: string;
  }>
): Map<string, string[]> {
  const duplicates = new Map<string, string[]>();
  for (const skill of skills) {
    if (!skill.name) {
      continue;
    }
    const current = duplicates.get(skill.name) ?? [];
    current.push(skill.skillDir);
    duplicates.set(skill.name, current);
  }
  return duplicates;
}

function resolveBatchOutputPath(artifactDir: string, relativeDir: string): string {
  const normalized = relativeDir === "." ? "root" : relativeDir;
  return path.join(artifactDir, `${normalized}.skill`);
}
