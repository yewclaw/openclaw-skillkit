import path from "node:path";
import { lintSkill } from "../lib/skill";
import { buildActionPlan, summarizeFocusAreas, summarizeLintResult } from "../lib/workflow";

export interface RunLintOptions {
  format: "text" | "json";
}

export async function runLint(targetDir: string, options: RunLintOptions): Promise<number> {
  const resolved = path.resolve(targetDir);
  const result = await lintSkill(resolved);
  const summary = summarizeLintResult(result);
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
  console.log(`Status: ${formatLintStatus(summary)}`);
  console.log(`Summary: ${summary.errors} error(s), ${summary.warnings} warning(s), ${result.fileCount} file(s) checked.`);

  if (summary.total === 0) {
    console.log("  Confidence: no blocking issues or warnings were found.");
    console.log("Next:");
    console.log(`  1. Pack when ready: openclaw-skillkit pack ${resolved}`);
    console.log(`  2. Run a full review before handoff: openclaw-skillkit review ${resolved}`);
    return 0;
  }

  const focusAreas = summarizeFocusAreas(result);
  if (focusAreas.length > 0) {
    console.log("Focus areas:");
    for (const area of focusAreas) {
      console.log(`  ${area.label}: ${area.errors} error(s), ${area.warnings} warning(s)`);
    }
  }

  for (const issue of result.issues) {
    console.log(`  ${issue.level.toUpperCase()} [${issue.code}] ${issue.file}: ${issue.message}`);
    if (issue.suggestion) {
      console.log(`    Fix: ${issue.suggestion}`);
    }
  }

  if (actionPlan.length > 0) {
    console.log("Next:");
    for (const [index, step] of actionPlan.entries()) {
      console.log(`  ${index + 1}. ${step}`);
    }
  }
  return summary.errors === 0 ? 0 : 1;
}

function formatLintStatus(summary: { errors: number; warnings: number }): string {
  if (summary.errors > 0) {
    return "BLOCKED";
  }

  if (summary.warnings > 0) {
    return "PACKABLE WITH WARNINGS";
  }

  return "READY TO PACKAGE";
}
