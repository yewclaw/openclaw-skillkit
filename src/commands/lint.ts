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
