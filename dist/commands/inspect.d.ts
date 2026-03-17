export interface RunInspectOptions {
    format: "text" | "json";
    sourceDir?: string;
    reportPath?: string | boolean;
}
export declare function runInspect(archivePath: string, options: RunInspectOptions): Promise<void>;
