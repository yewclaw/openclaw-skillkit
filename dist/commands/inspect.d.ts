export interface RunInspectOptions {
    format: "text" | "json";
    all?: boolean;
    sourceDir?: string;
    baselineArchivePath?: string;
    baselineDir?: string;
    reportPath?: string | boolean;
    entryPath?: string;
}
export declare function runInspect(archivePath: string, options: RunInspectOptions): Promise<void>;
