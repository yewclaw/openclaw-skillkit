export interface SkillArchiveSummary {
    fileCount: number;
    packagedEntries: string[];
    manifest: SkillArchiveManifest;
}
export interface SkillArchiveManifest {
    schemaVersion: number;
    packagedAt: string;
    sourceDir: string;
    skill: {
        name: string;
        description: string;
        version: string;
    };
    entryCount: number;
    totalBytes: number;
    entries: Array<{
        path: string;
        size: number;
    }>;
}
export declare function createSkillArchive(sourceDir: string, destinationFile: string): Promise<SkillArchiveSummary>;
export declare function readArchiveManifest(archivePath: string): Promise<SkillArchiveManifest>;
