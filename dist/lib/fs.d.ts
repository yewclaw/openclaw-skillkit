export declare function ensureDir(dirPath: string): Promise<void>;
export declare function writeTextFile(filePath: string, contents: string): Promise<void>;
export declare function readTextFile(filePath: string): Promise<string>;
export declare function exists(targetPath: string): Promise<boolean>;
export interface FileEntry {
    absolutePath: string;
    relativePath: string;
    size: number;
}
export declare function listFilesRecursive(rootDir: string): Promise<FileEntry[]>;
