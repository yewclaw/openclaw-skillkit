export interface RunInspectOptions {
    format: "text" | "json";
}
export declare function runInspect(archivePath: string, options: RunInspectOptions): Promise<void>;
