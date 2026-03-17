import { buildReviewReport, reviewSkill, type ReviewReadiness, writeReviewReport } from "../lib/workflow";

export interface RunReviewOptions {
  outputPath?: string;
  format: "text" | "json";
  reportPath?: string | boolean;
}

export async function runReview(targetDir: string, options: RunReviewOptions): Promise<number> {
  const review = await reviewSkill(targetDir, options.outputPath);
  const reportPath = await writeReviewReport(review, options.reportPath);

  if (options.format === "json") {
    console.log(
      JSON.stringify(
        {
          skillDir: review.skillDir,
          readiness: review.readiness,
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
  console.log(
    `  Lint: ${review.lint.summary.errors} error(s), ${review.lint.summary.warnings} warning(s) across ${review.lint.fileCount} file(s).`
  );
  console.log(`  Confidence: ${formatReviewConfidence(review)}`);

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

function formatReviewConfidence(review: {
  readiness: ReviewReadiness;
  archive?: { comparison: { matches: boolean } };
}): string {
  if (review.readiness === "ready") {
    return "lint passed cleanly, the archive was created, and the artifact matches the source.";
  }

  if (review.readiness === "ready-with-warnings") {
    return "the skill can ship, but warnings still deserve a final pass before handoff.";
  }

  if (review.archive?.comparison.matches === false) {
    return "the packaged artifact no longer matches the current source.";
  }

  return "blocking issues remain, so this skill should not be handed off yet.";
}
