export interface RunInspectOptions {
    format: "text" | "json";
    all?: boolean;
    sourceDir?: string;
    baselineArchivePath?: string;
    baselineDir?: string;
    indexPath?: string | boolean;
    reportPath?: string | boolean;
    entryPath?: string;
}
export declare function runInspect(archivePath: string, options: RunInspectOptions): Promise<void>;
