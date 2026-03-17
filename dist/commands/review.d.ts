export interface RunReviewOptions {
    outputPath?: string;
    outputDir?: string;
    format: "text" | "json";
    reportPath?: string | boolean;
    baselineArchivePath?: string;
    baselineDir?: string;
    all?: boolean;
}
export declare function runReview(targetDir: string, options: RunReviewOptions): Promise<number>;
