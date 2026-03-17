import { type LintResult } from "./skill";
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
    description: string;
    version: string;
    resources: string[];
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
export declare function summarizeLintResult(result: LintResult): LintSummary;
export declare function summarizeFocusAreas(result: LintResult): FocusAreaSummary[];
export declare function buildActionPlan(result: LintResult, resolvedDir: string): string[];
export declare function formatBytes(size: number): string;
export declare function resolveArchiveDestination(resolvedDir: string, outputPath?: string): {
    destination: string;
    normalizedOutputPath: boolean;
};
export declare function packSkill(targetDir: string, outputPath?: string): Promise<PackSkillResult>;
export declare function inspectSkillArchive(archivePath: string): Promise<{
    archivePath: string;
    manifest: SkillArchiveManifest;
}>;
export declare function listExampleSkills(repoRoot?: string): Promise<ExampleSkillSummary[]>;
