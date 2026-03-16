import path from "node:path";
import { type LintResult, lintSkill } from "../lib/skill";

export interface RunLintOptions {
  format: "text" | "json";
}

export async function runLint(targetDir: string, options: RunLintOptions): Promise<number> {
  const resolved = path.resolve(targetDir);
  const result = await lintSkill(resolved);
  const summary = summarize(result);

  if (options.format === "json") {
    console.log(
      JSON.stringify({
        skillDir: result.skillDir,
        fileCount: result.fileCount,
        summary,
        issues: result.issues
      }, null, 2)
    );
    return summary.errors === 0 ? 0 : 1;
  }

  console.log(`Linting ${resolved}`);

  if (summary.total === 0) {
    console.log(`  OK: skill structure looks valid (${result.fileCount} file(s) checked).`);
    console.log(`  Ready: openclaw-skillkit pack ${resolved}`);
    return 0;
  }

  for (const issue of result.issues) {
    console.log(`  ${issue.level.toUpperCase()} [${issue.code}] ${issue.file}: ${issue.message}`);
    if (issue.suggestion) {
      console.log(`    Fix: ${issue.suggestion}`);
    }
  }

  console.log(`Summary: ${summary.errors} error(s), ${summary.warnings} warning(s), ${result.fileCount} file(s) checked.`);
  if (summary.errors > 0) {
    console.log("Next: fix the errors above before running pack.");
  } else if (summary.warnings > 0) {
    console.log(`Next: review the warnings above, then run "openclaw-skillkit pack ${resolved}" when ready.`);
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
