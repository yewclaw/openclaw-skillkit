export interface RunLintOptions {
    format: "text" | "json";
    all: boolean;
    reportPath?: string | boolean;
}
export declare function runLint(targetDir: string, options: RunLintOptions): Promise<number>;
