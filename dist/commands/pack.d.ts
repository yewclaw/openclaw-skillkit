export interface RunPackOptions {
    outputPath?: string;
    format: "text" | "json";
}
export declare function runPack(targetDir: string, options: RunPackOptions): Promise<void>;
