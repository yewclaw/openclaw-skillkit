export interface RunServeOptions {
    host: string;
    port: number;
}
export interface StudioServerHandle {
    port: number;
    url: string;
    close: () => Promise<void>;
}
export declare function getStudioAssets(): {
    html: string;
    css: string;
    js: string;
};
export declare function runServe(options: RunServeOptions): Promise<StudioServerHandle>;
export declare function startStudioServer(options: RunServeOptions): Promise<StudioServerHandle>;
