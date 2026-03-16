"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.classifyLintResult = classifyLintResult;
exports.evaluateDetectionCases = evaluateDetectionCases;
exports.formatRatio = formatRatio;
const DETECTION_WARNING_PATTERNS = [
    /^SKILL\.md has no frontmatter\./,
    /^Frontmatter is missing "/,
    /^Frontmatter description should be at least 20 characters/,
    /^Frontmatter description looks like placeholder copy/,
    /^SKILL\.md still contains scaffold placeholder copy/
];
function classifyLintResult(result) {
    return result.issues.some((issue) => issue.level === "error" ||
        DETECTION_WARNING_PATTERNS.some((pattern) => pattern.test(issue.message)))
        ? "bad"
        : "good";
}
function evaluateDetectionCases(cases) {
    let correct = 0;
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    for (const item of cases) {
        if (item.expected === item.predicted) {
            correct += 1;
        }
        if (item.expected === "good" && item.predicted === "good") {
            truePositives += 1;
        }
        else if (item.expected === "bad" && item.predicted === "good") {
            falsePositives += 1;
        }
        else if (item.expected === "good" && item.predicted === "bad") {
            falseNegatives += 1;
        }
    }
    return {
        total: cases.length,
        correct,
        accuracy: divideOrZero(correct, cases.length),
        precision: divideOrZero(truePositives, truePositives + falsePositives),
        recall: divideOrZero(truePositives, truePositives + falseNegatives),
        truePositives,
        falsePositives,
        falseNegatives
    };
}
function formatRatio(value) {
    return `${(value * 100).toFixed(1)}%`;
}
function divideOrZero(numerator, denominator) {
    return denominator === 0 ? 0 : numerator / denominator;
}
