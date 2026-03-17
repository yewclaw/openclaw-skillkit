import {
  buildReviewReport,
  reviewSkill,
  summarizeReviewReadiness,
  type ReviewReadiness,
  writeReviewReport
} from "../lib/workflow";

export interface RunReviewOptions {
  outputPath?: string;
  format: "text" | "json";
  reportPath?: string | boolean;
}

export async function runReview(targetDir: string, options: RunReviewOptions): Promise<number> {
  const review = await reviewSkill(targetDir, options.outputPath);
  const reportPath = await writeReviewReport(review, options.reportPath);
  const summary = summarizeReviewReadiness(review);

  if (options.format === "json") {
    console.log(
      JSON.stringify(
        {
          skillDir: review.skillDir,
          readiness: review.readiness,
          releaseSummary: summary,
          reportPath,
          reportMarkdown: buildReviewReport(review),
          lint: review.lint,
          archive: review.archive
        },
        null,
        2
      )
    );
    return review.readiness === "not-ready" ? 1 : 0;
  }

  console.log(`Reviewing ${review.skillDir}`);
  console.log(`  Readiness: ${formatReadinessLabel(review.readiness)}`);
  console.log(`  Summary: ${summary.headline}`);
  console.log(
    `  Lint: ${review.lint.summary.errors} error(s), ${review.lint.summary.warnings} warning(s) across ${review.lint.fileCount} file(s).`
  );
  console.log(`  Confidence: ${summary.confidence}`);
  console.log(
    `  Release checks: ${summary.checks
      .map((check) => `${formatAssessment(check.status)} ${check.label.toLowerCase()} (${check.detail})`)
      .join("; ")}`
  );

  if (review.lint.focusAreas.length > 0) {
    console.log(
      `  Focus areas: ${review.lint.focusAreas
        .map((area) => `${area.label} (${area.errors} error(s), ${area.warnings} warning(s))`)
        .join(", ")}`
    );
  }

  if (review.archive) {
    console.log(`  Archive: ${review.archive.destination}`);
    console.log(
      `  Artifact check: ${review.archive.comparison.matches ? "matches source" : "drift detected"} (${review.archive.comparison.matchedEntries}/${review.archive.comparison.entryCount} archive entries unchanged).`
    );
  } else {
    console.log("  Archive: not created because blocking lint errors remain.");
  }

  if (review.lint.issues.length > 0) {
    console.log("  Issues:");
    for (const issue of review.lint.issues) {
      console.log(`    ${issue.level.toUpperCase()} [${issue.code}] ${issue.file}: ${issue.message}`);
      if (issue.suggestion) {
        console.log(`      Fix: ${issue.suggestion}`);
      }
    }
  }

  if (review.lint.nextSteps.length > 0) {
    console.log("  Next:");
    review.lint.nextSteps.forEach((step, index) => console.log(`    ${index + 1}. ${step}`));
  }

  if (reportPath) {
    console.log(`  Report: ${reportPath}`);
  }

  return review.readiness === "not-ready" ? 1 : 0;
}

function formatReadinessLabel(readiness: ReviewReadiness): string {
  switch (readiness) {
    case "ready":
      return "READY TO SHIP";
    case "ready-with-warnings":
      return "READY WITH WARNINGS";
    default:
      return "NOT READY";
  }
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
