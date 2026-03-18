export interface RunPackOptions {
    outputPath?: string;
    outputDir?: string;
    format: "text" | "json";
    all?: boolean;
    indexPath?: string | boolean;
    reportPath?: string | boolean;
}
export declare function runPack(targetDir: string, options: RunPackOptions): Promise<void>;
