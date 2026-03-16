import path from "node:path";
import { exists, readTextFile } from "./fs";
import { parseFrontmatter } from "./frontmatter";

export interface LintIssue {
  level: "error" | "warning";
  message: string;
}

export interface LintResult {
  skillDir: string;
  issues: LintIssue[];
  fileCount: number;
}

const OPTIONAL_DIRECTORIES = ["references", "scripts", "assets", "examples"];

export async function lintSkill(skillDir: string): Promise<LintResult> {
  const issues: LintIssue[] = [];
  const skillFile = path.join(skillDir, "SKILL.md");

  if (!(await exists(skillDir))) {
    issues.push({
      level: "error",
      message: `Directory does not exist: ${skillDir}`
    });
    return { skillDir, issues, fileCount: 0 };
  }

  if (!(await exists(skillFile))) {
    issues.push({
      level: "error",
      message: "Missing SKILL.md at the skill root."
    });
    return { skillDir, issues, fileCount: 0 };
  }

  const markdown = await readTextFile(skillFile);
  if (!markdown.trim()) {
    issues.push({
      level: "error",
      message: "SKILL.md is empty."
    });
    return { skillDir, issues, fileCount: 1 };
  }

  let frontmatterBody = markdown;

  try {
    const parsed = parseFrontmatter(markdown);
    frontmatterBody = parsed.body;

    if (!parsed.hasFrontmatter) {
      issues.push({
        level: "warning",
        message: "SKILL.md has no frontmatter. Add name, description, and version for better tooling."
      });
    } else {
      validateFrontmatter(parsed.attributes, issues);
    }
  } catch (error) {
    issues.push({
      level: "error",
      message: `Frontmatter error: ${(error as Error).message}`
    });
  }

  if (!/^#\s+.+/m.test(frontmatterBody)) {
    issues.push({
      level: "error",
      message: "SKILL.md should contain a top-level heading."
    });
  }

  if (!/##\s+.+/m.test(frontmatterBody)) {
    issues.push({
      level: "warning",
      message: "SKILL.md should include at least one section heading."
    });
  }

  for (const directoryName of OPTIONAL_DIRECTORIES) {
    const directoryPath = path.join(skillDir, directoryName);
    if (await exists(directoryPath)) {
      continue;
    }

    issues.push({
      level: "warning",
      message: `Optional directory not found: ${directoryName}/`
    });
  }

  return {
    skillDir,
    issues,
    fileCount: 1
  };
}

function validateFrontmatter(
  attributes: Record<string, string>,
  issues: LintIssue[]
): void {
  for (const field of ["name", "description", "version"]) {
    if (!attributes[field]) {
      issues.push({
        level: "warning",
        message: `Frontmatter is missing "${field}".`
      });
    }
  }

  if (attributes.version && !/^\d+\.\d+\.\d+([-.][0-9A-Za-z.]+)?$/.test(attributes.version)) {
    issues.push({
      level: "error",
      message: `Frontmatter version must look like semver. Received "${attributes.version}".`
    });
  }

  if (attributes.name && attributes.name.length < 3) {
    issues.push({
      level: "error",
      message: "Frontmatter name must be at least 3 characters."
    });
  }
}
