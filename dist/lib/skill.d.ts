export interface LintIssue {
    level: "error" | "warning";
    code: string;
    category: "filesystem" | "frontmatter" | "structure" | "content" | "references" | "scripts";
    file: string;
    message: string;
    suggestion?: string;
}
export interface LintResult {
    skillDir: string;
    issues: LintIssue[];
    fileCount: number;
}
export declare function lintSkill(skillDir: string): Promise<LintResult>;
