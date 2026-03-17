import { type LintResult } from "./skill";
import { type TemplateMode } from "./templates";
import { type SkillArchiveManifest } from "./zip";
export interface LintSummary {
    total: number;
    errors: number;
    warnings: number;
}
export interface FocusAreaSummary {
    category: string;
    label: string;
    errors: number;
    warnings: number;
    suggestion: string;
}
export interface ExampleSkillSummary {
    name: string;
    absolutePath: string;
    relativePath: string;
    title: string;
    description: string;
    version: string;
    resources: string[];
    recommendedTemplate: TemplateMode;
    suggestedTargetDir: string;
    starterCommand: string;
    useCases: string[];
    workflowSteps: string[];
    workflowPreview: string;
}
export interface PackSkillResult {
    resolvedDir: string;
    destination: string;
    normalizedOutputPath: boolean;
    warnings: LintResult["issues"];
    archiveSizeBytes: number;
    archiveSizeLabel: string;
    manifest: SkillArchiveManifest;
}
export type ReviewReadiness = "ready" | "ready-with-warnings" | "not-ready";
export interface SkillReviewResult {
    skillDir: string;
    readiness: ReviewReadiness;
    lint: {
        fileCount: number;
        summary: LintSummary;
        focusAreas: FocusAreaSummary[];
        nextSteps: string[];
        issues: LintResult["issues"];
    };
    archive?: PackSkillResult & {
        comparison: ArchiveSourceComparison;
        releaseComparison?: ArchiveReleaseComparison;
    };
}
export interface ArchiveSourceComparison {
    sourceDir: string;
    comparedAt: string;
    metadataMatches: boolean;
    matches: boolean;
    entryCount: number;
    matchedEntries: number;
    missingFromSource: string[];
    changedEntries: Array<{
        path: string;
        archiveSize: number;
        sourceSize: number;
        reason: "size-mismatch" | "hash-mismatch";
    }>;
    extraSourceEntries: string[];
    metadataDifferences: Array<{
        field: "name" | "description" | "version";
        archiveValue: string;
        sourceValue: string;
    }>;
}
export interface ArchiveReleaseComparison {
    baselineArchivePath: string;
    comparedAt: string;
    currentArchivePath: string;
    metadataMatches: boolean;
    matches: boolean;
    entryCount: number;
    baselineEntryCount: number;
    matchedEntries: number;
    addedEntries: string[];
    removedEntries: string[];
    changedEntries: Array<{
        path: string;
        currentSize: number;
        baselineSize: number;
        reason: "size-mismatch" | "hash-mismatch";
    }>;
    metadataDifferences: Array<{
        field: "name" | "description" | "version";
        currentValue: string;
        baselineValue: string;
    }>;
}
export interface InspectedArchiveResult {
    archivePath: string;
    manifest: SkillArchiveManifest;
    comparison?: ArchiveSourceComparison;
    releaseComparison?: ArchiveReleaseComparison;
    archiveInsights?: ArchiveInsights;
    entryPreview?: ArchiveEntryPreview;
}
export interface ArchiveInsights {
    groups: Array<{
        label: string;
        fileCount: number;
        totalBytes: number;
    }>;
    largestEntries: Array<{
        path: string;
        size: number;
    }>;
}
export interface ArchiveEntryPreview {
    path: string;
    size: number;
    sha256?: string;
    text: boolean;
    truncated: boolean;
    lineCount: number;
    preview: string;
}
export type AssessmentStatus = "pass" | "warn" | "fail";
export interface AssessmentCheck {
    label: string;
    status: AssessmentStatus;
    detail: string;
}
export interface ArchiveTrustSummary {
    status: "verified" | "matching-source" | "drift-detected";
    headline: string;
    confidence: string;
    checks: AssessmentCheck[];
    nextStep?: string;
}
export interface ReviewSummary {
    headline: string;
    confidence: string;
    checks: AssessmentCheck[];
}
export interface ReleaseDeltaSummary {
    status: "same-release" | "release-changed";
    headline: string;
    confidence: string;
    checks: AssessmentCheck[];
}
export declare function summarizeLintResult(result: LintResult): LintSummary;
export declare function summarizeFocusAreas(result: LintResult): FocusAreaSummary[];
export declare function buildActionPlan(result: LintResult, resolvedDir: string): string[];
export declare function formatBytes(size: number): string;
export declare function resolveArchiveDestination(resolvedDir: string, outputPath?: string): {
    destination: string;
    normalizedOutputPath: boolean;
};
export declare function packSkill(targetDir: string, outputPath?: string): Promise<PackSkillResult>;
export declare function inspectSkillArchive(archivePath: string, options?: {
    entryPath?: string;
}): Promise<InspectedArchiveResult>;
export declare function reviewSkill(targetDir: string, outputPath?: string, baselineArchivePath?: string): Promise<SkillReviewResult>;
export declare function compareArchiveToSource(archivePath: string, sourceDir: string, options?: {
    entryPath?: string;
}): Promise<InspectedArchiveResult>;
export declare function compareArchives(archivePath: string, baselineArchivePath: string, options?: {
    entryPath?: string;
}): Promise<InspectedArchiveResult>;
export declare function resolveArchiveReportPath(archivePath: string, requestedPath?: string | boolean): string | undefined;
export declare function resolveReviewReportPath(review: SkillReviewResult, requestedPath?: string | boolean): string | undefined;
export declare function writeArchiveReport(archivePath: string, result: InspectedArchiveResult, requestedPath?: string | boolean): Promise<string | undefined>;
export declare function writeReviewReport(review: SkillReviewResult, requestedPath?: string | boolean): Promise<string | undefined>;
export declare function summarizeArchiveContents(manifest: SkillArchiveManifest): ArchiveInsights;
export declare function previewArchiveEntry(archivePath: string, manifest: SkillArchiveManifest, entryPath: string): Promise<ArchiveEntryPreview>;
export declare function buildArchiveReport(result: InspectedArchiveResult): string;
export declare function buildReviewReport(review: SkillReviewResult): string;
export declare function summarizeArchiveTrust(result: InspectedArchiveResult): ArchiveTrustSummary;
export declare function summarizeReviewReadiness(review: SkillReviewResult): ReviewSummary;
export declare function summarizeReleaseDelta(result: InspectedArchiveResult): ReleaseDeltaSummary;
export declare function listExampleSkills(repoRoot?: string): Promise<ExampleSkillSummary[]>;
