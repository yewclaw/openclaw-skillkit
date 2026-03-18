export interface RunIndexOptions {
    format: "text" | "json";
    listName?: string;
    plain?: boolean;
    limit?: number;
}
export declare function runIndex(indexPath: string, options: RunIndexOptions): Promise<void>;
