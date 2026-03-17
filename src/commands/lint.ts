import path from "node:path";
import { type LintResult, lintSkill } from "../lib/skill";

export interface RunLintOptions {
  format: "text" | "json";
}

export async function runLint(targetDir: string, options: RunLintOptions): Promise<number> {
  const resolved = path.resolve(targetDir);
  const result = await lintSkill(resolved);
  const summary = summarize(result);
  const actionPlan = buildActionPlan(result, resolved);

  if (options.format === "json") {
    console.log(
      JSON.stringify({
        skillDir: result.skillDir,
        fileCount: result.fileCount,
        summary,
        focusAreas: summarizeFocusAreas(result),
        nextSteps: actionPlan,
        issues: result.issues
      }, null, 2)
    );
    return summary.errors === 0 ? 0 : 1;
  }

  console.log(`Linting ${resolved}`);

  if (summary.total === 0) {
    console.log(`  OK: skill structure looks valid (${result.fileCount} file(s) checked).`);
    console.log(`  Ready: openclaw-skillkit pack ${resolved}`);
    console.log(`  Inspect after packing: openclaw-skillkit inspect ${resolved}.skill`);
    return 0;
  }

  for (const issue of result.issues) {
    console.log(`  ${issue.level.toUpperCase()} [${issue.code}] ${issue.file}: ${issue.message}`);
    if (issue.suggestion) {
      console.log(`    Fix: ${issue.suggestion}`);
    }
  }

  console.log(`Summary: ${summary.errors} error(s), ${summary.warnings} warning(s), ${result.fileCount} file(s) checked.`);
  if (actionPlan.length > 0) {
    console.log("Action plan:");
    for (const [index, step] of actionPlan.entries()) {
      console.log(`  ${index + 1}. ${step}`);
    }
  }
  return summary.errors === 0 ? 0 : 1;
}

function summarize(result: LintResult): { total: number; errors: number; warnings: number } {
  const errors = result.issues.filter((issue) => issue.level === "error").length;
  const warnings = result.issues.filter((issue) => issue.level === "warning").length;

  return {
    total: result.issues.length,
    errors,
    warnings
  };
}

function summarizeFocusAreas(result: LintResult): Array<{
  category: string;
  label: string;
  errors: number;
  warnings: number;
  suggestion: string;
}> {
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

function buildActionPlan(result: LintResult, resolvedDir: string): string[] {
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
