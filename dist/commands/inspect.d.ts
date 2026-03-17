export interface RunInspectOptions {
    format: "text" | "json";
    sourceDir?: string;
}
export declare function runInspect(archivePath: string, options: RunInspectOptions): Promise<void>;
