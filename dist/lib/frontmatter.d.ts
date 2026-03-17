export interface FrontmatterResult {
    attributes: Record<string, string>;
    body: string;
    hasFrontmatter: boolean;
}
export declare function parseFrontmatter(markdown: string): FrontmatterResult;
