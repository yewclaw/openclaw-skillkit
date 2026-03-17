export interface RunPackOptions {
    outputPath?: string;
    format: "text" | "json";
    reportPath?: string | boolean;
}
export declare function runPack(targetDir: string, options: RunPackOptions): Promise<void>;
