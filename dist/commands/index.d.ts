export interface RunIndexOptions {
    format: "text" | "json";
    listName?: string;
    plain?: boolean;
    limit?: number;
    commands?: boolean;
}
export declare function runIndex(indexPath: string, options: RunIndexOptions): Promise<void>;
