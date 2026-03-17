import type { LintResult } from "./skill";
export type DetectionLabel = "good" | "bad";
export interface DetectionCase {
    name: string;
    expected: DetectionLabel;
    predicted: DetectionLabel;
}
export interface DetectionMetrics {
    total: number;
    correct: number;
    accuracy: number;
    precision: number;
    recall: number;
    truePositives: number;
    falsePositives: number;
    falseNegatives: number;
}
export declare function classifyLintResult(result: LintResult): DetectionLabel;
export declare function evaluateDetectionCases(cases: DetectionCase[]): DetectionMetrics;
export declare function formatRatio(value: number): string;
