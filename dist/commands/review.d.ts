export interface RunReviewOptions {
    outputPath?: string;
    format: "text" | "json";
    reportPath?: string | boolean;
    baselineArchivePath?: string;
}
export declare function runReview(targetDir: string, options: RunReviewOptions): Promise<number>;
