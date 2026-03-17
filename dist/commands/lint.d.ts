export interface RunLintOptions {
    format: "text" | "json";
}
export declare function runLint(targetDir: string, options: RunLintOptions): Promise<number>;
