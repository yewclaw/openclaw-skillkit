export interface RunInspectOptions {
    format: "text" | "json";
    sourceDir?: string;
    baselineArchivePath?: string;
    reportPath?: string | boolean;
}
export declare function runInspect(archivePath: string, options: RunInspectOptions): Promise<void>;
